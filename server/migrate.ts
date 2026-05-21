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

  // Charge types table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS charge_types (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        label text NOT NULL,
        description text NOT NULL,
        default_amount decimal(10,2) NOT NULL,
        category text NOT NULL DEFAULT 'otros',
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0
      )
    `);
    // Seed presets only if table is empty
    const existing = await db.execute(sql`SELECT COUNT(*) FROM charge_types`);
    const count = parseInt((existing.rows[0] as any)?.count ?? "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO charge_types (label, description, default_amount, category, sort_order) VALUES
        ('Cochera (por día)', 'Cochera', 2500, 'otros', 1),
        ('Media Pensión', 'Media Pensión', 4500, 'restaurant', 2),
        ('Pensión Completa', 'Pensión Completa', 8000, 'restaurant', 3),
        ('Desayuno adicional', 'Desayuno adicional', 1800, 'restaurant', 4),
        ('Cena', 'Cena', 3500, 'restaurant', 5),
        ('Frigobar', 'Frigobar', 1200, 'minibar', 6),
        ('Lavandería', 'Lavandería', 2000, 'otros', 7),
        ('Traslado', 'Traslado', 3000, 'otros', 8),
        ('SPA / Masaje', 'SPA / Masaje', 5000, 'spa', 9)
      `);
      logger.info("Charge types seeded with default presets.");
    }
  } catch (e: any) {
    logger.warn("Migración incremental charge_types: " + e.message);
  }
}
