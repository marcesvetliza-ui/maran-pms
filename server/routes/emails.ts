import type { Express } from "express";
import { db } from "../db";
import {
  emailConfig, emailLogs, surveyTokens, surveyResponses,
  reservations, guests, rooms, roomTypes,
} from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { requireAuth } from "../auth";
import { runReminderScheduler } from "../email-service";

export function registerEmailRoutes(app: Express) {
  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/email/config
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/email/config", requireAuth, async (_req, res) => {
    try {
      const [cfg] = await db.select().from(emailConfig).where(eq(emailConfig.id, 1));
      // Never expose API key or SMTP password — send booleans only
      if (cfg) {
        const { apiKey, smtpPass, ...safe } = cfg;
        res.json({ ...safe, apiKeySet: !!apiKey, smtpPassSet: !!smtpPass });
      } else {
        res.json(null);
      }
    } catch (e) {
      res.status(500).json({ error: "Error al obtener configuración" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/email/config
  // ──────────────────────────────────────────────────────────────────────────
  app.patch("/api/email/config", requireAuth, async (req, res) => {
    try {
      const {
        globalEnabled, provider, fromEmail, fromName, googleMapsUrl,
        confirmationEnabled, confirmationSubject, confirmationBody,
        reminderEnabled, reminderSubject, reminderBody,
        checkoutEnabled, checkoutSubject, checkoutBody,
        apiKey, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure,
      } = req.body;

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (globalEnabled !== undefined) updateData.globalEnabled = globalEnabled;
      if (provider !== undefined) updateData.provider = provider;
      if (fromEmail !== undefined) updateData.fromEmail = fromEmail;
      if (fromName !== undefined) updateData.fromName = fromName;
      if (googleMapsUrl !== undefined) updateData.googleMapsUrl = googleMapsUrl;
      if (confirmationEnabled !== undefined) updateData.confirmationEnabled = confirmationEnabled;
      if (confirmationSubject !== undefined) updateData.confirmationSubject = confirmationSubject;
      if (confirmationBody !== undefined) updateData.confirmationBody = confirmationBody;
      if (reminderEnabled !== undefined) updateData.reminderEnabled = reminderEnabled;
      if (reminderSubject !== undefined) updateData.reminderSubject = reminderSubject;
      if (reminderBody !== undefined) updateData.reminderBody = reminderBody;
      if (checkoutEnabled !== undefined) updateData.checkoutEnabled = checkoutEnabled;
      if (checkoutSubject !== undefined) updateData.checkoutSubject = checkoutSubject;
      if (checkoutBody !== undefined) updateData.checkoutBody = checkoutBody;
      // SMTP fields
      if (smtpHost !== undefined) updateData.smtpHost = smtpHost;
      if (smtpPort !== undefined) updateData.smtpPort = Number(smtpPort);
      if (smtpUser !== undefined) updateData.smtpUser = smtpUser;
      if (smtpSecure !== undefined) updateData.smtpSecure = smtpSecure;
      // Only update secrets if non-empty
      if (apiKey && typeof apiKey === "string" && apiKey.trim().length > 0) updateData.apiKey = apiKey.trim();
      if (smtpPass && typeof smtpPass === "string" && smtpPass.trim().length > 0) updateData.smtpPass = smtpPass.trim();

      await db.update(emailConfig).set(updateData).where(eq(emailConfig.id, 1));
      const [updated] = await db.select().from(emailConfig).where(eq(emailConfig.id, 1));
      const { apiKey: _k, smtpPass: _p, ...safe } = updated;
      res.json({ ...safe, apiKeySet: !!_k, smtpPassSet: !!_p });
    } catch (e) {
      res.status(500).json({ error: "Error al guardar configuración" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/email/logs
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/email/logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await db.select().from(emailLogs).orderBy(desc(emailLogs.sentAt)).limit(limit);
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: "Error al obtener logs" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/email/stats — summary for dashboard widget
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/email/stats", requireAuth, async (_req, res) => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const logs = await db.select().from(emailLogs).where(gte(emailLogs.sentAt, since));
      const total = logs.length;
      const sent = logs.filter(l => l.status === "sent").length;
      const failed = logs.filter(l => l.status === "failed").length;
      const skipped = logs.filter(l => l.status === "skipped").length;
      // Survey stats
      const responses = await db.select().from(surveyResponses);
      const avgOverall = responses.length
        ? (responses.reduce((s, r) => s + r.ratingOverall, 0) / responses.length).toFixed(1)
        : null;
      res.json({ total, sent, failed, skipped, surveyCount: responses.length, avgOverall });
    } catch (e) {
      res.status(500).json({ error: "Error al obtener estadísticas" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/email/test — send a test email to a given address
  // ──────────────────────────────────────────────────────────────────────────
  app.post("/api/email/test", requireAuth, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ error: "Email requerido" });
      const [cfg] = await db.select().from(emailConfig).where(eq(emailConfig.id, 1));
      if (!cfg) return res.status(400).json({ error: "Configuración no encontrada" });

      const from = `${cfg.fromName} <${cfg.fromEmail}>`;
      const subject = "Email de prueba — Maran Suites & Towers";
      const text = "Si recibiste este mensaje, el sistema de emails está funcionando correctamente.";

      if (cfg.provider === "smtp") {
        if (!cfg.smtpUser || !cfg.smtpPass) return res.status(400).json({ error: "SMTP: usuario o contraseña no configurados" });
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: cfg.smtpHost || "smtp.gmail.com",
          port: cfg.smtpPort || 587,
          secure: cfg.smtpSecure ?? false,
          auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        });
        await transporter.sendMail({ from, to, subject, text });
      } else {
        if (!cfg.apiKey) return res.status(400).json({ error: "API key de Resend no configurada" });
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, text }),
        });
        if (!r.ok) {
          const err = await r.text();
          return res.status(400).json({ error: `Error Resend: ${err}` });
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/email/run-reminder — manually trigger reminder scheduler
  // ──────────────────────────────────────────────────────────────────────────
  app.post("/api/email/run-reminder", requireAuth, async (req, res) => {
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const stats = await runReminderScheduler(baseUrl);
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: "Error al ejecutar recordatorios" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Survey public routes (no auth)
  // ──────────────────────────────────────────────────────────────────────────

  // GET /api/survey/:token — validate token and return reservation summary
  app.get("/api/survey/:token", async (req, res) => {
    try {
      const [tokenRow] = await db.select().from(surveyTokens).where(eq(surveyTokens.token, req.params.token));
      if (!tokenRow) return res.status(404).json({ error: "Encuesta no encontrada" });
      if (tokenRow.completed) return res.status(410).json({ error: "Encuesta ya completada", completed: true });
      if (tokenRow.expiresAt && new Date() > tokenRow.expiresAt)
        return res.status(410).json({ error: "Encuesta vencida" });

      // Get reservation + guest info
      const [reservation] = await db.select().from(reservations).where(eq(reservations.id, tokenRow.reservationId));
      const guest = reservation?.guestId
        ? (await db.select().from(guests).where(eq(guests.id, reservation.guestId)))[0]
        : null;
      const room = reservation?.roomId
        ? (await db.select().from(rooms).where(eq(rooms.id, reservation.roomId)))[0]
        : null;

      res.json({
        tokenId: tokenRow.id,
        guestName: guest ? `${guest.firstName} ${guest.lastName}` : "Huésped",
        checkIn: reservation?.checkInDate,
        checkOut: reservation?.checkOutDate,
        roomNumber: room?.roomNumber,
      });
    } catch (e) {
      res.status(500).json({ error: "Error al cargar encuesta" });
    }
  });

  // POST /api/survey/:token — submit survey response
  app.post("/api/survey/:token", async (req, res) => {
    try {
      const [tokenRow] = await db.select().from(surveyTokens).where(eq(surveyTokens.token, req.params.token));
      if (!tokenRow) return res.status(404).json({ error: "Encuesta no encontrada" });
      if (tokenRow.completed) return res.status(410).json({ error: "Encuesta ya completada" });
      if (tokenRow.expiresAt && new Date() > tokenRow.expiresAt)
        return res.status(410).json({ error: "Encuesta vencida" });

      const { ratingOverall, ratingRoom, ratingCleanliness, ratingService, ratingFood, comment, guestName } = req.body;
      if (!ratingOverall || !ratingRoom || !ratingCleanliness || !ratingService)
        return res.status(400).json({ error: "Faltan calificaciones obligatorias" });

      await db.insert(surveyResponses).values({
        surveyTokenId: tokenRow.id,
        ratingOverall: Number(ratingOverall),
        ratingRoom: Number(ratingRoom),
        ratingCleanliness: Number(ratingCleanliness),
        ratingService: Number(ratingService),
        ratingFood: ratingFood ? Number(ratingFood) : null,
        comment: comment || null,
        guestName: guestName || null,
      });
      await db.update(surveyTokens).set({ completed: true }).where(eq(surveyTokens.id, tokenRow.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Error al guardar respuesta" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/email/survey-responses — admin view of all responses
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/email/survey-responses", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const responses = await db
        .select({
          id: surveyResponses.id,
          ratingOverall: surveyResponses.ratingOverall,
          ratingRoom: surveyResponses.ratingRoom,
          ratingCleanliness: surveyResponses.ratingCleanliness,
          ratingService: surveyResponses.ratingService,
          ratingFood: surveyResponses.ratingFood,
          comment: surveyResponses.comment,
          guestName: surveyResponses.guestName,
          submittedAt: surveyResponses.submittedAt,
          reservationId: surveyTokens.reservationId,
        })
        .from(surveyResponses)
        .leftJoin(surveyTokens, eq(surveyResponses.surveyTokenId, surveyTokens.id))
        .orderBy(desc(surveyResponses.submittedAt))
        .limit(limit);
      res.json(responses);
    } catch (e) {
      res.status(500).json({ error: "Error al obtener respuestas" });
    }
  });
}
