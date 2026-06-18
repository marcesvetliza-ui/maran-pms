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

  // Cash movements: columnas receiptNumber, proveedor, expenseCategory
  await withTimeout("cash_movements_receipt_cols", T, () =>
    db.execute(sql`
      ALTER TABLE cash_movements
        ADD COLUMN IF NOT EXISTS receipt_number text,
        ADD COLUMN IF NOT EXISTS proveedor text,
        ADD COLUMN IF NOT EXISTS expense_category text
    `)
  );

  // Cash movements: payment_id para vincular movimiento de caja con pago de reserva
  await withTimeout("cash_movements_payment_id_col", T, () =>
    db.execute(sql`
      ALTER TABLE cash_movements
        ADD COLUMN IF NOT EXISTS payment_id varchar
    `)
  );

  // Security: brute-force columns on system_users + failed_login_attempts table
  await withTimeout("system_users_security_cols", T, () =>
    db.execute(sql`
      ALTER TABLE system_users
        ADD COLUMN IF NOT EXISTS locked_at timestamp,
        ADD COLUMN IF NOT EXISTS lock_reason text,
        ADD COLUMN IF NOT EXISTS lock_permanent text DEFAULT 'false',
        ADD COLUMN IF NOT EXISTS failed_login_count integer DEFAULT 0
    `)
  );

  await withTimeout("failed_login_attempts", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS failed_login_attempts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL,
        ip_address text NOT NULL,
        timestamp timestamp NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'FAILED',
        detail text,
        user_agent text,
        session_id text
      )
    `)
  );

  // cuentaPedida flag on restaurant_orders (mozo solicitó la cuenta)
  await withTimeout("restaurant_orders_cuenta_pedida", T, () =>
    db.execute(sql`
      ALTER TABLE restaurant_orders
        ADD COLUMN IF NOT EXISTS cuenta_pedida boolean NOT NULL DEFAULT false
    `)
  );

  // allow_price_edit flag on charge_types (precio variable)
  await withTimeout("charge_types_allow_price_edit", T, () =>
    db.execute(sql`
      ALTER TABLE charge_types
        ADD COLUMN IF NOT EXISTS allow_price_edit boolean NOT NULL DEFAULT false
    `)
  );

  // Activate allow_price_edit for Lavandería by default
  await withTimeout("charge_types_lavanderia_price_edit", T, () =>
    db.execute(sql`
      UPDATE charge_types
        SET allow_price_edit = true
      WHERE label ILIKE '%lavand%' AND allow_price_edit = false
    `)
  );

  // default_course en menu_items (agregado al schema pero faltaba la migración)
  await withTimeout("menu_items.default_course", T, () =>
    db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS default_course integer`)
  );

  // is_editable en menu_items (puede no existir en producción)
  await withTimeout("menu_items.is_editable", T, () =>
    db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_editable text DEFAULT 'false'`)
  );

  // billing_config: columnas de token WSAA persistente
  await withTimeout("billing_config.arca_ta_cols", T, () =>
    db.execute(sql`
      ALTER TABLE billing_config
        ADD COLUMN IF NOT EXISTS arca_ta_token text,
        ADD COLUMN IF NOT EXISTS arca_ta_sign text,
        ADD COLUMN IF NOT EXISTS arca_ta_expiry timestamp,
        ADD COLUMN IF NOT EXISTS arca_ta_ambiente text
    `)
  );

  // table_reservations: make table_id nullable, add new columns
  await withTimeout("table_reservations.table_id_nullable", T, () =>
    db.execute(sql`ALTER TABLE table_reservations ALTER COLUMN table_id DROP NOT NULL`)
  );
  await withTimeout("table_reservations.new_cols", T, () =>
    db.execute(sql`
      ALTER TABLE table_reservations
        ADD COLUMN IF NOT EXISTS client_id varchar,
        ADD COLUMN IF NOT EXISTS card_last4 text,
        ADD COLUMN IF NOT EXISTS card_holder text
    `)
  );

  // restaurant_time_slots: add area_id for per-salon turn configuration
  await withTimeout("restaurant_time_slots.area_id", T, () =>
    db.execute(sql`ALTER TABLE restaurant_time_slots ADD COLUMN IF NOT EXISTS area_id varchar`)
  );

  // restaurant_reservation_advances: advances/deposits on reservations
  await withTimeout("restaurant_reservation_advances (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS restaurant_reservation_advances (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id varchar NOT NULL,
        amount decimal(10,2) NOT NULL,
        payment_method text NOT NULL DEFAULT 'efectivo',
        voucher_number text,
        notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        applied_to_order_id varchar
      )
    `)
  );

  await withTimeout("order_items.paid", T, () =>
    db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false`)
  );

  await withTimeout("guests.active", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`)
  );

  await withTimeout("rooms.is_virtual", T, () =>
    db.execute(sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_virtual boolean DEFAULT false`)
  );

  await withTimeout("rooms.reub_insert", T, () =>
    db.execute(sql`
      INSERT INTO rooms (id, room_number, room_type_id, floor, status, is_virtual)
      SELECT
        gen_random_uuid(),
        'REUB',
        (SELECT id FROM room_types ORDER BY name LIMIT 1),
        0,
        'available',
        true
      WHERE
        (SELECT id FROM room_types ORDER BY name LIMIT 1) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rooms WHERE room_number = 'REUB')
    `)
  );

  // table_reservations: add area_id for per-salon filtering
  await withTimeout("table_reservations.area_id", T, () =>
    db.execute(sql`ALTER TABLE table_reservations ADD COLUMN IF NOT EXISTS area_id varchar`)
  );

  // guests: vat_condition and provincia
  await withTimeout("guests.vat_condition", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS vat_condition text`)
  );
  await withTimeout("guests.provincia", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS provincia text`)
  );

  // guests: libro de registro + fiscal + migratorio + FCE
  await withTimeout("guests.estado_civil", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS estado_civil text`)
  );
  await withTimeout("guests.procedencia", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS procedencia text`)
  );
  await withTimeout("guests.nationality_code", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS nationality_code text`)
  );
  await withTimeout("guests.fecha_ingreso_argentina", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS fecha_ingreso_argentina date`)
  );
  await withTimeout("guests.fecha_salida_argentina", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS fecha_salida_argentina date`)
  );
  await withTimeout("guests.es_empresa_grande", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS es_empresa_grande boolean DEFAULT false`)
  );
  await withTimeout("guests.monto_base_fce", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS monto_base_fce text`)
  );
  await withTimeout("guests.codigo_postal", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS codigo_postal text`)
  );

  // table_reservations: advance fields (legacy single-advance snapshot)
  await withTimeout("table_reservations.advance_amount", T, () =>
    db.execute(sql`ALTER TABLE table_reservations ADD COLUMN IF NOT EXISTS advance_amount numeric(10,2) DEFAULT 0`)
  );
  await withTimeout("table_reservations.advance_method", T, () =>
    db.execute(sql`ALTER TABLE table_reservations ADD COLUMN IF NOT EXISTS advance_method text`)
  );
  await withTimeout("table_reservations.advance_date", T, () =>
    db.execute(sql`ALTER TABLE table_reservations ADD COLUMN IF NOT EXISTS advance_date date`)
  );
  await withTimeout("table_reservations.advance_notes", T, () =>
    db.execute(sql`ALTER TABLE table_reservations ADD COLUMN IF NOT EXISTS advance_notes text`)
  );

  // Tabla countries (nomenclador AFIP)
  await withTimeout("countries.create", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS countries (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        afip_code integer NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        display_order integer DEFAULT 0
      )
    `)
  );

  // Seed países AFIP si la tabla está vacía
  await withTimeout("countries.seed", T, async () => {
    const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM countries`);
    const count = parseInt((existing.rows[0] as any).cnt || "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO countries (id, afip_code, name, is_active, display_order) VALUES
        (gen_random_uuid(), 200, 'Argentina', true, 1),
        (gen_random_uuid(), 225, 'Uruguay', true, 2),
        (gen_random_uuid(), 101, 'Brasil', true, 3),
        (gen_random_uuid(), 209, 'Chile', true, 4),
        (gen_random_uuid(), 220, 'Paraguay', true, 5),
        (gen_random_uuid(), 202, 'Bolivia', true, 6),
        (gen_random_uuid(), 218, 'Perú', true, 7),
        (gen_random_uuid(), 203, 'Colombia', true, 8),
        (gen_random_uuid(), 226, 'Venezuela', true, 9),
        (gen_random_uuid(), 210, 'Ecuador', true, 10),
        (gen_random_uuid(), 123, 'Estados Unidos', true, 11),
        (gen_random_uuid(), 174, 'Canadá', true, 12),
        (gen_random_uuid(), 116, 'España', true, 13),
        (gen_random_uuid(), 130, 'Italia', true, 14),
        (gen_random_uuid(), 117, 'Francia', true, 15),
        (gen_random_uuid(), 120, 'Alemania', true, 16),
        (gen_random_uuid(), 222, 'Portugal', true, 17),
        (gen_random_uuid(), 172, 'Reino Unido', true, 18),
        (gen_random_uuid(), 126, 'Irlanda', true, 19),
        (gen_random_uuid(), 102, 'Bélgica', true, 20),
        (gen_random_uuid(), 142, 'Países Bajos', true, 21),
        (gen_random_uuid(), 166, 'Suiza', true, 22),
        (gen_random_uuid(), 147, 'Austria', true, 23),
        (gen_random_uuid(), 163, 'Suecia', true, 24),
        (gen_random_uuid(), 144, 'Noruega', true, 25),
        (gen_random_uuid(), 112, 'Dinamarca', true, 26),
        (gen_random_uuid(), 115, 'Finlandia', true, 27),
        (gen_random_uuid(), 121, 'Grecia', true, 28),
        (gen_random_uuid(), 168, 'Turquía', true, 29),
        (gen_random_uuid(), 150, 'Rusia', true, 30),
        (gen_random_uuid(), 107, 'China', true, 31),
        (gen_random_uuid(), 131, 'Japón', true, 32),
        (gen_random_uuid(), 109, 'Corea del Sur', true, 33),
        (gen_random_uuid(), 129, 'India', true, 34),
        (gen_random_uuid(), 134, 'Israel', true, 35),
        (gen_random_uuid(), 146, 'Australia', true, 36),
        (gen_random_uuid(), 143, 'Nueva Zelanda', true, 37),
        (gen_random_uuid(), 141, 'México', true, 38),
        (gen_random_uuid(), 206, 'Cuba', true, 39),
        (gen_random_uuid(), 214, 'Costa Rica', true, 40),
        (gen_random_uuid(), 215, 'Haití', true, 41),
        (gen_random_uuid(), 216, 'Jamaica', true, 42),
        (gen_random_uuid(), 219, 'Panamá', true, 43),
        (gen_random_uuid(), 217, 'Honduras', true, 44),
        (gen_random_uuid(), 213, 'Guatemala', true, 45),
        (gen_random_uuid(), 223, 'El Salvador', true, 46),
        (gen_random_uuid(), 224, 'Nicaragua', true, 47),
        (gen_random_uuid(), 221, 'República Dominicana', true, 48),
        (gen_random_uuid(), 204, 'Guyana', true, 49),
        (gen_random_uuid(), 208, 'Surinam', true, 50),
        (gen_random_uuid(), 138, 'Marruecos', true, 51),
        (gen_random_uuid(), 104, 'Argelia', true, 52),
        (gen_random_uuid(), 170, 'Túnez', true, 53),
        (gen_random_uuid(), 160, 'Sudáfrica', true, 54),
        (gen_random_uuid(), 145, 'Nigeria', true, 55),
        (gen_random_uuid(), 118, 'Ghana', true, 56),
        (gen_random_uuid(), 133, 'Kenia', true, 57),
        (gen_random_uuid(), 103, 'Arabia Saudita', true, 58),
        (gen_random_uuid(), 108, 'Irak', true, 59),
        (gen_random_uuid(), 110, 'Irán', true, 60),
        (gen_random_uuid(), 136, 'Líbano', true, 61),
        (gen_random_uuid(), 161, 'Siria', true, 62),
        (gen_random_uuid(), 111, 'Emiratos Árabes Unidos', true, 63),
        (gen_random_uuid(), 999, 'Otros', true, 99)
      `);
    }
  });

  await withTimeout("web_checkins.signature_image", T, () =>
    db.execute(sql`ALTER TABLE web_checkins ADD COLUMN IF NOT EXISTS signature_image text`)
  );

  await withTimeout("guests.tipo_persona", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS tipo_persona text DEFAULT 'fisica'`)
  );

  await withTimeout("companies.es_empresa_grande", T, () =>
    db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS es_empresa_grande boolean DEFAULT false`)
  );
  await withTimeout("companies.monto_base_fce", T, () =>
    db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS monto_base_fce text`)
  );
  await withTimeout("companies.condicion_venta", T, () =>
    db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS condicion_venta_predeterminada text DEFAULT 'contado'`)
  );
  await withTimeout("agencies.condicion_venta", T, () =>
    db.execute(sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS condicion_venta_predeterminada text DEFAULT 'contado'`)
  );
  await withTimeout("guests.condicion_venta", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS condicion_venta_predeterminada text DEFAULT 'contado'`)
  );

  await withTimeout("pos_configs table", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS pos_configs (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        numero INTEGER NOT NULL,
        area TEXT NOT NULL DEFAULT 'general',
        tipo TEXT NOT NULL DEFAULT 'manual',
        descripcion TEXT,
        activo BOOLEAN DEFAULT true
      )
    `)
  );

  await withTimeout("pos_configs seed", T, async () => {
    const res = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_configs`);
    const cnt = parseInt((res.rows[0] as any).cnt ?? "0");
    if (cnt === 0) {
      await db.execute(sql`
        INSERT INTO pos_configs (nombre, numero, area, tipo, descripcion) VALUES
        ('Recepción', 1, 'recepcion', 'electronico', 'PV electrónico — alojamiento'),
        ('Restaurant', 2, 'restaurant', 'electronico', 'PV electrónico — gastronomía'),
        ('SPA', 3, 'spa', 'manual', 'PV manual — spa y bienestar'),
        ('Eventos', 4, 'eventos', 'manual', 'PV manual — salones y eventos')
      `);
    }
  });

  logger.info("Migraciones incrementales completadas.");
}
