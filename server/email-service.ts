import { db } from "./db";
import { emailConfig, emailLogs, surveyTokens, reservations, guests, rooms } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

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
// Get config (cached per call)
// ─────────────────────────────────────────────────────────────────────────────
async function getConfig() {
  const [cfg] = await db.select().from(emailConfig).where(eq(emailConfig.id, 1));
  return cfg ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level send via Resend REST API (no package needed)
// ─────────────────────────────────────────────────────────────────────────────
async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
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
// Core send function (wraps config check + logging)
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmail(opts: {
  reservationId: string;
  type: "confirmation" | "reminder" | "checkout";
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const cfg = await getConfig();
  if (!cfg) return;
  if (!cfg.globalEnabled) {
    await logEmail({ ...opts, status: "skipped", recipientEmail: opts.to, errorMessage: "Sistema global desactivado" });
    return;
  }
  if (!cfg.apiKey) {
    await logEmail({ ...opts, status: "skipped", recipientEmail: opts.to, errorMessage: "API key no configurada" });
    return;
  }
  const from = `${cfg.fromName} <${cfg.fromEmail}>`;
  const result = await sendViaResend({ apiKey: cfg.apiKey, from, to: opts.to, subject: opts.subject, text: opts.body });
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

    // Find reservations with check-in on target date (confirmed / checked_in)
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
      const vars = {
        nombre_huesped: `${guest.firstName} ${guest.lastName}`,
        numero_habitacion: room?.roomNumber ?? "-",
        fecha_checkin: fmtDate(row.check_in_date),
        fecha_checkout: fmtDate(row.check_out_date),
        codigo_reserva: row.reservation_code ?? reservationId,
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
