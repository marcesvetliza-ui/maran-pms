import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "../db";
import { storage } from "../db-storage";
import { withLodgingInventoryMutationLock } from "../inventoryMutationLock";
import { getOrCreateWebCheckin, getPublicWebCheckin, publicHotelBaseUrl, WebCheckinAccessError } from "../lib/webCheckinAccess";

export function registerWebCheckinRoutes(app: Express) {
  app.post("/api/web-checkin/generate/:reservationId", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.reservationId);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const webCheckin = await getOrCreateWebCheckin(req.params.reservationId);
      const link = `${publicHotelBaseUrl(`${req.protocol}://${req.get("host")}`)}/web-checkin/${webCheckin.token}`;
      res.json({ token: webCheckin.token, link, webCheckin });
    } catch (error) {
      if (error instanceof WebCheckinAccessError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: "Error generating web check-in" });
    }
  });

  app.get("/api/web-checkin/list", async (req, res) => {
    try {
      const webCheckins = await storage.listWebCheckins();
      const enriched = [];
      for (const wc of webCheckins) {
        const reservation = await storage.getReservation(wc.reservationId);
        enriched.push({
          ...wc,
          reservation: reservation ? {
            reservationCode: reservation.reservationCode,
            guestName: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
            roomNumber: reservation.room?.roomNumber,
            checkInDate: reservation.checkInDate,
            checkOutDate: reservation.checkOutDate,
            status: reservation.status,
          } : null,
        });
      }
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Error listing web check-ins" });
    }
  });

  app.get("/api/web-checkin/:reservationId/status", async (req, res) => {
    try {
      const webCheckin = await storage.getWebCheckinByReservation(req.params.reservationId);
      if (!webCheckin) {
        return res.json({ status: "not_generated" });
      }
      res.json(webCheckin);
    } catch (error) {
      res.status(500).json({ error: "Error getting web check-in status" });
    }
  });

  // Public endpoints (no auth required)
  // Lookup público: busca la reserva por código + apellido y devuelve el token del web check-in
  app.get("/api/public/reservation-lookup", async (req, res) => {
    try {
      const { code, lastName } = req.query as { code?: string; lastName?: string };
      if (!code?.trim() || !lastName?.trim()) {
        return res.status(400).json({ error: "Código de reserva y apellido son requeridos" });
      }
      const normalizedCode = code.trim().toUpperCase();
      const normalizedLast = lastName.trim().toLowerCase();

      const result = await db.execute(sql`
        SELECT r.id, r.reservation_code, r.status, r.check_in_date, r.check_out_date,
               g.last_name as guest_last_name
        FROM reservations r
        INNER JOIN guests g ON g.id = r.guest_id
        WHERE UPPER(r.reservation_code) = ${normalizedCode}
        LIMIT 1
      `);

      const reservation = result.rows[0];
      if (!reservation) {
        return res.status(404).json({ error: "Reserva no encontrada. Verificá el código ingresado." });
      }

      const resRow = reservation as any;
      if ((resRow.guest_last_name || "").toLowerCase() !== normalizedLast) {
        return res.status(403).json({ error: "Los datos no coinciden con los registros de la reserva." });
      }

      const webCheckin = await getOrCreateWebCheckin(resRow.id);

      res.json({ token: webCheckin.token });
    } catch (error) {
      if (error instanceof WebCheckinAccessError) return res.status(error.status).json({ error: error.message });
      console.error("reservation-lookup error:", error);
      res.status(500).json({ error: "Error interno" });
    }
  });

  app.get("/api/public/web-checkin/:token", async (req, res) => {
    try {
      const webCheckin = await getPublicWebCheckin(req.params.token);

      const reservation = await storage.getReservation(webCheckin.reservationId);
      const existingCompanions = await storage.getReservationCompanions(webCheckin.reservationId);

      res.json({
        webCheckin: {
          id: webCheckin.id,
          status: webCheckin.status,
          confirmedFirstName: webCheckin.confirmedFirstName,
          confirmedLastName: webCheckin.confirmedLastName,
          confirmedDocumentType: webCheckin.confirmedDocumentType,
          confirmedDocumentNumber: webCheckin.confirmedDocumentNumber,
          confirmedNationality: webCheckin.confirmedNationality,
          confirmedPhone: webCheckin.confirmedPhone,
          confirmedEmail: webCheckin.confirmedEmail,
        },
        guest: reservation?.guest ? {
          firstName: reservation.guest.firstName,
          lastName: reservation.guest.lastName,
          documentType: reservation.guest.documentType,
          documentNumber: reservation.guest.documentNumber,
          nationality: reservation.guest.nationality,
          phone: reservation.guest.phone,
          email: reservation.guest.email,
        } : null,
        reservation: reservation ? {
          checkInDate: reservation.checkInDate,
          checkOutDate: reservation.checkOutDate,
          roomType: reservation.room?.roomType?.name,
          nights: reservation.nights,
          numberOfGuests: reservation.numberOfGuests,
        } : null,
        existingCompanions: existingCompanions.map(c => ({
          firstName: c.firstName,
          lastName: c.lastName,
          documentType: c.documentType,
          documentNumber: c.documentNumber,
          nationality: c.nationality,
        })),
        hotel: {
          name: "Maran Suites & Towers",
          address: "Alameda de la Federación 497, Paraná, Entre Ríos",
          phone: "+54 343 423-5444",
        },
      });
    } catch (error) {
      if (error instanceof WebCheckinAccessError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: "Error loading web check-in" });
    }
  });

  app.post("/api/public/web-checkin/:token", async (req, res) => {
    try {
      const result = await withLodgingInventoryMutationLock(() => withDatabaseTransaction(async () => {
        const webCheckin = await getPublicWebCheckin(req.params.token);

        const {
          confirmedFirstName, confirmedLastName,
          confirmedDocumentType, confirmedDocumentNumber,
          confirmedNationality, confirmedPhone, confirmedEmail,
          documentPhotoUrl, signatureImage, estimatedArrivalTime,
          requestEarlyCheckIn, earlyCheckInTime,
          termsAccepted, requestFacturaA,
          companions,
        } = req.body;

        if (!termsAccepted) {
          return res.status(400).json({ error: "Debe aceptar los términos y condiciones" });
        }

        if (!confirmedFirstName?.trim() || !confirmedLastName?.trim()) {
          return res.status(400).json({ error: "Nombre y apellido son obligatorios" });
        }

        if (documentPhotoUrl && typeof documentPhotoUrl === "string" && documentPhotoUrl.length > 5 * 1024 * 1024) {
          return res.status(400).json({ error: "La imagen del documento es demasiado grande" });
        }
        if (signatureImage && typeof signatureImage === "string" && signatureImage.length > 2 * 1024 * 1024) {
          return res.status(400).json({ error: "La imagen de firma es demasiado grande" });
        }

        const ipAddress = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "";

        await storage.updateWebCheckin(webCheckin.id, {
          status: "completed",
          confirmedFirstName,
          confirmedLastName,
          confirmedDocumentType,
          confirmedDocumentNumber,
          confirmedNationality,
          confirmedPhone,
          confirmedEmail,
          documentPhotoUrl,
          signatureImage: signatureImage || null,
          estimatedArrivalTime,
          requestEarlyCheckIn: requestEarlyCheckIn || false,
          earlyCheckInTime: earlyCheckInTime || null,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          requestFacturaA: requestFacturaA || false,
          ipAddress,
          completedAt: new Date(),
        } as any);

        const reservation = await storage.getReservation(webCheckin.reservationId);
        if (reservation && reservation.guest) {
          await storage.updateGuest(reservation.guest.id, {
            firstName: confirmedFirstName || reservation.guest.firstName,
            lastName: confirmedLastName || reservation.guest.lastName,
            documentType: confirmedDocumentType || reservation.guest.documentType,
            documentNumber: confirmedDocumentNumber || reservation.guest.documentNumber,
            nationality: confirmedNationality || reservation.guest.nationality,
            phone: confirmedPhone || reservation.guest.phone,
            email: confirmedEmail || reservation.guest.email,
          });
        }

        // Actualizar status de la reserva a "web_checkin" (Pre Check-In confirmado)
        if (reservation && reservation.status !== "checked_in" && reservation.status !== "checked_out") {
          await storage.updateReservation(webCheckin.reservationId, {
            status: "web_checkin",
          } as any);
        }

        if (requestEarlyCheckIn && reservation) {
          await storage.updateReservation(webCheckin.reservationId, {
            earlyCheckIn: true,
            earlyCheckInTime: earlyCheckInTime || null,
          } as any);
        }

        // Guardar acompañantes en reservation_companions
        // Primero eliminar los anteriores del web check-in (pueden cambiar en reenvíos)
        const prevCompanions = await storage.getReservationCompanions(webCheckin.reservationId);
        // Solo eliminar los que no tienen sourceType manual (los del web check-in se replican)
        // Estrategia simple: reemplazar todos con los nuevos si vienen companions en el payload
        if (Array.isArray(companions) && companions.length > 0) {
          for (const prev of prevCompanions) {
            await storage.deleteReservationCompanion(prev.id);
          }
          for (const comp of companions) {
            if (comp.firstName?.trim() && comp.lastName?.trim()) {
              await storage.addReservationCompanion({
                reservationId: webCheckin.reservationId,
                firstName: comp.firstName.trim(),
                lastName: comp.lastName.trim(),
                documentType: comp.documentType || "DNI",
                documentNumber: comp.documentNumber?.trim() || null,
                nationality: comp.nationality?.trim() || null,
                dateOfBirth: null,
              });
            }
          }
        }

        // Notificación mejorada para conserjería/recepción
        const validCompanions = Array.isArray(companions)
          ? companions.filter((c: any) => c.firstName?.trim() && c.lastName?.trim())
          : [];
        const companionSummary = validCompanions.length > 0
          ? `\nAcompañantes registrados: ${validCompanions.map((c: any) => `${c.firstName} ${c.lastName} (${c.documentType} ${c.documentNumber})`).join("; ")}`
          : "\nSin acompañantes registrados en el pre-ingreso.";
        const termsLine = `\nT&C aceptados: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} · IP: ${req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "desconocida"}`;

        await storage.createNotification({
          type: "web_checkin",
          title: `Pre-Ingreso completado — ${confirmedFirstName} ${confirmedLastName}`,
          message: `El huésped completó el Pre-Ingreso online.\nLlegada estimada: ${estimatedArrivalTime || "No especificada"}${requestEarlyCheckIn ? `\n⚡ Solicita EARLY CHECK-IN: ${earlyCheckInTime || "sin hora"}` : ""}${companionSummary}${termsLine}`,
          targetArea: "reception",
          relatedEntityType: "reservation",
          relatedEntityId: webCheckin.reservationId,
          priority: requestEarlyCheckIn ? "high" : "normal",
        });

        return { success: true, companionsSaved: validCompanions.length };
      }));
      if (!res.headersSent) res.json(result);
    } catch (error) {
      if (error instanceof WebCheckinAccessError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: "Error processing web check-in" });
    }
  });

}
