import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { storage } from "./db-storage";
import { withLodgingInventoryMutationLock } from "./inventoryMutationLock";
import { withReservationFinancialLock } from "./nightlyPricingGuard";
import {
  compatibleGroupBlocks,
  summarizeGroupBlocks,
} from "@shared/groupBlockAssignments";

const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
/** Metadata only: never reprices, moves, closes, charges or invoices a stay. */
export async function associateReservationBlock(
  groupId: string,
  reservationId: string,
  blockId: string,
  actor: { id?: string; username?: string },
) {
  return withReservationFinancialLock(reservationId, () =>
    withLodgingInventoryMutationLock(() =>
      withDatabaseTransaction(async () => {
        await db.execute(sql`SET LOCAL lock_timeout='3s'`);
        await db.execute(
          sql`SELECT id FROM groups WHERE id=${groupId} FOR UPDATE`,
        );
        await db.execute(
          sql`SELECT id FROM reservations WHERE id=${reservationId} FOR UPDATE`,
        );
        const group = await storage.getGroup(groupId);
        if (!group) throw fail("Grupo no encontrado.", 404);
        const reservation = group.reservations.find(
          (r) => r.id === reservationId,
        );
        if (
          !reservation ||
          ["cancelled", "no_show"].includes(reservation.status)
        )
          throw fail("Seleccioná una asignación vigente de este grupo.");
        const links = (
          await db.execute(
            sql`SELECT id,group_id,block_id FROM group_reservation_links WHERE reservation_id=${reservationId} FOR UPDATE`,
          )
        ).rows as any[];
        if (links.length !== 1 || links[0].group_id !== groupId)
          throw fail(
            "El vínculo de esta reserva requiere revisión antes de ubicarla en un bloque.",
          );
        const block = compatibleGroupBlocks(group, reservation, false).find(
          (b) => b.id === blockId,
        );
        if (!block)
          throw fail(
            "El bloque no corresponde a la categoría y las fechas de la reserva.",
          );
        if (links[0].block_id === blockId)
          return { reservationId, blockId, replayed: true };
        const summary = summarizeGroupBlocks(group).byBlock[blockId];
        const others = summary.reservations.filter(
          (r) => r.id !== reservationId,
        );
        if (others.length >= block.quantity)
          throw fail("El bloque ya tiene todos sus cupos asignados.");
        await db.execute(
          sql`UPDATE group_reservation_links SET block_id=${blockId} WHERE id=${links[0].id}`,
        );
        await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${actor.id || null},${actor.username || "Sistema"},'update','groups','group',${groupId},'Asignación identificada en su bloque; reserva y cuenta conservadas',${JSON.stringify({ reservationId, previousBlockId: links[0].block_id, blockId })},now())`);
        return { reservationId, blockId, replayed: false };
      }),
    ),
  );
}
