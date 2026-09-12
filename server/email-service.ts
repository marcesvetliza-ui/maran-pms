import { db } from "./db";
import { emailConfig, emailLogs, surveyTokens, reservations, guests, rooms, webCheckins } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { shouldBlockExternalComm } from "./external-comms-policy";

// ─────────────────────────────────────────────────────────────────────────────
// Template interpolation
// ─────────────────────────────────────────────────────────────────────────────
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  const [y, m, day] = d.split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML email template — branded hotel layout with logo
// ─────────────────────────────────────────────────────────────────────────────
const HOTEL_BASE_URL =
  process.env.REPLIT_DEPLOYMENT_URL ||
  process.env.SITE_BASE_URL ||
  "https://hotelier-pro--marcesvetliza.replit.app";

const BORDO = "#8B1535";
const BORDO_DARK = "#6B1028";

function buildHtmlEmail(bodyText: string, subject: string, images?: { bannerUrl?: string; footerImageUrl?: string }): string {
  const logoUrl = `${HOTEL_BASE_URL}/hotel-logo.jpeg`;

  // Convert plain text paragraphs to HTML, converting URLs to links
  const bodyHtml = bodyText
    .split(/\n\n+/)
    .map(para => {
      const lines = para
        .split(/\n/)
        .map(line =>
          line.replace(
            /(https?:\/\/[^\s]+)/g,
            `<a href="$1" style="color:${BORDO};text-decoration:underline;font-weight:600;">$1</a>`,
          )
        )
        .join("<br>");
      return `<p style="margin:0 0 16px 0;line-height:1.7;">${lines}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ebe8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ebe8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 4px 16px rgba(139,21,53,0.12);">

          <!-- TOP BORDO BAR -->
          <tr>
            <td style="background:${BORDO_DARK};height:8px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- LOGO HEADER -->
          <tr>
            <td style="background:#ffffff;padding:28px 40px 24px;text-align:center;border-bottom:${images?.bannerUrl ? "none" : `3px solid ${BORDO}`};">
              <img src="${logoUrl}" alt="Maran Suites &amp; Towers" width="260" style="display:block;margin:0 auto;max-width:260px;height:auto;" />
            </td>
          </tr>
          ${images?.bannerUrl ? `
          <!-- BANNER IMAGE -->
          <tr>
            <td style="padding:0;margin:0;border-bottom:3px solid ${BORDO};">
              <img src="${images.bannerUrl}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;" />
            </td>
          </tr>` : ""}

          <!-- BODY -->
          <tr>
            <td style="padding:36px 44px 28px;color:#2c1a1f;font-size:15px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 44px;">
              <hr style="border:none;border-top:1px solid #e8dfe2;margin:0;">
            </td>
          </tr>

          ${images?.footerImageUrl ? `
          <!-- FOOTER IMAGE -->
          <tr>
            <td style="padding:0;margin:0;">
              <img src="${images.footerImageUrl}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;" />
            </td>
          </tr>` : ""}

          <!-- FOOTER -->
          <tr>
            <td style="padding:20px 44px 24px;text-align:center;color:#9e8087;font-size:12px;line-height:1.6;">
              <p style="margin:0 0 4px 0;font-weight:700;color:${BORDO};font-size:13px;letter-spacing:0.5px;">Maran Suites &amp; Towers — Hotel &amp; Spa</p>
              <p style="margin:0;">Este mensaje fue generado automáticamente. Por favor no responda a este correo.</p>
              <p style="margin:4px 0 0 0;">Para consultas comuníquese directamente con la recepción del hotel.</p>
            </td>
          </tr>

          <!-- BOTTOM BORDO BAR -->
          <tr>
            <td style="background:${BORDO_DARK};height:5px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get config
// ─────────────────────────────────────────────────────────────────────────────
async function getConfig() {
  const [cfg] = await db.select().from(emailConfig).where(eq(emailConfig.id, 1));
  return cfg ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Send via Resend REST API (supports HTML)
// ─────────────────────────────────────────────────────────────────────────────
async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Resend error ${res.status}: ${err}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send via SMTP (Gmail / cualquier servidor) — supports HTML
// ─────────────────────────────────────────────────────────────────────────────
async function sendViaSmtp(opts: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const transportOptions: SMTPTransport.Options & { family: number } = {
      host: opts.host,
      port: opts.port,
      secure: opts.secure,
      auth: { user: opts.user, pass: opts.pass },
      family: 4, // force IPv4 — Replit production has no IPv6 route
    };
    const transporter = nodemailer.createTransport(transportOptions);
    await transporter.sendMail({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Log helper
// ─────────────────────────────────────────────────────────────────────────────
async function logEmail(opts: {
  reservationId?: string;
  type: string;
  status: "sent" | "failed" | "skipped";
  recipientEmail?: string;
  errorMessage?: string;
}) {
  await db.insert(emailLogs).values({
    reservationId: opts.reservationId,
    type: opts.type,
    status: opts.status,
    recipientEmail: opts.recipientEmail,
    errorMessage: opts.errorMessage,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core send function — routes to Resend or SMTP, always sends HTML + text
// Exportada (además de usarse internamente) para poder testear directamente
// el bloqueo por ambiente sin pasar por una reserva/huésped real en DB.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendEmail(opts: {
  reservationId: string;
  type: "confirmation" | "reminder" | "checkout";
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (shouldBlockExternalComm({ integration: "email", action: opts.type })) {
    await logEmail({
      reservationId: opts.reservationId,
      type: opts.type,
      status: "skipped",
      recipientEmail: opts.to,
      errorMessage: "Bloqueado por ambiente (APP_ENV≠production)",
    });
    return;
  }

  const cfg = await getConfig();
  if (!cfg) return;
  if (!cfg.globalEnabled) {
    await logEmail({ ...opts, status: "skipped", recipientEmail: opts.to, errorMessage: "Sistema global desactivado" });
    return;
  }

  const from = `${cfg.fromName} <${cfg.fromEmail}>`;
  const bannerUrl = (cfg as any).emailBannerBase64 ? `${HOTEL_BASE_URL}/api/public/email-images/banner` : undefined;
  const footerImageUrl = (cfg as any).emailFooterBase64 ? `${HOTEL_BASE_URL}/api/public/email-images/footer` : undefined;
  const html = buildHtmlEmail(opts.body, opts.subject, { bannerUrl, footerImageUrl });
  let result: { ok: boolean; error?: string };

  if (cfg.provider === "smtp") {
    if (!cfg.smtpUser || !cfg.smtpPass) {
      await logEmail({ ...opts, status: "skipped", recipientEmail: opts.to, errorMessage: "SMTP: usuario o contraseña no configurados" });
      return;
    }
    result = await sendViaSmtp({
      host: cfg.smtpHost || "smtp.gmail.com",
      port: cfg.smtpPort || 587,
      secure: cfg.smtpSecure ?? false,
      user: cfg.smtpUser,
      pass: cfg.smtpPass,
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
      html,
    });
  } else {
    if (!cfg.apiKey) {
      await logEmail({ ...opts, status: "skipped", recipientEmail: opts.to, errorMessage: "Resend: API key no configurada" });
      return;
    }
    result = await sendViaResend({ apiKey: cfg.apiKey, from, to: opts.to, subject: opts.subject, text: opts.body, html });
  }

  if (result.ok) {
    await logEmail({ reservationId: opts.reservationId, type: opts.type, status: "sent", recipientEmail: opts.to });
  } else {
    await logEmail({ reservationId: opts.reservationId, type: opts.type, status: "failed", recipientEmail: opts.to, errorMessage: result.error });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get reservation + guest + room data for a given reservation ID
// ─────────────────────────────────────────────────────────────────────────────
async function getReservationData(reservationId: string) {
  const [res] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!res) return null;
  const [guest] = res.guestId ? await db.select().from(guests).where(eq(guests.id, res.guestId)) : [null];
  const [room] = res.roomId ? await db.select().from(rooms).where(eq(rooms.id, res.roomId)) : [null];
  return { reservation: res, guest, room };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get or create web check-in token for a reservation
// ─────────────────────────────────────────────────────────────────────────────
async function getOrCreateWebCheckinToken(reservationId: string): Promise<string> {
  const [existing] = await db.select().from(webCheckins).where(eq(webCheckins.reservationId, reservationId));
  if (existing) return existing.token;

  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 3); // valid for 3 days (arrives in 2 days)
  await db.insert(webCheckins).values({ reservationId, token, status: "pending", expiresAt });
  return token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: Send a transactional email with a PDF attachment (no reservation ID required)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendEmailWithPdfAttachment(opts: {
  to: string;
  subject: string;
  body: string;
  attachmentFilename: string;
  attachmentBuffer: Buffer;
}): Promise<{ ok: boolean; error?: string }> {
  if (shouldBlockExternalComm({ integration: "email", action: "pdf-attachment" })) {
    return { ok: false, error: "Envío de email bloqueado por ambiente (APP_ENV≠production)" };
  }

  const cfg = await getConfig();
  if (!cfg) return { ok: false, error: "Email no configurado" };
  if (!cfg.globalEnabled) return { ok: false, error: "Sistema de email desactivado" };

  const from = `${cfg.fromName} <${cfg.fromEmail}>`;
  const html = buildHtmlEmail(opts.body, opts.subject);

  if (cfg.provider === "smtp") {
    if (!cfg.smtpUser || !cfg.smtpPass) {
      return { ok: false, error: "SMTP: usuario o contraseña no configurados" };
    }
    try {
      const transportOptions: SMTPTransport.Options & { family: number } = {
        host: cfg.smtpHost || "smtp.gmail.com",
        port: cfg.smtpPort || 587,
        secure: cfg.smtpSecure ?? false,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        family: 4, // force IPv4 — Replit production has no IPv6 route
      };
      const transporter = nodemailer.createTransport(transportOptions);
      await transporter.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.body,
        html,
        attachments: [
          { filename: opts.attachmentFilename, content: opts.attachmentBuffer, contentType: "application/pdf" },
        ],
      });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  } else {
    if (!cfg.apiKey) return { ok: false, error: "Resend: API key no configurada" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [opts.to],
          subject: opts.subject,
          text: opts.body,
          html,
          attachments: [
            { filename: opts.attachmentFilename, content: opts.attachmentBuffer.toString("base64") },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return { ok: false, error: `Resend error ${res.status}: ${err}` };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: Send confirmation email
// ─────────────────────────────────────────────────────────────────────────────
export async function sendConfirmationEmail(reservationId: string): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.globalEnabled || !cfg.confirmationEnabled) {
      if (cfg) await logEmail({ reservationId, type: "confirmation", status: "skipped", errorMessage: "Confirmación desactivada" });
      return;
    }
    const data = await getReservationData(reservationId);
    if (!data) return;
    const { reservation, guest, room } = data;
    const email = guest?.email;
    if (!email) {
      await logEmail({ reservationId, type: "confirmation", status: "skipped", recipientEmail: undefined, errorMessage: "Huésped sin email" });
      return;
    }
    const vars = {
      nombre_huesped: `${guest.firstName} ${guest.lastName}`,
      numero_habitacion: room?.roomNumber ?? "-",
      fecha_checkin: fmtDate(reservation.checkInDate),
      fecha_checkout: fmtDate(reservation.checkOutDate),
      codigo_reserva: reservation.reservationCode ?? reservation.id,
    };
    await sendEmail({
      reservationId,
      type: "confirmation",
      to: email,
      subject: interpolate(cfg.confirmationSubject, vars),
      body: interpolate(cfg.confirmationBody, vars),
    });
  } catch (e) {
    console.error("[email] sendConfirmationEmail error:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: Send post-checkout + survey email
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCheckoutEmail(reservationId: string, baseUrl: string): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.globalEnabled || !cfg.checkoutEnabled) {
      if (cfg) await logEmail({ reservationId, type: "checkout", status: "skipped", errorMessage: "Post-checkout desactivado" });
      return;
    }
    const data = await getReservationData(reservationId);
    if (!data) return;
    const { reservation, guest, room } = data;
    const email = guest?.email;
    if (!email) {
      await logEmail({ reservationId, type: "checkout", status: "skipped", errorMessage: "Huésped sin email" });
      return;
    }
    // Generate survey token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await db.insert(surveyTokens).values({ reservationId, token, expiresAt });

    const surveyUrl = `${baseUrl}/encuesta/${token}`;
    const vars = {
      nombre_huesped: `${guest.firstName} ${guest.lastName}`,
      numero_habitacion: room?.roomNumber ?? "-",
      fecha_checkin: fmtDate(reservation.checkInDate),
      fecha_checkout: fmtDate(reservation.checkOutDate),
      link_encuesta: surveyUrl,
      link_google_maps: cfg.googleMapsUrl ?? "https://maps.google.com",
    };
    await sendEmail({
      reservationId,
      type: "checkout",
      to: email,
      subject: interpolate(cfg.checkoutSubject, vars),
      body: interpolate(cfg.checkoutBody, vars),
    });
  } catch (e) {
    console.error("[email] sendCheckoutEmail error:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: Reminder scheduler — call daily (from night-audit or own scheduler)
// Sends reminder to guests with check-in in exactly 2 days
// Includes web check-in link automatically
// ─────────────────────────────────────────────────────────────────────────────
export async function runReminderScheduler(baseUrl: string): Promise<{ sent: number; skipped: number; failed: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.globalEnabled || !cfg.reminderEnabled) return stats;

    // Calculate target date (today + 2 days, Argentina time)
    const now = new Date();
    const argOffset = -3 * 60;
    const argNow = new Date(now.getTime() + (argOffset - now.getTimezoneOffset()) * 60000);
    const target = new Date(argNow);
    target.setDate(target.getDate() + 2);
    const targetStr = target.toISOString().split("T")[0];

    // Find reservations with check-in on target date (confirmed)
    const { sql: sqlFn } = await import("drizzle-orm");
    const pendingRes = await db.execute(sqlFn`
      SELECT r.id, r.guest_id, r.room_id, r.check_in_date, r.check_out_date, r.reservation_code
      FROM reservations r
      WHERE r.check_in_date = ${targetStr}::date
        AND r.status IN ('confirmed')
        AND NOT EXISTS (
          SELECT 1 FROM email_logs el
          WHERE el.reservation_id = r.id
            AND el.type = 'reminder'
            AND el.status = 'sent'
        )
    `);

    for (const row of pendingRes.rows as any[]) {
      const reservationId = row.id;
      const [guest] = row.guest_id ? await db.select().from(guests).where(eq(guests.id, row.guest_id)) : [null];
      const [room] = row.room_id ? await db.select().from(rooms).where(eq(rooms.id, row.room_id)) : [null];
      const email = guest?.email;
      if (!email) {
        await logEmail({ reservationId, type: "reminder", status: "skipped", errorMessage: "Huésped sin email" });
        stats.skipped++;
        continue;
      }

      // Generate or retrieve web check-in token
      let webCheckinLink = "";
      try {
        const token = await getOrCreateWebCheckinToken(reservationId);
        webCheckinLink = `${baseUrl}/web-checkin/${token}`;
      } catch (e) {
        console.error("[email] Error generating web check-in token:", e);
      }

      const vars: Record<string, string> = {
        nombre_huesped: `${guest.firstName} ${guest.lastName}`,
        numero_habitacion: room?.roomNumber ?? "-",
        fecha_checkin: fmtDate(row.check_in_date),
        fecha_checkout: fmtDate(row.check_out_date),
        codigo_reserva: row.reservation_code ?? reservationId,
        link_webcheckin: webCheckinLink,
      };

      await sendEmail({
        reservationId,
        type: "reminder",
        to: email,
        subject: interpolate(cfg.reminderSubject, vars),
        body: interpolate(cfg.reminderBody, vars),
      });
      stats.sent++;
    }
  } catch (e) {
    console.error("[email] runReminderScheduler error:", e);
  }
  return stats;
}
