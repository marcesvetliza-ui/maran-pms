import type { Express } from "express";
import { storage } from "../db-storage";

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
      const body = { ...req.body };
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
      res.status(201).json(order);
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
      const staffList = await storage.getMaintenanceStaff();

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
}
