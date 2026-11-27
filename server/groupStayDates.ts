import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withReadOnlyDatabaseTransaction } from "./db";
import { groups, groupRoomBlocks, groupReservationLinks, reservations, type Group, type GroupRoomBlock, type GroupReservationLink, type Reservation } from "@shared/schema";
import { groupStayTarget, priceGroupStay, type GroupStayPreview, type GroupStayPreviewRow } from "@shared/groupStayDates";
import { amountString, calendarNights, moneyCents, pricingError } from "@shared/nightlyPricing";
import { payloadHash } from "./billing/operationJournal";
import { accommodationFiscalStatus } from "./nightlyPricingGuard";

export const groupStayInputSchema = z.object({
  checkInDate: z.string(), checkOutDate: z.string(), status: z.string().optional(),
  roomReassignments: z.record(z.string().nullable()).optional(),
  addedRates: z.record(z.record(z.string().max(30))).optional(),
});
export const groupStayConfirmationSchema = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), addedRates: groupStayInputSchema.shape.addedRates }).strict();
export type GroupStayInput = z.infer<typeof groupStayInputSchema>;
type Executor = Pick<typeof db, "execute">;
type State = { group: Group; linked: Reservation[]; links: GroupReservationLink[]; blocks: GroupRoomBlock[] };
const inactive = new Set(["cancelled", "checked_out", "no_show"]);

export async function planGroupStayDates(tx: Executor, state: State, input: GroupStayInput) {
  const { group, links, blocks } = state;
  input = { checkInDate: input.checkInDate, checkOutDate: input.checkOutDate, status: input.status || group.status,
    roomReassignments: Object.fromEntries(Object.entries(input.roomReassignments || {}).filter(([, room]) => !!room)), addedRates: input.addedRates || {} };
  calendarNights(input.checkInDate, input.checkOutDate);
  if (["cancelled", "finished"].includes(group.status) || input.status === "cancelled")
    pricingError("El cambio de fechas se revisa por separado de la cancelación o del historial de un grupo cerrado.", 409);
  const linked = [...state.linked].sort((a, b) => a.id.localeCompare(b.id));
  if (linked.some(r => r.status === "checked_in")) pricingError("No se pueden cambiar las fechas mientras hay huéspedes en casa.", 409);
  const patches = new Map<string, NonNullable<ReturnType<typeof priceGroupStay>["patch"]>>();
  const rows: GroupStayPreviewRow[] = [];
  const roomRows = (await tx.execute(sql`SELECT id,room_number FROM rooms WHERE id IN (SELECT room_id FROM reservations WHERE id IN (SELECT reservation_id FROM group_reservation_links WHERE group_id=${group.id}))`)).rows as any[];
  const roomNames = new Map(roomRows.map(r => [r.id, r.room_number]));
  const overrideRooms = Object.values(input.roomReassignments || {}).filter(Boolean) as string[];
  if (overrideRooms.length) {
    const destinations = await tx.execute(sql`SELECT id,room_number FROM rooms WHERE id IN (${sql.join(overrideRooms.map(id => sql`${id}`), sql`,`)})`);
    for (const room of destinations.rows as any[]) roomNames.set(room.id, room.room_number);
  }
  for (const stay of linked) {
    if (inactive.has(stay.status)) continue;
    const link = links.find(l => l.reservationId === stay.id);
    if (links.filter(l => l.reservationId === stay.id).length !== 1) pricingError("Una reserva tiene asignaciones ambiguas. Revisá sus bloques antes de cambiar fechas.", 409);
    const block = link?.blockId ? blocks.find(b => b.id === link.blockId && b.groupId === group.id) : undefined;
    if (link?.blockId && !block) pricingError("Una reserva tiene un bloque por identificar. Revisá las asignaciones antes de cambiar fechas.", 409);
    if (block && block.roomTypeId !== stay.roomTypeId) pricingError("Una reserva no coincide con la categoría de su bloque. Revisá su asignación antes de cambiar fechas.", 409);
    const target = groupStayTarget(group, input, stay, block);
    const changed = target.dates.checkInDate !== stay.checkInDate || target.dates.checkOutDate !== stay.checkOutDate;
    const roomNumber = roomNames.get(input.roomReassignments?.[stay.id] || stay.roomId) || "Sin asignar";
    if (!changed) {
      if (Object.keys(input.addedRates?.[stay.id] || {}).length) pricingError("Esta habitación no tiene noches nuevas para cotizar.");
      rows.push({ reservationId: stay.id, roomNumber, changed, ownDates: target.ownDates,
        before: { checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, nights: calendarNights(stay.checkInDate, stay.checkOutDate).length, total: stay.totalRoomAmount || "0.00" },
        after: { ...target.dates, nights: calendarNights(target.dates.checkInDate, target.dates.checkOutDate).length, total: stay.totalRoomAmount || "0.00" }, missingRates: [] });
      continue;
    }
    if (stay.voucherId || Number(stay.voucherAppliedAmount || 0)) pricingError(`Hab. ${roomNumber}: revisá el voucher desde la reserva antes de reprogramar su alojamiento.`, 409);
    if (stay.roomHistory?.length) pricingError(`Hab. ${roomNumber}: la estadía tiene historial de traslados. Revisá sus fechas desde la reserva.`, 409);
    const fiscal = await accommodationFiscalStatus(stay.id, moneyCents(stay.totalRoomAmount || "0"), undefined, tx);
    if (fiscal.blocked) pricingError(`Hab. ${roomNumber}: ${fiscal.blocked}`, 409);
    let proposal: ReturnType<typeof priceGroupStay>;
    try { proposal = priceGroupStay(stay, target.dates, input.addedRates?.[stay.id]); }
    catch (error: any) { pricingError(`Hab. ${roomNumber}: ${error.message}`, error.statusCode || 400); }
    if (proposal.patch) patches.set(stay.id, proposal.patch);
    rows.push({ reservationId: stay.id, roomNumber, changed, ownDates: target.ownDates,
      before: { checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, nights: calendarNights(stay.checkInDate, stay.checkOutDate).length, total: stay.totalRoomAmount || "0.00" },
      after: { ...target.dates, nights: calendarNights(target.dates.checkInDate, target.dates.checkOutDate).length, total: proposal.total }, missingRates: proposal.missingRates });
  }
  if (Object.keys(input.addedRates || {}).some(id => !rows.some(r => r.reservationId === id && r.changed))) pricingError("La cotización incluye una reserva ajena a este cambio.");
  const groupDocuments = await tx.execute(sql`SELECT id FROM sales_invoices WHERE group_id=${group.id} AND estado IN ('emitida','parcial','autorizacion_pendiente')
    UNION ALL SELECT i.id FROM group_invoices g LEFT JOIN sales_invoices i ON i.id=g.sales_invoice_id WHERE g.group_id=${group.id} AND (i.id IS NULL OR i.estado IN ('emitida','parcial','autorizacion_pendiente')) LIMIT 1`);
  if (groupDocuments.rows.length) pricingError("El grupo tiene facturación vigente o pendiente. Resolvé primero el ajuste en el Folio Maestro.", 409);
  const pending = await tx.execute(sql`SELECT operation_id,stage,invoice_id FROM billing_operations WHERE
    ((owner_type='group' AND owner_id=${group.id}) OR (owner_type='reservation' AND owner_id IN (SELECT reservation_id FROM group_reservation_links WHERE group_id=${group.id})))
    AND stage IN ('prepared','numbered','submitting','blocked','rejected','uncertain') ORDER BY operation_id`);
  if (pending.rows.length) pricingError("Hay un intento de facturación pendiente. Resolvelo antes de cambiar las fechas del grupo.", 409);
  const registry = (await tx.execute(sql`SELECT to_regclass('payment_funding.scopes') AS name`)).rows[0] as any;
  const changedIds = rows.filter(r => r.changed).map(r => r.reservationId);
  if (registry?.name && changedIds.length && (await tx.execute(sql`SELECT 1 FROM payment_funding.scopes WHERE kind='reservation' AND id IN (${sql.join(changedIds.map(id => sql`${id}`), sql`,`)}) LIMIT 1`)).rows.length)
    pricingError("Una habitación utiliza el circuito de financiación. Revisá su estadía desde la reserva antes de cambiar las fechas del grupo.", 409);
  if (changedIds.length && (await tx.execute(sql`SELECT 1 FROM folio_movements m JOIN folios f ON f.id=m.folio_id WHERE f.entity_type='reservation'
    AND f.entity_id IN (${sql.join(changedIds.map(id => sql`${id}`), sql`,`)}) AND m.type='charge' AND m.source_type='room' LIMIT 1`)).rows.length)
    pricingError("Hay alojamiento ya registrado en un folio. Revisá su estadía desde la reserva antes de cambiar las fechas del grupo.", 409);
  // Include money and assignments in the proof, without changing any payment.
  const payments = await tx.execute(sql`SELECT id,amount,method,status,invoice_ref FROM payments WHERE reservation_id IN (SELECT reservation_id FROM group_reservation_links WHERE group_id=${group.id}) ORDER BY id`);
  const groupPayments = await tx.execute(sql`SELECT id,amount,method,invoice_ref,invoice_id,distribution_detail FROM group_payments WHERE group_id=${group.id} ORDER BY id`);
  const folios = await tx.execute(sql`SELECT id,status,total_charges,total_payments,balance FROM folios WHERE entity_type='reservation' AND entity_id IN (SELECT reservation_id FROM group_reservation_links WHERE group_id=${group.id}) ORDER BY id`);
  const movements = await tx.execute(sql`SELECT m.id,m.type,m.amount,m.source_type,m.source_id,m.voided_movement_id FROM folio_movements m JOIN folios f ON f.id=m.folio_id
    WHERE f.entity_type='reservation' AND f.entity_id IN (SELECT reservation_id FROM group_reservation_links WHERE group_id=${group.id}) ORDER BY m.id`);
  if ((groupPayments.rows as any[]).some(p => p.invoice_ref && !p.invoice_id)) pricingError("Hay un comprobante grupal anterior por conciliar. Revisalo antes de cambiar fechas.", 409);
  const canConfirm = rows.every(r => !r.missingRates.length);
  const before = rows.reduce((sum, r) => sum + moneyCents(r.before.total), 0);
  const after = canConfirm ? rows.reduce((sum, r) => sum + moneyCents(r.after.total!), 0) : null;
  const preview: GroupStayPreview = {
    fingerprint: payloadHash({ group, linked, links: [...links].sort((a,b) => a.id.localeCompare(b.id)), blocks: [...blocks].sort((a,b) => a.id.localeCompare(b.id)), input,
      payments: payments.rows, groupPayments: groupPayments.rows, folios: folios.rows, movements: movements.rows }),
    canConfirm, rows, beforeTotal: amountString(before), afterTotal: after === null ? null : amountString(after), difference: after === null ? null : amountString(after - before),
  };
  return { preview, patches };
}

export async function previewGroupStayDates(id: string, input: GroupStayInput) {
  return withReadOnlyDatabaseTransaction(async () => {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    if (!group) pricingError("Grupo no encontrado.", 404);
    const links = await db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, id));
    const linked = links.length ? await db.select().from(reservations).where(inArray(reservations.id, links.map(l => l.reservationId))) : [];
    const blocks = await db.select().from(groupRoomBlocks).where(eq(groupRoomBlocks.groupId, id));
    return (await planGroupStayDates(db, { group, links, linked, blocks }, input)).preview;
  });
}
