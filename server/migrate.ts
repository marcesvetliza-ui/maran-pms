import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";
import { logger } from "./logger";
import { sql } from "drizzle-orm";

// Wraps a migration in a timeout so a hung DDL lock never kills the startup
async function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms`)), ms)
      ),
    ]);
  } catch (e: any) {
    logger.warn(`Migración ${label}: ${e.message}`);
    return undefined;
  }
}

export async function runMigrations() {
  // In production Railway uses PgBouncer (connection pooling). Drizzle's migrate()
  // issues DDL commands (CREATE SCHEMA, advisory locks) that are incompatible with
  // pooled connections and fail with "Control plane request failed".
  // All schema changes below use idempotent ALTER TABLE / CREATE TABLE IF NOT EXISTS,
  // so migrate() is only needed for a brand-new database setup (which is done in dev).
  if (process.env.NODE_ENV !== "production") {
    try {
      logger.info("Ejecutando migraciones pendientes...");
      await Promise.race([
        migrate(db, { migrationsFolder: "./migrations" }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("migrate() timeout after 15s")), 15_000)
        ),
      ]);
      logger.info("Migraciones completadas");
    } catch (err: any) {
      if (err?.message?.includes("already exists")) {
        logger.warn("Migraciones: tablas ya existen (base de datos existente). No se requiere acción.");
      } else {
        logger.warn("Migraciones (no-bloqueante): " + err?.message);
      }
    }
  } else {
    logger.info("Producción: migrate() omitido (conexión pooled). Usando migraciones incrementales.");
  }

  // Incremental schema additions — each wrapped in an 8s timeout so a hung
  // DDL lock in Railway/PgBouncer never prevents the app from starting.
  const T = 8_000;

  await withTimeout("cash_shifts.turno_tipo", T, () =>
    db.execute(sql`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS turno_tipo text`)
  );

  await withTimeout("charge_types (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS charge_types (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        label text NOT NULL,
        description text NOT NULL,
        default_amount decimal(10,2) NOT NULL,
        category text NOT NULL DEFAULT 'otros',
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0
      )
    `)
  );
  await withTimeout("charge_types (seed)", T, async () => {
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
  });

  await withTimeout("confirmation_terms (seed)", T, async () => {
    const existing = await db.execute(sql`SELECT COUNT(*) FROM system_settings WHERE key = 'confirmation_terms'`);
    const count = parseInt((existing.rows[0] as any)?.count ?? "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO system_settings (id, key, value, category, description, updated_at, updated_by)
        VALUES (
          gen_random_uuid(),
          'confirmation_terms',
          'La tarifa incluye desayuno buffet y gimnasio con turno previo.
La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.
Nuestro horario de Check-in es a partir de las 15:00 hs y el Check-out es hasta las 10:00 hs.
Early Check-in o Late Check-out tienen costo adicional del 50% del valor de una noche.
Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI / PASAPORTE / CÉDULA DE IDENTIDAD. En el caso de viajar con menores de edad deberá presentar su correspondiente identificación.
La entrega de la habitación queda condicionada al pago total del alojamiento al momento del check-in. Los comprobantes, constancias de transferencia, capturas de pantalla o avisos de pago no constituyen pago válido hasta la efectiva acreditación del importe en los medios de cobro habilitados por el hotel. Ante la falta de acreditación, el hotel podrá exigir el pago por otro medio aceptado y suspender el ingreso a la habitación hasta la regularización total del saldo correspondiente.',
          'documentos',
          'Términos y condiciones que aparecen en la confirmación de reserva (PDF). Una cláusula por línea.',
          now(),
          'system'
        )
      `);
      logger.info("confirmation_terms seeded.");
    }
  });

  await withTimeout("reservations.late_checkout", T, () =>
    db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_checkout boolean DEFAULT false`)
  );
  await withTimeout("reservations.late_checkout_time", T, () =>
    db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_checkout_time varchar(10)`)
  );

  await withTimeout("loan_items (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS loan_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        total_quantity integer NOT NULL DEFAULT 1,
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0
      )
    `)
  );
  await withTimeout("item_loans (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS item_loans (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_item_id varchar NOT NULL REFERENCES loan_items(id),
        room_number text NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        lent_at timestamp DEFAULT now(),
        returned_at timestamp,
        notes text,
        registered_by text
      )
    `)
  );
  await withTimeout("loan_items (seed)", T, async () => {
    const existing = await db.execute(sql`SELECT COUNT(*) FROM loan_items`);
    const count = parseInt((existing.rows[0] as any)?.count ?? "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO loan_items (name, description, total_quantity, sort_order) VALUES
        ('Plancha', 'Plancha de ropa', 3, 1),
        ('Tabla de planchar', 'Tabla de planchar plegable', 2, 2),
        ('Secador de pelo', 'Secador de pelo 1800W', 4, 3),
        ('Catre adicional', 'Catre plegable con colchón', 3, 4),
        ('Almohadas extra', 'Almohadas adicionales', 10, 5),
        ('Adaptador eléctrico', 'Adaptador universal de enchufes', 5, 6),
        ('Cuna', 'Cuna de viaje para bebé', 2, 7),
        ('Toallas extra', 'Toallas adicionales (juego)', 8, 8)
      `);
      logger.info("Loan items seeded.");
    }
  });

  await withTimeout("billing_config.arca_ambiente", T, () =>
    db.execute(sql`
      ALTER TABLE billing_config
        ADD COLUMN IF NOT EXISTS arca_ambiente text DEFAULT 'ficticio',
        ADD COLUMN IF NOT EXISTS punto_venta_homolog integer DEFAULT 99
    `)
  );
  await withTimeout("billing_config.arca_ambiente (update)", T, () =>
    db.execute(sql`
      UPDATE billing_config
      SET arca_ambiente = CASE WHEN modo_arca = true THEN 'produccion' ELSE 'ficticio' END
      WHERE arca_ambiente IS NULL OR arca_ambiente = 'ficticio'
    `)
  );
  await withTimeout("reservation_changelog", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS reservation_changelog (
        id serial PRIMARY KEY,
        reservation_id varchar NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        fecha timestamp NOT NULL DEFAULT now(),
        operador text,
        tipo text NOT NULL,
        descripcion text NOT NULL
      )
    `)
  );

  await withTimeout("housekeeping_tasks", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS housekeeping_tasks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id varchar NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        task_type text NOT NULL DEFAULT 'checkout_clean',
        status text NOT NULL DEFAULT 'pending',
        priority text NOT NULL DEFAULT 'normal',
        assigned_to varchar,
        notes text,
        scheduled_date date NOT NULL,
        started_at timestamp,
        completed_at timestamp,
        inspected_by varchar,
        inspected_at timestamp,
        created_at timestamp NOT NULL
      )
    `)
  );

  logger.info("Migraciones incrementales completadas.");
}
