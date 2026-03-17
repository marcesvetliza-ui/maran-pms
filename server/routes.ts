import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import passport from "passport";
import { storage, getArgentinaToday } from "./db-storage";
import { insertGuestReviewSchema, reservationChangelog, reservations, guests, housekeepingTasks } from "@shared/schema";
import { charges, payments, spaPayments, eventPayments, cashMovements, cashShifts } from "@shared/schema";
import { requireAuth, requireRole, hashPassword } from "./auth";
import { db } from "./db";
import { systemUsers, spaProfessionals, spaClients } from "@shared/schema";
import { eq, sql, desc, asc, gte, lte, and } from "drizzle-orm";
import { HELP_MANUAL } from "./help-manual";
import { generarAsiento, generarAsientoOP } from "./accounting";
import { registerExportRoutes } from "./exports";
import { registerAdminCashRoutes } from "./adminCash";
import { registerBillingRoutes } from "./billing/routes";
import { registerReportsRoutes } from "./reports/routes";
import { generateHojaFuncionPdf, generateConfirmacionEventoPdf } from "./eventPdfs";

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
      req.logIn(user, (err) => {
        if (err) return next(err);
        return res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
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
    
    if (req.path.startsWith("/api/public/")) {
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

  // Agencies
  app.get("/api/agencies", async (req, res) => {
    try {
      const agencies = await storage.getAgencies();
      res.json(agencies);
    } catch (error) {
      res.status(500).json({ error: "Error fetching agencies" });
    }
  });

  app.get("/api/agencies/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const agencies = await storage.searchAgencies(query);
      res.json(agencies);
    } catch (error) {
      res.status(500).json({ error: "Error searching agencies" });
    }
  });

  app.get("/api/agencies/report", async (req, res) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      const allAgencies = await storage.getAgencies();
      const allReservations = await storage.getReservations();

      const report = allAgencies.map(agency => {
        let agencyReservations = allReservations.filter(r => r.agencyId === agency.id);
        if (from) agencyReservations = agencyReservations.filter(r => r.checkInDate >= from);
        if (to) agencyReservations = agencyReservations.filter(r => r.checkOutDate <= to);

        const totalRevenue = agencyReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);
        const commissionRate = parseFloat(agency.commissionRate || "0");
        const totalCommission = totalRevenue * (commissionRate / 100);

        return {
          agency,
          totalReservations: agencyReservations.length,
          totalRevenue,
          commissionRate,
          totalCommission,
          totalNights: agencyReservations.reduce((sum, r) => sum + (r.nights || 0), 0),
        };
      });

      res.json(report);
    } catch (error) {
      res.status(500).json({ error: "Error generating agency report" });
    }
  });

  app.get("/api/agencies/:id/stats", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      const allReservations = await storage.getReservations();
      const agencyReservations = allReservations.filter(r => r.agencyId === agency.id);
      const totalRevenue = agencyReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);
      const commissionRate = parseFloat(agency.commissionRate || "0");
      const totalCommission = totalRevenue * (commissionRate / 100);

      res.json({
        totalReservations: agencyReservations.length,
        totalRevenue,
        commissionRate,
        totalCommission,
        totalNights: agencyReservations.reduce((sum, r) => sum + (r.nights || 0), 0),
        activeReservations: agencyReservations.filter(r => ["confirmed", "checked_in", "pending"].includes(r.status)).length,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching agency stats" });
    }
  });

  app.get("/api/agencies/:id", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error fetching agency" });
    }
  });

  app.post("/api/agencies", async (req, res) => {
    try {
      const agency = await storage.createAgency(req.body);
      res.status(201).json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error creating agency" });
    }
  });

  app.patch("/api/agencies/:id", async (req, res) => {
    try {
      const agency = await storage.updateAgency(req.params.id, req.body);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error updating agency" });
    }
  });

  app.delete("/api/agencies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAgency(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting agency" });
    }
  });

  // Account Movements (Cuenta Corriente)
  app.get("/api/companies/:id/account", async (req, res) => {
    try {
      const movements = await storage.getAccountMovements("company", req.params.id);
      const balance = await storage.getAccountBalance("company", req.params.id);
      res.json({ movements, balance });
    } catch (error) {
      res.status(500).json({ error: "Error fetching account" });
    }
  });

  app.get("/api/agencies/:id/account", async (req, res) => {
    try {
      const movements = await storage.getAccountMovements("agency", req.params.id);
      const balance = await storage.getAccountBalance("agency", req.params.id);
      res.json({ movements, balance });
    } catch (error) {
      res.status(500).json({ error: "Error fetching account" });
    }
  });

  app.post("/api/companies/:id/account/payment", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Empresa no encontrada" });
      }
      const { amount, description, reference, date } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Monto inválido" });
      }
      const movement = await storage.createAccountMovement({
        entityType: "company",
        entityId: req.params.id,
        date: date || new Date().toISOString().split("T")[0],
        type: "pago",
        description: description || "Pago recibido",
        amount: (-parseFloat(amount)).toFixed(2),
        reference: reference || null,
        createdBy: req.body.createdBy || null,
      });
      res.json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error registering payment" });
    }
  });

  app.post("/api/agencies/:id/account/payment", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agencia no encontrada" });
      }
      const { amount, description, reference, date } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Monto inválido" });
      }
      const movement = await storage.createAccountMovement({
        entityType: "agency",
        entityId: req.params.id,
        date: date || new Date().toISOString().split("T")[0],
        type: "pago",
        description: description || "Pago recibido",
        amount: (-parseFloat(amount)).toFixed(2),
        reference: reference || null,
        createdBy: req.body.createdBy || null,
      });
      res.json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error registering payment" });
    }
  });

  app.get("/api/account-summary", async (req, res) => {
    try {
      const summary = await storage.getAccountSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Error fetching summary" });
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

  // Bed Types
  app.get("/api/bed-types", async (req, res) => {
    try {
      const bedTypes = await storage.getBedTypes();
      res.json(bedTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching bed types" });
    }
  });

  app.post("/api/bed-types", async (req, res) => {
    try {
      const bedType = await storage.createBedType(req.body);
      res.status(201).json(bedType);
    } catch (error) {
      res.status(500).json({ error: "Error creating bed type" });
    }
  });

  app.patch("/api/bed-types/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const bedType = await storage.updateBedType(id, req.body);
      if (!bedType) {
        return res.status(404).json({ error: "Bed type not found" });
      }
      res.json(bedType);
    } catch (error) {
      res.status(500).json({ error: "Error updating bed type" });
    }
  });

  app.delete("/api/bed-types/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await storage.deleteBedType(id);
      if (!result) {
        return res.status(404).json({ error: "Bed type not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting bed type" });
    }
  });

  // Reservations
  app.get("/api/reservations", async (req, res) => {
    try {
      const { dateFrom, dateTo, dateMode } = req.query;
      const reservations = await storage.getReservations({
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        dateMode: dateMode as string | undefined,
      });
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

  app.get("/api/reservations/generate-code", async (req, res) => {
    try {
      const code = storage.generateReservationCode();
      res.json({ code });
    } catch (error) {
      res.status(500).json({ error: "Error generating reservation code" });
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
        if (req.body[field] === "" || req.body[field] === undefined) {
          req.body[field] = null;
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
      console.error("Error creating reservation:", error?.message || error);
      res.status(500).json({ error: "Error creating reservation" });
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

      // Fix 3: Protección — ignorar campos críticos vacíos para no sobreescribir en DB
      if (!req.body.roomId || req.body.roomId === "") delete req.body.roomId;
      if (!req.body.roomTypeId || req.body.roomTypeId === "") delete req.body.roomTypeId;
      if (!req.body.guestId || req.body.guestId === "") delete req.body.guestId;

      const numericFields = ["baseRatePerNight", "finalRatePerNight", "totalRoomAmount", "discountValue", "earlyCheckInCharge", "lateCheckOutCharge"];
      for (const field of numericFields) {
        if (req.body[field] === "" || req.body[field] === undefined) {
          req.body[field] = null;
        }
      }
      const nullableStringFields = ["ratePlanId", "companyId", "bedTypeId", "bedTypeNotes", "earlyCheckInTime", "lateCheckOutTime", "notes", "otaChannelId", "externalReservationId"];
      for (const field of nullableStringFields) {
        if (req.body[field] === "") {
          req.body[field] = null;
        }
      }

      const finalRoomId = req.body.roomId || existing.roomId;
      const finalCheckIn = req.body.checkInDate || existing.checkInDate;
      const finalCheckOut = req.body.checkOutDate || existing.checkOutDate;
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

      // Detectar cambios para el changelog
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
      if (req.body.roomId && req.body.roomId !== existing.roomId) {
        const oldRoom = await storage.getRoom(existing.roomId);
        const newRoom = await storage.getRoom(req.body.roomId);
        cambios.push({ tipo: "habitacion", descripcion: `Habitación cambiada: ${oldRoom?.roomNumber || existing.roomId} → ${newRoom?.roomNumber || req.body.roomId}` });
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

      // Guardar changelog
      if (cambios.length > 0) {
        const operador = (req as any).user?.fullName || (req as any).user?.username || "Sistema";
        for (const cambio of cambios) {
          await db.insert(reservationChangelog).values({
            reservationId: req.params.id,
            operador,
            tipo: cambio.tipo,
            descripcion: cambio.descripcion,
          });
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
        createdAt: new Date(),
        lastModifiedBy: null,
      });
      
      res.status(201).json(duplicated);
    } catch (error) {
      res.status(500).json({ error: "Error duplicating reservation" });
    }
  });

  app.delete("/api/reservations/:id", async (req, res) => {
    try {
      const existing = await storage.getReservation(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      if (isReservationLocked(existing)) {
        return res.status(403).json({ error: "No se puede eliminar una reserva cerrada de días anteriores" });
      }
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

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const checkInDate = reservation.checkInDate;
      const todayMs = new Date(today + "T12:00:00").getTime();
      const ciMs = new Date(checkInDate + "T12:00:00").getTime();
      const diffDays = Math.round((ciMs - todayMs) / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        return res.status(400).json({ error: `No se puede hacer check-in en fecha futura. La reserva es para el ${checkInDate} y hoy es ${today}.` });
      }

      if (diffDays < -1) {
        const { motivo } = req.body || {};
        if (!motivo || String(motivo).trim() === "") {
          return res.status(400).json({
            error: "CHECK_IN_RETROACTIVO",
            message: `La fecha de check-in es ${checkInDate}. Para registrar con fecha pasada, ingrese un motivo.`,
            requiresMotivo: true,
          });
        }
        await db.insert(reservationChangelog).values({
          reservationId: req.params.id,
          fecha: new Date(),
          operador: (req as any).user?.username || "sistema",
          tipo: "checkin_retroactivo",
          descripcion: `Check-in retroactivo registrado el ${today} para fecha ${checkInDate}. Motivo: ${String(motivo).trim()}`,
        });
      }
      
      const room = await storage.getRoom(reservation.roomId);
      if (!room) {
        return res.status(400).json({ error: "Habitación no encontrada" });
      }
      
      const blockedStatuses = ["occupied", "maintenance", "oos"];
      if (blockedStatuses.includes(room.status)) {
        const statusMessages: Record<string, string> = {
          occupied: "La habitación está ocupada por otro huésped",
          maintenance: "La habitación está en mantenimiento",
          oos: "La habitación está fuera de servicio",
        };
        const message = statusMessages[room.status] || `La habitación no está disponible (estado: ${room.status})`;
        return res.status(400).json({ error: message });
      }
      
      // Update reservation status
      await storage.updateReservation(req.params.id, { status: "checked_in" });
      
      // Update room status to occupied
      await storage.updateRoom(reservation.roomId, { status: "occupied" });
      
      // Generate hospitality alerts from guest preferences
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
      const payments = await storage.getPayments(req.params.id);
      const totalCharges = charges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
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
        charges,
        totalCharges,
        payments,
        totalPayments,
        grandTotal,
        balance,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching folio" });
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
      // Convert back to UTC for DB comparison
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

  // Check-out endpoint
  app.post("/api/reservations/:id/check-out", async (req, res) => {
    try {
      const reservation = await storage.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      
      if (reservation.status !== "checked_in") {
        return res.status(400).json({ error: "Solo se puede hacer check-out de reservas con estado checked_in" });
      }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const checkOutDate = reservation.checkOutDate;
      const todayMs = new Date(today + "T12:00:00").getTime();
      const coMs = new Date(checkOutDate + "T12:00:00").getTime();
      const diffDays = Math.round((coMs - todayMs) / (1000 * 60 * 60 * 24));
      if (diffDays > 1 || diffDays < -1) {
        return res.status(400).json({ error: `No se puede hacer check-out: la fecha de salida es ${checkOutDate} y hoy es ${today}` });
      }

      // Get balance - if forceCheckout is true, skip balance check
      const forceCheckout = req.body.forceCheckout === true;
      if (!forceCheckout) {
        const chargesTotal = await storage.getChargesTotal(req.params.id);
        const paymentsTotal = await storage.getPaymentsTotal(req.params.id);
        const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
        const balance = roomTotal + chargesTotal - paymentsTotal;
        
        if (balance > 0.01) {
          return res.status(400).json({ 
            error: "Saldo pendiente",
            message: `La reserva tiene un saldo pendiente de $${balance.toFixed(2)}. Liquide antes de hacer check-out.`,
            balance
          });
        }
      }
      
      // Check for cuenta_corriente payments and create account movement
      const reservationPayments = await storage.getPayments(req.params.id);
      const ccPayments = reservationPayments.filter(p => p.method === "cuenta_corriente");
      if (ccPayments.length > 0) {
        const guest = reservation.guest;
        const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Huésped";
        const roomNum = reservation.room?.roomNumber || reservation.roomId;
        for (const ccPayment of ccPayments) {
          if (ccPayment.billingTarget === "company" && reservation.companyId) {
            await storage.createAccountMovement({
              entityType: "company",
              entityId: reservation.companyId,
              date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
              type: "cargo",
              description: `Estadía ${reservation.reservationCode} — Hab. ${roomNum}`,
              amount: parseFloat(ccPayment.amount).toFixed(2),
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
              amount: parseFloat(ccPayment.amount).toFixed(2),
              reservationId: reservation.id,
              reservationCode: reservation.reservationCode,
              guestName,
            });
          }
        }
      }

      // Update reservation status
      await storage.updateReservation(req.params.id, { status: "checked_out" });
      
      await storage.updateRoom(reservation.roomId, { status: "dirty" });
      
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
      if (isReservationLocked(reservation)) {
        return res.status(403).json({ error: "No se puede anular una reserva cerrada de días anteriores" });
      }
      
      // Log the cancellation
      await storage.createCancelledReservationLog({
        reservationCode: reservation.reservationCode,
        guestName: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
        roomNumber: reservation.room?.roomNumber || "",
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        cancellationDate: new Date(),
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
      const deleted = await storage.deleteCharge(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting charge" });
    }
  });

  // Transfer charge to another reservation
  app.post("/api/charges/:id/transfer", async (req, res) => {
    try {
      const { targetReservationId } = req.body;
      
      // Validate input - only targetReservationId is accepted
      if (!targetReservationId || typeof targetReservationId !== "string") {
        return res.status(400).json({ error: "Target reservation ID is required" });
      }
      
      // Verify the charge exists
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
      
      // Prevent transferring to same reservation
      if (charge.reservationId === targetReservationId) {
        return res.status(400).json({ error: "Cannot transfer to the same reservation" });
      }
      
      // Verify the target reservation exists and is in transferable state
      const targetReservation = await storage.getReservation(targetReservationId);
      if (!targetReservation) {
        return res.status(404).json({ error: "Target reservation not found" });
      }
      
      // Only allow transfer to active reservations (checked_in or confirmed)
      if (targetReservation.status !== "checked_in" && targetReservation.status !== "confirmed") {
        return res.status(400).json({ error: "Target reservation must be active (checked-in or confirmed)" });
      }
      
      // Update ONLY the reservationId field - explicitly whitelist
      const updatedCharge = await storage.updateCharge(req.params.id, {
        reservationId: targetReservationId,
      });
      
      res.json(updatedCharge);
    } catch (error) {
      res.status(500).json({ error: "Error transferring charge" });
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
      if (req.body.billingTarget && !["guest", "company"].includes(req.body.billingTarget)) {
        req.body.billingTarget = "guest";
      }
      if (!req.body.date) {
        const now = new Date();
        req.body.date = now.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      }
      const payment = await storage.createPayment(req.body);

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
          ? `Reserva ${reservation.reservationCode} - Pago ${rawMethod}`
          : `Pago manual - ${req.body.description || "Sin descripción"}`;
        await storage.registerCashMovement(
          "reception", "reservation", req.body.reservationId || null, label,
          cashMethod, String(req.body.amount), "income",
          undefined, req.body.receiptType
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

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
      if (pay.reservation_id) {
        const reservation = await storage.getReservation(pay.reservation_id);
        if (reservation && isReservationLocked(reservation)) {
          return res.status(403).json({ error: "No se puede anular pagos de una reserva cerrada" });
        }
      }
      const updated = await db.execute(sql`
        UPDATE payments SET status = 'anulado', anulado_por = ${anuladoPor || null},
        motivo_anulacion = ${motivoAnulacion}, anulado_at = NOW()
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
        createdAt: new Date(),
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
        createdAt: new Date(),
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
        createdAt: new Date(),
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
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color } = req.body;
      
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
        eventSalon: eventSalon || null,
        eventTime: eventTime || null,
        checkInDate,
        checkOutDate,
        status: status || "tentative",
        releaseDate: releaseDate || null,
        notes: notes || null,
        color: color || "#6366f1",
        createdAt: new Date(),
        createdBy: null,
      });
      res.status(201).json(group);
    } catch (error) {
      res.status(500).json({ error: "Error creating group" });
    }
  });

  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color } = req.body;
      const nullIfEmpty = (v: any) => (v === "" || v === null || v === undefined) ? null : v;
      const updateData: Record<string, unknown> = {};
      
      if (name !== undefined) updateData.name = name;
      if (contactName !== undefined) updateData.contactName = nullIfEmpty(contactName);
      if (contactPhone !== undefined) updateData.contactPhone = nullIfEmpty(contactPhone);
      if (contactEmail !== undefined) updateData.contactEmail = nullIfEmpty(contactEmail);
      if (eventDate !== undefined) updateData.eventDate = nullIfEmpty(eventDate);
      if (eventSalon !== undefined) updateData.eventSalon = nullIfEmpty(eventSalon);
      if (eventTime !== undefined) updateData.eventTime = nullIfEmpty(eventTime);
      if (checkInDate !== undefined) updateData.checkInDate = checkInDate;
      if (checkOutDate !== undefined) updateData.checkOutDate = checkOutDate;
      if (status !== undefined) updateData.status = status;
      if (releaseDate !== undefined) updateData.releaseDate = nullIfEmpty(releaseDate);
      if (notes !== undefined) updateData.notes = nullIfEmpty(notes);
      if (color !== undefined) updateData.color = color;

      const group = await storage.updateGroup(req.params.id, updateData);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error: any) {
      console.error("Error updating group:", error?.message || error);
      res.status(500).json({ error: "Error updating group", detail: error?.message });
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
      if (!roomId || !guestFirstName) {
        return res.status(400).json({ error: "Room ID and guest first name are required" });
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

  // Group Mass Actions - Check-in all group reservations
  app.post("/api/groups/:groupId/check-in-all", requireAuth, async (req, res) => {
    try {
      const result = await storage.bulkCheckIn(req.params.groupId);
      res.json({ success: result.processed, failed: result.skipped, errors: result.skippedRooms.map(r => `Hab. ${r}: no disponible para check-in`) });
    } catch (error) {
      res.status(500).json({ error: "Error en check-in grupal" });
    }
  });

  app.post("/api/groups/:groupId/check-out-all", requireAuth, async (req, res) => {
    try {
      const result = await storage.bulkCheckOut(req.params.groupId);
      res.json({ success: result.processed, failed: result.skipped, errors: result.pendingBalance.map(p => `Hab. ${p.room}: saldo pendiente $${p.balance.toFixed(2)}`) });
    } catch (error) {
      res.status(500).json({ error: "Error en check-out grupal" });
    }
  });

  // Group Invoice - Get consolidated invoice data for the group
  app.get("/api/groups/:groupId/invoice", async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const invoiceData = {
        group: {
          code: group.groupCode,
          name: group.name,
          contactName: group.contactName,
          contactPhone: group.contactPhone,
          contactEmail: group.contactEmail,
          checkInDate: group.checkInDate,
          checkOutDate: group.checkOutDate,
        },
        reservations: [] as any[],
        totals: {
          accommodation: 0,
          charges: 0,
          payments: 0,
          balance: 0,
        }
      };

      for (const reservation of group.reservations) {
        const charges = await storage.getCharges(reservation.id);
        const payments = await storage.getPayments(reservation.id);
        
        // Calculate nights and accommodation cost
        const checkIn = new Date(reservation.checkInDate);
        const checkOut = new Date(reservation.checkOutDate);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        const rate = parseFloat(reservation.finalRatePerNight || reservation.baseRatePerNight || "0");
        const accommodationTotal = nights * rate;
        
        const chargesTotal = charges.reduce((sum: number, c) => sum + parseFloat(c.amount), 0);
        const paymentsTotal = payments.reduce((sum: number, p) => sum + parseFloat(p.amount), 0);
        const totalCost = accommodationTotal + chargesTotal;

        invoiceData.reservations.push({
          reservationCode: reservation.reservationCode,
          guest: `${reservation.guest?.firstName} ${reservation.guest?.lastName}`,
          room: reservation.room?.roomNumber,
          nights,
          ratePerNight: rate,
          accommodationTotal,
          charges: charges.map(c => ({
            description: c.description,
            amount: parseFloat(c.amount),
            category: c.category,
            date: c.date,
          })),
          chargesTotal,
          payments: payments.map(p => ({
            method: p.method,
            amount: parseFloat(p.amount),
            date: p.date,
            reference: p.reference,
          })),
          paymentsTotal,
          balance: totalCost - paymentsTotal,
        });

        invoiceData.totals.accommodation += accommodationTotal;
        invoiceData.totals.charges += chargesTotal;
        invoiceData.totals.payments += paymentsTotal;
      }

      invoiceData.totals.balance = invoiceData.totals.accommodation + invoiceData.totals.charges - invoiceData.totals.payments;

      res.json(invoiceData);
    } catch (error) {
      res.status(500).json({ error: "Error generating group invoice" });
    }
  });

  app.post("/api/groups/:groupId/payment", async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const { amount, method, reference, receiptType, distribution, closeAllRooms } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }

      const totalAmount = parseFloat(amount);
      if (totalAmount <= 0) {
        return res.status(400).json({ error: "Amount must be positive" });
      }

      const activeReservations = group.reservations.filter(
        r => r.status === "confirmed" || r.status === "checked_in"
      );

      if (activeReservations.length === 0) {
        return res.status(400).json({ error: "No hay reservas activas (confirmadas o en casa) para registrar pagos" });
      }

      const today = getArgentinaToday();
      const refText = reference || `Pago grupal${closeAllRooms ? " (cierre total)" : ""} - ${group.name}`;

      // Calcular la diferencia de saldo cuando se cierra el grupo
      let balanceDiff = 0;
      if (closeAllRooms) {
        let totalGroupDebt = 0;
        for (const reservation of activeReservations) {
          const chargesTotal = await storage.getChargesTotal(reservation.id);
          const paymentsTotal = await storage.getPaymentsTotal(reservation.id);
          const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
          totalGroupDebt += roomTotal + chargesTotal - paymentsTotal;
        }
        balanceDiff = totalAmount - totalGroupDebt;
      }

      if (distribution === "proportional") {
        let totalCost = 0;
        const costs: { id: string; cost: number; balance: number }[] = [];
        for (const reservation of activeReservations) {
          const chargesTotal = await storage.getChargesTotal(reservation.id);
          const paymentsTotal = await storage.getPaymentsTotal(reservation.id);
          const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
          const balance = roomTotal + chargesTotal - paymentsTotal;
          const cost = roomTotal + chargesTotal;
          costs.push({ id: reservation.id, cost, balance });
          totalCost += cost;
        }
        for (const item of costs) {
          let paymentAmt: number;
          if (closeAllRooms) {
            // Pagar exactamente el saldo pendiente de cada habitación
            paymentAmt = Math.max(0, item.balance);
          } else {
            const proportion = totalCost > 0 ? item.cost / totalCost : 1 / costs.length;
            paymentAmt = totalAmount * proportion;
          }
          if (paymentAmt > 0.001) {
            await storage.createPayment({
              reservationId: item.id,
              amount: paymentAmt.toFixed(2),
              method,
              reference: refText,
              date: today,
            });
          }
        }
      } else {
        // equal (o cualquier otro): dividir en partes iguales
        const perRoom = totalAmount / activeReservations.length;
        for (const reservation of activeReservations) {
          await storage.createPayment({
            reservationId: reservation.id,
            amount: perRoom.toFixed(2),
            method,
            reference: refText,
            date: today,
          });
        }
      }

      // Si closeAllRooms: hacer check-out de todas las reservas checked_in
      let checkoutCount = 0;
      if (closeAllRooms) {
        for (const reservation of activeReservations) {
          if (reservation.status !== "checked_in") continue;

          await db.insert(reservationChangelog).values({
            reservationId: reservation.id,
            fecha: new Date(),
            operador: (req as any).user?.username || "sistema",
            tipo: "checkout_grupal",
            descripcion: `Check-out grupal con pago centralizado. Grupo: ${group.name}. Monto total: $${totalAmount.toFixed(2)}.`,
          });

          await storage.updateReservation(reservation.id, { status: "checked_out" });
          await storage.updateRoom(reservation.roomId, { status: "dirty" });

          try {
            await db.insert(housekeepingTasks).values({
              id: randomUUID(),
              roomId: reservation.roomId,
              type: "checkout_clean",
              priority: "high",
              status: "pending",
              notes: `Check-out grupal (pago centralizado) — ${group.name}`,
              createdAt: new Date(),
            } as any);
          } catch {}

          checkoutCount++;
        }

        // Si todas las reservas están cerradas, marcar el grupo como finished
        const updatedGroup = await storage.getGroup(req.params.groupId);
        if (updatedGroup) {
          const allDone = updatedGroup.reservations.every(
            r => r.status === "checked_out" || r.status === "cancelled"
          );
          if (allDone) {
            await storage.updateGroup(req.params.groupId, { status: "finished" as any });
          }
        }
      }

      res.json({
        success: true,
        distributed: activeReservations.length,
        checkoutCount,
        balanceDiff: closeAllRooms ? balanceDiff : undefined,
      });
    } catch (error) {
      console.error("Error processing group payment:", error);
      res.status(500).json({ error: "Error processing group payment" });
    }
  });

  // ─── Group Folio endpoints ──────────────────────────────────────────────

  app.get("/api/groups/:groupId/folio", requireAuth, async (req, res) => {
    try {
      const folio = await storage.getGroupFolio(req.params.groupId);
      res.json(folio);
    } catch (error: any) {
      if (error.message === "Grupo no encontrado") return res.status(404).json({ error: error.message });
      res.status(500).json({ error: "Error al obtener folio grupal" });
    }
  });

  app.post("/api/groups/:groupId/charges", requireAuth, async (req, res) => {
    try {
      const { description, amount, date, category } = req.body;
      if (!description || !amount || !date) {
        return res.status(400).json({ error: "description, amount y date son requeridos" });
      }
      const charge = await storage.createGroupCharge({
        groupId: req.params.groupId,
        description,
        amount: parseFloat(amount).toFixed(2),
        date,
        category: category || "otros",
        billingTarget: "group",
        reservationId: null,
        createdBy: (req.user as any)?.username || null,
      });
      res.json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error al crear cargo grupal" });
    }
  });

  app.delete("/api/groups/:groupId/charges/:chargeId", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteGroupCharge(req.params.chargeId);
      if (!ok) return res.status(404).json({ error: "Cargo no encontrado" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar cargo grupal" });
    }
  });

  app.get("/api/groups/:groupId/payments", requireAuth, async (req, res) => {
    try {
      const payments = await storage.getGroupPayments(req.params.groupId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener pagos grupales" });
    }
  });

  app.post("/api/groups/:groupId/payment/v2", requireAuth, async (req, res) => {
    try {
      const { amount, method, date, reference, distribution, distributionDetail, notes } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount y method son requeridos" });
      }
      const totalAmount = parseFloat(amount);
      if (totalAmount <= 0) return res.status(400).json({ error: "El monto debe ser positivo" });

      const paymentDate = date || new Date().toISOString().split("T")[0];
      const distrib = distribution || "equal";

      // Calculate distribution
      const detail = await storage.distributeGroupPayment(
        req.params.groupId,
        totalAmount,
        distrib,
        distributionDetail
      );

      // Save group payment record (audit)
      const groupPayment = await storage.createGroupPayment({
        groupId: req.params.groupId,
        amount: totalAmount.toFixed(2),
        method,
        date: paymentDate,
        reference: reference || null,
        distribution: distrib,
        distributionDetail: detail,
        receivedBy: (req.user as any)?.username || null,
        notes: notes || null,
      });

      // Apply payments to individual reservations to maintain compatibility
      for (const [reservationId, amt] of Object.entries(detail)) {
        if (amt > 0) {
          await storage.createPayment({
            reservationId,
            amount: (amt as number).toFixed(2),
            method,
            reference: reference || `Pago grupal`,
            date: paymentDate,
          });
        }
      }

      res.json({ success: true, groupPayment, distributed: Object.keys(detail).length });
    } catch (error) {
      res.status(500).json({ error: "Error al registrar pago grupal" });
    }
  });

  app.post("/api/groups/:groupId/transfer-charge", requireAuth, async (req, res) => {
    try {
      const { chargeId } = req.body;
      if (!chargeId) return res.status(400).json({ error: "chargeId es requerido" });
      const transferred = await storage.transferChargeToGroup(chargeId, req.params.groupId);
      res.json(transferred);
    } catch (error: any) {
      if (error.message === "Cargo no encontrado") return res.status(404).json({ error: error.message });
      res.status(500).json({ error: "Error al transferir cargo" });
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
        analyzedAt: new Date(),
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
            analyzedAt: new Date(),
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
        completedAt: new Date(),
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
      const ordersWithSplits = await Promise.all(
        orders.map(async (order: any) => {
          const splits = await storage.getOrderSplits(order.id);
          return { ...order, splits };
        })
      );
      res.json(ordersWithSplits);
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
      const { waiterName, tableId, areaId, orderLabel } = req.body;
      if (!waiterName || !waiterName.trim()) {
        return res.status(400).json({ error: "Mozo es requerido" });
      }
      if (!tableId && !areaId) {
        return res.status(400).json({ error: "Se requiere mesa o area" });
      }
      if (!tableId && (!orderLabel || !orderLabel.trim())) {
        return res.status(400).json({ error: "Etiqueta de orden es requerida para areas sin mesas" });
      }
      const orderNumber = storage.generateOrderNumber();
      const order = await storage.createRestaurantOrder({
        ...req.body,
        orderNumber,
        openedAt: new Date(),
      });
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
      
      const { chargeToRoom, roomNumber, reservationId, roomReservationId, receiptType, paymentMethod, discount, discountType } = req.body;
      const effectiveReservationId = reservationId || roomReservationId;
      
      let finalTotal = parseFloat(order.total || "0");
      let discountAmount = 0;
      if (discount && discount > 0) {
        if (discountType === "percent") {
          discountAmount = finalTotal * discount / 100;
        } else {
          discountAmount = discount;
        }
        finalTotal = Math.max(0, finalTotal - discountAmount);
      }
      
      const updatedOrder = await storage.updateRestaurantOrder(req.params.id, {
        status: "closed",
        closedAt: new Date(),
        chargedToRoom: chargeToRoom ? "true" : "false",
        roomNumber: roomNumber || null,
        receiptType: receiptType || null,
        paymentMethod: paymentMethod || null,
        total: String(finalTotal.toFixed(2)),
        notes: discountAmount > 0 ? `Descuento: $${discountAmount.toFixed(2)}` : undefined,
      });
      
      if (chargeToRoom && effectiveReservationId) {
        await storage.createCharge({
          reservationId: effectiveReservationId,
          description: `Restaurante - Pedido ${order.orderNumber}${discountAmount > 0 ? ` (Desc: $${discountAmount.toFixed(2)})` : ""}`,
          amount: String(finalTotal.toFixed(2)),
          category: "restaurant",
          date: new Date().toISOString().split("T")[0],
        });
      }
      
      if (order.tableId) {
        await storage.updateRestaurantTable(order.tableId, { status: "available" });
      }

      try {
        const label = `Pedido ${order.orderNumber}${order.tableId ? "" : " (sin mesa)"}${discountAmount > 0 ? ` (Desc: $${discountAmount.toFixed(2)})` : ""}`;
        await storage.registerCashMovement(
          "restaurant", "restaurant_order", req.params.id, label,
          paymentMethod || (chargeToRoom ? "room_charge" : "cash"),
          String(finalTotal.toFixed(2)), "income",
          undefined, receiptType
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      res.json(updatedOrder);
    } catch (error) {
      res.status(500).json({ error: "Error closing order" });
    }
  });

  // Order Items
  app.post("/api/restaurant/orders/:orderId/items", async (req, res) => {
    try {
      const { menuItemId, quantity, notes, course, customPrice, customName } = req.body;
      const menuItem = await storage.getMenuItem(menuItemId);
      if (!menuItem) return res.status(404).json({ error: "Menu item not found" });
      
      const order = await storage.getRestaurantOrder(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      let finalCustomPrice = undefined;
      let finalCustomName = undefined;
      if (customPrice || customName) {
        if ((menuItem as any).isEditable !== "true") {
          return res.status(400).json({ error: "Este ítem no permite precio personalizado" });
        }
        if (customPrice) {
          const parsed = parseFloat(customPrice);
          if (isNaN(parsed) || parsed <= 0) {
            return res.status(400).json({ error: "El precio personalizado debe ser un número positivo" });
          }
          finalCustomPrice = parsed.toFixed(2);
        }
        finalCustomName = customName;
      }

      const unitPrice = finalCustomPrice || menuItem.price;
      const subtotal = (parseFloat(unitPrice) * (quantity || 1)).toFixed(2);
      const itemCourse = course || 1;
      const activeCourse = order.activeCourse || 1;
      const itemStatus = itemCourse <= activeCourse ? "pending" : "waiting_course";
      const itemNotes = customName ? `[${customName}] ${notes || ""}`.trim() : notes;
      
      const item = await storage.createOrderItem({
        orderId: req.params.orderId,
        menuItemId,
        quantity: quantity || 1,
        unitPrice,
        subtotal,
        notes: itemNotes,
        course: itemCourse,
        status: itemStatus,
      });
      
      // Update order totals — precio del menú ya incluye IVA, se desglosa
      const orderItems = await storage.getOrderItems(req.params.orderId);
      const total = orderItems.reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
      const neto = parseFloat((total / 1.21).toFixed(2));
      const tax = parseFloat((total - neto).toFixed(2));
      await storage.updateRestaurantOrder(req.params.orderId, {
        subtotal: neto.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        status: "in_progress",
      });
      
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error adding item to order" });
    }
  });

  // Advance course
  app.post("/api/restaurant/orders/:id/advance-course", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      
      const currentCourse = order.activeCourse || 1;
      if (currentCourse >= 3) return res.status(400).json({ error: "Ya se alcanzó el último curso" });
      
      const newCourse = currentCourse + 1;
      await storage.updateRestaurantOrder(req.params.id, { activeCourse: newCourse });
      
      const orderItems = await storage.getOrderItems(req.params.id);
      let activated = 0;
      for (const item of orderItems) {
        if (item.course === newCourse && item.status === "waiting_course") {
          await storage.updateOrderItem(item.id, { status: "pending" });
          activated++;
        }
      }
      
      res.json({ activeCourse: newCourse, activatedItems: activated });
    } catch (error) {
      res.status(500).json({ error: "Error advancing course" });
    }
  });

  app.patch("/api/restaurant/orders/:orderId/items/:itemId", requireAuth, async (req, res) => {
    try {
      const { course } = req.body;
      const updated = await storage.updateOrderItem(req.params.itemId, { course: course !== undefined ? course : undefined });
      if (!updated) return res.status(404).json({ error: "Item no encontrado" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating order item:", error);
      res.status(500).json({ error: "Error actualizando ítem" });
    }
  });

  app.delete("/api/restaurant/orders/:orderId/items/:itemId", async (req, res) => {
    try {
      await storage.deleteOrderItem(req.params.itemId);
      
      // Recalculate order totals — precio del menú ya incluye IVA, se desglosa
      const orderItems = await storage.getOrderItems(req.params.orderId);
      const total = orderItems.reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
      const neto = parseFloat((total / 1.21).toFixed(2));
      const tax = parseFloat((total - neto).toFixed(2));
      await storage.updateRestaurantOrder(req.params.orderId, {
        subtotal: neto.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
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
        createdAt: new Date(),
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

  // Restaurant Time Slots
  app.get("/api/restaurant/time-slots", async (req, res) => {
    try {
      const slots = await storage.getRestaurantTimeSlots();
      res.json(slots);
    } catch (error) {
      res.status(500).json({ error: "Error fetching time slots" });
    }
  });

  app.post("/api/restaurant/time-slots", async (req, res) => {
    try {
      const slot = await storage.createRestaurantTimeSlot(req.body);
      res.status(201).json(slot);
    } catch (error) {
      res.status(500).json({ error: "Error creating time slot" });
    }
  });

  app.patch("/api/restaurant/time-slots/:id", async (req, res) => {
    try {
      const slot = await storage.updateRestaurantTimeSlot(req.params.id, req.body);
      if (!slot) return res.status(404).json({ error: "Time slot not found" });
      res.json(slot);
    } catch (error) {
      res.status(500).json({ error: "Error updating time slot" });
    }
  });

  app.delete("/api/restaurant/time-slots/:id", async (req, res) => {
    try {
      await storage.deleteRestaurantTimeSlot(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting time slot" });
    }
  });

  // Order Splits
  app.post("/api/restaurant/orders/:id/split", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.status === "closed") return res.status(400).json({ error: "La orden ya está cerrada" });

      const existingSplits = await storage.getOrderSplits(req.params.id);
      if (existingSplits.length > 0) return res.status(400).json({ error: "La orden ya tiene una división activa" });

      const { parts } = req.body;
      if (!parts || parts < 2) return res.status(400).json({ error: "Se requieren al menos 2 partes" });

      const total = parseFloat(order.total || "0");
      const baseAmount = Math.floor(total / parts * 100) / 100;
      const remainder = total - baseAmount * parts;

      const splits = [];
      for (let i = 1; i <= parts; i++) {
        const amount = i === parts ? (baseAmount + remainder).toFixed(2) : baseAmount.toFixed(2);
        const split = await storage.createOrderSplit({
          orderId: req.params.id,
          splitNumber: i,
          amount,
          createdAt: new Date(),
        });
        splits.push(split);
      }

      res.status(201).json(splits);
    } catch (error) {
      res.status(500).json({ error: "Error splitting order" });
    }
  });

  app.get("/api/restaurant/orders/:id/split", async (req, res) => {
    try {
      const splits = await storage.getOrderSplits(req.params.id);
      res.json(splits);
    } catch (error) {
      res.status(500).json({ error: "Error fetching splits" });
    }
  });

  app.patch("/api/restaurant/orders/:id/split/:splitId", async (req, res) => {
    try {
      const { method, receiptType } = req.body;
      if (!method) return res.status(400).json({ error: "Método de pago requerido" });

      const split = await storage.updateOrderSplit(req.params.splitId, {
        method,
        receiptType: receiptType || null,
        isPaid: "true",
        paidAt: new Date(),
      });
      if (!split) return res.status(404).json({ error: "Split not found" });

      const allSplits = await storage.getOrderSplits(req.params.id);
      const allPaid = allSplits.every(s => s.isPaid === "true");

      if (allPaid) {
        const order = await storage.getRestaurantOrder(req.params.id);
        await storage.updateRestaurantOrder(req.params.id, {
          status: "closed",
          closedAt: new Date(),
          paymentMethod: method,
          receiptType: receiptType || null,
        });
        if (order?.tableId) {
          await storage.updateRestaurantTable(order.tableId, { status: "available" });
        }
      }

      res.json({ split, allPaid });
    } catch (error) {
      res.status(500).json({ error: "Error paying split" });
    }
  });

  app.delete("/api/restaurant/orders/:id/split", async (req, res) => {
    try {
      await storage.deleteOrderSplitsByOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error cancelling split" });
    }
  });

  // Recipes
  app.get("/api/restaurant/recipes", async (req, res) => {
    try {
      const recipes = await storage.getRecipes();
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recipes" });
    }
  });

  app.get("/api/restaurant/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recipe" });
    }
  });

  app.get("/api/restaurant/recipes/by-menu-item/:menuItemId", async (req, res) => {
    try {
      const recipe = await storage.getRecipeByMenuItem(req.params.menuItemId);
      res.json(recipe || null);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recipe" });
    }
  });

  app.post("/api/restaurant/recipes", async (req, res) => {
    try {
      const recipe = await storage.createRecipe(req.body);
      res.status(201).json(recipe);
    } catch (error) {
      res.status(500).json({ error: "Error creating recipe" });
    }
  });

  app.patch("/api/restaurant/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.updateRecipe(req.params.id, req.body);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ error: "Error updating recipe" });
    }
  });

  app.delete("/api/restaurant/recipes/:id", async (req, res) => {
    try {
      await storage.deleteRecipe(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting recipe" });
    }
  });

  // Recipe Ingredients
  app.get("/api/restaurant/recipes/:recipeId/ingredients", async (req, res) => {
    try {
      const ingredients = await storage.getRecipeIngredients(req.params.recipeId);
      res.json(ingredients);
    } catch (error) {
      res.status(500).json({ error: "Error fetching ingredients" });
    }
  });

  app.post("/api/restaurant/recipes/:recipeId/ingredients", async (req, res) => {
    try {
      const ingredient = await storage.createRecipeIngredient({
        ...req.body,
        recipeId: req.params.recipeId,
      });
      res.status(201).json(ingredient);
    } catch (error) {
      res.status(500).json({ error: "Error creating ingredient" });
    }
  });

  app.patch("/api/restaurant/recipe-ingredients/:id", async (req, res) => {
    try {
      const ingredient = await storage.updateRecipeIngredient(req.params.id, req.body);
      if (!ingredient) return res.status(404).json({ error: "Ingredient not found" });
      res.json(ingredient);
    } catch (error) {
      res.status(500).json({ error: "Error updating ingredient" });
    }
  });

  app.delete("/api/restaurant/recipe-ingredients/:id", async (req, res) => {
    try {
      await storage.deleteRecipeIngredient(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting ingredient" });
    }
  });

  // ==================== INVENTORY MODULE ====================
  
  // Item Categories
  app.get("/api/inventory/categories", async (req, res) => {
    try {
      let categories = await storage.getItemCategories();
      const area = req.query.area as string | undefined;
      if (area) {
        categories = categories.filter(c => (c as any).area === area);
      }
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
      let items = await storage.getInventoryItems();
      const area = req.query.area as string | undefined;
      if (area) {
        items = items.filter(item => {
          if (item.category && (item.category as any).area === area) return true;
          return false;
        });
      }
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
        createdAt: new Date(),
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

  app.get("/api/spa/appointments/weekly-summary", async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      const appointments = await storage.getSpaAppointmentsByDateRange(startDate, endDate);
      const activeStatuses = ["pending", "confirmed", "in_progress"];
      const summaryMap = new Map<string, { cabinId: string; date: string; count: number }>();
      
      for (const apt of appointments) {
        if (!activeStatuses.includes(apt.status)) continue;
        const key = `${apt.cabinId}_${apt.appointmentDate}`;
        const existing = summaryMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          summaryMap.set(key, { cabinId: apt.cabinId, date: apt.appointmentDate, count: 1 });
        }
      }

      res.json(Array.from(summaryMap.values()));
    } catch (error) {
      res.status(500).json({ error: "Error fetching weekly summary" });
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
      const { cabinId, treatmentId, professionalId, guestName, guestLastName, guestPhone, guestEmail, reservationId, appointmentDate, startTime, endTime, status, notes } = req.body;
      
      if (!cabinId || !treatmentId || !guestName || !appointmentDate || !startTime || !endTime) {
        return res.status(400).json({ error: "cabinId, treatmentId, guestName, appointmentDate, startTime, and endTime are required" });
      }

      const existingAppointments = await storage.getSpaAppointmentsByCabin(cabinId, appointmentDate);
      const activeStatuses = ["pending", "confirmed", "in_progress"];
      const newStart = timeToMinutes(startTime);
      const newEnd = timeToMinutes(endTime);
      
      for (const existing of existingAppointments) {
        if (!activeStatuses.includes(existing.status)) continue;
        const existStart = timeToMinutes(existing.startTime);
        const existEnd = timeToMinutes(existing.endTime);
        if (newStart < existEnd && newEnd > existStart) {
          const cabin = await storage.getSpaCabin(cabinId);
          return res.status(409).json({
            error: "Superposición de turno",
            message: `El gabinete '${cabin?.name || cabinId}' ya tiene un turno de ${existing.startTime} a ${existing.endTime} hs. Elegí otro horario o gabinete.`,
          });
        }
      }

      const appointment = await storage.createSpaAppointment({
        cabinId,
        treatmentId,
        professionalId: professionalId || null,
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
        createdAt: new Date(),
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
        openedAt: new Date(),
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
        createdAt: new Date(),
      });

      res.status(201).json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error creating appointment" });
    }
  });

  app.patch("/api/spa/appointments/:id", async (req, res) => {
    try {
      const current = await storage.getSpaAppointment(req.params.id);
      if (!current) return res.status(404).json({ error: "Appointment not found" });

      const cabinId = req.body.cabinId || current.cabinId;
      const appointmentDate = req.body.appointmentDate || current.appointmentDate;
      const startTime = req.body.startTime || current.startTime;
      const endTime = req.body.endTime || current.endTime;

      if (req.body.cabinId || req.body.startTime || req.body.endTime || req.body.appointmentDate) {
        const existingAppointments = await storage.getSpaAppointmentsByCabin(cabinId, appointmentDate);
        const activeStatuses = ["pending", "confirmed", "in_progress"];
        const newStart = timeToMinutes(startTime);
        const newEnd = timeToMinutes(endTime);
        
        for (const existing of existingAppointments) {
          if (existing.id === req.params.id) continue;
          if (!activeStatuses.includes(existing.status)) continue;
          const existStart = timeToMinutes(existing.startTime);
          const existEnd = timeToMinutes(existing.endTime);
          if (newStart < existEnd && newEnd > existStart) {
            const cabin = await storage.getSpaCabin(cabinId);
            return res.status(409).json({
              error: "Superposición de turno",
              message: `El gabinete '${cabin?.name || cabinId}' ya tiene un turno de ${existing.startTime} a ${existing.endTime} hs. Elegí otro horario o gabinete.`,
            });
          }
        }
      }

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
        openedAt: new Date(),
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
      const { chargedTo, receiptType } = req.body;
      
      if (!chargedTo || !receiptType) {
        return res.status(400).json({ error: "chargedTo and receiptType are required" });
      }

      const accountData = await storage.getSpaAccount(req.params.id);
      if (!accountData) return res.status(404).json({ error: "Account not found" });

      const totalAmount = accountData.items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
      const totalPaid = accountData.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

      if (totalPaid < totalAmount) {
        return res.status(400).json({
          error: "Saldo pendiente",
          message: `Faltan $${(totalAmount - totalPaid).toFixed(2)} por cobrar antes de cerrar el folio.`,
        });
      }

      const account = await storage.closeSpaAccount(req.params.id, chargedTo, receiptType);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error closing spa account" });
    }
  });

  app.get("/api/spa/accounts/:id/payments", async (req, res) => {
    try {
      const payments = await storage.getSpaPayments(req.params.id);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching payments" });
    }
  });

  app.post("/api/spa/accounts/:id/payments", async (req, res) => {
    try {
      const { amount, method, isAdvance, appointmentId, reservationId, notes } = req.body;
      
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }

      const payment = await storage.createSpaPayment({
        accountId: req.params.id,
        amount,
        method,
        isAdvance: isAdvance ? "true" : "false",
        appointmentId: appointmentId || null,
        reservationId: reservationId || null,
        notes: notes || null,
        createdAt: new Date(),
      });

      if (method === "room_charge" && reservationId) {
        const charge = {
          reservationId,
          category: "spa" as const,
          description: `SPA - Pago ${isAdvance ? "(Seña)" : ""}`,
          amount: amount,
          date: new Date().toISOString().split("T")[0],
          createdBy: null,
        };
        await storage.createCharge(charge);
      }

      try {
        const label = `SPA - Pago ${isAdvance ? "(Seña)" : ""} - Cuenta ${req.params.id}`;
        await storage.registerCashMovement(
          "spa", "spa_account", req.params.id, label,
          method, String(amount), "income"
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating payment" });
    }
  });

  app.patch("/api/spa/payments/:id/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion } = req.body;
      if (!motivoAnulacion?.trim()) return res.status(400).json({ error: "El motivo de anulación es requerido" });
      const [pay] = await db.select().from(spaPayments).where(eq(spaPayments.id, req.params.id));
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      if (pay.status === "anulado") return res.status(400).json({ error: "El pago ya está anulado" });
      const account = await storage.getSpaAccount(pay.accountId);
      if (account?.status === "closed") return res.status(403).json({ error: "No se puede anular pagos de una cuenta cerrada" });
      const [updated] = await db.update(spaPayments)
        .set({ status: "anulado", motivoAnulacion, anuladoAt: new Date() })
        .where(eq(spaPayments.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/spa/payments/:id", async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/spa/payments/${req.params.id} — usar PATCH /anular`);
    try {
      await storage.deleteSpaPayment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting payment" });
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
        createdAt: new Date(),
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

  // SPA Professionals
  app.get("/api/spa/professionals", async (req, res) => {
    try {
      const professionals = await db.select().from(spaProfessionals);
      res.json(professionals);
    } catch (error) {
      res.status(500).json({ error: "Error fetching professionals" });
    }
  });

  app.post("/api/spa/professionals", async (req, res) => {
    try {
      const [created] = await db.insert(spaProfessionals).values(req.body).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Error creating professional" });
    }
  });

  app.patch("/api/spa/professionals/:id", async (req, res) => {
    try {
      const [updated] = await db.update(spaProfessionals)
        .set(req.body)
        .where(eq(spaProfessionals.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating professional" });
    }
  });

  // SPA Clients
  app.get("/api/spa/clients", async (req, res) => {
    try {
      const { search } = req.query;
      const clients = await db.select().from(spaClients).orderBy(desc(spaClients.createdAt));
      if (search) {
        const s = (search as string).toLowerCase();
        return res.json(clients.filter(c =>
          c.firstName.toLowerCase().includes(s) ||
          (c.lastName || "").toLowerCase().includes(s) ||
          (c.phone || "").includes(s) ||
          (c.email || "").toLowerCase().includes(s)
        ));
      }
      res.json(clients);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa clients" });
    }
  });

  app.post("/api/spa/clients", async (req, res) => {
    try {
      const [created] = await db.insert(spaClients).values(req.body).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa client" });
    }
  });

  app.patch("/api/spa/clients/:id", async (req, res) => {
    try {
      const [updated] = await db.update(spaClients)
        .set(req.body).where(eq(spaClients.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa client" });
    }
  });

  app.delete("/api/spa/clients/:id", async (req, res) => {
    try {
      await db.delete(spaClients).where(eq(spaClients.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting spa client" });
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
      const { eventRoomId, startDate, endDate } = req.body;
      if (eventRoomId && startDate && endDate) {
        const activeStatuses = ["tentative", "confirmed", "in_progress"];
        const existingEvents = await storage.getEventsByDateRange(startDate, endDate);
        for (const existing of existingEvents) {
          if (existing.eventRoomId !== eventRoomId) continue;
          if (!activeStatuses.includes(existing.status)) continue;
          if (existing.startDate <= endDate && existing.endDate >= startDate) {
            const room = await storage.getEventRoom(eventRoomId);
            return res.status(409).json({
              error: "Superposición de evento",
              message: `El salón '${room?.name || eventRoomId}' ya tiene el evento '${existing.name}' reservado del ${existing.startDate} al ${existing.endDate}.`,
            });
          }
        }
      }
      const eventCode = storage.generateEventCode();
      const event = await storage.createEvent({
        ...req.body,
        eventCode,
        createdAt: new Date(),
      });
      res.status(201).json(event);
    } catch (error) {
      res.status(500).json({ error: "Error creating event" });
    }
  });

  app.patch("/api/events/:id", async (req, res) => {
    try {
      const current = await storage.getEvent(req.params.id);
      if (!current) return res.status(404).json({ error: "Event not found" });

      const eventRoomId = req.body.eventRoomId || current.eventRoomId;
      const startDate = req.body.startDate || current.startDate;
      const endDate = req.body.endDate || current.endDate;

      if (req.body.eventRoomId || req.body.startDate || req.body.endDate) {
        const activeStatuses = ["tentative", "confirmed", "in_progress"];
        const existingEvents = await storage.getEventsByDateRange(startDate, endDate);
        for (const existing of existingEvents) {
          if (existing.id === req.params.id) continue;
          if (existing.eventRoomId !== eventRoomId) continue;
          if (!activeStatuses.includes(existing.status)) continue;
          if (existing.startDate <= endDate && existing.endDate >= startDate) {
            const room = await storage.getEventRoom(eventRoomId);
            return res.status(409).json({
              error: "Superposición de evento",
              message: `El salón '${room?.name || eventRoomId}' ya tiene el evento '${existing.name}' reservado del ${existing.startDate} al ${existing.endDate}.`,
            });
          }
        }
      }

      const event = await storage.updateEvent(req.params.id, req.body);
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
      const evt = await storage.getEvent(req.params.eventId);
      if (!evt) return res.status(404).json({ error: "Event not found" });
      if (evt.status === "invoiced" || evt.status === "cancelled") {
        return res.status(400).json({ error: "No se pueden agregar cargos a un evento facturado o cancelado" });
      }
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
        createdAt: new Date(),
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

  // Event Payments
  app.get("/api/events/:eventId/payments", async (req, res) => {
    try {
      const payments = await storage.getEventPayments(req.params.eventId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event payments" });
    }
  });

  app.post("/api/events/:eventId/payments", async (req, res) => {
    try {
      const existingEvent = await storage.getEvent(req.params.eventId);
      if (!existingEvent) return res.status(404).json({ error: "Event not found" });
      if (existingEvent.status === "invoiced") {
        return res.status(400).json({ error: "No se pueden agregar pagos a un evento facturado" });
      }
      const { amount, method, isAdvance, reservationId, notes } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }
      if (method === "room_charge" && !reservationId) {
        return res.status(400).json({ error: "reservationId es requerido para cargo a habitacion" });
      }
      const payment = await storage.createEventPayment({
        eventId: req.params.eventId,
        amount,
        method,
        isAdvance: isAdvance ? "true" : "false",
        reservationId: reservationId || null,
        notes: notes || null,
        paidAt: new Date(),
        createdAt: new Date(),
      });
      const refreshedEvent = await storage.getEvent(req.params.eventId);
      if (refreshedEvent) {
        const totalPaid = (refreshedEvent.payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
        await storage.updateEvent(req.params.eventId, { totalPaid: totalPaid.toFixed(2) } as any);
      }

      try {
        const evt = await storage.getEvent(req.params.eventId);
        const label = `Evento ${evt?.name || req.params.eventId} - Pago ${method}`;
        await storage.registerCashMovement(
          "events", "event", req.params.eventId, label,
          method, String(amount), "income"
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating event payment" });
    }
  });

  app.patch("/api/events/:eventId/payments/:payId/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion } = req.body;
      if (!motivoAnulacion?.trim()) return res.status(400).json({ error: "El motivo de anulación es requerido" });
      const event = await storage.getEvent(req.params.eventId);
      if (event?.status === "invoiced") return res.status(403).json({ error: "No se puede anular pagos de un evento facturado" });
      const [pay] = await db.select().from(eventPayments).where(eq(eventPayments.id, req.params.payId));
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      if (pay.status === "anulado") return res.status(400).json({ error: "El pago ya está anulado" });
      const [updated] = await db.update(eventPayments)
        .set({ status: "anulado", motivoAnulacion, anuladoAt: new Date() })
        .where(eq(eventPayments.id, req.params.payId))
        .returning();
      if (event) {
        const allPays = await db.select().from(eventPayments).where(
          and(eq(eventPayments.eventId, req.params.eventId), eq(eventPayments.status, "active"))
        );
        const totalPaid = allPays.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        await storage.updateEvent(req.params.eventId, { totalPaid: totalPaid.toFixed(2) } as any);
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/events/:eventId/payments/:payId", async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/events/${req.params.eventId}/payments/${req.params.payId} — usar PATCH /anular`);
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (event && (event.status === "invoiced")) {
        return res.status(400).json({ error: "No se pueden eliminar pagos de un evento facturado" });
      }
      await storage.deleteEventPayment(req.params.payId);
      if (event) {
        const remaining = (event.payments || []).filter(p => p.id !== req.params.payId);
        const totalPaid = remaining.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        await storage.updateEvent(req.params.eventId, { totalPaid: totalPaid.toFixed(2) } as any);
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event payment" });
    }
  });

  app.get("/api/events/:eventId/summary", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const charges = event.charges || [];
      const payments = event.payments || [];
      const totalCharges = charges.reduce((sum, c) => sum + parseFloat(c.totalAmount), 0);
      const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      res.json({
        totalCharges,
        totalPayments,
        balance: totalCharges - totalPayments,
        charges,
        payments,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching event summary" });
    }
  });

  app.post("/api/events/:eventId/close", async (req, res) => {
    try {
      const { receiptType } = req.body;
      if (!receiptType) {
        return res.status(400).json({ error: "receiptType es requerido" });
      }
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const charges = event.charges || [];
      const payments = event.payments || [];
      const totalCharges = charges.reduce((sum, c) => sum + parseFloat(c.totalAmount), 0);
      const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const balance = totalCharges - totalPayments;

      if (balance > 0.01) {
        return res.status(400).json({
          error: "Saldo pendiente",
          message: `Hay un saldo pendiente de $${balance.toFixed(2)}. Registre los pagos antes de cerrar.`,
        });
      }

      for (const payment of payments) {
        if (payment.method === "room_charge" && payment.reservationId) {
          await storage.createCharge({
            reservationId: payment.reservationId,
            description: `Eventos - ${event.name}`,
            amount: payment.amount,
            date: new Date().toISOString().split("T")[0],
            category: "events",
            createdBy: null,
          });
        }
      }

      await storage.updateEvent(req.params.eventId, {
        status: "invoiced",
        receiptType,
        closedAt: new Date(),
        totalAmount: totalCharges.toFixed(2),
        totalPaid: totalPayments.toFixed(2),
      } as any);

      const updated = await storage.getEvent(req.params.eventId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error closing event" });
    }
  });

  // Event Tables (Evento por Mesa)
  app.get("/api/events/:eventId/tables", async (req, res) => {
    try {
      const tables = await storage.getEventTables(req.params.eventId);
      res.json(tables);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event tables" });
    }
  });

  app.post("/api/events/:eventId/tables", async (req, res) => {
    try {
      const { tableNumber, label, seats, reservationId } = req.body;
      if (!tableNumber) {
        return res.status(400).json({ error: "tableNumber is required" });
      }
      const table = await storage.createEventTable({
        eventId: req.params.eventId,
        tableNumber,
        label: label || null,
        seats: seats || null,
        reservationId: reservationId || null,
        createdAt: new Date(),
      });
      res.status(201).json(table);
    } catch (error) {
      res.status(500).json({ error: "Error creating event table" });
    }
  });

  app.patch("/api/events/:eventId/tables/:tableId", async (req, res) => {
    try {
      const table = await storage.updateEventTable(req.params.tableId, req.body);
      if (!table) return res.status(404).json({ error: "Event table not found" });
      res.json(table);
    } catch (error) {
      res.status(500).json({ error: "Error updating event table" });
    }
  });

  app.delete("/api/events/:eventId/tables/:tableId", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });
      if (table.charges.length > 0 || table.payments.length > 0) {
        return res.status(400).json({ error: "No se puede eliminar una mesa con cargos o pagos" });
      }
      await storage.deleteEventTable(req.params.tableId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event table" });
    }
  });

  app.post("/api/events/:eventId/tables/:tableId/charges", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Table not found" });
      if (table.status !== "open") {
        return res.status(400).json({ error: "No se pueden agregar cargos a una mesa cerrada" });
      }
      const { description, quantity, unitPrice } = req.body;
      if (!description || !unitPrice) {
        return res.status(400).json({ error: "description and unitPrice are required" });
      }
      const qty = quantity || 1;
      const total = (parseFloat(unitPrice) * qty).toFixed(2);
      const charge = await storage.createEventTableCharge({
        eventTableId: req.params.tableId,
        description,
        quantity: qty,
        unitPrice,
        total,
        createdAt: new Date(),
      });
      res.status(201).json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error creating table charge" });
    }
  });

  app.delete("/api/events/:eventId/tables/:tableId/charges/:chargeId", async (req, res) => {
    try {
      await storage.deleteEventTableCharge(req.params.chargeId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting table charge" });
    }
  });

  app.post("/api/events/:eventId/tables/:tableId/payments", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Table not found" });
      if (table.status !== "open") {
        return res.status(400).json({ error: "No se pueden agregar pagos a una mesa cerrada" });
      }
      const { amount, method, isAdvance, reservationId } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }
      if (method === "room_charge" && !reservationId) {
        return res.status(400).json({ error: "reservationId es requerido para cargo a habitacion" });
      }
      const payment = await storage.createEventTablePayment({
        eventTableId: req.params.tableId,
        amount,
        method,
        isAdvance: isAdvance ? "true" : "false",
        reservationId: reservationId || null,
        paidAt: new Date(),
        createdAt: new Date(),
      });

      try {
        const evt = await storage.getEvent(req.params.eventId);
        const label = `Evento ${evt?.name || req.params.eventId} - Mesa ${table.tableName} - Pago ${method}`;
        await storage.registerCashMovement(
          "events", "event", req.params.eventId, label,
          method, String(amount), "income"
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating table payment" });
    }
  });

  app.get("/api/events/:eventId/tables/:tableId/summary", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });
      const totalCharges = table.charges.reduce((sum, c) => sum + parseFloat(c.total), 0);
      const totalPayments = table.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      res.json({
        totalCharges,
        totalPayments,
        balance: totalCharges - totalPayments,
        charges: table.charges,
        payments: table.payments,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching table summary" });
    }
  });

  app.post("/api/events/:eventId/tables/:tableId/close", async (req, res) => {
    try {
      const { receiptType } = req.body;
      if (!receiptType) {
        return res.status(400).json({ error: "receiptType es requerido" });
      }
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });

      const totalCharges = table.charges.reduce((sum, c) => sum + parseFloat(c.total), 0);
      const totalPayments = table.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const balance = totalCharges - totalPayments;

      if (balance > 0.01) {
        return res.status(400).json({
          error: "Saldo pendiente",
          message: `Saldo pendiente de $${balance.toFixed(2)}. Registre los pagos antes de cerrar.`,
        });
      }

      for (const payment of table.payments) {
        if (payment.method === "room_charge" && payment.reservationId) {
          const event = await storage.getEvent(req.params.eventId);
          await storage.createCharge({
            reservationId: payment.reservationId,
            description: `Eventos Mesa ${table.tableNumber} - ${event?.name || ""}`,
            amount: payment.amount,
            date: new Date().toISOString().split("T")[0],
            category: "events",
            createdBy: null,
          });
        }
      }

      await storage.updateEventTable(req.params.tableId, {
        status: "invoiced",
        receiptType,
        closedAt: new Date(),
      });

      const updated = await storage.getEventTable(req.params.tableId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error closing table" });
    }
  });

  app.get("/api/events/:eventId/tables-summary", async (req, res) => {
    try {
      const tables = await storage.getEventTables(req.params.eventId);
      const tableSummaries = tables.map(table => {
        const totalCharges = table.charges.reduce((sum, c) => sum + parseFloat(c.total), 0);
        const totalPayments = table.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        return {
          id: table.id,
          tableNumber: table.tableNumber,
          label: table.label,
          seats: table.seats,
          status: table.status,
          totalCharges,
          totalPayments,
          balance: totalCharges - totalPayments,
        };
      });
      const totalAll = tableSummaries.reduce((sum, t) => sum + t.totalCharges, 0);
      const paidAll = tableSummaries.reduce((sum, t) => sum + t.totalPayments, 0);
      const pendingTables = tableSummaries.filter(t => t.status === "open").length;
      res.json({
        tables: tableSummaries,
        totalCharges: totalAll,
        totalPayments: paidAll,
        balance: totalAll - paidAll,
        pendingTables,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching tables summary" });
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
        createdAt: new Date(),
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

  // ==================== PACKAGES ====================
  app.get("/api/packages", async (req, res) => {
    try {
      const packages = await storage.getPackages();
      res.json(packages);
    } catch (error) {
      res.status(500).json({ error: "Error fetching packages" });
    }
  });

  app.get("/api/packages/active", async (req, res) => {
    try {
      const packages = await storage.getActivePackages();
      res.json(packages);
    } catch (error) {
      res.status(500).json({ error: "Error fetching active packages" });
    }
  });

  app.get("/api/packages/:id", async (req, res) => {
    try {
      const pkg = await storage.getPackage(req.params.id);
      if (!pkg) return res.status(404).json({ error: "Package not found" });
      res.json(pkg);
    } catch (error) {
      res.status(500).json({ error: "Error fetching package" });
    }
  });

  app.post("/api/packages", async (req, res) => {
    try {
      const { name, description, roomTypeId, nights, basePrice, discountPercent, validFrom, validUntil, status, includedServices, terms } = req.body;
      if (!name || !basePrice) {
        return res.status(400).json({ error: "Name and base price are required" });
      }
      const code = storage.generatePackageCode();
      const pkg = await storage.createPackage({
        code,
        name,
        description,
        roomTypeId,
        nights: nights || 1,
        basePrice: String(basePrice),
        discountPercent: discountPercent ? String(discountPercent) : null,
        validFrom,
        validUntil,
        status: status || "active",
        includedServices,
        terms,
        createdAt: new Date(),
      });
      res.status(201).json(pkg);
    } catch (error) {
      res.status(500).json({ error: "Error creating package" });
    }
  });

  app.patch("/api/packages/:id", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.basePrice) updates.basePrice = String(updates.basePrice);
      if (updates.discountPercent) updates.discountPercent = String(updates.discountPercent);
      const pkg = await storage.updatePackage(req.params.id, updates);
      if (!pkg) return res.status(404).json({ error: "Package not found" });
      res.json(pkg);
    } catch (error) {
      res.status(500).json({ error: "Error updating package" });
    }
  });

  app.delete("/api/packages/:id", async (req, res) => {
    try {
      await storage.deletePackage(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting package" });
    }
  });

  app.post("/api/packages/:id/duplicate", async (req, res) => {
    try {
      const original = await storage.getPackage(req.params.id);
      if (!original) return res.status(404).json({ error: "Package not found" });
      const code = storage.generatePackageCode();
      const pkg = await storage.createPackage({
        code,
        name: `${original.name} (Copia)`,
        description: original.description,
        roomTypeId: original.roomTypeId,
        nights: original.nights,
        basePrice: original.basePrice,
        discountPercent: original.discountPercent,
        validFrom: original.validFrom,
        validUntil: original.validUntil,
        status: "inactive",
        includedServices: original.includedServices,
        terms: original.terms,
        createdAt: new Date(),
      });
      if (original.items && original.items.length > 0) {
        for (const item of original.items) {
          await storage.createPackageItem({
            packageId: pkg.id,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unitValue: item.unitValue,
          });
        }
      }
      const duplicated = await storage.getPackage(pkg.id);
      res.status(201).json(duplicated);
    } catch (error) {
      res.status(500).json({ error: "Error duplicating package" });
    }
  });

  app.patch("/api/packages/:id/toggle-status", async (req, res) => {
    try {
      const pkg = await storage.getPackage(req.params.id);
      if (!pkg) return res.status(404).json({ error: "Package not found" });
      const newStatus = pkg.status === "active" ? "inactive" : "active";
      const updated = await storage.updatePackage(req.params.id, { status: newStatus });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error toggling package status" });
    }
  });

  // Package Items
  app.get("/api/packages/:packageId/items", async (req, res) => {
    try {
      const items = await storage.getPackageItems(req.params.packageId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching package items" });
    }
  });

  app.post("/api/packages/:packageId/items", async (req, res) => {
    try {
      const { itemType, description, quantity, unitValue } = req.body;
      if (!itemType || !description) {
        return res.status(400).json({ error: "Item type and description are required" });
      }
      const item = await storage.createPackageItem({
        packageId: req.params.packageId,
        itemType,
        description,
        quantity: quantity || 1,
        unitValue: unitValue ? String(unitValue) : null,
      });
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating package item" });
    }
  });

  app.patch("/api/package-items/:id", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.unitValue) updates.unitValue = String(updates.unitValue);
      const item = await storage.updatePackageItem(req.params.id, updates);
      if (!item) return res.status(404).json({ error: "Package item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating package item" });
    }
  });

  app.delete("/api/package-items/:id", async (req, res) => {
    try {
      await storage.deletePackageItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting package item" });
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

  // ==================== HOSPITALITY MODULE ====================

  // Guest Preferences CRUD
  app.get("/api/guests/:id/preferences", async (req, res) => {
    try {
      const activeOnly = req.query.active === "true";
      const prefs = activeOnly 
        ? await storage.getActiveGuestPreferences(req.params.id)
        : await storage.getGuestPreferences(req.params.id);
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching preferences" });
    }
  });

  app.post("/api/guests/:id/preferences", async (req, res) => {
    try {
      const pref = await storage.createGuestPreference({ ...req.body, guestId: req.params.id });
      res.status(201).json(pref);
    } catch (error) {
      res.status(500).json({ error: "Error creating preference" });
    }
  });

  app.patch("/api/guests/:guestId/preferences/:prefId", async (req, res) => {
    try {
      const pref = await storage.updateGuestPreference(req.params.prefId, req.body);
      if (!pref) return res.status(404).json({ error: "Preference not found" });
      res.json(pref);
    } catch (error) {
      res.status(500).json({ error: "Error updating preference" });
    }
  });

  app.patch("/api/guests/:guestId/preferences/:prefId/toggle", async (req, res) => {
    try {
      const pref = await storage.toggleGuestPreference(req.params.prefId);
      if (!pref) return res.status(404).json({ error: "Preference not found" });
      res.json(pref);
    } catch (error) {
      res.status(500).json({ error: "Error toggling preference" });
    }
  });

  app.delete("/api/guests/:guestId/preferences/:prefId", async (req, res) => {
    try {
      const deleted = await storage.deleteGuestPreference(req.params.prefId);
      if (!deleted) return res.status(404).json({ error: "Preference not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting preference" });
    }
  });

  // Stay Notes CRUD
  app.get("/api/reservations/:id/stay-notes", async (req, res) => {
    try {
      const notes = await storage.getStayNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching stay notes" });
    }
  });

  app.get("/api/hospitality/stay-notes/active", async (req, res) => {
    try {
      const includeResolved = req.query.includeResolved === "true";
      if (includeResolved) {
        const allNotes = Array.from((await storage.getActiveStayNotes()) || []);
        const allReservations = await storage.getReservations();
        const checkedInIds = new Set(allReservations.filter((r) => r.status === "checked_in").map((r) => r.id));
        const allStayNotes: any[] = [];
        for (const r of allReservations) {
          const notes = await storage.getStayNotes(r.id);
          allStayNotes.push(...notes);
        }
        res.json(allStayNotes);
      } else {
        const notes = await storage.getActiveStayNotes();
        res.json(notes);
      }
    } catch (error) {
      res.status(500).json({ error: "Error fetching stay notes" });
    }
  });

  app.post("/api/reservations/:id/stay-notes", async (req, res) => {
    try {
      const note = await storage.createStayNote({ ...req.body, reservationId: req.params.id });
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ error: "Error creating stay note" });
    }
  });

  app.patch("/api/hospitality/stay-notes/:noteId", async (req, res) => {
    try {
      const note = await storage.updateStayNote(req.params.noteId, req.body);
      if (!note) return res.status(404).json({ error: "Note not found" });
      res.json(note);
    } catch (error) {
      res.status(500).json({ error: "Error updating stay note" });
    }
  });

  app.patch("/api/hospitality/stay-notes/:noteId/resolve", async (req, res) => {
    try {
      const { resolvedBy } = req.body;
      const note = await storage.resolveStayNote(req.params.noteId, resolvedBy || "Sistema");
      if (!note) return res.status(404).json({ error: "Note not found" });
      res.json(note);
    } catch (error) {
      res.status(500).json({ error: "Error resolving stay note" });
    }
  });

  app.delete("/api/hospitality/stay-notes/:noteId", async (req, res) => {
    try {
      const deleted = await storage.deleteStayNote(req.params.noteId);
      if (!deleted) return res.status(404).json({ error: "Note not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting stay note" });
    }
  });

  // Hospitality Alerts
  app.get("/api/hospitality/alerts", async (req, res) => {
    try {
      const area = req.query.area as string | undefined;
      const alerts = await storage.getHospitalityAlerts(area);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: "Error fetching alerts" });
    }
  });

  app.get("/api/hospitality/alerts/reservation/:id", async (req, res) => {
    try {
      const alerts = await storage.getHospitalityAlertsByReservation(req.params.id);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: "Error fetching reservation alerts" });
    }
  });

  app.patch("/api/hospitality/alerts/:alertId/acknowledge", async (req, res) => {
    try {
      const { acknowledgedBy } = req.body;
      const alert = await storage.acknowledgeHospitalityAlert(req.params.alertId, acknowledgedBy || "Sistema");
      if (!alert) return res.status(404).json({ error: "Alert not found" });
      res.json(alert);
    } catch (error) {
      res.status(500).json({ error: "Error acknowledging alert" });
    }
  });

  // Hospitality Dashboard
  app.get("/api/hospitality/dashboard", async (req, res) => {
    try {
      const allReservations = await storage.getReservations();
      const checkedIn = allReservations.filter((r) => r.status === "checked_in");
      
      const guestsWithPrefs = [];
      for (const r of checkedIn) {
        if (r.guestId) {
          const guest = await storage.getGuest(r.guestId);
          const prefs = await storage.getActiveGuestPreferences(r.guestId);
          if (guest) {
            guestsWithPrefs.push({
              guest,
              reservation: r,
              preferences: prefs,
              hasCritical: prefs.some((p) => p.priority === "critical"),
              hasHigh: prefs.some((p) => p.priority === "high"),
            });
          }
        }
      }

      const allAlerts = await storage.getHospitalityAlerts();
      const pendingAlerts = allAlerts.filter((a) => !a.isAcknowledged);

      const allGuests = await storage.getGuests();
      const allPrefs = [];
      for (const g of allGuests) {
        const prefs = await storage.getActiveGuestPreferences(g.id);
        const specialDates = prefs.filter((p) => p.category === "fecha_especial");
        if (specialDates.length > 0) {
          allPrefs.push({ guest: g, specialDates });
        }
      }

      const criticalPrefs = [];
      for (const g of allGuests) {
        const prefs = await storage.getActiveGuestPreferences(g.id);
        const critical = prefs.filter((p) => p.priority === "critical");
        if (critical.length > 0) {
          criticalPrefs.push({ guest: g, preferences: critical });
        }
      }

      res.json({
        inHouseGuests: guestsWithPrefs,
        pendingAlerts,
        upcomingSpecialDates: allPrefs,
        criticalPreferences: criticalPrefs,
        stats: {
          totalInHouseWithPrefs: guestsWithPrefs.filter((g) => g.preferences.length > 0).length,
          pendingAlertsCount: pendingAlerts.length,
          criticalCount: criticalPrefs.reduce((sum, g) => sum + g.preferences.length, 0),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching dashboard" });
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
      for (const p of todos) {
        const m = (p as any).metodo || "otros";
        porMetodo[m] = (porMetodo[m] || 0) + parseFloat((p as any).monto || "0");
      }

      res.json({
        fecha,
        movimientos: todos,
        totalPorMetodo: porMetodo,
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
      const movement = await storage.createCashMovement(req.body);
      res.status(201).json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error creating movement" });
    }
  });

  app.patch("/api/cash/movements/:id/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion, anuladoPor } = req.body;
      if (!motivoAnulacion?.trim()) return res.status(400).json({ error: "Motivo requerido" });
      const [mov] = await db.select().from(cashMovements).where(eq(cashMovements.id, req.params.id));
      if (!mov) return res.status(404).json({ error: "Movimiento no encontrado" });
      if (mov.anulado) return res.status(400).json({ error: "Ya está anulado" });
      if (mov.shiftId) {
        const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.id, mov.shiftId));
        if (shift && shift.status === "closed") {
          return res.status(403).json({ error: "No se puede anular movimientos de un turno cerrado" });
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
        alicuotaIibb, alicuotaGanancias, alicuotaIva, cbu, banco } = req.body;
      if (!razonSocial || !cuit || !condicionIva) {
        return res.status(400).json({ error: "Razón social, CUIT y condición IVA son requeridos" });
      }
      const result = await db.execute(sql`
        INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva, domicilio, localidad, provincia, cp, alicuota_iibb, alicuota_ganancias, alicuota_iva, cbu, banco)
        VALUES (${razonSocial}, ${cuit}, ${condicionIva}, ${domicilio||null}, ${localidad||null}, ${provincia||"Entre Rios"}, ${cp||null}, ${alicuotaIibb||0}, ${alicuotaGanancias||0}, ${alicuotaIva||0}, ${cbu||null}, ${banco||null})
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
        alicuotaIibb, alicuotaGanancias, alicuotaIva, cbu, banco, activo } = req.body;
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

  registerExportRoutes(app);
  registerAdminCashRoutes(app);
  registerBillingRoutes(app);
  registerReportsRoutes(app);

  return httpServer;
}
