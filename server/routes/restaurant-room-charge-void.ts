import { roomChargeActionSupport as support } from "./manual-charge-actions";

type Actor = { id: string; name: string; ipAddress: string };

/**
 * Cancels only a Restaurant charge's imputation to a room.
 * Never changes the Restaurant order, items, stock, payments or cash.
 */
export async function anularRestaurantRoomCharge(
  reservationId: string,
  chargeId: string,
  body: unknown,
  actor: Actor,
) {
  support.validateVoidBody(body);
  const motivo = support.parseReason(body);
  const expected = support.parseExpected(body);
  if (!actor.id || !actor.name) {
    throw support.actionError(403, "No se pudo identificar al usuario que anula el cargo.");
  }

  return support.withReservationInvoiceLock(reservationId, async client => {
    await client.query("BEGIN");
    try {
      const reservation = await support.getReservation(client, reservationId);
      if (!reservation) throw support.actionError(404, "Reserva no encontrada.");
      if (support.reservationIsClosed(reservation)) {
        throw support.actionError(403, "No se pueden anular cargos de una reserva o folio cerrado.");
      }
      const folios = await client.query(
        `SELECT id, status, closed_at FROM folios
          WHERE entity_type = 'reservation' AND entity_id = $1 FOR UPDATE`,
        [reservationId],
      );
      if (folios.rows.length > 1 || folios.rows.some(f => f.status !== "open" || f.closed_at)) {
        throw support.actionError(409, "El folio requiere revisión antes de anular cargos.");
      }

      const charge = await support.getCharge(client, reservationId, chargeId);
      if (!charge) throw support.actionError(404, "Cargo no encontrado en esta reserva.");
      if (charge.description !== expected.description || support.cents(charge.amount) !== expected.amount) {
        throw support.actionError(409, "El cargo cambió desde que se abrió. Actualizá la pantalla.", "stale_snapshot");
      }
      if (charge.category !== "restaurant" || charge.is_recurring || charge.unit_amount != null) {
        throw support.actionError(409, "Esta acción solo anula la imputación de un cargo de Restaurante.", "source_conflict");
      }
      if (charge.status === "anulado") {
        await client.query("COMMIT");
        return { ...support.publicCharge(charge), roomOnly: true, alreadyAnulado: true };
      }
      if (charge.status !== "active") {
        throw support.actionError(409, "Solo se pueden anular cargos activos.");
      }

      const movement = await inspectRestaurantRoomCharge(client, reservationId, charge, false, true);

      const updated = await client.query(
        `UPDATE charges SET status = 'anulado', anulado_por = $1,
                motivo_anulacion = $2, anulado_at = NOW()
          WHERE id = $3 AND reservation_id = $4 AND status = 'active'
            AND description = $5 AND amount = $6::numeric
          RETURNING id, reservation_id, description, amount::text, date::text, category,
                    status, created_by, is_recurring, unit_amount::text,
                    anulado_por, motivo_anulacion, anulado_at`,
        [actor.name, motivo, chargeId, reservationId, expected.description, support.money(expected.amount)],
      );
      if (!updated.rows[0]) throw support.actionError(409, "El cargo cambió; no se anuló.", "stale_snapshot");

      let reversal: unknown = null;
      if (movement) {
        const result = await client.query(
          `INSERT INTO folio_movements
             (folio_id, type, amount, description, source_type, source_id,
              voided_movement_id, void_reason, registered_by)
           VALUES ($1, 'charge', $2, $3, 'restaurant_room_charge_void', $4, $5, $6, $7)
           RETURNING *`,
          [movement.folio_id, support.money(-expected.amount),
            `Anulación de imputación a habitación: ${charge.description}`,
            chargeId, movement.id, motivo, actor.name],
        );
        reversal = result.rows[0];
        await support.recalculateFolio(client, movement.folio_id);
      }
      const result = support.publicCharge(updated.rows[0]);
      await support.writeAudit(client, {
        actorId: actor.id, actorName: actor.name, ipAddress: actor.ipAddress,
        action: "delete", reservationId, chargeId, entityType: "reservation_room_charge",
        description: "Anulación de cargo en habitación; consumo de Restaurante conservado",
        before: { charge: support.publicCharge(charge), folioMovement: movement ?? null },
        after: { charge: result, reversal, scope: "room_only", restaurantConsumptionPreserved: true },
        motivo,
      });
      await client.query("COMMIT");
      return { ...result, roomOnly: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

/** Verifies the room imputation without touching the Restaurant sale. */
export async function inspectRestaurantRoomCharge(client: import('pg').PoolClient, reservationId: string, charge: NonNullable<Awaited<ReturnType<typeof support.getCharge>>>, allowReversed = false, allowGroupVoid = false) {
  if (charge.category !== 'restaurant' || charge.status !== 'active' || charge.is_recurring || charge.unit_amount != null || !support.cents(charge.amount)) throw support.actionError(409,'Solo se pueden corregir cargos activos de Restaurante sin cálculo recurrente.');
  const chargeId = charge.id, expected = {amount:support.cents(charge.amount)!};
      const group = await client.query(
        'SELECT gl.group_id,g.status FROM group_reservation_links gl LEFT JOIN groups g ON g.id=gl.group_id WHERE gl.reservation_id=$1',
        [reservationId],
      );
      if(group.rows.length){
        const link=group.rows[0];
        if(!allowGroupVoid||group.rows.length!==1||!link.group_id||!['tentative','blocked','confirmed','inhouse','checked_in','in_house'].includes(link.status))throw support.actionError(409,'La edición o el vínculo grupal de este cargo requiere revisión en el Folio Maestro.','group_scope_review');
        await assertUnfundedGroupRoomCharge(client,link.group_id,reservationId,chargeId);
      }
      const fiscal = await support.invoiceSourceConflict(client, reservationId, chargeId, undefined, allowReversed);
      if (fiscal) throw support.actionError(409, fiscal, "fiscal_history");

      const transfer = await client.query(
        "SELECT 1 FROM charges WHERE id <> $1 AND description LIKE $2 LIMIT 1",
        [chargeId, `%[xfer:${chargeId}]%`],
      );
      if (transfer.rows.length || /\[(?:xfer|from|transfer):/i.test(charge.description)) {
        throw support.actionError(409, "El cargo tiene historial de transferencia y requiere revisión.", "source_conflict");
      }
      const linked = await client.query(
        `SELECT fm.id, fm.folio_id, fm.type, fm.amount::text, fm.description,
                fm.source_type, fm.source_id, fm.voided_movement_id,
                f.entity_type, f.entity_id
           FROM folio_movements fm LEFT JOIN folios f ON f.id = fm.folio_id
          WHERE fm.source_id = $1
             OR fm.voided_movement_id IN (
                SELECT original.id FROM folio_movements original
                 WHERE original.source_id = $1)
          ORDER BY fm.id FOR UPDATE OF fm`,
        [chargeId],
      );
      const movement = linked.rows[0];
      if (linked.rows.length > 1 || (movement && (
        movement.type !== "charge" || movement.source_type !== "charge"
        || movement.entity_type !== "reservation" || movement.entity_id !== reservationId
        || support.cents(movement.amount) !== expected.amount
        || movement.description !== charge.description || movement.voided_movement_id
      ))) {
        throw support.actionError(409, "Los movimientos vinculados al cargo requieren revisión.", "source_conflict");
      }
      if (!movement) {
        // Old Restaurant room charges can exist only in charges, with no
        // financial mirror. Never guess which unlinked ledger entry is theirs.
        const unlinked = await client.query(
          `SELECT 1 FROM folio_movements fm JOIN folios f ON f.id = fm.folio_id
            WHERE f.entity_type = 'reservation' AND f.entity_id = $1
              AND fm.type = 'charge' AND fm.amount = $2::numeric
              AND fm.description = $3 LIMIT 1`,
          [reservationId, charge.amount, charge.description],
        );
        if (unlinked.rows.length) {
          throw support.actionError(409, "Hay un movimiento de folio sin vínculo verificable con este cargo.", "source_conflict");
        }
      }

  return movement;
}

/** Corrects the amount charged to the room; the originating sale is retained. */
export async function editRestaurantRoomCharge(reservationId:string, chargeId:string, body:any, actor:Actor) {
  if(!actor.id || !actor.name)throw support.actionError(403,'No se pudo identificar al usuario que corrige el cargo.');
  support.validateEditBody(body);
  const motivo=support.parseReason(body), expected=support.parseExpected(body);
  const description=typeof body.description==='string'?body.description.trim():'';
  const amount=support.cents(body.amount);
  if(!description || description.length>500 || !amount)throw support.actionError(400,'Ingresá una descripción y un importe positivo válido.');
  return support.withReservationInvoiceLock(reservationId,async client=>{
    await client.query('BEGIN');
    try {
      const reservation=await support.getReservation(client,reservationId);
      if(!reservation)throw support.actionError(404,'Reserva no encontrada.');
      if(support.reservationIsClosed(reservation))throw support.actionError(403,'No se pueden editar cargos de una reserva o folio cerrado.');
      const folios=await client.query("SELECT id,status,closed_at FROM folios WHERE entity_type='reservation' AND entity_id=$1 FOR UPDATE",[reservationId]);
      if(folios.rows.length>1 || folios.rows.some(f=>f.status!=='open'||f.closed_at))throw support.actionError(409,'El folio requiere revisión antes de editar cargos.');
      const charge=await support.getCharge(client,reservationId,chargeId);
      if(!charge)throw support.actionError(404,'Cargo no encontrado en esta reserva.');
      if(charge.description!==expected.description || support.cents(charge.amount)!==expected.amount)throw support.actionError(409,'El cargo cambió desde que se abrió. Actualizá la pantalla.','stale_snapshot');
      const movement=await inspectRestaurantRoomCharge(client,reservationId,charge,true);
      const updated=(await client.query(`UPDATE charges SET description=$1,amount=$2 WHERE id=$3 AND reservation_id=$4
        RETURNING id,reservation_id,description,amount::text,date::text,category,status,created_by,is_recurring,unit_amount::text,anulado_por,motivo_anulacion,anulado_at`,[description,support.money(amount),chargeId,reservationId])).rows[0];
      let afterMovement=null;
      if(movement){
        afterMovement=(await client.query('UPDATE folio_movements SET description=$1,amount=$2 WHERE id=$3 RETURNING *',[description,support.money(amount),movement.id])).rows[0];
        await support.recalculateFolio(client,movement.folio_id);
      }
      await support.writeAudit(client,{actorId:actor.id,actorName:actor.name,ipAddress:actor.ipAddress,action:'update',reservationId,chargeId,entityType:'reservation_room_charge',description:'Corrección de cargo en habitación; consumo de Restaurante conservado',before:{charge:support.publicCharge(charge),folioMovement:movement??null},after:{charge:support.publicCharge(updated),folioMovement:afterMovement,scope:'room_only',restaurantConsumptionPreserved:true},motivo});
      await client.query('COMMIT');return {...support.publicCharge(updated),roomOnly:true};
    }catch(error){await client.query('ROLLBACK');throw error;}
  });
}

/** No billing or receipt is reversed here; an already covered charge needs its fiscal/account circuit. */
async function assertUnfundedGroupRoomCharge(client:import('pg').PoolClient,groupId:string,reservationId:string,chargeId:string){
 const roomPaid=await client.query("SELECT 1 FROM payments WHERE reservation_id=$1 AND coalesce(status,'active')<>'anulado' AND amount::numeric>0 LIMIT 1",[reservationId]);
 const parents=await client.query('SELECT amount::text,destination,distribution,distribution_detail FROM group_payments WHERE group_id=$1 AND amount::numeric>0',[groupId]);
 let funded=roomPaid.rows.length>0;
 for(const parent of parents.rows){
  if(parent.destination==='master_folio'||parent.distribution==='master_folio'){funded=true;continue;}
  let detail=parent.distribution_detail;try{if(typeof detail==='string')detail=JSON.parse(detail);}catch{detail=null;}
  const values=detail&&typeof detail==='object'&&!Array.isArray(detail)?Object.values(detail).map(Number):[];
  if(!values.length||values.some(v=>!Number.isFinite(v)||v<0)||values.reduce((n,v)=>n+Math.round(v*100),0)!==Math.round(Number(parent.amount)*100))throw support.actionError(409,'Hay un cobro grupal sin distribución verificable por habitación. Revisá su aplicación antes de anular el cargo.','group_charge_funding_unknown');
  if(Number(detail[reservationId]||0)>0)funded=true;
 }
 if(funded)throw support.actionError(409,'La habitación o el Folio Maestro ya tienen pagos aplicados. Revisá la imputación antes de anular este cargo; no se modificaron cobros ni Caja.','group_charge_funded');
 const invoices=await client.query(`SELECT id,source_charge_ids,source_charge_amounts FROM sales_invoices WHERE group_id=$1 AND estado IN ('emitida','parcial','autorizacion_pendiente','anulada')`,[groupId]);
 const target=`reservation:${reservationId}:charge:${chargeId}`;
 const parse=(v:any)=>{try{return typeof v==='string'?JSON.parse(v):v;}catch{return null;}};
 for(const invoice of invoices.rows){
  const ids=parse(invoice.source_charge_ids),amounts=parse(invoice.source_charge_amounts);
  const keys=[...(Array.isArray(ids)?ids:[]),...(amounts&&typeof amounts==='object'&&!Array.isArray(amounts)?Object.keys(amounts):[])];
  if(!keys.length)throw support.actionError(409,`El comprobante grupal ${invoice.id} no identifica sus conceptos. Requiere revisión antes de anular el cargo.`,'group_fiscal_history');
  if(keys.some(id=>id===target||id===chargeId||String(id).startsWith(`charge-unit:${chargeId}:`)||String(id).startsWith(target+':')))throw support.actionError(409,`El cargo está asociado al comprobante grupal ${invoice.id}. Corregí primero su facturación; no se anuló la imputación.`,'group_fiscal_history');
 }
}
