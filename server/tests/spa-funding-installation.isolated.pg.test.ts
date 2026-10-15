import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { pool as admin } from "./helpers/fundingIsolatedDatabase";

// Fresh disposable DB, never reads the operational DATABASE_URL.
const name = `folio_funding_install_synthetic_${Date.now()}`;
const pool = new pg.Pool({ host: "/tmp/folio-funding-isolated/socket", port: 55439, user: "runner", database: name, ssl: false });
let created = false;
beforeAll(async () => {
  expect((await admin.query("SELECT current_database() AS name, inet_server_addr() AS address")).rows[0])
    .toEqual({ name: "folio_funding_synthetic", address: null });
  await admin.query(`CREATE DATABASE ${name}`); created = true;
  await pool.query(`CREATE TABLE billing_config(id int PRIMARY KEY,arca_ambiente text,arca_cuit text,cuit text,
    punto_venta_homolog int,arca_cert text,arca_key text);
    INSERT INTO billing_config VALUES(1,'homologacion','20111111112',NULL,99,'SYNTHETIC_CERT','SYNTHETIC_KEY');
    CREATE TABLE pos_configs(id int,area text,activo boolean,tipo text);
    INSERT INTO pos_configs VALUES(1,'spa',true,'online')`);
});
beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS payment_funding CASCADE");
  await pool.query("UPDATE billing_config SET arca_ambiente='homologacion',arca_cert='SYNTHETIC_CERT'");
});
afterAll(async () => {
  await pool.end();
  if (created) await admin.query(`DROP DATABASE ${name}`);
  await admin.end();
});
async function run(install = false) {
  // Pass only local required variables. No fiscal credentials or inherited DB.
  return promisify(execFile)(process.execPath, ["dist/install-spa-funding.mjs", ...(install ? ["--install"] : [])], {
    cwd: process.cwd(), env: { PATH: process.env.PATH,
      DATABASE_URL: `postgresql://runner@/${name}?host=%2Ftmp%2Ffolio-funding-isolated%2Fsocket&port=55439` },
  });
}
async function hasSchema() { return (await pool.query("SELECT to_regnamespace('payment_funding') IS NOT NULL AS yes")).rows[0].yes; }
it("dry-run validates local configuration and creates no schema", async () => {
  const { stdout } = await run();
  expect(JSON.parse(stdout)).toMatchObject({ environment: "homologacion", schemaInstalled: false, changed: false });
  expect(await hasSchema()).toBe(false);
  expect(stdout).not.toContain("SYNTHETIC_CERT"); expect(stdout).not.toContain("20111111112");
});
it("installs real DDL atomically and a second installation preserves existing audit rows", async () => {
  expect(JSON.parse((await run(true)).stdout)).toMatchObject({ schemaInstalled: true, changed: true });
  await pool.query("INSERT INTO payment_funding.events(event_key,kind,payload,actor_id) VALUES('installation-fixture','synthetic','{}','fixture')");
  expect(JSON.parse((await run(true)).stdout)).toMatchObject({ schemaInstalled: true, changed: false });
  expect((await pool.query("SELECT count(*)::int AS n FROM payment_funding.events")).rows[0].n).toBe(1);
});
it("rejects production before DDL, even with explicit install", async () => {
  await pool.query("UPDATE billing_config SET arca_ambiente='produccion'");
  await expect(run(true)).rejects.toMatchObject({ code: 1 }); expect(await hasSchema()).toBe(false);
});
it("rejects incomplete credentials without any DDL", async () => {
  await pool.query("UPDATE billing_config SET arca_cert=NULL");
  await expect(run(true)).rejects.toMatchObject({ code: 1 }); expect(await hasSchema()).toBe(false);
});
it("refuses to overwrite a partial installation", async () => {
  await pool.query("CREATE SCHEMA payment_funding; CREATE TABLE payment_funding.preserved(id int); INSERT INTO payment_funding.preserved VALUES(42)");
  await expect(run(true)).rejects.toMatchObject({ code: 1 });
  expect((await pool.query("SELECT * FROM payment_funding.preserved")).rows).toEqual([{ id: 42 }]);
  expect((await pool.query("SELECT to_regclass('payment_funding.scopes') AS table_name")).rows[0].table_name).toBeNull();
});
