import type { Express } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "../db-storage";
import { db } from "../db";
import { reservationChangelog, reservations, guests, charges, stayNotes, rooms, guestPreferences, hospitalityAlerts, insertReservationCompanionSchema, roomTypes } from "@shared/schema";
import { eq, sql, asc, gte, lte, and, lt, inArray } from "drizzle-orm";
import { requireAuth } from "../auth";
import { audit } from "../audit";
import { isReservationLocked } from "./utils";
import { sendCheckoutEmail, sendConfirmationEmail } from "../email-service";
import PDFDocument from "pdfkit";

// ─── Hotel constants (actualizar con datos reales del hotel) ─────────────────
const HOTEL_NAME    = "Maran Suites & Towers";
const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE   = "+54 (0343) 503-8070";
const HOTEL_EMAIL   = "recepcion@maran.com.ar";
const HOTEL_CUIT    = "33-68110008-9";
const HOTEL_WEB     = "www.maran.com.ar";
const PRIMARY_COLOR = "#1a4f8a";

function fmtDatePdf(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function fmtMoneyPdf(v: any): string {
  const n = parseFloat(String(v ?? 0));
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}
function nightCount(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
}

export function registerReservationsRoutes(app: Express) {
  // ── PDF confirmation download ───────────────────────────────────────────────
  app.get("/api/reservations/:id/confirmation-pdf", requireAuth, handleConfirmationPdf);

  // Reservations
  app.get("/api/reservations", async (req, res) => {
    try {
      const { dateFrom, dateTo, dateMode, dateField } = req.query;
      const reservationList = await storage.getReservations({
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        dateMode: dateMode as string | undefined,
        dateField: dateField as string | undefined,
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

      // Fire confirmation email if created as "confirmed"
      if (data.status === "confirmed") {
        sendConfirmationEmail(reservation.id).catch(e => console.error("[email] create confirmation trigger:", e));
      }

      // Generar alertas de hospitalidad para reservas con check-in HOY
      if (reservation.guestId && reservation.checkInDate) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        if (reservation.checkInDate === todayStr) {
          generateSameDayHospitalityAlerts(reservation.id, reservation.guestId, reservation.roomId ?? null).catch(
            (e) => console.error("[hospitality] same-day alert error:", e)
          );
        }
      }

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
      // Fire confirmation email when status transitions to "confirmed"
      if (req.body.status === "confirmed" && existing.status !== "confirmed") {
        sendConfirmationEmail(req.params.id).catch(e => console.error("[email] confirmation trigger error:", e));
      }
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
    return res.status(405).json({
      error: "Las reservas no pueden eliminarse. Use POST /api/reservations/:id/cancel para anular con motivo.",
    });
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

      // Los movimientos CC se crean al registrar el pago; al checkout solo creamos los que faltan (pagos registrados antes del fix)
      const reservationPayments = await storage.getPayments(req.params.id);
      const ccPayments = reservationPayments.filter(p => p.method === "cuenta_corriente");
      if (ccPayments.length > 0) {
        const guest = reservation.guest;
        const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Huésped";
        const roomNum = reservation.room?.roomNumber || reservation.roomId;
        // Verificar si ya existen movimientos CC para esta reserva
        const existingMovements = await storage.getAccountMovementsByReservation(reservation.id);
        const existingAmounts = existingMovements.map(m => parseFloat(m.amount).toFixed(2));
        for (const ccPayment of ccPayments) {
          const amtStr = parseFloat(ccPayment.amount).toFixed(2);
          // Solo crear si no existe un movimiento con el mismo monto para esta reserva
          if (existingAmounts.includes(amtStr)) continue;
          if (ccPayment.billingTarget === "company" && reservation.companyId) {
            await storage.createAccountMovement({
              entityType: "company",
              entityId: reservation.companyId,
              date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
              type: "cargo",
              description: `Estadía ${reservation.reservationCode} — Hab. ${roomNum}`,
              amount: amtStr,
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
              amount: amtStr,
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
      // Fire post-checkout email asynchronously (don't block response)
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      sendCheckoutEmail(req.params.id, baseUrl).catch(e => console.error("[email] checkout trigger error:", e));
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
        reservationId: reservation.id,
        totalAmount: reservation.totalRoomAmount || "0",
      });

      await storage.updateReservation(req.params.id, { status: "cancelled" });

      if (reservation.room?.status === "occupied") {
        await storage.updateRoom(reservation.roomId, { status: "dirty" });
      }

      try {
        const guestName = `${reservation.guest?.firstName || ""} ${reservation.guest?.lastName || ""}`.trim();
        await storage.registerCashMovement(
          "reception",
          "reservation_cancellation",
          reservation.id,
          `Anulación reserva ${reservation.reservationCode} — ${guestName} — Hab. ${reservation.room?.roomNumber || reservation.roomId}`,
          "cash",
          reservation.totalRoomAmount || "0",
          "anulacion_reserva",
          (req as any).user?.username || "sistema"
        );
      } catch (e) {
        console.error("[cancel] Error registrando en caja:", e);
      }

      await audit(req, "cancel", "reservations",
        `Anulación: ${reservation.reservationCode} — Motivo: ${req.body.reason || "Sin motivo"}`,
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
      // Motor financiero: escribir al folio de la reserva
      if (charge.reservationId) {
        storage.addFolioCharge(
          "reservation",
          charge.reservationId,
          parseFloat(charge.amount),
          charge.description || charge.category || "Cargo",
          "charge",
          charge.id,
          (req as any).user?.username,
        ).catch(e => console.error("[Folio] Error escribiendo cargo:", e));
      }
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

  // Bulk transfer charges + accommodation to another reservation
  app.post("/api/reservations/:id/bulk-transfer", requireAuth, async (req, res) => {
    try {
      const sourceId = req.params.id;
      const { targetReservationId, chargeIds = [], includeAccommodation = false, transferNote = "" } = req.body;
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
      const sourceRoom = sourceRes.room?.number || sourceRes.roomId || "?";
      const sourceGuest = sourceRes.guest ? `${sourceRes.guest.firstName} ${sourceRes.guest.lastName}` : "Huésped";
      const targetRoom = targetRes.room?.number || targetRes.roomId || "?";
      const targetGuest = targetRes.guest ? `${targetRes.guest.firstName} ${targetRes.guest.lastName}` : "Huésped";
      const noteRef = transferNote ? ` — ${transferNote}` : "";

      let chargesTransferred = 0;
      let accommodationTransferred = false;

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

      // Add note to source reservation
      const sourceNoteText = [
        includeAccommodation && accommodationTransferred ? `Alojamiento ($${sourceRes.totalRoomAmount})` : null,
        chargesTransferred > 0 ? `${chargesTransferred} cargo(s) extra` : null,
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

      // Motor financiero: escribir al folio de la reserva
      if (payment.reservationId) {
        const rawMethod = req.body.method || "cash";
        storage.addFolioPayment(
          "reservation",
          payment.reservationId,
          parseFloat(payment.amount),
          payment.description || `Pago — ${rawMethod}`,
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

  app.delete("/api/reservations/:id/companions/:companionId", requireAuth, async (req, res) => {
    try {
      await storage.deleteReservationCompanion(req.params.companionId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Error deleting companion" });
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

    // ── HEADER IMAGE ──────────────────────────────────────────────────────
    const headerH = 148;
    const headerImgPath = path.join(process.cwd(), "server", "assets", "confirmacion-header.jpg");
    if (fs.existsSync(headerImgPath)) {
      doc.image(headerImgPath, 0, 0, { width: pageW, height: headerH, cover: [pageW, headerH] });
    } else {
      doc.rect(0, 0, pageW, headerH).fill(NAVY);
    }

    // ── ORANGE STRIPE ─────────────────────────────────────────────────────
    doc.rect(0, headerH, pageW, 5).fill(ORANGE);

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

    // Right: reservation code box
    const codeBoxW = 138;
    const codeBoxX = pageW - margin - codeBoxW;
    const codeBoxY = headerH + 16;
    doc.roundedRect(codeBoxX, codeBoxY, codeBoxW, 44, 5)
      .fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
      .text("N° DE RESERVA", codeBoxX, codeBoxY + 7, { width: codeBoxW, align: "center", characterSpacing: 0.5 });
    doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
      .text(reservation.reservationCode || reservation.id, codeBoxX, codeBoxY + 19, { width: codeBoxW, align: "center" });
    doc.fillColor("#aaaaaa").fontSize(7).font("Helvetica")
      .text(`Emitida: ${new Date().toLocaleDateString("es-AR")}`, codeBoxX, codeBoxY + 33, { width: codeBoxW, align: "center" });

    // Status badge
    const badgeY = codeBoxY + 50;
    doc.roundedRect(codeBoxX + 16, badgeY, codeBoxW - 32, 15, 7)
      .fillAndStroke("#e8f5e9", "#a5d6a7");
    doc.fillColor("#2e7d32").fontSize(7).font("Helvetica-Bold")
      .text("CONFIRMADA", codeBoxX + 16, badgeY + 4, { width: codeBoxW - 32, align: "center", characterSpacing: 0.5 });

    y += 20;

    // ── SEPARATOR ─────────────────────────────────────────────────────────
    doc.moveTo(margin, y).lineTo(margin + contentW, y)
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

    // ── OBSERVATIONS ─────────────────────────────────────────────────────
    if (reservation.notes) {
      const notesTextH = doc.heightOfString(reservation.notes, { width: contentW - 26 });
      const notesBoxH = Math.max(42, notesTextH + 24);
      doc.roundedRect(margin, y, contentW, notesBoxH, 6)
        .fillAndStroke("#fffbf0", "#ffe0a0");
      doc.fillColor("#b8860b").fontSize(7).font("Helvetica-Bold")
        .text("OBSERVACIONES", margin + 12, y + 9, { characterSpacing: 1 });
      doc.fillColor("#555555").fontSize(9).font("Helvetica")
        .text(reservation.notes, margin + 12, y + 22, { width: contentW - 26 });
      y += notesBoxH + 12;
    }

    // ── TÉRMINOS Y CONDICIONES ────────────────────────────────────────────
    const terminos = [
      "La tarifa incluye desayuno buffet y gimnasio con turno previo.",
      "La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.",
      "Nuestro horario de Check-in es a partir de las 15:00 hs y el Check-out es hasta las 10:00 hs.",
      "Early Check-in o Late Check-out tienen costo adicional del 50% del valor de una noche.",
      "Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI / PASAPORTE / CÉDULA DE IDENTIDAD. En el caso de viajar con menores de edad deberá presentar su correspondiente identificación.",
      "La entrega de la habitación queda condicionada al pago total del alojamiento al momento del check-in. Los comprobantes, constancias de transferencia, capturas de pantalla o avisos de pago no constituyen pago válido hasta la efectiva acreditación del importe en los medios de cobro habilitados por el hotel. Ante la falta de acreditación, el hotel podrá exigir el pago por otro medio aceptado y suspender el ingreso a la habitación hasta la regularización total del saldo correspondiente.",
    ];

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

    // ── FOOTER ───────────────────────────────────────────────────────────
    const footerY = pageH - 72;
    doc.rect(0, footerY, pageW, 72).fill(FOOTER_BG);

    // Logo
    const logoPath = path.join(process.cwd(), "server", "assets", "hotel-logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, footerY + 14, { width: 95 });
    }

    // Center contact info
    const centerX = margin + 100;
    const centerW = contentW - 200;
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica")
      .text(HOTEL_ADDRESS, centerX, footerY + 13, { width: centerW, align: "center" });
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica")
      .text(`${HOTEL_EMAIL}  ·  ${HOTEL_PHONE}`, centerX, footerY + 26, { width: centerW, align: "center" });
    doc.fillColor("#cccccc").fontSize(7).font("Helvetica")
      .text(`CUIT ${HOTEL_CUIT} · Responsable Inscripto`, centerX, footerY + 40, { width: centerW, align: "center" });

    // Website right
    doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
      .text(HOTEL_WEB, pageW - margin - 100, footerY + 26, { width: 100, align: "right" });

    doc.end();
  } catch (e: any) {
    console.error("[confirmation-pdf]", e);
    res.status(500).json({ error: "Error generando PDF", detail: e?.message });
  }
}
