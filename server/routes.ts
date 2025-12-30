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

  return httpServer;
}
