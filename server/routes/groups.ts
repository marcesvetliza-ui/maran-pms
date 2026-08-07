import type { Express } from "express";
import { randomUUID } from "crypto";
import { storage, getArgentinaToday } from "../db-storage";
import { db } from "../db";
import { reservationChangelog, housekeepingTasks, groupReservationLinks, rooms as roomsTable, reservations as reservationsTable, guests as guestsTable, groupRoomBlocks, groupCharges as groupChargesTable } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { audit } from "../audit";
import PDFDocument from "pdfkit";

// Helper: get or create the single placeholder guest for a group
async function getOrCreatePlaceholderGuest(groupId: string, groupName: string) {
  const code = `GROUP-${groupId}`;
  const [existing] = await db.select().from(guestsTable).where(eq(guestsTable.codigo, code)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(guestsTable).values({
    firstName: groupName,
    lastName: "",
    codigo: code,
    segment: "LEISURE",
    sexo: "no_especifica",
  } as any).returning();
  return created;
}

export function registerGroupsRoutes(app: Express) {
  // Groups
  app.get("/api/groups", async (req, res) => {
    try {
      const groups = await storage.getGroups();
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: "Error fetching groups" });
    }
  });

  app.get("/api/groups/:id", async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      res.status(500).json({ error: "Error fetching group" });
    }
  });

  app.post("/api/groups", async (req, res) => {
    try {
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color, billingEntityType, billingEntityId } = req.body;

      if (!name || !checkInDate || !checkOutDate) {
        return res.status(400).json({ error: "Name, checkInDate, and checkOutDate are required" });
      }
      const today = getArgentinaToday();
      if (checkInDate < today) {
        return res.status(400).json({ error: "La fecha de check-in no puede ser anterior a hoy." });
      }
      if (checkOutDate <= checkInDate) {
        return res.status(400).json({ error: "La fecha de check-out debe ser posterior al check-in." });
      }

      const groupCode = storage.generateGroupCode();
      const group = await storage.createGroup({
        groupCode,
        name,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        eventDate: eventDate || null,
        eventSalon: eventSalon || null,
        eventTime: eventTime || null,
        checkInDate,
        checkOutDate,
        status: status || "tentative",
        releaseDate: releaseDate || null,
        notes: notes || null,
        color: color || "#6366f1",
        billingEntityType: billingEntityType || null,
        billingEntityId: billingEntityId || null,
        createdAt: new Date(),
        createdBy: null,
      });
      res.status(201).json(group);
    } catch (error) {
      res.status(500).json({ error: "Error creating group" });
    }
  });

  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color, masterFolioConfig, billingEntityType, billingEntityId } = req.body;
      const nullIfEmpty = (v: any) => (v === "" || v === null || v === undefined) ? null : v;
      const updateData: Record<string, unknown> = {};

      if (name !== undefined) updateData.name = name;
      if (contactName !== undefined) updateData.contactName = nullIfEmpty(contactName);
      if (contactPhone !== undefined) updateData.contactPhone = nullIfEmpty(contactPhone);
      if (contactEmail !== undefined) updateData.contactEmail = nullIfEmpty(contactEmail);
      if (eventDate !== undefined) updateData.eventDate = nullIfEmpty(eventDate);
      if (eventSalon !== undefined) updateData.eventSalon = nullIfEmpty(eventSalon);
      if (eventTime !== undefined) updateData.eventTime = nullIfEmpty(eventTime);
      if (checkInDate !== undefined) updateData.checkInDate = checkInDate;
      if (checkOutDate !== undefined) updateData.checkOutDate = checkOutDate;
      if (status !== undefined) updateData.status = status;
      if (releaseDate !== undefined) updateData.releaseDate = nullIfEmpty(releaseDate);
      if (notes !== undefined) updateData.notes = nullIfEmpty(notes);
      if (color !== undefined) updateData.color = color;
      if (masterFolioConfig !== undefined) updateData.masterFolioConfig = masterFolioConfig;
      if (billingEntityType !== undefined) updateData.billingEntityType = nullIfEmpty(billingEntityType);
      if (billingEntityId !== undefined) updateData.billingEntityId = nullIfEmpty(billingEntityId);

      const group = await storage.updateGroup(req.params.id, updateData);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Si el nombre cambió, sincronizar el guest placeholder que se usa en planning,
      // rooming list, folio y cualquier otro lugar que muestra el nombre del grupo
      if (name !== undefined) {
        const placeholderCode = `GROUP-${req.params.id}`;
        await db.update(guestsTable)
          .set({ firstName: name, lastName: "" })
          .where(eq(guestsTable.codigo, placeholderCode));
      }

      res.json(group);
    } catch (error: any) {
      console.error("Error updating group:", error?.message || error);
      res.status(500).json({ error: "Error updating group", detail: error?.message });
    }
  });

  app.delete("/api/groups/:id", requireAuth, async (req, res) => {
    try {
      // Get group info before deleting for audit trail
      const group = await storage.getGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Solo se puede eliminar un grupo Tentativo sin reservas ni movimientos financieros
      if (group.status !== "tentativo") {
        return res.status(400).json({ error: "Solo se pueden eliminar grupos en estado Tentativo. Para cancelar un grupo usá el estado Cancelado." });
      }
      if (group.reservations.length > 0) {
        return res.status(400).json({ error: "No se puede eliminar un grupo que tiene reservas asignadas." });
      }
      const [gCharges, gPayments] = await Promise.all([
        storage.getGroupCharges(req.params.id),
        storage.getGroupPayments(req.params.id),
      ]);
      if (gCharges.length > 0 || gPayments.length > 0) {
        return res.status(400).json({ error: "No se puede eliminar un grupo que tiene movimientos financieros registrados." });
      }

      const reservationCount = 0;

      const deleted = await storage.deleteGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Group not found" });
      }

      await audit(req, "delete", "groups",
        `Grupo eliminado: ${group.name} (${group.groupCode}). ${reservationCount} reserva(s) canceladas.`,
        { entityType: "group", entityId: req.params.id }
      );

      res.json({ success: true, cancelledReservations: reservationCount });
    } catch (error: any) {
      console.error("Error deleting group:", error);
      res.status(500).json({ error: "Error deleting group" });
    }
  });

  // Group Room Blocks
  app.get("/api/groups/:groupId/blocks", async (req, res) => {
    try {
      const blocks = await storage.getGroupBlocks(req.params.groupId);
      res.json(blocks);
    } catch (error) {
      res.status(500).json({ error: "Error fetching group blocks" });
    }
  });

  app.post("/api/groups/:groupId/blocks", async (req, res) => {
    try {
      const { roomTypeId, quantity, ratePlanId, agreedRate, blockCheckInDate, blockCheckOutDate } = req.body;

      if (!roomTypeId || quantity === undefined) {
        return res.status(400).json({ error: "roomTypeId and quantity are required" });
      }

      const qty = typeof quantity === 'number' ? quantity : parseInt(quantity, 10);

      const block = await storage.createGroupBlock({
        groupId: req.params.groupId,
        roomTypeId,
        quantity: qty,
        ratePlanId: ratePlanId || null,
        agreedRate: agreedRate ? String(agreedRate) : null,
        blockCheckInDate: blockCheckInDate || null,
        blockCheckOutDate: blockCheckOutDate || null,
      });

      // Auto-assign available rooms and create placeholder reservations
      const group = await storage.getGroup(req.params.groupId);
      if (group) {
        const checkIn = blockCheckInDate || group.checkInDate;
        const checkOut = blockCheckOutDate || group.checkOutDate;

        const allRoomsOfType = await db.select().from(roomsTable).where(eq(roomsTable.roomTypeId, roomTypeId));
        const allReservations = await storage.getReservations();
        const activeStatuses = ["tentative", "pending", "reserved", "confirmed", "web_checkin", "checked_in"];

        const availableRooms = allRoomsOfType.filter(room => {
          if (room.roomNumber === "REUB") return false;
          if (room.status === "blocked") return false;
          return !allReservations.find(res => {
            if (!activeStatuses.includes(res.status)) return false;
            if (res.roomId !== room.id) return false;
            return res.checkInDate < checkOut && res.checkOutDate > checkIn;
          });
        });

        let autoAssigned = 0;
        for (const room of availableRooms) {
          if (autoAssigned >= qty) break;
          const nights = Math.max(1, Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
          ));
          const rate = agreedRate ? String(agreedRate) : "0";

          // Each placeholder reservation is INDEPENDENT — no shared guest.
          // Use the group's placeholder guest so guestId is never null (schema constraint).
          const placeholderGuest = await getOrCreatePlaceholderGuest(group.id, group.name);
          const reservation = await storage.createReservation({
            reservationCode: `G${group.groupCode}-${room.roomNumber}`,
            guestId: placeholderGuest.id,
            guestName: "",
            roomTypeId: room.roomTypeId,
            roomId: room.id,
            ratePlanId: ratePlanId || null,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            nights,
            baseRatePerNight: rate,
            discountType: "none",
            discountValue: "0",
            finalRatePerNight: rate,
            totalRoomAmount: (parseFloat(rate) * nights).toFixed(2),
            status: "confirmed",
            source: "empresa",
            otaChannelId: null,
            externalReservationId: null,
            numberOfGuests: 1,
            notes: `Grupo: ${group.name}`,
            createdAt: new Date(),
            lastModifiedBy: null,
          } as any);

          await storage.createGroupReservationLink({ groupId: group.id, reservationId: reservation.id });
          await db.update(roomsTable).set({ status: "occupied" }).where(eq(roomsTable.id, room.id));
          autoAssigned++;
        }

        return res.status(201).json({ ...block, autoAssigned, totalRequested: qty });
      }

      res.status(201).json(block);
    } catch (error) {
      res.status(500).json({ error: "Error creating group block" });
    }
  });

  app.patch("/api/group-blocks/:id", async (req, res) => {
    try {
      const block = await storage.updateGroupBlock(req.params.id, req.body);
      if (!block) {
        return res.status(404).json({ error: "Group block not found" });
      }
      res.json(block);
    } catch (error) {
      res.status(500).json({ error: "Error updating group block" });
    }
  });

  app.delete("/api/group-blocks/:id", async (req, res) => {
    try {
      // Get block info before deletion to cancel its placeholder reservations
      const [block] = await db.select().from(groupRoomBlocks).where(eq(groupRoomBlocks.id, req.params.id));
      if (!block) return res.status(404).json({ error: "Group block not found" });

      // Cancel placeholder reservations that would exceed remaining capacity
      const group = await storage.getGroup(block.groupId);
      if (group) {
        const placeholderCode = `GROUP-${block.groupId}`;
        const remainingBlocks = group.blocks.filter(b => b.id !== req.params.id && b.roomTypeId === block.roomTypeId);
        const remainingCapacity = remainingBlocks.reduce((sum, b) => sum + b.quantity, 0);

        const allPlaceholders = group.reservations.filter((r: any) =>
          r.room?.roomTypeId === block.roomTypeId &&
          // Placeholder = no real guest assigned (null guestId) OR legacy shared placeholder guest
          (!r.guestId || r.guest?.codigo === placeholderCode) &&
          !["cancelled", "checked_out"].includes(r.status)
        );

        // Cancel excess placeholder reservations (beyond remaining capacity)
        const toCancel = allPlaceholders.slice(remainingCapacity);
        for (const res of toCancel) {
          await storage.updateReservation(res.id, { status: "cancelled" });
          if (res.roomId) {
            await db.update(roomsTable).set({ status: "available" }).where(eq(roomsTable.id, res.roomId));
          }
        }
      }

      const deleted = await storage.deleteGroupBlock(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Group block not found" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting group block" });
    }
  });

  // Assign real guest to a pre-blocked (placeholder) reservation, optionally changing room
  app.patch("/api/groups/:groupId/placeholder-reservations/:reservationId", async (req, res) => {
    try {
      const { guestFirstName, guestLastName, roomId } = req.body;
      const { groupId, reservationId } = req.params;

      if (!guestFirstName?.trim()) {
        return res.status(400).json({ error: "El nombre del pasajero es requerido" });
      }

      const firstName = guestFirstName.trim();
      const lastName = (guestLastName || "").trim();

      // Verify the reservation exists and belongs to this group
      const [link] = await db
        .select()
        .from(groupReservationLinks)
        .where(
          and(
            eq(groupReservationLinks.groupId, groupId),
            eq(groupReservationLinks.reservationId, reservationId)
          )
        )
        .limit(1);
      if (!link) {
        console.error(`[passenger-assign] Reserva ${reservationId} no pertenece al grupo ${groupId}`);
        return res.status(404).json({ error: "Reserva no encontrada en este grupo" });
      }

      // Always create a fresh guest per reservation — never reuse by name.
      // Reusing a guest by name-match means two rooms share the same guestId;
      // subsequent edits to one room appear to "replicate" to the other.
      const [newGuest] = await db.insert(guestsTable).values({
        firstName,
        lastName,
        segment: "LEISURE",
        sexo: "no_especifica",
      } as any).returning();

      if (!newGuest?.id) throw new Error("No se pudo crear el registro del huésped");

      const guestName = `${lastName} ${firstName}`.trim();

      // Handle optional room change
      let oldRoomId: string | null = null;
      let newRoomId: string | null = null;
      const reservationUpdates: Record<string, any> = {
        guestId: newGuest.id,
        guestName,
      };

      if (roomId) {
        const [currentRes] = await db
          .select()
          .from(reservationsTable)
          .where(eq(reservationsTable.id, reservationId))
          .limit(1);

        if (currentRes && roomId !== currentRes.roomId) {
          const hasConflict = await storage.checkOverbooking(roomId, currentRes.checkInDate, currentRes.checkOutDate, reservationId);
          if (hasConflict) {
            return res.status(400).json({ error: "La habitación ya tiene una reserva en esas fechas" });
          }
          const [newRoom] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));
          if (!newRoom) return res.status(404).json({ error: "Habitación no encontrada" });
          reservationUpdates.roomId = roomId;
          reservationUpdates.roomTypeId = newRoom.roomTypeId;
          oldRoomId = currentRes.roomId || null;
          newRoomId = roomId;
        }
      }

      // Direct DB update — bypass storage layer to avoid silent failures
      const [updated] = await db
        .update(reservationsTable)
        .set(reservationUpdates)
        .where(eq(reservationsTable.id, reservationId))
        .returning();

      if (!updated) {
        console.error(`[passenger-assign] updateReservation devolvió vacío para ID ${reservationId}`);
        return res.status(500).json({ error: "No se pudo actualizar la reserva" });
      }

      console.log(`[passenger-assign] OK: reserva ${reservationId} → guest ${newGuest.id} "${guestName}"`);

      // Apply room status changes only after the reservation update succeeds
      if (newRoomId) {
        if (oldRoomId) await db.update(roomsTable).set({ status: "available" }).where(eq(roomsTable.id, oldRoomId));
        await db.update(roomsTable).set({ status: "occupied" }).where(eq(roomsTable.id, newRoomId));
      }

      res.json(updated);
    } catch (error: any) {
      console.error("[passenger-assign] Error:", error?.message);
      res.status(500).json({ error: error?.message || "Error al asignar pasajero" });
    }
  });

  // Group Room Assignment
  app.post("/api/groups/:groupId/assign-room", async (req, res) => {
    try {
      const { roomId, guestFirstName, guestLastName, checkInDate, checkOutDate, agreedRate, ratePlanId } = req.body;
      if (!roomId || !guestFirstName) {
        return res.status(400).json({ error: "Room ID and guest first name are required" });
      }
      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Grupo no encontrado" });
      }
      const activeAssigned = (group.reservations || []).filter(
        (r: any) => r.status !== "cancelled" && r.status !== "checked_out"
      ).length;
      if (activeAssigned >= group.totalRooms) {
        return res.status(400).json({ 
          error: `El grupo ya tiene todas sus habitaciones asignadas (${group.totalRooms}). Para agregar más, primero agregue un bloque adicional.` 
        });
      }
      const reservation = await storage.assignRoomToGroup(
        req.params.groupId,
        roomId,
        guestFirstName,
        guestLastName,
        {
          checkInDate: checkInDate || undefined,
          checkOutDate: checkOutDate || undefined,
          agreedRate: agreedRate ? String(agreedRate) : undefined,
          ratePlanId: ratePlanId !== undefined ? ratePlanId : undefined,
        }
      );
      if (!reservation) {
        return res.status(400).json({ error: "Could not assign room to group" });
      }
      res.status(201).json(reservation);
    } catch (error: any) {
      const msg = error?.message || "Error assigning room to group";
      res.status(400).json({ error: msg });
    }
  });

  // Group Mass Actions - Check-in all group reservations
  app.post("/api/groups/:groupId/check-in-all", requireAuth, async (req, res) => {
    try {
      const result = await storage.bulkCheckIn(req.params.groupId);
      res.json({ success: result.processed, failed: result.skipped, errors: result.skippedRooms.map((r: string) => `Hab. ${r}: no disponible para check-in`) });
    } catch (error) {
      res.status(500).json({ error: "Error en check-in grupal" });
    }
  });

  app.post("/api/groups/:groupId/check-out-all", requireAuth, async (req, res) => {
    try {
      const result = await storage.bulkCheckOut(req.params.groupId);
      await audit(req, "update", "groups",
        `Check-out grupal: ${result.processed} habitaciones procesadas`,
        { entityType: "group", entityId: req.params.groupId }
      );
      res.json({ success: result.processed, failed: result.skipped, errors: result.pendingBalance.map((p: any) => `Hab. ${p.room}: saldo pendiente $${p.balance.toFixed(2)}`) });
    } catch (error) {
      res.status(500).json({ error: "Error en check-out grupal" });
    }
  });

  // Group Invoice - Get consolidated invoice data for the group
  app.get("/api/groups/:groupId/invoice", async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const groupChargesList = await storage.getGroupCharges(req.params.groupId);

      const invoiceData = {
        group: {
          code: group.groupCode,
          name: group.name,
          contactName: group.contactName,
          contactPhone: group.contactPhone,
          contactEmail: group.contactEmail,
          checkInDate: group.checkInDate,
          checkOutDate: group.checkOutDate,
        },
        reservations: [] as any[],
        groupCharges: groupChargesList.map((c: any) => ({
          description: c.description,
          amount: parseFloat(c.amount),
          category: c.category,
          date: c.createdAt,
        })),
        totals: {
          accommodation: 0,
          charges: 0,
          groupCharges: 0,
          payments: 0,
          balance: 0,
        }
      };

      for (const reservation of group.reservations) {
        const chargesList = await storage.getCharges(reservation.id);
        const paymentsList = await storage.getPayments(reservation.id);

        const checkIn = new Date(reservation.checkInDate);
        const checkOut = new Date(reservation.checkOutDate);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        const rate = parseFloat(reservation.finalRatePerNight || reservation.baseRatePerNight || "0");
        const accommodationTotal = nights * rate;

        const chargesTotal = chargesList.reduce((sum: number, c: any) => sum + parseFloat(c.amount), 0);
        const paymentsTotal = paymentsList.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        const totalCost = accommodationTotal + chargesTotal;

        invoiceData.reservations.push({
          reservationCode: reservation.reservationCode,
          guest: (reservation.guest as any)?.tipoPersona === "juridica"
            ? (reservation.guest?.firstName ?? "")
            : `${reservation.guest?.lastName ?? ""} ${reservation.guest?.firstName ?? ""}`.trim(),
          room: reservation.room?.roomNumber,
          nights,
          ratePerNight: rate,
          accommodationTotal,
          charges: chargesList.map((c: any) => ({
            description: c.description,
            amount: parseFloat(c.amount),
            category: c.category,
            date: c.date,
          })),
          chargesTotal,
          payments: paymentsList.map((p: any) => ({
            method: p.method,
            amount: parseFloat(p.amount),
            date: p.date,
            reference: p.reference,
          })),
          paymentsTotal,
          balance: totalCost - paymentsTotal,
        });

        invoiceData.totals.accommodation += accommodationTotal;
        invoiceData.totals.charges += chargesTotal;
        invoiceData.totals.payments += paymentsTotal;
      }

      invoiceData.totals.groupCharges = groupChargesList.reduce((s: number, c: any) => s + parseFloat(c.amount), 0);
      invoiceData.totals.balance =
        invoiceData.totals.accommodation +
        invoiceData.totals.charges +
        invoiceData.totals.groupCharges -
        invoiceData.totals.payments;

      res.json(invoiceData);
    } catch (error) {
      res.status(500).json({ error: "Error generating group invoice" });
    }
  });

  app.post("/api/groups/:groupId/payment", async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const { amount, method, reference, receiptType, distribution, closeAllRooms, ccEntityType, ccEntityId } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }

      if (method === "cuenta_corriente" && (!ccEntityType || !ccEntityId)) {
        return res.status(400).json({ error: "ccEntityType and ccEntityId are required for cuenta_corriente" });
      }

      const totalAmount = parseFloat(amount);
      if (totalAmount <= 0) {
        return res.status(400).json({ error: "Amount must be positive" });
      }

      const activeReservations = group.reservations.filter(
        (r: any) => r.status === "confirmed" || r.status === "checked_in"
      );

      if (activeReservations.length === 0) {
        return res.status(400).json({ error: "No hay reservas activas (confirmadas o en casa) para registrar pagos" });
      }

      const today = getArgentinaToday();
      const refText = reference || `Pago grupal${closeAllRooms ? " (cierre total)" : ""} - ${group.name}`;

      const registerCcMovement = async (reservation: any, paymentAmt: number) => {
        if (method !== "cuenta_corriente" || paymentAmt <= 0.001) return;
        const guest = reservation.guest;
        const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Huésped";
        const roomNum = reservation.room?.roomNumber || reservation.roomId;
        try {
          await storage.createAccountMovement({
            entityType: ccEntityType,
            entityId: ccEntityId,
            date: today,
            type: "cargo",
            description: `Pago grupal ${group.name} — Hab. ${roomNum}`,
            amount: paymentAmt.toFixed(2),
            reservationId: reservation.id,
            reservationCode: reservation.reservationCode,
            guestName,
            reference: refText,
          });
        } catch (e) {
          console.error("Error creating group CC account movement:", e);
        }
      };

      let balanceDiff = 0;
      if (closeAllRooms) {
        let totalGroupDebt = 0;
        for (const reservation of activeReservations) {
          const chargesTotal = await storage.getChargesTotal(reservation.id);
          const paymentsTotal = await storage.getPaymentsTotal(reservation.id);
          const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
          totalGroupDebt += roomTotal + chargesTotal - paymentsTotal;
        }
        balanceDiff = totalAmount - totalGroupDebt;
      }

      const createdPaymentIds: string[] = [];

      if (distribution === "proportional") {
        let totalCost = 0;
        const costs: { id: string; cost: number; balance: number }[] = [];
        for (const reservation of activeReservations) {
          const chargesTotal = await storage.getChargesTotal(reservation.id);
          const paymentsTotal = await storage.getPaymentsTotal(reservation.id);
          const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
          const balance = roomTotal + chargesTotal - paymentsTotal;
          const cost = roomTotal + chargesTotal;
          costs.push({ id: reservation.id, cost, balance });
          totalCost += cost;
        }
        for (const item of costs) {
          let paymentAmt: number;
          if (closeAllRooms) {
            paymentAmt = Math.max(0, item.balance);
          } else {
            const proportion = totalCost > 0 ? item.cost / totalCost : 1 / costs.length;
            paymentAmt = totalAmount * proportion;
          }
          if (paymentAmt > 0.001) {
            const p = await storage.createPayment({
              reservationId: item.id,
              amount: paymentAmt.toFixed(2),
              method,
              reference: refText,
              date: today,
              ...(method === "cuenta_corriente" ? { billingTarget: ccEntityType } : {}),
            });
            if (p?.id) createdPaymentIds.push(String(p.id));
            const reservation = activeReservations.find((r: any) => r.id === item.id);
            if (reservation) await registerCcMovement(reservation, paymentAmt);
          }
        }
      } else {
        const perRoom = totalAmount / activeReservations.length;
        for (const reservation of activeReservations) {
          const p = await storage.createPayment({
            reservationId: reservation.id,
            amount: perRoom.toFixed(2),
            method,
            reference: refText,
            date: today,
            ...(method === "cuenta_corriente" ? { billingTarget: ccEntityType } : {}),
          });
          if (p?.id) createdPaymentIds.push(String(p.id));
          await registerCcMovement(reservation, perRoom);
        }
      }

      let checkoutCount = 0;
      if (closeAllRooms) {
        for (const reservation of activeReservations) {
          if (reservation.status !== "checked_in") continue;

          await db.insert(reservationChangelog).values({
            reservationId: reservation.id,
            fecha: new Date(),
            operador: (req as any).user?.username || "sistema",
            tipo: "checkout_grupal",
            descripcion: `Check-out grupal con pago centralizado. Grupo: ${group.name}. Monto total: $${totalAmount.toFixed(2)}.`,
          });

          await storage.updateReservation(reservation.id, { status: "checked_out" });
          await storage.updateRoom(reservation.roomId, { status: "dirty" });

          try {
            await db.insert(housekeepingTasks).values({
              id: randomUUID(),
              roomId: reservation.roomId,
              type: "checkout_clean",
              priority: "high",
              status: "pending",
              notes: `Check-out grupal (pago centralizado) — ${group.name}`,
              createdAt: new Date(),
            } as any);
          } catch {}

          checkoutCount++;
        }

        const updatedGroup = await storage.getGroup(req.params.groupId);
        if (updatedGroup) {
          const allDone = updatedGroup.reservations.every(
            (r: any) => r.status === "checked_out" || r.status === "cancelled"
          );
          if (allDone) {
            await storage.updateGroup(req.params.groupId, { status: "finished" as any });
          }
        }
      }

      res.json({
        success: true,
        distributed: activeReservations.length,
        checkoutCount,
        balanceDiff: closeAllRooms ? balanceDiff : undefined,
        paymentIds: createdPaymentIds,
        paymentId: createdPaymentIds[0] ?? null,
      });
    } catch (error) {
      console.error("Error processing group payment:", error);
      res.status(500).json({ error: "Error processing group payment" });
    }
  });

  // Group Folio endpoints
  app.get("/api/groups/:groupId/folio", requireAuth, async (req, res) => {
    try {
      const folio = await storage.getGroupFolio(req.params.groupId);
      res.json(folio);
    } catch (error: any) {
      if (error.message === "Grupo no encontrado") return res.status(404).json({ error: error.message });
      console.error("[folio-grupal] Error:", error);
      res.status(500).json({ error: "Error al obtener folio grupal" });
    }
  });

  app.post("/api/groups/:groupId/charges", requireAuth, async (req, res) => {
    try {
      const { description, amount, date, category } = req.body;
      if (!description || !amount || !date) {
        return res.status(400).json({ error: "description, amount y date son requeridos" });
      }
      const charge = await storage.createGroupCharge({
        groupId: req.params.groupId,
        description,
        amount: parseFloat(amount).toFixed(2),
        date,
        category: category || "otros",
        billingTarget: "group",
        reservationId: null,
        createdBy: (req.user as any)?.username || null,
      });
      res.json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error al crear cargo grupal" });
    }
  });

  app.delete("/api/groups/:groupId/charges/:chargeId", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteGroupCharge(req.params.chargeId);
      if (!ok) return res.status(404).json({ error: "Cargo no encontrado" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar cargo grupal" });
    }
  });

  app.get("/api/groups/:groupId/payments", requireAuth, async (req, res) => {
    try {
      const payments = await storage.getGroupPayments(req.params.groupId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener pagos grupales" });
    }
  });

  app.post("/api/groups/:groupId/payment/v2", requireAuth, async (req, res) => {
    try {
      const { amount, method, date, reference, distribution, distributionDetail, notes } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount y method son requeridos" });
      }
      const totalAmount = parseFloat(amount);
      if (totalAmount <= 0) return res.status(400).json({ error: "El monto debe ser positivo" });

      const paymentDate = date || new Date().toISOString().split("T")[0];
      const distrib = distribution || "equal";

      const detail = await storage.distributeGroupPayment(
        req.params.groupId,
        totalAmount,
        distrib,
        distributionDetail
      );

      const groupPayment = await storage.createGroupPayment({
        groupId: req.params.groupId,
        amount: totalAmount.toFixed(2),
        method,
        date: paymentDate,
        reference: reference || null,
        distribution: distrib,
        distributionDetail: detail,
        receivedBy: (req.user as any)?.username || null,
        notes: notes || null,
      });

      // Validate: the sum of distributed amounts must not exceed the total payment.
      // This prevents duplication in case of floating-point rounding drift.
      const distributedSum = Object.values(detail).reduce((s, v) => s + (v as number), 0);
      if (distributedSum > totalAmount + 0.01) {
        return res.status(400).json({
          error: `Inconsistencia en la distribución: la suma de partes (${distributedSum.toFixed(2)}) supera el total (${totalAmount.toFixed(2)}). Revise los montos.`,
        });
      }

      // Apply a rounding correction to the last reservation so the sum is exact.
      const resIds = Object.keys(detail).filter(id => (detail[id] as number) > 0);
      if (resIds.length > 1) {
        const sumWithoutLast = resIds.slice(0, -1).reduce((s, id) => s + parseFloat((detail[id] as number).toFixed(2)), 0);
        const lastId = resIds[resIds.length - 1];
        (detail as any)[lastId] = Math.max(0, totalAmount - sumWithoutLast);
      }

      for (const [reservationId, amt] of Object.entries(detail)) {
        if ((amt as number) > 0.005) {
          await storage.createPayment({
            reservationId,
            amount: (amt as number).toFixed(2),
            method,
            reference: reference || `Pago grupal`,
            date: paymentDate,
            groupPaymentId: groupPayment.id,
          } as any);
        }
      }

      await audit(req, "create", "groups",
        `Pago grupal: $${req.body.amount} (${req.body.method})`,
        { entityType: "group", entityId: req.params.groupId }
      );
      res.json({ success: true, groupPayment, distributed: Object.keys(detail).length });
    } catch (error) {
      res.status(500).json({ error: "Error al registrar pago grupal" });
    }
  });

  app.post("/api/groups/:groupId/transfer-charge", requireAuth, async (req, res) => {
    try {
      const { chargeId } = req.body;
      if (!chargeId) return res.status(400).json({ error: "chargeId es requerido" });
      const transferred = await storage.transferChargeToGroup(chargeId, req.params.groupId);
      // Also delete the source charge to avoid double-counting
      try { await storage.deleteCharge(chargeId); } catch {}
      res.json(transferred);
    } catch (error: any) {
      if (error.message === "Cargo no encontrado") return res.status(404).json({ error: error.message });
      res.status(500).json({ error: "Error al transferir cargo" });
    }
  });

  // POST reverse a group-folio charge (undo a transfer-to-group or manually added group charge)
  // Guard: chargeId must be present in the request body — a missing value must never reach
  // the DB layer and produce a confusing generic error.
  app.post("/api/groups/:groupId/reverse-transfer-charge", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { chargeId } = req.body;

      if (!chargeId) return res.status(400).json({ error: "Se requiere chargeId" });

      // Verify the group exists
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      // Fetch the charge and verify it belongs to this group
      const [charge] = await db
        .select()
        .from(groupChargesTable)
        .where(eq(groupChargesTable.id, chargeId))
        .limit(1);
      if (!charge) return res.status(404).json({ error: "Cargo no encontrado" });
      if (charge.groupId !== groupId) {
        return res.status(403).json({ error: "El cargo no pertenece a este grupo" });
      }

      await storage.deleteGroupCharge(chargeId);

      // If the group charge originated from a reservation transfer, recreate
      // the charge on that reservation so the room folio remains complete.
      // Guard: skip recreation if an active charge with the same reservationId,
      // amount, and description already exists (e.g. the source charge was never
      // deleted during the original transfer), to prevent duplicate entries.
      let recreated = false;
      let alreadyExists = false;
      if (charge.reservationId) {
        const existingCharges = await storage.getCharges(charge.reservationId);
        const duplicate = existingCharges.find(
          (c: any) =>
            c.status !== "anulado" &&
            c.description === charge.description &&
            String(c.amount) === String(charge.amount)
        );
        if (duplicate) {
          alreadyExists = true;
        } else {
          await storage.createCharge({
            reservationId: charge.reservationId,
            description: charge.description,
            amount: charge.amount,
            date: charge.date,
            category: (charge.category as any) || "otros",
            status: "active",
          });
          recreated = true;
        }
      }

      await audit(req, "delete", "groups",
        `Cargo grupal revertido: ${charge.description} ($${charge.amount})${recreated ? ` (cargo restaurado en reserva ${charge.reservationId})` : ""}`,
        { entityType: "group", entityId: groupId }
      );

      res.json({ success: true, reversed: parseFloat(charge.amount), recreated, alreadyExists });
    } catch (error) {
      console.error("[reverse-group-charge] Error:", error);
      res.status(500).json({ error: "Error al revertir el cargo grupal" });
    }
  });

  // ─── MASTER FOLIO ───────────────────────────────────────────────────────────

  // GET master folio data — breakdown for the organizer's folio
  app.get("/api/groups/:groupId/master-folio", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const config = (group as any).masterFolioConfig || "accommodation";
      const gCharges = await storage.getGroupCharges(req.params.groupId);
      const gPayments = await storage.getGroupPayments(req.params.groupId);

      // Build per-room data
      const rooms: any[] = [];
      let masterAccommodation = 0;
      let masterExtras = 0;
      let masterTransferred = 0;

      for (const res of group.reservations) {
        if (res.status === "cancelled") continue;
        const resCharges = await storage.getCharges(res.id);
        const resPayments = await storage.getPayments(res.id);

        const accommodation = parseFloat((res as any).totalRoomAmount || "0");
        const activeCharges = resCharges.filter((c: any) => c.status !== "anulado");
        const extras = activeCharges.reduce((s: number, c: any) => s + parseFloat(c.amount), 0);
        const paid = resPayments.reduce((s: number, p: any) => s + parseFloat(p.amount), 0);

        masterAccommodation += accommodation;
        if (config === "all") masterExtras += extras;

        rooms.push({
          reservationId: res.id,
          guestName: (res.guest as any)?.tipoPersona === "juridica"
            ? (res.guest?.firstName || "")
            : `${res.guest?.lastName || ""} ${res.guest?.firstName || ""}`.trim(),
          roomNumber: res.room?.roomNumber || "-",
          status: res.status,
          nights: res.nights || 0,
          accommodation,
          extras,
          charges: activeCharges.map((c: any) => ({
            id: c.id,
            description: (c.description || "").replace(/\s*\[(xfer|corr|res):[^\]]+\]/g, "").trim(),
            amount: parseFloat(c.amount),
            date: c.date,
            category: c.category,
          })),
          individualPayments: resPayments.map((p: any) => ({
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.method,
            invoiceRef: p.invoiceRef ?? null,
            date: p.date,
          })),
          // balance that remains on the individual folio
          individualBalance: config === "accommodation"
            ? extras - paid  // accommodation covered by master
            : config === "all"
              ? 0 - paid  // everything covered by master
              : accommodation + extras - paid, // nothing covered by master
        });
      }

      // Group charges (events, services) always go to master
      const groupChargesTotal = gCharges.reduce((s: number, c: any) => s + parseFloat(c.amount), 0);

      // Total master folio charges
      const masterTotal = masterAccommodation + masterExtras + groupChargesTotal + masterTransferred;

      // Payments received: use individual reservation payments as source of truth
      // (includes master folio distributions + any direct payments to individual rooms)
      const indivPaid = rooms.reduce((s: number, r: any) => s + r.individualPayments.reduce((ps: number, p: any) => ps + p.amount, 0), 0);
      const gPaid = gPayments.reduce((s: number, p: any) => s + parseFloat(p.amount), 0);
      // Take the larger value to avoid double-counting when both records exist
      const masterPaid = Math.max(gPaid, indivPaid);
      const masterBalance = masterTotal - masterPaid;

      res.json({
        config,
        masterTotal,
        masterAccommodation,
        masterExtras,
        groupChargesTotal,
        masterPaid,
        masterBalance,
        groupCharges: gCharges,
        groupPayments: gPayments,
        rooms,
      });
    } catch (error: any) {
      console.error("master-folio error:", error);
      res.status(500).json({ error: "Error al obtener folio maestro" });
    }
  });

  // POST master payment — pays the master folio, distributes to individual rooms
  app.post("/api/groups/:groupId/master-payment", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      // Support multi-row payments: { paymentRows: [{method, amount, reference}], receiptType, billingEntityType, billingEntityId }
      // Backward compat: { amount, method, reference }
      const { paymentRows, amount, method, date, reference, notes, receiptType, billingEntityType, billingEntityId } = req.body;
      const rows: Array<{ method: string; amount: string; reference?: string }> =
        Array.isArray(paymentRows) && paymentRows.length > 0
          ? paymentRows
          : [{ method: method ?? "cash", amount: amount ?? "0", reference: reference ?? undefined }];

      const totalAmount = rows.reduce((s, r) => s + parseFloat(r.amount || "0"), 0);
      if (!rows.length || totalAmount <= 0) return res.status(400).json({ error: "Monto total debe ser positivo" });

      const config = (group as any).masterFolioConfig || "accommodation";
      const paymentDate = date || getArgentinaToday();

      const activeRes = group.reservations.filter(
        (r: any) => r.status === "confirmed" || r.status === "checked_in"
      );

      // Build room distribution proportions (same logic for all rows)
      let roomShares: { id: string; share: number }[] = [];
      let totalShare = 0;
      if (config === "accommodation" || config === "all") {
        for (const r of activeRes) {
          const accommodation = parseFloat((r as any).totalRoomAmount || "0");
          let share = accommodation;
          if (config === "all") {
            const resCharges = await storage.getCharges(r.id);
            const extras = resCharges
              .filter((c: any) => c.status !== "anulado")
              .reduce((s: number, c: any) => s + parseFloat(c.amount), 0);
            share += extras;
          }
          roomShares.push({ id: r.id, share });
          totalShare += share;
        }
      }

      const allCreatedPaymentIds: string[] = [];
      const groupPayments: any[] = [];

      // Process each payment row independently
      for (const row of rows) {
        const rowAmount = parseFloat(row.amount || "0");
        if (rowAmount <= 0.005) continue;

        // Compute proportional distribution for this row's amount
        let distribution: Record<string, number> = {};
        if (roomShares.length > 0) {
          let totalDistributed = 0;
          for (const { id, share } of roomShares.slice(0, -1)) {
            const proportional = totalShare > 0
              ? (share / totalShare) * rowAmount
              : rowAmount / (activeRes.length || 1);
            const capped = Math.min(proportional, share);
            const rounded = Math.round(capped * 100) / 100;
            distribution[id] = rounded;
            totalDistributed += rounded;
          }
          if (roomShares.length > 0) {
            const last = roomShares[roomShares.length - 1];
            const remainder = Math.max(0, rowAmount - totalDistributed);
            distribution[last.id] = Math.min(remainder, last.share);
          }
        }

        // Create group payment record
        const groupPayment = await storage.createGroupPayment({
          groupId: req.params.groupId,
          amount: rowAmount.toFixed(2),
          method: row.method,
          date: paymentDate,
          reference: row.reference || `Pago Folio Maestro — ${group.name}`,
          distribution: "master_folio",
          distributionDetail: distribution,
          receivedBy: (req.user as any)?.username || null,
          notes: notes || null,
          receiptType: receiptType || "none",
          billingEntityType: billingEntityType || null,
          billingEntityId: billingEntityId || null,
          paymentMethodDetail: rows.length > 1 ? rows : null,
        } as any);
        groupPayments.push(groupPayment);

        // Apply individual room payments
        for (const [reservationId, amt] of Object.entries(distribution)) {
          if ((amt as number) > 0.005) {
            const p = await storage.createPayment({
              reservationId,
              amount: (amt as number).toFixed(2),
              method: row.method,
              reference: row.reference || `Pago Folio Maestro — ${group.name}`,
              date: paymentDate,
              groupPaymentId: groupPayment.id,
            } as any);
            if (p?.id) allCreatedPaymentIds.push(String(p.id));
          }
        }
      }

      await audit(req, "create", "groups",
        `Pago Folio Maestro: $${totalAmount.toFixed(2)} (${rows.map(r => r.method).join("+")}) — config: ${config}`,
        { entityType: "group", entityId: req.params.groupId }
      );

      res.json({
        success: true,
        groupPayment: groupPayments[0],
        paymentId: allCreatedPaymentIds[0] ?? null,
        paymentIds: allCreatedPaymentIds,
        distributed: allCreatedPaymentIds.length,
      });
    } catch (error: any) {
      console.error("master-payment error:", error);
      res.status(500).json({ error: "Error al registrar pago maestro" });
    }
  });

  // ─── UNASSIGN RESERVATION FROM GROUP ────────────────────────────────────────
  app.delete("/api/groups/:groupId/reservations/:reservationId", requireAuth, async (req, res) => {
    try {
      const { groupId, reservationId } = req.params;
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const reservation = group.reservations.find(r => r.id === reservationId);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada en el grupo" });

      if (!["confirmed", "pending", "tentative"].includes(reservation.status)) {
        return res.status(400).json({ error: "Solo se pueden desasignar reservas confirmadas, pendientes o tentativas" });
      }

      // Verificar que no tenga cargos extras antes de desasignar
      const chargesCheck = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM folio_movements
        WHERE reservation_id = ${reservationId}
          AND type = 'charge'
          AND source_type NOT IN ('accommodation', 'transfer', 'transfer_reversal')
      `);
      const chargeCount = parseInt(String(chargesCheck.rows[0]?.cnt ?? "0"));
      if (chargeCount > 0) {
        return res.status(400).json({
          error: `Esta reserva tiene ${chargeCount} cargo(s) extra registrado(s). Eliminá o revertí los cargos antes de desasignarla del grupo.`
        });
      }

      // Cancel the reservation
      await storage.updateReservation(reservationId, { status: "cancelled" });

      // Free the room
      if (reservation.roomId) {
        await db.update(roomsTable).set({ status: "available" }).where(eq(roomsTable.id, reservation.roomId));
      }

      // Auto-adjust group block: decrement quantity so ghost disappears from planning
      try {
        const blocks = await db.select().from(groupRoomBlocks)
          .where(eq(groupRoomBlocks.groupId, groupId));
        const resRoomTypeId = (reservation as any).room?.roomTypeId ?? (reservation as any).roomTypeId;
        const matchingBlock = blocks.find(b => b.roomTypeId === resRoomTypeId);
        if (matchingBlock) {
          if (matchingBlock.quantity <= 1) {
            await db.delete(groupRoomBlocks).where(eq(groupRoomBlocks.id, matchingBlock.id));
          } else {
            await db.update(groupRoomBlocks)
              .set({ quantity: matchingBlock.quantity - 1 })
              .where(eq(groupRoomBlocks.id, matchingBlock.id));
          }
        }
      } catch (e) {
        console.error("[unassign] Error ajustando bloque de grupo:", e);
      }

      // Remove the group link
      await db.delete(groupReservationLinks).where(eq(groupReservationLinks.reservationId, reservationId));

      await audit(req, "delete", "groups",
        `Reserva ${reservation.reservationCode} desasignada del grupo ${group.name}`,
        { entityType: "group", entityId: groupId }
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("unassign-reservation error:", error);
      res.status(500).json({ error: "Error al desasignar reserva" });
    }
  });

  // ─── UPDATE RESERVATION RATE + LATE CHECKOUT (from group view) ──────────────
  app.patch("/api/groups/:groupId/reservations/:reservationId/rate", requireAuth, async (req, res) => {
    try {
      const { groupId, reservationId } = req.params;
      const { finalRatePerNight, lateCheckOut, lateCheckOutTime } = req.body;

      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const reservation = group.reservations.find(r => r.id === reservationId);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada en el grupo" });

      const updateData: Record<string, any> = {};

      if (finalRatePerNight !== undefined && finalRatePerNight !== "") {
        const rate = parseFloat(finalRatePerNight);
        if (isNaN(rate) || rate < 0) return res.status(400).json({ error: "Tarifa inválida" });
        const checkIn = new Date(reservation.checkInDate);
        const checkOut = new Date(reservation.checkOutDate);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        updateData.finalRatePerNight = rate.toFixed(2);
        updateData.totalRoomAmount = (rate * nights).toFixed(2);
      }

      if (lateCheckOut !== undefined) updateData.lateCheckOut = Boolean(lateCheckOut);
      if (lateCheckOutTime !== undefined) updateData.lateCheckOutTime = lateCheckOutTime || null;

      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "Sin cambios para aplicar" });

      await storage.updateReservation(reservationId, updateData);

      await audit(req, "update", "reservations",
        `Tarifa/late checkout actualizado desde grupo ${group.name}: $${finalRatePerNight ?? "sin cambio"}`,
        { entityType: "reservation", entityId: reservationId }
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("update-rate error:", error);
      res.status(500).json({ error: "Error al actualizar tarifa" });
    }
  });

  // ─── MASTER FOLIO PDF ────────────────────────────────────────────────────────
  app.get("/api/groups/:groupId/master-folio/pdf", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const config = (group as any).masterFolioConfig || "accommodation";
      const gCharges = await storage.getGroupCharges(req.params.groupId);
      const gPayments = await storage.getGroupPayments(req.params.groupId);

      // Fetch void movements via the group folio helper
      const folioData = await storage.getGroupFolio(req.params.groupId);
      const voidMovements = folioData?.voidMovements ?? [];
      const voidMovementsTotal = folioData?.voidMovementsTotal ?? 0;

      // Build per-room data
      let masterAccommodation = 0;
      let masterExtras = 0;
      const roomRows: any[] = [];

      for (const reservation of group.reservations) {
        if (reservation.status === "cancelled") continue;
        const resCharges = await storage.getCharges(reservation.id);
        const resPayments = await storage.getPayments(reservation.id);
        const accommodation = parseFloat((reservation as any).totalRoomAmount || "0");
        const extras = resCharges.filter((c: any) => c.status !== "anulado").reduce((s: number, c: any) => s + parseFloat(c.amount), 0);
        // Exclude voided payments from balance so voids restore the owed amount (mirrors on-screen folio)
        const activePmts = resPayments.filter((p: any) => p.status !== "anulado");
        const paid = activePmts.reduce((s: number, p: any) => s + parseFloat(p.amount), 0);
        const individualPayments = resPayments.map((p: any) => ({
          amount: parseFloat(p.amount),
          method: p.method || "",
          reference: p.reference || null,
          invoiceRef: (p as any).invoiceRef ?? null,
          date: p.date || null,
          status: (p as any).status || null,
        }));
        const activeCharges = resCharges.filter((c: any) => c.status !== "anulado");
        masterAccommodation += accommodation;
        if (config === "all") masterExtras += extras;
        roomRows.push({ reservation, accommodation, extras, paid, individualPayments, activeCharges });
      }

      const groupChargesTotal = gCharges.reduce((s: number, c: any) => s + parseFloat(c.amount), 0);
      const masterTotal = masterAccommodation + masterExtras + groupChargesTotal;
      // Use active reservation payments as the authoritative paid amount (mirrors getGroupFolio).
      // gPayments is kept for display/audit only; it is not void-aware and must not drive the balance.
      const masterPaid = roomRows.reduce((s: number, r: any) => s + r.paid, 0);
      const masterBalance = masterTotal - masterPaid;

      // Generate PDF
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="folio-maestro-${group.groupCode}.pdf"`);
        res.send(pdfBuffer);
      });

      const HOTEL = "Maran Suites & Towers";
      const ADDR = "Alameda de la Federación 698, Paraná, Entre Ríos";
      const pageW = 595 - 80;

      // Header
      doc.fontSize(18).font("Helvetica-Bold").text(HOTEL, 40, 40);
      doc.fontSize(9).font("Helvetica").fillColor("#666666").text(ADDR, 40, 62);
      doc.fillColor("#000000");

      doc.moveTo(40, 80).lineTo(555, 80).lineWidth(1.5).stroke("#1a1a1a");

      doc.fontSize(14).font("Helvetica-Bold").text("DETALLE DE CUENTA", 40, 90);
      doc.fontSize(9).font("Helvetica").fillColor("#555555");
      const coverageLabel = config === "accommodation" ? "Cubre: Solo Alojamiento" : config === "all" ? "Cubre: Alojamiento + Extras" : "Sin cobertura grupal";
      const configLabel = billingEntityName ? `${coverageLabel} | Factura: ${billingEntityName}` : coverageLabel;
      doc.text(configLabel, 40, 108);
      doc.fillColor("#000000");

      // Group info
      let y = 130;
      doc.fontSize(10).font("Helvetica-Bold").text("Grupo:", 40, y);
      doc.font("Helvetica").text(group.name, 110, y);
      y += 16;
      doc.font("Helvetica-Bold").text("Código:", 40, y);
      doc.font("Helvetica").text(group.groupCode, 110, y);
      y += 16;
      const fmtAR = (d: string) => d ? d.split("-").reverse().join("/") : "";
      doc.font("Helvetica-Bold").text("Check-in:", 40, y);
      doc.font("Helvetica").text(fmtAR(group.checkInDate), 110, y);
      doc.font("Helvetica-Bold").text("Check-out:", 250, y);
      doc.font("Helvetica").text(fmtAR(group.checkOutDate), 330, y);
      y += 16;
      if (group.contactName) {
        doc.font("Helvetica-Bold").text("Contacto:", 40, y);
        doc.font("Helvetica").text(group.contactName, 110, y);
        y += 16;
      }

      y += 8;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      y += 12;

      // Room breakdown table header
      const extrasColLabel = config === "none" ? "EXTRAS (directo)" : "EXTRAS";
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#555555")
        .text("HAB.", 40, y)
        .text("HUÉSPED", 80, y)
        .text("NOCHES", 280, y, { align: "right", width: 60 })
        .text("ALOJAMIENTO", 350, y, { align: "right", width: 80 })
        .text(extrasColLabel, 440, y, { align: "right", width: 60 })
        .text("PAGADO", 505, y, { align: "right", width: 50 });
      y += 4;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      y += 8;
      doc.fillColor("#000000");

      for (const row of roomRows) {
        const res = row.reservation;
        const guest = res.guest
          ? ((res.guest as any).tipoPersona === "juridica"
              ? res.guest.firstName
              : `${res.guest.lastName} ${res.guest.firstName}`.trim())
          : "Sin asignar";
        const checkIn = new Date(res.checkInDate);
        const checkOut = new Date(res.checkOutDate);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

        if (y > 740) {
          doc.addPage();
          y = 40;
        }

        doc.fontSize(9).font("Helvetica")
          .text(res.room?.roomNumber || "-", 40, y)
          .text(guest.substring(0, 26), 80, y)
          .text(String(nights), 280, y, { align: "right", width: 60 })
          .text(`$${row.accommodation.toLocaleString("es-AR")}`, 350, y, { align: "right", width: 80 })
          .text(row.extras > 0 ? `$${row.extras.toLocaleString("es-AR")}` : "-", 440, y, { align: "right", width: 60 })
          .text(`$${row.paid.toLocaleString("es-AR")}`, 505, y, { align: "right", width: 50 });
        y += 14;

        // Per-charge sub-rows (with ND amber styling) — always shown regardless of masterFolioConfig
        if (row.activeCharges && row.activeCharges.length > 0) {
          for (const c of row.activeCharges) {
            if (y > 740) { doc.addPage(); y = 40; }
            const cleanDesc = (c.description || "").replace(/\s*\[(xfer|corr|res):[^\]]+\]/g, "").trim();
            const isND = c.category === "nota_debito";
            if (isND) {
              doc.rect(80, y - 1, 475, 13).fillColor("#fef3e2").fill()
                .rect(80, y - 1, 475, 13).strokeColor("#f59e0b").lineWidth(0.5).stroke();
              doc.fontSize(8).font("Helvetica-Bold").fillColor("#92400e")
                .text(`  • ${cleanDesc.substring(0, 40)}`, 90, y, { width: 340 })
                .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 440, y, { align: "right", width: 60 });
              doc.font("Helvetica").fillColor("#000000");
            } else {
              doc.fontSize(8).font("Helvetica").fillColor("#555555")
                .text(`  • ${cleanDesc.substring(0, 40)}`, 90, y, { width: 340 })
                .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 440, y, { align: "right", width: 60 });
              doc.fillColor("#000000");
            }
            y += 12;
          }
          y += 2;
        }

        // Per-payment sub-rows with invoice badge
        if (row.individualPayments && row.individualPayments.length > 0) {
          for (const pmt of row.individualPayments) {
            if (y > 740) { doc.addPage(); y = 40; }
            const methodLabel = pmt.method
              ? pmt.method.charAt(0).toUpperCase() + pmt.method.slice(1).replace(/_/g, " ")
              : "";
            let pmtLabel = methodLabel;
            if (pmt.reference) pmtLabel += ` (${pmt.reference})`;
            doc.fontSize(7.5).font("Helvetica").fillColor("#555555")
              .text("", 80, y) // indent
              .text(`  • ${pmtLabel}`, 90, y, { width: 300 });
            if (pmt.invoiceRef) {
              // Parse JSON invoiceRef and format as human-readable fiscal badge
              let badgeText: string | null = null;
              try {
                const ref = typeof pmt.invoiceRef === "string" ? JSON.parse(pmt.invoiceRef) : pmt.invoiceRef;
                const tipo = ref.tipo_comprobante ?? ref.tipoComprobante ?? "FAC";
                const pv = String(ref.punto_venta ?? ref.puntoVenta ?? 0).padStart(4, "0");
                const num = String(ref.numero ?? 0).padStart(8, "0");
                badgeText = `${tipo} ${pv}-${num}`;
              } catch {
                // unparseable — skip badge
              }
              if (badgeText) {
                const badgeX = 395;
                const badgeW = Math.min(doc.widthOfString(badgeText, { fontSize: 7 }) + 10, 150);
                doc.save()
                  .roundedRect(badgeX, y - 1, badgeW, 11, 3)
                  .fillAndStroke("#e8f4fd", "#3b82f6")
                  .restore();
                doc.fontSize(7).font("Helvetica-Bold").fillColor("#1d4ed8")
                  .text(badgeText, badgeX + 5, y + 1, { width: badgeW - 10 });
                doc.fillColor("#555555");
              }
            }
            doc.fontSize(7.5).font("Helvetica").fillColor("#555555")
              .text(`$${pmt.amount.toLocaleString("es-AR")}`, 505, y, { align: "right", width: 50 });
            doc.fillColor("#000000");
            y += 12;
          }
          y += 2;
        } else {
          y += 2;
        }
      }

      y += 4;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      y += 8;

      // Coverage legend note below room table
      {
        let legendText: string;
        const entityRef = billingEntityName ? billingEntityName : "el organizador";
        if (config === "none") {
          legendText = `(*) Columna EXTRAS (directo): cargos facturados al huésped, no cubiertos por ${entityRef}.`;
        } else if (config === "accommodation") {
          legendText = `(*) Columna EXTRAS: cargos adicionales facturados directamente al huésped. Solo el alojamiento está cubierto por ${entityRef}.`;
        } else {
          // "all"
          legendText = `(*) Columna EXTRAS: alojamiento y extras cubiertos por ${entityRef}. Sin cargos directos al huésped por estas columnas.`;
        }
        if (y > 740) { doc.addPage(); y = 40; }
        doc.fontSize(7.5).font("Helvetica").fillColor("#666666").text(legendText, 40, y, { width: 515 });
        y += 14;
        doc.fillColor("#000000");
      }

      y += 4;

      // Group charges
      if (gCharges.length > 0) {
        doc.fontSize(9).font("Helvetica-Bold").text("Cargos grupales:", 40, y);
        y += 14;
        for (const c of gCharges) {
          if (y > 740) { doc.addPage(); y = 40; }
          const cleanDesc = (c.description || "").replace(/\s*\[(xfer|corr|res):[^\]]+\]/g, "").trim();
          const isND = (c as any).category === "nota_debito";
          if (isND) {
            doc.rect(40, y - 1, 515, 14).fillColor("#fef3e2").fill()
              .rect(40, y - 1, 515, 14).strokeColor("#f59e0b").lineWidth(0.5).stroke();
            doc.fontSize(9).font("Helvetica-Bold").fillColor("#92400e")
              .text(cleanDesc, 50, y)
              .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
            doc.font("Helvetica").fillColor("#000000");
          } else {
            doc.fontSize(9).font("Helvetica").fillColor("#000000")
              .text(cleanDesc, 50, y)
              .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
          }
          y += 14;
        }
        y += 4;
        doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
        y += 12;
      }

      // Totals
      const totals = [
        ["Total alojamiento", `$${masterAccommodation.toLocaleString("es-AR")}`],
        ...(config === "all" ? [["Extras (habitaciones)", `$${masterExtras.toLocaleString("es-AR")}`]] : []),
        ...(groupChargesTotal > 0 ? [["Cargos grupales", `$${groupChargesTotal.toLocaleString("es-AR")}`]] : []),
        ["TOTAL DETALLE DE CUENTA", `$${masterTotal.toLocaleString("es-AR")}`],
        ["Pagado", `$${masterPaid.toLocaleString("es-AR")}`],
        ...(voidMovementsTotal > 0 ? [["Anulaciones (NC)", `$${voidMovementsTotal.toLocaleString("es-AR")}`]] : []),
        ["SALDO PENDIENTE", `$${masterBalance.toLocaleString("es-AR")}`],
      ];

      for (const [label, value] of totals) {
        if (y > 740) { doc.addPage(); y = 40; }
        const isBold = label.startsWith("TOTAL") || label.startsWith("SALDO");
        doc.fontSize(10).font(isBold ? "Helvetica-Bold" : "Helvetica")
          .text(label, 300, y)
          .text(value, 455, y, { align: "right", width: 100 });
        y += 16;
      }

      // Group payments
      if (gPayments.length > 0) {
        y += 8;
        doc.fontSize(9).font("Helvetica-Bold").text("Pagos registrados:", 40, y);
        y += 14;
        for (const p of gPayments) {
          if (y > 740) { doc.addPage(); y = 40; }
          doc.fontSize(9).font("Helvetica")
            .text(`${fmtAR(p.date)} — ${p.method}${p.reference ? ` (${p.reference})` : ""}`, 50, y)
            .text(`$${parseFloat(p.amount).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
          y += 14;
        }
      }

      // Anulaciones (NC void movements)
      if (voidMovements.length > 0) {
        y += 8;
        doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
        y += 12;
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#b91c1c").text("Anulaciones:", 40, y);
        doc.fillColor("#000000");
        y += 14;
        // Column headers
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#555555")
          .text("HAB.", 50, y)
          .text("DESCRIPCIÓN", 90, y)
          .text("IMPORTE", 455, y, { align: "right", width: 100 });
        doc.fillColor("#000000");
        y += 4;
        doc.moveTo(50, y).lineTo(555, y).lineWidth(0.3).stroke("#dddddd");
        y += 8;
        for (const vm of voidMovements) {
          if (y > 740) { doc.addPage(); y = 40; }
          const desc = vm.description || (vm.voidReason ? `Anulación: ${vm.voidReason}` : "Anulación NC");
          doc.fontSize(9).font("Helvetica")
            .text(vm.roomNumber || "-", 50, y)
            .text(desc.substring(0, 55), 90, y)
            .text(`$${parseFloat(vm.amount).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
          y += 14;
        }
        // Subtotal line
        y += 2;
        doc.moveTo(300, y).lineTo(555, y).lineWidth(0.3).stroke("#dddddd");
        y += 6;
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#b91c1c")
          .text("Total anulaciones", 300, y)
          .text(`$${voidMovementsTotal.toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
        doc.fillColor("#000000");
        y += 4;
      }

      // Footer
      y += 20;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      doc.fontSize(8).font("Helvetica").fillColor("#888888")
        .text(`Generado el ${new Date().toLocaleString("es-AR")} | ${HOTEL}`, 40, y + 8, { align: "center", width: pageW });

      doc.end();
    } catch (error: any) {
      console.error("master-folio PDF error:", error);
      res.status(500).json({ error: "Error al generar PDF del folio maestro" });
    }
  });
}
