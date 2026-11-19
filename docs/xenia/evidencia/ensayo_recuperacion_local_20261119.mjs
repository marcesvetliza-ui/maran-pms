/**
 * Ensayo local reproducible. Ejecutar desde el checkout QA f5005dc7 o compatible:
 * XENIA_PG_BIN=/ruta/local/bin node --import tsx /ruta/a/este/archivo.mjs --output /ruta/al/acta.json
 * Crea su propio PostgreSQL por socket Unix. No acepta URLs de bases ni lee
 * DATABASE_URL, claves de Railway o conexiones operativas.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const started = performance.now();
const startedAt = new Date();
const require = createRequire(pathToFileURL(resolve("package.json")));
const pg = require("pg");
const projectImport = (path) => import(pathToFileURL(resolve(path)).href);
const { createDisposableXeniaPostgres } = await projectImport(
  "script/xenia-control-postgres.mjs",
);
const { readControlConfig } = await projectImport(
  "server/xenia-control/config.ts",
);
const { setupControl } = await projectImport("server/xenia-control/setup.ts");
const { ControlStore } = await projectImport("server/xenia-control/store.ts");
const { PmsBroker } = await projectImport("server/xenia-control/pms.ts");
const { readXeniaPmsConfig } = await projectImport(
  "server/xenia-pms/config.ts",
);
const { setupXeniaPms } = await projectImport("server/xenia-pms/setup.ts");
const { assertXeniaPmsBinding } = await projectImport(
  "server/xenia-pms/binding.ts",
);
const schema = await readFile(resolve("dist/xenia-pms/schema.sql"), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const quoted = (value) => '"' + value.replaceAll('"', '""') + '"';
const fixture = createDisposableXeniaPostgres();
let store, source, restored;
try {
  const controlConfig = readControlConfig(fixture.env);
  await setupControl(controlConfig);
  store = new ControlStore(controlConfig);
  const owner = await store.credentials("admin.demo");
  const property = (await store.properties(owner)).find(
    (item) => item.slug === "aurora-demo",
  );
  const installation = await new PmsBroker(store).configure(
    owner,
    property.id,
    "http://127.0.0.1:5191",
  );
  const sourceUrl = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES).extra;
  const config = readXeniaPmsConfig({
    NODE_ENV: "test",
    XENIA_PMS_MODE: "qa",
    DATABASE_URL: sourceUrl,
    SESSION_SECRET: randomBytes(40).toString("hex"),
    XENIA_CONTROL_ORIGIN: controlConfig.origin,
    XENIA_PMS_ORIGIN: installation.origin,
    XENIA_PMS_PROPERTY_ID: property.id,
    XENIA_PMS_CLIENT_ID: installation.clientId,
    XENIA_PMS_CLIENT_SECRET: installation.clientSecret,
    XENIA_PMS_TEMPLATE: "aurora",
  });
  await setupXeniaPms(config, schema);
  source = new pg.Pool({ connectionString: sourceUrl });
  const dates = (
    await source.query(
      "SELECT check_in_date, (check_in_date::date+1)::text AS second_night FROM reservations WHERE id='xenia-qa-reservation-1'",
    )
  ).rows[0];
  await source.query(
    `UPDATE reservations SET room_id='xenia-qa-room-102',notes='Punto de recuperación de Aurora',
     pricing_scheme='nightly_v1',pricing_revision=2,nightly_pricing=$1::jsonb,
     total_room_amount=125000,base_rate_per_night=62500,final_rate_per_night=62500
     WHERE id='xenia-qa-reservation-1'`,
    [
      JSON.stringify([
        { date: dates.check_in_date, rateCents: 6000000, discountCents: 0 },
        { date: dates.second_night, rateCents: 6500000, discountCents: 0 },
      ]),
    ],
  );
  const manifest = async (pool) => {
    const tables = (
      await pool.query(
        "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','xenia_pms') ORDER BY schemaname,tablename",
      )
    ).rows;
    const result = [];
    for (const table of tables) {
      const name = quoted(table.schemaname) + "." + quoted(table.tablename);
      const row = (
        await pool.query(
          `SELECT count(*)::int AS count,coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS snapshot FROM ${name} t`,
        )
      ).rows[0];
      result.push({
        table: table.schemaname + "." + table.tablename,
        count: row.count,
        sha256: sha256(row.snapshot),
      });
    }
    const sequences = (
      await pool.query(
        "SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN ('public','xenia_pms') ORDER BY schemaname,sequencename",
      )
    ).rows;
    for (const sequence of sequences) {
      const name =
        quoted(sequence.schemaname) + "." + quoted(sequence.sequencename);
      result.push({
        sequence: sequence.schemaname + "." + sequence.sequencename,
        ...(await pool.query(`SELECT last_value::text,is_called FROM ${name}`))
          .rows[0],
      });
    }
    return result;
  };
  const before = await manifest(source);
  const bin = process.env.XENIA_PG_BIN;
  assert.ok(bin, "Indicá la carpeta local de PostgreSQL en XENIA_PG_BIN.");
  const dump = join(fixture.base, "aurora.dump");
  const dumpStarted = performance.now();
  execFileSync(
    join(bin, "pg_dump"),
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      dump,
      "--dbname",
      sourceUrl,
    ],
    { stdio: "pipe" },
  );
  const dumpMs = Math.round(performance.now() - dumpStarted);
  const archive = await readFile(dump);
  // El origen continúa después de su punto de recuperación. Restaurar no debe revertirlo.
  await source.query(
    "UPDATE rooms SET notes='Cambio posterior que se conserva en el origen' WHERE id='xenia-qa-room-102'",
  );
  await store.central.query("CREATE DATABASE xenia_restore_aurora");
  const target = new URL(sourceUrl);
  target.pathname = "/xenia_restore_aurora";
  restored = new pg.Pool({ connectionString: target.toString() });
  assert.equal(
    (
      await restored.query(
        "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%'",
      )
    ).rows[0].count,
    0,
  );
  const restoreStarted = performance.now();
  execFileSync(
    join(bin, "pg_restore"),
    [
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      target.toString(),
      dump,
    ],
    { stdio: "pipe" },
  );
  const restoreMs = Math.round(performance.now() - restoreStarted);
  assert.deepEqual(await manifest(restored), before);
  await assertXeniaPmsBinding(restored, config);
  await assert.rejects(
    () =>
      assertXeniaPmsBinding(restored, {
        ...config,
        propertyId: randomUUID(),
        template: "brisa",
      }),
    /identidad/,
  );
  assert.equal(
    (await source.query("SELECT notes FROM rooms WHERE id='xenia-qa-room-102'"))
      .rows[0].notes,
    "Cambio posterior que se conserva en el origen",
  );
  assert.equal(
    (
      await restored.query(
        "SELECT count(*)::int AS count FROM reservations r LEFT JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms h ON h.id=r.room_id WHERE g.id IS NULL OR h.id IS NULL",
      )
    ).rows[0].count,
    0,
  );
  const reservation = (
    await restored.query(
      "SELECT notes,total_room_amount,nightly_pricing,pricing_revision,room_id FROM reservations WHERE id='xenia-qa-reservation-1'",
    )
  ).rows[0];
  assert.equal(reservation.notes, "Punto de recuperación de Aurora");
  assert.equal(Number(reservation.total_room_amount), 125000);
  assert.equal(reservation.nightly_pricing.length, 2);
  assert.equal(reservation.pricing_revision, 2);
  assert.equal(reservation.room_id, "xenia-qa-room-102");
  const record = {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Cordoba",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(startedAt),
    started_at_utc: startedAt.toISOString(),
    completed_at_utc: new Date().toISOString(),
    scope:
      "ensayo local de una base PMS ficticia; no es restauración de Railway ni aceptación del PMS restaurado por navegador",
    source_revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    tool_sha256: sha256(await readFile(new URL(import.meta.url))),
    result: "passed",
    postgres: (await source.query("SHOW server_version")).rows[0]
      .server_version,
    schema_digest: sha256(schema),
    archive_bytes: archive.length,
    archive_sha256: sha256(archive),
    dump_ms: dumpMs,
    restore_ms: restoreMs,
    total_ms: Math.round(performance.now() - started),
    verified: {
      all_table_rows_and_sequences_equal: true,
      tables: before.filter((item) => item.table).length,
      sequences: before.filter((item) => item.sequence).length,
      identity_preserved: true,
      other_hotel_identity_rejected: true,
      reservations_prices_and_notes_preserved: true,
      no_orphan_reservation_guest_or_room: true,
      later_source_change_preserved: true,
      target_was_new_and_empty: true,
    },
    remote_services_modified: [],
    limitations: [
      "Sin acceso a respaldos reales de Railway",
      "Sin ensayo de arranque de una aplicación sobre la base restaurada",
      "Sin medición de RPO/RTO del hotel",
      "Sin respaldo/restauración remota del panel central, sus dos bases de demostración, Brisa, archivos o secretos",
    ],
  };
  const outputAt = process.argv.indexOf("--output");
  assert.ok(
    outputAt >= 0 && process.argv[outputAt + 1],
    "Indicá --output /ruta/al/acta.json.",
  );
  const output = resolve(process.argv[outputAt + 1]);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record));
} finally {
  if (restored) await restored.end();
  if (source) await source.end();
  if (store) await store.close();
  fixture.close();
}
