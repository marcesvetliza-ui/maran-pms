    const [turnoNuevo] = await db.insert(cashShifts).values({
      id: randomUUID(),
      area,
      shiftNumber: nextNum,
      openedBy: null,
      openedAt: new Date(),
      status: "open",
      autoCreado: true,
    }).returning();
    return turnoNuevo;
  }

  async initCashShifts(): Promise<void> {
    const areas = ["recepcion", "restaurant", "spa"];
    for (const area of areas) {
      const [existing] = await db.select().from(cashShifts)
        .where(and(eq(cashShifts.area, area), eq(cashShifts.status, "open")))
        .limit(1);
      if (!existing) {
        const nextNum = await this._nextShiftNumber(area);
        await db.insert(cashShifts).values({
          id: randomUUID(),
          area,
          shiftNumber: nextNum,
          openedBy: null,
          openedAt: new Date(),
          status: "open",
          autoCreado: true,
        });
        console.log(`[Init] Turno inicial creado para área: ${area}`);
      }
    }
  }

  async tomarTurno(shiftId: string, operador: string, turnoTipo?: string | null): Promise<CashShift> {
    const setValues: Record<string, any> = { openedBy: operador, autoCreado: false };
    if (turnoTipo) setValues.turnoTipo = turnoTipo;
    const [shift] = await db.update(cashShifts)
      .set(setValues)
      .where(and(eq(cashShifts.id, shiftId), eq(cashShifts.status, "open")))
      .returning();
    if (!shift) throw new Error("Turno no encontrado o ya cerrado");
    return shift;
  }

  async getAutocreadoShifts(): Promise<CashShift[]> {
    return db.select().from(cashShifts)
      .where(and(eq(cashShifts.status, "open"), eq(cashShifts.autoCreado, true)))
      .orderBy(desc(cashShifts.openedAt));
  }

  async getShiftDetail(shiftId: string): Promise<{ shift: CashShift; movements: CashMovement[]; summary: CashClosingSummary | null }> {
    const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, shiftId));
    if (!shift) throw new Error("Turno no encontrado");
    const movements = await db.select().from(cashMovements)
      .where(eq(cashMovements.shiftId, shiftId))
      .orderBy(asc(cashMovements.createdAt));
    const [summary] = await db.select().from(cashClosingSummaries)
      .where(eq(cashClosingSummaries.shiftId, shiftId))
      .limit(1);
    return { shift, movements, summary: summary || null };
  }

  async getCashMovements(shiftId: string): Promise<CashMovement[]> {
    return db.select().from(cashMovements)
      .where(eq(cashMovements.shiftId, shiftId))
      .orderBy(desc(cashMovements.createdAt));
  }

  async getOrphanedCashPaymentLinks(): Promise<OrphanedCashPaymentLink[]> {
    const result = await db.execute(sql`
      SELECT
        cm.id AS "movementId",
        cm.payment_id AS "paymentId",
        CASE
          WHEN cm.source_type = 'reservation' THEN 'reservation'
          WHEN cm.source_type = 'group_payment' THEN 'group'
          WHEN cm.source_type IN ('spa_account', 'comprobante') AND cm.area = 'spa' THEN 'spa'
        END AS "paymentType",
        cm.source_type AS "sourceType",
        cm.source_id AS "sourceId",
        cm.source_label AS "sourceLabel",
        cm.shift_id AS "shiftId",
        cm.area,
        cm.amount,
        cm.payment_method AS "paymentMethod",
        cm.movement_type AS "movementType",
        cm.anulado,
        cm.created_at AS "createdAt"
      FROM cash_movements cm
      WHERE cm.payment_id IS NOT NULL
        AND (
          (
            cm.source_type = 'reservation'
            AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = cm.payment_id)
          )
          OR
          (
            cm.source_type = 'group_payment'
            AND NOT EXISTS (SELECT 1 FROM group_payments gp WHERE gp.id = cm.payment_id)
          )
          OR
          (
            cm.area = 'spa'
            AND cm.source_type IN ('spa_account', 'comprobante')
            AND NOT EXISTS (SELECT 1 FROM spa_payments sp WHERE sp.id = cm.payment_id)
          )
        )
      ORDER BY cm.created_at ASC NULLS FIRST, cm.id ASC
    `);
    return result.rows as OrphanedCashPaymentLink[];
  }

  async createCashMovement(data: InsertCashMovement): Promise<CashMovement> {
    // Generic/manual creation is deliberately unable to link a cash movement
    // to a payment. Only registerCashMovement and transactional internal flows
    // may set paymentId.
    const { paymentId: _untrustedPaymentId, ...safeData } = data as InsertCashMovement & {
      paymentId?: unknown;
    };
    const [movement] = await db.insert(cashMovements).values({
      id: randomUUID(),
      ...safeData,
      receiptNumber: sql<string>`nextval('cash_movements_receipt_number_seq'::regclass)::text`,
    }).returning();
    return movement;
  }

  async registerCashMovement(area: string, sourceType: string, sourceId: string | null, sourceLabel: string, paymentMethod: string, amount: string, movementType: string = "income", registeredBy?: string, receiptType?: string, paymentId?: string | null): Promise<CashMovement> {
    const turno = await this.getOrCreateActiveTurno(area);
    const [movement] = await db.insert(cashMovements).values({
      id: randomUUID(),
      shiftId: turno.id,
      area,
      sourceType,
      sourceId,
      sourceLabel,
      paymentMethod,
      amount,
      movementType,
      registeredBy: registeredBy || null,
      receiptType: receiptType || null,
      paymentId: paymentId || null,
      receiptNumber: sql<string>`nextval('cash_movements_receipt_number_seq'::regclass)::text`,
    }).returning();
    return movement;
  }

  async getCashSummary(area?: string, from?: string, to?: string): Promise<any[]> {
    const conditions: any[] = [];
    if (area) conditions.push(eq(cashClosingSummaries.area, area));
    if (from) conditions.push(gte(cashClosingSummaries.closedAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      conditions.push(lt(cashClosingSummaries.closedAt, toDate));
    }

    const summaries = await db.select().from(cashClosingSummaries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(cashClosingSummaries.closedAt));

    const results = [];
    for (const s of summaries) {
      const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, s.shiftId));
      results.push({ ...s, shift });
    }
    return results;
  }
  async getAccountMovements(entityType: AccountEntityType, entityId: string): Promise<(AccountMovement & { saldoPendiente?: number })[]> {
    const rows = await db.select()
      .from(accountMovements)
      .where(
        and(
          eq(accountMovements.entityType, entityType),
          eq(accountMovements.entityId, entityId)
        )
      )
      .orderBy(desc(accountMovements.date), desc(accountMovements.createdAt));

    // Enrich cargo rows with their pending balance (amount - allocated)
    const cargoIds = rows.filter(r => r.type === "cargo").map(r => r.id);
    if (cargoIds.length === 0) return rows;

    const allocs = await db.select()
      .from(accountMovementAllocations)
      .where(inArray(accountMovementAllocations.cargoId, cargoIds));

    const allocatedByCargo = new Map<string, number>();
    for (const a of allocs) {
      allocatedByCargo.set(a.cargoId, (allocatedByCargo.get(a.cargoId) || 0) + parseFloat(a.amount));
    }

    return rows.map(r => {
      if (r.type !== "cargo") return r;
      const allocated = allocatedByCargo.get(r.id) || 0;
      const saldoPendiente = Math.round((parseFloat(r.amount) - allocated) * 100) / 100;
      return { ...r, saldoPendiente };
    });
  }

  async getAccountBalance(entityType: AccountEntityType, entityId: string): Promise<number> {
    const movements = await this.getAccountMovements(entityType, entityId);
    return movements.reduce((sum, m) => sum + parseFloat(m.amount), 0);
  }

  async getAccountMovementsByReservation(reservationId: string): Promise<AccountMovement[]> {
    return await db.select()
      .from(accountMovements)
      .where(eq(accountMovements.reservationId, reservationId))
      .orderBy(desc(accountMovements.createdAt));
  }

  async createAccountMovement(data: InsertAccountMovement): Promise<AccountMovement> {
    assertFinancialSchemaReady();
    const [created] = await db.insert(accountMovements).values(data as any).returning();
    return created;
  }

  async getPendingCharges(entityType: AccountEntityType, entityId: string): Promise<(AccountMovement & { saldoPendiente: number })[]> {
    const movements = await db.select()
      .from(accountMovements)
      .where(
        and(
          eq(accountMovements.entityType, entityType),
          eq(accountMovements.entityId, entityId),
          eq(accountMovements.type, "cargo")
        )
      )
      .orderBy(asc(accountMovements.date), asc(accountMovements.createdAt));

    if (movements.length === 0) return [];

    const cargoIds = movements.map(m => m.id);
    const allocations = await db.select()
      .from(accountMovementAllocations)
      .where(inArray(accountMovementAllocations.cargoId, cargoIds));

    const allocatedByCargo = new Map<string, number>();
    for (const a of allocations) {
      allocatedByCargo.set(a.cargoId, (allocatedByCargo.get(a.cargoId) || 0) + parseFloat(a.amount));
    }

    return movements
      .map(m => {
        const cargoAmount = parseFloat(m.amount);
        const allocated = allocatedByCargo.get(m.id) || 0;
        const saldoPendiente = Math.round((cargoAmount - allocated) * 100) / 100;
        return { ...m, saldoPendiente };
      })
      .filter(m => m.saldoPendiente > 0.009);
  }

  async createPaymentWithAllocations(
    entityType: AccountEntityType,
    entityId: string,
    data: { date: string; description: string; amount: string; reference: string | null; paymentMethod?: string | null; retentions: AccountRetention[] | null; createdBy: string | null; guestName?: string | null },
    allocations: { cargoId: string; amount: string }[]
  ): Promise<{ movement: AccountMovement; allocations: AccountMovementAllocation[] }> {
    assertFinancialSchemaReady();
    return await db.transaction(async (tx) => {
      const validationError = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
      const paymentAmount = Math.abs(parseFloat(data.amount));
      const normalizedAllocations = allocations.map((allocation) => ({
        cargoId: String(allocation.cargoId || ""),
        amount: parseFloat(allocation.amount),
      }));
      const allocationsTotal = normalizedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw validationError("Monto inválido");
      }
      if (normalizedAllocations.some((allocation) => !allocation.cargoId || !Number.isFinite(allocation.amount) || allocation.amount <= 0)) {
        throw validationError("Hay una asignación con datos inválidos");
      }
      if (normalizedAllocations.length > 0 && Math.abs(allocationsTotal - paymentAmount) > 0.01) {
        throw validationError("El total aplicado debe coincidir con los comprobantes seleccionados");
      }

      if (normalizedAllocations.length > 0) {
        const cargoIds = Array.from(new Set(normalizedAllocations.map((allocation) => allocation.cargoId)));
        if (cargoIds.length !== normalizedAllocations.length) {
          throw validationError("Un comprobante no puede asignarse más de una vez en el mismo pago");
        }
        const idsSql = sql.join(cargoIds.map((id) => sql`${id}`), sql`, `);

        // Lock selected cargos before calculating their remaining balance. A
        // concurrent payment waits here, then sees the first payment's
        // allocations and is rejected instead of overpaying the cargo.
        const lockedCargosResult = await tx.execute(sql`
          SELECT id, amount::numeric AS amount
          FROM account_movements
          WHERE id IN (${idsSql})
            AND entity_type = ${entityType}
            AND entity_id = ${entityId}
            AND type = 'cargo'
          ORDER BY id
          FOR UPDATE
        `);
        const lockedCargos = lockedCargosResult.rows as { id: string; amount: string }[];
        if (lockedCargos.length !== cargoIds.length) {
          throw validationError("Uno de los comprobantes seleccionados ya no está pendiente");
        }

        const allocatedResult = await tx.execute(sql`
          SELECT cargo_id, COALESCE(SUM(amount::numeric), 0) AS allocated
          FROM account_movement_allocations
          WHERE cargo_id IN (${idsSql})
          GROUP BY cargo_id
        `);
        const cargoById = new Map(lockedCargos.map((cargo) => [cargo.id, parseFloat(cargo.amount)]));
        const allocatedByCargo = new Map(
          (allocatedResult.rows as { cargo_id: string; allocated: string }[])
            .map((row) => [row.cargo_id, parseFloat(row.allocated)])
        );

        for (const allocation of normalizedAllocations) {
          const remaining = (cargoById.get(allocation.cargoId) ?? 0) - (allocatedByCargo.get(allocation.cargoId) ?? 0);
          if (allocation.amount > remaining + 0.01) {
            throw validationError("El importe aplicado supera el saldo pendiente del comprobante");
          }
        }
      }

      const [movement] = await tx.insert(accountMovements).values({
        entityType,
        entityId,
        date: data.date,
        type: "pago",
        description: data.description,
        amount: data.amount,
        reference: data.reference,
        paymentMethod: data.paymentMethod ?? null,
        retentions: data.retentions,
        createdBy: data.createdBy,
        guestName: data.guestName ?? null,
      } as any).returning();

      const createdAllocations: AccountMovementAllocation[] = [];
      for (const alloc of allocations) {
        const [created] = await tx.insert(accountMovementAllocations).values({
          pagoId: movement.id,
          cargoId: alloc.cargoId,
          amount: alloc.amount,
        } as any).returning();
        createdAllocations.push(created);
      }

      return { movement, allocations: createdAllocations };
    });
  }

  async getAccountMovementAllocations(pagoId: string): Promise<AccountMovementAllocation[]> {
    return await db.select()
      .from(accountMovementAllocations)
      .where(eq(accountMovementAllocations.pagoId, pagoId));
  }

  async getAccountSummary(): Promise<{
    companies: { id: string; name: string; balance: number; lastMovement: string | null }[];
    agencies: { id: string; name: string; balance: number; lastMovement: string | null }[];
    guests: { id: string; name: string; balance: number; lastMovement: string | null }[];
  }> {
    // Balance de empresas: usamos account_movements como fuente de verdad (igual que agencias),
    // porque el listado de movimientos muestra account_movements y el saldo debe coincidir.
    // La fórmula anterior (basada en reservations.company_id) divergía de los movimientos reales
    // en producción cuando los cargos se creaban sin company_id seteado en la reserva.
    const companiesRes = await db.execute(sql`
      SELECT c.id,
             COALESCE(NULLIF(c.nombre_fantasia, ''), c.razon_social) AS name,
             COALESCE(SUM(m.amount::numeric), 0)                     AS balance,
             MAX(m.date::text)                                        AS last_movement
      FROM companies c
      LEFT JOIN account_movements m ON m.entity_id = c.id AND m.entity_type = 'company'
      WHERE c.is_active = 'true'
      GROUP BY c.id, c.nombre_fantasia, c.razon_social
      HAVING COALESCE(SUM(m.amount::numeric), 0) <> 0
      ORDER BY balance DESC
    `);

    const agenciesRes = await db.execute(sql`
      SELECT a.id,
             COALESCE(NULLIF(a.nombre_fantasia, ''), a.razon_social) AS name,
             COALESCE(SUM(m.amount::numeric), 0)                     AS balance,
             MAX(m.date::text)                                        AS last_movement
      FROM agencies a
      LEFT JOIN account_movements m ON m.entity_id = a.id AND m.entity_type = 'agency'
      WHERE a.is_active = 'true'
      GROUP BY a.id, a.nombre_fantasia, a.razon_social
      HAVING COALESCE(SUM(m.amount::numeric), 0) <> 0
      ORDER BY balance DESC
    `);

    const guestsRes = await db.execute(sql`
      SELECT g.id,
             g.last_name || ' ' || g.first_name AS name,
             SUM(m.amount::numeric)              AS balance,
             MAX(m.date::text)                   AS last_movement
      FROM account_movements m
      JOIN guests g ON g.id = m.entity_id
      WHERE m.entity_type = 'guest'
      GROUP BY g.id, g.last_name, g.first_name
      HAVING SUM(m.amount::numeric) <> 0
      ORDER BY balance DESC
    `);

    return {
      companies: (companiesRes.rows as any[]).map(r => ({ id: r.id, name: r.name, balance: parseFloat(r.balance), lastMovement: r.last_movement })),
      agencies:  (agenciesRes.rows as any[]).map(r => ({ id: r.id, name: r.name, balance: parseFloat(r.balance), lastMovement: r.last_movement })),
      guests:    (guestsRes.rows as any[]).map(r => ({ id: r.id, name: r.name, balance: parseFloat(r.balance), lastMovement: r.last_movement })),
    };
  }

  // ==================== MOTOR FINANCIERO — FOLIOS ====================

  private async generateFolioCodigo(entityType: FolioEntityType): Promise<string> {
    const prefixes: Record<FolioEntityType, string> = {
      reservation: "RS",
      restaurant_order: "OR",
      spa_account: "SP",
      group: "GR",
      event: "EV",
      company: "CO",
      agency: "AG",
    };
    const prefix = prefixes[entityType] ?? "FL";
    const [row] = await db.select({ cnt: sql<number>`count(*)` }).from(folios)
      .where(eq(folios.entityType, entityType));
    const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(6, "0");
    return `${prefix}-${seq}`;
  }

  async getOrCreateFolio(entityType: FolioEntityType, entityId: string): Promise<Folio> {
    const [existing] = await db.select().from(folios)
      .where(and(eq(folios.entityType, entityType), eq(folios.entityId, entityId)));
    if (existing) return existing;
    const codigo = await this.generateFolioCodigo(entityType);
    const [created] = await db.insert(folios).values({
      codigo,
      entityType,
      entityId,
      status: "open",
      totalCharges: "0",
      totalPayments: "0",
      balance: "0",
    }).returning();
    return created;
  }

  async getFolioByEntity(entityType: FolioEntityType, entityId: string): Promise<Folio | null> {
    const [row] = await db.select().from(folios)
      .where(and(eq(folios.entityType, entityType), eq(folios.entityId, entityId)));
    return row ?? null;
  }

  async getFolioById(id: string): Promise<Folio | null> {
    const [row] = await db.select().from(folios).where(eq(folios.id, id));
    return row ?? null;
  }

  async getFolioWithMovements(folioId: string): Promise<FolioWithMovements | null> {
    const folio = await this.getFolioById(folioId);
    if (!folio) return null;
    const movements = await db.select().from(folioMovements)
      .where(eq(folioMovements.folioId, folioId))
      .orderBy(asc(folioMovements.createdAt));
    return { ...folio, movements };
  }

  async getFolioWithMovementsByEntity(entityType: FolioEntityType, entityId: string): Promise<FolioWithMovements | null> {
    const folio = await this.getFolioByEntity(entityType, entityId);
    if (!folio) return null;
    return this.getFolioWithMovements(folio.id);
  }

  async recalcFolioBalance(folioId: string): Promise<Folio> {
    const chargeTypes: FolioMovementType[] = ["charge", "transfer_in"];
    const paymentTypes: FolioMovementType[] = ["payment", "advance", "discount", "transfer_out", "void"];
    const [chargesRow] = await db.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
      .from(folioMovements).where(and(
        eq(folioMovements.folioId, folioId),
        inArray(folioMovements.type, chargeTypes),
      ));
    const [paymentsRow] = await db.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
      .from(folioMovements).where(and(
        eq(folioMovements.folioId, folioId),
        inArray(folioMovements.type, paymentTypes),
      ));
    const totalCharges = parseFloat(chargesRow?.total ?? "0");
    const totalPayments = parseFloat(paymentsRow?.total ?? "0");
    const balance = totalCharges - totalPayments;
    const [updated] = await db.update(folios).set({
      totalCharges: totalCharges.toFixed(2),
      totalPayments: totalPayments.toFixed(2),
      balance: balance.toFixed(2),
    }).where(eq(folios.id, folioId)).returning();
    return updated;
  }

  async addFolioCharge(
    entityType: FolioEntityType,
    entityId: string,
    amount: number,
    description: string,
    sourceType?: string,
    sourceId?: string,
    registeredBy?: string,
  ): Promise<FolioMovement> {
    const folio = await this.getOrCreateFolio(entityType, entityId);

    // Deduplication guard: prevent duplicate movements on payment retry.
    // Primary key: (folioId, type, sourceType, sourceId, description) when both
    // sourceType and sourceId are present — sourceId is typically the upstream
    // record's own id (charge.id, item.id, etc.), and description breaks ties
    // for the few cases where multiple distinct movements share an entity-level
    // sourceId (e.g. room/early/late charges all reference the reservation id).
    // Fallback (no sourceId): (folioId, type, description, amount).
    const dupCondition = (sourceType != null && sourceId != null)
      ? and(
          eq(folioMovements.folioId, folio.id),
          eq(folioMovements.type, "charge"),
          eq(folioMovements.sourceType, sourceType),
          eq(folioMovements.sourceId, sourceId),
          eq(folioMovements.description, description),
        )
      : and(
          eq(folioMovements.folioId, folio.id),
          eq(folioMovements.type, "charge"),
          eq(folioMovements.description, description),
          eq(folioMovements.amount, amount.toFixed(2)),
        );
    const [existing] = await db.select().from(folioMovements).where(dupCondition).limit(1);
    if (existing) {
      console.warn(`[Folio] Duplicate charge skipped — folioId=${folio.id} description="${description}" amount=${amount} sourceType=${sourceType ?? "N/A"} sourceId=${sourceId ?? "N/A"}`);
      return existing;
    }

    const [movement] = await db.insert(folioMovements).values({
      folioId: folio.id,
      type: "charge",
      amount: amount.toFixed(2),
      description,
      sourceType: sourceType ?? null,
      sourceId: sourceId ?? null,
      registeredBy: registeredBy ?? null,
    }).returning();
    await this.recalcFolioBalance(folio.id);
    return movement;
  }

  async addFolioPayment(
    entityType: FolioEntityType,
    entityId: string,
    amount: number,
    description: string,
    paymentMethod: string,
    sourceType?: string,
    sourceId?: string,
    cashMovementId?: string,
    registeredBy?: string,
    receiptType?: string,
  ): Promise<FolioMovement> {
    const folio = await this.getOrCreateFolio(entityType, entityId);

    // Deduplication guard: prevent duplicate movements on payment retry.
    // Primary key: (folioId, type, sourceType, sourceId, description) when both
    // sourceType and sourceId are present — sourceId is typically the upstream
    // record's own id (payment.id, etc.), and description breaks ties for the
    // few cases where multiple distinct payments share an entity-level sourceId
    // (e.g. multi-split restaurant payments all reference the same order id).
    // Fallback (no sourceId): (folioId, type, description, amount).
    const dupCondition = (sourceType != null && sourceId != null)
      ? and(
          eq(folioMovements.folioId, folio.id),
          eq(folioMovements.type, "payment"),
          eq(folioMovements.sourceType, sourceType),
          eq(folioMovements.sourceId, sourceId),
          eq(folioMovements.description, description),
        )
      : and(
          eq(folioMovements.folioId, folio.id),
          eq(folioMovements.type, "payment"),
          eq(folioMovements.description, description),
          eq(folioMovements.amount, amount.toFixed(2)),
        );
    const [existing] = await db.select().from(folioMovements).where(dupCondition).limit(1);
    if (existing) {
      console.warn(`[Folio] Duplicate payment skipped — folioId=${folio.id} description="${description}" amount=${amount} sourceType=${sourceType ?? "N/A"} sourceId=${sourceId ?? "N/A"}`);
      return existing;
    }

    const [movement] = await db.insert(folioMovements).values({
      folioId: folio.id,
      type: "payment",
      amount: amount.toFixed(2),
      description,
      paymentMethod,
      sourceType: sourceType ?? null,
      sourceId: sourceId ?? null,
      cashMovementId: cashMovementId ?? null,
      registeredBy: registeredBy ?? null,
      receiptType: receiptType ?? null,
    }).returning();
    await this.recalcFolioBalance(folio.id);
    return movement;
  }

  async addFolioAdjustment(
    folioId: string,
    type: FolioMovementType,
    amount: number,
    description: string,
    registeredBy?: string,
    voidedMovementId?: string,
    voidReason?: string,
  ): Promise<FolioMovement> {
    // Deduplication guard: if this adjustment reverses a specific movement
    // (voidedMovementId is set), use that as the unique key so an NC retry
    // can't insert a second reversal for the same voided movement.
    // Fallback (no voidedMovementId): match on (folioId, type, description, amount).
    const dupCondition = voidedMovementId != null
      ? and(
          eq(folioMovements.folioId, folioId),
          eq(folioMovements.type, type),
          eq(folioMovements.voidedMovementId, voidedMovementId),
        )
      : and(
          eq(folioMovements.folioId, folioId),
          eq(folioMovements.type, type),
          eq(folioMovements.description, description),
          eq(folioMovements.amount, amount.toFixed(2)),
        );
    const [existing] = await db.select().from(folioMovements).where(dupCondition).limit(1);
    if (existing) {
      console.warn(`[Folio] Duplicate adjustment skipped — folioId=${folioId} type=${type} description="${description}" amount=${amount} voidedMovementId=${voidedMovementId ?? "N/A"}`);
      return existing;
    }

    const [movement] = await db.insert(folioMovements).values({
      folioId,
      type,
      amount: amount.toFixed(2),
      description,
      registeredBy: registeredBy ?? null,
      voidedMovementId: voidedMovementId ?? null,
      voidReason: voidReason ?? null,
    }).returning();
    await this.recalcFolioBalance(folioId);
    return movement;
  }

  // Remove folio_movements created from a since-deleted source record (e.g. a
  // charge line item removed before invoicing). Unlike addFolioAdjustment/void,
  // this is a hard delete: the source itself no longer exists, so there is
  // nothing to keep an audit trail of — leaving the movement in place is what
  // causes deleted items to keep appearing (and summing) in folio exports.
  async deleteFolioMovementsBySource(sourceType: string, sourceId: string): Promise<void> {
    const toDelete = await db.select().from(folioMovements).where(and(
      eq(folioMovements.sourceType, sourceType),
      eq(folioMovements.sourceId, sourceId),
    ));
    if (toDelete.length === 0) return;
    const folioIds = Array.from(new Set(toDelete.map(m => m.folioId)));
    await db.delete(folioMovements).where(and(
      eq(folioMovements.sourceType, sourceType),
      eq(folioMovements.sourceId, sourceId),
    ));
    for (const folioId of folioIds) {
      await this.recalcFolioBalance(folioId);
    }
  }

  // Keep a folio_movement's amount/description in sync when its source record
  // (e.g. a charge line item) is edited after being posted to the folio.
  async updateFolioMovementBySource(
    sourceType: string,
    sourceId: string,
    updates: { amount?: number; description?: string },
  ): Promise<void> {
    const [existing] = await db.select().from(folioMovements).where(and(
      eq(folioMovements.sourceType, sourceType),
      eq(folioMovements.sourceId, sourceId),
    )).limit(1);
    if (!existing) return;
    const set: Record<string, unknown> = {};
    if (updates.amount !== undefined) set.amount = updates.amount.toFixed(2);
    if (updates.description !== undefined) set.description = updates.description;
    if (Object.keys(set).length === 0) return;
    await db.update(folioMovements).set(set).where(eq(folioMovements.id, existing.id));
    await this.recalcFolioBalance(existing.folioId);
  }

  async closeFolio(folioId: string, closedBy: string): Promise<Folio> {
    const updated = await this.recalcFolioBalance(folioId);
    const [closed] = await db.update(folios).set({
      status: "closed",
      closedAt: new Date(),
      closedBy,
    }).where(eq(folios.id, folioId)).returning();
    return closed;
  }

  async listFolios(entityType?: FolioEntityType, status?: FolioStatus): Promise<Folio[]> {
    const conditions: any[] = [];
    if (entityType) conditions.push(eq(folios.entityType, entityType));
    if (status) conditions.push(eq(folios.status, status));
    return db.select().from(folios)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(folios.openedAt));
  }

  // ── Gift Vouchers ───────────────────────────────────────────────────────────

  async getGiftVouchers(filters?: { status?: string; area?: string; search?: string }): Promise<GiftVoucher[]> {
    const conditions: any[] = [];
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(giftVouchers.status, filters.status as any));
    }
    if (filters?.area && filters.area !== "all") {
      conditions.push(eq(giftVouchers.area, filters.area as any));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(giftVouchers.voucherCode, term),
          ilike(giftVouchers.buyerName, term),
          ilike(giftVouchers.beneficiaryName, term),
          ilike(giftVouchers.description, term),
        )
      );
    }
    return db.select().from(giftVouchers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(giftVouchers.issuedAt));
  }

  async getGiftVoucher(id: string): Promise<GiftVoucher | undefined> {
    const [v] = await db.select().from(giftVouchers).where(eq(giftVouchers.id, id));
    return v;
  }

  async getGiftVoucherByCode(code: string): Promise<GiftVoucher | undefined> {
    const [v] = await db.select().from(giftVouchers).where(eq(giftVouchers.voucherCode, code));
    return v;
  }

  async createGiftVoucher(data: InsertGiftVoucher): Promise<GiftVoucher> {
    const voucher: typeof giftVouchers.$inferInsert = {
      ...data,
      area: parseGiftVoucherArea(data.area),
      status: data.status === undefined ? undefined : parseGiftVoucherStatus(data.status),
      valueType: data.valueType === undefined ? undefined : parseGiftVoucherValueType(data.valueType),
    };
    const [v] = await db.insert(giftVouchers).values(voucher).returning();
    return v;
  }

  async updateGiftVoucher(id: string, data: Partial<InsertGiftVoucher>): Promise<GiftVoucher | undefined> {
    const { area, status, valueType, ...voucherData } = data;
    const voucher: Partial<typeof giftVouchers.$inferInsert> = {
      ...voucherData,
      ...(area === undefined ? {} : { area: parseGiftVoucherArea(area) }),
      ...(status === undefined ? {} : { status: parseGiftVoucherStatus(status) }),
      ...(valueType === undefined ? {} : { valueType: parseGiftVoucherValueType(valueType) }),
    };
    const [v] = await db.update(giftVouchers).set(voucher).where(eq(giftVouchers.id, id)).returning();
    return v;
  }

  async markGiftVoucherUsed(id: string, usedBy: string, usedNotes?: string): Promise<GiftVoucher | undefined> {
    const [v] = await db.update(giftVouchers).set({
      status: "usado",
      usedAt: new Date(),
      usedBy,
      usedNotes: usedNotes ?? null,
    }).where(eq(giftVouchers.id, id)).returning();
    return v;
  }

  async deleteGiftVoucher(id: string): Promise<boolean> {
    const result = await db.delete(giftVouchers).where(eq(giftVouchers.id, id)).returning();
    return result.length > 0;
  }

  async generateVoucherCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `VCHR-${year}-`;
    // Use MAX of the numeric suffix so gaps from deletions don't cause duplicate-key errors.
    const result = await db.execute(
      sql`SELECT COALESCE(MAX(CAST(RIGHT(voucher_code, 4) AS INTEGER)), 0)::text AS max_seq
          FROM gift_vouchers WHERE voucher_code LIKE ${prefix + '%'}`
    );
    const lastSeq = parseInt((result.rows[0] as any).max_seq ?? "0", 10);
    return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
  }

  // ── Toma de Inventario ────────────────────────────────────────────────────────

  async getInventoryCounts(): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT
        ic.*,
        COUNT(ici.id)::int                                                                   AS total_items,
        COUNT(CASE WHEN ici.actual_stock IS NOT NULL THEN 1 END)::int                        AS counted_items,
        COUNT(CASE WHEN ici.actual_stock IS NOT NULL
                    AND ABS(ici.actual_stock::numeric - ici.expected_stock::numeric) > 0.001
                   THEN 1 END)::int                                                          AS items_with_diff
      FROM inventory_counts ic
      LEFT JOIN inventory_count_items ici ON ic.id = ici.count_id
      GROUP BY ic.id
      ORDER BY ic.created_at DESC
    `);
    return rows.rows;
  }

  async createInventoryCount(data: { date: string; area?: string; notes?: string; createdBy?: string }): Promise<any> {
    const countResult = await db.execute(sql`
      INSERT INTO inventory_counts (date, area, notes, created_by)
      VALUES (${data.date}, ${data.area || null}, ${data.notes || null}, ${data.createdBy || null})
      RETURNING *
    `);
    const count = countResult.rows[0] as any;

    const itemsResult = data.area
      ? await db.execute(sql`
          SELECT ii.id, ii.name, ii.unit, ii.current_stock::numeric AS current_stock
          FROM inventory_items ii
          LEFT JOIN item_categories ic ON ii.category_id = ic.id
          WHERE ii.is_active = 'true' AND ic.area = ${data.area}
          ORDER BY ii.name ASC
        `)
      : await db.execute(sql`
          SELECT ii.id, ii.name, ii.unit, ii.current_stock::numeric AS current_stock
          FROM inventory_items ii
          WHERE ii.is_active = 'true'
          ORDER BY ii.name ASC
        `);

    for (const item of itemsResult.rows as any[]) {
      await db.execute(sql`
        INSERT INTO inventory_count_items (count_id, item_id, item_name, unit, expected_stock)
        VALUES (${count.id}, ${item.id}, ${item.name}, ${item.unit}, ${item.current_stock ?? 0})
      `);
    }
    return count;
  }

  async getInventoryCountWithItems(id: string): Promise<any | null> {
    const countResult = await db.execute(sql`SELECT * FROM inventory_counts WHERE id = ${id}`);
    if (!countResult.rows.length) return null;
    const count = countResult.rows[0] as any;

    const itemsResult = await db.execute(sql`
      SELECT ici.*, ii.sku, ii.cost_price::numeric AS cost_price
      FROM inventory_count_items ici
      LEFT JOIN inventory_items ii ON ici.item_id = ii.id
      WHERE ici.count_id = ${id}
      ORDER BY ici.item_name ASC
    `);
    return { ...count, items: itemsResult.rows };
  }

  async updateInventoryCountItem(countId: string, itemId: string, actualStock: number | null, notes?: string): Promise<void> {
    await db.execute(sql`
      UPDATE inventory_count_items
      SET actual_stock = ${actualStock}, notes = ${notes ?? null}
      WHERE count_id = ${countId} AND item_id = ${itemId}
    `);
  }

  async closeInventoryCount(id: string, closedBy: string): Promise<{ adjustments: number }> {
    const itemsResult = await db.execute(sql`
      SELECT * FROM inventory_count_items
      WHERE count_id = ${id} AND actual_stock IS NOT NULL
    `);

    let adjustments = 0;
    for (const item of itemsResult.rows as any[]) {
      const expected = parseFloat(item.expected_stock);
      const actual = parseFloat(item.actual_stock);
      const diff = actual - expected;
      if (Math.abs(diff) < 0.001) continue;

      const curResult = await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id = ${item.item_id}`);
      const current = parseFloat((curResult.rows[0] as any)?.current_stock ?? "0");
      const newStock = Math.max(0, current + diff);

      await db.execute(sql`
        INSERT INTO stock_movements (item_id, movement_type, quantity, previous_stock, new_stock, notes, created_at, created_by, source_type, source_id)
        VALUES (
          ${item.item_id}, 'ajuste', ${Math.abs(diff)}, ${current}, ${newStock},
          ${'Ajuste por toma de inventario'}, now(), ${closedBy}, 'inventory_count', ${id}
        )
      `);
      await db.execute(sql`UPDATE inventory_items SET current_stock = ${newStock} WHERE id = ${item.item_id}`);
      adjustments++;
    }

    await db.execute(sql`
      UPDATE inventory_counts SET status = 'cerrado', closed_at = now(), closed_by = ${closedBy}
      WHERE id = ${id}
    `);
    return { adjustments };
  }
}

export const storage = new DatabaseStorage();
