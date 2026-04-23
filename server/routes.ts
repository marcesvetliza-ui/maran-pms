import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import passport from "passport";
import { storage, getArgentinaToday } from "./db-storage";
import { insertGuestReviewSchema, reservationChangelog, reservations, guests, housekeepingTasks, rooms } from "@shared/schema";
import { charges, payments, spaPayments, eventPayments, cashMovements, cashShifts } from "@shared/schema";
import { stayNotes, hospitalityAlerts, guestPreferences } from "@shared/schema";
import { requireAuth, requireRole, hashPassword } from "./auth";
import { db } from "./db";
import { systemUsers, spaProfessionals, spaClients } from "@shared/schema";
import { lostFoundItems, systemIncidents, events as eventsTable, nightAuditLogs } from "@shared/schema";
import { eq, sql, desc, asc, gte, lte, and, or, ilike, like, inArray, ne } from "drizzle-orm";
import { HELP_MANUAL } from "./help-manual";
import { generarAsiento, generarAsientoOP } from "./accounting";
import { registerExportRoutes } from "./exports";
import { registerAdminCashRoutes } from "./adminCash";
import { registerBillingRoutes } from "./billing/routes";
import { registerReportsRoutes } from "./reports/routes";
import { registerHospitalityRoutes } from "./routes/hospitality";
import { registerOtaRoutes } from "./routes/ota";
import { registerPlanningRoutes } from "./routes/planning";
import { registerPackagesRoutes } from "./routes/packages";
import { registerRoomsRoutes } from "./routes/rooms";
import { generateHojaFuncionPdf, generateConfirmacionEventoPdf } from "./eventPdfs";
import { audit } from "./audit";
import { registerGuestsRoutes } from "./routes/guests";
import { registerReservationsRoutes } from "./routes/reservations";
import { registerGroupsRoutes } from "./routes/groups";
import { registerHousekeepingRoutes } from "./routes/housekeeping";
import { registerRestaurantRoutes } from "./routes/restaurant";
import { registerInventoryRoutes } from "./routes/inventory";
import { registerSpaRoutes } from "./routes/spa";
import { registerEventsRoutes } from "./routes/events";
import { registerPresupuestosRoutes } from "./routes/presupuestos";
import { registerMaintenanceRoutes } from "./routes/maintenance";
import { registerFolioRoutes } from "./routes/folios";
import { registerPublicBookingRoutes } from "./routes/publicBooking";
import { registerEmailRoutes } from "./routes/emails";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function isReservationLocked(reservation: { status: string }): boolean {
  return reservation.status === "checked_out" || reservation.status === "cancelled";
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Credenciales incorrectas" });
      }
      req.logIn(user, async (err) => {
        if (err) return next(err);
        await audit(req, "login", "auth", `Inicio de sesión: ${user.username}`);
        return res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", async (req, res) => {
    await audit(req, "logout", "auth", `Cierre de sesión: ${(req as any).user?.username || "desconocido"}`);
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error al cerrar sesión" });
      }
      res.json({ message: "Sesión cerrada" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json(req.user);
    }
    res.status(401).json({ message: "No autenticado" });
  });

  app.post("/api/auth/setup", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ message: "Not found" });
    }
    try {
      const allUsers = await db.select().from(systemUsers);
      const anyUserWithPassword = allUsers.some(u => u.password !== null);
      if (anyUserWithPassword) {
        return res.status(400).json({ message: "Setup ya fue completado. Este endpoint está deshabilitado." });
      }

      const hashedPassword = await hashPassword("maran2026");
      
      const adminUser = allUsers.find(u => u.username === "admin");
      if (adminUser) {
        await db
          .update(systemUsers)
          .set({ password: hashedPassword })
          .where(eq(systemUsers.id, adminUser.id));
      } else {
        await db.insert(systemUsers).values({
          id: randomUUID(),
          username: "admin",
          password: hashedPassword,
          email: "admin@maransuites.com",
          fullName: "Administrador Sistema",
          role: "admin",
          department: "Sistemas",
          phone: "+54 343 400-0001",
          isActive: "true",
          createdAt: new Date(),
        });
      }

      res.json({ message: "Usuario admin configurado con contraseña" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.use("/api", (req, res, next) => {
    const publicPaths = [
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/me",
      "/api/auth/setup",
    ];
    
    if (publicPaths.includes(req.path)) {
      return next();
    }
    
    if (req.path.startsWith("/public/")) {
      return next();
    }
    
    if ((req.path === "/api/webhook/chatbot" || req.path === "/webhook/chatbot") && req.method === "POST") {
      return next();
    }

    requireAuth(req, res, next);
  });

  app.use("/api/system-users", requireRole(["admin"]));
  app.use("/api/system-settings", requireRole(["admin"]));

  app.get("/api/source/files", requireAuth, async (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    const fs = await import("fs");
    const srcPath = path.resolve(".");
    const allowedDirs = ["client/src", "server", "shared", "script"];
    const allowedRootFiles = ["package.json", "tsconfig.json", "tailwind.config.ts", "vite.config.ts", "drizzle.config.ts", "replit.md"];
    const results: string[] = [];

    function walkDir(dir: string) {
      try {
        const entries = fs.readdirSync(path.join(srcPath, dir), { withFileTypes: true });
        for (const entry of entries) {
          const rel = dir + "/" + entry.name;
          if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "ui" && entry.name !== "replit_integrations") {
            walkDir(rel);
          } else if (entry.isFile() && /\.(ts|tsx|css|json|md)$/.test(entry.name)) {
            results.push(rel);
          }
        }
      } catch {}
    }

    for (const d of allowedDirs) walkDir(d);
    for (const f of allowedRootFiles) {
      if (fs.existsSync(path.join(srcPath, f))) results.push(f);
    }
    res.json(results.sort());
  });

  app.get("/api/source/file", requireAuth, async (req, res) => {
    const fs = await import("fs");
    const filePath = req.query.path as string;
    if (!filePath || filePath.includes("..") || filePath.startsWith("/")) {
      return res.status(400).json({ error: "Ruta inválida" });
    }
    const fullPath = path.resolve(filePath);
    if (!fullPath.startsWith(path.resolve("."))) {
      return res.status(403).json({ error: "Acceso denegado" });
    }
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      res.json({ path: filePath, content });
    } catch {
      res.status(404).json({ error: "Archivo no encontrado" });
    }
  });

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

  // System Users — only admins can manage users
  app.get("/api/admin/users", requireRole(["admin"]), async (req, res) => {
    try {
      const users = await storage.getSystemUsers();
      // Never expose password hashes
      res.json(users.map(({ password: _, ...u }) => u));
    } catch (error) {
      res.status(500).json({ error: "Error fetching users" });
    }
  });

  app.get("/api/admin/users/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const user = await storage.getSystemUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Error fetching user" });
    }
  });

  app.post("/api/admin/users", requireRole(["admin"]), async (req, res) => {
    try {
      const { password, ...rest } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      }
      const existing = await db.select({ id: systemUsers.id }).from(systemUsers).where(eq(systemUsers.username, rest.username)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "El nombre de usuario ya existe" });
      }
      const hashedPassword = await hashPassword(password);
      const user = await storage.createSystemUser({
        ...rest,
        id: randomUUID(),
        password: hashedPassword,
        createdAt: new Date(),
      });
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Error creating user" });
    }
  });

  app.patch("/api/admin/users/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const { password, ...rest } = req.body;
      // Prevent demoting the last admin
      if (rest.role && rest.role !== "admin") {
        const currentUser = await storage.getSystemUser(req.params.id);
        if (currentUser?.role === "admin") {
          const admins = await db.select({ id: systemUsers.id }).from(systemUsers).where(eq(systemUsers.role, "admin"));
          if (admins.length <= 1) {
            return res.status(400).json({ error: "No se puede cambiar el rol del único administrador" });
          }
        }
      }
      const updateData: any = { ...rest };
      if (password && password.length >= 6) {
        updateData.password = await hashPassword(password);
      }
      const user = await storage.updateSystemUser(req.params.id, updateData);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Error updating user" });
    }
  });

  app.delete("/api/admin/users/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const targetUser = await storage.getSystemUser(req.params.id);
      if (targetUser?.role === "admin") {
        const admins = await db.select({ id: systemUsers.id }).from(systemUsers).where(eq(systemUsers.role, "admin"));
        if (admins.length <= 1) {
          return res.status(400).json({ error: "No se puede eliminar el único administrador" });
        }
      }
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
        updatedAt: new Date(),
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
        timestamp: new Date(),
      });
      res.status(201).json(log);
    } catch (error) {
      res.status(500).json({ error: "Error creating audit log" });
    }
  });

  // Reconciliación de pagos CC sin movimiento en Cuenta Corriente
  app.post("/api/admin/reconcile-cc-payments", requireAuth, async (req, res) => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      // Obtener todos los pagos con método cuenta_corriente
      const allPayments = await db.execute(sql`
        SELECT p.*, 
               r.reservation_code, r.company_id as res_company_id, r.agency_id as res_agency_id,
               r.guest_id, r.room_id,
               g.first_name, g.last_name, ro.room_number
        FROM payments p
        JOIN reservations r ON p.reservation_id = r.id
        LEFT JOIN guests g ON r.guest_id = g.id
        LEFT JOIN rooms ro ON r.room_id = ro.id
        WHERE p.method = 'cuenta_corriente'
          AND p.status != 'anulado'
      `);

      let created = 0;
      let skipped = 0;

      for (const pay of (allPayments.rows as any[])) {
        const billingTarget = pay.billing_target || "guest";

        // Verificar si ya existe un movimiento para esta reserva con este monto
        const existing = await storage.getAccountMovementsByReservation(pay.reservation_id);
        const amtStr = parseFloat(pay.amount).toFixed(2);
        if (existing.some(m => parseFloat(m.amount).toFixed(2) === amtStr)) { skipped++; continue; }

        const guestName = pay.first_name ? `${pay.first_name} ${pay.last_name}` : "Huésped";
        const roomNum = pay.room_number || pay.room_id || "N/A";

        // Use payment's own company/agency if available, fall back to reservation's
        const effectiveCompanyId = pay.company_id || pay.res_company_id || null;
        const effectiveAgencyId = pay.agency_id || pay.res_agency_id || null;
        const guestId = pay.guest_id || null;

        if (billingTarget === "company" && effectiveCompanyId) {
          await storage.createAccountMovement({
            entityType: "company",
            entityId: effectiveCompanyId,
            date: pay.date || today,
            type: "cargo",
            description: `Estadía ${pay.reservation_code} — Hab. ${roomNum}`,
            amount: amtStr,
            reservationId: pay.reservation_id,
            reservationCode: pay.reservation_code,
            guestName,
          });
          created++;
        } else if (billingTarget === "agency" && effectiveAgencyId) {
          await storage.createAccountMovement({
            entityType: "agency",
            entityId: effectiveAgencyId,
            date: pay.date || today,
            type: "cargo",
            description: `Estadía ${pay.reservation_code} — Hab. ${roomNum}`,
            amount: amtStr,
            reservationId: pay.reservation_id,
            reservationCode: pay.reservation_code,
            guestName,
          });
          created++;
        } else if (billingTarget === "guest" && guestId) {
          await storage.createAccountMovement({
            entityType: "guest",
            entityId: guestId,
            date: pay.date || today,
            type: "cargo",
            description: `Estadía ${pay.reservation_code} — Hab. ${roomNum}`,
            amount: amtStr,
            reservationId: pay.reservation_id,
            reservationCode: pay.reservation_code,
            guestName,
          });
          created++;
        } else {
          skipped++;
        }
      }

      res.json({ created, skipped, message: `Reconciliación completa: ${created} movimientos creados, ${skipped} omitidos` });
    } catch (error) {
      console.error("Error en reconciliación CC:", error);
      res.status(500).json({ error: "Error en reconciliación" });
    }
  });

  // ==================== SYSTEM NOTIFICATIONS ====================

  app.get("/api/notifications", async (req, res) => {
    try {
      const area = req.query.area as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotifications(area as any, limit);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "Error fetching notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const notification = await storage.createNotification(req.body);
      res.status(201).json(notification);
    } catch (error) {
      res.status(500).json({ error: "Error creating notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const id = req.params.id;
      const notification = await storage.markNotificationRead(id);
      if (!notification) return res.status(404).json({ error: "Notification not found" });
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: "Error marking notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const area = req.query.area as string | undefined;
      const count = await storage.markAllNotificationsRead(area as any);
      res.json({ markedRead: count });
    } catch (error) {
      res.status(500).json({ error: "Error marking notifications as read" });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const area = req.query.area as string | undefined;
      const count = await storage.getUnreadNotificationCount(area as any);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Error getting unread count" });
    }
  });

  // ==================== CHATBOT WEBHOOK ====================

  app.get("/api/webhook/chatbot/secret", requireAuth, async (req, res) => {
    if ((req.user as any)?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    const secret = process.env.CHATBOT_WEBHOOK_SECRET || "";
    res.json({ secret });
  });

  app.post("/api/webhook/chatbot", async (req, res) => {
    try {
      const secret = req.headers["x-chatbot-secret"] as string;
      const expectedSecret = process.env.CHATBOT_WEBHOOK_SECRET;
      if (!expectedSecret || secret !== expectedSecret) {
        return res.status(401).json({ error: "Invalid or missing webhook secret" });
      }

      const { eventType, area, priority, guestName, roomNumber, reservationId, message, timestamp } = req.body;

      const validAreas = ["housekeeping", "maintenance", "restaurant", "spa", "reception", "all"];
      const validPriorities = ["normal", "high", "urgent"];

      if (!area || !message) {
        return res.status(400).json({ error: "area and message are required" });
      }
      if (!validAreas.includes(area)) {
        return res.status(400).json({ error: `Invalid area. Must be one of: ${validAreas.join(", ")}` });
      }
      if (priority && !validPriorities.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` });
      }

      const areaLabels: Record<string, string> = {
        housekeeping: "Housekeeping",
        maintenance: "Mantenimiento",
        restaurant: "Restaurante",
        spa: "SPA",
        reception: "Recepción",
        all: "General",
      };

      const typeMap: Record<string, string> = {
        housekeeping: "chatbot_housekeeping",
        maintenance: "chatbot_maintenance",
        restaurant: "chatbot_restaurant",
        spa: "chatbot_spa",
        reception: "chatbot_request",
        all: "chatbot_request",
      };

      const notification = await storage.createNotification({
        type: (typeMap[area] || "chatbot_request") as any,
        title: `Solicitud de ${guestName || "Huésped"} - Hab. ${roomNumber || "N/A"}`,
        message,
        targetArea: area,
        relatedEntityType: reservationId ? "reservation" : "room",
        relatedEntityId: reservationId ? String(reservationId) : roomNumber,
        priority: priority || "normal",
      });

      if (area === "housekeeping" && roomNumber) {
        const rooms = await storage.getRooms();
        const room = rooms.find(r => r.roomNumber === roomNumber);
        if (room) {
          try {
            await storage.createHousekeepingTask({
              roomId: room.id,
              type: "guest_request",
              status: "pending",
              priority: priority === "urgent" ? "urgent" : "normal",
              notes: `Chatbot: ${message} (${guestName || "Huésped"})`,
            });
          } catch {}
        }
      }

      res.json({ success: true, notificationId: notification.id });
    } catch (error) {
      res.status(500).json({ error: "Error processing webhook" });
    }
  });

  // ==================== WEB CHECK-IN ====================

  app.post("/api/web-checkin/generate/:reservationId", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.reservationId);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const existing = await storage.getWebCheckinByReservation(req.params.reservationId);
      if (existing && existing.status !== "expired") {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host;
        const link = `${protocol}://${host}/web-checkin/${existing.token}`;
        return res.json({ token: existing.token, link, webCheckin: existing });
      }

      const token = randomUUID();
      const checkInDate = new Date(reservation.checkInDate);
      const expiresAt = new Date(checkInDate.getTime() + 24 * 60 * 60 * 1000);

      const webCheckin = await storage.createWebCheckin({
        reservationId: req.params.reservationId,
        token,
        status: "pending",
        confirmedFirstName: reservation.guest?.firstName || null,
        confirmedLastName: reservation.guest?.lastName || null,
        confirmedDocumentType: reservation.guest?.documentType || null,
        confirmedDocumentNumber: reservation.guest?.documentNumber || null,
        confirmedNationality: reservation.guest?.nationality || null,
        confirmedPhone: reservation.guest?.phone || null,
        confirmedEmail: reservation.guest?.email || null,
        expiresAt,
      });

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const link = `${protocol}://${host}/web-checkin/${token}`;

      res.status(201).json({ token, link, webCheckin });
    } catch (error) {
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
  app.get("/api/public/web-checkin/:token", async (req, res) => {
    try {
      const webCheckin = await storage.getWebCheckinByToken(req.params.token);
      if (!webCheckin) {
        return res.status(404).json({ error: "Web check-in no encontrado" });
      }

      if (webCheckin.status === "completed") {
        return res.status(400).json({ error: "Este web check-in ya fue completado" });
      }

      if (webCheckin.expiresAt && new Date() > new Date(webCheckin.expiresAt)) {
        await storage.updateWebCheckin(webCheckin.id, { status: "expired" } as any);
        return res.status(400).json({ error: "Este enlace ha expirado" });
      }

      const reservation = await storage.getReservation(webCheckin.reservationId);

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
        reservation: reservation ? {
          checkInDate: reservation.checkInDate,
          checkOutDate: reservation.checkOutDate,
          roomType: reservation.room?.roomType?.name,
          nights: reservation.nights,
        } : null,
        hotel: {
          name: "Maran Suites & Towers",
          address: "Alameda de la Federación 497, Paraná, Entre Ríos",
          phone: "+54 343 423-5444",
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Error loading web check-in" });
    }
  });

  app.post("/api/public/web-checkin/:token", async (req, res) => {
    try {
      const webCheckin = await storage.getWebCheckinByToken(req.params.token);
      if (!webCheckin) {
        return res.status(404).json({ error: "Web check-in no encontrado" });
      }

      if (webCheckin.status === "completed") {
        return res.status(400).json({ error: "Este web check-in ya fue completado" });
      }

      if (webCheckin.expiresAt && new Date() > new Date(webCheckin.expiresAt)) {
        await storage.updateWebCheckin(webCheckin.id, { status: "expired" } as any);
        return res.status(400).json({ error: "Este enlace ha expirado" });
      }

      const {
        confirmedFirstName, confirmedLastName,
        confirmedDocumentType, confirmedDocumentNumber,
        confirmedNationality, confirmedPhone, confirmedEmail,
        documentPhotoUrl, estimatedArrivalTime,
        requestEarlyCheckIn, earlyCheckInTime,
        termsAccepted,
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
        estimatedArrivalTime,
        requestEarlyCheckIn: requestEarlyCheckIn || false,
        earlyCheckInTime: earlyCheckInTime || null,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
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

      if (requestEarlyCheckIn && reservation) {
        await storage.updateReservation(webCheckin.reservationId, {
          earlyCheckIn: true,
          earlyCheckInTime: earlyCheckInTime || null,
        } as any);
      }

      await storage.createNotification({
        type: "web_checkin",
        title: `Web Check-in completado - ${confirmedFirstName} ${confirmedLastName}`,
        message: `El huésped completó el web check-in. Llegada estimada: ${estimatedArrivalTime || "No especificada"}${requestEarlyCheckIn ? `. Solicita early check-in: ${earlyCheckInTime}` : ""}`,
        targetArea: "reception",
        relatedEntityType: "reservation",
        relatedEntityId: webCheckin.reservationId,
        priority: requestEarlyCheckIn ? "high" : "normal",
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error processing web check-in" });
    }
  });

  app.get("/api/executive/stats", requireAuth, async (req, res) => {
    try {
      const today = new Date();
      let from = req.query.from as string;
      let to = req.query.to as string;
      const period = req.query.period as string;

      if (period === "today") {
        from = to = today.toISOString().split("T")[0];
      } else if (period === "week") {
        const start = new Date(today);
        start.setDate(start.getDate() - start.getDay());
        from = start.toISOString().split("T")[0];
        to = today.toISOString().split("T")[0];
      } else if (period === "month") {
        from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
        to = today.toISOString().split("T")[0];
      } else if (period === "year") {
        from = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];
        to = today.toISOString().split("T")[0];
      } else if (!from || !to) {
        from = to = today.toISOString().split("T")[0];
      }

      const stats = await storage.getExecutiveStats(from, to);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Error fetching executive stats" });
    }
  });

  app.get("/api/reports/occupancy", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const data = await storage.getReportOccupancy(from, to);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching occupancy report" });
    }
  });

  app.get("/api/reports/revenue-by-room-type", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const data = await storage.getReportRevenueByRoomType(from, to);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching revenue report" });
    }
  });

  app.get("/api/reports/by-channel", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const data = await storage.getReportByChannel(from, to);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching channel report" });
    }
  });

  app.get("/api/reports/reservations", requireAuth, async (req, res) => {
    try {
      const { from, to, status } = req.query as { from: string; to: string; status?: string };
      const data = await storage.getReportReservations(from, to, status);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching reservations report" });
    }
  });

  app.get("/api/reports/payments", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const data = await storage.getReportPayments(from, to);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching payments report" });
    }
  });

  app.get("/api/reports/caja-unificada", requireAuth, async (req, res) => {
    try {
      const fecha = (req.query.fecha as string) || getArgentinaToday();
      const todos: any[] = [];

      const resPayments = await db.execute(sql`
        SELECT p.id, 'reserva' as modulo, p.method as metodo, p.amount as monto,
               p.date as fecha_pago, g.first_name || ' ' || g.last_name as descripcion,
               r.reservation_code as referencia
        FROM payments p
        LEFT JOIN reservations r ON p.reservation_id = r.id
        LEFT JOIN guests g ON r.guest_id = g.id
        WHERE p.date = ${fecha} AND (p.status IS NULL OR p.status = 'active')
      `);
      todos.push(...(resPayments.rows as any[]).map(r => ({ ...r, monto: parseFloat(r.monto) })));

      const spaRows = await db.execute(sql`
        SELECT sp.id, 'spa' as modulo, sp.method as metodo, sp.amount as monto,
               sp.created_at::date as fecha_pago,
               'SPA - Cuenta ' || sp.account_id as descripcion,
               sp.account_id as referencia
        FROM spa_payments sp
        WHERE sp.created_at::date = ${fecha} AND (sp.status IS NULL OR sp.status = 'active')
      `);
      todos.push(...(spaRows.rows as any[]).map(r => ({ ...r, monto: parseFloat(r.monto) })));

      const evtRows = await db.execute(sql`
        SELECT ep.id, 'eventos' as modulo, ep.method as metodo, ep.amount as monto,
               ep.paid_at::date as fecha_pago,
               'Evento - ' || e.name as descripcion,
               e.name as referencia
        FROM event_payments ep
        LEFT JOIN events e ON ep.event_id = e.id
        WHERE ep.paid_at::date = ${fecha} AND (ep.status IS NULL OR ep.status = 'active')
      `);
      todos.push(...(evtRows.rows as any[]).map(r => ({ ...r, monto: parseFloat(r.monto) })));

      const porMetodo: Record<string, number> = {};
      const porModulo: Record<string, number> = {};
      for (const p of todos) {
        const m = (p as any).metodo || "otros";
        porMetodo[m] = (porMetodo[m] || 0) + parseFloat((p as any).monto || "0");
        const mod = (p as any).modulo || "otros";
        porModulo[mod] = (porModulo[mod] || 0) + parseFloat((p as any).monto || "0");
      }

      res.json({
        fecha,
        movimientos: todos,
        totalPorMetodo: porMetodo,
        porModulo,
        totalGeneral: todos.reduce((s, p) => s + parseFloat((p as any).monto || "0"), 0),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/reports/top-guests", requireAuth, async (req, res) => {
    try {
      const { from, to, limit } = req.query as { from: string; to: string; limit?: string };
      const data = await storage.getReportTopGuests(from, to, limit ? parseInt(limit) : 50);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching top guests report" });
    }
  });

  app.get("/api/reports/housekeeping", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const data = await storage.getReportHousekeeping(from, to);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching housekeeping report" });
    }
  });

  app.get("/api/reports/billing", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const result = await db.execute(sql`
        SELECT 
          p.id,
          p.reservation_id,
          p.amount,
          p.method,
          p.date,
          p.reference,
          p.billing_target,
          r.reservation_code,
          r.room_id,
          rm.room_number,
          g.first_name || ' ' || g.last_name as guest_name,
          COALESCE(c.nombre_fantasia, c.razon_social) as company_name
        FROM payments p
        LEFT JOIN reservations r ON r.id = p.reservation_id
        LEFT JOIN rooms rm ON rm.id = r.room_id
        LEFT JOIN guests g ON g.id = r.guest_id
        LEFT JOIN companies c ON c.id = r.company_id
        WHERE p.date >= ${from} AND p.date <= ${to}
        ORDER BY p.date DESC, p.id DESC
      `);
      
      const payments = result.rows || [];
      const guestTotal = payments
        .filter((p: any) => !p.billing_target || p.billing_target === 'guest')
        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0);
      const companyTotal = payments
        .filter((p: any) => p.billing_target === 'company')
        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0);
      
      const byMethod: Record<string, { count: number; total: number }> = {};
      for (const p of payments as any[]) {
        const m = p.method || 'otros';
        if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
        byMethod[m].count++;
        byMethod[m].total += parseFloat(p.amount || '0');
      }

      res.json({
        payments,
        summary: {
          totalPayments: payments.length,
          totalAmount: guestTotal + companyTotal,
          guestTotal,
          companyTotal,
          byMethod,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching billing report" });
    }
  });

  // Deuda consolidada por huésped — alojamiento + extras de reservas activas
  app.get("/api/reports/guest-debt", requireAuth, async (req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT
          g.id AS guest_id,
          g.first_name || ' ' || g.last_name AS guest_name,
          g.document_number,
          g.document_type,
          r.id AS reservation_id,
          r.reservation_code,
          r.check_in_date,
          r.check_out_date,
          r.status,
          rm.room_number,
          COALESCE(r.total_amount, 0)::numeric AS alojamiento,
          COALESCE(
            (SELECT SUM(ch.amount::numeric) FROM charges ch WHERE ch.reservation_id = r.id AND ch.category != 'adjustment'), 0
          ) AS extras,
          COALESCE(
            (SELECT SUM(p.amount::numeric) FROM payments p WHERE p.reservation_id = r.id), 0
          ) AS pagado
        FROM reservations r
        JOIN guests g ON g.id = r.guest_id
        LEFT JOIN rooms rm ON rm.id = r.room_id
        WHERE r.status IN ('confirmed', 'checked_in')
          AND (
            COALESCE(r.total_amount, 0)::numeric +
            COALESCE((SELECT SUM(ch.amount::numeric) FROM charges ch WHERE ch.reservation_id = r.id AND ch.category != 'adjustment'), 0) -
            COALESCE((SELECT SUM(p.amount::numeric) FROM payments p WHERE p.reservation_id = r.id), 0)
          ) > 0.01
        ORDER BY g.last_name, g.first_name, r.check_in_date
      `)).rows as any[];

      // Group by guest
      const byGuest: Record<string, any> = {};
      for (const row of rows) {
        const gid = row.guest_id;
        if (!byGuest[gid]) {
          byGuest[gid] = {
            guestId: gid,
            guestName: row.guest_name,
            documentNumber: row.document_number,
            documentType: row.document_type,
            reservations: [],
            totalAlojamiento: 0,
            totalExtras: 0,
            totalPagado: 0,
            totalDeuda: 0,
          };
        }
        const aloj = parseFloat(row.alojamiento) || 0;
        const extr = parseFloat(row.extras) || 0;
        const pag  = parseFloat(row.pagado) || 0;
        const saldo = aloj + extr - pag;
        byGuest[gid].reservations.push({
          reservationId: row.reservation_id,
          reservationCode: row.reservation_code,
          roomNumber: row.room_number,
          checkInDate: row.check_in_date,
          checkOutDate: row.check_out_date,
          status: row.status,
          alojamiento: aloj,
          extras: extr,
          pagado: pag,
          saldo,
        });
        byGuest[gid].totalAlojamiento += aloj;
        byGuest[gid].totalExtras += extr;
        byGuest[gid].totalPagado += pag;
        byGuest[gid].totalDeuda += saldo;
      }

      res.json(Object.values(byGuest));
    } catch (error) {
      console.error("Error fetching guest debt report:", error);
      res.status(500).json({ error: "Error al obtener deuda por huésped" });
    }
  });

  app.get("/api/reports/restaurant", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const data = await storage.getReportRestaurant(from, to);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching restaurant report" });
    }
  });

  // ==================== Cash Register Module ====================

  app.get("/api/cash/configs", requireAuth, async (req, res) => {
    try {
      const configs = await storage.getCashConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching cash configs" });
    }
  });

  app.patch("/api/cash/configs/:area", requireAuth, requireRole(["admin", "manager"]), async (req, res) => {
    try {
      const updated = await storage.updateCashConfig(req.params.area, req.body);
      if (!updated) return res.status(404).json({ error: "Config not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating cash config" });
    }
  });

  app.get("/api/cash/shifts", requireAuth, async (req, res) => {
    try {
      const { area, status } = req.query as { area?: string; status?: string };
      const shifts = await storage.getCashShifts(area, status);
      res.json(shifts);
    } catch (error) {
      res.status(500).json({ error: "Error fetching shifts" });
    }
  });

  app.get("/api/cash/shifts/current", requireAuth, async (req, res) => {
    try {
      const { area } = req.query as { area: string };
      if (!area) return res.status(400).json({ error: "area is required" });
      const shift = await storage.getCurrentShift(area);
      res.json(shift || null);
    } catch (error) {
      res.status(500).json({ error: "Error fetching current shift" });
    }
  });

  app.post("/api/cash/shifts/open", requireAuth, async (req, res) => {
    try {
      const shift = await storage.openShift(req.body);
      await audit(req, "create", "cash",
        `Turno de caja abierto — Área: ${req.body.area || "recepción"}`,
        { entityType: "cash_shift", entityId: shift.id }
      );
      res.status(201).json(shift);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error opening shift" });
    }
  });

  app.post("/api/cash/shifts/:id/close", requireAuth, async (req, res) => {
    try {
      const { closedBy, efectivoContado = 0, operadorSiguiente = null, enviarAAdministracion = false, notes } = req.body;
      if (!closedBy) return res.status(400).json({ error: "closedBy is required" });
      const result = await storage.closeShift(req.params.id, closedBy, parseFloat(efectivoContado) || 0, operadorSiguiente || null, !!enviarAAdministracion, notes);
      await audit(req, "update", "cash",
        `Turno de caja cerrado — Área: ${result?.area || "recepción"}`,
        { entityType: "cash_shift", entityId: req.params.id }
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error closing shift" });
    }
  });

  app.patch("/api/cash/shifts/:id/tomar", requireAuth, async (req, res) => {
    try {
      const { operador } = req.body;
      if (!operador?.trim()) return res.status(400).json({ error: "operador is required" });
      const shift = await storage.tomarTurno(req.params.id, operador.trim());
      res.json(shift);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error al tomar turno" });
    }
  });

  app.get("/api/cash/shifts/autocreados", requireAuth, async (_req, res) => {
    try {
      const shifts = await storage.getAutocreadoShifts();
      res.json(shifts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cash/init-shifts", requireAuth, async (_req, res) => {
    try {
      await storage.initCashShifts();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cash/shifts/:id", requireAuth, async (req, res) => {
    try {
      const detail = await storage.getShiftDetail(req.params.id);
      res.json(detail);
    } catch (error: any) {
      res.status(404).json({ error: error.message || "Shift not found" });
    }
  });

  app.get("/api/cash/movements", requireAuth, async (req, res) => {
    try {
      const { shiftId } = req.query as { shiftId: string };
      if (!shiftId) return res.status(400).json({ error: "shiftId is required" });
      const movements = await storage.getCashMovements(shiftId);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ error: "Error fetching movements" });
    }
  });

  app.post("/api/cash/movements", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const movement = await storage.createCashMovement(body);

      // Si es un cobro de cuenta corriente, crear movimiento en account_movements
      if (body.sourceType === "cobro_cc" && body.ccEntityType && body.ccEntityId) {
        const user = req.user as any;
        const today = new Date().toISOString().split("T")[0];
        await storage.createAccountMovement({
          entityType: body.ccEntityType,
          entityId: body.ccEntityId,
          date: today,
          type: "pago",
          description: body.sourceLabel || `Cobro en caja — ${body.ccEntityName || body.ccEntityId}`,
          amount: String(-Math.abs(parseFloat(body.amount))),
          reference: `Caja: ${movement.id}`,
          createdBy: user?.id || null,
        });
      }

      res.status(201).json(movement);
    } catch (error) {
      console.error("Error creating cash movement:", error);
      res.status(500).json({ error: "Error creating movement" });
    }
  });

  app.patch("/api/cash/movements/:id/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion, anuladoPor, forceAdmin } = req.body;
      if (!motivoAnulacion?.trim()) return res.status(400).json({ error: "Motivo requerido" });
      const [mov] = await db.select().from(cashMovements).where(eq(cashMovements.id, req.params.id));
      if (!mov) return res.status(404).json({ error: "Movimiento no encontrado" });
      if (mov.anulado) return res.status(400).json({ error: "Ya está anulado" });
      if (mov.shiftId && !forceAdmin) {
        const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, mov.shiftId));
        if (shift && shift.status === "closed") {
          return res.status(403).json({ error: "No se puede anular movimientos de un turno cerrado" });
        }
      }
      // forceAdmin solo lo pueden usar admin/manager
      if (forceAdmin) {
        const user = req.user as any;
        if (!user || !["admin", "manager"].includes(user.role)) {
          return res.status(403).json({ error: "Solo administradores pueden forzar anulación en turnos cerrados" });
        }
      }
      await db.update(cashMovements)
        .set({ anulado: true, motivoAnulacion, anuladoPor: anuladoPor || null, anuladoAt: new Date() })
        .where(eq(cashMovements.id, req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/cash/summary", requireAuth, async (req, res) => {
    try {
      const { area, from, to } = req.query as { area?: string; from?: string; to?: string };
      const data = await storage.getCashSummary(area, from, to);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Error fetching cash summary" });
    }
  });

  app.post("/api/admin/init-rooms-7-12", requireRole(["admin"]), async (req, res) => {
    try {
      const { sql } = await import("drizzle-orm");
      const existing = await db.execute(sql`SELECT id FROM rooms WHERE floor >= 7 LIMIT 1`);
      if (existing.rows && existing.rows.length > 0) {
        return res.json({ success: true, message: "Rooms floors 7-12 already exist" });
      }
      const newRooms: any[] = [];
      for (let floor = 7; floor <= 12; floor++) {
        const f = floor;
        const p = (n: number) => `${floor}0${n}`;
        const pid = (n: number) => `r${floor}0${n}`;
        newRooms.push(
          { id: pid(1), roomNumber: p(1), roomTypeId: "rt2", floor: f, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3 },
          { id: pid(2), roomNumber: p(2), roomTypeId: "rt1", floor: f, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2 },
          { id: pid(3), roomNumber: p(3), roomTypeId: "rt1", floor: f, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2 },
          { id: pid(4), roomNumber: p(4), roomTypeId: "rt1", floor: f, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2 },
          { id: pid(5), roomNumber: p(5), roomTypeId: "rt3", floor: f, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4 },
          { id: pid(6), roomNumber: p(6), roomTypeId: "rt3", floor: f, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5 },
          { id: pid(7), roomNumber: p(7), roomTypeId: "rt2", floor: f, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2 }
        );
      }
      for (const room of newRooms) {
        const featuresArr = `{${room.features.join(",")}}`;
        await db.execute(sql`INSERT INTO rooms (id, room_number, room_type_id, floor, status, bed_config, features, max_occupancy) VALUES (${room.id}, ${room.roomNumber}, ${room.roomTypeId}, ${room.floor}, ${room.status}, ${room.bedConfig}, ${featuresArr}::text[], ${room.maxOccupancy})`);
      }
      res.json({ success: true, message: `${newRooms.length} rooms created for floors 7-12` });
    } catch (error: any) {
      console.error("Error creating rooms:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/init-cash-configs", requireRole(["admin"]), async (req, res) => {
    try {
      const { sql } = await import("drizzle-orm");
      const existing = await db.execute(sql`SELECT id FROM cash_register_configs LIMIT 1`);
      if (existing.rows && existing.rows.length > 0) {
        return res.json({ success: true, message: "Cash configs ya existen" });
      }
      await db.execute(sql`INSERT INTO cash_register_configs (id, area, area_label, shifts_per_day, is_active) VALUES ('crc1', 'reception', 'Recepción', 3, true), ('crc2', 'restaurant', 'Restaurante', 2, true), ('crc3', 'spa', 'SPA', 1, true), ('crc4', 'events', 'Eventos', 1, true)`);
      res.json({ success: true, message: "Cash configs creadas correctamente" });
    } catch (error: any) {
      console.error("Error creating cash configs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/clean-data", requireRole(["admin"]), async (req, res) => {
    try {
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`DELETE FROM cash_movements`);
      await db.execute(sql`DELETE FROM cash_closing_summaries`);
      await db.execute(sql`DELETE FROM cash_shifts`);
      await db.execute(sql`DELETE FROM order_items`);
      await db.execute(sql`DELETE FROM restaurant_orders`);
      await db.execute(sql`DELETE FROM spa_payments`);
      await db.execute(sql`DELETE FROM spa_account_items`);
      await db.execute(sql`DELETE FROM spa_accounts`);
      await db.execute(sql`DELETE FROM spa_appointments`);
      await db.execute(sql`DELETE FROM event_table_payments`);
      await db.execute(sql`DELETE FROM event_table_charges`);
      await db.execute(sql`DELETE FROM event_tables`);
      await db.execute(sql`DELETE FROM event_charges`);
      await db.execute(sql`DELETE FROM event_payments`);
      await db.execute(sql`DELETE FROM events`);
      await db.execute(sql`DELETE FROM housekeeping_tasks`);
      await db.execute(sql`DELETE FROM work_orders`);
      await db.execute(sql`DELETE FROM web_checkins`);
      await db.execute(sql`DELETE FROM stay_notes`);
      await db.execute(sql`DELETE FROM guest_preferences`);
      await db.execute(sql`DELETE FROM hospitality_alerts`);
      await db.execute(sql`DELETE FROM charges`);
      await db.execute(sql`DELETE FROM payments`);
      await db.execute(sql`DELETE FROM group_reservation_links`);
      await db.execute(sql`DELETE FROM group_room_blocks`);
      await db.execute(sql`DELETE FROM groups`);
      await db.execute(sql`DELETE FROM reservations`);
      await db.execute(sql`DELETE FROM audit_logs`);
      await db.execute(sql`DELETE FROM system_notifications`);
      await db.execute(sql`DELETE FROM guests`);
      await db.execute(sql`DELETE FROM companies`);
      await db.execute(sql`UPDATE rooms SET status = 'available'`);
      await db.execute(sql`UPDATE restaurant_tables SET status = 'available'`);
      res.json({ success: true, message: "Datos de prueba eliminados correctamente" });
    } catch (error: any) {
      console.error("Error cleaning data:", error);
      res.status(500).json({ error: error.message || "Error al limpiar datos" });
    }
  });

  app.post("/api/help/chat", requireAuth, async (req, res) => {
    try {
      const { message, history } = req.body;

      if (!message || typeof message !== "string" || message.length > 1000) {
        return res.status(400).json({ error: "Mensaje inválido (máximo 1000 caracteres)" });
      }

      const validHistory: Array<{role: "user" | "assistant", content: string}> = [];
      if (Array.isArray(history)) {
        for (const item of history.slice(-10)) {
          if (item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string") {
            validHistory.push({ role: item.role, content: item.content.slice(0, 1000) });
          }
        }
      }

      const messages: Array<{role: "system" | "user" | "assistant", content: string}> = [
        { role: "system", content: HELP_MANUAL },
        ...validHistory,
        { role: "user", content: message }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
        temperature: 0.3,
      });

      const reply = completion.choices[0].message.content;
      res.json({ reply });
    } catch (error) {
      console.error("Error in help chat:", error);
      res.status(500).json({ error: "Error al procesar la consulta" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // MÓDULO CONTABLE — Proveedores Contables
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/accounting-suppliers", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT s.*,
          COALESCE(SUM(CASE WHEN pi.estado = 'pendiente' THEN pi.monto_total::numeric ELSE 0 END), 0) AS saldo_cc
        FROM accounting_suppliers s
        LEFT JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.estado = 'pendiente'
        WHERE s.activo = true
        GROUP BY s.id
        ORDER BY s.razon_social
      `);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/accounting-suppliers/cuenta-corriente", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT s.id, s.razon_social, s.cuit, s.condicion_iva,
          COUNT(pi.id) AS facturas_pendientes,
          COALESCE(SUM(pi.monto_total::numeric), 0) AS total_saldo
        FROM accounting_suppliers s
        INNER JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.estado = 'pendiente'
        GROUP BY s.id, s.razon_social, s.cuit, s.condicion_iva
        ORDER BY total_saldo DESC
      `);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/accounting-suppliers/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.execute(sql`SELECT * FROM accounting_suppliers WHERE id = ${id}`);
      if (!result.rows.length) return res.status(404).json({ error: "Proveedor no encontrado" });
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/accounting-suppliers/:id/cuenta-corriente", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const supplier = await db.execute(sql`SELECT * FROM accounting_suppliers WHERE id = ${id}`);
      if (!supplier.rows.length) return res.status(404).json({ error: "Proveedor no encontrado" });

      const facturas = await db.execute(sql`
        SELECT * FROM purchase_invoices
        WHERE supplier_id = ${id} AND estado = 'pendiente'
        ORDER BY fecha_emision DESC
      `);

      const ops = await db.execute(sql`
        SELECT po.*, array_agg(poi.invoice_id) AS invoice_ids
        FROM payment_orders po
        LEFT JOIN payment_order_items poi ON poi.payment_order_id = po.id
        WHERE po.supplier_id = ${id}
        GROUP BY po.id
        ORDER BY po.fecha DESC
      `);

      res.json({
        supplier: supplier.rows[0],
        facturasPendientes: facturas.rows,
        historialOPs: ops.rows,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/accounting-suppliers", requireAuth, async (req, res) => {
    try {
      const { razonSocial, cuit, condicionIva, domicilio, localidad, provincia, cp,
        alicuotaIibb, alicuotaGanancias, alicuotaIva, cbu, banco, cuentaContableId } = req.body;
      if (!razonSocial || !cuit || !condicionIva) {
        return res.status(400).json({ error: "Razón social, CUIT y condición IVA son requeridos" });
      }
      const result = await db.execute(sql`
        INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva, domicilio, localidad, provincia, cp, alicuota_iibb, alicuota_ganancias, alicuota_iva, cbu, banco, cuenta_contable_id)
        VALUES (${razonSocial}, ${cuit}, ${condicionIva}, ${domicilio||null}, ${localidad||null}, ${provincia||"Entre Rios"}, ${cp||null}, ${alicuotaIibb||0}, ${alicuotaGanancias||0}, ${alicuotaIva||0}, ${cbu||null}, ${banco||null}, ${cuentaContableId ? parseInt(cuentaContableId) : null})
        RETURNING *
      `);
      res.status(201).json(result.rows[0]);
    } catch (e: any) {
      if (e.message?.includes("unique")) return res.status(409).json({ error: "CUIT ya registrado" });
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/accounting-suppliers/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { razonSocial, cuit, condicionIva, domicilio, localidad, provincia, cp,
        alicuotaIibb, alicuotaGanancias, alicuotaIva, cbu, banco, activo, cuentaContableId } = req.body;
      const result = await db.execute(sql`
        UPDATE accounting_suppliers SET
          razon_social = COALESCE(${razonSocial||null}, razon_social),
          cuit = COALESCE(${cuit||null}, cuit),
          condicion_iva = COALESCE(${condicionIva||null}, condicion_iva),
          domicilio = COALESCE(${domicilio !== undefined ? domicilio : null}, domicilio),
          localidad = COALESCE(${localidad !== undefined ? localidad : null}, localidad),
          provincia = COALESCE(${provincia||null}, provincia),
          cp = COALESCE(${cp !== undefined ? cp : null}, cp),
          alicuota_iibb = COALESCE(${alicuotaIibb !== undefined ? alicuotaIibb : null}, alicuota_iibb),
          alicuota_ganancias = COALESCE(${alicuotaGanancias !== undefined ? alicuotaGanancias : null}, alicuota_ganancias),
          alicuota_iva = COALESCE(${alicuotaIva !== undefined ? alicuotaIva : null}, alicuota_iva),
          cbu = COALESCE(${cbu !== undefined ? cbu : null}, cbu),
          banco = COALESCE(${banco !== undefined ? banco : null}, banco),
          activo = COALESCE(${activo !== undefined ? activo : null}, activo),
          cuenta_contable_id = ${cuentaContableId !== undefined ? (cuentaContableId ? parseInt(cuentaContableId) : null) : sql`cuenta_contable_id`},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `);
      if (!result.rows.length) return res.status(404).json({ error: "Proveedor no encontrado" });
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/accounting-suppliers/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.execute(sql`UPDATE accounting_suppliers SET activo = false WHERE id = ${id}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // MÓDULO CONTABLE — Comprobantes de Compra
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/purchase-invoices", requireAuth, async (req, res) => {
    try {
      const { periodo, supplierId, estado } = req.query;
      const sid = supplierId ? parseInt(supplierId as string) : null;

      // Build flexible query using CASE
      const result = await db.execute(sql`
        SELECT pi.*, s.razon_social AS supplier_nombre
        FROM purchase_invoices pi
        LEFT JOIN accounting_suppliers s ON s.id = pi.supplier_id
        WHERE (${periodo ? sql`pi.periodo = ${periodo as string}` : sql`TRUE`})
          AND (${sid ? sql`pi.supplier_id = ${sid}` : sql`TRUE`})
          AND (${estado ? sql`pi.estado = ${estado as string}` : sql`TRUE`})
        ORDER BY pi.fecha_emision DESC
      `);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/purchase-invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.execute(sql`
        SELECT pi.*, s.razon_social AS supplier_nombre, s.alicuota_iibb AS supplier_alicuota_iibb
        FROM purchase_invoices pi
        LEFT JOIN accounting_suppliers s ON s.id = pi.supplier_id
        WHERE pi.id = ${id}
      `);
      if (!result.rows.length) return res.status(404).json({ error: "Comprobante no encontrado" });
      // Lines del asiento
      const entry = await db.execute(sql`
        SELECT ael.*, aa.codigo, aa.nombre
        FROM accounting_entry_lines ael
        JOIN accounting_entries ae ON ae.id = ael.entry_id
        JOIN accounting_accounts aa ON aa.id = ael.account_id
        WHERE ae.origen_id = ${id} AND ae.origen_tipo = 'purchase_invoice'
      `);
      res.json({ ...result.rows[0], asientoLines: entry.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/purchase-invoices", requireAuth, async (req, res) => {
    try {
      const body = req.body;

      // Calcular montoTotal
      const n = (k: string) => parseFloat(body[k] || "0") || 0;
      const montoTotal =
        n("montoNeto") + n("montoIva21") + n("montoIva105") + n("montoIva27") +
        n("montoIva5") + n("montoIva25") + n("montoExento") + n("montoNoGravado") +
        n("impuestosInternos") + n("ley25413") + n("percepcionIibb") + n("percepcionIva") +
        n("percepcionGanancias") - n("retencionIibb") - n("retencionGanancias") -
        n("retencionIva") - n("retencionSuss");

      // Estado según condición de pago
      const estado = body.condicionPago === "cuenta_corriente" ? "pendiente" : "pagado";

      // Formatear numero comprobante ext
      const numeroComprobanteExt = body.puntoVenta && body.numeroComprobante
        ? `${String(body.puntoVenta).padStart(4, "0")}-${String(body.numeroComprobante).padStart(8, "0")}`
        : body.numeroComprobante;

      // Insertar comprobante
      const result = await db.execute(sql`
        INSERT INTO purchase_invoices (
          tipo_comprobante, supplier_id, proveedor_nombre, proveedor_cuit,
          punto_venta, numero_comprobante, numero_comprobante_ext,
          fecha_emision, periodo, condicion_pago,
          monto_neto, alicuota_iva, monto_iva27, monto_iva21, monto_iva105,
          monto_iva5, monto_iva25, monto_exento, monto_no_gravado,
          impuestos_internos, ley_25413, percepcion_iibb, percepcion_iva,
          percepcion_ganancias, retencion_iibb, retencion_ganancias, retencion_iva,
          retencion_suss, retencion_municipal, monotributo_comp_bc,
          monto_total, cuenta_contable_id, centro_costo, estado, observaciones
        ) VALUES (
          ${body.tipoComprobante}, ${body.supplierId||null}, ${body.proveedorNombre||null}, ${body.proveedorCuit||null},
          ${body.puntoVenta||null}, ${body.numeroComprobante}, ${numeroComprobanteExt||null},
          ${body.fechaEmision}, ${body.periodo||null}, ${body.condicionPago||"contado"},
          ${n("montoNeto")}, ${body.alicuotaIva||"21"}, ${n("montoIva27")}, ${n("montoIva21")}, ${n("montoIva105")},
          ${n("montoIva5")}, ${n("montoIva25")}, ${n("montoExento")}, ${n("montoNoGravado")},
          ${n("impuestosInternos")}, ${n("ley25413")}, ${n("percepcionIibb")}, ${n("percepcionIva")},
          ${n("percepcionGanancias")}, ${n("retencionIibb")}, ${n("retencionGanancias")}, ${n("retencionIva")},
          ${n("retencionSuss")}, ${n("retencionMunicipal")}, ${n("monotributoCompBC")},
          ${montoTotal}, ${body.cuentaContableId||null}, ${body.centroCosto||null}, ${estado}, ${body.observaciones||null}
        )
        RETURNING *
      `);
      const rawInvoice = result.rows[0] as any;

      // Mapear snake_case → camelCase para generarAsiento
      const invoice: any = {
        id: rawInvoice.id,
        tipoComprobante: rawInvoice.tipo_comprobante,
        supplierId: rawInvoice.supplier_id,
        proveedorNombre: rawInvoice.proveedor_nombre,
        proveedorCuit: rawInvoice.proveedor_cuit,
        puntoVenta: rawInvoice.punto_venta,
        numeroComprobante: rawInvoice.numero_comprobante,
        numeroComprobanteExt: rawInvoice.numero_comprobante_ext,
        fechaEmision: rawInvoice.fecha_emision,
        periodo: rawInvoice.periodo,
        condicionPago: rawInvoice.condicion_pago,
        montoNeto: rawInvoice.monto_neto,
        alicuotaIva: rawInvoice.alicuota_iva,
        montoIva27: rawInvoice.monto_iva27,
        montoIva21: rawInvoice.monto_iva21,
        montoIva105: rawInvoice.monto_iva105,
        montoIva5: rawInvoice.monto_iva5,
        montoIva25: rawInvoice.monto_iva25,
        montoExento: rawInvoice.monto_exento,
        montoNoGravado: rawInvoice.monto_no_gravado,
        impuestosInternos: rawInvoice.impuestos_internos,
        ley25413: rawInvoice.ley_25413,
        percepcionIibb: rawInvoice.percepcion_iibb,
        percepcionIva: rawInvoice.percepcion_iva,
        percepcionGanancias: rawInvoice.percepcion_ganancias,
        retencionIibb: rawInvoice.retencion_iibb,
        retencionGanancias: rawInvoice.retencion_ganancias,
        retencionIva: rawInvoice.retencion_iva,
        retencionSuss: rawInvoice.retencion_suss,
        retencionMunicipal: rawInvoice.retencion_municipal,
        monotributoCompBC: rawInvoice.monotributo_comp_bc,
        montoTotal: rawInvoice.monto_total,
        cuentaContableId: rawInvoice.cuenta_contable_id,
        centroCosto: rawInvoice.centro_costo,
        estado: rawInvoice.estado,
        asientoId: rawInvoice.asiento_id,
        observaciones: rawInvoice.observaciones,
        createdAt: rawInvoice.created_at,
        updatedAt: rawInvoice.updated_at,
      };

      // Generar asiento automático
      try {
        const entryId = await generarAsiento(invoice);
        await db.execute(sql`UPDATE purchase_invoices SET asiento_id = ${entryId} WHERE id = ${invoice.id}`);
        invoice.asientoId = entryId;
      } catch (ae) {
        console.error("Error generando asiento:", ae);
      }

      // Si tiene retención IIBB → insertar en iibb_retentions
      if (n("retencionIibb") > 0 && body.supplierId) {
        try {
          const nroRes = await db.execute(sql`SELECT COALESCE(MAX(nro_constancia), 0) + 1 AS next FROM iibb_retentions`);
          const nroConstancia = (nroRes.rows[0] as any).next;
          await db.execute(sql`
            INSERT INTO iibb_retentions (nro_constancia, supplier_id, cuit_proveedor, fecha_retencion, fecha_comprobante, nro_comprobante, letra_factura, importe_base, alicuota, importe_retenido, invoice_id)
            VALUES (${nroConstancia}, ${body.supplierId}, ${body.proveedorCuit||""}, ${body.fechaEmision}, ${body.fechaEmision}, ${parseInt(body.numeroComprobante)||0}, ${body.tipoComprobante?.slice(-1)||null}, ${n("montoNeto")}, ${body.alicuotaIibbProveedor||0}, ${n("retencionIibb")}, ${invoice.id})
          `);
        } catch (re) {
          console.error("Error inserting iibb_retention:", re);
        }
      }

      res.status(201).json(rawInvoice);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/purchase-invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await db.execute(sql`SELECT estado FROM purchase_invoices WHERE id = ${id}`);
      if (!existing.rows.length) return res.status(404).json({ error: "Comprobante no encontrado" });
      if ((existing.rows[0] as any).estado !== "pendiente") {
        return res.status(403).json({ error: "Solo se pueden editar comprobantes pendientes" });
      }
      const body = req.body;
      const n = (k: string) => parseFloat(body[k] || "0") || 0;
      const montoTotal =
        n("montoNeto") + n("montoIva21") + n("montoIva105") + n("montoIva27") +
        n("montoIva5") + n("montoIva25") + n("montoExento") + n("montoNoGravado") +
        n("impuestosInternos") + n("ley25413") + n("percepcionIibb") + n("percepcionIva") +
        n("percepcionGanancias") - n("retencionIibb") - n("retencionGanancias") -
        n("retencionIva") - n("retencionSuss");
      const result = await db.execute(sql`
        UPDATE purchase_invoices SET
          monto_neto = ${n("montoNeto")}, monto_iva21 = ${n("montoIva21")},
          monto_iva105 = ${n("montoIva105")}, monto_iva27 = ${n("montoIva27")},
          percepcion_iibb = ${n("percepcionIibb")}, percepcion_iva = ${n("percepcionIva")},
          retencion_iibb = ${n("retencionIibb")}, retencion_ganancias = ${n("retencionGanancias")},
          retencion_iva = ${n("retencionIva")}, retencion_suss = ${n("retencionSuss")},
          monto_total = ${montoTotal}, cuenta_contable_id = ${body.cuentaContableId||null},
          centro_costo = ${body.centroCosto||null}, observaciones = ${body.observaciones||null},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `);
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/purchase-invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.execute(sql`UPDATE purchase_invoices SET estado = 'anulado' WHERE id = ${id}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // MÓDULO CONTABLE — Órdenes de Pago
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/payment-orders", requireAuth, async (req, res) => {
    try {
      const { supplierId } = req.query;
      let q = sql`
        SELECT po.*, s.razon_social AS supplier_nombre
        FROM payment_orders po
        JOIN accounting_suppliers s ON s.id = po.supplier_id
        WHERE 1=1
      `;
      if (supplierId) {
        const result = await db.execute(sql`
          SELECT po.*, s.razon_social AS supplier_nombre
          FROM payment_orders po JOIN accounting_suppliers s ON s.id = po.supplier_id
          WHERE po.supplier_id = ${parseInt(supplierId as string)}
          ORDER BY po.fecha DESC
        `);
        return res.json(result.rows);
      }
      const result = await db.execute(sql`
        SELECT po.*, s.razon_social AS supplier_nombre
        FROM payment_orders po JOIN accounting_suppliers s ON s.id = po.supplier_id
        ORDER BY po.fecha DESC
      `);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/payment-orders", requireAuth, async (req, res) => {
    try {
      const { supplierId, fecha, facturaIds, retencionIibb, retencionGanancias,
        retencionIva, retencionProfLibs, compensacion, formaPago, depBancario,
        efectivo, cheques, observaciones } = req.body;

      if (!supplierId || !facturaIds?.length) {
        return res.status(400).json({ error: "Proveedor y facturas son requeridos" });
      }

      // Verificar facturas — usar IN con valores sanitizados para evitar "malformed array literal"
      const idsInt = facturaIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
      if (idsInt.length === 0) {
        return res.status(400).json({ error: "IDs de facturas inválidos" });
      }
      const idsSQL = sql.raw(idsInt.join(","));
      const facturasRes = await db.execute(sql`
        SELECT id, monto_total, estado, supplier_id FROM purchase_invoices
        WHERE id IN (${idsSQL}) AND supplier_id = ${supplierId} AND estado = 'pendiente'
      `);
      if (facturasRes.rows.length !== idsInt.length) {
        const idsEncontrados = facturasRes.rows.map((r: any) => Number(r.id));
        const todosRes = await db.execute(sql`SELECT id, estado FROM purchase_invoices WHERE id IN (${idsSQL})`);
        const noEncontradas = idsInt.filter((id: number) => !todosRes.rows.find((r: any) => Number(r.id) === id));
        const noPendientes = todosRes.rows
          .filter((r: any) => r.estado !== "pendiente" && !idsEncontrados.includes(Number(r.id)))
          .map((r: any) => `#${r.id} (${r.estado})`);
        let errorMsg = "No se pudo generar la OP: ";
        if (noEncontradas.length > 0) errorMsg += `Facturas no encontradas: ${noEncontradas.join(", ")}. `;
        if (noPendientes.length > 0) errorMsg += `Facturas no pendientes: ${noPendientes.join(", ")}. `;
        if (noEncontradas.length === 0 && noPendientes.length === 0) errorMsg += `Proveedor no coincide con las facturas seleccionadas (supplierId: ${supplierId}).`;
        return res.status(400).json({ error: errorMsg });
      }

      // Calcular totales
      const totalFacturas = facturasRes.rows.reduce((s: number, r: any) => s + parseFloat(r.monto_total), 0);
      const retIibb = parseFloat(retencionIibb || "0");
      const retGan = parseFloat(retencionGanancias || "0");
      const retIva = parseFloat(retencionIva || "0");
      const retProf = parseFloat(retencionProfLibs || "0");
      const comp = parseFloat(compensacion || "0");
      const totalAbonado = totalFacturas - retIibb - retGan - retIva - retProf - comp;

      // Número de OP autoincremental
      const numRes = await db.execute(sql`
        SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 2) AS INTEGER)), 0) + 1 AS next FROM payment_orders
      `);
      const nextNum = (numRes.rows[0] as any).next as number;
      const numero = `000-${String(nextNum).padStart(8, "0")}`;

      // Insertar OP
      const dep = parseFloat(depBancario || "0");
      const ef = parseFloat(efectivo || "0");
      const ch = parseFloat(cheques || "0");
      const opRes = await db.execute(sql`
        INSERT INTO payment_orders (numero, supplier_id, fecha, forma_pago, dep_bancario, efectivo, cheques, total_facturas, retencion_iibb, retencion_ganancias, retencion_iva, retencion_prof_libs, compensacion, total_abonado, observaciones)
        VALUES (${numero}, ${supplierId}, ${fecha || getArgentinaToday()}, ${formaPago||"transferencia"}, ${dep}, ${ef}, ${ch}, ${totalFacturas}, ${retIibb}, ${retGan}, ${retIva}, ${retProf}, ${comp}, ${totalAbonado}, ${observaciones||null})
        RETURNING *
      `);
      const op = opRes.rows[0] as any;

      // Marcar facturas como pagadas e insertar ítems
      for (const fid of idsInt) {
        const factura = facturasRes.rows.find((r: any) => Number(r.id) === fid) as any;
        await db.execute(sql`UPDATE purchase_invoices SET estado = 'pagado' WHERE id = ${fid}`);
        await db.execute(sql`
          INSERT INTO payment_order_items (payment_order_id, invoice_id, importe_cancelado)
          VALUES (${op.id}, ${fid}, ${parseFloat(factura.monto_total)})
        `);
      }

      // Generar asiento contable
      try {
        const supplier = await db.execute(sql`SELECT razon_social FROM accounting_suppliers WHERE id = ${supplierId}`);
        const entryId = await generarAsientoOP({ ...op, supplier: supplier.rows[0] as any });
        await db.execute(sql`UPDATE payment_orders SET asiento_id = ${entryId} WHERE id = ${op.id}`);
      } catch (ae) { console.error("Error generando asiento OP:", ae); }

      // Insertar retención IIBB si corresponde
      if (retIibb > 0) {
        try {
          const nroRes = await db.execute(sql`SELECT COALESCE(MAX(nro_constancia), 0) + 1 AS next FROM iibb_retentions`);
          const nroConstancia = (nroRes.rows[0] as any).next;
          const sup = await db.execute(sql`SELECT cuit FROM accounting_suppliers WHERE id = ${supplierId}`);
          const cuit = (sup.rows[0] as any)?.cuit || "";
          await db.execute(sql`
            INSERT INTO iibb_retentions (nro_constancia, supplier_id, cuit_proveedor, fecha_retencion, fecha_comprobante, nro_comprobante, importe_base, alicuota, importe_retenido)
            VALUES (${nroConstancia}, ${supplierId}, ${cuit}, ${fecha||getArgentinaToday()}, ${fecha||getArgentinaToday()}, ${nextNum}, ${totalFacturas}, 0, ${retIibb})
          `);
        } catch (re) { console.error("Error inserting iibb_retention for OP:", re); }
      }

      // Retornar OP completa con facturas
      res.status(201).json({ ...op, facturas: facturasRes.rows, numero });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Accounting accounts (plan de cuentas)
  app.get("/api/accounting-accounts", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`SELECT * FROM accounting_accounts WHERE activo = true ORDER BY codigo`);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Event PDF endpoints ────────────────────────────────────────────────────
  app.get("/api/events/:id/pdf/hoja-funcion", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento no encontrado" });
      const pdfBuffer = await generateHojaFuncionPdf(event);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="HojaFuncion_${event.eventCode}.pdf"`);
      res.end(pdfBuffer);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/events/:id/pdf/confirmacion", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento no encontrado" });
      const pdfBuffer = await generateConfirmacionEventoPdf(event);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Confirmacion_${event.eventCode}.pdf"`);
      res.end(pdfBuffer);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== TABLERO OPERATIVO ====================
  app.get("/api/operaciones/resumen", requireAuth, async (req, res) => {
    try {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      // 1. Check-ins del día
      const checkInsHoy = await db
        .select({
          id: reservations.id,
          reservationCode: reservations.reservationCode,
          checkInDate: reservations.checkInDate,
          checkOutDate: reservations.checkOutDate,
          status: reservations.status,
          roomId: reservations.roomId,
          guestId: reservations.guestId,
        })
        .from(reservations)
        .where(and(
          eq(reservations.checkInDate, today),
          inArray(reservations.status, ["confirmed", "pending", "tentative"] as any)
        ));

      // 2. Check-outs del día
      const checkOutsHoy = await db
        .select({
          id: reservations.id,
          reservationCode: reservations.reservationCode,
          checkInDate: reservations.checkInDate,
          checkOutDate: reservations.checkOutDate,
          status: reservations.status,
          roomId: reservations.roomId,
          guestId: reservations.guestId,
        })
        .from(reservations)
        .where(and(
          eq(reservations.checkOutDate, today),
          eq(reservations.status, "checked_in")
        ));

      // 3. Folios con saldo — query única optimizada con JOIN
      const foliosRaw = await db.execute(sql`
        SELECT
          r.id AS "reservationId",
          r.reservation_code AS "reservationCode",
          r.room_id AS "roomId",
          r.guest_id AS "guestId",
          COALESCE(SUM(CASE WHEN c.status = 'active' THEN c.amount::numeric ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN p.status = 'active' THEN p.amount::numeric ELSE 0 END), 0) AS balance
        FROM reservations r
        LEFT JOIN charges c ON c.reservation_id = r.id
        LEFT JOIN payments p ON p.reservation_id = r.id
        WHERE r.status = 'checked_in'
        GROUP BY r.id, r.reservation_code, r.room_id, r.guest_id
        HAVING (
          COALESCE(SUM(CASE WHEN c.status = 'active' THEN c.amount::numeric ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN p.status = 'active' THEN p.amount::numeric ELSE 0 END), 0)
        ) > 0.01
        ORDER BY balance DESC
      `);
      const foliosConSaldo = (foliosRaw.rows as any[]).map(r => ({
        ...r,
        balance: Math.round(Number(r.balance) * 100) / 100,
      }));

      // 4. Cajas abiertas
      const cajasAbiertas = await db
        .select({
          id: cashShifts.id,
          area: cashShifts.area,
          shiftNumber: cashShifts.shiftNumber,
          openedBy: cashShifts.openedBy,
          openedAt: cashShifts.openedAt,
          autoCreado: cashShifts.autoCreado,
        })
        .from(cashShifts)
        .where(eq(cashShifts.status, "open"));

      // 5. Habitaciones sucias
      const habitacionesSucias = await db
        .select({ id: rooms.id, roomNumber: rooms.roomNumber, floor: rooms.floor })
        .from(rooms)
        .where(eq(rooms.status, "dirty"));

      // 6. Tareas de housekeeping de hoy
      const tareasHoy = await db
        .select({ id: housekeepingTasks.id, status: housekeepingTasks.status })
        .from(housekeepingTasks)
        .where(eq(housekeepingTasks.scheduledDate, today));

      const tareasPendientes = tareasHoy.filter(t => t.status === "pending").length;
      const tareasEnProceso = tareasHoy.filter(t => t.status === "in_progress").length;
      const tareasCompletadas = tareasHoy.filter(t => t.status === "completed" || t.status === "verified").length;

      // 7. Incidencias abiertas
      let incidenciasAbiertas = 0;
      let incidenciasCriticas = 0;
      try {
        const incidents = await db
          .select({ severity: systemIncidents.severity, status: systemIncidents.status })
          .from(systemIncidents)
          .where(inArray(systemIncidents.status, ["pendiente", "en_revision"] as any));
        incidenciasAbiertas = incidents.length;
        incidenciasCriticas = incidents.filter(i => i.severity === "critica").length;
      } catch { /* tabla puede no existir */ }

      // 8. Recaudación del día por área — única query con filtro de fecha
      const movimientosHoy = await db.execute(sql`
        SELECT area, amount, movement_type
        FROM cash_movements
        WHERE
          DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = ${today}::date
          AND anulado = false
      `);
      const recaudacionPorArea: Record<string, number> = {};
      for (const mov of movimientosHoy.rows as any[]) {
        if (!recaudacionPorArea[mov.area]) recaudacionPorArea[mov.area] = 0;
        const amt = parseFloat(mov.amount);
        recaudacionPorArea[mov.area] += mov.movement_type === "income" ? amt : -amt;
      }
      const totalRecaudado = Object.values(recaudacionPorArea).reduce((s, v) => s + v, 0);

      // 9. Eventos del día (startDate <= hoy <= endDate, no cancelados)
      const eventosHoy = await db
        .select({
          id: eventsTable.id,
          eventCode: eventsTable.eventCode,
          name: eventsTable.name,
          eventType: eventsTable.eventType,
          contactName: eventsTable.contactName,
          attendees: eventsTable.attendees,
          startDate: eventsTable.startDate,
          endDate: eventsTable.endDate,
          startTime: eventsTable.startTime,
          endTime: eventsTable.endTime,
          status: eventsTable.status,
          eventRoomId: eventsTable.eventRoomId,
        })
        .from(eventsTable)
        .where(
          and(
            lte(eventsTable.startDate, today),
            gte(eventsTable.endDate, today),
            ne(eventsTable.status, "cancelled" as any)
          )
        )
        .orderBy(asc(eventsTable.startTime));

      res.json({
        fecha: today,
        checkIns: { total: checkInsHoy.length, reservas: checkInsHoy },
        checkOuts: { total: checkOutsHoy.length, reservas: checkOutsHoy },
        foliosConSaldo: { total: foliosConSaldo.length, items: foliosConSaldo },
        cajas: {
          abiertas: cajasAbiertas.length,
          detalle: cajasAbiertas,
          recaudacionPorArea,
          totalRecaudado: Math.round(totalRecaudado * 100) / 100,
        },
        housekeeping: {
          habitacionesSucias: habitacionesSucias.length,
          tareasPendientes,
          tareasEnProceso,
          tareasCompletadas,
          totalTareas: tareasHoy.length,
        },
        incidencias: { abiertas: incidenciasAbiertas, criticas: incidenciasCriticas },
        eventos: { total: eventosHoy.length, items: eventosHoy },
      });
    } catch (error) {
      console.error("Error en tablero operativo:", error);
      res.status(500).json({ error: "Error generando resumen operativo" });
    }
  });

  // ==================== SYSTEM INCIDENTS ====================
  // IMPORTANT: /stats must be registered BEFORE /:id to avoid Express matching "stats" as an ID
  app.get("/api/incidents/stats", requireAuth, async (req, res) => {
    try {
      const all = await db.select().from(systemIncidents);
      res.json({
        total: all.length,
        pendiente: all.filter(i => i.status === "pendiente").length,
        en_revision: all.filter(i => i.status === "en_revision").length,
        resuelto: all.filter(i => i.status === "resuelto").length,
        criticos: all.filter(i => i.severity === "critica" && i.status !== "resuelto" && i.status !== "descartado").length,
        altos: all.filter(i => i.severity === "alta" && i.status !== "resuelto" && i.status !== "descartado").length,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching incident stats" });
    }
  });

  app.get("/api/incidents", requireAuth, async (req, res) => {
    try {
      const { status, severity, module } = req.query;
      const conditions = [];
      if (status && status !== "all") conditions.push(eq(systemIncidents.status, status as string));
      if (severity && severity !== "all") conditions.push(eq(systemIncidents.severity, severity as string));
      if (module && module !== "all") conditions.push(eq(systemIncidents.module, module as string));
      const incidents = await db
        .select()
        .from(systemIncidents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(systemIncidents.reportedAt));
      res.json(incidents);
    } catch (error) {
      res.status(500).json({ error: "Error fetching incidents" });
    }
  });

  app.post("/api/incidents", requireAuth, async (req, res) => {
    try {
      const { title, description, module, severity, reportedBy, screenshotUrl } = req.body;
      if (!title || !description || !reportedBy) {
        return res.status(400).json({ error: "Título, descripción y quien reporta son requeridos" });
      }
      const [incident] = await db.insert(systemIncidents).values({
        title, description,
        module: module || "otro",
        severity: severity || "media",
        status: "pendiente",
        reportedBy,
        reportedAt: new Date(),
        screenshotUrl: screenshotUrl || null,
      }).returning();
      res.status(201).json(incident);
    } catch (error) {
      res.status(500).json({ error: "Error creating incident" });
    }
  });

  app.patch("/api/incidents/:id", requireAuth, async (req, res) => {
    try {
      const { status, assignedTo, resolvedBy, resolutionNotes } = req.body;
      const updateData: any = { updatedAt: new Date() };
      if (status) updateData.status = status;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      if (resolvedBy) updateData.resolvedBy = resolvedBy;
      if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes;
      if (status === "resuelto" || status === "descartado") updateData.resolvedAt = new Date();
      const [updated] = await db.update(systemIncidents).set(updateData)
        .where(eq(systemIncidents.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Incidente no encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating incident" });
    }
  });

  app.delete("/api/incidents/:id", requireRole(["admin"]), async (req, res) => {
    try {
      await db.delete(systemIncidents).where(eq(systemIncidents.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting incident" });
    }
  });

  registerMaintenanceRoutes(app);
  registerFolioRoutes(app);
  registerPublicBookingRoutes(app);
  registerEmailRoutes(app);
  registerGuestsRoutes(app);
  registerReservationsRoutes(app);
  registerGroupsRoutes(app);
  registerHousekeepingRoutes(app);
  registerRestaurantRoutes(app);
  registerInventoryRoutes(app);
  registerSpaRoutes(app);
  registerEventsRoutes(app);
  registerPresupuestosRoutes(app);
  registerRoomsRoutes(app);
  registerHospitalityRoutes(app);
  registerOtaRoutes(app);
  registerPlanningRoutes(app);
  registerPackagesRoutes(app);
  registerExportRoutes(app);
  registerAdminCashRoutes(app);
  registerBillingRoutes(app);
  registerReportsRoutes(app);

  // ==================== NIGHT AUDIT ====================
  app.post("/api/night-audit/run", requireAuth, async (req, res) => {
    try {
      const { runNightAudit, nightAuditAlreadyRan } = await import("./night-audit");
      const { forceDate, force } = req.body;
      const userName = (req.user as any)?.fullName || (req.user as any)?.username || "manual";
      const targetDate = forceDate ||
        new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const alreadyRan = await nightAuditAlreadyRan(targetDate);
      if (alreadyRan && !force) {
        return res.status(409).json({
          error: "El night audit ya se ejecutó para esta fecha",
          alreadyRan: true,
        });
      }
      const result = await runNightAudit({ executedBy: userName, isManual: true, forceDate });
      if (result.success) {
        res.json(result.data);
      } else {
        res.status(500).json({ error: result.message });
      }
    } catch (error: any) {
      res.status(500).json({ error: "Error ejecutando night audit: " + error.message });
    }
  });

  app.get("/api/night-audit/history", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string || "30");
      const history = await db
        .select()
        .from(nightAuditLogs)
        .orderBy(desc(nightAuditLogs.executedAt))
        .limit(limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Error fetching night audit history" });
    }
  });

  app.get("/api/night-audit/status", requireAuth, async (req, res) => {
    try {
      const { nightAuditAlreadyRan } = await import("./night-audit");
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const [lastAudit] = await db
        .select()
        .from(nightAuditLogs)
        .orderBy(desc(nightAuditLogs.executedAt))
        .limit(1);
      const todayRan = await nightAuditAlreadyRan(today);
      const yesterdayRan = await nightAuditAlreadyRan(yesterday);
      res.json({
        today,
        yesterday,
        lastAudit: lastAudit || null,
        todayRan,
        yesterdayRan,
        nextScheduled: "00:05 hora Argentina",
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching night audit status" });
    }
  });

  return httpServer;
}
