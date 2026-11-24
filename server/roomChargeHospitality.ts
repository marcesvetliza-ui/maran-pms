import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { storage } from "./db-storage";
import { withReservationFinancialLock } from "./nightlyPricingGuard";
import { lockGroupAssignmentFinancialWriter } from "./groupGuestReplacement";
import {
  roomChargeSaleSchema,
  roomChargeInclusions,
} from "@shared/roomChargeHospitality";
import { groupMoneyCents } from "@shared/groupAccount";

function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
export async function createHospitalityRoomCharge(
  body: unknown,
  actor: { id: string; name: string },
) {
  const parsed = roomChargeSaleSchema.safeParse(body);
  if (!parsed.success)
    fail("Revisá el concepto, cantidad y vista previa de Hospitalidad.", 400);
  const input = parsed.data;
  const total = groupMoneyCents(input.amount);
  if (total <= 0) fail("El importe del cargo debe ser positivo.", 400);
  const snapshot = { ...input, actorId: actor.id };
  return withReservationFinancialLock(input.reservationId, () =>
    withDatabaseTransaction(async () => {
      await lockGroupAssignmentFinancialWriter(input.reservationId);
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"hospitality-charge:" + input.hospitalityRequestId}))`,
      );
      const [prior] = (
        await db.execute(
          sql`SELECT id,hospitality_creation_snapshot FROM charges WHERE hospitality_request_id=${input.hospitalityRequestId} FOR UPDATE`,
        )
      ).rows as any[];
      if (prior) {
        if (!isDeepStrictEqual(prior.hospitality_creation_snapshot, snapshot))
          fail(
            "El intento anterior conserva otros datos. Actualizá el cargo antes de continuar.",
          );
        return storage.getCharge(prior.id);
      }
      const [r] = (
        await db.execute(
          sql`SELECT * FROM reservations WHERE id=${input.reservationId} FOR UPDATE`,
        )
      ).rows as any[];
      if (!r) fail("Reserva no encontrada.", 404);
      if (
        ![
          "confirmed",
          "checked_in",
          "web_checkin",
          "pending",
          "tentative",
        ].includes(r.status)
      )
        fail("La estadía no está activa.");
      const closed = await db.execute(
        sql`SELECT id FROM folios WHERE entity_type='reservation' AND entity_id=${r.id} AND (status<>'open' OR closed_at IS NOT NULL)`,
      );
      if (closed.rows.length) fail("La cuenta de esta estadía está cerrada.");
      const [ct] = (
        await db.execute(
          sql`SELECT * FROM charge_types WHERE id=${input.chargeTypeId} FOR SHARE`,
        )
      ).rows as any[];
      if (!ct?.active)
        fail("El concepto ya no está habilitado. Volvé a seleccionarlo.");
      if (
        !isDeepStrictEqual(
          ct.hospitality_rules,
          input.hospitalityExpectedRules,
        ) ||
        !ct.hospitality_rules.length
      )
        fail(
          "Los incluidos del concepto cambiaron. Actualizá y revisá la vista previa.",
        );
      roomChargeInclusions(ct.hospitality_rules, input.quantity);
      if (input.category !== ct.category)
        fail("La categoría del concepto cambió. Volvé a seleccionarlo.");
      if (
        !ct.allow_price_edit &&
        total !== groupMoneyCents(ct.default_amount) * input.quantity
      )
        fail(
          "El precio del concepto cambió. Actualizá el importe y revisá la vista previa.",
        );
      if (
        input.isRecurring &&
        (!ct.allow_recurring ||
          input.quantity !== Number(r.nights) ||
          !input.unitAmount ||
          groupMoneyCents(input.unitAmount) * input.quantity !== total)
      )
        fail(
          "El cargo por noche debe coincidir con las noches y el importe de la estadía.",
        );
      await db.execute(
        sql`SELECT set_config('hospitality.actor_id',${actor.id},true),set_config('hospitality.actor_name',${actor.name},true)`,
      );
      const description =
        input.quantity > 1 && !/\s+\(x[1-9]\d*\)$/.test(input.description)
          ? `${input.description} (x${input.quantity})`
          : input.description;
      const charge = await storage.createCharge({
        reservationId: r.id,
        description,
        amount: input.amount,
        date: input.date,
        category: ct.category,
        createdBy: actor.name,
        status: "active",
        isRecurring: input.isRecurring || false,
        unitAmount: input.isRecurring ? input.unitAmount : null,
        chargeTypeId: ct.id,
        hospitalityUnits: input.quantity,
        hospitalityRulesSnapshot: ct.hospitality_rules,
        hospitalityRequestId: input.hospitalityRequestId,
        hospitalityCreationSnapshot: snapshot,
      });
      await storage.addFolioCharge(
        "reservation",
        r.id,
        Number(charge.amount),
        charge.description,
        "charge",
        charge.id,
        actor.name,
      );
      return charge;
    }),
  );
}
