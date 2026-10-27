import { FundingError,identifier,stableId,type Actor } from "../contracts";
import type { PaymentFundingService } from "../service";
import { invoiceSourceConflict } from "../../chargeFiscalHistory";

/** The caller authenticates and authorizes the same Reception roles as PATCH charges/:id/anular.
 * Cancels the transferred obligation, never reopens SPA or changes appointments/stock/payments.
 */
export async function cancelTransferredSpaCharge(service:PaymentFundingService,chargeId:string,reason:unknown,actor:Actor,schema="public") {
 if(!actor.id)throw new FundingError("UNAUTHENTICATED","Iniciá sesión para anular el cargo.",401);
 if(typeof reason!=="string"||!reason.trim()||reason.trim().length>500)
  throw new FundingError("INVALID_REASON","Ingresá un motivo de anulación de hasta 500 caracteres.",400);
 const motive=reason.trim(),s=identifier(schema);
 const owner=(await service.store.pool.query(`SELECT f.entity_id AS id FROM ${s}.folio_movements m JOIN ${s}.folios f ON f.id=m.folio_id
  WHERE f.entity_type='spa_account' AND m.source_type='spa_room_transfer' AND m.source_id=$1 AND m.type='transfer_out'`,[chargeId])).rows;
 if(owner.length!==1)throw new FundingError("TRANSFER_LINK_AMBIGUOUS","No se pudo verificar el origen SPA del cargo.");
 const scope={kind:"spa" as const,id:owner[0].id};
 return service.store.transaction(scope,null,async c=>{
  const entry=(await c.query(`SELECT * FROM ${s}.charges WHERE id=$1`,[chargeId])).rows[0];
  if(!entry?.reservation_id)throw new FundingError("NOT_FOUND","Cargo no encontrado.",404);
  const reservationId=entry.reservation_id;
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`funding-scope:reservation:${reservationId}`]);
  // Same key as Reception's invoice preparation, including its session-level lock.
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`folio-invoice:${reservationId}`]);
  const key=`spa-room-charge-void:${chargeId}`;
  const previous=(await c.query("SELECT payload FROM payment_funding.events WHERE event_key=$1",[key])).rows[0]?.payload;
  if(previous)return previous.result;
  if((await c.query("SELECT 1 FROM payment_funding.scopes WHERE kind='reservation' AND id=$1",[reservationId])).rowCount)
   throw new FundingError("MANAGED_DESTINATION","Esta reserva requiere anular desde su circuito financiero.");
  const reservation=(await c.query(`SELECT status FROM ${s}.reservations WHERE id=$1 FOR UPDATE`,[reservationId])).rows[0];
  const charge=(await c.query(`SELECT * FROM ${s}.charges WHERE id=$1 FOR UPDATE`,[chargeId])).rows[0];
  if(charge.reservation_id!==reservationId)throw new FundingError("TRANSFER_CHANGED","Cambió la habitación del cargo. Actualizá el folio.");
  const folios=(await c.query(`SELECT * FROM ${s}.folios WHERE entity_type='reservation' AND entity_id=$1 FOR UPDATE`,[reservationId])).rows;
  if(!reservation||['checked_out','cancelled','no_show'].includes(reservation.status)||folios.length!==1||folios[0].status!=='open'||folios[0].closed_at)
   throw new FundingError("RESERVATION_CLOSED","No se puede anular el cargo de una reserva cerrada.");
  const account=(await c.query(`SELECT * FROM ${s}.spa_accounts WHERE id=$1 FOR UPDATE`,[scope.id])).rows[0];
  if(account?.status!=='closed'||account.charged_to!=='room'||account.reservation_id!==reservationId||charge.status!=='active')
   throw new FundingError("TRANSFER_CHANGED","El cargo o su transferencia cambió. Actualizá el folio.");
  const movements=(await c.query(`SELECT * FROM ${s}.folio_movements WHERE source_type='spa_room_transfer' AND source_id=$1 FOR UPDATE`,[chargeId])).rows;
  const incoming=movements.filter(m=>m.folio_id===folios[0].id&&m.type==='transfer_in');
  const outgoing=movements.filter(m=>m.type==='transfer_out');
  if(movements.length!==2||incoming.length!==1||outgoing.length!==1||Number(incoming[0].amount)!==Number(charge.amount)||Number(outgoing[0].amount)!==Number(charge.amount)||Number(charge.amount)<=0||incoming[0].related_folio_id!==outgoing[0].folio_id||outgoing[0].related_folio_id!==incoming[0].folio_id)
   throw new FundingError("TRANSFER_LINK_AMBIGUOUS","El cargo tiene movimientos que requieren revisión antes de anular.");
  const conflict=await invoiceSourceConflict(c,reservationId,chargeId,schema);
  if(conflict)throw new FundingError("CHARGE_HAS_FISCAL_HISTORY",`${conflict} Revisá el comprobante antes de anular.`);
  if((await c.query(`SELECT 1 FROM ${s}.folio_movements WHERE voided_movement_id=$1 LIMIT 1`,[incoming[0].id])).rowCount)
   throw new FundingError("TRANSFER_CHANGED","El cargo ya tiene una corrección vinculada.");
  await c.query(`UPDATE ${s}.charges SET status='anulado',anulado_por=$2,motivo_anulacion=$3,anulado_at=now() WHERE id=$1`,[chargeId,actor.id,motive]);
  await c.query(`INSERT INTO ${s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,voided_movement_id,void_reason,registered_by)
   VALUES($1,$2,'charge',$3,$4,'spa_room_charge_void',$5,$6,$7,$8)`,[stableId(key),folios[0].id,-Number(charge.amount),`Anulación de cargo SPA: ${charge.description}`,chargeId,incoming[0].id,motive,actor.id]);
  await c.query(`UPDATE ${s}.folios SET total_charges=total_charges-$2,balance=balance-$2 WHERE id=$1`,[folios[0].id,charge.amount]);
  const result={id:chargeId,reservationId,status:'anulado',motivoAnulacion:motive,anuladoPor:actor.id};
  await service.store.event(c,null,key,'spa_room_charge_voided',{scopeKey:`spa:${scope.id}`,reservationId,chargeId,reason:motive,result,originalMovementId:incoming[0].id},actor.id);
  return result;
 });
}
