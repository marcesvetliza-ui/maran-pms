                WHERE id = ${invoice.id}
              `);
              notaCreditoGenerada = true;
            }
          } catch (e) { console.error("[anular-pago] nota-credito:", e); }
        }

        await audit(req, "update", "payments",
          `Pago anulado: $${pay.amount} (${pay.method}) — ${motivoAnulacion}`,
          { entityType: "payment", entityId: req.params.id }
        );

        // Flag in audit log when the payment had an AFIP invoice ref but no NC was generated
        if (pay.invoice_ref && !notaCreditoGenerada) {
          try {
            await audit(req, "update", "payments",
              `ALERTA FISCAL: pago anulado con factura electrónica vinculada sin Nota de Crédito — invoiceRef presente — ${motivoAnulacion}`,
              { entityType: "payment", entityId: req.params.id, details: { invoiceRef: pay.invoice_ref } }
            );
          } catch (e) { console.warn("[anular-pago] audit-fiscal-warning failed (non-fatal):", e); }
        }

        return res.json({ ...updated.rows[0], notaCreditoGenerada });
      }

      res.json(updated.rows[0]);
    } catch (e: any) {
      res.status(e?.statusCode || 500).json({ error: e.message });
    } finally {
      if (creditLockClient) {
        await creditLockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [creditLockKey]).catch(() => undefined);
        creditLockClient.release();
      }
    }
  });

  // Vincular resultado de factura electrónica a un pago/anticipo
  app.patch("/api/payments/:id/invoice", requireAuth, async (req, res) => {
    let creditLockClient: PoolClient | undefined;
    let creditLockKey = "";
    try {
      const { invoiceData } = req.body;
      if (!invoiceData) return res.status(400).json({ error: "invoiceData requerido" });
      const payResult = await db.execute(sql`SELECT id, reservation_id, invoice_ref, amount, status FROM payments WHERE id = ${req.params.id}`);
      if (!payResult.rows?.[0]) return res.status(404).json({ error: "Pago no encontrado" });
      const paymentBeforeLink = payResult.rows[0] as any;
      creditLockKey = `folio-invoice:${paymentBeforeLink.reservation_id}`;
      creditLockClient = await pool.connect();
      await creditLockClient.query("SELECT pg_advisory_lock(hashtext($1))", [creditLockKey]);
      await assertPaymentHasNoUnresolvedCreditHold(req.params.id);
      const lockedPaymentResult = await db.execute(sql`
        SELECT id, reservation_id, invoice_ref, amount, status FROM payments WHERE id = ${req.params.id}
      `);
      const lockedPayment = lockedPaymentResult.rows[0] as any;
      if (!lockedPayment) return res.status(404).json({ error: "Pago no encontrado" });
      if (!["active", null].includes(lockedPayment.status)) {
        return res.status(409).json({ error: "El pago no está activo" });
      }
      if (!Number.isInteger(Number(invoiceData.id)) || Number(invoiceData.id) <= 0) {
        return res.status(400).json({ error: "invoiceData.id requerido" });
      }
      const invoiceResult = await db.execute(sql`
        SELECT id, payment_id, reserva_id, estado, reconciliation_status,
               tipo_comprobante, punto_venta, numero, cae, cae_fecha_vto, monto_total
        FROM sales_invoices WHERE id = ${Number(invoiceData.id)} LIMIT 1
      `);
      const invoice = invoiceResult.rows[0] as any;
      if (!invoice || invoice.estado !== "emitida") {
        return res.status(409).json({ error: "La factura todavía no está autorizada" });
      }
      if (String(invoice.reserva_id || "") !== String(lockedPayment.reservation_id || "")) {
        return res.status(409).json({ error: "La factura no pertenece a la reserva de este pago" });
      }
      // New flows must carry the pre-ARCA claim.  A legacy invoice is accepted
      // only when it belongs to the same reservation and is not already named
      // by another payment's persisted reference.
      if (!invoice.payment_id) {
        const claimedElsewhere = await db.execute(sql`
          SELECT 1 FROM payments
          WHERE id <> ${req.params.id}
            AND invoice_ref IS NOT NULL
            AND invoice_ref::jsonb ->> 'id' = ${String(invoiceData.id)}
          LIMIT 1
        `);
        if (claimedElsewhere.rows.length) return res.status(409).json({ error: "La factura ya está vinculada a otro pago" });
      }
      const canonicalRef = canonicalInvoiceReference(invoice);
      let priorReapplications: any[] = [];
      let previousRef: any = null;
      try {
        previousRef = typeof lockedPayment.invoice_ref === "string"
          ? JSON.parse(lockedPayment.invoice_ref)
          : lockedPayment.invoice_ref;
        if (previousRef) assertSameOriginalInvoice(previousRef, canonicalRef);
        priorReapplications = Array.isArray(previousRef?.reapplications)
          ? previousRef.reapplications
          : [];
      } catch {
        throw Object.assign(new Error("El vínculo fiscal existente del pago no es válido"), { statusCode: 409 });
      }
      const preservedRef = priorReapplications.length
        ? { ...canonicalRef, reapplications: priorReapplications }
        : canonicalRef;
      const alreadyLinkedToTarget = Number(previousRef?.id) === Number(invoice.id);
      if (!alreadyLinkedToTarget) {
        const applied = await db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS total
          FROM payments
          WHERE reservation_id = ${lockedPayment.reservation_id}
            AND id <> ${req.params.id}
            AND (status IS NULL OR status = 'active')
            AND invoice_ref IS NOT NULL
            AND invoice_ref::jsonb ->> 'id' = ${String(invoice.id)}
        `);
        const aggregate = Number((applied.rows[0] as any)?.total || 0) + Number(lockedPayment.amount || 0);
        if (aggregate > Number(invoice.monto_total || 0) + 0.009) {
          return res.status(409).json({ error: "Los pagos aplicados superan el total del comprobante" });
        }
      }
      const updated = await db.execute(sql`
        UPDATE payments
        SET invoice_ref = ${JSON.stringify(preservedRef)},
            invoice_link_failed = false
        WHERE id = ${req.params.id} RETURNING *
      `);
      const updatedPay = updated.rows[0] as any;
      if (invoice.payment_id && invoice.reconciliation_status === "pendiente") {
        await db.execute(sql`
          UPDATE sales_invoices
          SET reconciliation_status = 'conciliada', reconciliation_error = NULL, reconciliation_updated_at = now()
          WHERE id = ${Number(invoiceData.id)}
        `);
      }
      // Propagate invoice_ref to the associated group_payment when this payment was created
      // as part of a group payment distribution. Uses the deterministic group_payment_id FK
      // set at payment creation time — no heuristic matching.
      if (updatedPay?.group_payment_id) {
        try {
          await db.execute(sql`
            UPDATE group_payments
            SET invoice_ref = ${JSON.stringify(canonicalRef)}
            WHERE id = ${updatedPay.group_payment_id}
          `);
        } catch (propagateErr) {
          console.error("[invoice-link] Failed to propagate invoice_ref to group_payment:", propagateErr);
        }
      }
      res.json(updatedPay);
    } catch (e: any) {
      res.status(e?.statusCode || 500).json({ error: e.message });
    } finally {
      if (creditLockClient) {
        await creditLockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [creditLockKey]).catch(() => undefined);
        creditLockClient.release();
      }
    }
  });

  app.post("/api/payments/:id/resume-invoice", requireAuth, async (req, res) => {
    let lockClient: any = null;
    let lockKey = "";
    try {
      const owner = await db.execute(sql`SELECT reservation_id FROM payments WHERE id = ${req.params.id} LIMIT 1`);
      const reservationId = String((owner.rows[0] as any)?.reservation_id || "");
      if (!reservationId) return res.status(404).json({ error: "Pago no encontrado" });
      lockKey = `folio-invoice:${reservationId}`;
      lockClient = await pool.connect();
      await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
      // Re-read under the exact folio lock used by issuance. Concurrent resume
      // requests serialize, and waiters return the already finalized invoice.
      const result = await db.execute(sql`
        SELECT si.* FROM sales_invoices si
        JOIN payments p ON p.id = si.payment_id
        WHERE si.payment_id = ${req.params.id}
          AND p.reservation_id = si.reserva_id
        LIMIT 1
      `);
      const draft = result.rows[0] as any;
      if (!draft) return res.status(404).json({ error: "No hay una autorización pendiente para este pago" });
      const alreadyResumed = draft.estado === "emitida";
      if (draft.estado !== "autorizacion_pendiente") {
        if (!alreadyResumed) {
          return res.status(409).json({ error: "El comprobante ya no está disponible para reanudar" });
        }
      }
      const invoice = alreadyResumed ? draft : await emitirFactura({
        tipoComprobante: draft.tipo_comprobante,
        cliente: { razonSocial: draft.cliente_razon_social, cuit: draft.cliente_cuit || undefined, dni: draft.cliente_dni || undefined, condicionIva: draft.cliente_condicion_iva, domicilio: draft.cliente_domicilio || undefined },
        items: draft.items,
        reservaId: draft.reserva_id || undefined,
        paymentId: req.params.id,
        puntoVentaOverride: Number(draft.punto_venta),
        cashFormaPago: draft.cash_forma_pago || undefined,
        sourceChargeIds: Array.isArray(draft.source_charge_ids) ? draft.source_charge_ids : undefined,
        sourceChargeAmounts: draft.source_charge_amounts || undefined,
        observaciones: draft.observaciones || undefined,
        recoveryInvoiceId: Number(draft.id),
      } as any);
      // Linking is part of recovery, not a second browser best-effort step.
      // These idempotent updates stay inside the folio advisory lock and do
      // not create payments, allocations, Caja, or Cuenta Corriente effects.
      const recoveryState = canonicalPaymentLinkState(invoice as any);
      const canonicalRef = recoveryState.invoice;
      const linked = await db.transaction(async (tx) => {
        const paymentResult = await tx.execute(sql`
          UPDATE payments
          SET invoice_ref = ${recoveryState.invoiceRef}, invoice_link_failed = ${recoveryState.invoiceLinkFailed}
          WHERE id = ${req.params.id}
            AND reservation_id = ${reservationId}
          RETURNING *
        `);
        const payment = paymentResult.rows[0] as any;
        if (!payment) throw Object.assign(new Error("Pago no encontrado"), { statusCode: 404 });
        await tx.execute(sql`
          UPDATE sales_invoices
          SET reconciliation_status = ${recoveryState.reconciliationStatus},
              reconciliation_error = ${recoveryState.reconciliationError},
              reconciliation_updated_at = now()
          WHERE id = ${Number((invoice as any).id)} AND payment_id = ${req.params.id}
        `);
        if (payment.group_payment_id) {
          await tx.execute(sql`
            UPDATE group_payments
            SET invoice_ref = ${JSON.stringify(canonicalRef)}
            WHERE id = ${payment.group_payment_id}
          `);
        }
        return payment;
      });
      res.json({ invoice: canonicalRef, payment: linked, linked: true, alreadyResumed });
    } catch (e: any) {
      res.status(e?.statusCode || 500).json({ error: e?.message || "No se pudo reanudar la autorización ARCA" });
    } finally {
      if (lockClient) {
        await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
        lockClient.release();
      }
    }
  });

  // Reutilizar el importe liberado por una NC sin reemplazar el comprobante
  // original del pago. The nested allocation is idempotent by invoice id.
  app.patch("/api/payments/:id/invoice-reapplication", requireAuth, async (req, res) => {
    try {
      return res.status(410).json({
        error: "Endpoint obsoleto. Reaplicá el crédito mediante la confirmación de la factura.",
      });
      /*
      const { invoiceData } = req.body;
      const amount = Number(req.body.amount);
      if (!invoiceData?.id || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "invoiceData y amount positivo requeridos" });
      }
      const paymentResult = await db.execute(sql`
        SELECT * FROM payments
        WHERE id = ${req.params.id}
        FOR UPDATE
      `);
      const payment = paymentResult.rows?.[0] as any;
      if (!payment) return res.status(404).json({ error: "Pago no encontrado" });
      if (payment.status === "anulado") return res.status(409).json({ error: "El pago está anulado" });
      if (["cuenta_corriente", "current_account"].includes(String(payment.method))) {
        return res.status(409).json({ error: "Cuenta Corriente no puede reaplicarse como crédito" });
      }
      const targetResult = await db.execute(sql`
        SELECT id, reserva_id, tipo_comprobante, monto_total, monto_acreditado, estado
        FROM sales_invoices WHERE id = ${Number(invoiceData.id)}
        FOR UPDATE
      `);
      const target = targetResult.rows?.[0] as any;
      if (!target) return res.status(404).json({ error: "Factura destino no encontrada" });
      if (String(target.reserva_id) !== String(payment.reservation_id)) {
        return res.status(403).json({ error: "La factura destino no pertenece a la reserva del pago" });
      }
      if (!["FA", "FB", "FC", "FT", "FM"].includes(String(target.tipo_comprobante)) ||
        !["emitida", "parcial"].includes(String(target.estado))) {
        return res.status(409).json({ error: "La factura destino no está activa para reaplicación" });
      }
      const entry = {
        invoiceId: target.id,
        tipoComprobante: target.tipo_comprobante,
        amount: Number(amount.toFixed(2)),
      };
      if (!payment.invoice_ref) {
        return res.status(409).json({ error: "El pago no tiene un comprobante original para conservar" });
      }
      const originalRef = JSON.parse(payment.invoice_ref);
      const previousReapplications = Array.isArray(originalRef.reapplications)
        ? originalRef.reapplications
        : [];
      if (previousReapplications.some((item: any) =>
        Number(item?.invoiceId ?? item?.id) === Number(invoiceData.id))) {
        return res.json(payment);
      }
      const invoiceIds = [
        Number(originalRef.id),
        ...previousReapplications.map((item: any) => Number(item?.invoiceId ?? item?.id)),
      ].filter((id) => Number.isInteger(id) && id > 0);
      if (invoiceIds.length === 0) {
        return res.status(409).json({ error: "No se pudo identificar el comprobante original del pago" });
      }
      const invoiceResult = await db.execute(sql`
        SELECT id, tipo_comprobante, punto_venta, numero, monto_total, monto_acreditado, estado
        FROM sales_invoices
        WHERE id = ANY(${invoiceIds}::int[])
      `);
      const available = getAvailableReservationAdvancePayments(
        [payment],
        invoiceResult.rows as any[],
      )[0]?.availableAdvanceAmount || 0;
      if (amount > available + 0.009) {
        return res.status(409).json({
          error: `El pago sólo tiene $${available.toFixed(2)} disponible para reaplicar`,
        });
      }
      const updated = await db.execute(sql`
        UPDATE payments
        SET invoice_ref = jsonb_set(
          invoice_ref::jsonb,
          '{reapplications}',
          COALESCE(invoice_ref::jsonb->'reapplications', '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb
        )::text
        WHERE id = ${req.params.id}
          AND invoice_ref IS NOT NULL
          AND NOT COALESCE(invoice_ref::jsonb->'reapplications', '[]'::jsonb)
            @> ${JSON.stringify([{ invoiceId: invoiceData.id }])}::jsonb
        RETURNING *
      `);
      if (updated.rows?.[0]) return res.json(updated.rows[0]);
      // A concurrent retry may have committed the same target between the
      // idempotency check and UPDATE. It is already the desired state.
      const retry = await db.execute(sql`SELECT * FROM payments WHERE id = ${req.params.id}`);
      const retryRef = retry.rows?.[0] as any;
      const retryApps = retryRef?.invoice_ref ? JSON.parse(retryRef.invoice_ref).reapplications : [];
      if (retryApps.some((item: any) => Number(item?.invoiceId) === Number(target.id))) {
        return res.json(retryRef);
      }
      return res.status(409).json({ error: "No se pudo registrar la reaplicación del pago" });
      */
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Marcar vínculo de factura como fallido (y guardar datos de la factura para reintento posterior)
  app.patch("/api/payments/:id/invoice-link-failed", requireAuth, async (req, res) => {
    let creditLockClient: PoolClient | undefined;
    let creditLockKey = "";
    try {
      const { invoiceData } = req.body;
      const payResult = await db.execute(sql`SELECT id, reservation_id FROM payments WHERE id = ${req.params.id}`);
      if (!payResult.rows?.[0]) return res.status(404).json({ error: "Pago no encontrado" });
      creditLockKey = `folio-invoice:${String((payResult.rows[0] as any).reservation_id)}`;
      creditLockClient = await pool.connect();
      await creditLockClient.query("SELECT pg_advisory_lock(hashtext($1))", [creditLockKey]);
      await assertPaymentHasNoUnresolvedCreditHold(req.params.id);
      const lockedPaymentResult = await db.execute(sql`
        SELECT invoice_ref FROM payments WHERE id = ${req.params.id}
      `);
      const lockedInvoiceRef = (lockedPaymentResult.rows[0] as any)?.invoice_ref;
      let preservedInvoiceData = invoiceData;
      if (invoiceData && lockedInvoiceRef) {
        try {
          const previousRef = typeof lockedInvoiceRef === "string"
            ? JSON.parse(lockedInvoiceRef)
            : lockedInvoiceRef;
          assertSameOriginalInvoice(previousRef, invoiceData);
          preservedInvoiceData = {
            ...previousRef,
            ...invoiceData,
            id: previousRef.id,
            tipoComprobante: previousRef.tipoComprobante ?? previousRef.tipo_comprobante,
            puntoVenta: previousRef.puntoVenta ?? previousRef.punto_venta,
            numero: previousRef.numero,
            ...(Array.isArray(previousRef?.reapplications)
              ? { reapplications: previousRef.reapplications }
              : {}),
          };
        } catch {
          throw Object.assign(new Error("El vínculo fiscal existente del pago no es válido"), { statusCode: 409 });
        }
      }
      // Store invoice data (so the re-link action can use it later) and mark as failed
      const updated = await db.execute(sql`
        UPDATE payments
        SET invoice_link_failed = true
            ${preservedInvoiceData ? sql`, invoice_ref = ${JSON.stringify(preservedInvoiceData)}` : sql``}
        WHERE id = ${req.params.id} RETURNING *
      `);
      res.json(updated.rows[0]);
    } catch (e: any) {
      res.status(e?.statusCode || 500).json({ error: e.message });
    } finally {
      if (creditLockClient) {
        await creditLockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [creditLockKey]).catch(() => undefined);
        creditLockClient.release();
      }
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/payments/${req.params.id} — usar PATCH /anular`);
    let creditLockClient: PoolClient | undefined;
    let creditLockKey = "";
    try {
      const payResult = await db.execute(sql`SELECT reservation_id FROM payments WHERE id = ${req.params.id}`);
      const payRow = payResult.rows?.[0] as any;
      if (payRow?.reservation_id) {
        creditLockKey = `folio-invoice:${payRow.reservation_id}`;
        creditLockClient = await pool.connect();
        await creditLockClient.query("SELECT pg_advisory_lock(hashtext($1))", [creditLockKey]);
        await assertPaymentHasNoUnresolvedCreditHold(req.params.id);
        const reservation = await storage.getReservation(payRow.reservation_id);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede eliminar pagos de una reserva cerrada de días anteriores" });
        }
      }
      const deleted = await storage.deletePayment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Payment not found" });
      }
      res.status(204).send();
    } catch (error) {
      const statusCode = (error as any)?.statusCode || 500;
      res.status(statusCode).json({ error: (error as Error)?.message || "Error deleting payment" });
    } finally {
      if (creditLockClient) {
        await creditLockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [creditLockKey]).catch(() => undefined);
        creditLockClient.release();
      }
    }
  });

  // ── Companions ──────────────────────────────────────────────────────────
  app.get("/api/reservations/:id/companions", requireAuth, async (req, res) => {
    try {
      const companions = await storage.getReservationCompanions(req.params.id);
      res.json(companions);
    } catch {
      res.status(500).json({ error: "Error fetching companions" });
    }
  });

  app.post("/api/reservations/:id/companions", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body, reservationId: req.params.id };
      if (!body.dateOfBirth) delete body.dateOfBirth;
      const parsed = insertReservationCompanionSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const companion = await storage.addReservationCompanion(parsed.data);
      res.status(201).json(companion);
    } catch {
      res.status(500).json({ error: "Error adding companion" });
    }
  });

  app.patch("/api/reservations/:id/companions/:companionId", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (!body.dateOfBirth) delete body.dateOfBirth;
      const updated = await storage.updateReservationCompanion(req.params.companionId, body);
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Error updating companion" });
    }
  });

  app.delete("/api/reservations/:id/companions/:companionId", requireAuth, async (req, res) => {
    try {
      await storage.deleteReservationCompanion(req.params.companionId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Error deleting companion" });
    }
  });

  // Promote companion → create a guest profile and link it via guestId
  app.post("/api/reservations/:id/companions/:companionId/promote", requireAuth, async (req, res) => {
    try {
      const [companion] = await db.select().from(reservationCompanions).where(eq(reservationCompanions.id, req.params.companionId));
      if (!companion) return res.status(404).json({ error: "Acompañante no encontrado" });
      if (companion.guestId) return res.status(400).json({ error: "El acompañante ya tiene perfil vinculado" });

      const docType = companion.documentType?.toLowerCase();
      const normalized = ["dni","cuit","cuil","passport","cedula","lc","le","other"].includes(docType || "") ? docType : "dni";

      const [newGuest] = await db.insert(guests).values({
        firstName: companion.firstName,
        lastName: companion.lastName,
        documentType: normalized || "dni",
        documentNumber: companion.documentNumber || "",
        nationality: companion.nationality || "Argentina",
        dateOfBirth: companion.dateOfBirth || null,
        segment: "LEISURE",
        vatCondition: "consumidor_final",
        condicionVentaPredeterminada: "contado",
      } as any).returning();

      const [updated] = await db.update(reservationCompanions)
        .set({ guestId: newGuest.id })
        .where(eq(reservationCompanions.id, req.params.companionId))
        .returning();

      res.json({ companion: updated, guest: newGuest });
    } catch (e: any) {
      res.status(500).json({ error: "Error al crear perfil: " + e.message });
    }
  });

}

// Helper: genera alertas de hospitalidad inmediatamente para reservas con check-in el mismo día
async function generateSameDayHospitalityAlerts(
  reservationId: string,
  guestId: string,
  roomId: string | null
) {
  const areaMap: Record<string, string[]> = {
    alimentacion: ["restaurant", "reception"],
    habitacion: ["housekeeping", "reception"],
    amenities: ["housekeeping"],
    servicio: ["reception"],
    fecha_especial: ["reception"],
    motivo_viaje: ["reception"],
    nota_interna: ["reception"],
    otro: ["reception"],
  };

  const activePrefs = await db
    .select()
    .from(guestPreferences)
    .where(and(eq(guestPreferences.guestId, guestId), eq(guestPreferences.isActive, true)));

  if (activePrefs.length === 0) return;

  // Obtener número de habitación si existe
  let roomNumber: string | null = null;
  if (roomId) {
    const [room] = await db.select({ roomNumber: rooms.roomNumber }).from(rooms).where(eq(rooms.id, roomId));
    roomNumber = room?.roomNumber ?? null;
  }

  // Evitar duplicados para esta reserva
  const existingAlerts = await db
    .select({ preferenceId: hospitalityAlerts.preferenceId })
    .from(hospitalityAlerts)
    .where(eq(hospitalityAlerts.reservationId, reservationId));
  const existingPrefIds = new Set(existingAlerts.map((a) => a.preferenceId));

  const roomLabel = roomNumber ? ` — Hab. ${roomNumber}` : "";

  for (const pref of activePrefs) {
    if (existingPrefIds.has(pref.id)) continue;
    const targetAreas = areaMap[pref.category] || ["reception"];
    for (const area of targetAreas) {
      await db.insert(hospitalityAlerts).values({
        id: randomUUID(),
        reservationId,
        guestId,
        preferenceId: pref.id,
        alertMessage: `[Llegada hoy${roomLabel}] ${pref.title}: ${pref.description || pref.title}`,
        targetArea: area,
        priority: pref.priority as any,
        status: "pending",
        isAcknowledged: false,
        createdAt: new Date(),
      });
    }
    existingPrefIds.add(pref.id);
  }
  console.log(`[hospitality] ${activePrefs.length} preferencias → alertas de llegada hoy generadas para reserva ${reservationId}`);
}

// ─── GET /api/reservations/:id/confirmation-pdf ───────────────────────────────
// Generates a downloadable PDF confirmation for a reservation
async function handleConfirmationPdf(req: any, res: any) {
  try {
    const [reservation] = await db.select().from(reservations).where(eq(reservations.id, req.params.id));
    if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });

    const [guest] = reservation.guestId
      ? await db.select().from(guests).where(eq(guests.id, reservation.guestId))
      : [null];
    const [room] = reservation.roomId
      ? await db.select().from(rooms).where(eq(rooms.id, reservation.roomId))
      : [null];
    const [roomType] = room?.roomTypeId
      ? await db.select().from(roomTypes).where(eq(roomTypes.id, room.roomTypeId))
      : [null];

    const guestName = guest
      ? `${guest.lastName?.toUpperCase() || ""} ${guest.firstName || ""}`.trim()
      : "Huésped";
    const nights = nightCount(reservation.checkInDate, reservation.checkOutDate);
    const totalAlojamiento = parseFloat(reservation.totalRoomAmount || "0");
    const ratePerNight = parseFloat(String(reservation.finalRatePerNight || 0));
    const packageName = extractPackageName(reservation.notes);
    const activeCharges = await storage.getCharges(reservation.id);
    const totalAdicionales = activeCharges.reduce((sum, charge) => sum + parseFloat(String(charge.amount || 0)), 0);
    const totalReserva = totalAlojamiento + totalAdicionales;
    const additionalDetails = activeCharges
      .map(charge => `${charge.description} — ${fmtMoneyPdf(charge.amount)}`)
      .join("  ·  ");

    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const filename = `Confirmacion-${reservation.reservationCode || reservation.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageW = 595;
    const pageH = 842;
    const margin = 40;
    const contentW = pageW - margin * 2; // 515
    const NAVY    = "#1a3a6c";
    const ORANGE  = "#e8841a";
    const FOOTER_BG = "#8b4513";

    // ── FULL PAGE TEMPLATE BACKGROUND ─────────────────────────────────────
    // The template image includes the skyline header, orange stripe, white content
    // area, and footer with the white Maran logo. We use it as a full-page background
    // so all branding elements appear correctly without needing to draw them manually.
    const headerH = 165;
    const headerImgPath = assetPath("confirmacion-header.jpg");
    if (fs.existsSync(headerImgPath)) {
      doc.image(headerImgPath, 0, 0, { width: pageW, height: pageH });
    } else {
      doc.rect(0, 0, pageW, headerH).fill(NAVY);
      doc.rect(0, headerH - 6, pageW, 6).fill(ORANGE);
      doc.rect(0, pageH - 90, pageW, 90).fill(FOOTER_BG);
    }

    let y = headerH + 16;

    // ── TITLE ROW ─────────────────────────────────────────────────────────
    // Left: label + hotel name + subtitle
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
      .text("CONFIRMACIÓN DE RESERVA", margin, y, { characterSpacing: 2 });
    y += 11;
    doc.fillColor("#1a1a1a").fontSize(17).font("Helvetica-Bold")
      .text(HOTEL_NAME, margin, y, { width: 300 });
    y += 22;
    doc.fillColor("#666666").fontSize(8.5).font("Helvetica")
      .text("Hotel & Spa · Paraná, Entre Ríos", margin, y);

    // Right: reservation code box (includes status badge inside)
    const codeBoxW = 138;
    const codeBoxX = pageW - margin - codeBoxW;
    const codeBoxY = headerH + 16;
    doc.roundedRect(codeBoxX, codeBoxY, codeBoxW, 60, 5)
      .fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
      .text("N° DE RESERVA", codeBoxX, codeBoxY + 7, { width: codeBoxW, align: "center", characterSpacing: 0.5 });
    doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
      .text(reservation.reservationCode || reservation.id, codeBoxX, codeBoxY + 18, { width: codeBoxW, align: "center" });
    // Status badge — inside the box
    const badgeX = codeBoxX + 20;
    const badgeW = codeBoxW - 40;
    doc.roundedRect(badgeX, codeBoxY + 33, badgeW, 13, 6)
      .fillAndStroke("#e8f5e9", "#a5d6a7");
    doc.fillColor("#2e7d32").fontSize(6.5).font("Helvetica-Bold")
      .text("CONFIRMADA", badgeX, codeBoxY + 36, { width: badgeW, align: "center", characterSpacing: 0.5 });
    doc.fillColor("#aaaaaa").fontSize(7).font("Helvetica")
      .text(`Emitida: ${formatArgentinaDate(new Date())}`, codeBoxX, codeBoxY + 49, { width: codeBoxW, align: "center" });

    y += 20;

    // ── SEPARATOR (stops before the code box) ─────────────────────────────
    doc.moveTo(margin, y).lineTo(codeBoxX - 10, y)
      .strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 12;

    // ── DATES GRID (5 cells) ──────────────────────────────────────────────
    const gridH = 46;
    const cellW = contentW / 5;
    const gridCells = [
      { label: "CHECK-IN",   value: fmtDatePdf(reservation.checkInDate) },
      { label: "CHECK-OUT",  value: fmtDatePdf(reservation.checkOutDate) },
      { label: "NOCHES",     value: String(nights) },
      { label: "HABITACIÓN", value: room?.roomNumber || "—" },
      { label: "HUÉSPEDES",  value: String(reservation.numberOfGuests || 1) },
    ];
    doc.roundedRect(margin, y, contentW, gridH, 6)
      .fillAndStroke("#ffffff", "#dddddd");
    gridCells.forEach((cell, i) => {
      const cx = margin + i * cellW;
      if (i > 0) {
        doc.moveTo(cx, y + 7).lineTo(cx, y + gridH - 7)
          .strokeColor("#dddddd").lineWidth(0.5).stroke();
      }
      doc.fillColor("#999999").fontSize(7).font("Helvetica-Bold")
        .text(cell.label, cx + 4, y + 9, { width: cellW - 8, align: "center", characterSpacing: 0.3 });
      doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold")
        .text(cell.value, cx + 4, y + 24, { width: cellW - 8, align: "center" });
    });
    y += gridH + 12;

    // ── TWO COLUMNS: GUEST + ROOM ─────────────────────────────────────────
    const colGap = 12;
    const colW = (contentW - colGap) / 2;
    const col2X = margin + colW + colGap;
    const boxH = 90;

    const drawColBox = (bx: number, by: number, bw: number, bh: number, title: string) => {
      doc.roundedRect(bx, by, bw, bh, 6).fillAndStroke("#f8f9fa", "#eeeeee");
      doc.fillColor("#888888").fontSize(7).font("Helvetica-Bold")
        .text(title, bx + 12, by + 10, { characterSpacing: 1 });
      doc.moveTo(bx + 12, by + 21).lineTo(bx + 12 + title.length * 5.2, by + 21)
        .strokeColor(ORANGE).lineWidth(2).stroke();
    };

    // Guest box
    drawColBox(margin, y, colW, boxH, "HUÉSPED PRINCIPAL");
    doc.fillColor("#111111").fontSize(12).font("Helvetica-Bold")
      .text(guestName, margin + 12, y + 27, { width: colW - 24 });
    let guestInfoY = y + 43;
    if (guest?.documentNumber) {
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(`DNI: ${guest.documentNumber}`, margin + 12, guestInfoY);
      guestInfoY += 12;
    }
    if (guest?.email) {
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(guest.email, margin + 12, guestInfoY, { width: colW - 24 });
      guestInfoY += 12;
    }
    if (guest?.phone) {
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(guest.phone, margin + 12, guestInfoY, { width: colW - 24 });
    }

    // Room box
    drawColBox(col2X, y, colW, boxH, "TIPO DE HABITACIÓN");
    doc.fillColor("#111111").fontSize(12).font("Helvetica-Bold")
      .text(roomType?.name || room?.roomNumber || "—", col2X + 12, y + 27, { width: colW - 24 });

    // Rate per night
    doc.fillColor("#555555").fontSize(9).font("Helvetica")
      .text("Tarifa por noche", col2X + 12, y + 50);
    doc.fillColor("#333333").fontSize(9).font("Helvetica-Bold")
      .text(fmtMoneyPdf(ratePerNight), col2X + 12, y + 50, { width: colW - 24, align: "right" });

    // Divider + total
    doc.moveTo(col2X + 12, y + 64).lineTo(col2X + colW - 12, y + 64)
      .strokeColor("#dddddd").lineWidth(0.5).stroke();
    doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold")
      .text(`Total (${nights} noche${nights !== 1 ? "s" : ""})`, col2X + 12, y + 68);
    doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold")
      .text(fmtMoneyPdf(totalAlojamiento), col2X + 12, y + 68, { width: colW - 24, align: "right" });

    // Early / Late extras
    const extras: string[] = [];
    if (reservation.earlyCheckIn && reservation.earlyCheckInTime)
      extras.push(`Early Check-in ${reservation.earlyCheckInTime} hs (+${fmtMoneyPdf(reservation.earlyCheckInCharge)})`);
    if (reservation.lateCheckOut && reservation.lateCheckOutTime)
      extras.push(`Late Check-out ${reservation.lateCheckOutTime} hs (+${fmtMoneyPdf(reservation.lateCheckOutCharge)})`);
    if (extras.length > 0) {
      doc.fillColor("#888888").fontSize(7.5).font("Helvetica")
        .text(extras.join("  ·  "), col2X + 12, y + 81, { width: colW - 24 });
    }

    y += boxH + 12;

    // ── RESERVATION DETAILS / EXTRAS ────────────────────────────────────────
    // Keep reservation-specific information separate from the general terms.
    // The two-column layout keeps this block short even when the reservation
    // has several extras, helping the confirmation remain on one page.
    if (packageName || activeCharges.length > 0) {
      const detailLeft = [
        packageName ? `Paquete: ${packageName}` : null,
        additionalDetails ? `Adicionales: ${additionalDetails}` : null,
      ].filter(Boolean).join("\n");
      const detailsLeftW = contentW * 0.62;
      const detailTextH = doc.heightOfString(detailLeft, { width: detailsLeftW - 24 });
      const detailBodyH = Math.max(44, detailTextH + 14);
      const detailHeaderH = 20;
      const detailBoxH = detailHeaderH + detailBodyH;

      doc.roundedRect(margin, y, contentW, detailBoxH, 6)
        .fillAndStroke("#f5f8fb", "#dfe5eb");
      doc.roundedRect(margin, y, contentW, detailHeaderH, 6).fill("#eaf0f6");
      doc.rect(margin, y + 10, contentW, 10).fill("#eaf0f6");
      doc.fillColor(NAVY).fontSize(7.5).font("Helvetica-Bold")
        .text("DETALLE DE LA RESERVA", margin + 12, y + 7, { characterSpacing: 1.2 });

      const detailsY = y + detailHeaderH + 7;
      if (detailLeft) {
        doc.fillColor("#444444").fontSize(8.5).font("Helvetica")
          .text(detailLeft, margin + 12, detailsY, { width: detailsLeftW - 24, lineGap: 2 });
      }

      const totalsX = margin + detailsLeftW;
      const totalsW = contentW - detailsLeftW;
      doc.fillColor("#666666").fontSize(7.5).font("Helvetica")
        .text("Total alojamiento", totalsX, detailsY, { width: totalsW - 12 });
      doc.fillColor("#444444").fontSize(8).font("Helvetica-Bold")
        .text(fmtMoneyPdf(totalAlojamiento), totalsX, detailsY, { width: totalsW - 12, align: "right" });
      doc.fillColor("#666666").fontSize(7.5).font("Helvetica")
        .text("Total adicionales", totalsX, detailsY + 12, { width: totalsW - 12 });
      doc.fillColor("#444444").fontSize(8).font("Helvetica-Bold")
        .text(fmtMoneyPdf(totalAdicionales), totalsX, detailsY + 12, { width: totalsW - 12, align: "right" });
      doc.moveTo(totalsX, detailsY + 25).lineTo(margin + contentW - 12, detailsY + 25)
        .strokeColor("#d5dde5").lineWidth(0.5).stroke();
      doc.fillColor(NAVY).fontSize(8.5).font("Helvetica-Bold")
        .text("TOTAL A PAGAR", totalsX, detailsY + 29, { width: totalsW - 12 });
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold")
        .text(fmtMoneyPdf(totalReserva), totalsX, detailsY + 28, { width: totalsW - 12, align: "right" });

      y += detailBoxH + 10;
    }

    // ── TÉRMINOS Y CONDICIONES ────────────────────────────────────────────
    const DEFAULT_TERMINOS = [
      "La tarifa incluye desayuno buffet y gimnasio con turno previo.",
      "La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.",
      "Nuestro horario de Check-in es a partir de las 15:00 hs y el Check-out es hasta las 10:00 hs.",
      "Early Check-in o Late Check-out tienen costo adicional del 50% del valor de una noche.",
      "Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI / PASAPORTE / CÉDULA DE IDENTIDAD. En el caso de viajar con menores de edad deberá presentar su correspondiente identificación.",
      "La entrega de la habitación queda condicionada al pago total del alojamiento al momento del check-in. Los comprobantes, constancias de transferencia, capturas de pantalla o avisos de pago no constituyen pago válido hasta la efectiva acreditación del importe en los medios de cobro habilitados por el hotel. Ante la falta de acreditación, el hotel podrá exigir el pago por otro medio aceptado y suspender el ingreso a la habitación hasta la regularización total del saldo correspondiente.",
    ];
    let terminos = DEFAULT_TERMINOS;
    try {
      const termSetting = await storage.getSystemSetting("confirmation_terms");
      if (termSetting?.value) {
        const lines = termSetting.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) terminos = lines;
      }
    } catch (_) {
      // fallback to default
    }

    // Pre-calculate T&C body height using the same font, width and numbered
    // text that will be rendered below. This keeps the border tight around
    // the terms instead of extending into the greeting area.
    const termTextWidth = contentW - 28;
    doc.font("Helvetica").fontSize(8);
    let tcBodyH = 10;
    for (const [i, t] of terminos.entries()) {
      const termLine = `${i + 1}.  ${t}`;
      tcBodyH += doc.heightOfString(termLine, { width: termTextWidth }) + 6;
    }
    const tcH = 22 + tcBodyH + 8;

    // Box border
    doc.roundedRect(margin, y, contentW, tcH, 6).stroke("#e0e0e0");
    // Navy header band
    doc.roundedRect(margin, y, contentW, 22, 6).fill(NAVY);
    doc.rect(margin, y + 12, contentW, 10).fill(NAVY); // fill bottom corners of header
    doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold")
      .text("TÉRMINOS Y CONDICIONES", margin + 14, y + 8, { characterSpacing: 1.5, width: contentW - 28 });

    let ty = y + 26;
    terminos.forEach((t, i) => {
      const termLine = `${i + 1}.  ${t}`;
      doc.fillColor("#333333").fontSize(8).font("Helvetica")
        .text(termLine, margin + 14, ty, { width: termTextWidth });
      ty += doc.heightOfString(termLine, { width: termTextWidth }) + 6;
    });
    y = ty + 14;

    // ── GREETING ─────────────────────────────────────────────────────────
    if (y < pageH - 88) {
      doc.fillColor("#666666").fontSize(9).font("Helvetica")
        .text(
          `Estimado/a ${guestName}, gracias por elegirnos. Le esperamos con mucho gusto en nuestro establecimiento.\nAnte cualquier consulta no dude en contactarnos.`,
          margin, y, { width: contentW, align: "center" }
        );
    }
    const _confTs = formatArgentinaDate(new Date());
    doc.fontSize(6).font("Helvetica").fillColor("#aaaaaa")
      .text(`Generado el ${_confTs} | Maran Suites & Towers`, margin, pageH - 20, { align: "center", width: contentW });

    doc.end();
  } catch (e: any) {
    console.error("[confirmation-pdf]", e);
    res.status(500).json({ error: "Error generando PDF", detail: e?.message });
  }
}
