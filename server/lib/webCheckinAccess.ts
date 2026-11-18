import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { guests, reservations, webCheckins, type WebCheckin } from "@shared/schema";
import { db, withDatabaseTransaction } from "../db";

export class WebCheckinAccessError extends Error {
  constructor(message: string, public status = 410) { super(message); }
}

/** Valid through the arrival day in Argentina, independent of the server timezone. */
export function webCheckinExpiry(checkInDate: string): Date {
  return new Date(new Date(`${checkInDate}T00:00:00-03:00`).getTime() + 86_400_000);
}

export function publicHotelBaseUrl(fallback?: string): string {
  const configured = process.env.SITE_BASE_URL || process.env.BASE_URL || fallback || "https://maranpms.com.ar";
  const url = new URL(configured);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid public hotel URL");
  return url.origin;
}

async function access(reservationId: string, requested?: WebCheckin): Promise<WebCheckin> {
  // All generation paths lock the same reservation; no new unique index over legacy records is required.
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
  if (!reservation) throw new WebCheckinAccessError("Reserva no encontrada", 404);
  if (!["tentative", "pending", "confirmed", "web_checkin"].includes(reservation.status)) {
    throw new WebCheckinAccessError("Esta reserva no permite pre-ingreso.");
  }
  const [preferred] = await db.select().from(webCheckins).where(eq(webCheckins.reservationId, reservationId))
    .orderBy(sql`CASE WHEN ${webCheckins.status} = 'completed' THEN 0 ELSE 1 END`, desc(webCheckins.createdAt), desc(webCheckins.id)).limit(1);
  const [existing] = requested && preferred?.status !== "completed"
    ? await db.select().from(webCheckins).where(eq(webCheckins.id, requested.id))
    : [preferred];
  // Never reset submitted data, even if a confirmation is sent again.
  if (existing?.status === "completed") return existing;
  const expiresAt = webCheckinExpiry(reservation.checkInDate);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new WebCheckinAccessError("Este enlace ha expirado. Contactá a recepción.");
  }
  if (existing) {
    if (existing.status !== "pending" || existing.expiresAt?.getTime() !== expiresAt.getTime()) {
      const [updated] = await db.update(webCheckins).set({ status: "pending", expiresAt }).where(eq(webCheckins.id, existing.id)).returning();
      return updated;
    }
    return existing;
  }
  const [guest] = reservation.guestId ? await db.select().from(guests).where(eq(guests.id, reservation.guestId)) : [];
  const [created] = await db.insert(webCheckins).values({
    reservationId, token: randomUUID(), status: "pending", expiresAt,
    confirmedFirstName: guest?.firstName ?? null, confirmedLastName: guest?.lastName ?? null,
    confirmedDocumentType: guest?.documentType ?? null, confirmedDocumentNumber: guest?.documentNumber ?? null,
    confirmedNationality: guest?.nationality ?? null, confirmedPhone: guest?.phone ?? null,
    confirmedEmail: guest?.email ?? null,
  }).returning();
  return created;
}

export function getOrCreateWebCheckin(reservationId: string): Promise<WebCheckin> {
  return withDatabaseTransaction(() => access(reservationId));
}

export function getPublicWebCheckin(token: string): Promise<WebCheckin> {
  return withDatabaseTransaction(async () => {
    const [existing] = await db.select().from(webCheckins).where(eq(webCheckins.token, token));
    if (!existing) throw new WebCheckinAccessError("Web check-in no encontrado", 404);
    const checkin = await access(existing.reservationId, existing);
    if (checkin.status === "completed") throw new WebCheckinAccessError("Este web check-in ya fue completado", 409);
    return checkin;
  });
}
