import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";
import { insertGuestReviewSchema } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Dashboard
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Error fetching dashboard stats" });
    }
  });

  // Today's arrivals (check-ins scheduled for today)
  app.get("/api/dashboard/arrivals", async (req, res) => {
    try {
      const arrivals = await storage.getReservationsForCheckIn();
      res.json(arrivals);
    } catch (error) {
      res.status(500).json({ error: "Error fetching arrivals" });
    }
  });

  // Today's departures (check-outs scheduled for today)
  app.get("/api/dashboard/departures", async (req, res) => {
    try {
      const departures = await storage.getReservationsForCheckOut();
      res.json(departures);
    } catch (error) {
      res.status(500).json({ error: "Error fetching departures" });
    }
  });

  // Planning
  app.get("/api/planning", async (req, res) => {
    try {
      const startDate = req.query.start as string;
      const endDate = req.query.end as string;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start and end dates are required" });
      }
      
      const planningData = await storage.getPlanningData(startDate, endDate);
      res.json(planningData);
    } catch (error) {
      res.status(500).json({ error: "Error fetching planning data" });
    }
  });

  // Room Types
  app.get("/api/room-types", async (req, res) => {
    try {
      const roomTypes = await storage.getRoomTypes();
      res.json(roomTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching room types" });
    }
  });

  app.post("/api/room-types", async (req, res) => {
    try {
      const roomType = await storage.createRoomType(req.body);
      res.status(201).json(roomType);
    } catch (error) {
      res.status(500).json({ error: "Error creating room type" });
    }
  });

  app.patch("/api/room-types/:id", async (req, res) => {
    try {
      const roomType = await storage.updateRoomType(req.params.id, req.body);
      if (!roomType) {
        return res.status(404).json({ error: "Room type not found" });
      }
      res.json(roomType);
    } catch (error) {
      res.status(500).json({ error: "Error updating room type" });
    }
  });

  app.delete("/api/room-types/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteRoomType(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Room type not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting room type" });
    }
  });

  // Rate Plans
  app.get("/api/rate-plans", async (req, res) => {
    try {
      const ratePlans = await storage.getRatePlans();
      res.json(ratePlans);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rate plans" });
    }
  });

  app.get("/api/rate-plans/by-room-type/:roomTypeId", async (req, res) => {
    try {
      const ratePlans = await storage.getRatePlansByRoomType(req.params.roomTypeId);
      res.json(ratePlans);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rate plans by room type" });
    }
  });

  app.get("/api/rate-plans/:id", async (req, res) => {
    try {
      const ratePlan = await storage.getRatePlan(req.params.id);
      if (!ratePlan) {
        return res.status(404).json({ error: "Rate plan not found" });
      }
      res.json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rate plan" });
    }
  });

  app.post("/api/rate-plans", async (req, res) => {
    try {
      const ratePlan = await storage.createRatePlan(req.body);
      res.status(201).json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error creating rate plan" });
    }
  });

  app.patch("/api/rate-plans/:id", async (req, res) => {
    try {
      const ratePlan = await storage.updateRatePlan(req.params.id, req.body);
      if (!ratePlan) {
        return res.status(404).json({ error: "Rate plan not found" });
      }
      res.json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error updating rate plan" });
    }
  });

  app.delete("/api/rate-plans/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteRatePlan(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Rate plan not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting rate plan" });
    }
  });

  // Rooms
  app.get("/api/rooms", async (req, res) => {
    try {
      const rooms = await storage.getRooms();
      res.json(rooms);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rooms" });
    }
  });

  app.get("/api/rooms/:id", async (req, res) => {
    try {
      const room = await storage.getRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error fetching room" });
    }
  });

  app.post("/api/rooms", async (req, res) => {
    try {
      const room = await storage.createRoom(req.body);
      res.status(201).json(room);
    } catch (error) {
      res.status(500).json({ error: "Error creating room" });
    }
  });

  app.patch("/api/rooms/:id", async (req, res) => {
    try {
      const room = await storage.updateRoom(req.params.id, req.body);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error updating room" });
    }
  });

  app.delete("/api/rooms/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteRoom(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting room" });
    }
  });

  // Companies
  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Error fetching companies" });
    }
  });

  app.get("/api/companies/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const companies = await storage.searchCompanies(query);
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Error searching companies" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Error fetching company" });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const company = await storage.createCompany(req.body);
      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ error: "Error creating company" });
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.updateCompany(req.params.id, req.body);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Error updating company" });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCompany(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting company" });
    }
  });

  // Guests
  app.get("/api/guests", async (req, res) => {
    try {
      const guests = await storage.getGuests();
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guests" });
    }
  });

  app.get("/api/guests/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const guests = await storage.searchGuests(query);
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Error searching guests" });
    }
  });

  app.get("/api/guests/:id", async (req, res) => {
    try {
      const guest = await storage.getGuest(req.params.id);
      if (!guest) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guest" });
    }
  });

  app.post("/api/guests", async (req, res) => {
    try {
      const guest = await storage.createGuest(req.body);
      res.status(201).json(guest);
    } catch (error) {
      res.status(500).json({ error: "Error creating guest" });
    }
  });

  app.patch("/api/guests/:id", async (req, res) => {
    try {
      const guest = await storage.updateGuest(req.params.id, req.body);
      if (!guest) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Error updating guest" });
    }
  });

  app.delete("/api/guests/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteGuest(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting guest" });
    }
  });

  // Reservations
  app.get("/api/reservations", async (req, res) => {
    try {
      const reservations = await storage.getReservations();
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: "Error fetching reservations" });
    }
  });

  app.get("/api/reservations/recent", async (req, res) => {
    try {
      const reservations = await storage.getRecentReservations(5);
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recent reservations" });
    }
  });

  app.get("/api/reservations/check-in", async (req, res) => {
    try {
      const reservations = await storage.getReservationsForCheckIn();
      res.json(reservations);
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
      const reservations = await storage.getCheckInsByDate(date);
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: "Error fetching check-ins by date" });
    }
  });

  app.get("/api/reservations/check-out", async (req, res) => {
    try {
      const reservations = await storage.getReservationsForCheckOut();
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: "Error fetching check-out reservations" });
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
      const data = {
        ...req.body,
        reservationCode: req.body.reservationCode || storage.generateReservationCode(),
        createdAt: req.body.createdAt || new Date().toISOString(),
      };
      const reservation = await storage.createReservation(data);
      res.status(201).json(reservation);
    } catch (error) {
      res.status(500).json({ error: "Error creating reservation" });
    }
  });

  app.patch("/api/reservations/:id", async (req, res) => {
    try {
      const reservation = await storage.updateReservation(req.params.id, req.body);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      res.json(reservation);
    } catch (error) {
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
      
      // Normalize dates to date-only strings (YYYY-MM-DD) to avoid timezone issues
      const normalizeDate = (dateStr: string): string => {
        // If already in YYYY-MM-DD format, use as-is
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        // Otherwise parse and extract date part
        const d = new Date(dateStr);
        return d.toISOString().split('T')[0];
      };
      
      const normalizedCheckIn = normalizeDate(checkInDate);
      const normalizedCheckOut = normalizeDate(checkOutDate);
      
      // Parse normalized dates for comparison (UTC midnight)
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
      
      // Check for overlapping reservations on the same room
      // Active statuses that block the room
      const blockingStatuses = ["tentative", "pending", "confirmed", "checked_in"];
      const allReservations = await storage.getReservations();
      const overlapping = allReservations.filter(r => {
        // Exclude the original reservation from overlap check
        if (r.id === original.id) return false;
        if (r.roomId !== finalRoomId) return false;
        if (!blockingStatuses.includes(r.status)) return false;
        
        const rCheckIn = new Date(normalizeDate(r.checkInDate) + 'T00:00:00Z');
        const rCheckOut = new Date(normalizeDate(r.checkOutDate) + 'T00:00:00Z');
        
        // Check for date overlap
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
        createdAt: new Date().toISOString(),
        lastModifiedBy: null,
      });
      
      res.status(201).json(duplicated);
    } catch (error) {
      res.status(500).json({ error: "Error duplicating reservation" });
    }
  });

  app.delete("/api/reservations/:id", async (req, res) => {
    try {
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
      
      // Validate room is available (clean) before check-in
      const room = await storage.getRoom(reservation.roomId);
      if (!room) {
        return res.status(400).json({ error: "Habitación no encontrada" });
      }
      
      if (room.status !== "available") {
        const statusMessages: Record<string, string> = {
          occupied: "La habitación está ocupada",
          cleaning: "La habitación está en limpieza",
          maintenance: "La habitación está en mantenimiento", 
          out_of_service: "La habitación está fuera de servicio",
        };
        const message = statusMessages[room.status] || `La habitación no está disponible (estado: ${room.status})`;
        return res.status(400).json({ error: message });
      }
      
      // Update reservation status
      await storage.updateReservation(req.params.id, { status: "checked_in" });
      
      // Update room status to occupied
      await storage.updateRoom(reservation.roomId, { status: "occupied" });
      
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
      
      const charges = await storage.getCharges(req.params.id);
      const totalCharges = charges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
      const grandTotal = roomTotal + totalCharges;
      
      res.json({
        reservationCode: reservation.reservationCode,
        guestName: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
        roomNumber: reservation.room?.roomNumber,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        nights: reservation.nights,
        roomRate: reservation.finalRatePerNight,
        roomTotal,
        charges,
        totalCharges,
        grandTotal,
        balance: grandTotal,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching folio" });
    }
  });

  // Check-out endpoint
  app.post("/api/reservations/:id/check-out", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      
      // Get balance - if forceCheckout is true, skip balance check
      const forceCheckout = req.body.forceCheckout === true;
      if (!forceCheckout) {
        const chargesTotal = await storage.getChargesTotal(req.params.id);
        const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
        const totalOwed = roomTotal + chargesTotal;
        
        if (totalOwed > 0) {
          return res.status(400).json({ 
            error: "Saldo pendiente",
            message: `La reserva tiene un saldo pendiente de $${totalOwed.toFixed(2)}. Liquide antes de hacer check-out.`,
            balance: totalOwed
          });
        }
      }
      
      // Update reservation status
      await storage.updateReservation(req.params.id, { status: "checked_out" });
      
      // Update room status to dirty (housekeeping will clean it)
      await storage.updateRoom(reservation.roomId, { status: "dirty" });
      
      // Create housekeeping task for the room
      await storage.createCheckoutCleaningTask(reservation.roomId);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error processing check-out" });
    }
  });

  // Cancel reservation endpoint (logs to CancelledReservationLog)
  app.post("/api/reservations/:id/cancel", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      
      // Log the cancellation
      await storage.createCancelledReservationLog({
        reservationCode: reservation.reservationCode,
        guestName: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
        roomNumber: reservation.room?.roomNumber || "",
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        cancellationDate: new Date().toISOString(),
        cancelledBy: req.body.cancelledBy || null,
        reason: req.body.reason || null,
      });
      
      // Update reservation status
      await storage.updateReservation(req.params.id, { status: "cancelled" });
      
      // If room was occupied, set to dirty
      if (reservation.room?.status === "occupied") {
        await storage.updateRoom(reservation.roomId, { status: "dirty" });
      }
      
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

  // Generate reservation code
  app.get("/api/reservations/generate-code", async (req, res) => {
    try {
      const code = storage.generateReservationCode();
      res.json({ code });
    } catch (error) {
      res.status(500).json({ error: "Error generating reservation code" });
    }
  });

  // Get reservations by guest
  app.get("/api/guests/:guestId/reservations", async (req, res) => {
    try {
      const reservations = await storage.getReservationsByGuest(req.params.guestId);
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guest reservations" });
    }
  });

  // Charges
  app.get("/api/reservations/:reservationId/charges", async (req, res) => {
    try {
      const charges = await storage.getCharges(req.params.reservationId);
      res.json(charges);
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
      const charge = await storage.createCharge(req.body);
      res.status(201).json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error creating charge" });
    }
  });

  app.patch("/api/charges/:id", async (req, res) => {
    try {
      const charge = await storage.updateCharge(req.params.id, req.body);
      if (!charge) {
        return res.status(404).json({ error: "Charge not found" });
      }
      res.json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error updating charge" });
    }
  });

  app.delete("/api/charges/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCharge(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Charge not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting charge" });
    }
  });

  // Payments
  app.get("/api/reservations/:reservationId/payments", async (req, res) => {
    try {
      const payments = await storage.getPayments(req.params.reservationId);
      res.json(payments);
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
      const payment = await storage.createPayment(req.body);
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

  app.delete("/api/payments/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePayment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Payment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting payment" });
    }
  });

  // OTA Channels
  app.get("/api/ota-channels", async (req, res) => {
    try {
      const channels = await storage.getOTAChannels();
      res.json(channels);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA channels" });
    }
  });

  app.get("/api/ota-channels/:id", async (req, res) => {
    try {
      const channel = await storage.getOTAChannel(req.params.id);
      if (!channel) {
        return res.status(404).json({ error: "OTA channel not found" });
      }
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA channel" });
    }
  });

  app.post("/api/ota-channels", async (req, res) => {
    try {
      const channel = await storage.createOTAChannel({
        ...req.body,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(channel);
    } catch (error) {
      res.status(500).json({ error: "Error creating OTA channel" });
    }
  });

  app.patch("/api/ota-channels/:id", async (req, res) => {
    try {
      const channel = await storage.updateOTAChannel(req.params.id, req.body);
      if (!channel) {
        return res.status(404).json({ error: "OTA channel not found" });
      }
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Error updating OTA channel" });
    }
  });

  app.delete("/api/ota-channels/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteOTAChannel(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "OTA channel not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting OTA channel" });
    }
  });

  // OTA Reservation Logs
  app.get("/api/ota-reservations", async (req, res) => {
    try {
      const channelId = req.query.channelId as string | undefined;
      const logs = await storage.getOTAReservationLogs(channelId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA reservation logs" });
    }
  });

  app.get("/api/ota-reservations/:id", async (req, res) => {
    try {
      const log = await storage.getOTAReservationLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: "OTA reservation log not found" });
      }
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA reservation log" });
    }
  });

  app.post("/api/ota-reservations", async (req, res) => {
    try {
      const log = await storage.createOTAReservationLog({
        ...req.body,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(log);
    } catch (error) {
      res.status(500).json({ error: "Error creating OTA reservation log" });
    }
  });

  app.post("/api/ota-reservations/:id/sync", async (req, res) => {
    try {
      const reservation = await storage.syncOTAReservation(req.params.id);
      if (!reservation) {
        return res.status(400).json({ error: "Could not sync reservation - no available rooms or already synced" });
      }
      res.json({ success: true, reservation });
    } catch (error) {
      res.status(500).json({ error: "Error syncing OTA reservation" });
    }
  });

  // Simulate OTA reservation import (for testing)
  app.post("/api/ota-channels/:id/simulate-import", async (req, res) => {
    try {
      const channel = await storage.getOTAChannel(req.params.id);
      if (!channel) {
        return res.status(404).json({ error: "OTA channel not found" });
      }

      const today = new Date();
      const checkIn = new Date(today.getTime() + (Math.floor(Math.random() * 7) + 1) * 86400000);
      const nights = Math.floor(Math.random() * 5) + 1;
      const checkOut = new Date(checkIn.getTime() + nights * 86400000);
      const totalAmount = (Math.floor(Math.random() * 200) + 50) * nights;
      const commission = totalAmount * parseFloat(channel.commissionPercent || "15") / 100;

      const guestNames = ["Maria Rodriguez", "John Smith", "Carlos Gonzalez", "Sophie Martin", "Hans Mueller", "Yuki Tanaka", "Emma Johnson"];
      const roomTypes = ["Standard", "Doble", "Suite", "Familiar"];

      const log = await storage.createOTAReservationLog({
        channelId: channel.id,
        externalReservationId: `${channel.channelType.toUpperCase()}-${Date.now()}`,
        guestName: guestNames[Math.floor(Math.random() * guestNames.length)],
        checkInDate: checkIn.toISOString().split("T")[0],
        checkOutDate: checkOut.toISOString().split("T")[0],
        roomTypeName: roomTypes[Math.floor(Math.random() * roomTypes.length)],
        totalAmount: totalAmount.toFixed(2),
        commission: commission.toFixed(2),
        netAmount: (totalAmount - commission).toFixed(2),
        status: "pending",
        rawData: null,
        syncedAt: null,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json(log);
    } catch (error) {
      res.status(500).json({ error: "Error simulating OTA import" });
    }
  });

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
      const { name, contactName, contactPhone, contactEmail, eventDate, checkInDate, checkOutDate, status, releaseDate, notes } = req.body;
      
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
        checkInDate,
        checkOutDate,
        status: status || "tentative",
        releaseDate: releaseDate || null,
        notes: notes || null,
        createdAt: new Date().toISOString(),
        createdBy: null,
      });
      res.status(201).json(group);
    } catch (error) {
      res.status(500).json({ error: "Error creating group" });
    }
  });

  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const { name, contactName, contactPhone, contactEmail, eventDate, checkInDate, checkOutDate, status, releaseDate, notes } = req.body;
      const updateData: Record<string, unknown> = {};
      
      if (name !== undefined) updateData.name = name;
      if (contactName !== undefined) updateData.contactName = contactName;
      if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
      if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
      if (eventDate !== undefined) updateData.eventDate = eventDate;
      if (checkInDate !== undefined) updateData.checkInDate = checkInDate;
      if (checkOutDate !== undefined) updateData.checkOutDate = checkOutDate;
      if (status !== undefined) updateData.status = status;
      if (releaseDate !== undefined) updateData.releaseDate = releaseDate;
      if (notes !== undefined) updateData.notes = notes;

      const group = await storage.updateGroup(req.params.id, updateData);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      res.status(500).json({ error: "Error updating group" });
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
      if (!roomId || !guestFirstName || !guestLastName) {
        return res.status(400).json({ error: "Room ID, guest first name, and guest last name are required" });
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

  // Guest Reviews
  app.get("/api/reviews", async (req, res) => {
    try {
      const reviews = await storage.getGuestReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: "Error fetching reviews" });
    }
  });

  app.get("/api/reviews/analytics", async (req, res) => {
    try {
      const analytics = await storage.getReviewAnalyticsSummary();
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: "Error fetching review analytics" });
    }
  });

  app.get("/api/reviews/:id", async (req, res) => {
    try {
      const review = await storage.getGuestReview(req.params.id);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }
      res.json(review);
    } catch (error) {
      res.status(500).json({ error: "Error fetching review" });
    }
  });

  app.post("/api/reviews", async (req, res) => {
    try {
      const validationResult = insertGuestReviewSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid review data", 
          details: validationResult.error.errors 
        });
      }
      const review = await storage.createGuestReview(validationResult.data);
      const enrichedReview = await storage.getGuestReview(review.id);
      res.status(201).json(enrichedReview);
    } catch (error) {
      res.status(500).json({ error: "Error creating review" });
    }
  });

  app.patch("/api/reviews/:id", async (req, res) => {
    try {
      const partialSchema = insertGuestReviewSchema.partial();
      const validationResult = partialSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid review data", 
          details: validationResult.error.errors 
        });
      }
      const review = await storage.updateGuestReview(req.params.id, validationResult.data);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }
      const enrichedReview = await storage.getGuestReview(review.id);
      res.json(enrichedReview);
    } catch (error) {
      res.status(500).json({ error: "Error updating review" });
    }
  });

  app.delete("/api/reviews/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteGuestReview(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Review not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting review" });
    }
  });

  // Sentiment Analysis Endpoint
  app.post("/api/reviews/:id/analyze", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      const review = await storage.getGuestReview(req.params.id);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      const prompt = `Analyze the following hotel guest review and provide sentiment analysis in JSON format.

Review Title: ${review.title || "No title"}
Review Content: ${review.content}
Rating: ${review.rating}/5

Respond with a JSON object containing:
{
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": number between 0 and 1 (0 = very negative, 1 = very positive),
  "categories": array of categories mentioned (from: "service", "cleanliness", "location", "amenities", "value", "food", "staff", "general"),
  "keyPhrases": array of key phrases extracted from the review (max 5),
  "improvementSuggestions": array of specific improvement suggestions based on any negative aspects (max 3, empty if positive)
}

Only respond with the JSON object, no additional text.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      });

      const analysisText = completion.choices[0]?.message?.content || "{}";
      let analysis;
      try {
        analysis = JSON.parse(analysisText);
      } catch {
        analysis = {
          sentiment: review.rating >= 4 ? "positive" : review.rating >= 3 ? "neutral" : "negative",
          sentimentScore: review.rating / 5,
          categories: ["general"],
          keyPhrases: [],
          improvementSuggestions: [],
        };
      }

      const updatedReview = await storage.updateGuestReview(req.params.id, {
        sentiment: analysis.sentiment,
        sentimentScore: String(analysis.sentimentScore),
        categories: analysis.categories,
        keyPhrases: analysis.keyPhrases,
        improvementSuggestions: analysis.improvementSuggestions,
        analyzedAt: new Date().toISOString(),
      });

      res.json(updatedReview);
    } catch (error) {
      console.error("Sentiment analysis error:", error);
      res.status(500).json({ error: "Error analyzing review sentiment" });
    }
  });

  // Batch analyze all unanalyzed reviews
  app.post("/api/reviews/analyze-all", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      const reviews = await storage.getGuestReviews();
      const unanalyzed = reviews.filter(r => !r.analyzedAt);
      
      const results = { analyzed: 0, errors: 0 };
      
      for (const review of unanalyzed) {
        try {
          const prompt = `Analyze the following hotel guest review and provide sentiment analysis in JSON format.

Review Title: ${review.title || "No title"}
Review Content: ${review.content}
Rating: ${review.rating}/5

Respond with a JSON object containing:
{
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": number between 0 and 1,
  "categories": array of categories (from: "service", "cleanliness", "location", "amenities", "value", "food", "staff", "general"),
  "keyPhrases": array of key phrases (max 5),
  "improvementSuggestions": array of improvement suggestions (max 3)
}

Only respond with the JSON object.`;

          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
            temperature: 0.3,
          });

          const analysisText = completion.choices[0]?.message?.content || "{}";
          const analysis = JSON.parse(analysisText);

          await storage.updateGuestReview(review.id, {
            sentiment: analysis.sentiment,
            sentimentScore: String(analysis.sentimentScore),
            categories: analysis.categories,
            keyPhrases: analysis.keyPhrases,
            improvementSuggestions: analysis.improvementSuggestions,
            analyzedAt: new Date().toISOString(),
          });
          results.analyzed++;
        } catch {
          results.errors++;
        }
      }

      res.json({ message: `Analyzed ${results.analyzed} reviews, ${results.errors} errors`, ...results });
    } catch (error) {
      res.status(500).json({ error: "Error batch analyzing reviews" });
    }
  });

  // Housekeeping Tasks
  app.get("/api/housekeeping", async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const tasks = await storage.getHousekeepingTasks(date);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Error fetching housekeeping tasks" });
    }
  });

  app.get("/api/housekeeping/:id", async (req, res) => {
    try {
      const task = await storage.getHousekeepingTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Error fetching task" });
    }
  });

  app.post("/api/housekeeping", async (req, res) => {
    try {
      const task = await storage.createHousekeepingTask({
        ...req.body,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ error: "Error creating housekeeping task" });
    }
  });

  app.patch("/api/housekeeping/:id", async (req, res) => {
    try {
      const task = await storage.updateHousekeepingTask(req.params.id, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Error updating task" });
    }
  });

  app.delete("/api/housekeeping/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteHousekeepingTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting task" });
    }
  });

  // Update room status (for housekeeping)
  app.patch("/api/housekeeping/room/:roomId/status", async (req, res) => {
    try {
      const { status } = req.body;
      const room = await storage.updateRoom(req.params.roomId, { status });
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error updating room status" });
    }
  });

  // Start a task (change status to in_progress)
  app.post("/api/housekeeping/:id/start", async (req, res) => {
    try {
      const task = await storage.updateHousekeepingTask(req.params.id, {
        status: "in_progress",
        startedAt: new Date().toISOString(),
      });
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      // Also update room status to cleaning
      await storage.updateRoom(task.roomId, { status: "cleaning" });
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Error starting task" });
    }
  });

  // Complete a task (change status to completed)
  app.post("/api/housekeeping/:id/complete", async (req, res) => {
    try {
      const task = await storage.updateHousekeepingTask(req.params.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      // Mark room as available
      await storage.updateRoom(task.roomId, { status: "available" });
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Error completing task" });
    }
  });

  // Inspect a task (for supervisor)
  app.post("/api/housekeeping/:id/inspect", async (req, res) => {
    try {
      const { inspectedBy } = req.body;
      const task = await storage.updateHousekeepingTask(req.params.id, {
        status: "inspected",
        inspectedBy,
        inspectedAt: new Date().toISOString(),
      });
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Error inspecting task" });
    }
  });

  // ==================== RESTAURANT MODULE ====================
  
  // Restaurant Areas
  app.get("/api/restaurant/areas", async (req, res) => {
    try {
      const areas = await storage.getRestaurantAreas();
      res.json(areas);
    } catch (error) {
      res.status(500).json({ error: "Error fetching areas" });
    }
  });

  app.post("/api/restaurant/areas", async (req, res) => {
    try {
      const area = await storage.createRestaurantArea(req.body);
      res.status(201).json(area);
    } catch (error) {
      res.status(500).json({ error: "Error creating area" });
    }
  });

  app.patch("/api/restaurant/areas/:id", async (req, res) => {
    try {
      const area = await storage.updateRestaurantArea(req.params.id, req.body);
      if (!area) return res.status(404).json({ error: "Area not found" });
      res.json(area);
    } catch (error) {
      res.status(500).json({ error: "Error updating area" });
    }
  });

  app.delete("/api/restaurant/areas/:id", async (req, res) => {
    try {
      await storage.deleteRestaurantArea(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting area" });
    }
  });

  // Restaurant Tables
  app.get("/api/restaurant/tables", async (req, res) => {
    try {
      const tables = await storage.getRestaurantTables();
      res.json(tables);
    } catch (error) {
      res.status(500).json({ error: "Error fetching tables" });
    }
  });

  app.post("/api/restaurant/tables", async (req, res) => {
    try {
      const table = await storage.createRestaurantTable(req.body);
      res.status(201).json(table);
    } catch (error) {
      res.status(500).json({ error: "Error creating table" });
    }
  });

  app.patch("/api/restaurant/tables/:id", async (req, res) => {
    try {
      const table = await storage.updateRestaurantTable(req.params.id, req.body);
      if (!table) return res.status(404).json({ error: "Table not found" });
      res.json(table);
    } catch (error) {
      res.status(500).json({ error: "Error updating table" });
    }
  });

  app.delete("/api/restaurant/tables/:id", async (req, res) => {
    try {
      await storage.deleteRestaurantTable(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting table" });
    }
  });

  // Menu Categories
  app.get("/api/restaurant/menu/categories", async (req, res) => {
    try {
      const categories = await storage.getMenuCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Error fetching menu categories" });
    }
  });

  app.post("/api/restaurant/menu/categories", async (req, res) => {
    try {
      const category = await storage.createMenuCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating category" });
    }
  });

  app.patch("/api/restaurant/menu/categories/:id", async (req, res) => {
    try {
      const category = await storage.updateMenuCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating category" });
    }
  });

  app.delete("/api/restaurant/menu/categories/:id", async (req, res) => {
    try {
      await storage.deleteMenuCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting category" });
    }
  });

  // Menu Items
  app.get("/api/restaurant/menu/items", async (req, res) => {
    try {
      const items = await storage.getMenuItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching menu items" });
    }
  });

  app.post("/api/restaurant/menu/items", async (req, res) => {
    try {
      const item = await storage.createMenuItem(req.body);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating menu item" });
    }
  });

  app.patch("/api/restaurant/menu/items/:id", async (req, res) => {
    try {
      const item = await storage.updateMenuItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating menu item" });
    }
  });

  app.delete("/api/restaurant/menu/items/:id", async (req, res) => {
    try {
      await storage.deleteMenuItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting menu item" });
    }
  });

  // Restaurant Orders
  app.get("/api/restaurant/orders", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const orders = await storage.getRestaurantOrders(status as any);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Error fetching orders" });
    }
  });

  app.get("/api/restaurant/orders/:id", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Error fetching order" });
    }
  });

  app.post("/api/restaurant/orders", async (req, res) => {
    try {
      const orderNumber = storage.generateOrderNumber();
      const order = await storage.createRestaurantOrder({
        ...req.body,
        orderNumber,
        openedAt: new Date().toISOString(),
      });
      // Update table status if applicable
      if (order.tableId) {
        await storage.updateRestaurantTable(order.tableId, { status: "occupied" });
      }
      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ error: "Error creating order" });
    }
  });

  app.patch("/api/restaurant/orders/:id", async (req, res) => {
    try {
      const order = await storage.updateRestaurantOrder(req.params.id, req.body);
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Error updating order" });
    }
  });

  // Close order and optionally charge to room
  app.post("/api/restaurant/orders/:id/close", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      
      const { chargeToRoom, roomNumber, reservationId } = req.body;
      
      // Update order as closed
      const updatedOrder = await storage.updateRestaurantOrder(req.params.id, {
        status: "closed",
        closedAt: new Date().toISOString(),
        chargedToRoom: chargeToRoom ? "true" : "false",
        roomNumber: roomNumber || null,
      });
      
      // If charging to room, create a charge on the reservation
      if (chargeToRoom && reservationId) {
        await storage.createCharge({
          reservationId,
          description: `Restaurante - Pedido ${order.orderNumber}`,
          amount: order.total || "0",
          category: "restaurant",
          date: new Date().toISOString(),
        });
      }
      
      // Free up the table
      if (order.tableId) {
        await storage.updateRestaurantTable(order.tableId, { status: "available" });
      }
      
      res.json(updatedOrder);
    } catch (error) {
      res.status(500).json({ error: "Error closing order" });
    }
  });

  // Order Items
  app.post("/api/restaurant/orders/:orderId/items", async (req, res) => {
    try {
      const { menuItemId, quantity, notes } = req.body;
      const menuItem = await storage.getMenuItem(menuItemId);
      if (!menuItem) return res.status(404).json({ error: "Menu item not found" });
      
      const unitPrice = menuItem.price;
      const subtotal = (parseFloat(unitPrice) * (quantity || 1)).toFixed(2);
      
      const item = await storage.createOrderItem({
        orderId: req.params.orderId,
        menuItemId,
        quantity: quantity || 1,
        unitPrice,
        subtotal,
        notes,
      });
      
      // Update order totals
      const orderItems = await storage.getOrderItems(req.params.orderId);
      const newSubtotal = orderItems.reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
      const tax = newSubtotal * 0.21; // 21% IVA
      await storage.updateRestaurantOrder(req.params.orderId, {
        subtotal: newSubtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: (newSubtotal + tax).toFixed(2),
        status: "in_progress",
      });
      
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error adding item to order" });
    }
  });

  app.delete("/api/restaurant/orders/:orderId/items/:itemId", async (req, res) => {
    try {
      await storage.deleteOrderItem(req.params.itemId);
      
      // Recalculate order totals
      const orderItems = await storage.getOrderItems(req.params.orderId);
      const newSubtotal = orderItems.reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
      const tax = newSubtotal * 0.21;
      await storage.updateRestaurantOrder(req.params.orderId, {
        subtotal: newSubtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: (newSubtotal + tax).toFixed(2),
      });
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error removing item from order" });
    }
  });

  // Table Reservations
  app.get("/api/restaurant/table-reservations", async (req, res) => {
    try {
      const { date } = req.query;
      if (date && typeof date === "string") {
        const reservations = await storage.getTableReservationsByDate(date);
        return res.json(reservations);
      }
      const reservations = await storage.getTableReservations();
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: "Error fetching table reservations" });
    }
  });

  app.get("/api/restaurant/table-reservations/:id", async (req, res) => {
    try {
      const reservation = await storage.getTableReservation(req.params.id);
      if (!reservation) return res.status(404).json({ error: "Reservation not found" });
      res.json(reservation);
    } catch (error) {
      res.status(500).json({ error: "Error fetching table reservation" });
    }
  });

  app.post("/api/restaurant/table-reservations", async (req, res) => {
    try {
      const reservation = await storage.createTableReservation({
        ...req.body,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(reservation);
    } catch (error) {
      res.status(500).json({ error: "Error creating table reservation" });
    }
  });

  app.patch("/api/restaurant/table-reservations/:id", async (req, res) => {
    try {
      const reservation = await storage.updateTableReservation(req.params.id, req.body);
      if (!reservation) return res.status(404).json({ error: "Reservation not found" });
      res.json(reservation);
    } catch (error) {
      res.status(500).json({ error: "Error updating table reservation" });
    }
  });

  app.delete("/api/restaurant/table-reservations/:id", async (req, res) => {
    try {
      await storage.deleteTableReservation(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting table reservation" });
    }
  });

  // ==================== INVENTORY MODULE ====================
  
  // Item Categories
  app.get("/api/inventory/categories", async (req, res) => {
    try {
      const categories = await storage.getItemCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Error fetching categories" });
    }
  });

  app.post("/api/inventory/categories", async (req, res) => {
    try {
      const category = await storage.createItemCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating category" });
    }
  });

  app.patch("/api/inventory/categories/:id", async (req, res) => {
    try {
      const category = await storage.updateItemCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating category" });
    }
  });

  app.delete("/api/inventory/categories/:id", async (req, res) => {
    try {
      await storage.deleteItemCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting category" });
    }
  });

  // Suppliers
  app.get("/api/inventory/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Error fetching suppliers" });
    }
  });

  app.post("/api/inventory/suppliers", async (req, res) => {
    try {
      const supplier = await storage.createSupplier(req.body);
      res.status(201).json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Error creating supplier" });
    }
  });

  app.patch("/api/inventory/suppliers/:id", async (req, res) => {
    try {
      const supplier = await storage.updateSupplier(req.params.id, req.body);
      if (!supplier) return res.status(404).json({ error: "Supplier not found" });
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Error updating supplier" });
    }
  });

  app.delete("/api/inventory/suppliers/:id", async (req, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting supplier" });
    }
  });

  // Inventory Items
  app.get("/api/inventory/items", async (req, res) => {
    try {
      const items = await storage.getInventoryItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching inventory items" });
    }
  });

  app.get("/api/inventory/items/low-stock", async (req, res) => {
    try {
      const items = await storage.getInventoryItemsBelowMinStock();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching low stock items" });
    }
  });

  app.post("/api/inventory/items", async (req, res) => {
    try {
      const item = await storage.createInventoryItem(req.body);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating inventory item" });
    }
  });

  app.patch("/api/inventory/items/:id", async (req, res) => {
    try {
      const item = await storage.updateInventoryItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating inventory item" });
    }
  });

  app.delete("/api/inventory/items/:id", async (req, res) => {
    try {
      await storage.deleteInventoryItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting inventory item" });
    }
  });

  // Stock Movements
  app.get("/api/inventory/movements", async (req, res) => {
    try {
      const itemId = req.query.itemId as string | undefined;
      const movements = await storage.getStockMovements(itemId);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ error: "Error fetching stock movements" });
    }
  });

  app.post("/api/inventory/movements", async (req, res) => {
    try {
      const { itemId, movementType, quantity, notes } = req.body;
      
      // Get current stock
      const item = await storage.getInventoryItem(itemId);
      if (!item) return res.status(404).json({ error: "Item not found" });
      
      const previousStock = item.currentStock ?? 0;
      let newStock = previousStock;
      
      if (movementType === "entrada") {
        newStock = previousStock + quantity;
      } else if (movementType === "salida" || movementType === "consumo") {
        newStock = previousStock - quantity;
        if (newStock < 0) {
          return res.status(400).json({ error: "Stock insuficiente" });
        }
      } else if (movementType === "ajuste") {
        newStock = quantity; // Direct adjustment to specified value
      }
      
      const movement = await storage.createStockMovement({
        itemId,
        movementType,
        quantity,
        previousStock,
        newStock,
        notes,
        createdAt: new Date().toISOString(),
      });
      
      res.status(201).json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error creating stock movement" });
    }
  });

  // ==================== SPA ====================
  
  // SPA Cabins
  app.get("/api/spa/cabins", async (req, res) => {
    try {
      const cabins = await storage.getSpaCabins();
      res.json(cabins);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa cabins" });
    }
  });

  app.get("/api/spa/cabins/:id", async (req, res) => {
    try {
      const cabin = await storage.getSpaCabin(req.params.id);
      if (!cabin) return res.status(404).json({ error: "Cabin not found" });
      res.json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa cabin" });
    }
  });

  app.post("/api/spa/cabins", async (req, res) => {
    try {
      const cabin = await storage.createSpaCabin(req.body);
      res.status(201).json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa cabin" });
    }
  });

  app.patch("/api/spa/cabins/:id", async (req, res) => {
    try {
      const cabin = await storage.updateSpaCabin(req.params.id, req.body);
      if (!cabin) return res.status(404).json({ error: "Cabin not found" });
      res.json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa cabin" });
    }
  });

  app.delete("/api/spa/cabins/:id", async (req, res) => {
    try {
      await storage.deleteSpaCabin(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting spa cabin" });
    }
  });

  // SPA Treatment Categories
  app.get("/api/spa/treatment-categories", async (req, res) => {
    try {
      const categories = await storage.getSpaTreatmentCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment categories" });
    }
  });

  app.get("/api/spa/treatment-categories/:id", async (req, res) => {
    try {
      const category = await storage.getSpaTreatmentCategory(req.params.id);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment category" });
    }
  });

  app.post("/api/spa/treatment-categories", async (req, res) => {
    try {
      const category = await storage.createSpaTreatmentCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment category" });
    }
  });

  app.patch("/api/spa/treatment-categories/:id", async (req, res) => {
    try {
      const category = await storage.updateSpaTreatmentCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating treatment category" });
    }
  });

  app.delete("/api/spa/treatment-categories/:id", async (req, res) => {
    try {
      await storage.deleteSpaTreatmentCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment category" });
    }
  });

  // SPA Treatments
  app.get("/api/spa/treatments", async (req, res) => {
    try {
      const treatments = await storage.getSpaTreatments();
      res.json(treatments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatments" });
    }
  });

  app.get("/api/spa/treatments/:id", async (req, res) => {
    try {
      const treatment = await storage.getSpaTreatment(req.params.id);
      if (!treatment) return res.status(404).json({ error: "Treatment not found" });
      res.json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment" });
    }
  });

  app.get("/api/spa/treatments/by-category/:categoryId", async (req, res) => {
    try {
      const treatments = await storage.getSpaTreatmentsByCategory(req.params.categoryId);
      res.json(treatments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatments by category" });
    }
  });

  app.post("/api/spa/treatments", async (req, res) => {
    try {
      const treatment = await storage.createSpaTreatment(req.body);
      res.status(201).json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment" });
    }
  });

  app.patch("/api/spa/treatments/:id", async (req, res) => {
    try {
      const treatment = await storage.updateSpaTreatment(req.params.id, req.body);
      if (!treatment) return res.status(404).json({ error: "Treatment not found" });
      res.json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error updating treatment" });
    }
  });

  app.delete("/api/spa/treatments/:id", async (req, res) => {
    try {
      await storage.deleteSpaTreatment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment" });
    }
  });

  // SPA Appointments
  app.get("/api/spa/appointments", async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      
      if (startDate && endDate) {
        const appointments = await storage.getSpaAppointmentsByDateRange(startDate, endDate);
        return res.json(appointments);
      }
      
      const appointments = await storage.getSpaAppointments(date);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching appointments" });
    }
  });

  app.get("/api/spa/appointments/:id", async (req, res) => {
    try {
      const appointment = await storage.getSpaAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ error: "Appointment not found" });
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error fetching appointment" });
    }
  });

  app.post("/api/spa/appointments", async (req, res) => {
    try {
      const { cabinId, treatmentId, guestName, guestLastName, guestPhone, guestEmail, reservationId, appointmentDate, startTime, endTime, status, notes } = req.body;
      
      if (!cabinId || !treatmentId || !guestName || !appointmentDate || !startTime || !endTime) {
        return res.status(400).json({ error: "cabinId, treatmentId, guestName, appointmentDate, startTime, and endTime are required" });
      }

      const appointment = await storage.createSpaAppointment({
        cabinId,
        treatmentId,
        guestName,
        guestLastName: guestLastName || null,
        guestPhone: guestPhone || null,
        guestEmail: guestEmail || null,
        reservationId: reservationId || null,
        appointmentDate,
        startTime,
        endTime,
        status: status || "pending",
        notes: notes || null,
        createdAt: new Date().toISOString(),
      });

      const treatment = await storage.getSpaTreatment(treatmentId);
      if (!treatment) {
        return res.status(400).json({ error: "Treatment not found" });
      }
      
      const fullName = guestLastName ? `${guestName} ${guestLastName}` : guestName;
      const treatmentPrice = treatment.price || "0";
      
      const account = await storage.createSpaAccount({
        appointmentId: appointment.id,
        guestName: fullName,
        reservationId: reservationId || null,
        status: "open",
        subtotal: treatmentPrice,
        total: treatmentPrice,
        notes: null,
        openedAt: new Date().toISOString(),
        closedAt: null,
        closedBy: null,
        chargedTo: null,
      });

      await storage.createSpaAccountItem({
        accountId: account.id,
        description: treatment.name,
        quantity: 1,
        unitPrice: treatmentPrice,
        subtotal: treatmentPrice,
        itemType: "treatment",
        notes: null,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error creating appointment" });
    }
  });

  app.patch("/api/spa/appointments/:id", async (req, res) => {
    try {
      const appointment = await storage.updateSpaAppointment(req.params.id, req.body);
      if (!appointment) return res.status(404).json({ error: "Appointment not found" });
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error updating appointment" });
    }
  });

  app.delete("/api/spa/appointments/:id", async (req, res) => {
    try {
      await storage.deleteSpaAppointment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting appointment" });
    }
  });

  // SPA Accounts
  app.get("/api/spa/accounts", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const accounts = await storage.getSpaAccounts(status as "open" | "closed" | "cancelled" | undefined);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa accounts" });
    }
  });

  app.get("/api/spa/accounts/:id", async (req, res) => {
    try {
      const account = await storage.getSpaAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa account" });
    }
  });

  app.get("/api/spa/accounts/by-appointment/:appointmentId", async (req, res) => {
    try {
      const account = await storage.getSpaAccountByAppointment(req.params.appointmentId);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa account" });
    }
  });

  app.post("/api/spa/accounts", async (req, res) => {
    try {
      const { appointmentId, guestName, reservationId, notes } = req.body;
      
      if (!appointmentId || !guestName) {
        return res.status(400).json({ error: "appointmentId and guestName are required" });
      }

      const account = await storage.createSpaAccount({
        appointmentId,
        guestName,
        reservationId: reservationId || null,
        status: "open",
        subtotal: "0",
        total: "0",
        notes: notes || null,
        openedAt: new Date().toISOString(),
        closedAt: null,
        closedBy: null,
        chargedTo: null,
      });
      res.status(201).json(account);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa account" });
    }
  });

  app.patch("/api/spa/accounts/:id", async (req, res) => {
    try {
      const account = await storage.updateSpaAccount(req.params.id, req.body);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa account" });
    }
  });

  app.post("/api/spa/accounts/:id/close", async (req, res) => {
    try {
      const { chargedTo } = req.body;
      
      if (!chargedTo) {
        return res.status(400).json({ error: "chargedTo is required (e.g., 'room:reservationId' or 'invoice')" });
      }

      const account = await storage.closeSpaAccount(req.params.id, chargedTo);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error closing spa account" });
    }
  });

  // SPA Account Items
  app.get("/api/spa/accounts/:accountId/items", async (req, res) => {
    try {
      const items = await storage.getSpaAccountItems(req.params.accountId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching account items" });
    }
  });

  app.post("/api/spa/accounts/:accountId/items", async (req, res) => {
    try {
      const { description, quantity, unitPrice, itemType, notes } = req.body;
      
      if (!description || !unitPrice) {
        return res.status(400).json({ error: "description and unitPrice are required" });
      }

      const qty = quantity || 1;
      const subtotal = (parseFloat(unitPrice) * qty).toFixed(2);

      const item = await storage.createSpaAccountItem({
        accountId: req.params.accountId,
        description,
        quantity: qty,
        unitPrice,
        subtotal,
        itemType: itemType || "treatment",
        notes: notes || null,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating account item" });
    }
  });

  app.patch("/api/spa/account-items/:id", async (req, res) => {
    try {
      const item = await storage.updateSpaAccountItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating account item" });
    }
  });

  app.delete("/api/spa/account-items/:id", async (req, res) => {
    try {
      await storage.deleteSpaAccountItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting account item" });
    }
  });

  // ==================== EVENTS ====================
  // Event Rooms
  app.get("/api/events/rooms", async (req, res) => {
    try {
      const rooms = await storage.getEventRooms();
      res.json(rooms);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event rooms" });
    }
  });

  app.get("/api/events/rooms/:id", async (req, res) => {
    try {
      const room = await storage.getEventRoom(req.params.id);
      if (!room) return res.status(404).json({ error: "Event room not found" });
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event room" });
    }
  });

  app.post("/api/events/rooms", async (req, res) => {
    try {
      const room = await storage.createEventRoom(req.body);
      res.status(201).json(room);
    } catch (error) {
      res.status(500).json({ error: "Error creating event room" });
    }
  });

  app.patch("/api/events/rooms/:id", async (req, res) => {
    try {
      const room = await storage.updateEventRoom(req.params.id, req.body);
      if (!room) return res.status(404).json({ error: "Event room not found" });
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error updating event room" });
    }
  });

  app.delete("/api/events/rooms/:id", async (req, res) => {
    try {
      await storage.deleteEventRoom(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event room" });
    }
  });

  // Event Planning
  app.get("/api/events/planning", async (req, res) => {
    try {
      const startDate = req.query.start as string;
      const endDate = req.query.end as string;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start and end dates are required" });
      }
      
      const planningData = await storage.getEventPlanningData(startDate, endDate);
      res.json(planningData);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event planning data" });
    }
  });

  // Event Charge Types - MUST come before /api/events/:id
  app.get("/api/events/charge-types", async (req, res) => {
    try {
      const chargeTypes = await storage.getEventChargeTypes();
      res.json(chargeTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event charge types" });
    }
  });

  app.post("/api/events/charge-types", async (req, res) => {
    try {
      const chargeType = await storage.createEventChargeType(req.body);
      res.status(201).json(chargeType);
    } catch (error) {
      res.status(500).json({ error: "Error creating event charge type" });
    }
  });

  app.patch("/api/events/charge-types/:id", async (req, res) => {
    try {
      const chargeType = await storage.updateEventChargeType(req.params.id, req.body);
      if (!chargeType) return res.status(404).json({ error: "Event charge type not found" });
      res.json(chargeType);
    } catch (error) {
      res.status(500).json({ error: "Error updating event charge type" });
    }
  });

  app.delete("/api/events/charge-types/:id", async (req, res) => {
    try {
      await storage.deleteEventChargeType(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event charge type" });
    }
  });

  // Events
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Error fetching events" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event" });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const eventCode = storage.generateEventCode();
      const event = await storage.createEvent({
        ...req.body,
        eventCode,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(event);
    } catch (error) {
      res.status(500).json({ error: "Error creating event" });
    }
  });

  app.patch("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.updateEvent(req.params.id, req.body);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Error updating event" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      await storage.deleteEvent(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event" });
    }
  });

  // Event Charges
  app.get("/api/events/:eventId/charges", async (req, res) => {
    try {
      const charges = await storage.getEventCharges(req.params.eventId);
      res.json(charges);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event charges" });
    }
  });

  app.post("/api/events/:eventId/charges", async (req, res) => {
    try {
      const { chargeTypeId, description, quantity, unitPrice, notes } = req.body;
      
      if (!description || !unitPrice) {
        return res.status(400).json({ error: "description and unitPrice are required" });
      }

      const qty = quantity || 1;
      const total = (parseFloat(unitPrice) * qty).toFixed(2);

      const charge = await storage.createEventCharge({
        eventId: req.params.eventId,
        chargeTypeId: chargeTypeId || null,
        description,
        quantity: qty,
        unitPrice,
        totalAmount: total,
        date: new Date().toISOString().split("T")[0],
        notes: notes || null,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error creating event charge" });
    }
  });

  app.patch("/api/events/charges/:id", async (req, res) => {
    try {
      const charge = await storage.updateEventCharge(req.params.id, req.body);
      if (!charge) return res.status(404).json({ error: "Event charge not found" });
      res.json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error updating event charge" });
    }
  });

  app.delete("/api/events/charges/:id", async (req, res) => {
    try {
      await storage.deleteEventCharge(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event charge" });
    }
  });

  // ==================== MAINTENANCE ====================

  // Maintenance Staff
  app.get("/api/maintenance/staff", async (req, res) => {
    try {
      const staff = await storage.getMaintenanceStaff();
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Error fetching maintenance staff" });
    }
  });

  app.get("/api/maintenance/staff/:id", async (req, res) => {
    try {
      const staff = await storage.getMaintenanceStaffMember(req.params.id);
      if (!staff) return res.status(404).json({ error: "Staff member not found" });
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Error fetching staff member" });
    }
  });

  app.post("/api/maintenance/staff", async (req, res) => {
    try {
      const staff = await storage.createMaintenanceStaff(req.body);
      res.status(201).json(staff);
    } catch (error) {
      res.status(500).json({ error: "Error creating staff member" });
    }
  });

  app.patch("/api/maintenance/staff/:id", async (req, res) => {
    try {
      const staff = await storage.updateMaintenanceStaff(req.params.id, req.body);
      if (!staff) return res.status(404).json({ error: "Staff member not found" });
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Error updating staff member" });
    }
  });

  app.delete("/api/maintenance/staff/:id", async (req, res) => {
    try {
      await storage.deleteMaintenanceStaff(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting staff member" });
    }
  });

  // Work Orders
  app.get("/api/maintenance/work-orders", async (req, res) => {
    try {
      const { status, roomId } = req.query;
      let orders;
      if (status) {
        orders = await storage.getWorkOrdersByStatus(status as any);
      } else if (roomId) {
        orders = await storage.getWorkOrdersByRoom(roomId as string);
      } else {
        orders = await storage.getWorkOrders();
      }
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Error fetching work orders" });
    }
  });

  app.get("/api/maintenance/work-orders/:id", async (req, res) => {
    try {
      const order = await storage.getWorkOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Work order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Error fetching work order" });
    }
  });

  app.post("/api/maintenance/work-orders", async (req, res) => {
    try {
      const orderCode = storage.generateWorkOrderCode();
      const order = await storage.createWorkOrder({
        ...req.body,
        orderCode,
        reportedAt: new Date().toISOString(),
      });
      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ error: "Error creating work order" });
    }
  });

  app.patch("/api/maintenance/work-orders/:id", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.status === "completed" && !updates.completedAt) {
        updates.completedAt = new Date().toISOString();
      }
      const order = await storage.updateWorkOrder(req.params.id, updates);
      if (!order) return res.status(404).json({ error: "Work order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Error updating work order" });
    }
  });

  app.delete("/api/maintenance/work-orders/:id", async (req, res) => {
    try {
      await storage.deleteWorkOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting work order" });
    }
  });

  // Dashboard stats for maintenance
  app.get("/api/maintenance/dashboard", async (req, res) => {
    try {
      const orders = await storage.getWorkOrders();
      const staff = await storage.getMaintenanceStaff();
      
      const pending = orders.filter(o => o.status === "pending").length;
      const inProgress = orders.filter(o => o.status === "in_progress" || o.status === "assigned").length;
      const completedToday = orders.filter(o => {
        if (o.status !== "completed" || !o.completedAt) return false;
        const today = new Date().toISOString().split("T")[0];
        return o.completedAt.startsWith(today);
      }).length;
      const urgent = orders.filter(o => o.priority === "urgent" && o.status !== "completed" && o.status !== "cancelled").length;
      
      res.json({
        pending,
        inProgress,
        completedToday,
        urgent,
        totalStaff: staff.filter(s => s.isActive === "true").length,
        recentOrders: orders
          .filter(o => o.status !== "completed" && o.status !== "cancelled")
          .sort((a, b) => {
            const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
            return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - 
                   (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
          })
          .slice(0, 5),
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching maintenance dashboard" });
    }
  });

  // ============== ADMINISTRATION ==============

  // Admin Dashboard
  app.get("/api/admin/dashboard", async (req, res) => {
    try {
      const stats = await storage.getAdminDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Error fetching admin dashboard" });
    }
  });

  // System Users
  app.get("/api/admin/users", async (req, res) => {
    try {
      const users = await storage.getSystemUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Error fetching users" });
    }
  });

  app.get("/api/admin/users/:id", async (req, res) => {
    try {
      const user = await storage.getSystemUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Error fetching user" });
    }
  });

  app.post("/api/admin/users", async (req, res) => {
    try {
      const user = await storage.createSystemUser({
        ...req.body,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ error: "Error creating user" });
    }
  });

  app.patch("/api/admin/users/:id", async (req, res) => {
    try {
      const user = await storage.updateSystemUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Error updating user" });
    }
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      await storage.deleteSystemUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting user" });
    }
  });

  // System Settings
  app.get("/api/admin/settings", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      if (category) {
        const settings = await storage.getSystemSettingsByCategory(category);
        res.json(settings);
      } else {
        const settings = await storage.getSystemSettings();
        res.json(settings);
      }
    } catch (error) {
      res.status(500).json({ error: "Error fetching settings" });
    }
  });

  app.get("/api/admin/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSystemSetting(req.params.key);
      if (!setting) return res.status(404).json({ error: "Setting not found" });
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Error fetching setting" });
    }
  });

  app.put("/api/admin/settings", async (req, res) => {
    try {
      const setting = await storage.upsertSystemSetting({
        ...req.body,
        updatedAt: new Date().toISOString(),
      });
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Error saving setting" });
    }
  });

  app.delete("/api/admin/settings/:key", async (req, res) => {
    try {
      await storage.deleteSystemSetting(req.params.key);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting setting" });
    }
  });

  // Audit Logs
  app.get("/api/admin/audit-logs", async (req, res) => {
    try {
      const module = req.query.module as string | undefined;
      const userId = req.query.userId as string | undefined;
      
      if (module) {
        const logs = await storage.getAuditLogsByModule(module);
        res.json(logs);
      } else if (userId) {
        const logs = await storage.getAuditLogsByUser(userId);
        res.json(logs);
      } else {
        const logs = await storage.getAuditLogs();
        res.json(logs);
      }
    } catch (error) {
      res.status(500).json({ error: "Error fetching audit logs" });
    }
  });

  app.post("/api/admin/audit-logs", async (req, res) => {
    try {
      const log = await storage.createAuditLog({
        ...req.body,
        timestamp: new Date().toISOString(),
      });
      res.status(201).json(log);
    } catch (error) {
      res.status(500).json({ error: "Error creating audit log" });
    }
  });

  return httpServer;
}
