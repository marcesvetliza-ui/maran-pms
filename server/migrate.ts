  // Elaboraciones base (sub-recipes / intermediate productions)
  await withTimeout("recipes.elaboraciones_fields", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE recipes
        ADD COLUMN is_base boolean DEFAULT false,
        ADD COLUMN name text,
        ADD COLUMN production_unit text,
        ADD COLUMN production_yield numeric(10,3);
    `)));
    return db.execute(sql`ALTER TABLE recipes ALTER COLUMN menu_item_id DROP NOT NULL`);
  });

  await withTimeout("recipe_ingredients.sub_recipe_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE recipe_ingredients ADD COLUMN sub_recipe_id varchar`)))
  );

  // Toma de Inventario
  await withTimeout("inventory_counts.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE inventory_counts (
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
    `)))
  );

  await withTimeout("inventory_count_items.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE inventory_count_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        count_id varchar NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
        item_id varchar NOT NULL,
        item_name text NOT NULL,
        unit text NOT NULL DEFAULT 'unidad',
        expected_stock numeric(10,3) NOT NULL DEFAULT 0,
        actual_stock numeric(10,3),
        notes text
      )
    `)))
  );

  await withTimeout("menu_categories.is_beverage", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE menu_categories ADD COLUMN is_beverage BOOLEAN DEFAULT FALSE`)))
  );

  await withTimeout("internal_movements.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE internal_movements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        date date NOT NULL,
        motivo text NOT NULL,
        descripcion text,
        notes text,
        created_by text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );

  await withTimeout("internal_movement_items.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE internal_movement_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        movement_id varchar NOT NULL REFERENCES internal_movements(id) ON DELETE CASCADE,
        item_id varchar NOT NULL,
        item_name text NOT NULL,
        unit text NOT NULL DEFAULT 'unidad',
        quantity numeric(10,3) NOT NULL,
        cost_price numeric(10,2) NOT NULL DEFAULT 0,
        notes text
      )
    `)))
  );

  await withTimeout("item_categories.is_group", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE item_categories ADD COLUMN is_group boolean NOT NULL DEFAULT false`)))
  );

  await withTimeout("email_config.banner_footer", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE email_config
        ADD COLUMN email_banner_base64 text,
        ADD COLUMN email_footer_base64 text
    `)))
  );

  // group_payment_id on payments: deterministic FK so invoice_ref can be propagated to the exact group_payments row
  await withTimeout("payments.group_payment_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE payments ADD COLUMN group_payment_id varchar`)))
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
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN restaurant_order_id varchar`)))
  );

  await withTimeout("spa_accounts.invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_accounts ADD COLUMN invoice_id integer`)))
  );

  await withTimeout("events.invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE events ADD COLUMN invoice_id integer`)))
  );

  await withTimeout("event_tables.invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE event_tables ADD COLUMN invoice_id integer`)))
  );

  await withTimeout("event_tables.nc_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE event_tables ADD COLUMN nc_id integer`)))
  );

  await withTimeout("events.nc_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE events ADD COLUMN nc_id integer`)))
  );

  await withTimeout("groups.billing_entity_type", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE groups ADD COLUMN billing_entity_type text`)))
  );

  await withTimeout("spa_accounts.nc_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_accounts ADD COLUMN nc_id integer`)))
  );

  await withTimeout("groups.billing_entity_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE groups ADD COLUMN billing_entity_id varchar`)))
  );

  await withTimeout("sales_invoices.cash_forma_pago", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN cash_forma_pago text`)))
  );

  await withTimeout("sales_invoices.source_charge_ids", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN source_charge_ids jsonb`)))
  );

  await withTimeout("sales_invoices.source_charge_amounts", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN source_charge_amounts jsonb`)))
  );

  await withTimeout("sales_invoices.observaciones", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN observaciones text`)))
  );

  await withTimeout("group_payments.receipt_type", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN receipt_type text`)))
  );

  await withTimeout("group_payments.billing_entity_type", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN billing_entity_type text`)))
  );

  await withTimeout("group_payments.billing_entity_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN billing_entity_id varchar(255)`)))
  );

  await withTimeout("group_payments.payment_method_detail", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN payment_method_detail jsonb`)))
  );

  await withTimeout("group_payments.destination_and_receiver", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE group_payments
        ADD COLUMN destination text NOT NULL DEFAULT 'group_distribution',
        ADD COLUMN receiver_details jsonb;
    `)));
    return db.execute(sql`
      UPDATE group_payments
      SET destination = 'master_folio'
      WHERE destination = 'group_distribution'
        AND distribution = 'master_folio';
    `);
  });

  await withTimeout("group_payments.invoice_id", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE group_payments ADD COLUMN invoice_id integer",
    )));
    return db.execute(sql.raw(incrementalIndexSql("groupPaymentsInvoiceIdUnique")));
  });

  await withTimeout("account_movements.group_payment_id", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE account_movements ADD COLUMN group_payment_id varchar",
    )));
    return db.execute(sql.raw(incrementalIndexSql("accountMovementsGroupPaymentId")));
  });
  await withTimeout("group_payments.group_id_idx", T, () =>
    db.execute(sql.raw(incrementalIndexSql("groupPaymentsGroupId")))
  );
  await withTimeout("payments.group_payment_id_idx", T, () =>
    db.execute(sql.raw(incrementalIndexSql("paymentsGroupPaymentId")))
  );

  // invoice_nc_ref on group_payments: JSON-encoded ARCA NC result when a nota de crédito has been emitted for this payment
  await withTimeout("group_payments.invoice_nc_ref", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN invoice_nc_ref text`)))
  );

  // retention_detail on group_payments: [{tipo, monto}] retención withheld on
  // the portion of a Folio Maestro / group-charges payment that has no real
  // room to attach payments.notes to — without this column that retención
  // was silently dropped instead of just recorded elsewhere.
  await withTimeout("group_payments.retention_detail", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN retention_detail jsonb`)))
  );

  // Recover only immutable splits explicitly persisted before fiscal
  // authorization. No balance-based inference is allowed: a later collection
  // can exceed the fiscal document while still applying prior advances.
  await withTimeout("group_payments.settlement_breakdown_backfill", T, () =>
    backfillGroupPaymentSettlementBreakdowns()
  );

  // Receipt numbers are generated only for newly issued parent receipts.
  // Do not backfill historic UUID receipts: their immutable display fallback
  // is intentionally handled by the receipt renderer.
  await withTimeout("group_payments.receipt_number_and_concepts", T, async () => {
    await db.execute(sql.raw(INCREMENTAL_NON_INDEX_DDL.groupPaymentsReceiptNumberSequence));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE group_payments ADD COLUMN receipt_number integer",
    )));
    await db.execute(sql`
      ALTER TABLE group_payments
        ALTER COLUMN receipt_number SET DEFAULT nextval('group_payments_receipt_number_seq'::regclass);
      ${sql.raw(incrementalIndexSql("groupPaymentsReceiptNumberUnique"))}
    `);
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE group_payments ADD COLUMN concepts jsonb",
    )));
    return db.execute(sql`
      CREATE OR REPLACE FUNCTION prevent_group_payment_receipt_number_change()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN
          RAISE EXCEPTION 'group payment receipt_number is immutable';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS group_payments_receipt_number_immutable ON group_payments;
      CREATE TRIGGER group_payments_receipt_number_immutable
        BEFORE UPDATE ON group_payments
        FOR EACH ROW EXECUTE FUNCTION prevent_group_payment_receipt_number_change();
    `);
  });

  // group_invoices: facturas emitidas directamente desde el Resumen del Grupo (sin pago asociado)
  await withTimeout("group_invoices (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE group_invoices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id varchar NOT NULL,
        sales_invoice_id integer UNIQUE,
        invoice_ref text NOT NULL,
        notes text,
        created_at timestamp DEFAULT now()
      )
    `)))
  );

  // Add sales_invoice_id column if table was created without it (incremental add)
  await withTimeout("group_invoices.sales_invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_invoices ADD COLUMN sales_invoice_id integer UNIQUE`)))
  );

  // The fiscal source claim must be written with sales_invoices, before the
  // client performs its follow-up link request. This makes the group residual
  // guard safe across simultaneous browser actions and application instances.
  await withTimeout("sales_invoices.group_invoice_scope", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE sales_invoices
        ADD COLUMN group_id varchar,
        ADD COLUMN group_payment_id varchar,
        ADD COLUMN group_payment_intent jsonb;
    `)));
    return db.execute(sql`
      ${sql.raw(incrementalIndexSql("salesInvoicesGroupId"))}
      ALTER TABLE sales_invoices
        DROP CONSTRAINT IF EXISTS sales_invoices_group_payment_id_unique;
      DROP INDEX IF EXISTS sales_invoices_group_payment_id_unique;
      ${sql.raw(incrementalIndexSql("salesInvoicesGroupPaymentId"))}
    `);
  });

  // Reservation-payment ownership is captured before ARCA just like group and
  // SPA ownership.  A payment has one fiscal document: the unique claim closes
  // the concurrent-tab window before an outbound ARCA request is made.
  await withTimeout("sales_invoices.payment_invoice_scope", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE sales_invoices ADD COLUMN payment_id varchar",
    )));
    return db.execute(sql.raw(incrementalIndexSql("salesInvoicesPaymentId")));
  });

  // A fiscal invoice emitted from SPA claims its account before ARCA issuance.
  // The unique partial index prevents two browser tabs from invoicing the same
  // SPA account independently.
  await withTimeout("sales_invoices.spa_account_scope", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE sales_invoices ADD COLUMN spa_account_id varchar",
    )));
    return db.execute(sql.raw(incrementalIndexSql("salesInvoicesSpaAccountIdUnique")));
  });

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
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE reservations ADD COLUMN moved_from_room_number text`)))
  );

  // billing_config: iibb e telefono para comprobantes fiscales
  await withTimeout("billing_config.iibb_telefono", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE billing_config
        ADD COLUMN iibb text,
        ADD COLUMN telefono text
    `)))
  );

  // Add regimen_hospedaje to companies
  await withTimeout("companies.regimen_hospedaje", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE companies ADD COLUMN regimen_hospedaje text`)))
  );

  // cash_register_configs: unique constraint on area column.
  // Check both the constraint and its backing relation so reruns do not emit
  // duplicate-relation warnings when the index already exists.
  await withTimeout("cash_register_configs.area_unique", T, () =>
    db.execute(sql.raw(CASH_REGISTER_CONFIGS_AREA_UNIQUE_MIGRATION_SQL))
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

  // group_invoices: vincular facturas emitidas desde el Resumen del Grupo al folio
  await withTimeout("group_invoices.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE group_invoices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id varchar NOT NULL,
        sales_invoice_id integer UNIQUE,
        invoice_ref text NOT NULL,
        notes text,
        created_at timestamp DEFAULT now()
      )
    `)))
  );

  // Bug fix: deleteEventCharge never removed the matching folio_movements row,
  // so charges removed from an event (loaded by mistake, later changed) kept
  // summing into the event's folio total and PDF export. Fixed going forward
  // in routes/events.ts; this cleans up the 17 orphaned rows already found in
  // production whose source event_charges no longer exist, then recomputes
  // the affected folios' totals/balance to match.
  await withTimeout("folio_movements.cleanup_orphaned_event_charges", T, () =>
    db.execute(sql`
      DELETE FROM folio_movements
      WHERE id IN (
        'd2c993db-d900-4410-af7c-380638085943',
        'f487fbbd-d567-4dbc-9b51-0268bb17b8a1',
        'e41f8485-d1a9-42a1-97ea-14d8607d7183',
        'e122bcd5-84b6-4ec4-9a66-d0862cdfb46d',
        '137ff376-e6a2-4517-9db5-128b942f6d58',
        '47a622c8-3ecd-4b1e-beca-40d92870f101',
        '6bf98e2a-45ff-4988-ac3f-788f30887fad',
        '7349c515-075e-479b-97db-2442b51ae8e9',
        '36473937-893f-4e9a-b9ee-4a9192f7d371',
        '24d950b1-74fa-4c73-b1e9-a639efa6f107',
        '861a2222-32af-4b31-a307-2da1923777c3',
        '54db69ff-8da7-49db-b526-fc60e0eefc8b',
        '0a93aaf1-8697-4755-a5db-4bce64ed9a1d',
        'f1dfadd6-5729-4904-80c3-0c1fee82f5a1',
        '4454ebdd-c500-46a0-afad-680c6cef60a3',
        '1d4e5946-5bda-4cc6-a624-e73481be1aba',
        '02088777-9a5b-4c30-b7c8-9cdc89cd857d',
        '33dca043-b6ca-4ffa-8513-1ff8bbba65e7'
      )
      AND source_type = 'event_charge'
    `)
  );
  await withTimeout("folios.recalc_after_event_charge_cleanup", T, () =>
    db.execute(sql`
      UPDATE folios f SET
        total_charges = COALESCE((
          SELECT SUM(amount::numeric) FROM folio_movements
          WHERE folio_id = f.id AND type IN ('charge','transfer_in')
        ), 0),
        total_payments = COALESCE((
          SELECT SUM(amount::numeric) FROM folio_movements
          WHERE folio_id = f.id AND type IN ('payment','advance','discount','transfer_out','void')
        ), 0)
      WHERE f.entity_type = 'event'
        AND f.id IN (
          '68e3ec06-ef02-46e2-af74-06bd74bacaa1',
          '56e90f6f-3e9e-43d8-87f5-0a97f1c14605',
          '0815f03b-6237-4879-97ef-6660667fa0d0',
          'd93f4ecf-5bf3-4a7f-b808-859b00ba7127',
          '16100fc0-25d6-426b-9622-cbca17db1a22',
          '6f853c1d-c47e-4757-bd85-9d76b0252aa4',
          '73d6fb36-a1eb-4753-bc8e-620294cafd63',
          'a96b010d-3e09-474f-b6b9-812265551e69',
          'f03ff7f5-f7bb-4c66-bde2-abca3e21293c',
          '16a3b4c9-2ea6-4747-9167-db4249d0ec85'
        )
    `)
  );
  await withTimeout("folios.recalc_balance_after_event_charge_cleanup", T, () =>
    db.execute(sql`
      UPDATE folios SET balance = total_charges::numeric - total_payments::numeric
      WHERE entity_type = 'event'
        AND id IN (
          '68e3ec06-ef02-46e2-af74-06bd74bacaa1',
          '56e90f6f-3e9e-43d8-87f5-0a97f1c14605',
          '0815f03b-6237-4879-97ef-6660667fa0d0',
          'd93f4ecf-5bf3-4a7f-b808-859b00ba7127',
          '16100fc0-25d6-426b-9622-cbca17db1a22',
          '6f853c1d-c47e-4757-bd85-9d76b0252aa4',
          '73d6fb36-a1eb-4753-bc8e-620294cafd63',
          'a96b010d-3e09-474f-b6b9-812265551e69',
          'f03ff7f5-f7bb-4c66-bde2-abca3e21293c',
          '16a3b4c9-2ea6-4747-9167-db4249d0ec85'
        )
    `)
  );

  // Centro de costo / plan de cuentas: cuentas de gasto para Eventos
  await withTimeout("accounting_accounts.eventos seed", T, () =>
    db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo) VALUES
      ('4.2.1.08.40.01', 'Catering e Insumos Eventos', 'egreso'),
      ('4.2.1.08.40.02', 'Alquiler de Mobiliario y Equipamiento', 'egreso'),
      ('4.2.1.08.40.03', 'Decoración y Ambientación', 'egreso'),
      ('4.2.1.08.40.04', 'Servicios Tercerizados Eventos', 'egreso'),
      ('4.2.1.08.40.05', 'Otros Gastos Eventos', 'egreso')
      ON CONFLICT (codigo) DO NOTHING
    `)
  );

  await withTimeout("accounting_accounts.received_retentions seed", T, () =>
    db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo, activo) VALUES
      ('1.1.4.01.08.01', 'Ret. Ing Brutos', 'activo', true),
      ('1.1.4.01.04.01', 'Ret. IVA', 'activo', true),
      ('1.1.4.01.05', 'Ret Impuestos a las ganancias', 'activo', true),
      ('1.1.4.01.11', 'Retenciones Municipales', 'activo', true),
      ('1.1.4.01.10', 'Retenciones SUSS', 'activo', true)
      ON CONFLICT (codigo) DO UPDATE SET tipo = 'activo', activo = true
    `)
  );

  // These are the base accounts used by the accounting flows. Keep an
  // operator's existing account name on conflict while restoring the
  // canonical type and active state if an earlier partial seed created it.
  await withTimeout("accounting_accounts.canonical_base seed", T, () =>
    db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo, activo) VALUES
      ('1.1.1.01', 'Caja', 'activo', true),
      ('1.1.4.01.04.01', 'Ret. IVA', 'activo', true),
      ('1.1.4.01.05', 'Ret Impuestos a las ganancias', 'activo', true),
      ('1.1.4.01.08.01', 'Ret. Ing Brutos', 'activo', true),
      ('2.1.1.01', 'Proveedores a Pagar', 'pasivo', true),
      ('4.2.1.08.05.02', 'Gastos Comerciales', 'egreso', true)
      ON CONFLICT (codigo) DO UPDATE
      SET tipo = EXCLUDED.tipo,
          activo = true
    `)
  );

  const financialSchema = await verifyFinancialSchema();
  if (!financialSchema.ready) {
    throw Object.assign(new Error(financialSchemaErrorMessage(financialSchema)), {
      code: "FINANCIAL_SCHEMA_NOT_READY",
    });
  }

  logger.info("Migraciones incrementales completadas.");
}
