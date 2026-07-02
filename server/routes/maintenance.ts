import type { Express } from "express";
import { storage } from "../db-storage";
import { requireAuth } from "../auth";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerMaintenanceRoutes(app: Express) {
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

  // System users with maintenance role (for assignment dropdown)
  app.get("/api/maintenance/system-users", requireAuth, async (req, res) => {
    try {
      const allUsers = await storage.getSystemUsers();
      const maintenanceUsers = allUsers
        .filter((u: any) => u.role === "maintenance")
        .map((u: any) => ({
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username,
        }));
      res.json(maintenanceUsers);
    } catch (error) {
      res.status(500).json({ error: "Error fetching maintenance users" });
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
      // Attach maintenance block to each order
      const allBlocks = await storage.getMaintenanceBlocks();
      const blocksByOrderId = new Map(allBlocks.filter(b => b.workOrderId).map(b => [b.workOrderId!, b]));
      const ordersWithBlocks = orders.map(o => ({
        ...o,
        maintenanceBlock: blocksByOrderId.get(o.id) || null,
      }));
      res.json(ordersWithBlocks);
    } catch (error) {
      res.status(500).json({ error: "Error fetching work orders" });
    }
  });

  app.get("/api/maintenance/work-orders/:id", async (req, res) => {
    try {
      const order = await storage.getWorkOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Work order not found" });
      const allBlocks = await storage.getMaintenanceBlocks();
      const block = allBlocks.find(b => b.workOrderId === order.id) || null;
      res.json({ ...order, maintenanceBlock: block });
    } catch (error) {
      res.status(500).json({ error: "Error fetching work order" });
    }
  });

  app.post("/api/maintenance/work-orders", async (req, res) => {
    try {
      const orderCode = storage.generateWorkOrderCode();
      const { blockRoom, blockFrom, blockTo, blockedBy, ...rest } = req.body;
      const body = { ...rest };
      if (body.scheduledDate === "") body.scheduledDate = null;
      if (body.estimatedCost === "") body.estimatedCost = null;
      if (body.roomId === "" || body.roomId === "none") body.roomId = null;
      if (body.assignedToId === "" || body.assignedToId === "none") body.assignedToId = null;
      if (body.location === "") body.location = null;
      if (body.description === "") body.description = null;
      if (body.notes === "") body.notes = null;

      const order = await storage.createWorkOrder({
        ...body,
        orderCode,
        reportedAt: new Date(),
      });

      // Optionally create a maintenance block (NEVER auto-block; only if explicitly requested)
      let maintenanceBlock = null;
      if (blockRoom && body.roomId && blockFrom && blockTo && blockedBy) {
        maintenanceBlock = await storage.createMaintenanceBlock({
          workOrderId: order.id,
          roomId: body.roomId,
          blockFrom,
          blockTo,
          blockedBy,
          notes: body.notes || null,
        });
      }

      res.status(201).json({ ...order, maintenanceBlock });
    } catch (error) {
      console.error("Error creating work order:", error);
      res.status(500).json({ error: "Error creating work order" });
    }
  });

  app.patch("/api/maintenance/work-orders/:id", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.status === "completed" && !updates.completedAt) {
        updates.completedAt = new Date();
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
      // Remove associated maintenance block if any
      await storage.deleteMaintenanceBlockByWorkOrder(req.params.id);
      await storage.deleteWorkOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting work order" });
    }
  });

  // Maintenance Blocks
  // Check conflicts BEFORE creating a block (must be before /blocks to avoid route collision)
  app.get("/api/maintenance/blocks/check-conflicts", requireAuth, async (req, res) => {
    try {
      const { roomId, from, to } = req.query as { roomId: string; from: string; to: string };
      if (!roomId || !from || !to) return res.status(400).json({ error: "roomId, from, to son requeridos" });
      const conflicts = await storage.checkMaintenanceBlockConflicts(roomId, from, to);
      res.json(conflicts);
    } catch (error) {
      res.status(500).json({ error: "Error verificando conflictos" });
    }
  });

  app.get("/api/maintenance/blocks", async (req, res) => {
    try {
      const { roomId, from, to } = req.query;
      const blocks = await storage.getMaintenanceBlocks({
        roomId: roomId as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
      });
      res.json(blocks);
    } catch (error) {
      res.status(500).json({ error: "Error fetching maintenance blocks" });
    }
  });

  app.post("/api/maintenance/blocks", requireAuth, async (req, res) => {
    try {
      const block = await storage.createMaintenanceBlock(req.body);
      res.status(201).json(block);
    } catch (error) {
      res.status(500).json({ error: "Error creating maintenance block" });
    }
  });

  app.delete("/api/maintenance/blocks/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteMaintenanceBlock(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting maintenance block" });
    }
  });

  // Dashboard stats for maintenance
  app.get("/api/maintenance/dashboard", async (req, res) => {
    try {
      const orders = await storage.getWorkOrders();
      const staffList = await storage.getMaintenanceStaff();

      const pending = orders.filter(o => o.status === "pending").length;
      const inProgress = orders.filter(o => o.status === "in_progress" || o.status === "assigned").length;
      const completedToday = orders.filter(o => {
        if (o.status !== "completed" || !o.completedAt) return false;
        const today = new Date().toISOString().split("T")[0];
        return o.completedAt.toString().startsWith(today);
      }).length;
      const urgent = orders.filter(o => o.priority === "urgent" && o.status !== "completed" && o.status !== "cancelled").length;

      res.json({
        pending,
        inProgress,
        completedToday,
        urgent,
        totalStaff: staffList.filter(s => s.isActive === "true").length,
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

  // ── Preventive Maintenance Tasks ──────────────────────────────────────────
  app.get("/api/maintenance/preventive", requireAuth, async (_req, res) => {
    try {
      const result = await db.execute(sql`SELECT * FROM preventive_tasks WHERE active = true ORDER BY next_due_at ASC`);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/maintenance/preventive", requireAuth, async (req, res) => {
    try {
      const { name, description, frequency, frequencyDays, nextDueAt, assignedTo, notes } = req.body;
      if (!name?.trim() || !nextDueAt) return res.status(400).json({ error: "name y nextDueAt son requeridos" });
      const result = await db.execute(sql`
        INSERT INTO preventive_tasks (name, description, frequency, frequency_days, next_due_at, assigned_to, notes)
        VALUES (${name.trim()}, ${description || null}, ${frequency || "monthly"}, ${frequencyDays || 30}, ${nextDueAt}, ${assignedTo || null}, ${notes || null})
        RETURNING *
      `);
      res.status(201).json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/maintenance/preventive/:id", requireAuth, async (req, res) => {
    try {
      const { name, description, frequency, frequencyDays, nextDueAt, assignedTo, notes, active } = req.body;
      const result = await db.execute(sql`
        UPDATE preventive_tasks SET
          name = COALESCE(${name ?? null}, name),
          description = ${description ?? null},
          frequency = COALESCE(${frequency ?? null}, frequency),
          frequency_days = COALESCE(${frequencyDays ?? null}, frequency_days),
          next_due_at = COALESCE(${nextDueAt ?? null}, next_due_at),
          assigned_to = ${assignedTo ?? null},
          notes = ${notes ?? null},
          active = COALESCE(${active ?? null}, active),
          updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING *
      `);
      if (!result.rows.length) return res.status(404).json({ error: "Tarea no encontrada" });
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/maintenance/preventive/:id", requireAuth, async (req, res) => {
    try {
      await db.execute(sql`DELETE FROM preventive_tasks WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Marcar como hecha → auto-programa la siguiente ocurrencia
  app.post("/api/maintenance/preventive/:id/done", requireAuth, async (req, res) => {
    try {
      const { doneNotes } = req.body;
      const existing = await db.execute(sql`SELECT * FROM preventive_tasks WHERE id = ${req.params.id}`);
      if (!existing.rows.length) return res.status(404).json({ error: "Tarea no encontrada" });
      const task = existing.rows[0] as any;
      const today = new Date().toISOString().split("T")[0];
      const freqDays = parseInt(String(task.frequency_days || 30));
      const nextMs = Date.now() + freqDays * 86400000;
      const nextDate = new Date(nextMs).toISOString().split("T")[0];
      const result = await db.execute(sql`
        UPDATE preventive_tasks SET
          last_done_at = ${today},
          next_due_at = ${nextDate},
          notes = CASE WHEN ${doneNotes || null} IS NOT NULL THEN ${doneNotes || null} ELSE notes END,
          updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING *
      `);
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
