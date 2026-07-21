import type { Express } from "express";
import { storage, getArgentinaToday } from "../db-storage";
import { audit } from "../audit";
import { requireRole } from "../auth";
import { db } from "../db";
import { reservations, rooms as roomsTable, guests, guestPreferences, folios, hospitalityAlerts, reservationCompanions, roomTypes as roomTypesTable } from "@shared/schema";
import { eq, inArray, and, or, ne, sql } from "drizzle-orm";

const ROOMS_WRITE_ROLES = ["admin", "manager", "ama_de_llaves", "resp_deposito", "resp_administracion", "jefe_recepcion", "comercial"] as [string, ...string[]];
const RATES_WRITE_ROLES = ["admin", "manager"] as [string, ...string[]];

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
      const today = getArgentinaToday();

      const activeRows = await db.select({
        res: reservations,
        room: roomsTable,
      })
        .from(reservations)
        .innerJoin(roomsTable, eq(roomsTable.id, reservations.roomId))
        .where(
          and(
            or(eq(reservations.status, "checked_in"), eq(reservations.status, "web_checkin")),
            sql`(${roomsTable.isVirtual} IS NULL OR ${roomsTable.isVirtual} = false)`
          )
        );

      if (activeRows.length === 0) return res.json([]);

      const reservationIds = activeRows.map(r => r.res.id);
      const guestIds = activeRows.map(r => r.res.guestId).filter(Boolean) as string[];

      const [guestList, allPrefs, allFolios, allAlerts, allCompanions, allRoomTypesList] = await Promise.all([
        guestIds.length > 0 ? db.select().from(guests).where(inArray(guests.id, guestIds)) : Promise.resolve([]),
        guestIds.length > 0 ? db.select().from(guestPreferences).where(and(eq(guestPreferences.isActive, true), inArray(guestPreferences.guestId, guestIds))) : Promise.resolve([]),
        db.select().from(folios).where(and(eq(folios.entityType, "reservation"), inArray(folios.entityId, reservationIds))),
        db.select().from(hospitalityAlerts).where(and(ne(hospitalityAlerts.status, "completed"), inArray(hospitalityAlerts.reservationId, reservationIds))),
        db.select().from(reservationCompanions).where(inArray(reservationCompanions.reservationId, reservationIds)),
        db.select().from(roomTypesTable),
      ]);

      const guestMap = new Map(guestList.map(g => [g.id, g]));
      const prefsByGuest = new Map<string, typeof allPrefs>();
      for (const p of allPrefs) {
        if (!prefsByGuest.has(p.guestId)) prefsByGuest.set(p.guestId, []);
        prefsByGuest.get(p.guestId)!.push(p);
      }
      const folioByRes = new Map(allFolios.map(f => [f.entityId, f]));
      const alertsByRes = new Map<string, number>();
      for (const a of allAlerts) {
        alertsByRes.set(a.reservationId, (alertsByRes.get(a.reservationId) ?? 0) + 1);
      }
      const companionCountByRes = new Map<string, number>();
      for (const c of allCompanions) {
        companionCountByRes.set(c.reservationId, (companionCountByRes.get(c.reservationId) ?? 0) + 1);
      }
      const roomTypeMap = new Map(allRoomTypesList.map(rt => [rt.id, rt]));

      const daysDiff = (a: string, b: string) => {
        const da = new Date(a + "T12:00:00");
        const db2 = new Date(b + "T12:00:00");
        return Math.round((db2.getTime() - da.getTime()) / 86400000);
      };

      const result = activeRows
        .sort((a, b) => a.room.roomNumber.localeCompare(b.room.roomNumber, undefined, { numeric: true }))
        .map(({ res, room }) => {
          const guest = res.guestId ? guestMap.get(res.guestId) : undefined;
          const prefs = res.guestId ? (prefsByGuest.get(res.guestId) ?? []) : [];
          const folio = folioByRes.get(res.id);
          const roomType = room.roomTypeId ? roomTypeMap.get(room.roomTypeId) : undefined;
          return {
            roomId: room.id,
            roomNumber: room.roomNumber,
            roomTypeName: roomType?.name ?? null,
            floor: room.floor,
            roomStatus: room.status,
            reservationId: res.id,
            reservationNumber: (res as any).reservationNumber ?? null,
            checkIn: res.checkInDate,
            checkOut: res.checkOutDate,
            nightsRemaining: daysDiff(today, res.checkOutDate),
            nightsStayed: daysDiff(res.checkInDate, today),
            adults: res.adults ?? 1,
            children: res.children ?? 0,
            numberOfGuests: res.numberOfGuests ?? 1,
            source: res.source,
            earlyCheckIn: res.earlyCheckIn ?? false,
            earlyCheckInTime: res.earlyCheckInTime ?? null,
            lateCheckOut: res.lateCheckOut ?? false,
            lateCheckOutTime: res.lateCheckOutTime ?? null,
            reservationStatus: res.status,
            guest: guest ? {
              id: guest.id,
              firstName: guest.firstName,
              lastName: guest.lastName,
              phone: guest.phone ?? null,
              email: guest.email ?? null,
              segment: (guest as any).segment ?? null,
            } : null,
            companionsCount: companionCountByRes.get(res.id) ?? 0,
            folioBalance: folio ? parseFloat(String(folio.balance ?? "0")) : 0,
            hasPreferences: prefs.length > 0,
            hasCritical: prefs.some(p => p.priority === "critical"),
            hasSpecialDate: prefs.some(p => p.category === "fecha_especial"),
            hasDiet: prefs.some(p => p.category === "alimentacion"),
            prefsCount: prefs.length,
            pendingAlertsCount: alertsByRes.get(res.id) ?? 0,
          };
        });

      res.json(result);
    } catch (error: any) {
      console.error("[in-house] error:", error.message);
      res.status(500).json({ error: "Error fetching in-house rooms" });
    }
  });

  // Arriving today: confirmed/web_checkin reservations with checkInDate = today
  app.get("/api/rooms/arriving-today", async (req, res) => {
    try {
      const today = getArgentinaToday();

      const rows = await db.select({
        res: reservations,
        room: roomsTable,
      })
        .from(reservations)
        .innerJoin(roomsTable, eq(roomsTable.id, reservations.roomId))
        .where(
          and(
            sql`${reservations.checkInDate} = ${today}`,
            or(eq(reservations.status, "confirmed"), eq(reservations.status, "web_checkin")),
            sql`(${roomsTable.isVirtual} IS NULL OR ${roomsTable.isVirtual} = false)`
          )
        );

      if (rows.length === 0) return res.json([]);

      const guestIds = rows.map(r => r.res.guestId).filter(Boolean) as string[];
      const [guestList, allRoomTypesList] = await Promise.all([
        guestIds.length > 0 ? db.select().from(guests).where(inArray(guests.id, guestIds)) : Promise.resolve([]),
        db.select().from(roomTypesTable),
      ]);

      const guestMap = new Map(guestList.map(g => [g.id, g]));
      const roomTypeMap = new Map(allRoomTypesList.map(rt => [rt.id, rt]));

      const result = rows
        .sort((a, b) => a.room.roomNumber.localeCompare(b.room.roomNumber, undefined, { numeric: true }))
        .map(({ res, room }) => {
          const guest = res.guestId ? guestMap.get(res.guestId) : undefined;
          const roomType = room.roomTypeId ? roomTypeMap.get(room.roomTypeId) : undefined;
          return {
            reservationId: res.id,
            reservationNumber: (res as any).reservationNumber ?? null,
            roomId: room.id,
            roomNumber: room.roomNumber,
            roomTypeName: roomType?.name ?? null,
            floor: room.floor,
            checkIn: res.checkInDate,
            checkOut: res.checkOutDate,
            nights: res.nights ?? 1,
            adults: res.adults ?? 1,
            children: res.children ?? 0,
            numberOfGuests: res.numberOfGuests ?? 1,
            source: res.source,
            reservationStatus: res.status,
            earlyCheckIn: res.earlyCheckIn ?? false,
            earlyCheckInTime: res.earlyCheckInTime ?? null,
            guest: guest ? {
              id: guest.id,
              firstName: guest.firstName,
              lastName: guest.lastName,
              phone: guest.phone ?? null,
              email: guest.email ?? null,
            } : null,
          };
        });

      res.json(result);
    } catch (error: any) {
      console.error("[arriving-today] error:", error.message);
      res.status(500).json({ error: "Error fetching arriving today" });
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
      const maintenanceBlocks = await storage.getMaintenanceBlocks();

      let filtered = rooms.filter(r => r.status !== "blocked");
      if (roomTypeId) {
        filtered = filtered.filter(r => r.roomTypeId === roomTypeId);
      }

      const activeStatuses = ["tentative", "pending", "reserved", "confirmed", "web_checkin", "checked_in"];
      const available = filtered.filter(room => {
        const resConflict = allReservations.find(res => {
          if (!activeStatuses.includes(res.status)) return false;
          if (res.roomId !== room.id) return false;
          return res.checkInDate < (checkOut as string) && res.checkOutDate > (checkIn as string);
        });
        if (resConflict) return false;

        const blockConflict = maintenanceBlocks.find(blk =>
          blk.roomId === room.id &&
          blk.blockFrom < (checkOut as string) &&
          blk.blockTo > (checkIn as string)
        );
        if (blockConflict) return false;

        return true;
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

  // Eliminar habitaciones está deshabilitado por política del sistema.
  // Usar PATCH con { isActive: false } para deshabilitar.
  app.delete("/api/rooms/:id", requireRole(ROOMS_WRITE_ROLES), (_req, res) => {
    res.status(405).json({ error: "No está permitido eliminar habitaciones. Usá la opción Deshabilitar para ocultarla del sistema." });
  });
}
