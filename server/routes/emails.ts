import type { Express } from "express";
import { db } from "../db";
import {
  emailConfig, emailLogs, surveyTokens, surveyResponses,
  reservations, guests, rooms, roomTypes,
} from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { requireAuth } from "../auth";
import { runReminderScheduler } from "../email-service";

const HOTEL_BASE_URL_ROUTES =
  process.env.REPLIT_DEPLOYMENT_URL ||
  process.env.SITE_BASE_URL ||
  "https://hotelier-pro--marcesvetliza.replit.app";

const BORDO_R = "#8B1535";
const BORDO_DARK_R = "#6B1028";

function buildTestHtml(): string {
  const logoUrl = `${HOTEL_BASE_URL_ROUTES}/hotel-logo.jpeg`;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0ebe8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ebe8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 4px 16px rgba(139,21,53,0.12);">
        <tr><td style="background:${BORDO_DARK_R};height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="background:#ffffff;padding:28px 40px 24px;text-align:center;border-bottom:3px solid ${BORDO_R};">
            <img src="${logoUrl}" alt="Maran Suites &amp; Towers" width="260" style="display:block;margin:0 auto;max-width:260px;height:auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding:36px 44px 28px;color:#2c1a1f;font-size:15px;line-height:1.7;">
            <p style="margin:0 0 16px 0;">Si recibiste este mensaje, el sistema de emails está funcionando correctamente.</p>
            <p style="margin:0 0 16px 0;">Los correos automáticos (confirmación, recordatorio, post-checkout) se enviarán con este diseño.</p>
          </td>
        </tr>
        <tr><td style="padding:0 44px;"><hr style="border:none;border-top:1px solid #e8dfe2;margin:0;"></td></tr>
        <tr>
          <td style="padding:20px 44px 24px;text-align:center;color:#9e8087;font-size:12px;line-height:1.6;">
            <p style="margin:0 0 4px 0;font-weight:700;color:${BORDO_R};font-size:13px;letter-spacing:0.5px;">Maran Suites &amp; Towers — Hotel &amp; Spa</p>
            <p style="margin:0;">Este mensaje fue generado automáticamente. Por favor no responda a este correo.</p>
            <p style="margin:4px 0 0 0;">Para consultas comuníquese directamente con la recepción del hotel.</p>
          </td>
        </tr>
        <tr><td style="background:${BORDO_DARK_R};height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function registerEmailRoutes(app: Express) {
  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/email/config
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/email/config", requireAuth, async (_req, res) => {
    try {
      const [cfg] = await db.select().from(emailConfig).where(eq(emailConfig.id, 1));
      // Never expose API key, SMTP password, or raw base64 images — send booleans only
      if (cfg) {
        const { apiKey, smtpPass, emailBannerBase64, emailFooterBase64, ...safe } = cfg;
        res.json({ ...safe, apiKeySet: !!apiKey, smtpPassSet: !!smtpPass, bannerImageSet: !!emailBannerBase64, footerImageSet: !!emailFooterBase64 });
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

      const updateData: Record<string, any> = {};
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
      const { apiKey: _k, smtpPass: _p, emailBannerBase64: _b, emailFooterBase64: _f, ...safe } = updated;
      res.json({ ...safe, apiKeySet: !!_k, smtpPassSet: !!_p, bannerImageSet: !!_b, footerImageSet: !!_f });
    } catch (e) {
      res.status(500).json({ error: "Error al guardar configuración" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/email/upload-image — guarda banner o footer como base64 en DB
  // ──────────────────────────────────────────────────────────────────────────
  app.post("/api/email/upload-image", requireAuth, async (req, res) => {
    try {
      const { type, imageData } = req.body;
      if (!["banner", "footer"].includes(type)) return res.status(400).json({ error: "Tipo inválido" });
      if (!imageData || !String(imageData).startsWith("data:image/")) return res.status(400).json({ error: "Imagen inválida" });
      // Limit ~2MB base64
      if (String(imageData).length > 3_000_000) return res.status(400).json({ error: "Imagen demasiado grande (máx ~2 MB)" });

      const field = type === "banner" ? "emailBannerBase64" : "emailFooterBase64";
      await db.update(emailConfig).set({ [field]: imageData }).where(eq(emailConfig.id, 1));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Error al guardar imagen" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /api/email/upload-image/:type — borra banner o footer
  // ──────────────────────────────────────────────────────────────────────────
  app.delete("/api/email/upload-image/:type", requireAuth, async (req, res) => {
    try {
      const { type } = req.params;
      if (!["banner", "footer"].includes(type)) return res.status(400).json({ error: "Tipo inválido" });
      const field = type === "banner" ? "emailBannerBase64" : "emailFooterBase64";
      await db.update(emailConfig).set({ [field]: null }).where(eq(emailConfig.id, 1));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Error al eliminar imagen" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/public/email-images/:type — sirve banner/footer sin auth (para clientes de email)
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/public/email-images/:type", async (req, res) => {
    try {
      const { type } = req.params;
      if (!["banner", "footer"].includes(type)) return res.status(404).end();
      const [cfg] = await db.select().from(emailConfig).where(eq(emailConfig.id, 1));
      const dataUrl = type === "banner" ? cfg?.emailBannerBase64 : cfg?.emailFooterBase64;
      if (!dataUrl) return res.status(404).end();
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) return res.status(400).end();
      const [, mimeType, b64] = match;
      const buffer = Buffer.from(b64, "base64");
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(buffer);
    } catch (e) {
      res.status(500).end();
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
      const html = buildTestHtml();

      if (cfg.provider === "smtp") {
        if (!cfg.smtpUser || !cfg.smtpPass) return res.status(400).json({ error: "SMTP: usuario o contraseña no configurados" });
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: cfg.smtpHost || "smtp.gmail.com",
          port: cfg.smtpPort || 587,
          secure: cfg.smtpSecure ?? false,
          auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        });
        await transporter.sendMail({ from, to, subject, text, html });
      } else {
        if (!cfg.apiKey) return res.status(400).json({ error: "API key de Resend no configurada" });
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
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
