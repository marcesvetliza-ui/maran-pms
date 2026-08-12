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

  // monto_acreditado en sales_invoices (para NC parciales múltiples y estado "parcial")
  await withTimeout("sales_invoices.monto_acreditado", T, () =>
    db.execute(sql`ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS monto_acreditado numeric(14,2) DEFAULT 0`)
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

  await withTimeout("restaurant_reservation_advances.invoice_id", T, () =>
    db.execute(sql`ALTER TABLE restaurant_reservation_advances ADD COLUMN IF NOT EXISTS invoice_id integer`)
  );

  await withTimeout("order_items.paid", T, () =>
    db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false`)
  );

  // order_items: course y sent_at — en el schema desde el inicio pero por las dudas los aseguramos
  await withTimeout("order_items.course_sent_at", T, () =>
    db.execute(sql`
      ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS course integer DEFAULT 1,
        ADD COLUMN IF NOT EXISTS sent_at timestamptz
    `)
  );

  await withTimeout("guests.active", T, () =>
    db.execute(sql`ALTER TABLE guests ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`)
  );

  await withTimeout("rooms.is_virtual", T, () =>
    db.execute(sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_virtual boolean DEFAULT false`)
  );

  await withTimeout("rooms.reub_delete", T, () =>
    db.execute(sql`DELETE FROM rooms WHERE room_number = 'REUB' AND (is_virtual = true OR floor = 0)`)
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

  // ── Presupuestos multi-área ───────────────────────────────────────────────
  await withTimeout("presupuestos.area_origen", T, () =>
    db.execute(sql`ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS area_origen VARCHAR DEFAULT 'grupos'`)
  );
  await withTimeout("presupuestos.participantes", T, () =>
    db.execute(sql`ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS participantes INTEGER`)
  );
  await withTimeout("quote_catalog_items (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS quote_catalog_items (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        area VARCHAR NOT NULL,
        category VARCHAR NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(12,2) NOT NULL DEFAULT 0,
        price_special DECIMAL(12,2),
        unit VARCHAR(100) NOT NULL DEFAULT 'por persona',
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `)
  );
  await withTimeout("quote_conditions (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS quote_conditions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        area VARCHAR NOT NULL UNIQUE,
        content TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
  );
  await withTimeout("quote_conditions (seed defaults)", T, async () => {
    const res = await db.execute(sql`SELECT COUNT(*) as cnt FROM quote_conditions`);
    const cnt = parseInt((res.rows[0] as any).cnt ?? "0");
    if (cnt === 0) {
      await db.execute(sql`
        INSERT INTO quote_conditions (id, area, content) VALUES
        ('qcond-grupos', 'grupos', E'CONDICIONES DE CONTRATACIÓN:\n\n• El presente presupuesto no implica bloqueo de habitaciones.\n\n• El camaje detallado no puede modificarse.\n\n• El pago del alojamiento y servicios adicionales contratados deberá ser realizado desde la organización y no por huésped alojado o asistente al evento.\n\n• Para garantizar la reservación, solicitamos el pago del 30% del monto final.\n\n• La tarifa no incluye servicios adicionales a excepción de aquellos detallados.\n\n• La cancelación sin penalización será de 15 días previos al comienzo de la estadía.\n\n• El rooming definitivo debe entregarse 1 semana antes del Check in solicitado. A partir de esa fecha, las habitaciones estarán sujetas a disponibilidad del hotel.'),
        ('qcond-recepcion', 'recepcion', E'CONDICIONES DE CONTRATACIÓN:\n\n• El presente presupuesto no implica bloqueo de habitaciones.\n\n• Para garantizar la reservación, solicitamos el pago del 30% del monto final.\n\n• La tarifa no incluye servicios adicionales a excepción de aquellos detallados.\n\n• La cancelación sin penalización será de 15 días previos al comienzo de la estadía.\n\n• Check in a partir de las 15:00 hs. Check out hasta las 10:00 hs.'),
        ('qcond-eventos', 'eventos', E'El presente presupuesto se actualizará hasta un mes antes del evento.\n\nCONDICIONES:\n\n• Para garantizar la reserva del salón, solicitamos el pago del 50% del total del evento.\n\n• El saldo restante deberá abonarse 7 días antes del evento.\n\n• La cancelación sin penalización será de 30 días previos al evento.\n\n• Los precios incluyen IVA salvo indicación contraria.\n\n• El catering y servicios adicionales deberán confirmarse con 15 días de anticipación.'),
        ('qcond-spa', 'spa', E'• La reserva se confirma con el pago del 30% del total.\n\n• Las cancelaciones con menos de 48 horas de anticipación no tienen devolución.\n\n• Los tratamientos tienen una duración aproximada indicada en cada servicio.\n\n• Se recomienda llegar 15 minutos antes del turno reservado.'),
        ('qcond-restaurant', 'restaurant', E'• La reserva se confirma con el pago del 30% del total.\n\n• Los menús deben confirmarse con 72 horas de anticipación.\n\n• La cancelación sin penalización es de 48 horas antes del evento.\n\n• Los precios indicados son por persona salvo que se especifique lo contrario.')
        ON CONFLICT (area) DO NOTHING
      `);
    }
  });
  await withTimeout("quote_catalog_items (seed eventos)", T, async () => {
    const res = await db.execute(sql`SELECT COUNT(*) as cnt FROM quote_catalog_items WHERE area = 'eventos'`);
    const cnt = parseInt((res.rows[0] as any).cnt ?? "0");
    if (cnt === 0) {
      await db.execute(sql`
        INSERT INTO quote_catalog_items (id, area, category, name, description, price, price_special, unit, is_active, sort_order) VALUES
        ('qci-ev-s1','eventos','salon','Parque Urquiza','340 m² — Auditorio hasta 500 pax. Divisible en Ala Mitre y Ala Rivadavia.',1040000,890000,'por día',true,0),
        ('qci-ev-s2','eventos','salon','Ala Mitre','120 m² — Auditorio hasta 120 pax.',525000,451000,'por día',true,1),
        ('qci-ev-s3','eventos','salon','Ala Rivadavia','220 m² — Auditorio hasta 280 pax.',630000,545000,'por día',true,2),
        ('qci-ev-s4','eventos','salon','Rosedal','56 m² — Auditorio hasta 40 pax.',262000,225000,'por día',true,3),
        ('qci-ev-s5','eventos','salon','Solárium','Terraza exterior con vista al Parque Urquiza.',525000,451000,'por día',true,4),
        ('qci-ev-c1','eventos','coffee_break','Opción Líquida Especial','Café, variedades de té, leche, jugo de naranja.',5300,null,'por persona',true,0),
        ('qci-ev-c2','eventos','coffee_break','Opción 1','Café, variedades de té, leche, agua mineral, jugo, petit four, medialunas dulces y saladas.',6900,null,'por persona',true,1),
        ('qci-ev-c3','eventos','coffee_break','Opción 2','Café, té, leche, agua mineral, jugo, petit four, medialunas, criollos, variedad de budines, ensalada de frutas.',9000,null,'por persona',true,2),
        ('qci-ev-c4','eventos','coffee_break','Opción 3','Café, variedades de té, leche, agua mineral, jugo, petit four, budines caseros, criollos entrerrianos, scons, medialunas, mini sándwiches, ensalada de frutas, shot de frutos rojos.',14000,null,'por persona',true,3),
        ('qci-ev-c5','eventos','coffee_break','Opción Saludable','Infusión, jugo de naranja exprimido, copa de yogurt con granola y miel, ensalada de frutas, cookies de avena, frutos secos, budín integral, chia pudding.',10500,null,'por persona',true,4),
        ('qci-ev-k1','eventos','coctel','Cóctel 1','Sándwiches en pan de miga, empanaditas variadas, mini pizzas, cazuela de pollo en crema de hongos. Incluye agua mineral, aguas saborizadas y gaseosas.',35000,null,'por persona',true,0),
        ('qci-ev-k2','eventos','coctel','Cóctel 2','Sándwiches, empanaditas, mini pizzas, cazuela de pollo, mini picada, pincho de bondiola. Postre: mini flan, ensalada de frutas, mini brownie. Incluye agua mineral, aguas saborizadas y gaseosas.',43000,null,'por persona',true,1),
        ('qci-ev-e1','eventos','equipamiento','Conferencia Básico','Sonido (Mitre/Rivadavia): 2 micrófonos. Proyección con pantalla, proyector HDMI y pasador inalámbrico. Operador. 4 horas.',360000,null,'servicio',true,0),
        ('qci-ev-e2','eventos','equipamiento','Conferencia Medio','Sonido (Mitre/Rivadavia): 3 micrófonos cuello de cisne + 2 inalámbricos. Proyección HDMI, retorno de video, pasador inalámbrico. Operador. 4 horas.',432000,null,'servicio',true,1),
        ('qci-ev-e3','eventos','equipamiento','Conferencia Grande','Sonido (Parque Urquiza): 2 micrófonos. Proyección HDMI, pasador inalámbrico. Operador. 4 horas.',432000,null,'servicio',true,2),
        ('qci-ev-e4','eventos','equipamiento','Conferencia Grande Plus','Sonido (Parque Urquiza): 3 micrófonos cuello de cisne + 2 inalámbricos. Proyección HDMI, retorno de video. Operador. 4 horas.',511200,null,'servicio',true,3),
        ('qci-ev-e5','eventos','equipamiento','Conferencia + Transmisión Básico','Sonido (Mitre/Rivadavia) + transmisión básica a Zoom/Meet: ATEM Mini (swicher) + 1 cámara. Operador. 4 horas.',630000,null,'servicio',true,4),
        ('qci-ev-e6','eventos','equipamiento','Conferencia + Transmisión Medio','Sonido (Mitre/Rivadavia) + transmisión a 2 redes (YouTube, Facebook, Meet/Zoom): Mixer DataVideo 1600T con 3 cámaras robóticas. Operador. 4 horas.',747000,null,'servicio',true,5),
        ('qci-ev-e7','eventos','equipamiento','Conferencia + Transmisión High','Sonido (Mitre/Rivadavia) + transmisión simultánea a 10 redes: Mixer DataVideo 1300T con 3 cámaras Full HD + mochila de transmisión. Operador. 4 horas.',867000,null,'servicio',true,6),
        ('qci-ev-e8','eventos','equipamiento','Solo Sonido (Mitre/Rivadavia)','2 micrófonos cuello de cisne o inalámbricos. Operador. 4 horas.',255000,null,'servicio',true,7),
        ('qci-ev-e9','eventos','equipamiento','Solo Sonido (Parque Urquiza)','2 micrófonos cuello de cisne o inalámbricos. Operador. 4 horas.',276000,null,'servicio',true,8)
        ON CONFLICT (id) DO NOTHING
      `);
    }
  });

  // ── SPA appointments — guest_id column (added after initial migration) ───
  await withTimeout("spa_appointments.guest_id", T, () =>
    db.execute(sql`ALTER TABLE spa_appointments ADD COLUMN IF NOT EXISTS guest_id varchar`)
  );

  // ── Unificación clientes SPA → guests ────────────────────────────────────
  await withTimeout("spa_clients → guests migration", T, async () => {
    await db.execute(sql`
      INSERT INTO guests (id, first_name, last_name, phone, email)
      SELECT sc.id, sc.first_name, COALESCE(sc.last_name, '-'), sc.phone, sc.email
      FROM spa_clients sc
      WHERE NOT EXISTS (SELECT 1 FROM guests g WHERE g.id = sc.id)
    `);
  });

  // ── SPA clients — nuevos campos demograficos ──────────────────────────────
  await withTimeout("spa_clients new columns", T, async () => {
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS tipo_persona text DEFAULT 'fisica'`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS document_type text`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS document_number text`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS cuil_cuit text`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS vat_condition text`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS direccion text`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS provincia text`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS localidad text`);
    await db.execute(sql`ALTER TABLE spa_clients ADD COLUMN IF NOT EXISTS codigo_postal text`);
  });

  // ── Web check-in — solicitud Factura A ────────────────────────────────────
  await withTimeout("web_checkins request_factura_a column", T, async () => {
    await db.execute(sql`ALTER TABLE web_checkins ADD COLUMN IF NOT EXISTS request_factura_a boolean DEFAULT false`);
  });

  // ── Paquetes Turísticos ───────────────────────────────────────────────────
  await withTimeout("packages (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS packages (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        name text NOT NULL,
        description text,
        room_type_id varchar,
        nights integer NOT NULL DEFAULT 1,
        base_price decimal(12,2) NOT NULL DEFAULT 0,
        discount_percent decimal(5,2),
        valid_from date,
        valid_until date,
        status text NOT NULL DEFAULT 'active',
        included_services text[],
        terms text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)
  );

  await withTimeout("package_items (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS package_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id varchar NOT NULL,
        item_type text NOT NULL,
        description text NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        unit_value decimal(10,2)
      )
    `)
  );

  await withTimeout("package_room_prices (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS package_room_prices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id varchar NOT NULL,
        room_type_id varchar NOT NULL,
        price decimal(12,2) NOT NULL DEFAULT 0,
        extra_amount decimal(12,2) DEFAULT 0
      )
    `)
  );

  await withTimeout("preventive_tasks (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS preventive_tasks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        description text,
        frequency text NOT NULL DEFAULT 'monthly',
        frequency_days integer NOT NULL DEFAULT 30,
        last_done_at date,
        next_due_at date NOT NULL,
        assigned_to varchar(255),
        notes text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `)
  );

  // ── preventive_tasks: registro de demora ─────────────────────────────────
  await withTimeout("preventive_tasks.last_overdue_days", T, () =>
    db.execute(sql`ALTER TABLE preventive_tasks ADD COLUMN IF NOT EXISTS last_overdue_days integer`)
  );

  // ── Unificación platos/inventario ────────────────────────────────────────
  await withTimeout("inventory_items.item_kind", T, () =>
    db.execute(sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'venta_directa'`)
  );
  await withTimeout("menu_items.inventory_item_id", T, () =>
    db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS inventory_item_id varchar`)
  );
  await withTimeout("item_categories.platos (ensure)", T, async () => {
    const res = await db.execute(sql`
      INSERT INTO item_categories (id, name, description, area, is_active)
      SELECT gen_random_uuid(), 'Platos', 'Platos del restaurante (generado automáticamente)', 'restaurant', 'true'
      WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE area = 'restaurant' AND name = 'Platos')
      RETURNING id
    `);
    return res;
  });
  await withTimeout("menu_items.backfill_inventory_mirror", T, async () => {
    const catRes = await db.execute(sql`SELECT id FROM item_categories WHERE area = 'restaurant' AND name = 'Platos' LIMIT 1`);
    const categoryId = (catRes.rows[0] as any)?.id;
    if (!categoryId) return;
    const missing = await db.execute(sql`SELECT id, name, is_active FROM menu_items WHERE inventory_item_id IS NULL`);
    for (const row of missing.rows as any[]) {
      const inserted = await db.execute(sql`
        INSERT INTO inventory_items (id, name, category_id, unit, item_kind, is_active, cost_price, min_stock, current_stock)
        VALUES (gen_random_uuid(), ${row.name}, ${categoryId}, 'unidad', 'plato', ${row.is_active ?? 'true'}, '0.00', '0.000', '0.000')
        RETURNING id
      `);
      const mirrorId = (inserted.rows[0] as any)?.id;
      if (mirrorId) {
        await db.execute(sql`UPDATE menu_items SET inventory_item_id = ${mirrorId} WHERE id = ${row.id}`);
      }
    }
    if (missing.rows.length > 0) {
      logger.info(`Backfill: ${missing.rows.length} platos vinculados a inventario.`);
    }
  });

  // account_movements / account_movement_allocations: nunca estaban en el bloque
  // incremental (solo en el migrate() de baseline, que se omite en producción).
  // Esto provocaba "relation does not exist" en Railway -> endpoints de saldo
  // devolvían 500 -> frontend mostraba $0.00.
  await withTimeout("account_movements (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS account_movements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type text NOT NULL,
        entity_id varchar NOT NULL,
        date date NOT NULL,
        type text NOT NULL,
        description text NOT NULL,
        amount numeric(12, 2) NOT NULL,
        reservation_id varchar,
        reservation_code text,
        guest_name text,
        reference text,
        retentions jsonb,
        created_by varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)
  );
  await withTimeout("account_movements.retentions", T, () =>
    db.execute(sql`ALTER TABLE account_movements ADD COLUMN IF NOT EXISTS retentions jsonb`)
  );
  await withTimeout("account_movement_allocations (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS account_movement_allocations (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        pago_id varchar NOT NULL REFERENCES account_movements(id),
        cargo_id varchar NOT NULL REFERENCES account_movements(id),
        amount numeric(12, 2) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)
  );
  await withTimeout("account_movements.idx_entity", T, () =>
    db.execute(sql`CREATE INDEX IF NOT EXISTS idx_account_movements_entity ON account_movements(entity_type, entity_id)`)
  );
  await withTimeout("account_movement_allocations.idx_cargo", T, () =>
    db.execute(sql`CREATE INDEX IF NOT EXISTS idx_account_movement_allocations_cargo ON account_movement_allocations(cargo_id)`)
  );
  await withTimeout("account_movements.payment_method", T, () =>
    db.execute(sql`ALTER TABLE account_movements ADD COLUMN IF NOT EXISTS payment_method text`)
  );

  await withTimeout("reservations.checked_out_at", T, () =>
    db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checked_out_at timestamp`)
  );

  await withTimeout("presupuestos.fecha_fin", T, () =>
    db.execute(sql`ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS fecha_fin varchar`)
  );

  await withTimeout("gift_vouchers (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS gift_vouchers (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_code text NOT NULL UNIQUE,
        area text NOT NULL,
        description text NOT NULL,
        value_type text NOT NULL DEFAULT 'monetario',
        value_amount decimal(10,2),
        buyer_name text NOT NULL,
        buyer_phone text,
        buyer_email text,
        beneficiary_name text,
        status text NOT NULL DEFAULT 'activo',
        issued_at timestamp NOT NULL DEFAULT now(),
        expires_at date,
        used_at timestamp,
        used_by text,
        used_notes text,
        price_paid decimal(10,2),
        payment_method text,
        notes text,
        created_by text
      )
    `)
  );

  // Restore deleted charge types (cochera, pensión completa) if missing
  await withTimeout("charge_types_restore_missing", T, () =>
    db.execute(sql`
      INSERT INTO charge_types (label, description, default_amount, category, sort_order, active, allow_price_edit)
      SELECT 'Cochera (por día)', 'Cochera', 2500, 'otros', 1, true, false
      WHERE NOT EXISTS (SELECT 1 FROM charge_types WHERE label = 'Cochera (por día)');

      INSERT INTO charge_types (label, description, default_amount, category, sort_order, active, allow_price_edit)
      SELECT 'Pensión Completa', 'Pensión Completa', 8000, 'restaurant', 3, true, false
      WHERE NOT EXISTS (SELECT 1 FROM charge_types WHERE label = 'Pensión Completa');
    `)
  );

  await withTimeout("rooms.is_active", T, () =>
    db.execute(sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`)
  );

  // restaurant_tables: event-specific columns for "Evento por Mesa" salon
  await withTimeout("restaurant_tables.event_cols", T, () =>
    db.execute(sql`
      ALTER TABLE restaurant_tables
        ADD COLUMN IF NOT EXISTS event_client_name text,
        ADD COLUMN IF NOT EXISTS event_client_phone text,
        ADD COLUMN IF NOT EXISTS event_seats integer,
        ADD COLUMN IF NOT EXISTS event_notes text
    `)
  );

  // restaurant_tables: email + advance fields for event pre-load
  await withTimeout("restaurant_tables.event_advance_cols", T, () =>
    db.execute(sql`
      ALTER TABLE restaurant_tables
        ADD COLUMN IF NOT EXISTS event_client_email text,
        ADD COLUMN IF NOT EXISTS event_advance_amount decimal(10,2),
        ADD COLUMN IF NOT EXISTS event_advance_method text,
        ADD COLUMN IF NOT EXISTS event_advance_date text
    `)
  );

  // restaurant_tables: layout columns (shape, position, window) — en el schema pero faltaban en la migración
  await withTimeout("restaurant_tables.layout_cols", T, () =>
    db.execute(sql`
      ALTER TABLE restaurant_tables
        ADD COLUMN IF NOT EXISTS shape text DEFAULT 'square',
        ADD COLUMN IF NOT EXISTS position_x integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS position_y integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS has_window text DEFAULT 'false'
    `)
  );

  // Seed "Evento por Mesa" restaurant area if not present
  await withTimeout("restaurant_areas.evento_por_mesa_seed", T, () =>
    db.execute(sql`
      INSERT INTO restaurant_areas (id, name, area_type, capacity, has_tables, is_active, notes)
      SELECT 'area-evento-mesa', 'Evento por Mesa', 'event', 100, 'true', 'true',
             'Salón para eventos con servicio de restaurante (cenas, celebraciones, etc.)'
      WHERE NOT EXISTS (SELECT 1 FROM restaurant_areas WHERE id = 'area-evento-mesa')
    `)
  );

  await withTimeout("charge_types.allow_recurring", T, () =>
    db.execute(sql`ALTER TABLE charge_types ADD COLUMN IF NOT EXISTS allow_recurring boolean NOT NULL DEFAULT false`)
  );

  await withTimeout("charges.is_recurring", T, () =>
    db.execute(sql`ALTER TABLE charges ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false`)
  );

  await withTimeout("charges.unit_amount", T, () =>
    db.execute(sql`ALTER TABLE charges ADD COLUMN IF NOT EXISTS unit_amount decimal(10,2)`)
  );

  // Fix: clear valid_to on rate plans that expired in the past but still have current pricing.
  // These were versioned incorrectly via "nueva versión" flow leaving them hidden.
  await withTimeout("rate_plans.clear_expired_valid_to", T, () =>
    db.execute(sql`UPDATE rate_plans SET valid_to = NULL WHERE valid_to < CURRENT_DATE`)
  );

  await withTimeout("reservations.special_rate_reason", T, () =>
    db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS special_rate_reason text`)
  );

  await withTimeout("rate_plans.fix_currency_ars", T, () =>
    db.execute(sql`UPDATE rate_plans SET currency = 'ARS' WHERE currency IS NULL OR currency = '' OR currency != 'ARS'`)
  );

  // invoice_ref en payments (anticipo con factura electrónica vinculada)
  await withTimeout("payments.invoice_ref", T, () =>
    db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_ref text`)
  );

  // invoice_ref en group_payments y event_payments (misma funcionalidad para grupos y eventos)
  await withTimeout("group_payments.invoice_ref", T, () =>
    db.execute(sql`ALTER TABLE group_payments ADD COLUMN IF NOT EXISTS invoice_ref text`)
  );
  await withTimeout("event_payments.invoice_ref", T, () =>
    db.execute(sql`ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS invoice_ref text`)
  );

  // invoice_link_failed: persistent flag so unlinked invoices can be found after toast disappears
  await withTimeout("payments.invoice_link_failed", T, () =>
    db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_link_failed boolean NOT NULL DEFAULT false`)
  );

  // guest_id FK on reservation_companions — link companions to CRM guest profiles
  await withTimeout("reservation_companions.guest_id", T, () =>
    db.execute(sql`
      ALTER TABLE reservation_companions ADD COLUMN IF NOT EXISTS guest_id varchar;
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'reservation_companions_guest_id_guests_id_fk'
        ) THEN
          ALTER TABLE reservation_companions
            ADD CONSTRAINT reservation_companions_guest_id_guests_id_fk
            FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `)
  );

  // merma: % de desperdicio por ingrediente en recetas
  await withTimeout("recipe_ingredients.merma", T, () =>
    db.execute(sql`ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS merma numeric(5,2)`)
  );

  // Elaboraciones base (sub-recipes / intermediate productions)
  await withTimeout("recipes.elaboraciones_fields", T, () =>
    db.execute(sql`
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_base boolean DEFAULT false;
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS production_unit text;
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS production_yield numeric(10,3);
      ALTER TABLE recipes ALTER COLUMN menu_item_id DROP NOT NULL;
    `)
  );

  await withTimeout("recipe_ingredients.sub_recipe_id", T, () =>
    db.execute(sql`ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS sub_recipe_id varchar`)
  );

  // Toma de Inventario
  await withTimeout("inventory_counts.create", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS inventory_counts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        date date NOT NULL,
        area text,
        status text NOT NULL DEFAULT 'borrador',
        notes text,
        created_by text,
        closed_at timestamp,
        closed_by text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)
  );

  await withTimeout("inventory_count_items.create", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS inventory_count_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        count_id varchar NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
        item_id varchar NOT NULL,
        item_name text NOT NULL,
        unit text NOT NULL DEFAULT 'unidad',
        expected_stock numeric(10,3) NOT NULL DEFAULT 0,
        actual_stock numeric(10,3),
        notes text
      )
    `)
  );

  await withTimeout("menu_categories.is_beverage", T, () =>
    db.execute(sql`ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS is_beverage BOOLEAN DEFAULT FALSE`)
  );

  await withTimeout("internal_movements.create", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS internal_movements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        date date NOT NULL,
        motivo text NOT NULL,
        descripcion text,
        notes text,
        created_by text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)
  );

  await withTimeout("internal_movement_items.create", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS internal_movement_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        movement_id varchar NOT NULL REFERENCES internal_movements(id) ON DELETE CASCADE,
        item_id varchar NOT NULL,
        item_name text NOT NULL,
        unit text NOT NULL DEFAULT 'unidad',
        quantity numeric(10,3) NOT NULL,
        cost_price numeric(10,2) NOT NULL DEFAULT 0,
        notes text
      )
    `)
  );

  await withTimeout("item_categories.is_group", T, () =>
    db.execute(sql`ALTER TABLE item_categories ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false`)
  );

  await withTimeout("email_config.banner_footer", T, () =>
    db.execute(sql`
      ALTER TABLE email_config
        ADD COLUMN IF NOT EXISTS email_banner_base64 text,
        ADD COLUMN IF NOT EXISTS email_footer_base64 text
    `)
  );

  // group_payment_id on payments: deterministic FK so invoice_ref can be propagated to the exact group_payments row
  await withTimeout("payments.group_payment_id", T, () =>
    db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS group_payment_id varchar`)
  );

  // Backfill [res:ID] tag on transfer charges that predate the room-link feature.
  // Charges with [corr:UUID] but no [res:...] are matched by their corr UUID; the paired
  // charge's reservation_id becomes the [res:ID] written into the other side.
  await withTimeout("charges.backfill_transfer_res_tags", T, async () => {
    const rows = await db.execute(sql`
      SELECT id, reservation_id, description, category
      FROM charges
      WHERE category IN ('transfer_in', 'transfer_out')
        AND description LIKE '%[corr:%'
        AND description NOT LIKE '%[res:%'
        AND status = 'active'
    `);

    if (rows.rows.length === 0) return;

    // Build a map: corrId → list of charge rows
    const byCorr = new Map<string, any[]>();
    for (const row of rows.rows as any[]) {
      const m = (row.description as string).match(/\[corr:([^\]]+)\]/);
      if (!m) continue;
      const corrId = m[1];
      if (!byCorr.has(corrId)) byCorr.set(corrId, []);
      byCorr.get(corrId)!.push(row);
    }

    let patched = 0;
    for (const [corrId, charges] of byCorr.entries()) {
      // We need at least one charge to carry a corr tag; find any paired charge
      // (even if the counterpart already has [res:]) to identify the linked reservation.
      const allWithCorr = await db.execute(sql`
        SELECT id, reservation_id, description, category
        FROM charges
        WHERE description LIKE ${"%" + `[corr:${corrId}]` + "%"}
          AND category IN ('transfer_in', 'transfer_out')
      `);

      const allPairs = allWithCorr.rows as any[];
      if (allPairs.length < 2) continue; // can't determine the other side

      for (const charge of charges) {
        // The res to link to is the reservation_id of the OTHER side
        const other = allPairs.find((p: any) => p.id !== charge.id);
        if (!other) continue;
        const resId = other.reservation_id as string;
        const newDesc = `${charge.description} [res:${resId}]`;

        await db.execute(sql`
          UPDATE charges SET description = ${newDesc} WHERE id = ${charge.id}
        `);

        // Mirror the update into folio_movements for the same corr tag + category
        await db.execute(sql`
          UPDATE folio_movements
          SET description = description || ${` [res:${resId}]`}
          WHERE type = ${charge.category}
            AND description LIKE ${"%" + `[corr:${corrId}]` + "%"}
            AND description NOT LIKE '%[res:%'
        `);

        patched++;
      }
    }

    if (patched > 0) {
      logger.info(`Backfill: ${patched} transfer charge(s) actualizados con etiqueta [res:].`);
    }
  });

  // Backfill folio_movements for Nota de Débito invoices emitted before the ND
  // folio-charge feature was added. Finds every ND (NDA/NDB/NDC/NDT/NDM) that
  // has a reserva_id but no matching folio_movements row (source_type='nota_debito',
  // source_id=<invoice id>), resolves the folio via the reservation, and inserts
  // the missing charge so old folio PDFs show the ND amount.
  await withTimeout("folio_movements.backfill_nd_charges", T, async () => {
    const ndRows = await db.execute(sql`
      SELECT si.id, si.tipo_comprobante, si.punto_venta, si.numero,
             si.monto_total, si.reserva_id, si.created_at
      FROM sales_invoices si
      WHERE si.tipo_comprobante IN ('NDA', 'NDB', 'NDC', 'NDT', 'NDM')
        AND si.reserva_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM folio_movements fm
          WHERE fm.source_type = 'nota_debito'
            AND fm.source_id = si.id::text
        )
    `);

    if (ndRows.rows.length === 0) return;

    let inserted = 0;
    for (const nd of ndRows.rows as any[]) {
      // Resolve folio UUID from the reservation
      const folioRow = await db.execute(sql`
        SELECT id FROM folios
        WHERE entity_type = 'reservation' AND entity_id = ${String(nd.reserva_id)}
        LIMIT 1
      `);
      const folioId = (folioRow.rows[0] as any)?.id;
      if (!folioId) continue;

      const pv = String(nd.punto_venta ?? 1).padStart(4, "0");
      const nro = String(nd.numero ?? 0).padStart(8, "0");
      const nroND = `${nd.tipo_comprobante} ${pv}-${nro}`;
      const monto = parseFloat(String(nd.monto_total ?? "0"));
      if (monto <= 0) continue;

      await db.execute(sql`
        INSERT INTO folio_movements (id, folio_id, type, amount, description, source_type, source_id, receipt_type, registered_by, created_at)
        VALUES (
          gen_random_uuid(),
          ${folioId},
          'charge',
          ${monto.toFixed(2)},
          ${"Nota de Débito " + nroND},
          'nota_debito',
          ${String(nd.id)},
          ${nd.tipo_comprobante},
          'backfill',
          ${nd.created_at ?? new Date()}
        )
      `);

      // Recalc folio balance
      await db.execute(sql`
        UPDATE folios SET
          total_charges = (
            SELECT COALESCE(SUM(amount::numeric), 0)
            FROM folio_movements
            WHERE folio_id = ${folioId} AND type IN ('charge', 'transfer_in')
          ),
          total_payments = (
            SELECT COALESCE(SUM(amount::numeric), 0)
            FROM folio_movements
            WHERE folio_id = ${folioId} AND type IN ('payment', 'advance', 'discount', 'transfer_out', 'void')
          ),
          balance = (
            SELECT COALESCE(SUM(CASE WHEN type IN ('charge','transfer_in') THEN amount::numeric
                                     ELSE -amount::numeric END), 0)
            FROM folio_movements
            WHERE folio_id = ${folioId} AND type IN ('charge','transfer_in','payment','advance','discount','transfer_out','void')
          )
        WHERE id = ${folioId}
      `);

      inserted++;
    }

    if (inserted > 0) {
      logger.info(`Backfill: ${inserted} folio_movements de Nota de Débito insertados.`);
    }
  });

  // sales_invoices.reserva_id was integer, but reservations use UUID/varchar IDs.
  // Converting to varchar so the folio lookup (entity_id = reserva_id) works correctly.
  await withTimeout("sales_invoices.reserva_id_varchar", T, () =>
    db.execute(sql`
      ALTER TABLE sales_invoices
        ALTER COLUMN reserva_id TYPE varchar USING reserva_id::varchar
    `)
  );

  await withTimeout("sales_invoices.restaurant_order_id", T, () =>
    db.execute(sql`ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS restaurant_order_id varchar`)
  );

  await withTimeout("spa_accounts.invoice_id", T, () =>
    db.execute(sql`ALTER TABLE spa_accounts ADD COLUMN IF NOT EXISTS invoice_id integer`)
  );

  await withTimeout("events.invoice_id", T, () =>
    db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS invoice_id integer`)
  );

  await withTimeout("event_tables.invoice_id", T, () =>
    db.execute(sql`ALTER TABLE event_tables ADD COLUMN IF NOT EXISTS invoice_id integer`)
  );

  await withTimeout("event_tables.nc_id", T, () =>
    db.execute(sql`ALTER TABLE event_tables ADD COLUMN IF NOT EXISTS nc_id integer`)
  );

  await withTimeout("events.nc_id", T, () =>
    db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS nc_id integer`)
  );

  await withTimeout("groups.billing_entity_type", T, () =>
    db.execute(sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS billing_entity_type text`)
  );

  await withTimeout("spa_accounts.nc_id", T, () =>
    db.execute(sql`ALTER TABLE spa_accounts ADD COLUMN IF NOT EXISTS nc_id integer`)
  );

  await withTimeout("groups.billing_entity_id", T, () =>
    db.execute(sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS billing_entity_id varchar`)
  );

  await withTimeout("sales_invoices.cash_forma_pago", T, () =>
    db.execute(sql`ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cash_forma_pago text`)
  );

  await withTimeout("sales_invoices.source_charge_ids", T, () =>
    db.execute(sql`ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS source_charge_ids jsonb`)
  );

  await withTimeout("group_payments.receipt_type", T, () =>
    db.execute(sql`ALTER TABLE group_payments ADD COLUMN IF NOT EXISTS receipt_type text`)
  );

  await withTimeout("group_payments.billing_entity_type", T, () =>
    db.execute(sql`ALTER TABLE group_payments ADD COLUMN IF NOT EXISTS billing_entity_type text`)
  );

  await withTimeout("group_payments.billing_entity_id", T, () =>
    db.execute(sql`ALTER TABLE group_payments ADD COLUMN IF NOT EXISTS billing_entity_id varchar(255)`)
  );

  await withTimeout("group_payments.payment_method_detail", T, () =>
    db.execute(sql`ALTER TABLE group_payments ADD COLUMN IF NOT EXISTS payment_method_detail jsonb`)
  );

  // invoice_nc_ref on group_payments: JSON-encoded ARCA NC result when a nota de crédito has been emitted for this payment
  await withTimeout("group_payments.invoice_nc_ref", T, () =>
    db.execute(sql`ALTER TABLE group_payments ADD COLUMN IF NOT EXISTS invoice_nc_ref text`)
  );

  // group_invoices: facturas emitidas directamente desde el Resumen del Grupo (sin pago asociado)
  await withTimeout("group_invoices (create)", T, () =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS group_invoices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id varchar NOT NULL,
        sales_invoice_id integer UNIQUE,
        invoice_ref text NOT NULL,
        notes text,
        created_at timestamp DEFAULT now()
      )
    `)
  );

  // Add sales_invoice_id column if table was created without it (incremental add)
  await withTimeout("group_invoices.sales_invoice_id", T, () =>
    db.execute(sql`ALTER TABLE group_invoices ADD COLUMN IF NOT EXISTS sales_invoice_id integer UNIQUE`)
  );

  // Clean up 9 orphaned spa_accounts from March 2026 whose parent appointments
  // were deleted. Mark as 'cancelled' (not DELETE) to preserve payment history.
  // The 3 closed accounts have room_charge payments already applied to folios.
  await withTimeout("spa_accounts.cancel_orphans_mar2026", T, () =>
    db.execute(sql`
      UPDATE spa_accounts
      SET status = 'cancelled'
      WHERE id IN (
        '386e690e-e53c-4681-b437-0ac819326670',
        '23843e10-e5e4-4f09-a876-f2c6aca2dfad',
        '27a80722-d49b-402c-a450-55605aad58b3',
        'ff8023f0-cd02-47d1-ad4e-3bc01c8175fb',
        'e00b84fe-2cf3-4b00-b50f-c3d20918c5a1',
        '19fbd230-4d0f-4505-82cc-f5a4b8624455',
        '3d9f67ed-86a9-4065-bf81-053d2174ec6b',
        '9eef1548-3442-4785-ba9e-46dbca1829d4',
        '10866f01-f1db-48ea-9c5a-cc09ab2bd899'
      )
      AND status != 'cancelled'
    `)
  );

  // moved_from_room_number on reservations: stores original room number when a checked-in reservation is moved in-house
  await withTimeout("reservations.moved_from_room_number", T, () =>
    db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS moved_from_room_number text`)
  );

  // billing_config: iibb e telefono para comprobantes fiscales
  await withTimeout("billing_config.iibb_telefono", T, () =>
    db.execute(sql`
      ALTER TABLE billing_config
        ADD COLUMN IF NOT EXISTS iibb text,
        ADD COLUMN IF NOT EXISTS telefono text
    `)
  );

  // Add regimen_hospedaje to companies
  await withTimeout("companies.regimen_hospedaje", T, () =>
    db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS regimen_hospedaje text`)
  );

  // cash_register_configs: unique constraint on area column
  await withTimeout("cash_register_configs.area_unique", T, () =>
    db.execute(sql`
      ALTER TABLE cash_register_configs
        ADD CONSTRAINT IF NOT EXISTS cash_register_configs_area_unique UNIQUE (area)
    `)
  );

  // ── Seed inicial de empresas y agencias ──────────────────────────────────
  const { rows: seedCheck } = await db.execute(
    sql`SELECT COUNT(*) AS cnt FROM companies WHERE razon_social != 'Empresa E2E Maran'`
  );
  if (parseInt((seedCheck[0] as any).cnt) === 0) {
    logger.info("Seeding companies and agencies...");
    await db.execute(sql`DELETE FROM account_movements WHERE entity_type IN ('company','agency')`);
    await db.execute(sql`DELETE FROM companies`);
    await db.execute(sql`DELETE FROM agencies`);

    // Lote 1 de empresas (1-30)
    await db.execute(sql`
      INSERT INTO companies (razon_social, nombre_fantasia, cuil_cuit, condicion_iva, contact_name, contact_email, contact_phone, notes, regimen_hospedaje, condicion_venta_predeterminada, is_active) VALUES
      ('Asociacion De Cooperativas Argentinas Cooperativa Ltda','ACA','30500120882','responsable_inscripto','brunengo','brunengo@acacoop.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Aerolineas Argentinas SA','AEROLINEAS ARGENTINAS','30641405554','responsable_inscripto','','sucursalesfacturas@aerolineas.com.ar','','Fact: rosadmin@aerolineas.com.ar','','cuenta_corriente','true'),
      ('Agramin Sacma','AGRAMIN','30521525998','responsable_inscripto','','eugenia@agramin.com.ar','','','A Determinar','cuenta_corriente','true'),
      ('Agronorte SRL','AGRONORTE','30547794482','responsable_inscripto','','bonaldimatias@agronorte.com.ar','3536-547372','Pagos: pagos@agronorte.com.ar','A Determinar','cuenta_corriente','true'),
      ('Asociacion Civil Vida y Esperanza','ASOC VIDA Y ESPERANZA','30714984396','responsable_inscripto','Luciano','oficinasvye@gmail.com','','','Full Credit','cuenta_corriente','true'),
      ('Asociacion Civil Renacer','ASOC CIVIL RENACER','30709630527','responsable_inscripto','Carolina Quiroga','carodiazquiroga@gmail.com','','','Full Credit','cuenta_corriente','true'),
      ('Asociacion De La Magistratura y La Funcion Judicial De La Provincia De Entre Rios','MAGISTRATURA ER','33621358419','responsable_inscripto','virginia','amagistradoentrerios@gmail.com','','','','cuenta_corriente','true'),
      ('Asociacion Mutual Modelo De Entre Rios','MUTUAL MODELO','30700166429','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Banco Central De La Republica Argentina','BCRA','30500011382','responsable_inscripto','Silvana Blandi','ppastrana@bcra.gob.ar','','Reservas: sblandi@bcra.gob.ar. Pagos: Patricia Pastrana. VERIFICAR EN EXTRANET','Aloja','cuenta_corriente','true'),
      ('Banco De La Nacion Argentina','BNA','30500010912','responsable_inscripto','pedro','2650ZAD1@bna.com.ar','','Reservas: 2650ZAD@bna.com.ar','Solo Aloja','cuenta_corriente','true'),
      ('Bolsa De Cereales','BOLSA DE CEREALES','30500103414','responsable_inscripto','Dana Taleb','DanaOliveraTaleb@bolsacer.org.ar','','','Full Credit','cuenta_corriente','true'),
      ('Camara Arbitral De Cereales De Entre Rios','CAMARA ARBITRAL CEREALES ER','30525669277','responsable_inscripto','Yanina Monzon','ymonzon@cacerer.com.ar','','','A Determinar','cuenta_corriente','true'),
      ('Confederacion Argentina De La Mediana Empresa Came','CAME','30538872128','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Fundacion Centro De Medicina Nuclear y Molecular Entre Rios','CEMENER','30715094394','responsable_inscripto','Ekaterina Figueroa','ekaterina.figueroa@cemener.org.ar','','','Aloj + Cochera','cuenta_corriente','true'),
      ('Circulo Odontologico De Parana','CIRCULO ODONTOLOGICO','30547604268','responsable_inscripto','Emilia Patat','escuelaposgrado@coparana.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Club Atletico Patronato','CLUB ATLETICO PATRONATO','30654542208','responsable_inscripto','Abdala Gustavo','clubpatronatoparana@hotmail.com','','Abona Mutual. Fact: gerencia@ammer.com.ar','Full Credit','cuenta_corriente','true'),
      ('Col De Abogados De Entre Rios Sede Parana','COLEGIO DE ABOGADOS','30642510203','responsable_inscripto','Valentina Schmal','valentina@caer.org.ar','','Fact: Yanina Reik - yanina@caer.org.ar. Puede reservar Juliana Schonfeld','Aloj + Cochera','cuenta_corriente','true'),
      ('Colegio De Corredores Publico','COLEGIO DE CORREDORES','30707972250','responsable_inscripto','German','','','','Full Credit','cuenta_corriente','true'),
      ('Comersol SA','COMERSOL','30713266406','responsable_inscripto','Agustin M','agustin.m@comersol.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Consejo Profesional De Cs Eco De Er','CONSEJO CS ES','30537317171','responsable_inscripto','Julieta Battauz','spcpceer@cpceer.org.ar','','Fact: Lucrecia Masseto - lmasetto@cpceer.org.ar. VERIFICAR EXTRANET','A Determinar','cuenta_corriente','true'),
      ('Consolid SRL','CONSOLID','30710996608','responsable_inscripto','','','','','Solo Aloja','cuenta_corriente','true'),
      ('Coop Mutual Patronal Sociedad Mutual De Seg Grales','COOP MUTUAL PATRONAL','30500047174','responsable_inscripto','','centraldereservas@cooperacionseguros.com.ar','','','Aloja + Cochera','cuenta_corriente','true'),
      ('Derudder Hermanos SRL','DERUDDER','30611338844','responsable_inscripto','Claudio Pocai','cpocai@zenit.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Ener SA','ENERSA','30709176672','responsable_inscripto','Graciela Eunich','geurich@enersa.com.ar','','Contactos: Graciela Eunich e Ianina Castagno','Full Credit','cuenta_corriente','true'),
      ('Eriochem SA','ERIOCHEM','30700142643','responsable_inscripto','','comprobantes@erio.com.ar','','Reservas: fmonzon@erio.com.ar','','cuenta_corriente','true'),
      ('Esco Saca','ESCO','30629929742','responsable_inscripto','Cynthia Galliussi','fatimamachuca@esco.com.ar','3434168658','Fact: Fatima Machuca. Transfieren a Banco de Entre Rios','Full Credit','cuenta_corriente','true'),
      ('Federacion Economica De Entre Rios','FEDER','30671181197','responsable_inscripto','','coordinacion@federentrerios.com.ar','','','A Determinar','cuenta_corriente','true'),
      ('Ita SA Industria y Tecnologia En Aceros SA','FLOWINDUSTRIES ITA','30619658104','responsable_inscripto','Griotti Cristian','','','','','cuenta_corriente','true'),
      ('Valvulas Worcester De Argentina SA','FLOWINDUSTRIES VALVULAS','30516014748','responsable_inscripto','Analia','analia.camporeale@flowmanagement.com.ar','1138387790','','A Determinar','cuenta_corriente','true'),
      ('Frigorifico Alberdi SA','FRIGORIFICO ALBERDI','33609706959','responsable_inscripto','Tamara Silva','','','Pagos: Maxi Rios. Ordenes de pago en marcadores','A Determinar','cuenta_corriente','true')
    `);

    // Lote 2 de empresas (31-59)
    await db.execute(sql`
      INSERT INTO companies (razon_social, nombre_fantasia, cuil_cuit, condicion_iva, contact_name, contact_email, contact_phone, notes, regimen_hospedaje, condicion_venta_predeterminada, is_active) VALUES
      ('Gigared SA','GIGARED','30663045179','responsable_inscripto','Emilce','efernandez@gigared.com.ar','','','','cuenta_corriente','true'),
      ('Iapser','IAPSER','30500055509','responsable_inscripto','Mirta Gomez','proveedores@iapserseguros.seg.ar','','Fact: Florencia Yost - fyost@iapserseguros.seg.ar','Aloja','cuenta_corriente','true'),
      ('Integra Service SRL','INTEGRA (GRUPO PETERSEN)','30715826948','responsable_inscripto','Ezequiel','integrarosario@gmail.com','','Fact: facturasgrupobancosanjuan@bancosanjuan.com. Pagos: Andrea Caminos','A Determinar','cuenta_corriente','true'),
      ('Iter Medicina SA','ITER','30704734871','responsable_inscripto','Cristina','reclamos.contable@itermed.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Johnson Acero SA','JOHNSON ACERO','30501991070','responsable_inscripto','Daniela Barreto','recepcionpna@johnsonacero.com','+543434261000 Int 138','Fact: recepcionpna@johnsonacero.com. Verificar estado CTA: etaffarel@johnsonacero.com','Aloja','cuenta_corriente','true'),
      ('Laboratorios Aspen SA','LABORATORIO ASPEN','30610562228','responsable_inscripto','Rosario Rapuzzi','administracion@aspen-lab.com','','','A Determinar','cuenta_corriente','true'),
      ('Lafedar SA','LAFEDAR','30681071381','responsable_inscripto','','mariajose.fabro@lafedar.com','','','','cuenta_corriente','true'),
      ('Rafaela Alimentos SA','LARIO','33500529909','responsable_inscripto','','lourdesmartin@lario.com.ar','','','Aloja y Cochera','cuenta_corriente','true'),
      ('Leiva Comercial SA','LEIVA HNOS','30718560256','responsable_inscripto','','','','Tambien: Leiva Hermanos SA (30710771576)','','cuenta_corriente','true'),
      ('Leiva Hermanos SA','LEIVA HNOS','30710771576','responsable_inscripto','Paula Leiva','gimenacastano@leivahnos.com.ar','','Fact: Gimena Castagno','A Determinar','cuenta_corriente','true'),
      ('Liserar SA','LISERAR','30688955749','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Fundacion Miradortec Parque Tecnologico','MIRADOR TEC','30719274923','responsable_inscripto','pallotti','administrador@miradortec.net.ar','','Pagos: Vanesa Masilla - 3434656285','','cuenta_corriente','true'),
      ('Nexo SA','NEXO','30651957830','responsable_inscripto','Roxana Schiavoni','recepcion@nexo-aberturas.com.ar','','Hacer una sola factura si hay mas de 5 reservas. Pagos: pagos@nexo-aberturas.com.ar','Full Credit','cuenta_corriente','true'),
      ('Osde Organizacion De Servicios Directos Empresarios','OSDE','30546741253','responsable_inscripto','Evelyn Livoni','','','VERIFICAR EN EXTRANET','A Determinar','cuenta_corriente','true'),
      ('Papelera Er SA','PAPELERA ER','30504516365','responsable_inscripto','Araceli Arce','administracion@papentrerios.com.ar','+54 343 4331 444 Int 233','Enviar detalle de consumos firmados. CC: tesoreria@papentrerios.com.ar. Pagos: Jacqueline Dellepiane','Full Credit','cuenta_corriente','true'),
      ('Petropack SA','PETROPACK','30631926491','responsable_inscripto','Maria Rumiz','compras.facturas@petropack.com','','Reservas: recepcion@petropack.com. Pagos: asistente.administracion@petropack.com','A Determinar','cuenta_corriente','true'),
      ('Pisos y Revestimientos SA','PISOS Y REVESTIMIENTOS','30679216895','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Poder Judicial De Er','PODER JUDICIAL','30681097763','responsable_inscripto','Julieta Gambito','institutojuanbalberdi@gmail.com','','Suelen ser ordenes de compra','A Determinar','cuenta_corriente','true'),
      ('Punto Turistico SA','PUNTO TURISTICO','30698479252','responsable_inscripto','Agustina Caro','administracion@pturistico.com.ar','','Reservas: arcorreservas@pturistico.com.ar','A Determinar','cuenta_corriente','true'),
      ('Qualia Compania De Seguros SA','QUALIA','30714496804','responsable_inscripto','Evelyn Russo','asistentedirectorio@qualiaseguros.com','','','Aloja y Cochera','cuenta_corriente','true'),
      ('Renacer','RENACER','30709542326','responsable_inscripto','Flavia Chiosso','','','','','cuenta_corriente','true'),
      ('Secar Security Argentina SA','SECAR','30678239549','responsable_inscripto','Araceli Gonzalez','araceligonzalez@securion.com.ar','+54 343 5269254','VERIFICAR EN EXTRANET (COBRANZAS.COM)','A Determinar','cuenta_corriente','true'),
      ('Seguros Bernardino Rivadavia Cooperativa Limitada','SEGUROS RIVADAVIA','30500050310','responsable_inscripto','Clarisa','cdonoso@segurosrivadavia.com','','','','cuenta_corriente','true'),
      ('Sermex SA','SERMEX','30708032812','responsable_inscripto','Fernanda Ortiz','sortiz@sermex.com.ar','','Fact: Sofia Ortiz. Puede reservar Mario Frazzini','Full Credit','cuenta_corriente','true'),
      ('Sindicato Unificado De Trabajadores De La Educacion De Bs As Suteba','SUTEBA','30630102282','responsable_inscripto','','cgonzalez@suteba.org.ar','','Reservas: ncosta@suteba.org.ar','Solo Aloja','cuenta_corriente','true'),
      ('Universidad Catolica Argentina Sede Parana','UCA','30709499668','responsable_inscripto','','nicolasbarcos@uca.edu.ar','','Tambien: jorge_medrano@uca.edu.ar','Aloja y Cochera','cuenta_corriente','true'),
      ('Uner','UNER','30562252157','responsable_inscripto','Diego Godoy','diego.godoy@uner.edu.ar','','','Aloja y Cochera','cuenta_corriente','true'),
      ('Unimaco SA','UNIMACO','30708992301','responsable_inscripto','Yanina Carrasco','ycarrasco@familiabercomat.com','370 4348745','','Full Credit','cuenta_corriente','true'),
      ('Venturance SA','VENTURANCE','30546783495','responsable_inscripto','Maria Eugenia Rusconi','erusconi@venturance.ar','','Fact: Damian Marotti - DMarotti@venturance.ar','A Determinar','cuenta_corriente','true')
    `);

    // Agencias (11)
    await db.execute(sql`
      INSERT INTO agencies (razon_social, nombre_fantasia, cuil_cuit, condicion_iva, contact_name, contact_email, contact_phone, notes, condicion_venta_predeterminada, is_active) VALUES
      ('Organizacion De Servicios Turisticos SRL','AMICHI','30612067267','responsable_inscripto','','prepagos@amichi.com.ar','','Ingresa por channel manager. Contacto reservas: Lucas Landini','cuenta_corriente','true'),
      ('Furlong Fox SA','FURLONG FOX','30707962743','responsable_inscripto','Paola','hoteles@furlong-fox.com.ar','','Fact: fproveedores@furlong-fox.com.ar. Pagos: pagoproveedores@furlong-fox.com.ar','cuenta_corriente','true'),
      ('GBT II Argentina SRL','GBT','30714466603','responsable_inscripto','','FacturasHoteles@amexgbt.com','','Reservas: arg@vsatravel.com.mx','cuenta_corriente','true'),
      ('Neptuno Viajes SRL','NEPTUNO','30663437166','responsable_inscripto','Carolina Leiva','carolina@neptuno.tur.ar','','Reservas: cecilia@neptuno.tur.ar. Pagos: Martin Vidal. Enviar a Carolina y copiar Martin Vidal','cuenta_corriente','true'),
      ('ITS Internacional Travel Services SA','PEZZATTI','30676757917','responsable_inscripto','Alejandra Cartasegna','administracionmdq2@pezzati.com','','Reservas: alejandracartasegna@pezzati.com. Pagos: Sabrina Demaria / Jacqueline Luna','cuenta_corriente','true'),
      ('Prosa Promotora Sol Argentino SA','PROSA VIAJES','30557578524','responsable_inscripto','mgabriela','mgabriela@prosaviajes.com.ar','','','cuenta_corriente','true'),
      ('CGB Viajes SRL','TRAVEL TIPS','30715151665','responsable_inscripto','Alberto Cardullo','empresas@traveltips.com.ar','','','cuenta_corriente','true'),
      ('Travel Services Argentina SA','TTS','30521151818','responsable_inscripto','','lreynoso@travelservices.com','','Pagos: Mariel Murrilo / Leonardo Reynoso','cuenta_corriente','true'),
      ('Despegarcomar SA','DESPEGAR','30701307115','responsable_inscripto','','','','','cuenta_corriente','true'),
      ('Grupo San Marcos SRL','KEEPERS TRAVEL','30714516546','responsable_inscripto','Jazmin Elias','je@keeperstravel.com','','Fact: rera@keeperstravel.com. Pagos: Reynaldo Alberto','cuenta_corriente','true'),
      ('Coovaeco Turismo Coop De Prestacion De Serv Tur Limitada','COOVAECO TUR','30596889014','responsable_inscripto','','operadores@coovaeco.com','','Reservas: rcardillo@coovaeco.com (Rosana Cardillo). Pagos: Noelia Cartvachi','cuenta_corriente','true')
    `);

    // Saldos iniciales (deudas de las empresas/agencias con el hotel)
    await db.execute(sql`
      INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount, created_at)
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',696500.00,NOW() FROM companies WHERE cuil_cuit='30547794482'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',600000.00,NOW() FROM companies WHERE cuil_cuit='33621358419'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',693300.03,NOW() FROM companies WHERE cuil_cuit='30537317171'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',2748100.14,NOW() FROM companies WHERE cuil_cuit='30709176672'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',344500.02,NOW() FROM companies WHERE cuil_cuit='30500055509'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',5874000.02,NOW() FROM companies WHERE cuil_cuit='30501991070'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',106000.00,NOW() FROM companies WHERE cuil_cuit='30688955749'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',4201900.09,NOW() FROM companies WHERE cuil_cuit='30719274923'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',129500.00,NOW() FROM companies WHERE cuil_cuit='30546741253'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',2253500.17,NOW() FROM companies WHERE cuil_cuit='30504516365'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',2660500.05,NOW() FROM companies WHERE cuil_cuit='30631926491'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',141500.00,NOW() FROM companies WHERE cuil_cuit='30679216895'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',3031500.00,NOW() FROM companies WHERE cuil_cuit='30698479252'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',810500.05,NOW() FROM companies WHERE cuil_cuit='30708032812'
      UNION ALL
      SELECT gen_random_uuid(),'agency',id,CURRENT_DATE,'cargo','Saldo inicial',530500.01,NOW() FROM agencies WHERE cuil_cuit='30707962743'
      UNION ALL
      SELECT gen_random_uuid(),'agency',id,CURRENT_DATE,'cargo','Saldo inicial',151000.00,NOW() FROM agencies WHERE cuil_cuit='30714466603'
      UNION ALL
      SELECT gen_random_uuid(),'agency',id,CURRENT_DATE,'cargo','Saldo inicial',3439244.58,NOW() FROM agencies WHERE cuil_cuit='30701307115'
    `);

    logger.info("Seed completado: 59 empresas, 11 agencias, 17 saldos iniciales.");
  }

  logger.info("Migraciones incrementales completadas.");
}
