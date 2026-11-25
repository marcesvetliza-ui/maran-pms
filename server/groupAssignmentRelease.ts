import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, withDatabaseTransaction, withReadOnlyDatabaseTransaction } from './db';
import { reservations, groupReservationLinks, guests, groupPayments, reservationChangelog, cancelledReservationLogs } from '@shared/schema';
import { payloadHash } from './billing/operationJournal';
import { groupAdvanceReceipt } from './billing/groupAdvanceReceipt';
import { hasProvableGroupCoverage } from './billing/groupCoverageEvidence';
import { groupMoneyCents } from '@shared/groupAccount';
import { normalizeToSpanishPaymentMethod } from './payment-method';
import { withLodgingInventoryMutationLock } from './inventoryMutationLock';
import { withReservationFinancialLock } from './nightlyPricingGuard';
import { countReservationExtraFolioCharges } from './groupReservationExtraCharges';
import { assertPaymentHasNoUnresolvedCreditHold } from './billing/reservationCreditReconciliation';

export const assignmentError = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const parse = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
const preArrival = new Set(['confirmed', 'pending', 'tentative']);
const direct = new Set(['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'mercadopago']);

/** Must be called inside the assignment transaction/financial scope for writes.
 * The preview is a snapshot of precisely the affected reservation, not a group-wide invoice veto. */
export async function inspectGroupAssignment(groupId: string, reservationId: string, lock = false) {
  if (lock) {
    await db.execute(sql`SET LOCAL lock_timeout='3s'`);
    await db.execute(sql`SELECT id FROM groups WHERE id=${groupId} FOR UPDATE`);
    // Use the funding lock before locking the reservation, just like funding writers.
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'funding-scope:reservation:' + reservationId},0))`);
    await db.execute(sql`SELECT id FROM reservations WHERE id=${reservationId} FOR UPDATE`);
  }
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  const links = (await db.execute(sql`SELECT group_id,block_id FROM group_reservation_links WHERE reservation_id=${reservationId}`)).rows as any[];
  if (!reservation || links.length !== 1 || links[0].group_id !== groupId) throw assignmentError('La reserva no pertenece a este grupo.', 404);
  const [guest] = await db.select().from(guests).where(eq(guests.id, reservation.guestId));
  const paymentRows = (await db.execute(sql`SELECT * FROM payments WHERE reservation_id=${reservationId} AND status<>'anulado' ORDER BY id ${lock ? sql`FOR UPDATE` : sql``}`)).rows as any[];
  const invoices = (await db.execute(sql`SELECT id,reserva_id,group_id,group_payment_id,payment_id,estado,tipo_comprobante,monto_total,source_charge_amounts,credit_reapplication_intent,reconciliation_status
    FROM sales_invoices WHERE (reserva_id=${reservationId} OR group_id=${groupId}) AND estado IN ('emitida','parcial','autorizacion_pendiente')
    ORDER BY id`)).rows as any[];
  const pending = (await db.execute(sql`SELECT operation_id,owner_type,owner_id,stage,request_snapshot FROM billing_operations
    WHERE ((owner_type='reservation' AND owner_id=${reservationId}) OR (owner_type='group' AND owner_id=${groupId}))
    AND stage IN ('prepared','numbered','submitting','blocked','rejected','uncertain') ORDER BY operation_id`)).rows as any[];
  const extraCharges = (await db.execute(sql`SELECT id,amount,status FROM charges WHERE reservation_id=${reservationId} AND status<>'anulado' ORDER BY id`)).rows;
  const folioExtras = await countReservationExtraFolioCharges(reservationId);
  const accounts = (await db.execute(sql`SELECT id,type,amount FROM account_movements WHERE reservation_id=${reservationId} AND coalesce(voided,false)=false ORDER BY id`)).rows;
  const blocks = (await db.execute(sql`SELECT * FROM group_room_blocks WHERE group_id=${groupId} ORDER BY id`)).rows as any[];
  const fiscal: string[] = [], blockers: string[] = [], releaseOnly: string[] = [];
  if (!preArrival.has(reservation.status)) blockers.push('Solo se pueden liberar o reemplazar pasajeros antes del check-in. Las estadías iniciadas se gestionan desde su cuenta.');
  if (guest?.codigo === `GROUP-${groupId}`) releaseOnly.push('Este cupo ya está sin pasajero. Usá Asignar huésped para ocuparlo.');
  if (!blocks.some(b => b.room_type_id === (reservation.originalRoomTypeId || reservation.roomTypeId) || b.room_type_id === reservation.roomTypeId)) releaseOnly.push('La reserva no tiene un bloque de cupo verificable en el grupo. Revisá el bloque antes de liberar.');
  if (extraCharges.length || folioExtras || Number(reservation.earlyCheckInCharge || 0) || Number(reservation.lateCheckOutCharge || 0)) blockers.push('Hay consumos o cargos adicionales en esta reserva. Conciliá esos cargos antes de liberar; no se trasladarán como anticipo ni se borrarán.');
  if (reservation.voucherId || reservation.voucherCode || Number(reservation.voucherAppliedAmount || 0)) blockers.push('La reserva tiene un voucher aplicado. Revisá su restitución antes de liberar o cambiar al pasajero.');
  if (accounts.length) blockers.push('La reserva tiene movimientos de Cuenta Corriente. Conciliá su destino antes de liberar o cambiar al pasajero.');
  if (reservation.externalReservationId || reservation.otaChannelId) blockers.push('La reserva está vinculada a un canal externo. Revisá su cancelación por el circuito del canal antes de liberar o reemplazar al pasajero.');
  for (const p of paymentRows) {
    try { await assertPaymentHasNoUnresolvedCreditHold(p.id); }
    catch (e: any) { if (e.statusCode) blockers.push(e.message); else throw e; }
  }
  for (const invoice of invoices) {
    if (invoice.reserva_id === reservationId || !hasProvableGroupCoverage(invoice) || Object.keys(parse(invoice.source_charge_amounts) || {}).some(id => id.startsWith(`reservation:${reservationId}:`))) {
      fiscal.push(`El comprobante #${invoice.id} afecta esta reserva o no permite verificar su alcance. Revisá su cobertura fiscal antes de liberar o cambiar al pasajero.`);
    }
  }
  for (const op of pending) {
    const amounts = op.request_snapshot?.sourceChargeAmounts;
    if (op.owner_type === 'reservation' || !amounts || !Object.keys(amounts).length || Object.keys(amounts).some(id => id.startsWith(`reservation:${reservationId}:`))) blockers.push('Hay una operación financiera pendiente que afecta esta reserva. Completala o conciliála antes de continuar.');
  }
  const fundingInstalled = (await db.execute(sql`SELECT to_regclass('payment_funding.scopes') IS NOT NULL installed`)).rows[0]?.installed;
  let managed = false;
  if (fundingInstalled) {
    managed = (await db.execute(sql`SELECT 1 FROM payment_funding.scopes WHERE kind='reservation' AND id=${reservationId} LIMIT 1`)).rows.length > 0;
    if (managed) blockers.push('Esta reserva tiene fondos gestionados por su circuito financiero. Administración debe conciliar su aplicación antes de liberar o reemplazar al pasajero.');
  }
  const parents: any[] = [];
  for (const id of [...new Set(paymentRows.map(p => p.group_payment_id).filter(Boolean))].sort()) {
    const parent = (await db.execute(sql`SELECT * FROM group_payments WHERE id=${id} ${lock ? sql`FOR UPDATE` : sql``}`)).rows[0] as any;
    const children = (await db.execute(sql`SELECT * FROM payments WHERE group_payment_id=${id} AND status<>'anulado' ORDER BY id ${lock ? sql`FOR UPDATE` : sql``}`)).rows as any[];
    if (!parent || parent.group_id !== groupId) { blockers.push('Un anticipo no tiene un recibo de origen verificable en este grupo.'); continue; }
    const facts = groupAdvanceReceipt(parent, children);
    const own = children.filter(p => p.reservation_id === reservationId);
    const releasedCents = own.reduce((n, p) => n + groupMoneyCents(p.amount), 0);
    const detail = { ...facts.detail, [reservationId]: 0, __unassigned__: (groupMoneyCents(facts.available) + releasedCents) / 100 };
    const after = groupAdvanceReceipt({ ...parent, distribution_detail: detail }, children.filter(p => p.reservation_id !== reservationId));
    if (facts.requiresReview) blockers.push('La distribución actual del recibo requiere conciliación. Revisá sus aplicaciones antes de continuar.');
    // Replacing the occupant preserves every application. Only releasing the
    // assignment needs to prove that its advance can become unassigned money.
    if (after.requiresReview) releaseOnly.push('Liberar este anticipo requiere conciliar la distribución o los medios del recibo. Cuenta Corriente y retenciones no se convierten en anticipos disponibles.');
    if (parent.invoice_ref || parent.invoice_id || own.some(p => p.invoice_ref || p.invoice_link_failed)) fiscal.push('Un anticipo de esta reserva está vinculado a un comprobante. Revisá su aplicación fiscal antes de liberar.');
    parents.push({ parent, children, own, detail, releasedCents });
  }
  const personal = paymentRows.filter(p => !p.group_payment_id);
  const cash: any[] = [];
  for (const p of personal) {
    const events = (await db.execute(sql`SELECT id,payment_id,source_type,amount,movement_type,anulado FROM cash_movements WHERE payment_id=${p.id} ORDER BY id ${lock ? sql`FOR UPDATE` : sql``}`)).rows as any[];
    cash.push(...events);
    const notes = parse(p.notes);
    const incomes = events.filter(e => !e.anulado && e.movement_type === 'income' && e.source_type === 'reservation');
    if (!direct.has(normalizeToSpanishPaymentMethod(p.method)) || p.billing_target !== 'guest' || Number(notes?.retencion?.monto || 0) || incomes.length !== 1 || groupMoneyCents(incomes[0]?.amount || 0) !== groupMoneyCents(p.amount) || events.some(e => e.movement_type === 'expense')) blockers.push('Un anticipo personal requiere conciliación de su origen o medio de pago antes de transferirlo al grupo.');
    if (p.invoice_ref || p.invoice_link_failed) fiscal.push('Un anticipo personal tiene cobertura fiscal o un vínculo pendiente. Revisá el comprobante antes de transferirlo.');
  }
  const personalCents = personal.reduce((n, p) => n + groupMoneyCents(p.amount), 0);
  const groupCents = parents.reduce((n, p) => n + p.releasedCents, 0);
  const fingerprint = payloadHash({ reservation, links, paymentRows, parents, invoices, pending, extraCharges, folioExtras, blocks, managed, cash, accounts });
  return { reservation, blockId:links[0].block_id || null, guest, paymentRows, parents, personal, replacementBlockers: [...new Set([...blockers, ...fiscal])], blockers: [...new Set([...blockers, ...fiscal, ...releaseOnly])], fingerprint,
    groupAdvance: groupCents / 100, personalAdvance: personalCents / 100, availableAdvance: (groupCents + personalCents) / 100 };
}
export const assignmentPreview = (s: Awaited<ReturnType<typeof inspectGroupAssignment>>) => ({
  fingerprint: s.fingerprint, blockers: s.blockers, canRelease: s.blockers.length === 0,
  replacementBlockers: s.replacementBlockers, canReplace: s.replacementBlockers.length === 0,
  groupAdvance: s.groupAdvance, personalAdvance: s.personalAdvance, availableAdvance: s.availableAdvance,
  reservationId: s.reservation.id, guestId: s.reservation.guestId, status: s.reservation.status,
});
export const previewGroupAssignment = (g: string, r: string) => withReadOnlyDatabaseTransaction(async () => assignmentPreview(await inspectGroupAssignment(g, r)));

/** Reverses only a room application, never the receipt, bank instrument or Caja. */
async function releasePaymentApplication(payment: any, actor: string, reason: string) {
  const entries = (await db.execute(sql`SELECT fm.* FROM folio_movements fm JOIN folios f ON f.id=fm.folio_id
    WHERE f.entity_type='reservation' AND f.entity_id=${payment.reservation_id} AND fm.type='payment' AND fm.source_type='payment' AND fm.source_id=${payment.id} FOR UPDATE OF fm`)).rows as any[];
  if (entries.length > 1) throw assignmentError('El anticipo tiene movimientos de folio ambiguos. Revisá su aplicación.');
  if (entries[0]) {
    const entry = entries[0];
    if (groupMoneyCents(entry.amount) !== groupMoneyCents(payment.amount)) throw assignmentError('El movimiento de folio no coincide con el anticipo original.');
    const prior = await db.execute(sql`SELECT id FROM folio_movements WHERE voided_movement_id=${entry.id}`);
    if (prior.rows.length) throw assignmentError('El anticipo ya tiene una corrección de folio. Revisá su aplicación.');
    await db.execute(sql`INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id,voided_movement_id,void_reason,registered_by)
      VALUES(${entry.folio_id},'void',${(-Number(payment.amount)).toFixed(2)},'Aplicación liberada al anticipo del grupo; sin devolución de dinero','group_assignment_release',${payment.id},${entry.id},${reason},${actor})`);
    await db.execute(sql`UPDATE folios SET total_payments=total_payments-${payment.amount}::numeric,balance=balance+${payment.amount}::numeric WHERE id=${entry.folio_id}`);
  }
  await db.execute(sql`UPDATE payments SET status='anulado',anulado_por=${actor},motivo_anulacion=${'Aplicación liberada al grupo (sin anular el cobro): ' + reason},anulado_at=now() WHERE id=${payment.id}`);
}

export async function releaseGroupAssignment(groupId: string, reservationId: string, body: any, actor: { id?: string; username?: string }) {
  if (typeof body.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationId)) throw assignmentError('La liberación requiere una clave de operación válida.', 400);
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000 || typeof body.fingerprint !== 'string') throw assignmentError('Ingresá un motivo de hasta 1000 caracteres y revisá la vista previa.', 400);
  const identity = payloadHash({ groupId, reservationId, operationId: body.operationId, reason: body.reason.trim(), fingerprint: body.fingerprint, transferPersonalAdvances: body.transferPersonalAdvances === true, actor: actor.id || actor.username });
  const operationId = body.operationId.toLowerCase(), operator = actor.username || actor.id || 'Sistema';
  return withReservationFinancialLock(reservationId, () => withLodgingInventoryMutationLock(() => withDatabaseTransaction(async () => {
    await db.execute(sql`SET LOCAL lock_timeout='3s'`);
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'group-assignment-release:' + operationId}))`);
    const prior = (await db.execute(sql`SELECT * FROM group_assignment_releases WHERE operation_id=${operationId}`)).rows[0] as any;
    if (prior) {
      if (prior.fingerprint !== identity) throw assignmentError('La operación original conserva otros datos. Actualizá la reserva.');
      return { ...prior.result, replayed: true };
    }
    const state = await inspectGroupAssignment(groupId, reservationId, true);
    if (state.blockers.length) throw assignmentError(state.blockers[0]);
    if (state.fingerprint !== body.fingerprint) throw assignmentError('La reserva o sus anticipos cambiaron. Actualizá la vista previa antes de liberar.');
    if (state.personal.length && body.transferPersonalAdvances !== true) throw assignmentError('Confirmá expresamente el traspaso de los anticipos personales al grupo.');
    const r = state.reservation;
    let [placeholder] = await db.select().from(guests).where(eq(guests.codigo, `GROUP-${groupId}`));
    if (!placeholder) {
      const group = (await db.execute(sql`SELECT name FROM groups WHERE id=${groupId}`)).rows[0] as any;
      [placeholder] = await db.insert(guests).values({ firstName: group.name, lastName: '', codigo: `GROUP-${groupId}`, segment: 'LEISURE', sexo: 'no_especifica' } as any).returning();
    }
    const newId = randomUUID();
    const [replacement] = await db.insert(reservations).values({
      id: newId, reservationCode: `RES-G-${Date.now()}-${newId.slice(0, 8)}`, guestId: placeholder.id,
      companyId: r.companyId, agencyId: r.agencyId, roomTypeId: r.roomTypeId, roomId: r.roomId,
      ratePlanId: r.ratePlanId, checkInDate: r.checkInDate, checkOutDate: r.checkOutDate, nights: r.nights,
      baseRatePerNight: r.baseRatePerNight, discountType: r.discountType, discountValue: r.discountValue,
      finalRatePerNight: r.finalRatePerNight, totalRoomAmount: r.totalRoomAmount, pricingScheme: r.pricingScheme,
      pricingRevision: r.pricingRevision, nightlyPricing: r.nightlyPricing, numberOfGuests: r.numberOfGuests,
      bedTypeId: r.bedTypeId, bedTypeNotes: r.bedTypeNotes, status: r.status, source: r.source,
      isUpgrade: r.isUpgrade, originalRoomTypeId: r.originalRoomTypeId, color: r.color,
      earlyCheckIn: r.earlyCheckIn, earlyCheckInTime: r.earlyCheckInTime,
      lateCheckOut: r.lateCheckOut, lateCheckOutTime: r.lateCheckOutTime,
      specialRateReason: r.specialRateReason, createdAt: new Date(), lastModifiedBy: actor.id,
      notes: `Cupo del grupo sin pasajero. Reemplaza la asignación ${r.reservationCode}.`,
    }).returning();
    await db.insert(groupReservationLinks).values({ groupId, reservationId: replacement.id, blockId:state.blockId });
    for (const receipt of state.parents) {
      await db.execute(sql`UPDATE group_payments SET distribution_detail=${JSON.stringify(receipt.detail)}::jsonb WHERE id=${receipt.parent.id}`);
      for (const p of receipt.own) await releasePaymentApplication(p, operator, body.reason.trim());
    }
    const transferredReceiptIds: string[] = [];
    for (const payment of state.personal) {
      const [parent] = await db.insert(groupPayments).values({
        groupId, amount: payment.amount, method: normalizeToSpanishPaymentMethod(payment.method), date: payment.date,
        reference: payment.reference, distribution: 'master_folio', distributionDetail: { __unassigned__: Number(payment.amount) },
        notes: `Traspaso autorizado de anticipo personal ${payment.id} de ${r.reservationCode}. ${body.reason.trim()}. Dinero ya recibido; sin nuevo cobro.`,
        receivedBy: payment.received_by, receiptType: 'none', destination: 'master_folio',
        paymentMethodDetail: [{ method: normalizeToSpanishPaymentMethod(payment.method), amount: Number(payment.amount) }],
        settlementBreakdown: { documentTotal: Number(payment.amount), appliedAdvances: Number(payment.amount), newCollection: 0 },
        settlementBreakdownStatus: 'captured_at_settlement', settlementBreakdownNote: 'Traspaso de anticipo existente; conserva el cobro original en Caja.',
      } as any).returning();
      await db.execute(sql`INSERT INTO group_personal_advance_origins(group_payment_id,payment_id,group_id,reservation_id,operation_id)
        VALUES(${parent.id},${payment.id},${groupId},${reservationId},${operationId})`);
      // Keep its original folio payment intact: reversing this transfer through
      // Grupos will use the original receipt and its original Caja movement.
      await db.execute(sql`UPDATE payments SET status='anulado',anulado_por=${operator},motivo_anulacion=${'Anticipo transferido al grupo (sin devolución): ' + body.reason.trim()},anulado_at=now() WHERE id=${payment.id}`);
      transferredReceiptIds.push(parent.id);
    }
    await db.update(reservations).set({ status: 'cancelled', lastModifiedBy: actor.id }).where(eq(reservations.id, reservationId));
    const room = (await db.execute(sql`SELECT room_number FROM rooms WHERE id=${r.roomId}`)).rows[0] as any;
    await db.insert(cancelledReservationLogs).values({ reservationId, reservationCode: r.reservationCode, guestName: `${state.guest?.lastName || ''} ${state.guest?.firstName || ''}`.trim(), roomNumber: room?.room_number || '', checkInDate: r.checkInDate, checkOutDate: r.checkOutDate, cancellationDate: new Date(), cancelledBy: operator, reason: `Asignación liberada; cupo y contrato conservados en ${replacement.reservationCode}. ${body.reason.trim()}`, totalAmount: r.totalRoomAmount });
    const description = `Asignación liberada: ${r.reservationCode} → ${replacement.reservationCode}. Se conservan habitación, cupo, fechas y tarifa. Anticipos disponibles: $${state.availableAdvance.toFixed(2)}. Motivo: ${body.reason.trim()}`;
    await db.insert(reservationChangelog).values([{ reservationId, operador: operator, tipo: 'group_assignment_release', descripcion: description }, { reservationId: replacement.id, operador: operator, tipo: 'group_assignment_release', descripcion: description }]);
    const result = { reservationId, replacementId: replacement.id, availableAdvance: state.availableAdvance, groupAdvance: state.groupAdvance, personalAdvance: state.personalAdvance, transferredReceiptIds };
    await db.execute(sql`INSERT INTO group_assignment_releases(operation_id,fingerprint,group_id,reservation_id,replacement_id,result)
      VALUES(${operationId},${identity},${groupId},${reservationId},${replacement.id},${JSON.stringify(result)}::jsonb)`);
    await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${actor.id || null},${operator},'update','groups','group',${groupId},'Asignación liberada conservando cupo y cobros originales',${JSON.stringify({ ...result, operationId, reason: body.reason.trim(), transferPersonalAdvances: body.transferPersonalAdvances === true })},now())`);
    return { ...result, replayed: false };
  })));
}
