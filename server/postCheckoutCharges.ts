import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { auditLogs, charges, reservationChangelog } from "@shared/schema";
import { POST_CHECKOUT_CHARGE_PREFIX } from "@shared/postCheckout";
import { storage, getArgentinaToday } from "./db-storage";
import { withReservationFinancialLock } from "./nightlyPricingGuard";

const inputSchema = z.object({
  operationId: z.string().uuid(),
  description: z.string().trim().min(3).max(500),
  amount: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/).refine(value => Number(value) > 0),
  category: z.enum(["restaurant", "spa", "minibar", "otros"]),
}).strict();
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

/** No stay/room update: charge, folio movement and audit commit together. */
export async function addPostCheckoutCharge(reservationId: string, body: unknown, actor: { id?: string; username?: string }) {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) throw fail("Revisá la descripción, el importe y la categoría del consumo.", 400);
  const input = parsed.data;
  const id = `${POST_CHECKOUT_CHARGE_PREFIX}${input.operationId}`;
  const amount = Number(input.amount).toFixed(2);
  return withReservationFinancialLock(reservationId, () => withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT id FROM reservations WHERE id=${reservationId} FOR UPDATE`);
    const reservation = await storage.getReservation(reservationId);
    if (!reservation) throw fail("Reserva no encontrada.", 404);
    if (reservation.status !== "checked_out") throw fail("Los consumos posteriores se cargan en una estadía con check-out realizado.");
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    const previous = await storage.getCharge(id);
    if (previous) {
      if (previous.reservationId !== reservationId || previous.description !== input.description ||
          previous.amount !== amount || previous.category !== input.category || previous.createdBy !== actor.id) {
        throw fail("La operación ya se utilizó con otros datos. Actualizá la cuenta antes de continuar.");
      }
      return { charge: previous, replayed: true };
    }
    const [charge] = await db.insert(charges).values({ id, reservationId, description: input.description, amount,
      category: input.category, date: getArgentinaToday(), createdBy: actor.id || null }).returning();
    await storage.addFolioCharge("reservation", reservationId, Number(amount), input.description, "charge", id, actor.username);
    const description = `Consumo posterior al check-out: ${input.description} — $${amount}. La estadía permanece cerrada.`;
    await db.insert(reservationChangelog).values({ reservationId, operador: actor.username || "Sistema", tipo: "post_checkout_charge", descripcion: description });
    await db.insert(auditLogs).values({ userId: actor.id || null, userName: actor.username || "Sistema", action: "create",
      module: "reservations", entityType: "reservation", entityId: reservationId, description, timestamp: new Date(),
      details: JSON.stringify({ operationId: input.operationId, chargeId: id, amount, category: input.category, checkedOutAt: reservation.checkedOutAt }) });
    return { charge, replayed: false };
  }));
}
