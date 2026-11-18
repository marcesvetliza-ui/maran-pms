import { and, desc, eq, sql } from "drizzle-orm";
import { auditLogs, rooms, reservationChangelog } from "@shared/schema";
import { isOperationalInventoryRoom } from "@shared/room-availability";
import { db, withDatabaseTransaction } from "./db";
import { storage, getArgentinaToday } from "./db-storage";
import { withLodgingInventoryMutationLock } from "./inventoryMutationLock";
import { withFinancialScopeLock, withReservationFinancialLock } from "./nightlyPricingGuard";

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const day = (date: Date | string) => new Date(date).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export async function checkoutReversalEligibility(id: string) {
  const reservation = await storage.getReservation(id);
  if (!reservation) throw fail("Reserva no encontrada.", 404);
  if (reservation.status !== "checked_out") return { allowed: false, reason: "La reserva no tiene check-out realizado." };
  let checkedOutAt: Date | string | null = reservation.checkedOutAt;
  // Some legacy/group departure paths did not stamp checked_out_at. Only a
  // recorded status transition proves when they departed; scheduled dates do not.
  if (!checkedOutAt) {
    // Typed timestamp decoding follows the UTC convention used by the audit
    // writer, independently of PostgreSQL's and Node's local time zones.
    const logs = await db.select({ timestamp: auditLogs.timestamp, details: auditLogs.details }).from(auditLogs)
      .where(and(eq(auditLogs.entityType, "reservation"), eq(auditLogs.entityId, id),
        eq(auditLogs.module, "reservations"), eq(auditLogs.action, "update")))
      .orderBy(desc(auditLogs.timestamp)).limit(100);
    const transition = logs.find(log => {
      try { const value = JSON.parse(log.details || "null"); return value?.before?.status !== "checked_out" && value?.before?.status && value?.after?.status === "checked_out"; }
      catch { return false; }
    });
    checkedOutAt = transition?.timestamp || null;
  }
  const allowed = !!checkedOutAt && day(checkedOutAt) === getArgentinaToday();
  return { allowed, reason: allowed ? null : "Solo se puede revertir una salida registrada hoy. Para consumos posteriores, usá Cuenta y facturación." };
}

/** Physical reinstatement is distinct from financial work on an old account. */
export async function reverseCheckout(id: string, actor: { id?: string; username?: string }, overrideGroupWarning = false) {
  return withReservationFinancialLock(id, () => withFinancialScopeLock(`reservation-finance:${id}`, () =>
    withLodgingInventoryMutationLock(() => withDatabaseTransaction(async () => {
      await db.execute(sql`SELECT id FROM reservations WHERE id=${id} FOR UPDATE`);
      const eligibility = await checkoutReversalEligibility(id);
      if (!eligibility.allowed) throw fail(eligibility.reason!);
      const reservation = (await storage.getReservation(id))!;
      const room = await storage.getRoom(reservation.roomId);
      if (!room || !isOperationalInventoryRoom(room) || ["maintenance", "oos"].includes(room.status)) {
        throw fail("La habitación no está disponible para retomar el alojamiento.");
      }
      const occupied = (await db.execute(sql`SELECT id FROM reservations WHERE room_id=${room.id} AND id<>${id} AND status='checked_in' LIMIT 1`)).rows.length;
      const today = getArgentinaToday();
      const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const end = reservation.checkOutDate > today ? reservation.checkOutDate : tomorrow.toISOString().slice(0, 10);
      if (occupied || await storage.checkOverbooking(room.id, today, end, id)) {
        throw fail("La habitación ya tiene otra reserva u otro huésped. Para agregar o facturar consumos, usá Cuenta y facturación sin revertir el check-out.");
      }
      await storage.updateReservation(id, { status: "checked_in", checkedOutAt: null, lastModifiedBy: actor.username,
        _inventoryOverrideTentativeGroupWarning: overrideGroupWarning } as any);
      await db.update(rooms).set({ status: "occupied" }).where(eq(rooms.id, room.id));
      await db.insert(reservationChangelog).values({ reservationId: id, operador: actor.username || "Sistema", tipo: "undo_checkout",
        descripcion: "Check-out revertido: el huésped retoma el alojamiento y la habitación queda ocupada. Facturas y cobros conservados." });
      return { success: true };
    }))));
}
