Float(c.amount) <= 0) continue;
        const alreadyCharge = await getAlreadyTransferred(sourceId, c.id);
        chargeRemaining[c.id] = Math.max(0, parseFloat(c.amount) - alreadyCharge);
      }

      res.json({ accommodation: remainingAccommodation, charges: chargeRemaining });
    } catch (error) {
      console.error("[transfer-remaining] Error:", error);
      res.status(500).json({ error: "Error al obtener saldos transferibles" });
    }
  });

  // Transfer a single charge (partial or full) from one reservation to another.
  // Creates a negative adjustment on the source (with a [xfer:{ref}] tag for tracking)
  // and a positive charge on the destination.
  app.post("/api/reservations/:id/transfer-charge", requireAuth, async (req, res) => {
    try {
      const sourceId = req.params.id;
      const { chargeId, amount, targetReservationId, description } = req.body;
      const operator = (req as any).user?.username || "Sistema";

      if (!targetReservationId) return res.status(400).json({ error: "Se requiere reserva destino" });
      if (sourceId === targetReservationId) return res.status(400).json({ error: "Origen y destino no pueden ser iguales" });

      const transferAmount = parseFloat(amount);
      if (!transferAmount || transferAmount <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });

      const sourceRes = await storage.getReservation(sourceId);
      if (!sourceRes) return res.status(404).json({ error: "Reserva origen no encontrada" });
      if (isReservationLocked(sourceRes)) {
        return res.status(403).json({ error: "No se puede transferir cargos de una reserva cerrada o cancelada" });
      }

      const targetRes = await storage.getReservation(targetReservationId);
      if (!targetRes) return res.status(404).json({ error: "Reserva destino no encontrada" });

      if (targetRes.status !== "checked_in" && targetRes.status !== "confirmed") {
        return res.status(400).json({ error: "La reserva destino debe estar activa (confirmada o con check-in)" });
      }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const sourceRoom = (sourceRes as any).room?.roomNumber || sourceRes.roomId || "?";
      const targetRoom = (targetRes as any).room?.roomNumber || targetRes.roomId || "?";
      const sourceGuest = (sourceRes as any).guest ? `${(sourceRes as any).guest.firstName} ${(sourceRes as any).guest.lastName}` : "Huésped";

      let sourceDescription: string;
      let targetDescription: string;
      let xferRef: string; // machine-readable ref tag embedded in the negative charge description

      if (chargeId === "accommodation") {
        const roomTotal = parseFloat(sourceRes.totalRoomAmount || "0");
        if (roomTotal <= 0) return res.status(400).json({ error: "Esta reserva no tiene monto de alojamiento" });

        // Compute remaining after prior transfers (authoritative server-side cap)
        const alreadyTransferred = await getAlreadyTransferred(sourceId, "accommodation");
        const remaining = roomTotal - alreadyTransferred;
        if (transferAmount > remaining + 0.01) {
          return res.status(400).json({
            error: `Solo quedan $${remaining.toFixed(2)} disponibles para transferir de alojamiento (ya se transfirieron $${alreadyTransferred.toFixed(2)})`,
          });
        }

        // Correlation ID links both sides so reversal can find the counterpart deterministically
        const corrId = randomUUID();
        xferRef = "accommodation";
        sourceDescription = `Transferencia salida → Hab.${targetRoom} [xfer:accommodation] [corr:${corrId}] [res:${targetReservationId}]`;
        targetDescription = `Transferencia entrada desde Hab.${sourceRoom} (${sourceGuest}) [corr:${corrId}] [res:${sourceId}]`;
      } else {
        // Validate charge belongs to this reservation
        const charge = await storage.getCharge(chargeId);
        if (!charge) return res.status(404).json({ error: "Cargo no encontrado" });
        if (charge.reservationId !== sourceId) return res.status(403).json({ error: "El cargo no pertenece a esta reserva" });
        if (charge.status !== "active") return res.status(400).json({ error: "El cargo no está activo" });

        const chargeAmount = parseFloat(charge.amount);
        if (chargeAmount <= 0) return res.status(400).json({ error: "El cargo tiene monto inválido" });

        // Compute remaining after prior transfers (authoritative server-side cap)
        const alreadyTransferred = await getAlreadyTransferred(sourceId, charge.id);
        const remaining = chargeAmount - alreadyTransferred;
        if (transferAmount > remaining + 0.01) {
          return res.status(400).json({
            error: `Solo quedan $${remaining.toFixed(2)} disponibles para transferir de este cargo (ya se transfirieron $${alreadyTransferred.toFixed(2)})`,
          });
        }

        // Correlation ID links both sides so reversal can find the counterpart deterministically
        const corrId = randomUUID();
        xferRef = charge.id;
        sourceDescription = `Transferencia salida → Hab.${targetRoom} [xfer:${charge.id}] [corr:${corrId}] [res:${targetReservationId}]`;
        targetDescription = `Transferencia entrada desde Hab.${sourceRoom} (${charge.description}) [corr:${corrId}] [res:${sourceId}]`;
      }

      // 1. Create negative charge on source (reduces source balance)
      const sourceCharge = await storage.createCharge({
        reservationId: sourceId,
        description: sourceDescription,
        amount: String(-transferAmount),
        date: today,
        category: "transfer_out",
        createdBy: operator,
        status: "active",
      });

      // 2. Create positive charge on destination
      const destCharge = await storage.createCharge({
        reservationId: targetReservationId,
        description: targetDescription,
        amount: String(transferAmount),
        date: today,
        category: "transfer_in",
        createdBy: operator,
        status: "active",
      });

      // 3. Write folio movements so the folio view and PDF show labeled transfer entries
      try {
        const sourceFolio = await storage.getOrCreateFolio("reservation", sourceId);
        await storage.addFolioAdjustment(sourceFolio.id, "transfer_out", transferAmount, sourceDescription, operator);
      } catch (e) { console.error("[transfer-charge] folio source movement:", e); }
      try {
        const targetFolio = await storage.getOrCreateFolio("reservation", targetReservationId);
        await storage.addFolioAdjustment(targetFolio.id, "transfer_in", transferAmount, targetDescription, operator);
      } catch (e) { console.error("[transfer-charge] folio target movement:", e); }

      res.json({ success: true, transferred: transferAmount, sourceRoom, targetRoom });
    } catch (error) {
      console.error("[transfer-charge] Error:", error);
      res.status(500).json({ error: "Error al transferir el cargo" });
    }
  });

  // Reverse a mistaken transfer charge on this reservation.
  // Accepts the chargeId of a transfer_out or transfer_in entry that lives on this reservation.
  // Uses [corr:UUID] embedded at transfer creation time for deterministic pairing.
  // Embeds [rev:originalChargeId] in reversal descriptions to prevent double-reversal.
  app.post("/api/reservations/:id/reverse-transfer-charge", requireAuth, async (req, res) => {
    try {
      const reservationId = req.params.id;
      const { chargeId } = req.body;
      const operator = (req as any).user?.username || "Sistema";

      if (!chargeId) return res.status(400).json({ error: "Se requiere chargeId" });

      // 1. Load the charge to reverse
      const charge = await storage.getCharge(chargeId);
      if (!charge) return res.status(404).json({ error: "Cargo no encontrado" });
      if (charge.reservationId !== reservationId) {
        return res.status(403).json({ error: "El cargo no pertenece a esta reserva" });
      }
      if (charge.category !== "transfer_out" && charge.category !== "transfer_in") {
        return res.status(400).json({ error: "Solo se pueden revertir cargos de transferencia" });
      }
      if (charge.status !== "active") {
        return res.status(400).json({ error: "El cargo ya fue revertido o cancelado" });
      }
      // Reject reversal of a reversal counter-charge
      if (
        charge.description.startsWith("Reversa de transferencia") ||
        charge.description.includes("[rev:")
      ) {
        return res.status(400).json({ error: "Este cargo ya es una reversa — no se puede revertir nuevamente" });
      }

      // 2. Server-side idempotency guard: check if this charge was already reversed
      //    A reversal embeds [rev:chargeId] in its description. Look for it on this reservation.
      const alreadyReversedRows = await db.execute(
        sql`SELECT id FROM charges
            WHERE reservation_id = ${reservationId}
              AND status = 'active'
              AND description LIKE ${"%" + `[rev:${chargeId}]` + "%"}
            LIMIT 1`
      );
      if ((alreadyReversedRows.rows as any[]).length > 0) {
        return res.status(409).json({ error: "Esta transferencia ya fue revertida anteriormente" });
      }

      const chargeAmount = parseFloat(charge.amount); // negative for transfer_out, positive for transfer_in
      const absAmount = Math.abs(chargeAmount);

      // 3. Find the paired charge using deterministic [corr:UUID] if present; fall back to heuristic.
      let pairedCharge: any = null;
      let pairedReservationId: string | null = null;

      const corrMatch = charge.description.match(/\[corr:([^\]]+)\]/);
      const corrId = corrMatch ? corrMatch[1] : null;

      if (corrId) {
        // Deterministic: find the charge with the same correlation ID across all reservations
        const corrRows = await db.execute(
          sql`SELECT id, reservation_id, amount, description, category, status
              FROM charges
              WHERE description LIKE ${"%" + `[corr:${corrId}]` + "%"}
                AND reservation_id != ${reservationId}
                AND status = 'active'
              LIMIT 5`
        );
        const corrCandidates = (corrRows.rows as any[]);
        if (corrCandidates.length === 1) {
          pairedCharge = corrCandidates[0];
          pairedReservationId = pairedCharge.reservation_id;
        } else if (corrCandidates.length > 1) {
          // Shouldn't happen (UUID is unique), but handle gracefully
          console.warn(`[reverse-transfer] Multiple charges with corr:${corrId} — skipping paired reversal`);
        }
      } else {
        // Legacy fallback: room-number + amount + category heuristic.
        // Only proceed if exactly ONE candidate is found (to avoid reversing the wrong folio).
        let otherRoomNumber: string | null = null;
        if (charge.category === "transfer_out") {
          const m = charge.description.match(/→\s*Hab\.(\S+)/);
          otherRoomNumber = m ? m[1] : null;
        } else {
          const m = charge.description.match(/desde\s+Hab\.(\S+)/);
          otherRoomNumber = m ? m[1] : null;
        }

        if (otherRoomNumber) {
          const pairedCategory = charge.category === "transfer_out" ? "transfer_in" : "transfer_out";
          // Find reservations matching the other room; search charges for exactly one matching counterpart
          const roomRows = await db.execute(
            sql`SELECT r.id FROM reservations r
                JOIN rooms rm ON rm.id = r.room_id
                WHERE rm.room_number = ${otherRoomNumber}
                  AND r.status NOT IN ('cancelled')
                ORDER BY r.created_at DESC
                LIMIT 10`
          );
          const candidateIds = (roomRows.rows as any[]).map((r: any) => r.id as string);
          const allMatches: Array<{ charge: any; reservationId: string }> = [];
          for (const candId of candidateIds) {
            const candCharges = await storage.getCharges(candId);
            for (const c of candCharges) {
              if (
                c.category === pairedCategory &&
                c.status === "active" &&
                !c.description.includes("[rev:") &&
                Math.abs(Math.abs(parseFloat(c.amount)) - absAmount) < 0.02
              ) {
                allMatches.push({ charge: c, reservationId: candId });
              }
            }
          }
          if (allMatches.length === 1) {
            // Exactly one match — safe to proceed
            pairedCharge = allMatches[0].charge;
            pairedReservationId = allMatches[0].reservationId;
          } else if (allMatches.length > 1) {
            // Ambiguous — do not auto-reverse the other side
            console.warn(`[reverse-transfer] Ambiguous paired charge (${allMatches.length} matches, no corr ID) — skipping other-side reversal`);
          }
        }
      }

      // 4. Verify the paired reservation is not locked
      if (pairedReservationId) {
        const pairedRes = await storage.getReservation(pairedReservationId);
        if (pairedRes && isReservationLocked(pairedRes)) {
          return res.status(400).json({
            error: "No se puede revertir: la reserva del otro folio ya está cerrada o cancelada",
          });
        }
      }

      // 5. Verify the current reservation is not locked
      const thisRes = await storage.getReservation(reservationId);
      if (!thisRes) return res.status(404).json({ error: "Reserva no encontrada" });
      if (isReservationLocked(thisRes)) {
        return res.status(403).json({ error: "No se puede revertir un cargo de una reserva cerrada" });
      }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

      // 6. Create counter-charges embedding [rev:originalChargeId] for idempotency tracking
      const thisCounterAmount = -chargeAmount;
      const cleanDesc = charge.description
        .replace(/\s*\[xfer:[^\]]+\]/g, "")
        .replace(/\s*\[corr:[^\]]+\]/g, "")
        .replace(/\s*\[res:[^\]]+\]/g, "")
        .trim();
      const thisResTag = pairedReservationId ? ` [res:${pairedReservationId}]` : "";
      const thisCounterDesc = `Reversa de transferencia (${cleanDesc}) [rev:${chargeId}]${thisResTag}`;
      const thisCounterCategory: "transfer_out" | "transfer_in" =
        charge.category === "transfer_out" ? "transfer_in" : "transfer_out";

      // Duplicate-guard: if a previous attempt created the source counter-charge
      // but then crashed, skip re-creation to avoid leaving a duplicate.
      const existingThisCharges = await storage.getCharges(reservationId);
      const thisCounterAmountStr = String(thisCounterAmount);
      const thisCounterAlreadyExists = existingThisCharges.some(
        (c: any) =>
          c.status === "active" &&
          c.description === thisCounterDesc &&
          c.amount === thisCounterAmountStr
      );

      if (thisCounterAlreadyExists) {
        console.warn(`[reverse-transfer] Duplicate source counter-charge already exists on ${reservationId} — skipping recreation`);
      } else {
        await storage.createCharge({
          reservationId,
          description: thisCounterDesc,
          amount: thisCounterAmountStr,
          date: today,
          category: thisCounterCategory,
          createdBy: operator,
          status: "active",
        });
      }

      // Record on this folio — guard against duplicates: a prior attempt may have
      // already written the adjustment even if the charge was skipped above.
      try {
        const thisFolio = await storage.getOrCreateFolio("reservation", reservationId);
        const thisFolioData = await storage.getFolioWithMovements(thisFolio.id);
        const thisFolioAdjAlreadyExists = thisFolioData?.movements?.some(
          (m: any) => m.description === thisCounterDesc
        );
        if (thisFolioAdjAlreadyExists) {
          console.warn(`[reverse-transfer] Folio adjustment already exists on folio ${thisFolio.id} — skipping`);
        } else {
          await storage.addFolioAdjustment(thisFolio.id, thisCounterCategory, absAmount, thisCounterDesc, operator);
        }
      } catch (e) { console.error("[reverse-transfer] this folio adjustment:", e); }

      // 7. Reverse the paired charge if found
      let pairedAlreadyExists = false;
      if (pairedCharge && pairedReservationId) {
        const pairedChargeId = pairedCharge.id ?? pairedCharge.id;
        const pairedCounterAmount = -parseFloat(pairedCharge.amount);
        const pairedCleanDesc = (pairedCharge.description as string)
          .replace(/\s*\[xfer:[^\]]+\]/g, "")
          .replace(/\s*\[corr:[^\]]+\]/g, "")
          .replace(/\s*\[res:[^\]]+\]/g, "")
          .trim();
        const pairedCounterDesc = `Reversa de transferencia (${pairedCleanDesc}) [rev:${pairedChargeId}] [res:${reservationId}]`;
        const pairedCounterCategory: "transfer_out" | "transfer_in" =
          pairedCharge.category === "transfer_out" ? "transfer_in" : "transfer_out";

        // Duplicate-guard: if an active charge with the same reservationId, amount, and
        // description already exists on the paired reservation (e.g. the previous reversal
        // crashed after creating this charge but before finishing), skip re-creation to
        // avoid leaving a duplicate.
        const existingPairedCharges = await storage.getCharges(pairedReservationId);
        const pairedCounterAmountStr = String(pairedCounterAmount);
        const duplicateExists = existingPairedCharges.some(
          (c: any) =>
            c.status === "active" &&
            c.description === pairedCounterDesc &&
            c.amount === pairedCounterAmountStr
        );

        if (duplicateExists) {
          pairedAlreadyExists = true;
          console.warn(`[reverse-transfer] Duplicate paired counter-charge already exists on ${pairedReservationId} — skipping recreation`);
        } else {
          await storage.createCharge({
            reservationId: pairedReservationId,
            description: pairedCounterDesc,
            amount: pairedCounterAmountStr,
            date: today,
            category: pairedCounterCategory,
            createdBy: operator,
            status: "active",
          });
        }

        // Record on the paired folio — guard against duplicates regardless of whether
        // the charge was freshly created or was already present from a prior attempt.
        try {
          const pairedFolio = await storage.getOrCreateFolio("reservation", pairedReservationId);
          const pairedFolioData = await storage.getFolioWithMovements(pairedFolio.id);
          const pairedFolioAdjAlreadyExists = pairedFolioData?.movements?.some(
            (m: any) => m.description === pairedCounterDesc
          );
          if (pairedFolioAdjAlreadyExists) {
            console.warn(`[reverse-transfer] Paired folio adjustment already exists on folio ${pairedFolio.id} — skipping`);
          } else {
            await storage.addFolioAdjustment(pairedFolio.id, pairedCounterCategory, absAmount, pairedCounterDesc, operator);
          }
        } catch (e) { console.error("[reverse-transfer] paired folio adjustment:", e); }
      }

      res.json({
        success: true,
        reversed: absAmount,
        pairedReversed: !!pairedCharge,
        alreadyExists: pairedAlreadyExists || undefined,
        otherRoom: (() => {
          if (charge.category === "transfer_out") {
            const m = charge.description.match(/→\s*Hab\.(\S+)/); return m ? m[1] : null;
          } else {
            const m = charge.description.match(/desde\s+Hab\.(\S+)/); return m ? m[1] : null;
          }
        })(),
        message: pairedCharge
          ? `Transferencia revertida: se canceló el cargo en ambos folios ($${absAmount.toFixed(2)})`
          : `Cargo revertido en este folio ($${absAmount.toFixed(2)}). No se encontró el cargo correspondiente en el otro folio — revisá manualmente.`,
      });
    } catch (error) {
      console.error("[reverse-transfer] Error:", error);
      res.status(500).json({ error: "Error al revertir la transferencia" });
    }
  });

  // Bulk transfer charges + accommodation + advances to another reservation
  app.post("/api/reservations/:id/bulk-transfer", requireAuth, async (req, res) => {
    try {
      const sourceId = req.params.id;
      const { targetReservationId, chargeIds = [], includeAccommodation = false, transferNote = "", paymentIds = [] } = req.body;
      const operator = (req as any).user?.username || "Sistema";

      if (!targetReservationId) return res.status(400).json({ error: "Se requiere reserva destino" });
      if (sourceId === targetReservationId) return res.status(400).json({ error: "Origen y destino no pueden ser iguales" });

      const sourceRes = await storage.getReservation(sourceId);
      if (!sourceRes) return res.status(404).json({ error: "Reserva origen no encontrada" });

      const targetRes = await storage.getReservation(targetReservationId);
      if (!targetRes) return res.status(404).json({ error: "Reserva destino no encontrada" });

      if (targetRes.status !== "checked_in" && targetRes.status !== "confirmed") {
        return res.status(400).json({ error: "La reserva destino debe estar activa (confirmada o con check-in)" });
      }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const sourceRoom = sourceRes.room?.roomNumber || sourceRes.roomId || "?";
      const sourceGuest = sourceRes.guest ? `${sourceRes.guest.firstName} ${sourceRes.guest.lastName}` : "Huésped";
      const targetRoom = targetRes.room?.roomNumber || targetRes.roomId || "?";
      const targetGuest = targetRes.guest ? `${targetRes.guest.firstName} ${targetRes.guest.lastName}` : "Huésped";
      const noteRef = transferNote ? ` — ${transferNote}` : "";

      let chargesTransferred = 0;
      let accommodationTransferred = false;
      let paymentsTransferred = 0;

      // Move selected extra charges to target reservation
      for (const chargeId of chargeIds) {
        const charge = await storage.getCharge(chargeId);
        if (!charge || charge.reservationId !== sourceId || charge.status !== "active") continue;
        await storage.updateCharge(chargeId, {
          reservationId: targetReservationId,
          description: `${charge.description} [Transf. Hab.${sourceRoom} – ${sourceGuest}]`,
          createdBy: operator,
        });
        chargesTransferred++;
      }

      // Transfer accommodation charge (room total)
      if (includeAccommodation && parseFloat(sourceRes.totalRoomAmount || "0") > 0) {
        const roomAmount = parseFloat(sourceRes.totalRoomAmount!);

        // Create a charge in target representing the accommodation of the source
        await storage.createCharge({
          reservationId: targetReservationId,
          description: `Alojamiento Hab.${sourceRoom} – ${sourceGuest}${noteRef}`,
          amount: String(roomAmount),
          date: today,
          category: "room",
          createdBy: operator,
        });

        // Register a payment on source to zero out the room balance
        await storage.createPayment({
          reservationId: sourceId,
          amount: String(roomAmount),
          method: "transferencia",
          date: today,
          reference: `Transferido a Hab.${targetRoom} – ${targetGuest}`,
          receivedBy: operator,
          notes: `Cargo de alojamiento transferido a reserva de Hab.${targetRoom}${noteRef}`,
          billingTarget: "guest",
          status: "active",
        });

        accommodationTransferred = true;
      }

      // Transfer selected advances/payments to target reservation
      for (const paymentId of paymentIds) {
        const payResult = await db.execute(sql`SELECT * FROM payments WHERE id = ${paymentId}`);
        const pay = payResult.rows?.[0] as any;
        if (!pay || pay.reservation_id !== sourceId || pay.status !== "active") continue;
        await db.execute(sql`
          UPDATE payments
          SET reservation_id = ${targetReservationId},
              notes = COALESCE(notes, '') || ${` [Transf. desde Hab.${sourceRoom} – ${sourceGuest}${noteRef}]`}
          WHERE id = ${paymentId}
        `);
        paymentsTransferred++;
      }

      // Add note to source reservation
      const sourceNoteText = [
        includeAccommodation && accommodationTransferred ? `Alojamiento ($${sourceRes.totalRoomAmount})` : null,
        chargesTransferred > 0 ? `${chargesTransferred} cargo(s) extra` : null,
        paymentsTransferred > 0 ? `${paymentsTransferred} anticipo(s)` : null,
      ].filter(Boolean).join(" y ");

      if (sourceNoteText) {
        const existingNotes = sourceRes.notes || "";
        const newNote = `[Transf. a Hab.${targetRoom}/${targetGuest}] ${sourceNoteText} transferido(s)${noteRef}`;
        await storage.updateReservation(sourceId, {
          notes: existingNotes ? `${existingNotes}\n${newNote}` : newNote,
        });
      }

      res.json({
        success: true,
        chargesTransferred,
        accommodationTransferred,
        paymentsTransferred,
        targetReservationId,
      });
    } catch (error) {
      console.error("[bulk-transfer] Error:", error);
      res.status(500).json({ error: "Error al transferir cargos" });
    }
  });

  // Payments
  app.get("/api/reservations/:reservationId/payments", async (req, res) => {
    try {
      const includeAnulados = req.query.includeAnulados === "true";
      const result = includeAnulados
        ? await storage.getAllPaymentsIncludingAnulados(req.params.reservationId)
        : await storage.getPayments(req.params.reservationId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Error fetching payments" });
    }
  });

  app.get("/api/reservations/:reservationId/payments/total", async (req, res) => {
    try {
      const total = await storage.getPaymentsTotal(req.params.reservationId);
      res.json({ total });
    } catch (error) {
      res.status(500).json({ error: "Error fetching payments total" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      // Prefactura emits the invoice before recording its payment. Persist the
      // invoice reference with the payment creation itself instead of relying
      // on a later best-effort PATCH that could leave an orphaned payment.
      if (req.body.invoiceData) {
        req.body.invoiceRef = JSON.stringify(req.body.invoiceData);
        req.body.invoiceLinkFailed = false;
        delete req.body.invoiceData;
      }
      if (req.body.reservationId) {
        const reservation = await storage.getReservation(req.body.reservationId);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede agregar pagos a una reserva cerrada de días anteriores" });
        }
      }
      if (req.body.billingTarget && !["guest", "company", "agency"].includes(req.body.billingTarget)) {
        req.body.billingTarget = "guest";
      }
      if (!req.body.date) {
        const now = new Date();
        req.body.date = now.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      }
      const payment = await storage.createPayment(req.body);

      // Registrar movimiento en Cuenta Corriente al momento del pago (no esperar al checkout)
      if (req.body.method === "cuenta_corriente" && req.body.reservationId) {
        try {
          const reservationForCC = req.body.reservationId ? await storage.getReservation(req.body.reservationId) : null;
          if (reservationForCC) {
            const guestName = reservationForCC.guest
              ? `${reservationForCC.guest.firstName} ${reservationForCC.guest.lastName}`
              : "Huésped";
            const roomNum = reservationForCC.room?.roomNumber || reservationForCC.roomId;
            const billingTarget = req.body.billingTarget || "guest";
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
            // Use reservation's linked entity or override from payment body
            const targetCompanyId = reservationForCC.companyId || req.body.companyId || null;
            const targetAgencyId = reservationForCC.agencyId || req.body.agencyId || null;

            if (billingTarget === "company" && targetCompanyId) {
              await storage.createAccountMovement({
                entityType: "company",
                entityId: targetCompanyId,
                date: today,
                type: "cargo",
                description: `Estadía ${reservationForCC.reservationCode} — Hab. ${roomNum}`,
                amount: parseFloat(req.body.amount).toFixed(2),
                reservationId: reservationForCC.id,
                reservationCode: reservationForCC.reservationCode,
                guestName,
              });
            } else if (billingTarget === "agency" && targetAgencyId) {
              await storage.createAccountMovement({
                entityType: "agency",
                entityId: targetAgencyId,
                date: today,
                type: "cargo",
                description: `Estadía ${reservationForCC.reservationCode} — Hab. ${roomNum}`,
                amount: parseFloat(req.body.amount).toFixed(2),
                reservationId: reservationForCC.id,
                reservationCode: reservationForCC.reservationCode,
                guestName,
              });
            } else if (billingTarget === "guest" && reservationForCC.guestId) {
              // CC para huésped individual (persona física)
              await storage.createAccountMovement({
                entityType: "guest",
                entityId: reservationForCC.guestId,
                date: today,
                type: "cargo",
                description: `Estadía ${reservationForCC.reservationCode} — Hab. ${roomNum}`,
                amount: parseFloat(req.body.amount).toFixed(2),
                reservationId: reservationForCC.id,
                reservationCode: reservationForCC.reservationCode,
                guestName,
              });
            } else if (billingTarget !== "guest") {
              console.warn(`[CC] Pago CC con billingTarget=${billingTarget} pero sin entityId para reserva ${reservationForCC.reservationCode}`);
            }
          }
        } catch (e) {
          console.error("Error creando movimiento CC al registrar pago:", e);
        }
      }

      try {
        const methodMap: Record<string, string> = {
          efectivo: "cash", tarjeta_debito: "debit_card", tarjeta_credito: "credit_card",
          transferencia: "transfer", mercadopago: "mercadopago", cuenta_corriente: "current_account",
          cargo_habitacion: "room_charge", room_charge: "room_charge",
          cash: "cash", debit_card: "debit_card", credit_card: "credit_card", transfer: "transfer",
          current_account: "current_account",
        };
        const rawMethod = req.body.method || "cash";
        const cashMethod = methodMap[rawMethod] || rawMethod;
        const reservation = req.body.reservationId ? await storage.getReservation(req.body.reservationId) : null;
        const label = reservation
          ? [
              `Reserva ${reservation.reservationCode}`,
              reservation.room?.roomNumber ? `Hab. ${reservation.room.roomNumber}` : null,
              reservation.guest ? `${reservation.guest.lastName}${reservation.guest.firstName ? ", " + reservation.guest.firstName : ""}` : null,
              `Pago ${rawMethod}`,
            ].filter(Boolean).join(" — ")
          : `Pago manual - ${req.body.description || "Sin descripción"}`;
        await storage.registerCashMovement(
          "reception", "reservation", req.body.reservationId || null, label,
          cashMethod, String(req.body.amount), "income",
          undefined, req.body.receiptType, payment.id
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      // Motor financiero: escribir al folio de la reserva
      if (payment.reservationId) {
        const rawMethod = req.body.method || "cash";
        storage.addFolioPayment(
          "reservation",
          payment.reservationId,
          parseFloat(payment.amount),
          payment.notes || `Pago — ${rawMethod}`,
          rawMethod,
          "payment",
          payment.id,
          undefined,
          (req as any).user?.username,
          req.body.receiptType,
        ).catch(e => console.error("[Folio] Error escribiendo pago:", e));
      }
      await audit(req, "create", "payments",
        `Pago registrado: $${req.body.amount} (${req.body.method}) — Reserva ${req.body.reservationId || "N/A"}`,
        { entityType: "payment", entityId: payment.id }
      );
      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating payment" });
    }
  });

  app.patch("/api/payments/:id", async (req, res) => {
    try {
      const payment = await storage.updatePayment(req.params.id, req.body);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }
      res.json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error updating payment" });
    }
  });

  app.patch("/api/payments/:id/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion, anuladoPor } = req.body;
      if (!motivoAnulacion?.trim()) {
        return res.status(400).json({ error: "El motivo de anulación es requerido" });
      }
      const payResult = await db.execute(sql`SELECT * FROM payments WHERE id = ${req.params.id}`);
      const pay = payResult.rows?.[0] as any;
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      if (pay.status === "anulado") return res.status(400).json({ error: "El pago ya está anulado" });

      // Solo permite anular pagos del día de hoy
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      if (pay.date !== today) {
        return res.status(400).json({ error: "Solo se pueden anular pagos registrados el día de hoy" });
      }

      if (pay.reservation_id) {
        const reservation = await storage.getReservation(pay.reservation_id);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede anular pagos de una reserva cerrada" });
        }
      }

      const user = (req as any).user;
      const operator = anuladoPor || user?.username || "sistema";

      const updated = await db.execute(sql`
        UPDATE payments SET status = 'anulado', anulado_por = ${operator},
        motivo_anulacion = ${motivoAnulacion}, anulado_at = NOW()
        WHERE id = ${req.params.id} RETURNING *
      `);

      // ── 1. Contraasiento en el folio de la reserva ────────────────────────
      if (pay.reservation_id) {
        try {
          const folio = await storage.getOrCreateFolio("reservation", pay.reservation_id);
          const methodLabel: Record<string, string> = {
            efectivo: "Efectivo", tarjeta_debito: "Tarj. Débito", tarjeta_credito: "Tarj. Crédito",
            transferencia: "Transferencia", mercadopago: "MercadoPago", cuenta_corriente: "Cta. Corriente",
          };
          await storage.addFolioAdjustment(
            folio.id, "void", parseFloat(pay.amount),
            `Anulación pago ${methodLabel[pay.method] || pay.method} — ${motivoAnulacion}`,
            operator, undefined, motivoAnulacion
          );
        } catch (e) { console.error("[anular-pago] folio void:", e); }

        // ── 2. Contraasiento en caja (reversal de ingreso) ────────────────
        try {
          const reservation = await storage.getReservation(pay.reservation_id);
          const label = reservation
            ? [
                `Anulación ${reservation.reservationCode}`,
                reservation.room?.roomNumber ? `Hab. ${reservation.room.roomNumber}` : null,
                reservation.guest ? `${reservation.guest.lastName}${reservation.guest.firstName ? ", " + reservation.guest.firstName : ""}` : null,
                pay.method,
              ].filter(Boolean).join(" — ")
            : `Anulación pago — ${pay.method}`;
          await storage.registerCashMovement(
            "reception", "payment_void", pay.id, label,
            pay.method, String(pay.amount), "expense", operator
          );
        } catch (e) { console.error("[anular-pago] cash reversal:", e); }

        // ── 3. Nota de crédito automática si el pago tenía factura ────────
        let notaCreditoGenerada = false;
        const facturaTypes: Record<string, string> = { factura_a: "FA", factura_b: "FB", factura_c: "FC" };
        if (pay.receipt_type && facturaTypes[pay.receipt_type]) {
          try {
            const tipoComprobante = facturaTypes[pay.receipt_type];
            const invRows = await db.execute(sql`
              SELECT * FROM sales_invoices
              WHERE entity_id = ${pay.reservation_id}
                AND tipo_comprobante = ${tipoComprobante}
                AND estado = 'activa'
              ORDER BY id DESC LIMIT 1
            `);
            const invoice = invRows.rows?.[0] as any;
            if (invoice) {
              const tipoNC = tipoComprobante === "FA" ? "NCA" : "NCB";
              const nc = await emitirFactura({
                tipoComprobante: tipoNC as any,
                cliente: {
                  razonSocial: invoice.cliente_razon_social,
                  cuit: invoice.cliente_cuit,
                  dni: invoice.cliente_dni,
                  condicionIva: invoice.cliente_condicion_iva,
                  domicilio: invoice.cliente_domicilio,
                },
                items: invoice.items ?? [],
                facturaOriginalId: invoice.id,
                operador: user?.fullName || user?.username,
              } as any);
              await db.execute(sql`
                UPDATE sales_invoices SET estado = 'anulada', nota_credito_id = ${nc.id}
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
      res.status(500).json({ error: e.message });
    }
  });

  // Vincular resultado de factura electrónica a un pago/anticipo
  app.patch("/api/payments/:id/invoice", requireAuth, async (req, res) => {
    try {
      const { invoiceData } = req.body;
      if (!invoiceData) return res.status(400).json({ error: "invoiceData requerido" });
      const payResult = await db.execute(sql`SELECT id FROM payments WHERE id = ${req.params.id}`);
      if (!payResult.rows?.[0]) return res.status(404).json({ error: "Pago no encontrado" });
      const updated = await db.execute(sql`
        UPDATE payments
        SET invoice_ref = ${JSON.stringify(invoiceData)},
            invoice_link_failed = false
        WHERE id = ${req.params.id} RETURNING *
      `);
      const updatedPay = updated.rows[0] as any;
      res.json(updatedPay);

      // Propagate invoice_ref to the associated group_payment when this payment was created
      // as part of a group payment distribution. Uses the deterministic group_payment_id FK
      // set at payment creation time — no heuristic matching.
      if (updatedPay?.group_payment_id) {
        try {
          await db.execute(sql`
            UPDATE group_payments
            SET invoice_ref = ${JSON.stringify(invoiceData)}
            WHERE id = ${updatedPay.group_payment_id}
          `);
        } catch (propagateErr) {
          console.error("[invoice-link] Failed to propagate invoice_ref to group_payment:", propagateErr);
        }
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Marcar vínculo de factura como fallido (y guardar datos de la factura para reintento posterior)
  app.patch("/api/payments/:id/invoice-link-failed", requireAuth, async (req, res) => {
    try {
      const { invoiceData } = req.body;
      const payResult = await db.execute(sql`SELECT id FROM payments WHERE id = ${req.params.id}`);
      if (!payResult.rows?.[0]) return res.status(404).json({ error: "Pago no encontrado" });
      // Store invoice data (so the re-link action can use it later) and mark as failed
      const updated = await db.execute(sql`
        UPDATE payments
        SET invoice_link_failed = true
            ${invoiceData ? sql`, invoice_ref = ${JSON.stringify(invoiceData)}` : sql``}
        WHERE id = ${req.params.id} RETURNING *
      `);
      res.json(updated.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/payments/${req.params.id} — usar PATCH /anular`);
    try {
      const payResult = await db.execute(sql`SELECT reservation_id FROM payments WHERE id = ${req.params.id}`);
      const payRow = payResult.rows?.[0] as any;
      if (payRow?.reservation_id) {
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
      res.status(500).json({ error: "Error deleting payment" });
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
      .text(`Emitida: ${new Date().toLocaleDateString("es-AR")}`, codeBoxX, codeBoxY + 49, { width: codeBoxW, align: "center" });

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

    // Pre-calculate T&C body height
    let tcBodyH = 10;
    for (const t of terminos) {
      tcBodyH += doc.heightOfString(t, { width: contentW - 30 }) + 6;
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
      doc.fillColor("#333333").fontSize(8).font("Helvetica")
        .text(`${i + 1}.  ${t}`, margin + 14, ty, { width: contentW - 28 });
      ty += doc.heightOfString(t, { width: contentW - 28 }) + 6;
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
    const _confTs = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fontSize(6).font("Helvetica").fillColor("#aaaaaa")
      .text(`Generado el ${_confTs} | Maran Suites & Towers`, margin, pageH - 20, { align: "center", width: contentW });

    doc.end();
  } catch (e: any) {
    console.error("[confirmation-pdf]", e);
    res.status(500).json({ error: "Error generando PDF", detail: e?.message });
  }
}
