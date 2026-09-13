/**
 * Identidad persistente de base — Fase 4, Etapa A (ver
 * docs/pilot-environment-plan.md sección 10).
 *
 * Etapa A (esto): la tabla `database_identity` existe (creada por
 * server/migrate.ts, siempre vacía por defecto) y este módulo solo LEE su
 * estado para informar/advertir al arrancar. Nunca bloquea el arranque y
 * nunca escribe la fila — eso es responsabilidad exclusiva y manual de
 * script/mark-database-identity.ts.
 *
 * Etapa B (futura, NO implementada acá): comparar `environment` contra
 * `getAppEnv()` y fallar el arranque ante una incompatibilidad
 * (pilot↔production cruzados, o base sin marcar). Deliberadamente fuera de
 * alcance de esta fase — ver la sección 10 del plan para el criterio de
 * cuándo activarla.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { logger } from "./logger";

export const DATABASE_IDENTITY_ENVIRONMENTS = ["development", "test", "pilot", "production"] as const;
export type DatabaseIdentityEnvironment = (typeof DATABASE_IDENTITY_ENVIRONMENTS)[number];

export interface DatabaseIdentityRow {
  environment: DatabaseIdentityEnvironment;
  createdAt: Date;
  lockedBy: string | null;
}

export function isValidDatabaseIdentityEnvironment(value: string): value is DatabaseIdentityEnvironment {
  return (DATABASE_IDENTITY_ENVIRONMENTS as readonly string[]).includes(value);
}

/** Parsea la fila cruda devuelta por `database_identity`; valida el enum en el borde (defensa ante una fila editada a mano en la DB). */
export function parseDatabaseIdentityRow(row: Record<string, unknown> | undefined): DatabaseIdentityRow | null {
  if (!row) return null;
  const environment = String(row.environment);
  if (!isValidDatabaseIdentityEnvironment(environment)) {
    throw new Error(
      `database_identity.environment tiene un valor inválido: "${environment}". Valores aceptados: ${DATABASE_IDENTITY_ENVIRONMENTS.join(", ")}.`,
    );
  }
  return {
    environment,
    createdAt: new Date(row.created_at as string),
    lockedBy: (row.locked_by as string | null) ?? null,
  };
}

/**
 * Lee la fila única de `database_identity`. Devuelve `null` cuando la tabla
 * está vacía (base todavía no marcada — estado esperado durante la Etapa A
 * mientras no se haya corrido el script de marcado).
 */
export async function getDatabaseIdentity(): Promise<DatabaseIdentityRow | null> {
  const result = await db.execute(sql`SELECT environment, created_at, locked_by FROM database_identity WHERE id = 1`);
  return parseDatabaseIdentityRow(result.rows[0] as Record<string, unknown> | undefined);
}

export interface MarkDatabaseIdentityArgs {
  environment?: string;
  confirm: boolean;
  force: boolean;
  lockedBy?: string;
}

/** Parseo puro de argv para script/mark-database-identity.ts — separado del script para poder testearlo sin ejecutar `main()`. */
export function parseMarkDatabaseIdentityArgs(argv: string[]): MarkDatabaseIdentityArgs {
  const args: MarkDatabaseIdentityArgs = { confirm: false, force: false };
  for (const arg of argv) {
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--environment=")) args.environment = arg.slice("--environment=".length);
    else if (arg.startsWith("--locked-by=")) args.lockedBy = arg.slice("--locked-by=".length);
  }
  return args;
}

/**
 * Chequeo de arranque de la Etapa A: solo informa, nunca bloquea. Los
 * errores de lectura (p. ej. la tabla todavía no existe en una base muy
 * vieja que no corrió esta migración) tampoco bloquean — se degradan a un
 * warning, igual que el resto de las migraciones incrementales no
 * bloqueantes en server/migrate.ts.
 */
export async function warnIfDatabaseIdentityMissing(): Promise<void> {
  try {
    const identity = await getDatabaseIdentity();
    if (!identity) {
      logger.warn(
        "[database-identity] Esta base no tiene identidad registrada (Etapa A — no bloquea el arranque). " +
          "Marcarla con: tsx script/mark-database-identity.ts --environment=<development|test|pilot|production> --confirm",
      );
      return;
    }
    logger.info(`[database-identity] Base identificada como "${identity.environment}".`);
  } catch (err) {
    logger.warn(`[database-identity] No se pudo verificar la identidad de la base: ${(err as Error).message}`);
  }
}
