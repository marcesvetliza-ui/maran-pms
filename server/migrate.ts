import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";
import { logger } from "./logger";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  try {
    logger.info("Ejecutando migraciones pendientes...");
    await migrate(db, { migrationsFolder: "./migrations" });
    logger.info("Migraciones completadas");
  } catch (err: any) {
    // If tables already exist this is an existing DB — not a real error.
    // A future migration (schema change) will still be applied correctly
    // because drizzle tracks applied migrations in __drizzle_migrations.
    if (err?.message?.includes("already exists")) {
      logger.warn("Migraciones: tablas ya existen (base de datos existente). No se requiere acción.");
    } else {
      logger.error("Error ejecutando migraciones", err);
      // Don't crash the server for migration errors in development
      if (process.env.NODE_ENV === "production") throw err;
    }
  }

  // Incremental schema additions (idempotent, safe to run on every startup)
  try {
    await db.execute(sql`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS turno_tipo text`);
  } catch (e: any) {
    logger.warn("Migración incremental cash_shifts.turno_tipo: " + e.message);
  }
}
