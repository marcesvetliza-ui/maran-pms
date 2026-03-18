import type { Express } from "express";
import { storage } from "../db-storage";
import { requireAuth } from "../auth";
import { db } from "../db";
import { hospitalityAlerts, guestPreferences } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

export function registerHospitalityRoutes(app: Express) {
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
        const allReservations = await storage.getReservations();
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

  app.patch("/api/hospitality/alerts/:alertId/complete", requireAuth, async (req, res) => {
    try {
      const { completedBy } = req.body;
      const operador = completedBy || (req as any).user?.username || "Sistema";
      const [updated] = await db.update(hospitalityAlerts)
        .set({ status: "completed", isAcknowledged: true, acknowledgedAt: new Date(), acknowledgedBy: operador })
        .where(eq(hospitalityAlerts.id, req.params.alertId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Alert not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error completing alert" });
    }
  });

  app.get("/api/hospitality/dashboard", async (req, res) => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const in7days = new Date();
      in7days.setDate(in7days.getDate() + 7);
      const limit = in7days.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

      const allReservations = await storage.getReservations();
      const relevantReservations = allReservations.filter(r =>
        r.status === "checked_in" ||
        (r.status === "confirmed" && r.checkInDate >= today && r.checkInDate <= limit)
      );

      const relevantGuestIds = relevantReservations.map(r => r.guestId).filter(Boolean) as string[];
      const allActivePrefs = relevantGuestIds.length > 0
        ? await db.select().from(guestPreferences).where(
            and(eq(guestPreferences.isActive, true), inArray(guestPreferences.guestId, relevantGuestIds))
          )
        : [];
      const prefsByGuest = new Map<string, typeof allActivePrefs>();
      for (const p of allActivePrefs) {
        if (!prefsByGuest.has(p.guestId)) prefsByGuest.set(p.guestId, []);
        prefsByGuest.get(p.guestId)!.push(p);
      }

      const guestsWithPrefs = [];
      for (const r of relevantReservations) {
        if (!r.guestId) continue;
        const prefs = prefsByGuest.get(r.guestId) || [];
        if (prefs.length === 0) continue;
        const guest = await storage.getGuest(r.guestId);
        if (!guest) continue;
        guestsWithPrefs.push({
          guest,
          reservation: r,
          preferences: prefs,
          isInHouse: r.status === "checked_in",
          checkInDate: r.checkInDate,
          hasCritical: prefs.some(p => p.priority === "critical"),
          hasHigh: prefs.some(p => p.priority === "high"),
          hasSpecialDate: prefs.some(p => p.category === "fecha_especial"),
          hasDiet: prefs.some(p => p.category === "alimentacion"),
        });
      }

      const relevantReservationIds = new Set(relevantReservations.map(r => r.id));
      const allAlerts = await storage.getHospitalityAlerts();
      const pendingAlerts = allAlerts.filter(a =>
        a.status !== "completed" && relevantReservationIds.has(a.reservationId)
      );

      const criticalPrefs = guestsWithPrefs
        .filter(g => g.hasCritical)
        .map(g => ({ guest: g.guest, reservation: g.reservation, preferences: g.preferences.filter(p => p.priority === "critical") }));

      const upcomingSpecialDates = guestsWithPrefs
        .filter(g => g.hasSpecialDate)
        .map(g => ({ guest: g.guest, reservation: g.reservation, specialDates: g.preferences.filter(p => p.category === "fecha_especial") }));

      res.json({
        inHouseGuests: guestsWithPrefs.filter(g => g.isInHouse),
        upcomingGuests: guestsWithPrefs.filter(g => !g.isInHouse),
        pendingAlerts,
        upcomingSpecialDates,
        criticalPreferences: criticalPrefs,
        stats: {
          totalInHouseWithPrefs: guestsWithPrefs.filter(g => g.isInHouse).length,
          totalUpcomingWithPrefs: guestsWithPrefs.filter(g => !g.isInHouse).length,
          pendingAlertsCount: pendingAlerts.length,
          criticalCount: criticalPrefs.reduce((sum, g) => sum + g.preferences.length, 0),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching dashboard" });
    }
  });
}
