/**
 * Marca manualmente la identidad de la base a la que apunta DATABASE_URL —
 * Fase 4, Etapa A (ver docs/pilot-environment-plan.md sección 10).
 *
 * Esto es una ACCIÓN DELIBERADA, nunca automática: no corre en el arranque
 * de la app (eso solo crea la tabla vacía, ver server/migrate.ts) ni en
 * ningún otro script. Requiere --environment y --confirm explícitos; sin
 * --confirm no escribe nada, solo muestra qué haría (dry-run).
 *
 * No imprime ni registra DATABASE_URL en ningún caso.
 *
 * Uso:
 *   tsx script/mark-database-identity.ts --environment=pilot --confirm
 *   tsx script/mark-database-identity.ts --environment=pilot            (dry-run, no escribe nada)
 *
 * Para volver a marcar una base ya marcada (corrige un error de marcado):
 *   tsx script/mark-database-identity.ts --environment=pilot --confirm --force
 *
 * Verificar el resultado:
 *   SELECT environment, created_at, locked_by FROM database_identity;
 *
 * Revertir (solo válido mientras la Etapa B no esté activa — ver la
 * sección 10 del plan; una vez activa, revertir requiere el mismo cuidado
 * que cualquier cambio de identidad de una base en uso):
 *   DELETE FROM database_identity WHERE id = 1;
 */
import {
  DATABASE_IDENTITY_ENVIRONMENTS,
  getDatabaseIdentity,
  isValidDatabaseIdentityEnvironment,
  parseMarkDatabaseIdentityArgs,
} from "../server/database-identity";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[mark-database-identity] DATABASE_URL no está configurada. Abortando.");
    process.exit(1);
  }

  const { environment, confirm, force, lockedBy } = parseMarkDatabaseIdentityArgs(process.argv.slice(2));

  if (!environment || !isValidDatabaseIdentityEnvironment(environment)) {
    console.error(
      `[mark-database-identity] --environment es obligatorio y debe ser uno de: ${DATABASE_IDENTITY_ENVIRONMENTS.join(", ")}. ` +
        `Recibido: ${environment ? `"${environment}"` : "ninguno"}.`,
    );
    process.exit(1);
  }

  const { db } = await import("../server/db");
  const { sql } = await import("drizzle-orm");

  const existing = await getDatabaseIdentity();

  if (existing && !force) {
    console.error(
      `[mark-database-identity] Esta base ya está marcada como "${existing.environment}" ` +
        `(desde ${existing.createdAt.toISOString()}). No se modifica nada. ` +
        `Para volver a marcarla deliberadamente, agregá --force.`,
    );
    process.exit(1);
  }

  if (!confirm) {
    console.log(
      `[mark-database-identity] DRY-RUN — no se escribió nada. ` +
        `Se marcaría esta base como "${environment}"` +
        (existing ? ` (reemplazando la marca actual "${existing.environment}")` : "") +
        `. Agregá --confirm para aplicarlo.`,
    );
    return;
  }

  await db.execute(sql`
    INSERT INTO database_identity (id, environment, created_at, locked_by)
    VALUES (1, ${environment}, now(), ${lockedBy ?? null})
    ON CONFLICT (id) DO UPDATE SET
      environment = EXCLUDED.environment,
      created_at = EXCLUDED.created_at,
      locked_by = EXCLUDED.locked_by
  `);

  console.log(`[mark-database-identity] Base marcada como "${environment}".`);
  console.log("[mark-database-identity] Verificar con: SELECT environment, created_at, locked_by FROM database_identity;");
  console.log("[mark-database-identity] Revertir (mientras la Etapa B no esté activa) con: DELETE FROM database_identity WHERE id = 1;");
}

main().catch((err) => {
  console.error("[mark-database-identity] Error:", err.message);
  process.exit(1);
});
