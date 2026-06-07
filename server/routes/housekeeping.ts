import type { Express } from "express";
import { storage } from "../db-storage";
import { db } from "../db";
import { lostFoundItems, reservations } from "@shared/schema";
import { requireAuth } from "../auth";
import { eq, desc, like, and, or, ilike } from "drizzle-orm";

export function registerHousekeepingRoutes(app: Express) {
  // Housekeeping Tasks
  app.get("/api/housekeeping", async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const assignedTo = req.query.assignedTo as string | undefined;
      const tasks = await storage.getHousekeepingTasks(date, assignedTo);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Error fetching housekeeping tasks" });
    }
  });

  // Get housekeeping staff (mucamas + supervisors) — must be before /:id
  app.get("/api/housekeeping/staff", async (req, res) => {
    try {
      const allUsers = await storage.getSystemUsers();
      const staff = allUsers
        .filter(u => ["housekeeping", "gobernanta", "responsable_area"].includes(u.role) && u.isActive === "true")
        .map(u => ({ id: u.id, fullName: u.fullName, role: u.role, username: u.username }));
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Error fetching staff" });
    }
  });

  // Assign a room to a staff member for a given date
  app.post("/api/housekeeping/assign", async (req, res) => {
    try {
      const { roomId, assignedTo, date } = req.body;
      if (!roomId || !date) return res.status(400).json({ error: "roomId y date son obligatorios" });
      const tasks = await storage.getHousekeepingTasks(date);
      const existing = tasks.find(t => t.roomId === roomId);
      if (existing) {
        const updated = await storage.updateHousekeepingTask(existing.id, { assignedTo: assignedTo || null });
        return res.json(updated);
      }
      const task = await storage.createHousekeepingTask({
        roomId,
        taskType: "checkout_clean",
        status: "pending",
        priority: "normal",
        scheduledDate: date,
        assignedTo: assignedTo || null,
        createdAt: new Date(),
      });
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Error al asignar habitación" });
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
        createdAt: new Date(),
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
        startedAt: new Date(),
      });
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
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
        completedAt: new Date(),
      });
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
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
        inspectedAt: new Date(),
      });
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Error inspecting task" });
    }
  });

  // ==================== LOST & FOUND MODULE ====================

  async function generateLostFoundCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `LF-${year}-`;
    const lastItem = await db.select()
      .from(lostFoundItems)
      .where(like(lostFoundItems.codigo, `${prefix}%`))
      .orderBy(desc(lostFoundItems.createdAt))
      .limit(1);
    const lastNum = lastItem[0] ? parseInt(lastItem[0].codigo.replace(prefix, "")) : 0;
    return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
  }

  app.get("/api/lost-found", requireAuth, async (req, res) => {
    try {
      const { status, category, search } = req.query;
      const conditions: any[] = [];
      if (status) conditions.push(eq(lostFoundItems.status, status as string));
      if (category) conditions.push(eq(lostFoundItems.category, category as string));
      if (search) {
        const q = `%${search}%`;
        conditions.push(or(
          ilike(lostFoundItems.description, q),
          ilike(lostFoundItems.location, q),
          ilike(lostFoundItems.codigo, q),
          ilike(lostFoundItems.foundBy, q),
        ));
      }
      const items = conditions.length > 0
        ? await db.select().from(lostFoundItems).where(and(...conditions)).orderBy(desc(lostFoundItems.createdAt))
        : await db.select().from(lostFoundItems).orderBy(desc(lostFoundItems.createdAt));
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching lost and found items" });
    }
  });

  app.post("/api/lost-found", requireAuth, async (req, res) => {
    try {
      const codigo = await generateLostFoundCode();
      const [item] = await db.insert(lostFoundItems).values({ ...req.body, codigo }).returning();
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating lost and found item" });
    }
  });

  app.get("/api/lost-found/lookup-room/:roomNumber", requireAuth, async (req, res) => {
    try {
      const room = await storage.getRoomByNumber(req.params.roomNumber);
      if (!room) return res.status(404).json({ error: "Habitación no encontrada" });
      const [recentReservation] = await db.select()
        .from(reservations)
        .where(eq(reservations.roomId, room.id))
        .orderBy(desc(reservations.checkOutDate))
        .limit(1);
      if (!recentReservation) return res.json({ room, reservation: null, guest: null });
      const guest = recentReservation.guestId ? await storage.getGuest(recentReservation.guestId) : null;
      res.json({ room, reservation: recentReservation, guest });
    } catch (error) {
      res.status(500).json({ error: "Error looking up room" });
    }
  });

  app.get("/api/lost-found/:id", requireAuth, async (req, res) => {
    try {
      const [item] = await db.select().from(lostFoundItems).where(eq(lostFoundItems.id, req.params.id));
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error fetching item" });
    }
  });

  app.patch("/api/lost-found/:id", requireAuth, async (req, res) => {
    try {
      const { codigo, createdAt, ...data } = req.body;
      const [updated] = await db.update(lostFoundItems)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(lostFoundItems.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Item not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating item" });
    }
  });

  app.patch("/api/lost-found/:id/status", requireAuth, async (req, res) => {
    try {
      const { status, claimedBy, claimedDate, deliveryType, deliveredBy, notes } = req.body;
      const updateData: any = { status, updatedAt: new Date() };
      if (claimedBy !== undefined) updateData.claimedBy = claimedBy;
      if (claimedDate !== undefined) updateData.claimedDate = claimedDate;
      if (deliveryType !== undefined) updateData.deliveryType = deliveryType;
      if (deliveredBy !== undefined) updateData.deliveredBy = deliveredBy;
      if (notes !== undefined) updateData.notes = notes;
      const [updated] = await db.update(lostFoundItems)
        .set(updateData)
        .where(eq(lostFoundItems.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Item not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating status" });
    }
  });
}
