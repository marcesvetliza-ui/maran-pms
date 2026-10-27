import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { checkSpaHomologation } from "../server/billing/funding/operational/homologation";

// Explicit service-shell command, never imported by application startup.
// No credentials, URLs, customer information or issuer identity are logged.
const flags = process.argv.slice(2);
if (flags.some(flag => flag !== "--install")) throw new Error("Uso: node dist/install-spa-funding.mjs [--install]");
if (!process.env.DATABASE_URL) throw new Error("Ejecutá desde el servicio MARAN con su DATABASE_URL configurada.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
let client: pg.PoolClient | undefined;
try {
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('install-spa-funding',0))");
  const readiness = await checkSpaHomologation(client);
  const { rows: [state] } = await client.query(`SELECT
    to_regnamespace('payment_funding') IS NOT NULL AS exists,
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='payment_funding'
     AND table_name IN ('scopes','receipts','documents','operations','applications','events',
     'collections','settlements','shift_evidence','rectifications','fiscal_claims')) AS tables`);
  if (state.exists && state.tables !== 11)
    throw new Error("Instalación parcial: requiere revisión; no se modificó el esquema existente.");
  if (!state.exists && flags.includes("--install")) {
    for (const file of ["schema.sql", "operational/schema.sql"])
      await client.query(await readFile(resolve("dist/funding-sql", file), "utf8"));
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ ...readiness, schemaInstalled: state.exists || flags.includes("--install"),
    changed: !state.exists && flags.includes("--install"),
    next: "Asignar permisos por rol y configurar SPA_FUNDING_HOMOLOGATION_ENABLED=true y VITE_SPA_FUNDING_UI=true en el servicio. Requiere rebuild/redeploy." }));
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  // PG error messages can include connection details. Do not dump the object.
  console.error(error instanceof Error && !('severity' in error) ? error.message : "No se pudo verificar/instalar SPA funding. Revisar configuración y acceso de la base desde el servicio.");
  process.exitCode = 1;
} finally { client?.release(); await pool.end(); }
