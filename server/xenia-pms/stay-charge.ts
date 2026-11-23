import { sql } from "drizzle-orm";
import { charges, auditLogs } from "../../shared/schema";
import { db, withDatabaseTransaction } from "../db";
import { storage } from "../db-storage";
import { withReservationFinancialLock } from "../nightlyPricingGuard";
import { qaChargeInput } from "./operations";

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

/** QA uses the common storage/folio ledger inside one explicit transaction. */
export async function createQaStayCharge(body: unknown, actor: Express.User) {
  const input = qaChargeInput.parse(body);
  const id = "xenia-qa-charge:" + input.operationId;
  const amount = Number(input.amount).toFixed(2);
  return withReservationFinancialLock(input.reservationId, () => withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    const previous = await storage.getCharge(id);
    if (previous) {
      if (previous.reservationId !== input.reservationId || previous.createdBy !== actor.id ||
          previous.description !== input.description || previous.amount !== amount || previous.category !== input.category ||
          previous.date !== input.date || !!previous.isRecurring !== !!input.isRecurring ||
          (previous.unitAmount == null ? null : Number(previous.unitAmount).toFixed(2)) !==
          (input.unitAmount == null ? null : Number(input.unitAmount).toFixed(2)))
        throw fail("Esta operación ya se usó con otros datos. Actualizá el folio.");
      return { charge: previous, replayed: true };
    }
    const reservation = await storage.getReservation(input.reservationId);
    if (!reservation) throw fail("Reserva no encontrada.", 404);
    if (!["confirmed", "pending", "checked_in"].includes(reservation.status) || reservation.groupId)
      throw fail("Este ensayo admite consumos en estadías individuales activas.");
    const { operationId, ...data } = input;
    const [charge] = await db.insert(charges).values({ ...data, amount,
      id, createdBy: actor.id }).returning();
    await storage.addFolioCharge("reservation", input.reservationId, Number(amount), input.description, "charge", id, actor.username);
    await db.insert(auditLogs).values({ userId: actor.id, userName: actor.username, action: "create", module: "reservations",
      entityType: "charge", entityId: id, description: "Consumo de prueba: " + input.description,
      details: JSON.stringify({ operationId, reservationId: input.reservationId, amount }), timestamp: new Date() });
    return { charge, replayed: false };
  }));
}
