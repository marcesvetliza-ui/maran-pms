import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
// @ts-expect-error Local fixture owns its new Unix-socket-only PostgreSQL cluster.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
// @ts-expect-error Schema export is a local build helper with no database access.
import { exportXeniaPmsSchema } from "../../script/xenia-pms-schema.mjs";
import { readControlConfig } from "../xenia-control/config";
import { setupControl } from "../xenia-control/setup";
import { ControlStore, type Principal } from "../xenia-control/store";
import { PmsBroker, opaqueHash, pkceChallenge } from "../xenia-control/pms";
import { readXeniaPmsConfig, type XeniaPmsConfig } from "./config";
import { setupXeniaPms } from "./setup";
import { assertXeniaPmsBinding } from "./binding";
import { assertQaOperationsSchema } from "./operations-schema";

let fixture: ReturnType<typeof createDisposableXeniaPostgres>;
let store: ControlStore,
  broker: PmsBroker,
  owner: Principal,
  reception: Principal,
  viewer: Principal;
let aurora: string, brisa: string, schema: string, qa: XeniaPmsConfig;
let installation: Awaited<ReturnType<PmsBroker["configure"]>>;
before(
  async () => {
    fixture = createDisposableXeniaPostgres();
    const config = readControlConfig(fixture.env);
    await setupControl(config);
    store = new ControlStore(config);
    broker = new PmsBroker(store);
    owner = (await store.credentials("admin.demo"))!;
    reception = (await store.credentials("recepcion.aurora"))!;
    viewer = (await store.credentials("consulta.brisa"))!;
    const properties = await store.properties(owner);
    aurora = properties.find((p) => p.slug === "aurora-demo")!.id;
    brisa = properties.find((p) => p.slug === "brisa-demo")!.id;
    installation = await broker.configure(
      owner,
      aurora,
      "http://127.0.0.1:5191",
    );
    qa = readXeniaPmsConfig({
      XENIA_PMS_MODE: "qa",
      DATABASE_URL: JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES).extra,
      SESSION_SECRET: randomBytes(40).toString("hex"),
      XENIA_PMS_ORIGIN: installation.origin,
      XENIA_CONTROL_ORIGIN: config.origin,
      XENIA_PMS_PROPERTY_ID: aurora,
      XENIA_PMS_CLIENT_ID: installation.clientId,
      XENIA_PMS_CLIENT_SECRET: installation.clientSecret,
      XENIA_PMS_TEMPLATE: "aurora",
      NODE_ENV: "test",
    })!;
    schema = exportXeniaPmsSchema();
  },
  { timeout: 60000 },
);
after(async () => {
  if (store) await store.close();
  if (fixture) fixture.close();
});

test("the QA profile is opt-in and validates fields without exposing credentials", () => {
  assert.equal(qa.operationsEnabled, false);
  assert.equal(
    readXeniaPmsConfig({
      DATABASE_URL: "postgresql://private-password@wrong.invalid/hotel",
    }),
    undefined,
  );
  const env = {
    XENIA_PMS_MODE: "qa",
    DATABASE_URL: qa.databaseUrl,
    SESSION_SECRET: qa.sessionSecret,
    XENIA_PMS_ORIGIN: qa.origin,
    XENIA_CONTROL_ORIGIN: qa.controlOrigin,
    XENIA_PMS_PROPERTY_ID: qa.propertyId,
    XENIA_PMS_CLIENT_ID: qa.clientId,
    XENIA_PMS_CLIENT_SECRET: qa.clientSecret,
    XENIA_PMS_TEMPLATE: "aurora",
    NODE_ENV: "test",
  };
  for (const [key, value] of [
    ["DATABASE_URL", "postgresql://secret-password@${{unresolved}}/hotel"],
    ["XENIA_PMS_PROPERTY_ID", "bad-id"],
    ["XENIA_PMS_CLIENT_SECRET", "bad-secret"],
    ["XENIA_PMS_OPERATIONS_ENABLED", "enabled"],
    ["RESEND_API_KEY", "private-sending-key"],
    ["XENIA_PMS_ORIGIN", qa.controlOrigin],
  ]) {
    assert.throws(
      () => readXeniaPmsConfig({ ...env, [key]: value }),
      (error: Error) => {
        assert.ok(!error.message.includes(value));
        assert.ok(!error.message.includes(qa.databaseUrl));
        assert.ok(!error.message.includes(qa.clientSecret));
        return true;
      },
    );
  }
  assert.throws(
    () => readXeniaPmsConfig({ ...env, NODE_ENV: "production" }),
    /HTTPS/,
  );
});

test("a new operational database is prepared with fictional rooms and preserved on repeat", async () => {
  assert.equal((await setupXeniaPms(qa, schema)).alreadyInitialized, false);
  const pool = new pg.Pool({ connectionString: qa.databaseUrl });
  try {
    assert.deepEqual(
      (
        await pool.query("SELECT room_number FROM rooms ORDER BY room_number")
      ).rows.map((row) => row.room_number),
      ["101", "102", "103"],
    );
    assert.equal(
      (await pool.query("SELECT first_name FROM guests")).rows[0].first_name,
      "Aurora",
    );
    assert.equal(
      (await pool.query("SELECT count(*) FROM system_users")).rows[0].count,
      "0",
    );
    assert.equal(
      (await pool.query("SELECT count(*) FROM reservations")).rows[0].count,
      "1",
    );
    await pool.query(
      "UPDATE rooms SET notes='Kept after deployment' WHERE room_number='102'",
    );
    assert.equal((await setupXeniaPms(qa, schema)).alreadyInitialized, true);
    assert.equal(
      (await pool.query("SELECT notes FROM rooms WHERE room_number='102'"))
        .rows[0].notes,
      "Kept after deployment",
    );
    await assertXeniaPmsBinding(pool, qa);
    await assert.rejects(
      () => setupXeniaPms({ ...qa, propertyId: randomUUID() }, schema),
      /identidad/,
    );
    await assert.rejects(
      () => setupXeniaPms({ ...qa, clientId: randomUUID() }, schema),
      /identidad/,
    );
    await assert.rejects(
      () => setupXeniaPms(qa, schema + "\n-- a different schema revision"),
      /migración explícita/,
    );
  } finally {
    await pool.end();
  }
});

test("existing QA installations gain lodging editing once without resetting data or later revocations", async () => {
  const pool = new pg.Pool({ connectionString: qa.databaseUrl });
  const permission = "reservations:edit-accommodation";
  try {
    const before = (await pool.query("SELECT id,notes FROM rooms ORDER BY id"))
      .rows;
    await pool.query("DELETE FROM role_permissions WHERE resource_key=$1", [
      permission,
    ]);
    await pool.query(
      "DELETE FROM resource_permission_seeds WHERE resource_key=$1",
      [permission],
    );
    assert.equal((await setupXeniaPms(qa, schema)).alreadyInitialized, true);
    assert.deepEqual(
      (
        await pool.query(
          "SELECT role FROM role_permissions WHERE resource_key=$1 ORDER BY role",
          [permission],
        )
      ).rows.map((row) => row.role),
      ["admin", "manager", "reception"],
    );
    assert.deepEqual(
      (await pool.query("SELECT id,notes FROM rooms ORDER BY id")).rows,
      before,
    );
    assert.equal(
      (await pool.query("SELECT count(*) FROM reservations")).rows[0].count,
      "1",
    );
    await pool.query(
      "DELETE FROM role_permissions WHERE role='reception' AND resource_key=$1",
      [permission],
    );
    await setupXeniaPms(qa, schema);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM role_permissions WHERE role='reception' AND resource_key=$1",
          [permission],
        )
      ).rows[0].count,
      "0",
    );
  } finally {
    await pool.end();
  }
});

test("operational setup refuses central and demonstration databases without modifying them", async () => {
  const count = (
    await store.central.query("SELECT count(*) FROM xenia_control.principals")
  ).rows[0].count;
  const urls = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES);
  for (const databaseUrl of [
    fixture.env.XENIA_CONTROL_DATABASE_URL,
    urls.aurora,
    urls.brisa,
  ])
    await assert.rejects(
      () => setupXeniaPms({ ...qa, databaseUrl }, schema),
      /nueva y exclusiva/,
    );
  assert.equal(
    (await store.central.query("SELECT count(*) FROM xenia_control.principals"))
      .rows[0].count,
    count,
  );
  assert.equal(
    (await store.central.query("SELECT to_regnamespace('xenia_pms') AS schema"))
      .rows[0].schema,
    null,
  );
});

test("only the platform administrator can bind a distinct PMS origin to a hotel", async () => {
  await assert.rejects(
    () => broker.configure(reception, aurora, "http://127.0.0.1:5193"),
    /permiso/,
  );
  await assert.rejects(
    () => broker.configure(owner, brisa, installation.origin),
    /otro establecimiento/,
  );
  await assert.rejects(
    () => broker.configure(owner, brisa, store.config.origin),
    /orígenes distintos/,
  );
  await assert.rejects(
    () => broker.configure(owner, brisa, "https://pms.invalid/another-path"),
    /origen HTTPS/,
  );
  assert.equal((await broker.links(reception))[0].propertyId, aurora);
  assert.deepEqual(await broker.links(viewer), []);
  const exposed = JSON.stringify(await broker.links(owner));
  assert.ok(!exposed.includes(installation.clientSecret));
  assert.doesNotMatch(exposed, /secret_hash|postgresql/);
});

test("a PMS client authenticates with its own secret, while a wrong verifier does not consume a grant", async () => {
  assert.equal(
    (
      await broker.authenticate(
        installation.clientId,
        installation.clientSecret,
      )
    ).propertyId,
    aurora,
  );
  await assert.rejects(
    () =>
      broker.authenticate(
        installation.clientId,
        randomBytes(32).toString("base64url"),
      ),
    /autenticarse/,
  );
  const verifier = randomBytes(32).toString("base64url");
  const grant = await broker.grant(
    reception,
    installation.clientId,
    pkceChallenge(verifier),
  );
  await assert.rejects(
    () =>
      broker.exchange(
        installation.clientId,
        grant.code,
        randomBytes(32).toString("base64url"),
      ),
    /no corresponde/,
  );
  const result = await broker.exchange(
    installation.clientId,
    grant.code,
    verifier,
  );
  assert.equal(result.identity.propertyId, aurora);
  assert.equal(result.identity.principalId, reception.id);
  assert.equal(result.identity.role, "reception");
  assert.equal(
    (await broker.introspect(installation.clientId, result.leaseToken)).identity
      .principalId,
    reception.id,
  );
  const row = (
    await store.central.query(
      "SELECT code_hash,challenge FROM xenia_control.pms_grants WHERE code_hash=$1",
      [opaqueHash(grant.code)],
    )
  ).rows[0];
  assert.ok(!JSON.stringify(row).includes(grant.code));
  assert.ok(!JSON.stringify(row).includes(verifier));
});

test("an authorization code is consumed once even under concurrent exchange", async () => {
  const verifier = randomBytes(32).toString("base64url");
  const grant = await broker.grant(
    owner,
    installation.clientId,
    pkceChallenge(verifier),
  );
  const results = await Promise.allSettled([
    broker.exchange(installation.clientId, grant.code, verifier),
    broker.exchange(installation.clientId, grant.code, verifier),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const result = results.find(
    (result) => result.status === "fulfilled",
  ) as PromiseFulfilledResult<Awaited<ReturnType<PmsBroker["exchange"]>>>;
  assert.equal(result.value.identity.role, "owner");
});

test("membership revocation, role changes and logout invalidate an already issued PMS lease", async () => {
  const enter = async () => {
    const verifier = randomBytes(32).toString("base64url");
    const grant = await broker.grant(
      reception,
      installation.clientId,
      pkceChallenge(verifier),
    );
    return broker.exchange(installation.clientId, grant.code, verifier);
  };
  const access = await enter();
  await store.central.query(
    "DELETE FROM xenia_control.memberships WHERE principal_id=$1 AND property_id=$2",
    [reception.id, aurora],
  );
  await assert.rejects(
    () => broker.introspect(installation.clientId, access.leaseToken),
    /ya no está disponible/,
  );
  await assert.rejects(
    () =>
      broker.grant(
        reception,
        installation.clientId,
        pkceChallenge(randomBytes(32).toString("base64url")),
      ),
    /ya no está disponible/,
  );
  await store.assign(owner, aurora, reception.id, "viewer");
  await assert.rejects(
    () => broker.introspect(installation.clientId, access.leaseToken),
    /permisos cambiaron/,
  );
  await store.assign(owner, aurora, reception.id, "reception");
  const second = await enter();
  await broker.logoutPrincipal(reception.id);
  await assert.rejects(
    () => broker.introspect(installation.clientId, second.leaseToken),
    /revocada/,
  );
});

test("another hotel's viewer and another installation cannot exchange or inspect Aurora access", async () => {
  const brisaInstall = await broker.configure(
    owner,
    brisa,
    "http://127.0.0.1:5192",
  );
  await assert.rejects(
    () =>
      broker.grant(
        viewer,
        installation.clientId,
        pkceChallenge(randomBytes(32).toString("base64url")),
      ),
    /ya no está disponible/,
  );
  const verifier = randomBytes(32).toString("base64url");
  const grant = await broker.grant(
    owner,
    installation.clientId,
    pkceChallenge(verifier),
  );
  await assert.rejects(
    () => broker.exchange(brisaInstall.clientId, grant.code, verifier),
    /venció/,
  );
  const access = await broker.exchange(
    installation.clientId,
    grant.code,
    verifier,
  );
  await assert.rejects(
    () => broker.introspect(brisaInstall.clientId, access.leaseToken),
    /revocada/,
  );
  const viewerVerifier = randomBytes(32).toString("base64url");
  const viewerGrant = await broker.grant(
    viewer,
    brisaInstall.clientId,
    pkceChallenge(viewerVerifier),
  );
  assert.equal(
    (
      await broker.exchange(
        brisaInstall.clientId,
        viewerGrant.code,
        viewerVerifier,
      )
    ).identity.role,
    "viewer",
  );
});

test("an existing Hotel brisa connects by explicit template and preserves Aurora access and both properties", async () => {
  const original = await store.authorize(owner, brisa);
  const memberships = (
    await store.central.query(
      "SELECT * FROM xenia_control.memberships ORDER BY principal_id,property_id",
    )
  ).rows;
  const reservations = await store.reservations(owner, brisa);
  const verifier = randomBytes(32).toString("base64url");
  const grant = await broker.grant(
    owner,
    installation.clientId,
    pkceChallenge(verifier),
  );
  const access = await broker.exchange(
    installation.clientId,
    grant.code,
    verifier,
  );
  const auroraBefore = (
    await store.central.query(
      "SELECT * FROM xenia_control.pms_installations WHERE property_id=$1",
      [aurora],
    )
  ).rows;
  try {
    await store.central.query(
      "UPDATE xenia_control.properties SET name='Hotel brisa',slug='hotel-brisa' WHERE id=$1",
      [brisa],
    );
    await assert.rejects(
      () => broker.configure(owner, brisa, "https://brisa.qa.xeniapms.com"),
      /Elegí la plantilla/,
    );
    const result = await broker.configure(
      owner,
      brisa,
      "https://brisa.qa.xeniapms.com",
      "brisa",
    );
    assert.equal(result.template, "brisa");
    assert.equal(result.propertyId, brisa);
    assert.equal(result.propertyName, "Hotel brisa");
    assert.equal(
      (await broker.introspect(installation.clientId, access.leaseToken))
        .identity.propertyId,
      aurora,
    );
    assert.deepEqual(
      (
        await store.central.query(
          "SELECT * FROM xenia_control.pms_installations WHERE property_id=$1",
          [aurora],
        )
      ).rows,
      auroraBefore,
    );
    assert.deepEqual(
      (
        await store.central.query(
          "SELECT * FROM xenia_control.memberships ORDER BY principal_id,property_id",
        )
      ).rows,
      memberships,
    );
    assert.deepEqual(await store.reservations(owner, brisa), reservations);
    const property = await store.authorize(owner, brisa);
    assert.equal(property.slug, "hotel-brisa");
    assert.equal(property.databaseKey, original.databaseKey);
  } finally {
    await store.central.query(
      "UPDATE xenia_control.properties SET name=$2,slug=$3 WHERE id=$1",
      [brisa, original.name, original.slug],
    );
  }
});

test("production test templates require their reserved QA origin before changing an installation", async () => {
  const production = store.config.production;
  store.config.production = true;
  try {
    for (const origin of [
      "https://aurora.qa.xeniapms.com",
      "https://hotel.example.com",
    ])
      await assert.rejects(
        () => broker.configure(owner, brisa, origin, "brisa"),
        /https:\/\/brisa\.qa\.xeniapms\.com/,
      );
    assert.equal(
      (
        await broker.configure(
          owner,
          brisa,
          "https://brisa.qa.xeniapms.com",
          "brisa",
        )
      ).template,
      "brisa",
    );
  } finally {
    store.config.production = production;
  }
});

test("expired codes are refused and rotating an installation secret revokes old leases", async () => {
  const verifier = randomBytes(32).toString("base64url");
  const grant = await broker.grant(
    owner,
    installation.clientId,
    pkceChallenge(verifier),
  );
  await store.central.query(
    "UPDATE xenia_control.pms_grants SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
    [opaqueHash(grant.code)],
  );
  await assert.rejects(
    () => broker.exchange(installation.clientId, grant.code, verifier),
    /venció/,
  );
  const fresh = await broker.grant(
    owner,
    installation.clientId,
    pkceChallenge(verifier),
  );
  const access = await broker.exchange(
    installation.clientId,
    fresh.code,
    verifier,
  );
  const rotated = await broker.configure(owner, aurora, installation.origin);
  assert.equal(rotated.clientId, installation.clientId);
  assert.notEqual(rotated.clientSecret, installation.clientSecret);
  await assert.rejects(
    () => broker.authenticate(installation.clientId, installation.clientSecret),
    /autenticarse/,
  );
  await assert.rejects(
    () => broker.introspect(installation.clientId, access.leaseToken),
    /revocada/,
  );
});

test("operations upgrade is opt-in, preserves existing stays and later permission revocations", async () => {
  const pool = new pg.Pool({ connectionString: qa.databaseUrl });
  try {
    const before = (await pool.query("SELECT id,total_room_amount,status FROM reservations ORDER BY id")).rows;
    const enabled = { ...qa, operationsEnabled: true };
    await setupXeniaPms(enabled, schema);
    await assertQaOperationsSchema(pool);
    assert.deepEqual((await pool.query("SELECT id,total_room_amount,status FROM reservations ORDER BY id")).rows, before);
    assert.equal((await pool.query("SELECT area FROM cash_register_configs")).rows[0].area, "reception");
    assert.equal((await pool.query("SELECT count(*) FROM cash_shifts")).rows[0].count, "0");
    assert.deepEqual((await pool.query("SELECT role FROM role_permissions WHERE resource_key='api:xenia-qa:operate-stay' ORDER BY role")).rows.map(r => r.role), ["admin", "manager", "reception"]);
    assert.equal((await pool.query("SELECT count(*) FROM role_permissions WHERE role='xenia_viewer' AND resource_key='api:xenia-qa:operate-stay'")).rows[0].count, "0");
    await pool.query("DELETE FROM role_permissions WHERE role='reception' AND resource_key='api:xenia-qa:operate-stay'");
    await pool.query("UPDATE charge_types SET default_amount=1234 WHERE id='xenia-qa-water'");
    await pool.query("SELECT setval('folio_seq_reservation',100,true)");
    await setupXeniaPms(enabled, schema);
    assert.equal(Number((await pool.query("SELECT nextval('folio_seq_reservation') AS value")).rows[0].value), 101);
    assert.equal((await pool.query("SELECT count(*) FROM role_permissions WHERE role='reception' AND resource_key='api:xenia-qa:operate-stay'")).rows[0].count, "0");
    assert.equal(Number((await pool.query("SELECT default_amount FROM charge_types WHERE id='xenia-qa-water'")).rows[0].default_amount), 1234);
    await assertXeniaPmsBinding(pool, enabled);
  } finally { await pool.end(); }
});

test("QA financial preparation refuses duplicate historical folios without repairing their rows", async () => {
  await store.central.query("CREATE DATABASE xenia_qa_duplicate_folios_test");
  const url = new URL(qa.databaseUrl);
  url.pathname = "/xenia_qa_duplicate_folios_test";
  const existing = { ...qa, databaseUrl: url.toString(), operationsEnabled: false };
  await setupXeniaPms(existing, schema);
  const pool = new pg.Pool({ connectionString: existing.databaseUrl });
  try {
    await pool.query(`INSERT INTO folios(id,codigo,entity_type,entity_id) VALUES
      ('f1','RS-000010','reservation','xenia-qa-reservation-1'),('f2','RS-000011','reservation','xenia-qa-reservation-1');
      INSERT INTO folio_movements(id,folio_id,type,amount,description) VALUES('m1','f2','charge',100,'Synthetic historical link')`);
    const before = (await pool.query("SELECT id,codigo,entity_id FROM folios ORDER BY id")).rows;
    await assert.rejects(() => setupXeniaPms({ ...existing, operationsEnabled: true }, schema), (error: any) => error.code === "23505");
    assert.deepEqual((await pool.query("SELECT id,codigo,entity_id FROM folios ORDER BY id")).rows, before);
    assert.equal((await pool.query("SELECT folio_id FROM folio_movements WHERE id='m1'")).rows[0].folio_id, "f2");
    assert.equal((await pool.query("SELECT to_regclass('xenia_pms.operations_schema') AS prepared")).rows[0].prepared, null);
    await assertXeniaPmsBinding(pool, existing);
  } finally { await pool.end(); }
});
