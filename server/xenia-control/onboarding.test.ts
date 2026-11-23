import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
// @ts-expect-error Owned synthetic PostgreSQL, never an operating URL.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
// @ts-expect-error Pure SQL exporter, no external database input.
import { exportXeniaPmsSchema } from "../../script/xenia-pms-schema.mjs";
import { readControlConfig } from "./config";
import { setupControl } from "./setup";
import { createControlApp } from "./app";
import { readXeniaPmsConfig } from "../xenia-pms/config";
import { setupXeniaPms } from "../xenia-pms/setup";
import { ControlStore } from "./store";
import { PmsBroker } from "./pms";

let fixture: ReturnType<typeof createDisposableXeniaPostgres>, config: ReturnType<typeof readControlConfig>, control: Awaited<ReturnType<typeof createControlApp>>;
let server: Server, origin: string, actor: NonNullable<Awaited<ReturnType<ControlStore["principal"]>>>, organizationId: string;
let databaseId = randomUUID();
let property: Awaited<ControlStore["createProperty"]>, installation: Awaited<PmsBroker["configure"]>, cookie = "", csrf = "", operationalUrl: string;
// This is a synthetic readiness envelope. Actual serving revision is asserted
// separately in the compiled-PMS browser test, never inferred from this fixture.
const syntheticRevision = createHash("sha1").update("synthetic readiness protocol fixture").digest("hex");
async function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(origin + path, { method, headers: { "Content-Type": "application/json", Origin: origin,
    Cookie: cookie, "X-CSRF-Token": csrf, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const value of response.headers.getSetCookie()) if (value.startsWith("xenia-control=")) cookie = value.split(";")[0];
  const data = await response.json(); if (data.csrfToken) csrf = data.csrfToken;
  return { status: response.status, data };
}
const ready = () => ({ databaseId, propertyId: property.id, template: "custom", mode: "qa", revision: syntheticRevision, operationsEnabled: true });
const basic = () => ({ Authorization: "Basic " + Buffer.from(installation.clientId + ":" + installation.clientSecret).toString("base64"), Origin: installation.origin });
before(async () => {
  fixture = createDisposableXeniaPostgres(); config = readControlConfig(fixture.env); await setupControl(config);
  control = await createControlApp(config); server = control.app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  origin = config.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.equal((await request("/api/demo-login", "POST", { persona: "owner" })).status, 200);
  actor = (await control.store.credentials("admin.demo"))!;
  organizationId = (await control.store.createOrganization(actor, "Cliente Hotel Costa")).id;
}, { timeout: 60000 });
after(async () => { if (server) await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); }); if (control) await control.close(); if (fixture) fixture.close(); });

test("a generic PMS catalog entry needs no panel database and concurrent creation is idempotent", async () => {
  const input = { name: "Hotel Costa", slug: "costa-independiente", organizationId, modules: ["lodging"], storageKind: "pms", requestId: randomUUID() };
  const pair = await Promise.all([request("/api/admin/properties", "POST", input), request("/api/admin/properties", "POST", input)]);
  assert.deepEqual(pair.map(r => r.status).sort(), [200, 201]); assert.equal(pair[0].data.id, pair[1].data.id);
  property = pair[0].data; assert.equal(property.storageKind, "pms"); assert.equal(property.status, "provisioning");
  assert.equal((await control.store.central.query("SELECT database_key FROM xenia_control.properties WHERE id=$1", [property.id])).rows[0].database_key, null);
  assert.equal((await request("/api/admin/properties", "POST", { ...input, name: "Otro hotel" })).status, 409);
  assert.equal((await request(`/api/admin/properties/${property.id}/activate`, "POST", {})).status, 409);
  // Exhaust the final legacy slot: another generic entry must still be possible.
  await control.store.createProperty(actor, { name: "Última demo", slug: "ultima-demo", organizationId, modules: ["lodging"] });
  const another = await request("/api/admin/properties", "POST", { ...input, slug: "otro-independiente", requestId: randomUUID() });
  assert.equal(another.status, 201); assert.equal(another.data.storageKind, "pms");
  await control.store.central.query("CREATE DATABASE custom_pms_test");
  const url = new URL(JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES).extra); url.pathname = "/custom_pms_test"; operationalUrl = url.toString();
});

test("the custom connection is registered while pending and readiness requires its server credential", async () => {
  installation = await control.pms.configure(actor, property.id, "http://127.0.0.1:5398", "custom");
  assert.equal(installation.template, "custom"); assert.equal(installation.propertyName, "Hotel Costa");
  assert.equal((await request("/api/pms/ready", "POST", ready())).status, 401);
  assert.equal((await request("/api/pms/ready", "POST", { ...ready(), propertyId: randomUUID() }, basic())).status, 403);
  assert.equal((await request("/api/pms/ready", "POST", { ...ready(), revision: "inventada" }, basic())).status, 400);
  assert.equal((await request("/api/pms/ready", "POST", { ...ready(), mode: "production" }, basic())).status, 400);
  assert.equal((await control.store.catalogProperty(actor, property.id)).status, "provisioning");
});

test("generic setup preserves a clean hotel, explicit name and repeatable binding without demonstration stays", async () => {
  const env = { XENIA_PMS_MODE: "qa", XENIA_PMS_TEMPLATE: "custom", XENIA_PMS_PROPERTY_NAME: "Hotel Costa",
    XENIA_PMS_PROPERTY_ID: property.id, XENIA_PMS_CLIENT_ID: installation.clientId, XENIA_PMS_CLIENT_SECRET: installation.clientSecret,
    XENIA_PMS_ORIGIN: installation.origin, XENIA_CONTROL_ORIGIN: origin, SESSION_SECRET: randomBytes(40).toString("hex"),
    DATABASE_URL: operationalUrl, XENIA_PMS_OPERATIONS_ENABLED: "true", NODE_ENV: "test" };
  assert.throws(() => readXeniaPmsConfig({ ...env, XENIA_PMS_PROPERTY_NAME: "" }), /PROPERTY_NAME/);
  assert.throws(() => readXeniaPmsConfig({ ...env, XENIA_PMS_PROPERTY_NAME: "Hotel\notra_variable=valor" }), /PROPERTY_NAME/);
  const cfg = readXeniaPmsConfig(env)!; const schema = exportXeniaPmsSchema();
  assert.equal((await setupXeniaPms(cfg, schema)).alreadyInitialized, false);
  const pool = new pg.Pool({ connectionString: operationalUrl });
  try {
    databaseId = (await pool.query("SELECT database_instance_id FROM xenia_pms.installation")).rows[0].database_instance_id;
    for (const table of ["rooms", "room_types", "rate_plans", "guests", "reservations", "system_users"])
      assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count, "0");
    assert.equal((await pool.query("SELECT value FROM system_settings WHERE key='hotel_name'")).rows[0].value, "Hotel Costa");
    await pool.query("UPDATE system_settings SET value='Nombre editado' WHERE key='hotel_name'");
    assert.equal((await setupXeniaPms(cfg, schema)).alreadyInitialized, true);
    assert.equal((await pool.query("SELECT value FROM system_settings WHERE key='hotel_name'")).rows[0].value, "Nombre editado");
    await assert.rejects(() => setupXeniaPms({ ...cfg, propertyId: randomUUID() }, schema), /identidad/);
  } finally { await pool.end(); }
});

test("only the bound current credential can activate the catalog; rotation invalidates an in-flight old confirmation", async () => {
  assert.equal((await request("/api/pms/ready", "POST", ready(), basic())).status, 200);
  assert.equal((await control.store.catalogProperty(actor, property.id)).status, "active");
  assert.equal((await request("/api/pms/ready", "POST", ready(), basic())).status, 200);
  assert.equal((await control.store.central.query("SELECT count(*) FROM xenia_control.audit WHERE property_id=$1 AND action='pms_preparation_confirmed'", [property.id])).rows[0].count, "1");
  assert.equal((await request(`/api/properties/${property.id}/reservations`)).status, 409);
  assert.equal((await request("/api/pms/ready", "POST", { ...ready(), databaseId: randomUUID() }, basic())).status, 403);
  assert.equal((await control.store.central.query("SELECT database_binding_id FROM xenia_control.pms_installations WHERE client_id=$1", [installation.clientId])).rows[0].database_binding_id, databaseId);
  const old = await control.pms.authenticate(installation.clientId, installation.clientSecret);
  installation = await control.pms.configure(actor, property.id, installation.origin, "custom");
  assert.equal((await control.store.catalogProperty(actor, property.id)).status, "provisioning");
  await assert.rejects(() => control.pms.ready(installation.clientId, old.credentialVersion, ready()), /confirmación/);
  assert.equal((await request("/api/pms/ready", "POST", ready(), basic())).status, 200);
});

test("production custom origins cannot reuse the reserved hotels or an unrelated host", async () => {
  const store = new ControlStore({ ...config, production: true }); const broker = new PmsBroker(store);
  try {
    for (const url of ["https://aurora.qa.xeniapms.com", "https://brisa.qa.xeniapms.com", "https://otro.example.com", "https://xeniapms.com"])
      await assert.rejects(() => broker.configure(actor, property.id, url, "custom"), /subdominio/);
    await assert.rejects(() => broker.configure(actor, property.id, "https://hotel-costa.qa.xeniapms.com", "aurora"), /tipo de conexión/);
  } finally { await store.close(); }
});
