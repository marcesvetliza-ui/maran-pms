import { accommodationNights } from '@shared/accommodationNights';
import { chargeUnits } from '@shared/chargeUnits';
import { isInvoiceableReservationCharge } from '@shared/reservationFolio';
import { originalAccountChargeLinked } from './creditNoteAccountMovement';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { activeSalesRecord } from '../salesArchive';
import { getAvailableReservationAdvancePayments,parseReservationInvoiceRef } from '@shared/reservationFolio';
import { normalizeToSpanishPaymentMethod } from '../payment-method';
const parse=(value:any)=>typeof value==='string'?JSON.parse(value):value;
export function correctionError(message:string,statusCode=409):never {throw Object.assign(new Error(message),{statusCode});}
export function closedCorrectionProof(reservation:any,original:any,all:any[]) {
 if(!reservation||!['checked_out','cancelled'].includes(reservation.status))correctionError('Este circuito corresponde a reservas cerradas.');
 if(!original||String(original.reserva_id)!==String(reservation.id)||original.group_id||reservation.groupId||reservation.group_id)correctionError('El comprobante no pertenece a una reserva individual cerrada. Revisá la facturación grupal desde el Folio Maestro.');
 if(!['FA','FB','FC'].includes(original.tipo_comprobante))correctionError('Este comprobante requiere su circuito fiscal específico; la corrección simple admite facturas A, B y C.');
 if(!['emitida','anulada'].includes(original.estado)||!Number(original.numero))correctionError('El comprobante no tiene una autorización fiscal confirmada.');
 if(original.account_charge_linked||original.cash_forma_pago==='cuenta_corriente'||(parse(original.cash_forma_pago_detalle)||[]).some((p:any)=>['cuenta_corriente','current_account'].includes(p.method)))correctionError('La factura afecta Cuenta Corriente. Requiere revisar el destino de la deuda desde Administración antes de corregirla.');
 const ids=parse(original.source_charge_ids),amounts=parse(original.source_charge_amounts),items=parse(original.items);
 if(!Array.isArray(ids)||!ids.length||!amounts||typeof amounts!=='object'||!Array.isArray(items)||items.length!==ids.length||new Set(ids).size!==ids.length||Object.keys(amounts).length!==ids.length)correctionError('La factura histórica no tiene un vínculo seguro por concepto. Requiere revisión administrativa.');
 if(items.some(i=>!['21','10.5','exento','no_gravado'].includes(i?.alicuotaIva)))correctionError('El detalle histórico no conserva la alícuota fiscal original. Requiere revisión.');
 const total=Math.round(Number(original.monto_total)*100);
 if(!Number.isSafeInteger(total)||total<=0||ids.some(id=>typeof id!=='string'||!Number.isSafeInteger(Math.round(Number(amounts[id])*100))||Number(amounts[id])<=0)||ids.reduce((n,id)=>n+Math.round(Number(amounts[id])*100),0)!==total)correctionError('El detalle de conceptos no coincide con el total de la factura.');
 const replacements=all.filter(i=>Number(i.credit_reapplication_intent?.correctionOriginalInvoiceId)===Number(original.id)&&i.estado!=='descartada');
 const replacement=replacements.find(i=>['emitida','autorizacion_pendiente','anulada','parcial'].includes(i.estado));
 const notes=all.filter(i=>Number(i.nota_credito_id)===Number(original.id)&&['NCA','NCB','NCC'].includes(i.tipo_comprobante)&&i.estado!=='descartada');
 const credited=Math.round(Number(original.monto_acreditado||0)*100);
 let stage='credit';let nc:any=null;
 if(credited||notes.length){
  nc=notes.length===1?notes[0]:null;
  if(nc&&credited===0&&Math.round(Number(nc.monto_total)*100)===total&&ids.every(id=>Math.round(Number(parse(nc.source_charge_amounts)?.[id])*100)===Math.round(Number(amounts[id])*100))&&['emitida','autorizacion_pendiente'].includes(nc.estado)&&nc.reconciliation_status==='pendiente'){stage='pending_credit';}
  else {
  if(!nc||nc.estado!=='emitida'||nc.reconciliation_status!=='conciliada'||Math.round(Number(nc.monto_total)*100)!==total||credited!==total||original.estado!=='anulada')correctionError('La NC total debe estar autorizada y conciliada. Las NC parciales o pendientes requieren revisión.');
  const creditedAmounts=parse(nc.source_charge_amounts);
  if(!creditedAmounts||ids.some(id=>Math.round(Number(creditedAmounts[id])*100)!==Math.round(Number(amounts[id])*100))||Object.keys(creditedAmounts).length!==ids.length)correctionError('La NC no acredita los mismos conceptos de la factura.');
  stage=replacement?(replacement.estado==='autorizacion_pendiente'?'pending':'completed'):'reissue';
  }
 }
 if(['credit','reissue','pending_credit'].includes(stage)&&reservation.correctionSourceCapacities){
  const capacities=reservation.correctionSourceCapacities as Record<string,number>;
  if(ids.some(id=>!Number.isFinite(capacities[id])||Math.round(Number(amounts[id])*100)>Math.round(capacities[id]*100)))correctionError('Los conceptos originales ya no coinciden con el folio. Revisá el vínculo antes de emitir la NC.');
 }
 return {original,nc,replacement,stage,sourceAmounts:amounts as Record<string,number>,sourceIds:ids as string[],totalCents:total,
  items:ids.map((id,index)=>({sourceId:id,descripcion:String(items[index].descripcion||id),precioUnitario:Number(amounts[id]),alicuotaIva:items[index].alicuotaIva}))};
}
export async function loadClosedCorrection(reservationId:string,invoiceId?:number) {
 if(invoiceId!==undefined&&(!Number.isSafeInteger(invoiceId)||invoiceId<=0))correctionError("Comprobante inválido.",400);
 const reservation=(await db.execute(sql`SELECT r.*,gl.group_id FROM reservations r LEFT JOIN group_reservation_links gl ON gl.reservation_id=r.id WHERE r.id=${reservationId} LIMIT 1`)).rows[0] as any;
 if(!reservation)correctionError('Reserva no encontrada.',404);
 const all=(await db.execute(sql`SELECT orig.*,${originalAccountChargeLinked} AS account_charge_linked FROM sales_invoices orig WHERE orig.reserva_id=${reservationId} AND ${activeSalesRecord('invoice',sql`orig.id`)} ORDER BY orig.id DESC`)).rows as any[];
 const roomTotal=Number(reservation.total_room_amount)>0?Number(reservation.total_room_amount):Number(reservation.final_rate_per_night||0)*Number(reservation.nights||0);
 const day=(value:any)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
 const nights=accommodationNights({checkInDate:day(reservation.check_in_date),checkOutDate:day(reservation.check_out_date),roomTotal,nightlyPricing:reservation.nightly_pricing,pricingScheme:reservation.pricing_scheme});
 const charges=(await db.execute(sql`SELECT * FROM charges WHERE reservation_id=${reservationId}`)).rows as any[];
 reservation.correctionSourceCapacities={accommodation:roomTotal,...Object.fromEntries(nights.map(n=>[n.id,n.amount])),...Object.fromEntries(charges.filter(isInvoiceableReservationCharge).flatMap(c=>[c,...chargeUnits(c)]).map(c=>[String(c.id),Number(c.amount)]))};
 if(invoiceId)return closedCorrectionProof(reservation,all.find(i=>Number(i.id)===invoiceId),all);
 return {reservation,all};
}
export async function correctionInvoiceBody(reservationId:string,invoiceId:number,input:any) {
 const proof=await loadClosedCorrection(reservationId,invoiceId) as ReturnType<typeof closedCorrectionProof>;
 if(['credit','pending_credit'].includes(proof.stage))correctionError('Primero debe emitirse y conciliarse la NC total.');
 if(proof.stage==='completed')return {existing:proof.replacement};
 if(proof.stage==='pending') {
  const row=proof.replacement,intent=row.credit_reapplication_intent;
  return {body:{tipoComprobante:row.tipo_comprobante,cliente:{razonSocial:row.cliente_razon_social,cuit:row.cliente_cuit||undefined,dni:row.cliente_dni||undefined,condicionIva:row.cliente_condicion_iva,domicilio:row.cliente_domicilio||undefined},items:row.items,reservaId:reservationId,
   sourceChargeIds:row.source_charge_ids,sourceChargeAmounts:row.source_charge_amounts,creditReapplications:intent.payments||[],creditOperationId:intent.operationId,
   cashFormaPagoDetalle:row.cash_forma_pago_detalle,puntoVenta:row.punto_venta,correctionOriginalInvoiceId:invoiceId,observaciones:row.observaciones}};
 }
 if(!['FA','FB','FC'].includes(input.tipoComprobante)||String(input.reason||'').trim().length<3||String(input.reason||'').length>1000||!input.cliente?.razonSocial?.trim())correctionError('Completá el receptor, el tipo de factura y el motivo.',400);
 const payments=(await db.execute(sql`SELECT * FROM payments WHERE reservation_id=${reservationId}`)).rows as any[];
 const all=(await db.execute(sql`SELECT * FROM sales_invoices WHERE reserva_id=${reservationId}`)).rows as any[];
 const available=getAvailableReservationAdvancePayments(payments,all).filter(p=>p.releasedFromCreditedInvoice&&String(parseReservationInvoiceRef(p.invoice_ref)?.id)===String(invoiceId));
 let left=proof.totalCents;const allocations:any[]=[],methods=new Map<string,number>();
 for(const p of available){const cents=Math.min(left,Math.round(p.availableAdvanceAmount*100));if(cents>0){allocations.push({paymentId:String(p.id),amount:cents/100});const method=normalizeToSpanishPaymentMethod(p.method);methods.set(method,(methods.get(method)||0)+cents/100);left-=cents;}}
 // Unpaid fiscal value stays unpaid. It is not a new collection or debt transfer.
 if(left>0)methods.set('cuenta_corriente',(methods.get('cuenta_corriente')||0)+left/100);
 return {body:{tipoComprobante:input.tipoComprobante,cliente:input.cliente,
  items:proof.items.map(i=>({descripcion:i.descripcion,cantidad:1,precioUnitario:i.precioUnitario,subtotal:i.precioUnitario,subtotalNeto:input.tipoComprobante==='FC'||['exento','no_gravado'].includes(i.alicuotaIva)?i.precioUnitario:Number((i.precioUnitario/(1+Number(i.alicuotaIva||21)/100)).toFixed(2)),alicuotaIva:input.tipoComprobante==='FC'?'no_gravado':i.alicuotaIva||'21'})),
  reservaId:reservationId,sourceChargeIds:proof.sourceIds,sourceChargeAmounts:proof.sourceAmounts,creditReapplications:allocations,creditOperationId:randomUUID(),
  cashFormaPagoDetalle:[...methods].map(([method,amount])=>({method,amount})),correctionOriginalInvoiceId:invoiceId,
  observaciones:`Refacturación de factura ${proof.original.tipo_comprobante} ${proof.original.punto_venta}-${proof.original.numero}, NC ${proof.nc.id}. Motivo: ${String(input.reason).trim()}`}};
}
