import type { Express } from "express";
import { storage, getArgentinaToday } from "../db-storage";
import { audit } from "../audit";
import { requireRole } from "../auth";

const ROOMS_WRITE_ROLES = ["admin", "manager", "responsable_area"] as [string, ...string[]];
const RATES_WRITE_ROLES = ["admin", "manager", "responsable_area"] as [string, ...string[]];

export function registerRoomsRoutes(app: Express) {
  // Room Types
  app.get("/api/room-types", async (req, res) => {
    try {
      const roomTypes = await storage.getRoomTypes();
      res.json(roomTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching room types" });
    }
  });

  app.post("/api/room-types", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
    try {
      const roomType = await storage.createRoomType(req.body);
      res.status(201).json(roomType);
    } catch (error) {
      res.status(500).json({ error: "Error creating room type" });
    }
  });

  app.patch("/api/room-types/:id", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
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

  app.delete("/api/room-types/:id", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
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

  app.post("/api/rate-plans", requireRole(RATES_WRITE_ROLES), async (req, res) => {
    try {
      const ratePlan = await storage.createRatePlan(req.body);
      await audit(req, "create", "rate-plans", `Nueva tarifa creada: ${req.body.name}`, { entityType: "rate_plan", entityId: ratePlan.id });
      res.status(201).json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error creating rate plan" });
    }
  });

  app.patch("/api/rate-plans/:id", requireRole(RATES_WRITE_ROLES), async (req, res) => {
    try {
      const existing = await storage.getRatePlan(req.params.id);
      const ratePlan = await storage.updateRatePlan(req.params.id, req.body);
      if (!ratePlan) {
        return res.status(404).json({ error: "Rate plan not found" });
      }
      await audit(req, "update", "rate-plans",
        `Tarifa modificada: ${ratePlan.name} — $${existing?.baseRate ?? "?"} → $${ratePlan.baseRate ?? "?"}`,
        { entityType: "rate_plan", entityId: req.params.id }
      );
      res.json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error updating rate plan" });
    }
  });

  app.delete("/api/rate-plans/:id", requireRole(RATES_WRITE_ROLES), async (req, res) => {
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
      const today = getArgentinaToday();
      const allReservations = await storage.getReservations();
      const checkedInReservations = allReservations.filter(r => r.status === "checked_in");

      const roomsWithReconciled = await Promise.all(rooms.map(async (room) => {
        const activeRes = checkedInReservations.find(r => r.roomId === room.id && r.checkInDate <= today && r.checkOutDate >= today);

        if (room.status === "occupied" && !activeRes) {
          await storage.updateRoom(room.id, { status: "dirty" });
          return { ...room, status: "dirty" as const };
        }
        if ((room.status === "available" || room.status === "dirty") && activeRes) {
          await storage.updateRoom(room.id, { status: "occupied" });
          return { ...room, status: "occupied" as const };
        }
        return room;
      }));

      res.json(roomsWithReconciled);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rooms" });
    }
  });

  app.get("/api/rooms/in-house", async (req, res) => {
    try {
      const allRooms = await storage.getRooms();
      const occupiedRooms = allRooms.filter(r => r.status === "occupied");
      const allReservations = await storage.getReservations();
      const activeReservations = allReservations.filter(r => r.status === "checked_in");
      const result = [];
      for (const room of occupiedRooms) {
        const reservation = activeReservations.find(r => r.roomId === room.id);
        if (reservation) {
          const guest = await storage.getGuest(reservation.guestId);
          result.push({
            roomId: room.id,
            roomNumber: room.roomNumber,
            guestName: guest ? `${guest.firstName} ${guest.lastName}` : "Huésped",
            reservationId: reservation.id,
          });
        }
      }
      result.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Error fetching in-house rooms" });
    }
  });

  app.get("/api/rooms/available", async (req, res) => {
    try {
      const { checkIn, checkOut, roomTypeId } = req.query as { checkIn?: string; checkOut?: string; roomTypeId?: string };
      if (!checkIn || !checkOut) {
        return res.status(400).json({ error: "checkIn and checkOut son requeridos" });
      }
      const rooms = await storage.getRooms();
      const allReservations = await storage.getReservations();

      let filtered = rooms.filter(r => r.status !== "maintenance" && r.status !== "blocked");
      if (roomTypeId) {
        filtered = filtered.filter(r => r.roomTypeId === roomTypeId);
      }

      const activeStatuses = ["reserved", "checked_in", "confirmed"];
      const available = filtered.filter(room => {
        const conflict = allReservations.find(res => {
          if (!activeStatuses.includes(res.status)) return false;
          if (res.roomId !== room.id) return false;
          return res.checkInDate < checkOut && res.checkOutDate > checkIn;
        });
        return !conflict;
      });

      res.json(available);
    } catch (error) {
      res.status(500).json({ error: "Error fetching available rooms" });
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

  app.post("/api/rooms", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
    try {
      const room = await storage.createRoom(req.body);
      res.status(201).json(room);
    } catch (error) {
      res.status(500).json({ error: "Error creating room" });
    }
  });

  app.patch("/api/rooms/:id", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
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

  app.delete("/api/rooms/:id", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
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
}
