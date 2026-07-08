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

  await withTimeout("restaurant_reservation_advances.invoice_id", T, () =>
    db.execute(sql`ALTER TABLE restaurant_reservation_advances ADD COLUMN IF NOT EXISTS invoice_id integer`)
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

  logger.info("Migraciones incrementales completadas.");
}
