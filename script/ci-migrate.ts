/**
 * Bootstraps a throwaway PostgreSQL database (e.g. the CI service container)
 * with the full application schema before `npm run test:postgres` runs.
 *
 * This reuses the exact migration path the app runs on every dev startup
 * (`runMigrations()` — drizzle migrate() + idempotent incremental ALTERs),
 * so CI exercises the same schema-setup code as local development instead of
 * a parallel bootstrap mechanism. Afterwards it re-checks the live catalog
 * via `verifyFinancialSchema()` and fails loudly if anything required is
 * still missing, since `runMigrations()` itself treats individual steps as
 * non-blocking (see server/migrate.ts).
 *
 * Usage: DATABASE_URL=postgres://... npx tsx script/ci-migrate.ts
 */
import { runMigrations, verifyFinancialSchema } from "../server/migrate";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const REQUIRED_ACCOUNT_CODES = [
  "1.1.1.01",
  "1.1.4.01.04.01",
  "1.1.4.01.05",
  "1.1.4.01.08.01",
  "2.1.1.01",
  "4.2.1.08.05.02",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[ci-migrate] DATABASE_URL no está configurada. Abortando.");
    process.exit(1);
  }

  console.log("[ci-migrate] Ejecutando runMigrations()...");
  await runMigrations();

  console.log("[ci-migrate] Verificando esquema financiero contra el catálogo real...");
  const status = await verifyFinancialSchema();
  if (!status.ready) {
    console.error("[ci-migrate] El esquema quedó incompleto tras las migraciones:", {
      missingColumns: status.missingColumns,
      missingIndexes: status.missingIndexes,
    });
    process.exit(1);
  }

  const accounts = await db.execute(sql`
    SELECT codigo
    FROM accounting_accounts
    WHERE codigo IN (${sql.join(REQUIRED_ACCOUNT_CODES.map((code) => sql`${code}`), sql`, `)})
  `);
  const foundAccountCodes = new Set(
    (accounts.rows as Array<{ codigo: string }>).map((account) => account.codigo),
  );
  const missingAccountCodes = REQUIRED_ACCOUNT_CODES.filter((code) => !foundAccountCodes.has(code));
  if (missingAccountCodes.length > 0) {
    console.error("[ci-migrate] Faltan cuentas contables canónicas tras las migraciones:", missingAccountCodes);
    process.exit(1);
  }

  console.log("[ci-migrate] Esquema listo para correr la suite de PostgreSQL.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[ci-migrate] Error inesperado ejecutando migraciones:", err);
  process.exit(1);
});
