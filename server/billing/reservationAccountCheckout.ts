import { sql, eq } from "drizzle-orm";
import { auditLogs, reservationChangelog, reservations, rooms } from "@shared/schema";
import { getOperationalReservationCharges } from "@shared/reservationFolio";
import { db, withDatabaseTransaction } from "../db";
import { storage, getArgentinaToday } from "../db-storage";
import { withLodgingInventoryMutationLock } from "../inventoryMutationLock";
import { withFinancialScopeLock, withReservationFinancialLock } from "../nightlyPricingGuard";
import { parseReservationPaymentRequest } from "../reservationPaymentRequest";

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

/** Transfer the actual room balance and depart atomically. No fiscal issuance. */
export async function checkoutReservationToAccount(reservationId: string, body: Record<string, unknown>, actor: { id?: string; username?: string }) {
  const { operationId, entityType, entityId, expectedBalance } = body;
  if (typeof entityType !== "string" || !["guest", "company", "agency"].includes(entityType) || typeof entityId !== "string" || !entityId ||
    typeof expectedBalance !== "string" || !/^\d{1,8}\.\d{2}$/.test(expectedBalance) || Number(expectedBalance) <= 0) {
    throw fail("Seleccioná una cuenta corriente y confirmá el saldo a trasladar.", 400);
  }
  const request = parseReservationPaymentRequest({ paymentRequestId: operationId, reservationId,
    action: "checkout_to_account", entityType, entityId, expectedBalance }, String(actor.id || actor.username || ""));
  if (!request) throw fail("El cierre requiere una clave de operación.", 400);
  // Checkout already takes reservation-finance before the inventory mutex.
  // Keep that order so a concurrent ordinary checkout cannot deadlock here.
  return withReservationFinancialLock(reservationId, () => withFinancialScopeLock(`reservation-finance:${reservationId}`,
    () => withLodgingInventoryMutationLock(() => withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT id FROM reservations WHERE id=${reservationId} FOR UPDATE`);
    const reservation = await storage.getReservation(reservationId);
    if (!reservation) throw fail("No se encontró la reserva.", 404);
    const previous = await storage.getReservationPaymentRequest(request);
    if (previous) {
      if (reservation.status !== "checked_out" || previous.status === "anulado") throw fail("El traslado anterior requiere revisión antes de volver a cerrar la estadía.");
      return { success: true, alreadyClosed: true, paymentId: previous.id, amount: previous.amount, roomId: reservation.roomId };
    }
    if (!["checked_in", "confirmed", "pending"].includes(reservation.status)) throw fail("La reserva ya está cerrada o no admite check-out.");
    const tomorrow = new Date(`${getArgentinaToday()}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (reservation.checkOutDate > tomorrow.toISOString().slice(0, 10)) throw fail("Revisá la fecha de egreso antes de cerrar la estadía.");
    const group = await db.execute(sql`SELECT id FROM group_reservation_links WHERE reservation_id=${reservationId} LIMIT 1`);
    if (group.rows.length) throw fail("El saldo de esta habitación se administra desde el Folio Maestro del grupo.");
    const pending = await db.execute(sql`SELECT id FROM sales_invoices WHERE reserva_id=${reservationId} AND estado='autorizacion_pendiente' LIMIT 1`);
    if (pending.rows.length) throw fail("Completá o conciliá la autorización pendiente antes de trasladar el saldo.");
    const legacyDebt = await db.execute(sql`SELECT m.id FROM account_movements m WHERE m.reservation_id=${reservationId} AND m.type='cargo'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id=m.payment_id AND p.reservation_id=${reservationId}
        AND p.status IS DISTINCT FROM 'anulado' AND p.method IN ('cuenta_corriente','current_account')) LIMIT 1`);
    if (legacyDebt.rows.length) throw fail("Ya hay un cargo en Cuenta Corriente sin su liquidación vinculada. Revisalo antes de trasladar nuevamente la deuda.");
    const owner = entityType === "guest"
      ? (entityId === reservation.guestId ? await storage.getGuest(entityId) : null)
      : entityType === "company" ? await storage.getCompany(entityId) : await storage.getAgency(entityId);
    if (!owner) throw fail("La cuenta corriente seleccionada no corresponde a una entidad válida.", 400);
    const [charges, paid] = await Promise.all([storage.getCharges(reservationId), storage.getPaymentsTotal(reservationId)]);
    const saved = Number(reservation.totalRoomAmount || 0);
    const lodging = saved > 0 ? saved : Number(reservation.finalRatePerNight || 0) * Number(reservation.nights || 0);
    const balance = Math.round((lodging + getOperationalReservationCharges(charges).reduce((sum, c) => sum + Number(c.amount), 0) - paid) * 100);
    if (!Number.isSafeInteger(balance) || balance <= 0 || balance !== Math.round(Number(expectedBalance) * 100)) {
      throw fail("El saldo cambió. Actualizá el folio y confirmá nuevamente el importe a trasladar.");
    }
    const amount = (balance / 100).toFixed(2);
    const reference = `checkout-cc:${reservationId}:${request.id}`;
    const label = `Saldo por estadía ${reservation.reservationCode} — Hab. ${reservation.room?.roomNumber || reservation.roomId} (cierre con deuda)`;
    const payment = await storage.createReservationPaymentWithLedger({ paymentRequest: request,
      payment: { reservationId, amount, method: "cuenta_corriente", date: getArgentinaToday(), reference, notes: label,
        billingTarget: entityType as "guest" | "company" | "agency", companyId: entityType === "company" ? entityId : null, agencyId: entityType === "agency" ? entityId : null },
      sourceLabel: label, registeredBy: actor.username, receiptType: "none",
      accountSettlement: { entityType: entityType as "guest" | "company" | "agency", entityId, description: label, reference, createdBy: actor.id || null } });
    await db.update(reservations).set({ status: "checked_out", checkedOutAt: new Date() }).where(eq(reservations.id, reservationId));
    await db.update(rooms).set({ status: "dirty" }).where(eq(rooms.id, reservation.roomId));
    const note = `Check-out con traslado de $${amount} a Cuenta Corriente. La deuda queda pendiente en la entidad seleccionada; sin cobro monetario ni nueva factura.`;
    await db.insert(reservationChangelog).values({ reservationId, operador: actor.username, tipo: "checkout", descripcion: note });
    await db.insert(auditLogs).values({ userId: actor.id || null, userName: actor.username || null, action: "update", module: "reservations",
      entityType: "reservation", entityId: reservationId, description: note, timestamp: new Date(),
      details: JSON.stringify({ operationId: request.id, amount, accountEntityType: entityType, accountEntityId: entityId, paymentId: payment.id }) });
    return { success: true, alreadyClosed: false, paymentId: payment.id, amount, roomId: reservation.roomId };
  }))));
}
