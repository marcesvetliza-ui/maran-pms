import type { Express } from "express";
import { randomUUID } from "crypto";
import { storage } from "../db-storage";
import { db } from "../db";
import { reservationChangelog, reservations, guests, charges, stayNotes } from "@shared/schema";
import { eq, sql, asc, gte, lte, and } from "drizzle-orm";
import { requireAuth } from "../auth";
import { audit } from "../audit";
import { isReservationLocked } from "./utils";

export function registerReservationsRoutes(app: Express) {
  // Reservations
  app.get("/api/reservations", async (req, res) => {
    try {
      const { dateFrom, dateTo, dateMode } = req.query;
      const reservationList = await storage.getReservations({
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        dateMode: dateMode as string | undefined,
      });
      res.json(reservationList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching reservations" });
    }
  });

  app.get("/api/reservations/recent", async (req, res) => {
    try {
      const reservationList = await storage.getRecentReservations(5);
      res.json(reservationList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recent reservations" });
    }
  });

  app.get("/api/reservations/check-in", async (req, res) => {
    try {
      const reservationList = await storage.getReservationsForCheckIn();
      res.json(reservationList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching check-in reservations" });
    }
  });

  app.get("/api/reservations/check-ins-by-date", async (req, res) => {
    try {
      const { date } = req.query;
      if (!date || typeof date !== "string") {
        return res.status(400).json({ error: "Date parameter required" });
      }
      const reservationList = await storage.getCheckInsByDate(date);
      res.json(reservationList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching check-ins by date" });
    }
  });

  app.get("/api/reservations/check-out", async (req, res) => {
    try {
      const reservationList = await storage.getReservationsForCheckOut();
      res.json(reservationList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching check-out reservations" });
    }
  });

  app.get("/api/reservations/generate-code", async (req, res) => {
    try {
      const code = storage.generateReservationCode();
      res.json({ code });
    } catch (error) {
      res.status(500).json({ error: "Error generating reservation code" });
    }
  });

  app.get("/api/reservations/:id", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      res.json(reservation);
    } catch (error) {
      res.status(500).json({ error: "Error fetching reservation" });
    }
  });

  app.post("/api/reservations", async (req, res) => {
    try {
      const numericFields = ["baseRatePerNight", "finalRatePerNight", "totalRoomAmount", "discountValue", "earlyCheckInCharge", "lateCheckOutCharge"];
      for (const field of numericFields) {
        if (req.body[field] === "" || req.body[field] === undefined) {
          req.body[field] = null;
        }
      }
      const nullableStringFields = ["ratePlanId", "companyId", "bedTypeId", "bedTypeNotes", "earlyCheckInTime", "lateCheckOutTime", "notes", "otaChannelId", "externalReservationId"];
      for (const field of nullableStringFields) {
        if (req.body[field] === "") {
          req.body[field] = null;
        }
      }

      const data = {
        ...req.body,
        reservationCode: req.body.reservationCode || storage.generateReservationCode(),
        createdAt: req.body.createdAt ? new Date(req.body.createdAt) : new Date(),
      };

      if (data.roomId && data.checkInDate && data.checkOutDate) {
        const hasConflict = await storage.checkOverbooking(
          data.roomId,
          data.checkInDate,
          data.checkOutDate
        );
        if (hasConflict) {
          const room = await storage.getRoom(data.roomId);
          return res.status(409).json({
            error: `La habitación ${room?.roomNumber || data.roomId} ya tiene una reserva en esas fechas.`,
          });
        }
      }

      const reservation = await storage.createReservation(data);

      const today = new Date().toISOString().split("T")[0];
      if (data.earlyCheckIn && data.earlyCheckInCharge && parseFloat(data.earlyCheckInCharge) > 0) {
        await storage.createCharge({
          reservationId: reservation.id,
          description: `Early Check-in ${data.earlyCheckInTime || ""}`.trim(),
          amount: data.earlyCheckInCharge,
          date: today,
          category: "otros",
        });
      }
      if (data.lateCheckOut && data.lateCheckOutCharge && parseFloat(data.lateCheckOutCharge) > 0) {
        await storage.createCharge({
          reservationId: reservation.id,
          description: `Late Check-out ${data.lateCheckOutTime || ""}`.trim(),
          amount: data.lateCheckOutCharge,
          date: today,
          category: "otros",
        });
      }

      res.status(201).json(reservation);
    } catch (error: any) {
      console.error("Error creating reservation:", error?.message || error);
      res.status(500).json({ error: "Error creating reservation" });
    }
  });

  app.patch("/api/reservations/:id", async (req, res) => {
    try {
      const existing = await storage.getReservation(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      if (isReservationLocked(existing)) {
        return res.status(403).json({ error: "No se puede modificar una reserva cerrada de días anteriores" });
      }

      delete req.body.createdAt;
      delete req.body.id;

      if (!req.body.roomId || req.body.roomId === "") delete req.body.roomId;
      if (!req.body.roomTypeId || req.body.roomTypeId === "") delete req.body.roomTypeId;
      if (!req.body.guestId || req.body.guestId === "") delete req.body.guestId;
      const VALID_STATUSES = ["tentative", "pending", "confirmed", "checked_in", "checked_out", "cancelled"];
      if (req.body.status !== undefined && !VALID_STATUSES.includes(req.body.status)) delete req.body.status;

      const numericFields = ["baseRatePerNight", "finalRatePerNight", "totalRoomAmount", "discountValue", "earlyCheckInCharge", "lateCheckOutCharge"];
      for (const field of numericFields) {
        if (req.body[field] === "" || req.body[field] === undefined) {
          req.body[field] = null;
        }
      }
      const nullableStringFields = ["ratePlanId", "companyId", "bedTypeId", "bedTypeNotes", "earlyCheckInTime", "lateCheckOutTime", "notes", "otaChannelId", "externalReservationId"];
      for (const field of nullableStringFields) {
        if (req.body[field] === "") {
          req.body[field] = null;
        }
      }

      const finalRoomId = req.body.roomId || existing.roomId;
      const finalCheckIn = req.body.checkInDate || existing.checkInDate;
      const finalCheckOut = req.body.checkOutDate || existing.checkOutDate;
      const roomChanged = req.body.roomId && req.body.roomId !== existing.roomId;
      const datesChanged = (req.body.checkInDate && req.body.checkInDate !== existing.checkInDate) ||
                           (req.body.checkOutDate && req.body.checkOutDate !== existing.checkOutDate);
      if (roomChanged || datesChanged) {
        const hasConflict = await storage.checkOverbooking(
          finalRoomId,
          finalCheckIn,
          finalCheckOut,
          req.params.id
        );
        if (hasConflict) {
          const room = await storage.getRoom(finalRoomId);
          return res.status(409).json({
            error: `La habitación ${room?.roomNumber || finalRoomId} ya tiene una reserva en esas fechas.`,
          });
        }
      }

      const fmtDate = (d: string) => {
        if (!d) return d;
        const parts = d.split("T")[0].split("-");
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      };
      const statusLabels: Record<string, string> = {
        tentative: "Tentativa", pending: "Pendiente", confirmed: "Confirmada",
        checked_in: "Check-in realizado", checked_out: "Check-out realizado", cancelled: "Cancelada",
      };
      const cambios: { tipo: string; descripcion: string }[] = [];
      if (req.body.checkInDate && req.body.checkInDate !== existing.checkInDate) {
        cambios.push({ tipo: "fecha", descripcion: `Check-in modificado: ${fmtDate(existing.checkInDate)} → ${fmtDate(req.body.checkInDate)}` });
      }
      if (req.body.checkOutDate && req.body.checkOutDate !== existing.checkOutDate) {
        cambios.push({ tipo: "fecha", descripcion: `Check-out modificado: ${fmtDate(existing.checkOutDate)} → ${fmtDate(req.body.checkOutDate)}` });
      }
      if (req.body.roomId && req.body.roomId !== existing.roomId) {
        const oldRoom = await storage.getRoom(existing.roomId);
        const newRoom = await storage.getRoom(req.body.roomId);
        cambios.push({ tipo: "habitacion", descripcion: `Habitación cambiada: ${oldRoom?.roomNumber || existing.roomId} → ${newRoom?.roomNumber || req.body.roomId}` });
      }
      if (req.body.status && req.body.status !== existing.status) {
        cambios.push({ tipo: "estado", descripcion: `Estado: ${statusLabels[existing.status] || existing.status} → ${statusLabels[req.body.status] || req.body.status}` });
      }
      if (req.body.baseRatePerNight && String(req.body.baseRatePerNight) !== String(existing.baseRatePerNight)) {
        cambios.push({ tipo: "tarifa", descripcion: `Tarifa modificada: $${existing.baseRatePerNight} → $${req.body.baseRatePerNight}` });
      }
      if (req.body.guestId && req.body.guestId !== existing.guestId) {
        cambios.push({ tipo: "huesped", descripcion: `Huésped titular cambiado` });
      }
      if (req.body.notes !== undefined && req.body.notes !== existing.notes) {
        cambios.push({ tipo: "notas", descripcion: `Notas actualizadas` });
      }

      const reservation = await storage.updateReservation(req.params.id, req.body);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      if (cambios.length > 0) {
        const operador = (req as any).user?.fullName || (req as any).user?.username || "Sistema";
        for (const cambio of cambios) {
          await db.insert(reservationChangelog).values({
            reservationId: req.params.id,
            operador,
            tipo: cambio.tipo,
            descripcion: cambio.descripcion,
          });
        }
      }

      const today = new Date().toISOString().split("T")[0];
      if (req.body.earlyCheckIn && req.body.earlyCheckInCharge && parseFloat(req.body.earlyCheckInCharge) > 0 && !existing.earlyCheckIn) {
        await storage.createCharge({
          reservationId: reservation.id,
          description: `Early Check-in ${req.body.earlyCheckInTime || ""}`.trim(),
          amount: req.body.earlyCheckInCharge,
          date: today,
          category: "otros",
        });
      }
      if (req.body.lateCheckOut && req.body.lateCheckOutCharge && parseFloat(req.body.lateCheckOutCharge) > 0 && !existing.lateCheckOut) {
        await storage.createCharge({
          reservationId: reservation.id,
          description: `Late Check-out ${req.body.lateCheckOutTime || ""}`.trim(),
          amount: req.body.lateCheckOutCharge,
          date: today,
          category: "otros",
        });
      }

      await audit(req, "update", "reservations",
        `Reserva ${existing.reservationCode} modificada`,
        { entityType: "reservation", entityId: req.params.id, details: cambios.length > 0 ? { cambios } : undefined }
      );
      res.json(reservation);
    } catch (error: any) {
      console.error("Error updating reservation:", error?.message || error);
      res.status(500).json({ error: "Error updating reservation" });
    }
  });

  // Duplicate reservation endpoint
  app.post("/api/reservations/:id/duplicate", async (req, res) => {
    try {
      const original = await storage.getReservation(req.params.id);
      if (!original) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const { checkInDate, checkOutDate, roomId } = req.body;

      if (!checkInDate || !checkOutDate) {
        return res.status(400).json({ error: "Check-in and check-out dates are required" });
      }

      const normalizeDate = (dateStr: string): string => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        const d = new Date(dateStr);
        return d.toISOString().split('T')[0];
      };

      const normalizedCheckIn = normalizeDate(checkInDate);
      const normalizedCheckOut = normalizeDate(checkOutDate);

      const checkIn = new Date(normalizedCheckIn + 'T00:00:00Z');
      const checkOut = new Date(normalizedCheckOut + 'T00:00:00Z');

      if (checkOut <= checkIn) {
        return res.status(400).json({ error: "La fecha de salida debe ser posterior a la entrada" });
      }

      const nights = Math.round(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (nights <= 0) {
        return res.status(400).json({ error: "La reserva debe tener al menos 1 noche" });
      }

      const finalRoomId = roomId || original.roomId;
      const room = await storage.getRoom(finalRoomId);

      const blockingStatuses = ["tentative", "pending", "confirmed", "checked_in"];
      const allReservations = await storage.getReservations();
      const overlapping = allReservations.filter(r => {
        if (r.id === original.id) return false;
        if (r.roomId !== finalRoomId) return false;
        if (!blockingStatuses.includes(r.status)) return false;

        const rCheckIn = new Date(normalizeDate(r.checkInDate) + 'T00:00:00Z');
        const rCheckOut = new Date(normalizeDate(r.checkOutDate) + 'T00:00:00Z');

        return !(checkOut <= rCheckIn || checkIn >= rCheckOut);
      });

      if (overlapping.length > 0) {
        return res.status(400).json({
          error: `La habitacion ${room?.roomNumber || finalRoomId} ya tiene una reserva en esas fechas`
        });
      }

      const newCode = storage.generateReservationCode();

      const duplicated = await storage.createReservation({
        reservationCode: newCode,
        guestId: original.guestId,
        companyId: original.companyId || null,
        roomTypeId: room?.roomTypeId || original.roomTypeId,
        roomId: finalRoomId,
        ratePlanId: original.ratePlanId,
        checkInDate: normalizedCheckIn,
        checkOutDate: normalizedCheckOut,
        nights,
        baseRatePerNight: original.baseRatePerNight,
        discountType: original.discountType,
        discountValue: original.discountValue,
        finalRatePerNight: original.finalRatePerNight,
        totalRoomAmount: (parseFloat(original.finalRatePerNight || "0") * nights).toFixed(2),
        status: "confirmed",
        source: original.source,
        otaChannelId: original.otaChannelId,
        externalReservationId: null,
        numberOfGuests: original.numberOfGuests,
        notes: `Duplicada de ${original.reservationCode}`,
        createdAt: new Date(),
        lastModifiedBy: null,
      });

      res.status(201).json(duplicated);
    } catch (error) {
      res.status(500).json({ error: "Error duplicating reservation" });
    }
  });

  app.delete("/api/reservations/:id", async (req, res) => {
    try {
      const existing = await storage.getReservation(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      if (isReservationLocked(existing)) {
        return res.status(403).json({ error: "No se puede eliminar una reserva cerrada de días anteriores" });
      }
      const deleted = await storage.deleteReservation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting reservation" });
    }
  });

  // Check-in endpoint
  app.post("/api/reservations/:id/check-in", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const checkInDate = reservation.checkInDate;
      const todayMs = new Date(today + "T12:00:00").getTime();
      const ciMs = new Date(checkInDate + "T12:00:00").getTime();
      const diffDays = Math.round((ciMs - todayMs) / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        return res.status(400).json({ error: `No se puede hacer check-in en fecha futura. La reserva es para el ${checkInDate} y hoy es ${today}.` });
      }

      if (diffDays < -1) {
        const { motivo } = req.body || {};
        if (!motivo || String(motivo).trim() === "") {
          return res.status(400).json({
            error: "CHECK_IN_RETROACTIVO",
            message: `La fecha de check-in es ${checkInDate}. Para registrar con fecha pasada, ingrese un motivo.`,
            requiresMotivo: true,
          });
        }
        await db.insert(reservationChangelog).values({
          reservationId: req.params.id,
          fecha: new Date(),
          operador: (req as any).user?.username || "sistema",
          tipo: "checkin_retroactivo",
          descripcion: `Check-in retroactivo registrado el ${today} para fecha ${checkInDate}. Motivo: ${String(motivo).trim()}`,
        });
      }

      const room = await storage.getRoom(reservation.roomId);
      if (!room) {
        return res.status(400).json({ error: "Habitación no encontrada" });
      }

      const blockedStatuses = ["occupied", "maintenance", "oos"];
      if (blockedStatuses.includes(room.status)) {
        const statusMessages: Record<string, string> = {
          occupied: "La habitación está ocupada por otro huésped",
          maintenance: "La habitación está en mantenimiento",
          oos: "La habitación está fuera de servicio",
        };
        const message = statusMessages[room.status] || `La habitación no está disponible (estado: ${room.status})`;
        return res.status(400).json({ error: message });
      }

      await storage.updateReservation(req.params.id, { status: "checked_in" });
      await storage.updateRoom(reservation.roomId, { status: "occupied" });

      if (reservation.guestId) {
        const preferences = await storage.getActiveGuestPreferences(reservation.guestId);
        for (const pref of preferences) {
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
          const targetAreas = areaMap[pref.category] || ["reception"];
          for (const area of targetAreas) {
            await storage.createHospitalityAlert({
              reservationId: req.params.id,
              guestId: reservation.guestId,
              preferenceId: pref.id,
              alertMessage: `${pref.title}: ${pref.description || pref.title}`,
              targetArea: area,
              priority: pref.priority as any,
            });
          }
          await db.insert(stayNotes).values({
            id: randomUUID(),
            reservationId: req.params.id,
            guestId: reservation.guestId,
            category: pref.category as any,
            title: pref.title,
            description: pref.description || "",
            priority: pref.priority as any,
            visibleTo: pref.visibleTo || ["all"],
            isResolved: false,
            recordedBy: "sistema (check-in automático)",
            createdAt: new Date(),
          });
          if (pref.priority === "critical" || pref.priority === "high") {
            await storage.createNotification({
              type: "hospitality_alert",
              title: `⚠️ Alerta de hospitalidad - Hab. ${room.roomNumber}`,
              message: `${pref.title}: ${pref.description || ""}`,
              targetArea: "all" as any,
              relatedEntityType: "reservation",
              relatedEntityId: req.params.id,
              priority: pref.priority === "critical" ? "urgent" : "high",
            });
          }
        }
      }

      const roomForAudit = await storage.getRoom(reservation.roomId);
      await audit(req, "update", "reservations",
        `Check-in: ${reservation.reservationCode} — Hab. ${roomForAudit?.roomNumber || reservation.roomId}`,
        { entityType: "reservation", entityId: req.params.id }
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error processing check-in" });
    }
  });

  // Get reservation folio (charges summary)
  app.get("/api/reservations/:id/folio", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const chargesList = await storage.getCharges(req.params.id);
      const paymentsList = await storage.getPayments(req.params.id);
      const totalCharges = chargesList.reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const totalPayments = paymentsList.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
      const grandTotal = roomTotal + totalCharges;
      const balance = grandTotal - totalPayments;

      res.json({
        reservationCode: reservation.reservationCode,
        guestName: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
        roomNumber: reservation.room?.roomNumber,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        nights: reservation.nights,
        roomRate: reservation.finalRatePerNight,
        roomTotal,
        charges: chargesList,
        totalCharges,
        payments: paymentsList,
        totalPayments,
        grandTotal,
        balance,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching folio" });
    }
  });

  // Changelog por reserva
  app.get("/api/reservations/:id/changelog", requireAuth, async (req, res) => {
    try {
      const logs = await db
        .select()
        .from(reservationChangelog)
        .where(eq(reservationChangelog.reservationId, req.params.id))
        .orderBy(asc(reservationChangelog.fecha));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching changelog" });
    }
  });

  // Changelog del día (para cierre de caja)
  app.get("/api/reservations/changelog/hoy", requireAuth, async (req, res) => {
    try {
      const argentinaOffset = -3 * 60;
      const now = new Date();
      const argNow = new Date(now.getTime() + (argentinaOffset - now.getTimezoneOffset()) * 60000);
      const inicioDia = new Date(argNow);
      inicioDia.setHours(0, 0, 0, 0);
      const finDia = new Date(argNow);
      finDia.setHours(23, 59, 59, 999);
      const utcOffset = (argentinaOffset - now.getTimezoneOffset()) * 60000;
      const inicioDiaUTC = new Date(inicioDia.getTime() - utcOffset);
      const finDiaUTC = new Date(finDia.getTime() - utcOffset);

      const logs = await db
        .select({
          id: reservationChangelog.id,
          fecha: reservationChangelog.fecha,
          operador: reservationChangelog.operador,
          tipo: reservationChangelog.tipo,
          descripcion: reservationChangelog.descripcion,
          reservationCode: reservations.reservationCode,
          guestFirstName: guests.firstName,
          guestLastName: guests.lastName,
        })
        .from(reservationChangelog)
        .innerJoin(reservations, eq(reservationChangelog.reservationId, reservations.id))
        .innerJoin(guests, eq(reservations.guestId, guests.id))
        .where(and(
          gte(reservationChangelog.fecha, inicioDiaUTC),
          lte(reservationChangelog.fecha, finDiaUTC)
        ))
        .orderBy(asc(reservationChangelog.fecha));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching today changelog" });
    }
  });

  // Check-out endpoint
  app.post("/api/reservations/:id/check-out", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      if (reservation.status !== "checked_in") {
        return res.status(400).json({ error: "Solo se puede hacer check-out de reservas con estado checked_in" });
      }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const checkOutDate = reservation.checkOutDate;
      const todayMs = new Date(today + "T12:00:00").getTime();
      const coMs = new Date(checkOutDate + "T12:00:00").getTime();
      const diffDays = Math.round((coMs - todayMs) / (1000 * 60 * 60 * 24));
      const isHistorical = diffDays < -1;

      if (diffDays > 1) {
        return res.status(400).json({ error: `No se puede hacer check-out: la fecha de salida es ${checkOutDate} y hoy es ${today}` });
      }

      const forceCheckout = req.body.forceCheckout === true || isHistorical;
      if (!forceCheckout) {
        const chargesTotal = await storage.getChargesTotal(req.params.id);
        const paymentsTotal = await storage.getPaymentsTotal(req.params.id);
        const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
        const balance = roomTotal + chargesTotal - paymentsTotal;

        if (balance > 0.01) {
          return res.status(400).json({
            error: "Saldo pendiente",
            message: `La reserva tiene un saldo pendiente de $${balance.toFixed(2)}. Liquide antes de hacer check-out.`,
            balance
          });
        }
      }

      const reservationPayments = await storage.getPayments(req.params.id);
      const ccPayments = reservationPayments.filter(p => p.method === "cuenta_corriente");
      if (ccPayments.length > 0) {
        const guest = reservation.guest;
        const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Huésped";
        const roomNum = reservation.room?.roomNumber || reservation.roomId;
        for (const ccPayment of ccPayments) {
          if (ccPayment.billingTarget === "company" && reservation.companyId) {
            await storage.createAccountMovement({
              entityType: "company",
              entityId: reservation.companyId,
              date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
              type: "cargo",
              description: `Estadía ${reservation.reservationCode} — Hab. ${roomNum}`,
              amount: parseFloat(ccPayment.amount).toFixed(2),
              reservationId: reservation.id,
              reservationCode: reservation.reservationCode,
              guestName,
            });
          } else if (ccPayment.billingTarget === "agency" && reservation.agencyId) {
            await storage.createAccountMovement({
              entityType: "agency",
              entityId: reservation.agencyId,
              date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
              type: "cargo",
              description: `Estadía ${reservation.reservationCode} — Hab. ${roomNum}`,
              amount: parseFloat(ccPayment.amount).toFixed(2),
              reservationId: reservation.id,
              reservationCode: reservation.reservationCode,
              guestName,
            });
          }
        }
      }

      await storage.updateReservation(req.params.id, { status: "checked_out" });
      await storage.updateRoom(reservation.roomId, { status: "dirty" });
      await storage.createCheckoutCleaningTask(reservation.roomId);
      await audit(req, "update", "reservations",
        `Check-out: ${reservation.reservationCode} — Hab. ${reservation.room?.roomNumber || reservation.roomId}`,
        { entityType: "reservation", entityId: req.params.id }
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error processing check-out" });
    }
  });

  // Cancel reservation endpoint
  app.post("/api/reservations/:id/cancel", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      if (isReservationLocked(reservation)) {
        return res.status(403).json({ error: "No se puede anular una reserva cerrada de días anteriores" });
      }

      await storage.createCancelledReservationLog({
        reservationCode: reservation.reservationCode,
        guestName: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
        roomNumber: reservation.room?.roomNumber || "",
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        cancellationDate: new Date(),
        cancelledBy: req.body.cancelledBy || null,
        reason: req.body.reason || null,
      });

      await storage.updateReservation(req.params.id, { status: "cancelled" });

      if (reservation.room?.status === "occupied") {
        await storage.updateRoom(reservation.roomId, { status: "dirty" });
      }
      await audit(req, "delete", "reservations",
        `Cancelación: ${reservation.reservationCode}`,
        { entityType: "reservation", entityId: req.params.id }
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error cancelling reservation" });
    }
  });

  // Check overbooking
  app.get("/api/reservations/check-overbooking", async (req, res) => {
    try {
      const { roomId, checkInDate, checkOutDate, excludeReservationId } = req.query;
      if (!roomId || !checkInDate || !checkOutDate) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      const hasConflict = await storage.checkOverbooking(
        roomId as string,
        checkInDate as string,
        checkOutDate as string,
        excludeReservationId as string | undefined
      );
      res.json({ hasConflict });
    } catch (error) {
      res.status(500).json({ error: "Error checking overbooking" });
    }
  });

  // Cancelled reservation logs
  app.get("/api/cancelled-reservations", async (req, res) => {
    try {
      const logs = await storage.getCancelledReservationLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching cancelled reservation logs" });
    }
  });

  // Get reservations by guest
  app.get("/api/guests/:guestId/reservations", async (req, res) => {
    try {
      const reservationList = await storage.getReservationsByGuest(req.params.guestId);
      res.json(reservationList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guest reservations" });
    }
  });

  // Charges
  app.get("/api/reservations/:reservationId/charges", async (req, res) => {
    try {
      const includeAnulados = req.query.includeAnulados === "true";
      const result = includeAnulados
        ? await storage.getAllChargesIncludingAnulados(req.params.reservationId)
        : await storage.getCharges(req.params.reservationId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Error fetching charges" });
    }
  });

  app.get("/api/reservations/:reservationId/charges/total", async (req, res) => {
    try {
      const total = await storage.getChargesTotal(req.params.reservationId);
      res.json({ total });
    } catch (error) {
      res.status(500).json({ error: "Error fetching charges total" });
    }
  });

  app.post("/api/charges", async (req, res) => {
    try {
      if (req.body.reservationId) {
        const reservation = await storage.getReservation(req.body.reservationId);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede agregar cargos a una reserva cerrada de días anteriores" });
        }
      }
      const charge = await storage.createCharge(req.body);
      res.status(201).json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error creating charge" });
    }
  });

  app.patch("/api/charges/:id", async (req, res) => {
    try {
      const existing = await storage.getCharge(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Charge not found" });
      }
      if (existing.reservationId) {
        const reservation = await storage.getReservation(existing.reservationId);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede modificar cargos de una reserva cerrada de días anteriores" });
        }
      }
      const charge = await storage.updateCharge(req.params.id, req.body);
      res.json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error updating charge" });
    }
  });

  app.patch("/api/charges/:id/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion, anuladoPor } = req.body;
      if (!motivoAnulacion?.trim()) {
        return res.status(400).json({ error: "El motivo de anulación es requerido" });
      }
      const existing = await storage.getCharge(req.params.id);
      if (!existing) return res.status(404).json({ error: "Cargo no encontrado" });
      if (existing.status === "anulado") return res.status(400).json({ error: "El cargo ya está anulado" });
      if (existing.reservationId) {
        const reservation = await storage.getReservation(existing.reservationId);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede anular cargos de una reserva cerrada" });
        }
      }
      const [updated] = await db.update(charges)
        .set({ status: "anulado", anuladoPor: anuladoPor || null, motivoAnulacion, anuladoAt: new Date() })
        .where(eq(charges.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/charges/:id", async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/charges/${req.params.id} — usar PATCH /anular`);
    try {
      const existing = await storage.getCharge(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Charge not found" });
      }
      if (existing.reservationId) {
        const reservation = await storage.getReservation(existing.reservationId);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede eliminar cargos de una reserva cerrada de días anteriores" });
        }
      }
      await storage.deleteCharge(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting charge" });
    }
  });

  // Transfer charge to another reservation
  app.post("/api/charges/:id/transfer", async (req, res) => {
    try {
      const { targetReservationId } = req.body;

      if (!targetReservationId || typeof targetReservationId !== "string") {
        return res.status(400).json({ error: "Target reservation ID is required" });
      }

      const charge = await storage.getCharge(req.params.id);
      if (!charge) {
        return res.status(404).json({ error: "Charge not found" });
      }
      if (charge.reservationId) {
        const sourceRes = await storage.getReservation(charge.reservationId);
        if (sourceRes && isReservationLocked(sourceRes)) {
          return res.status(403).json({ error: "No se puede transferir cargos de una reserva cerrada de días anteriores" });
        }
      }

      if (charge.reservationId === targetReservationId) {
        return res.status(400).json({ error: "Cannot transfer to the same reservation" });
      }

      const targetReservation = await storage.getReservation(targetReservationId);
      if (!targetReservation) {
        return res.status(404).json({ error: "Target reservation not found" });
      }

      if (targetReservation.status !== "checked_in" && targetReservation.status !== "confirmed") {
        return res.status(400).json({ error: "Target reservation must be active (checked-in or confirmed)" });
      }

      const updatedCharge = await storage.updateCharge(req.params.id, {
        reservationId: targetReservationId,
      });

      res.json(updatedCharge);
    } catch (error) {
      res.status(500).json({ error: "Error transferring charge" });
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
      if (req.body.reservationId) {
        const reservation = await storage.getReservation(req.body.reservationId);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede agregar pagos a una reserva cerrada de días anteriores" });
        }
      }
      if (req.body.billingTarget && !["guest", "company"].includes(req.body.billingTarget)) {
        req.body.billingTarget = "guest";
      }
      if (!req.body.date) {
        const now = new Date();
        req.body.date = now.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      }
      const payment = await storage.createPayment(req.body);

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
          ? `Reserva ${reservation.reservationCode} - Pago ${rawMethod}`
          : `Pago manual - ${req.body.description || "Sin descripción"}`;
        await storage.registerCashMovement(
          "reception", "reservation", req.body.reservationId || null, label,
          cashMethod, String(req.body.amount), "income",
          undefined, req.body.receiptType
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
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
      if (pay.reservation_id) {
        const reservation = await storage.getReservation(pay.reservation_id);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede anular pagos de una reserva cerrada" });
        }
      }
      const updated = await db.execute(sql`
        UPDATE payments SET status = 'anulado', anulado_por = ${anuladoPor || null},
        motivo_anulacion = ${motivoAnulacion}, anulado_at = NOW()
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
}
