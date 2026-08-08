import type { Express } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { assetPath } from "../utils/assetPath";
import { storage } from "../db-storage";
import { db } from "../db";
import { reservationChangelog, reservations, guests, charges, stayNotes, rooms, guestPreferences, hospitalityAlerts, insertReservationCompanionSchema, roomTypes, groupReservationLinks, groupRoomBlocks, reservationCompanions } from "@shared/schema";
import { eq, sql, asc, gte, lte, and, lt, inArray } from "drizzle-orm";
import { emitirFactura } from "../billing/invoiceService";
import { generarResumenCuentaPDF } from "../billing/invoicePdf";
import { getBillingConfig } from "../billing/billingConfig";
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
      const { dateFrom, dateTo, dateMode, dateField, search, statuses, limit } = req.query;
      const parsedStatuses = statuses
        ? String(statuses).split(",").map(s => s.trim()).filter(Boolean)
        : undefined;
      const parsedLimit = limit ? parseInt(String(limit), 10) : undefined;
      const reservationList = await storage.getReservations({
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        dateMode: dateMode as string | undefined,
        dateField: dateField as string | undefined,
        search: search ? String(search) : undefined,
        statuses: parsedStatuses,
        limit: parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
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

  // DEBE ir antes de /:id para que Express no la capture como id="check-adjacent"
  app.get("/api/reservations/check-adjacent", requireAuth, async (req, res) => {
    try {
      const { roomId, date, direction } = req.query as { roomId: string; date: string; direction: "before" | "after" };
      if (!roomId || !date || !direction) {
        return res.status(400).json({ error: "roomId, date y direction son requeridos" });
      }
      const all = await storage.getReservations();
      const found = all.find(r => {
        if (r.roomId !== roomId) return false;
        if (["cancelled", "checked_out"].includes(r.status)) return false;
        if (direction === "before") return r.checkOutDate === date;
        return r.checkInDate === date;
      });
      res.json(found || null);
    } catch (error) {
      console.error("check-adjacent error:", error);
      res.status(500).json({ error: "Error al consultar reservas adyacentes" });
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
        if (req.body[field] === "") {
          req.body[field] = null;
        } else if (req.body[field] === undefined) {
          delete req.body[field];
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

      // Date integrity check — checkout must be strictly after checkin
      if (data.checkInDate && data.checkOutDate && data.checkOutDate <= data.checkInDate) {
        return res.status(400).json({ error: "La fecha de egreso debe ser posterior a la de ingreso." });
      }

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
      const detail = error?.message || String(error);
      console.error("Error creating reservation:", detail);
      res.status(500).json({ error: detail || "Error creating reservation" });
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
      // "cancelled" must go through POST /api/reservations/:id/cancel (requires reason + audit log)
      if (req.body.status === "cancelled") {
        return res.status(400).json({
          error: "Para anular una reserva usá el botón 'Anular Reserva'. Eso requiere un motivo y queda registrado en el historial.",
        });
      }
      const VALID_STATUSES = ["tentative", "pending", "confirmed", "checked_in", "checked_out"];
      if (req.body.status !== undefined && !VALID_STATUSES.includes(req.body.status)) delete req.body.status;

      const numericFields = ["baseRatePerNight", "finalRatePerNight", "totalRoomAmount", "discountValue", "earlyCheckInCharge", "lateCheckOutCharge"];
      for (const field of numericFields) {
        if (req.body[field] === "") {
          req.body[field] = null;
        } else if (req.body[field] === undefined) {
          delete req.body[field];
        }
      }
      const nullableStringFields = ["ratePlanId", "companyId", "bedTypeId", "bedTypeNotes", "earlyCheckInTime", "lateCheckOutTime", "notes", "otaChannelId", "externalReservationId"];
      for (const field of nullableStringFields) {
        if (req.body[field] === "") {
          req.body[field] = null;
        }
      }

      // Auto-recalculate totalRoomAmount if nights change but totalRoomAmount wasn't explicitly sent
      // This fixes planning drag-and-drop which only sends roomId/checkInDate/checkOutDate/nights
      if (req.body.nights !== undefined && req.body.totalRoomAmount === undefined) {
        const newNights = Number(req.body.nights);
        const rate = parseFloat(existing.finalRatePerNight || "0");
        if (!isNaN(newNights) && newNights > 0 && rate > 0) {
          req.body.totalRoomAmount = (rate * newNights).toFixed(2);
        }
      }

      const finalRoomId = req.body.roomId || existing.roomId;
      const finalCheckIn = req.body.checkInDate || existing.checkInDate;
      const finalCheckOut = req.body.checkOutDate || existing.checkOutDate;

      // Date integrity check — checkout must be strictly after checkin
      if (finalCheckIn && finalCheckOut && finalCheckOut <= finalCheckIn) {
        return res.status(400).json({ error: "La fecha de egreso debe ser posterior a la de ingreso." });
      }

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
      const roomChanging = req.body.roomId && req.body.roomId !== existing.roomId;
      if (roomChanging) {
        const oldRoom = await storage.getRoom(existing.roomId);
        const newRoom = await storage.getRoom(req.body.roomId);
        cambios.push({ tipo: "habitacion", descripcion: `Habitación cambiada: ${oldRoom?.roomNumber || existing.roomId} → ${newRoom?.roomNumber || req.body.roomId}` });
        // For in-house moves (checked_in), persist the original room number atomically
        // so planning can display the "moved from" indicator.
        if (existing.status === "checked_in" && !existing.movedFromRoomNumber && oldRoom) {
          req.body.movedFromRoomNumber = oldRoom.roomNumber;
        }
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

      // Movimiento in-house: si la reserva estaba checked_in y cambió de habitación,
      // actualizar el estado de las habitaciones: vieja → dirty, nueva → occupied.
      if (roomChanging && existing.status === "checked_in") {
        try {
          if (existing.roomId) {
            await storage.updateRoom(existing.roomId, { status: "dirty" });
          }
          if (req.body.roomId) {
            await storage.updateRoom(req.body.roomId, { status: "occupied" });
          }
          console.log(`[room-move] In-house move: hab ${existing.roomId} → dirty, hab ${req.body.roomId} → occupied`);
        } catch (moveErr: any) {
          console.warn(`[room-move] Error actualizando estado de habitaciones (non-fatal): ${moveErr?.message}`);
        }
      }

      // Recalcular cargos repetitivos si cambiaron las noches
      const oldNights = Number(existing.nights);
      const newNights = Number(reservation.nights);
      if (newNights > 0 && newNights !== oldNights) {
        try {
          const recurringRows = await db.execute(
            sql`SELECT id, description, unit_amount FROM charges WHERE reservation_id = ${req.params.id} AND is_recurring = true AND status = 'active' AND unit_amount IS NOT NULL`
          );
          for (const rc of recurringRows.rows as any[]) {
            const newAmount = (parseFloat(rc.unit_amount) * newNights).toFixed(2);
            const baseDesc = (rc.description as string).replace(/\s*\(x\d+\)$/, "").trim();
            const newDesc = `${baseDesc} (x${newNights})`;
            await db.execute(sql`UPDATE charges SET amount = ${newAmount}, description = ${newDesc} WHERE id = ${rc.id}`);
          }
        } catch (rcErr: any) {
          console.warn("[recurring-charges] recalculate failed (non-fatal):", rcErr?.message);
        }
      }

      if (cambios.length > 0) {
        const operador = (req as any).user?.fullName || (req as any).user?.username || "Sistema";
        for (const cambio of cambios) {
          try {
            await db.insert(reservationChangelog).values({
              reservationId: req.params.id,
              operador,
              tipo: cambio.tipo,
              descripcion: cambio.descripcion,
            });
          } catch (clErr: any) {
            console.warn("[changelog] insert failed (non-fatal):", clErr?.message);
          }
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

      const blockingStatuses = ["tentative", "pending", "reserved", "confirmed", "web_checkin", "checked_in"];
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

      if (diffDays < 0) {
        const { motivo } = req.body || {};
        if (!motivo || String(motivo).trim() === "") {
          return res.status(400).json({
            error: "CHECK_IN_RETROACTIVO",
            message: `La fecha de check-in es ${checkInDate}. Para registrar con fecha pasada, ingrese un motivo.`,
            requiresMotivo: true,
          });
        }
        db.insert(reservationChangelog).values({
          reservationId: req.params.id,
          fecha: new Date(),
          operador: (req as any).user?.username || "sistema",
          tipo: "checkin_retroactivo",
          descripcion: `Check-in retroactivo registrado el ${today} para fecha ${checkInDate}. Motivo: ${String(motivo).trim()}`,
        }).catch((e) => console.warn("changelog insert failed (non-fatal):", e?.message));
      }

      const room = await storage.getRoom(reservation.roomId);
      if (!room) {
        return res.status(400).json({ error: "Habitación no encontrada" });
      }

      // Fuera de servicio: bloquear siempre
      if (room.status === "oos") {
        return res.status(400).json({ error: "La habitación está fuera de servicio" });
      }

      // Verificar si hay OTRA reserva en checked_in actualmente para esta habitación
      // (no usar room.status === "occupied" porque puede quedar desactualizado)
      const todayForCheck = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const allRes = await storage.getReservations();
      const otherCheckedIn = allRes.find(
        r => r.id !== req.params.id && r.roomId === reservation.roomId && r.status === "checked_in"
      );
      if (otherCheckedIn) {
        const guestName = (otherCheckedIn as any).guest
          ? `${(otherCheckedIn as any).guest.lastName ?? ""} ${(otherCheckedIn as any).guest.firstName ?? ""}`.trim()
          : "Huésped desconocido";
        const checkOut = (otherCheckedIn as any).checkOutDate ?? "?";

        // Si la reserva bloqueante tiene checkout vencido (ya pasó) O es HOY, auto-cerrarla y continuar.
        // Checkout hoy significa que el huésped debe salir antes del horario de check-in del nuevo huésped.
        const isOverdue = checkOut !== "?" && checkOut <= todayForCheck;
        if (isOverdue) {
          console.warn(`[check-in] Reserva vencida detectada en hab ${room.roomNumber}: ${otherCheckedIn.id} (${(otherCheckedIn as any).reservationCode ?? ""}) — ${guestName} — salida ${checkOut}. Auto-checkout forzado.`);
          try {
            await db.update(reservations).set({ status: "checked_out" } as any).where(eq(reservations.id, otherCheckedIn.id));
            if (room.id) {
              await db.update(rooms).set({ status: "dirty" } as any).where(eq(rooms.id, room.id));
            }
          } catch (autoErr: any) {
            console.error(`[check-in] Error auto-checkout vencida: ${autoErr.message}`);
          }
          // Continuar con el check-in normalmente
        } else {
          console.warn(`[check-in] Bloqueado: hab ${room.roomNumber} ocupada por ${otherCheckedIn.id} (${(otherCheckedIn as any).reservationCode ?? ""}) — ${guestName} — salida ${checkOut}`);
          return res.status(400).json({
            error: `La habitación ${room.roomNumber} está ocupada por otro huésped`,
            detail: {
              reservationId: otherCheckedIn.id,
              reservationCode: (otherCheckedIn as any).reservationCode,
              guest: guestName,
              checkOut,
            }
          });
        }
      }

      await storage.updateReservation(req.params.id, { status: "checked_in" });
      await storage.updateRoom(reservation.roomId, { status: "occupied" });

      // Registrar cargo de alojamiento en el folio al hacer check-in
      try {
        const roomNum = room.roomNumber || req.params.id;
        const totalRoomAmt = parseFloat(reservation.totalRoomAmount || "0");
        const earlyCharge = parseFloat(reservation.earlyCheckInCharge || "0");
        const lateCharge = parseFloat(reservation.lateCheckOutCharge || "0");
        const nights = reservation.nights || 1;
        if (totalRoomAmt > 0) {
          await storage.addFolioCharge(
            "reservation",
            req.params.id,
            totalRoomAmt,
            `Alojamiento Hab. ${roomNum} (${nights} noche${nights !== 1 ? "s" : ""})`,
            "room",
            req.params.id,
            (req as any).user?.username,
          );
        }
        if (earlyCharge > 0) {
          await storage.addFolioCharge(
            "reservation",
            req.params.id,
            earlyCharge,
            `Early Check-in${reservation.earlyCheckInTime ? " " + reservation.earlyCheckInTime + " hs" : ""}`,
            "room",
            req.params.id,
            (req as any).user?.username,
          );
        }
        if (lateCharge > 0) {
          await storage.addFolioCharge(
            "reservation",
            req.params.id,
            lateCharge,
            `Late Check-out${reservation.lateCheckOutTime ? " " + reservation.lateCheckOutTime + " hs" : ""}`,
            "room",
            req.params.id,
            (req as any).user?.username,
          );
        }
      } catch (e) { console.error("[Folio] Error registrando cargo alojamiento:", e); }

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
          db.insert(stayNotes).values({
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
          }).catch((e) => console.warn("stayNotes insert failed (non-fatal):", e?.message));
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

  // Revertir check-in: reservation → confirmed, room → clean (solo mismo día)
  app.post("/api/reservations/:id/undo-checkin", requireAuth, async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });
      if (reservation.status !== "checked_in") {
        return res.status(400).json({ error: "La reserva no está en estado check-in" });
      }
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      if (reservation.checkInDate !== today) {
        return res.status(400).json({ error: "Solo se puede revertir el check-in el mismo día del ingreso" });
      }
      await storage.updateReservation(req.params.id, { status: "confirmed" });
      if (reservation.roomId) {
        await storage.updateRoom(reservation.roomId, { status: "clean" });
      }
      await audit(req, "update", "reservations",
        `Check-in revertido: ${reservation.reservationCode} — el huésped salió temporalmente`,
        { entityType: "reservation", entityId: req.params.id }
      );
      res.json({ success: true });
    } catch (error) {
      console.error("undo-checkin error:", error);
      res.status(500).json({ error: "Error al revertir el check-in" });
    }
  });

  // Revertir check-out: reservation → checked_in, room → occupied (solo mismo día)
  app.post("/api/reservations/:id/undo-checkout", requireAuth, async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });
      if (reservation.status !== "checked_out") {
        return res.status(400).json({ error: "La reserva no está en estado check-out" });
      }
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const checkedOutToday = reservation.checkedOutAt &&
        new Date(reservation.checkedOutAt).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }) === today;
      if (!checkedOutToday) {
        return res.status(400).json({ error: "Solo se puede revertir el check-out el mismo día que se realizó" });
      }
      await storage.updateReservation(req.params.id, { status: "checked_in", checkedOutAt: null });
      if (reservation.roomId) {
        await storage.updateRoom(reservation.roomId, { status: "occupied" });
      }
      await audit(req, "update", "reservations",
        `Check-out revertido: ${reservation.reservationCode} — el huésped permanece en la habitación`,
        { entityType: "reservation", entityId: req.params.id }
      );
      res.json({ success: true });
    } catch (error) {
      console.error("undo-checkout error:", error);
      res.status(500).json({ error: "Error al revertir el check-out" });
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
      const savedRoomTotal = parseFloat(reservation.totalRoomAmount || "0");
      const roomTotal = savedRoomTotal > 0
        ? savedRoomTotal
        : parseFloat(reservation.finalRatePerNight || "0") * (reservation.nights || 0);
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

  // GET /api/reservations/:id/folio/pdf — Resumen de cuenta (PDF de cortesía)
  app.get("/api/reservations/:id/folio/pdf", requireAuth, async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });

      const [chargesList, paymentsList, config, invoicesResult] = await Promise.all([
        storage.getCharges(req.params.id),
        storage.getPayments(req.params.id),
        getBillingConfig(),
        db.execute(sql`
          SELECT tipo_comprobante, punto_venta, numero, fecha_emision, monto_total, cae
          FROM sales_invoices
          WHERE reserva_id = ${req.params.id}
            AND tipo_comprobante IN ('FA','FB','FC','FT','FM')
            AND estado IN ('emitida','parcial')
          ORDER BY created_at ASC
        `).catch(() => ({ rows: [] })),
      ]);
      const emittedInvoices = (invoicesResult.rows as any[]).map((r: any) => ({
        tipo_comprobante: r.tipo_comprobante as string,
        punto_venta: Number(r.punto_venta),
        numero: Number(r.numero),
        fecha_emision: r.fecha_emision as string,
        monto_total: r.monto_total,
        cae: r.cae ?? null,
      }));

      // Fetch void adjustments from folio_movements (written when an NC voids a payment)
      let voidAdjustments: Array<{ description: string; date: string; amount: string }> = [];
      try {
        const folioRow = await db.execute(
          sql`SELECT id FROM folios WHERE entity_type = 'reservation' AND entity_id = ${req.params.id} LIMIT 1`
        );
        const folioRec = folioRow.rows?.[0] as any;
        if (folioRec) {
          const movRows = await db.execute(
            sql`SELECT description, amount, created_at FROM folio_movements WHERE folio_id = ${folioRec.id} AND type = 'void' ORDER BY created_at ASC`
          );
          voidAdjustments = (movRows.rows as any[]).map((r) => ({
            description: r.description as string,
            date: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString().split("T")[0],
            amount: String(r.amount),
          }));
        }
      } catch (adjErr: any) {
        console.warn("[folio-pdf] could not load void adjustments (non-fatal):", adjErr?.message);
      }

      const activePayments = paymentsList.filter((p) => (p as any).status !== "anulado");
      const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
      const totalCharges = chargesList.reduce((s, c) => s + parseFloat(c.amount), 0);
      const grandTotal = roomTotal + totalCharges;
      const totalPayments = activePayments.reduce((s, p) => s + parseFloat(p.amount), 0);
      const balance = grandTotal - totalPayments;

      const printedAt = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

      const pdfBuf = await generarResumenCuentaPDF({
        reservationCode: reservation.reservationCode,
        guestName: `${reservation.guest?.firstName ?? ""} ${reservation.guest?.lastName ?? ""}`.trim(),
        roomNumber: reservation.room?.roomNumber ?? "",
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        nights: reservation.nights ?? 1,
        roomRate: parseFloat(reservation.finalRatePerNight || "0"),
        roomTotal,
        charges: chargesList.map(c => ({ description: c.description, date: c.date, amount: c.amount, category: c.category ?? undefined })),
        payments: activePayments.map(p => ({ date: p.date, method: p.method, amount: p.amount, reference: p.reference, notes: p.notes })),
        adjustments: voidAdjustments.length > 0 ? voidAdjustments : undefined,
        invoices: emittedInvoices.length > 0 ? emittedInvoices : undefined,
        grandTotal,
        totalPayments,
        balance,
        printedAt,
      }, config);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Resumen_${reservation.reservationCode}.pdf"`);
      res.send(pdfBuf);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error generando PDF" });
    }
  });

  // GET /api/reservations/:id/invoices — facturas fiscales emitidas para una reserva
  app.get("/api/reservations/:id/invoices", requireAuth, async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT id, tipo_comprobante, punto_venta, numero, fecha_emision,
               cliente_razon_social, cliente_cuit, cliente_condicion_iva,
               monto_total, monto_acreditado, estado, items, cae, modo_ficticio,
               source_charge_ids
        FROM sales_invoices
        WHERE reserva_id = ${req.params.id}
          AND tipo_comprobante IN ('FA', 'FB', 'FC', 'FT', 'FM')
          AND estado IN ('emitida', 'parcial')
        ORDER BY created_at DESC
      `);
      res.json(rows.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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

  // Bulk close overdue reservations (checked_in with past checkout date, balance = 0)
  app.post("/api/reservations/bulk-checkout-overdue", async (req, res) => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const force = req.body.force === true;

      if (force) {
        // Bulk SQL UPDATE — close all overdue checked_in regardless of balance
        const result = await db.execute(sql`
          UPDATE reservations
          SET status = 'checked_out'
          WHERE status = 'checked_in'
            AND check_out_date <= ${today}
        `);
        const closed = (result as any).rowCount ?? 0;

        // Bulk mark rooms as dirty for those reservations
        await db.execute(sql`
          UPDATE rooms r
          SET status = 'dirty'
          FROM reservations res
          WHERE res.room_id = r.id
            AND res.status = 'checked_out'
            AND res.check_out_date <= ${today}
        `);

        await audit(req, "update", "reservations",
          `Cierre masivo forzado de vencidas: ${closed} cerradas`,
          {}
        );
        return res.json({ closed, skipped: 0 });
      }

      // Non-force: only close zero-balance overdue reservations
      const overdueList = await storage.getReservationsForCheckOut();
      const overdue = overdueList.filter(r => r.checkOutDate <= today);
      let closed = 0;
      let skipped = 0;
      for (const r of overdue) {
        const chargesTotal = await storage.getChargesTotal(r.id);
        const paymentsTotal = await storage.getPaymentsTotal(r.id);
        const savedRoomTotal = parseFloat(r.totalRoomAmount || "0");
        const roomTotal = savedRoomTotal > 0
          ? savedRoomTotal
          : parseFloat(r.finalRatePerNight || "0") * (r.nights || 0);
        const balance = roomTotal + chargesTotal - paymentsTotal;
        if (balance > 0.01) {
          skipped++;
          continue;
        }
        await storage.updateReservation(r.id, { status: "checked_out" });
        if (r.roomId) await storage.updateRoom(r.roomId, { status: "dirty" });
        storage.createCheckoutCleaningTask(r.roomId).catch(() => {});
        closed++;
      }
      await audit(req, "update", "reservations",
        `Cierre masivo de vencidas: ${closed} cerradas, ${skipped} con saldo pendiente`,
        {}
      );
      res.json({ closed, skipped });
    } catch (error) {
      console.error("bulk-checkout-overdue error:", error);
      res.status(500).json({ error: "Error en cierre masivo" });
    }
  });

  // Reopen today's forced checkouts (revert checked_out → checked_in for today/future dates)
  app.post("/api/reservations/reopen-todays-checkouts", requireAuth, async (req, res) => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const forced = await db.select().from(reservations).where(
        and(eq(reservations.status, "checked_out"), gte(reservations.checkOutDate, today))
      );
      if (forced.length === 0) return res.json({ reopened: 0, rooms: [] });
      const roomNumbers: string[] = [];
      for (const r of forced) {
        await storage.updateReservation(r.id, { status: "checked_in" });
        if (r.roomId) {
          await storage.updateRoom(r.roomId, { status: "occupied" });
          // Cancel pending checkout cleaning tasks for this room
          await db.execute(sql`
            UPDATE housekeeping_tasks
            SET status = 'cancelled'
            WHERE room_id = ${r.roomId}
              AND task_type = 'checkout_clean'
              AND status IN ('pending', 'assigned')
          `);
          const room = await storage.getRoom(r.roomId);
          if (room?.roomNumber) roomNumbers.push(room.roomNumber);
        }
      }
      await audit(req, "update", "reservations",
        `Reapertura de ${forced.length} check-out(s) forzados del día`,
        {}
      );
      res.json({ reopened: forced.length, rooms: roomNumbers });
    } catch (error) {
      console.error("reopen-todays-checkouts error:", error);
      res.status(500).json({ error: "Error al reabrir check-outs" });
    }
  });

  // Check-out endpoint
  app.post("/api/reservations/:id/check-out", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const checkoutableStatuses = ["checked_in", "confirmed", "pending"];
      if (!checkoutableStatuses.includes(reservation.status)) {
        return res.status(400).json({ error: "Solo se puede hacer check-out de reservas activas" });
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

      // Always compute balance (needed for both the block and the CC cargo creation)
      const chargesTotal = await storage.getChargesTotal(req.params.id);
      const paymentsTotal = await storage.getPaymentsTotal(req.params.id);
      const savedRoomTotal = parseFloat(reservation.totalRoomAmount || "0");
      const roomTotal = savedRoomTotal > 0
        ? savedRoomTotal
        : parseFloat(reservation.finalRatePerNight || "0") * (reservation.nights || 0);
      const balance = roomTotal + chargesTotal - paymentsTotal;

      if (!forceCheckout) {
        if (balance > 0.01) {
          return res.status(400).json({
            error: "Saldo pendiente",
            message: `La reserva tiene un saldo pendiente de $${balance.toFixed(2)}. Liquide antes de hacer check-out.`,
            balance
          });
        }
      }

      // Si se cierra con saldo pendiente y hay empresa/agencia/huésped vinculado, crear un cargo en CC
      if (forceCheckout && balance > 0.01) {
        const guestNameCC = reservation.guest
          ? `${reservation.guest.firstName} ${reservation.guest.lastName}`
          : "Huésped";
        const roomNumCC = reservation.room?.roomNumber || reservation.roomId;
        const dateCC = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        const descCC = `Saldo por estadía ${reservation.reservationCode} — Hab. ${roomNumCC} (cierre con deuda)`;
        const amtCC = balance.toFixed(2);

        // Verificar si ya existe un cargo de deuda para esta reserva (evitar duplicados si se reintenta)
        const existingMov = await storage.getAccountMovementsByReservation(reservation.id);
        const alreadyHasDebtCargo = existingMov.some(
          m => m.type === "cargo" && m.description?.includes("cierre con deuda")
        );

        if (!alreadyHasDebtCargo) {
          try {
            if (reservation.companyId) {
              await storage.createAccountMovement({
                entityType: "company",
                entityId: reservation.companyId,
                date: dateCC,
                type: "cargo",
                description: descCC,
                amount: amtCC,
                reservationId: reservation.id,
                reservationCode: reservation.reservationCode,
                guestName: guestNameCC,
              });
            } else if (reservation.agencyId) {
              await storage.createAccountMovement({
                entityType: "agency",
                entityId: reservation.agencyId,
                date: dateCC,
                type: "cargo",
                description: descCC,
                amount: amtCC,
                reservationId: reservation.id,
                reservationCode: reservation.reservationCode,
                guestName: guestNameCC,
              });
            } else if (reservation.guestId) {
              await storage.createAccountMovement({
                entityType: "guest",
                entityId: reservation.guestId,
                date: dateCC,
                type: "cargo",
                description: descCC,
                amount: amtCC,
                reservationId: reservation.id,
                reservationCode: reservation.reservationCode,
                guestName: guestNameCC,
              });
            }
          } catch (e) {
            console.error("[checkout] Error creando cargo CC por saldo pendiente:", e);
          }
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

      await storage.updateReservation(req.params.id, { status: "checked_out", checkedOutAt: new Date() });
      await storage.updateRoom(reservation.roomId, { status: "dirty" });
      // Fire-and-forget: si falla la tarea de limpieza no bloqueamos el check-out
      storage.createCheckoutCleaningTask(reservation.roomId).catch(e =>
        console.error("[checkout] createCheckoutCleaningTask error:", e)
      );
      await audit(req, "update", "reservations",
        `Check-out: ${reservation.reservationCode} — Hab. ${reservation.room?.roomNumber || reservation.roomId}`,
        { entityType: "reservation", entityId: req.params.id }
      );
      // Fire post-checkout email asynchronously (don't block response)
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      sendCheckoutEmail(req.params.id, baseUrl).catch(e => console.error("[email] checkout trigger error:", e));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[check-out] error:", error?.message || error, error?.stack || "");
      res.status(500).json({ error: "Error processing check-out", detail: error?.message || String(error) });
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

      // Auto-adjust group block quantity: if this reservation belonged to a group,
      // decrement the corresponding block so its ghost disappears from the planning.
      try {
        const [groupLink] = await db.select().from(groupReservationLinks)
          .where(eq(groupReservationLinks.reservationId, req.params.id));
        if (groupLink) {
          const blocks = await db.select().from(groupRoomBlocks)
            .where(eq(groupRoomBlocks.groupId, groupLink.groupId));
          const matchingBlock = blocks.find(b => b.roomTypeId === reservation.roomTypeId);
          if (matchingBlock) {
            if (matchingBlock.quantity <= 1) {
              await db.delete(groupRoomBlocks).where(eq(groupRoomBlocks.id, matchingBlock.id));
            } else {
              await db.update(groupRoomBlocks)
                .set({ quantity: matchingBlock.quantity - 1 })
                .where(eq(groupRoomBlocks.id, matchingBlock.id));
            }
          }
          // Remove the group link so the slot is no longer counted
          await db.delete(groupReservationLinks)
            .where(eq(groupReservationLinks.reservationId, req.params.id));
        }
      } catch (e) {
        console.error("[cancel] Error ajustando bloque de grupo:", e);
      }

      if (reservation.room?.status === "occupied") {
        await storage.updateRoom(reservation.roomId, { status: "dirty" });
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

  // Restore a cancelled reservation back to "confirmed"
  app.post("/api/reservations/:id/restore", requireAuth, async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });
      if (reservation.status !== "cancelled") {
        return res.status(400).json({ error: "Solo se pueden recuperar reservas en estado cancelado" });
      }

      // Check for conflicts before restoring
      const blockingStatuses = ["tentative", "pending", "reserved", "confirmed", "web_checkin", "checked_in"];
      const allReservations = await storage.getReservations();
      const checkIn = new Date(normalizeDate(reservation.checkInDate) + "T00:00:00Z");
      const checkOut = new Date(normalizeDate(reservation.checkOutDate) + "T00:00:00Z");
      const overlapping = allReservations.filter((r) => {
        if (r.id === reservation.id) return false;
        if (r.roomId !== reservation.roomId) return false;
        if (!blockingStatuses.includes(r.status)) return false;
        const rIn  = new Date(normalizeDate(r.checkInDate) + "T00:00:00Z");
        const rOut = new Date(normalizeDate(r.checkOutDate) + "T00:00:00Z");
        return !(checkOut <= rIn || checkIn >= rOut);
      });

      if (overlapping.length > 0) {
        const codes = overlapping.map((r) => r.reservationCode).join(", ");
        return res.status(409).json({
          error: `No se puede recuperar: la habitación tiene ${overlapping.length === 1 ? "una reserva" : "reservas"} en esas fechas (${codes}). Cambiá la habitación antes de recuperar.`,
        });
      }

      await storage.updateReservation(req.params.id, { status: "confirmed" });
      await audit(req, "restore", "reservations",
        `Recuperación: ${reservation.reservationCode} — por ${(req as any).user?.username || "sistema"}`,
        { entityType: "reservation", entityId: req.params.id }
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error al recuperar la reserva" });
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

  // ── Charge Types (presets gestionables desde Habitaciones) ─────────────────
  app.get("/api/charge-types", requireAuth, async (_req, res) => {
    try {
      const types = await storage.getChargeTypes();
      res.json(types);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin endpoint — returns ALL charge types including disabled ones
  app.get("/api/charge-types/all", requireAuth, async (_req, res) => {
    try {
      const types = await storage.getChargeTypesAll();
      res.json(types);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/charge-types", requireAuth, async (req, res) => {
    try {
      const { label, description, defaultAmount, category, sortOrder, allowPriceEdit, allowRecurring } = req.body;
      if (!label || !description || !defaultAmount) return res.status(400).json({ error: "label, description y defaultAmount son requeridos" });
      const ct = await storage.createChargeType({ label, description, defaultAmount: String(defaultAmount), category: category || "otros", active: true, sortOrder: sortOrder ?? 0, allowPriceEdit: allowPriceEdit ?? false, allowRecurring: allowRecurring ?? false });
      res.status(201).json(ct);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/charge-types/:id", requireAuth, async (req, res) => {
    try {
      const { label, description, defaultAmount, category, sortOrder, active, allowPriceEdit, allowRecurring } = req.body;
      const updated = await storage.updateChargeType(req.params.id, {
        ...(label !== undefined && { label }),
        ...(description !== undefined && { description }),
        ...(defaultAmount !== undefined && { defaultAmount: String(defaultAmount) }),
        ...(category !== undefined && { category }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(active !== undefined && { active }),
        ...(allowPriceEdit !== undefined && { allowPriceEdit }),
        ...(allowRecurring !== undefined && { allowRecurring }),
      });
      if (!updated) return res.status(404).json({ error: "Tipo de cargo no encontrado" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/charge-types/:id", requireAuth, async (req, res) => {
    try {
      // Check if charge type was ever used (by description match in charges table)
      const allTypes = await storage.getChargeTypesAll();
      const ct = allTypes.find(t => t.id === req.params.id);
      if (!ct) return res.status(404).json({ error: "Tipo de cargo no encontrado" });

      const usageCheck = await db.execute(
        sql`SELECT COUNT(*) FROM charges WHERE LOWER(description) = LOWER(${ct.label}) OR LOWER(description) = LOWER(${ct.description})`
      );
      const usageCount = parseInt((usageCheck.rows[0] as any)?.count ?? "0");
      if (usageCount > 0) {
        return res.status(400).json({
          error: `Este cargo fue utilizado en ${usageCount} registro(s) y no puede eliminarse. Podés deshabilitarlo para que no aparezca en el selector.`
        });
      }

      const ok = await storage.deleteChargeType(req.params.id);
      if (!ok) return res.status(404).json({ error: "Tipo de cargo no encontrado" });
      res.status(204).send();
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

  // Helper: compute already-transferred amount for a source item.
  // Negative adjustment charges include [xfer:{ref}] in their description to track prior transfers.
  async function getAlreadyTransferred(sourceId: string, ref: string): Promise<number> {
    const rows = await db.execute(sql`
      SELECT COALESCE(SUM(ABS(amount::numeric)), 0) AS total
      FROM charges
      WHERE reservation_id = ${sourceId}
        AND status = 'active'
        AND amount::numeric < 0
        AND description LIKE ${`%[xfer:${ref}]%`}
    `);
    return parseFloat((rows.rows[0] as any)?.total ?? "0");
  }

  // GET remaining transferable amount for each item in a source reservation.
  // Returns { accommodation: number, charges: { [chargeId]: number } }
  app.get("/api/reservations/:id/transfer-remaining", requireAuth, async (req, res) => {
    try {
      const sourceId = req.params.id;
      const sourceRes = await storage.getReservation(sourceId);
      if (!sourceRes) return res.status(404).json({ error: "Reserva no encontrada" });
      if (isReservationLocked(sourceRes)) {
        return res.status(403).json({ error: "No se puede operar sobre una reserva cerrada o cancelada" });
      }

      const roomTotal = parseFloat(sourceRes.totalRoomAmount || "0");
      const alreadyAccommodation = await getAlreadyTransferred(sourceId, "accommodation");
      const remainingAccommodation = Math.max(0, roomTotal - alreadyAccommodation);

      const chargesList = await storage.getCharges(sourceId);
      const chargeRemaining: Record<string, number> = {};
      for (const c of chargesList) {
        if (c.status !== "active" || parseFloat(c.amount) <= 0) continue;
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
