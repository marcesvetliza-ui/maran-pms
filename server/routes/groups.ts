import type { Express } from "express";
import { randomUUID } from "crypto";
import { storage, getArgentinaToday } from "../db-storage";
import { db } from "../db";
import { reservationChangelog, housekeepingTasks } from "@shared/schema";
import { requireAuth } from "../auth";
import { audit } from "../audit";

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
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color } = req.body;

      if (!name || !checkInDate || !checkOutDate) {
        return res.status(400).json({ error: "Name, checkInDate, and checkOutDate are required" });
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
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color } = req.body;
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

      const group = await storage.updateGroup(req.params.id, updateData);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error: any) {
      console.error("Error updating group:", error?.message || error);
      res.status(500).json({ error: "Error updating group", detail: error?.message });
    }
  });

  app.delete("/api/groups/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.status(204).send();
    } catch (error) {
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

      const block = await storage.createGroupBlock({
        groupId: req.params.groupId,
        roomTypeId,
        quantity: typeof quantity === 'number' ? quantity : parseInt(quantity, 10),
        ratePlanId: ratePlanId || null,
        agreedRate: agreedRate ? String(agreedRate) : null,
        blockCheckInDate: blockCheckInDate || null,
        blockCheckOutDate: blockCheckOutDate || null,
      });
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
      const deleted = await storage.deleteGroupBlock(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Group block not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting group block" });
    }
  });

  // Group Room Assignment
  app.post("/api/groups/:groupId/assign-room", async (req, res) => {
    try {
      const { roomId, guestFirstName, guestLastName, checkInDate, checkOutDate, agreedRate, ratePlanId } = req.body;
      if (!roomId || !guestFirstName) {
        return res.status(400).json({ error: "Room ID and guest first name are required" });
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
    } catch (error) {
      res.status(500).json({ error: "Error assigning room to group" });
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
        totals: {
          accommodation: 0,
          charges: 0,
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
          guest: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
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

      invoiceData.totals.balance = invoiceData.totals.accommodation + invoiceData.totals.charges - invoiceData.totals.payments;

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

      const { amount, method, reference, receiptType, distribution, closeAllRooms } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
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
            await storage.createPayment({
              reservationId: item.id,
              amount: paymentAmt.toFixed(2),
              method,
              reference: refText,
              date: today,
            });
          }
        }
      } else {
        const perRoom = totalAmount / activeReservations.length;
        for (const reservation of activeReservations) {
          await storage.createPayment({
            reservationId: reservation.id,
            amount: perRoom.toFixed(2),
            method,
            reference: refText,
            date: today,
          });
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

      for (const [reservationId, amt] of Object.entries(detail)) {
        if (amt > 0) {
          await storage.createPayment({
            reservationId,
            amount: (amt as number).toFixed(2),
            method,
            reference: reference || `Pago grupal`,
            date: paymentDate,
          });
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
      res.json(transferred);
    } catch (error: any) {
      if (error.message === "Cargo no encontrado") return res.status(404).json({ error: error.message });
      res.status(500).json({ error: "Error al transferir cargo" });
    }
  });
}
