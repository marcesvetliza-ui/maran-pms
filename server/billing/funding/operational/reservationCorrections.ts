import { normalizeToSpanishPaymentMethod } from "../../../payment-method";
import type { PoolClient } from "pg";
import { z } from "zod";
import { FundingError,hash,identifier,moneyMethods,requirePermission,type Actor,type Scope } from "../contracts";
import { FundingStore } from "../store";
import { SqlFundingAdapter } from "../adapters";
import { getAvailableReservationAdvancePayments,parseReservationInvoiceRef,reservationPaymentReleasedCents } from "@shared/reservationFolio";

export const reservationCorrectionSchema=z.object({paymentId:z.string().min(1),action:z.enum(['change_method','void_nonexistent']),newMethod:z.enum(moneyMethods).optional(),reason:z.string().trim().min(10).max(1000),evidenceRef:z.string().trim().min(3).max(500),restorations:z.array(z.object({paymentId:z.string(),invoiceId:z.number().int().positive(),amountCents:z.number().int().positive()}).strict()).max(100).default([])}).strict();
const cents=(v:unknown)=>Math.round(Number(v)*100);
/** Reception's ledger stores discounts/transfers alongside payments. Preserve
 * that cache convention while the shared correction writer adjusts real money. */
class ReceptionCorrectionAdapter extends SqlFundingAdapter {
 async totals(c:PoolClient,scope:Scope){
  const gross=await super.totals(c,scope),folio=await this.folio(c,scope);
  const offsets=Number((await c.query(`SELECT COALESCE(round(sum(amount)*100),0)::bigint AS n FROM ${this.s}.folio_movements WHERE folio_id=$1 AND type IN ('discount','transfer_out')`,[folio.id])).rows[0].n);
  const totalCents=gross.totalCents-offsets;
  if(!Number.isSafeInteger(totalCents)||totalCents<0)throw new FundingError("FOLIO_BALANCE_INVALID","Los descuentos o transferencias del folio requieren conciliación antes de corregir el cobro.");
  return {...gross,totalCents};
 }
 async refreshFolio(c:PoolClient,scope:Scope){
  const totals=await this.totals(c,scope),folio=await this.folio(c,scope);
  await c.query(`UPDATE ${this.s}.folios SET total_payments=total_charges-$2::numeric+$3::numeric,balance=$2::numeric-$3::numeric WHERE id=$1`,[folio.id,totals.totalCents/100,totals.paidCents/100]);
  return totals;
 }
}
/** Bridge to Reception's existing authoritative invoice_ref ledger. It does NOT adopt
 * the whole reservation or replace CC/withholding settlement. Uses the same SQL
 * source correction as the funding engine, plus the existing folio-invoice lock. */
export class ReservationPaymentCorrections {
 readonly s:string;readonly adapter:SqlFundingAdapter;
 constructor(readonly store:FundingStore,readonly schema='public'){this.s=identifier(schema);this.adapter=new ReceptionCorrectionAdapter('reservation',schema);}
 async inside(c:PoolClient,id:string,request:z.infer<typeof reservationCorrectionSchema>,actor:Actor) {
  const s=this.s;
  if((await c.query("SELECT 1 FROM payment_funding.scopes WHERE kind='reservation' AND id=$1",[id])).rowCount)throw new FundingError('MANAGED_SCOPE_USE_FUNDING','Esta reserva ya usa financiación completa; corregí desde ese circuito.');
  const reservation=(await c.query(`SELECT * FROM ${s}.reservations WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(!reservation||['cancelled','no_show'].includes(reservation.status))throw new FundingError('RESERVATION_UNAVAILABLE','La reserva no está disponible para esta corrección.');
  if(reservation.group_id)throw new FundingError('UNSUPPORTED_SETTLEMENT','Los cobros de grupos se corrigen desde su cuenta grupal.');
  await c.query(`SELECT cs.id FROM ${s}.cash_shifts cs JOIN ${s}.cash_movements cm ON cm.shift_id=cs.id JOIN ${s}.payments p ON p.id=cm.payment_id WHERE p.id=$1 AND p.reservation_id=$2 ORDER BY cs.id FOR UPDATE OF cs`,[request.paymentId,id]);
  await c.query(`SELECT id FROM ${s}.folios WHERE entity_type='reservation' AND entity_id=$1 FOR UPDATE`,[id]);
  const payments=(await c.query(`SELECT * FROM ${s}.payments WHERE reservation_id=$1 ORDER BY id FOR UPDATE`,[id])).rows;
  const invoices=(await c.query(`SELECT * FROM ${s}.sales_invoices WHERE reserva_id=$1 ORDER BY id FOR UPDATE`,[id])).rows;
  if(invoices.some(i=>i.estado==='autorizacion_pendiente'||(['pendiente','error','requiere_revision'].includes(i.reconciliation_status)&&i.credit_reapplication_intent)||(String(i.tipo_comprobante).startsWith('NC')&&i.reconciliation_status&&i.reconciliation_status!=='conciliada')))
   throw new FundingError('FISCAL_OPERATION_PENDING','Completá la emisión o conciliación pendiente antes de corregir el cobro.');
  const p=payments.find(p=>p.id===request.paymentId);
  if(!p||p.status!=='active')throw new FundingError('PAYMENT_UNAVAILABLE','El cobro ya no está activo en esta reserva.');
  if(p.group_payment_id)throw new FundingError('UNSUPPORTED_SETTLEMENT','El cobro está vinculado a un pago de grupo; requiere su conciliación grupal.');
  if(!(moneyMethods as readonly string[]).includes(normalizeToSpanishPaymentMethod(p.method)))throw new FundingError('UNSUPPORTED_SETTLEMENT','Esta corrección es para dinero registrado; CC y retenciones requieren su conciliación específica.');
  if(request.action==='change_method'&&(!request.newMethod||request.newMethod===normalizeToSpanishPaymentMethod(p.method)))throw new FundingError('METHOD_REQUIRED','Elegí un medio diferente.');
  if(request.action==='change_method'&&request.restorations.length)throw new FundingError('INVALID_RESTORATION','Cambiar el medio no modifica las aplicaciones del cobro.');
  const source=await this.adapter.source(c,{source_payment_id:p.id,scope_id:id});
  const receipt={id:`reservation:${p.id}`,source_payment_id:p.id,scope_id:id,method:normalizeToSpanishPaymentMethod(p.method),effective_cents:cents(p.amount),cash_movement_id:source.cash.id,folio_movement_id:source.fm.id};
  await this.adapter.assertReceipt(c,receipt);
  if((await c.query(`SELECT status FROM ${s}.cash_shifts WHERE id=$1`,[source.cash.shift_id])).rows[0]?.status!=='open')throw new FundingError('HISTORICAL_CONFIRMATION_REQUIRED','El turno está cerrado. Esta corrección requiere conciliar el cierre original; no se modifica desde esta acción.');
  const context=await this.adapter.correctionContext(c,receipt,{...request,scope:{kind:'reservation',id},receiptId:receipt.id,historical:false,restorations:[]} as any);
  if(context.shift.status!=='open')throw new FundingError('HISTORICAL_CONFIRMATION_REQUIRED','El turno está cerrado. Requiere conciliación del cierre antes de corregir.');
  const remaining=payments.filter(row=>row.id!==p.id&&row.status==='active');
  const available=new Map(getAvailableReservationAdvancePayments(remaining,invoices).map(row=>[row.id,cents(row.availableAdvanceAmount)]));
  const applied=(payment:any,invoice:any)=>{
   const ref=parseReservationInvoiceRef(payment.invoice_ref);if(!ref)return 0;
   const gross=String(ref.id)===String(invoice.id)?cents(payment.amount):cents(ref.reapplications?.find((a:any)=>Number(a.invoiceId)===Number(invoice.id))?.amount||0);
   return gross-reservationPaymentReleasedCents(ref,invoice.id,gross,Number(invoice.monto_acreditado||0)/Number(invoice.monto_total));
  };
  const net=(invoice:any)=>cents(invoice.monto_total)-cents(invoice.monto_acreditado||0);
  const coveragePayments=request.action==='void_nonexistent'?remaining:payments.filter(p=>p.status==='active');
  const capacities=new Map(invoices.filter(i=>['FA','FB','FC','FT','FM'].includes(i.tipo_comprobante)).map(i=>[Number(i.id),Math.max(0,net(i)-coveragePayments.reduce((n,p)=>n+applied(p,i),0))]));
  const proposals:any[]=[],proposalCapacities=new Map(capacities);
  if(request.action==='void_nonexistent')for(const payment of remaining){
   const ref=parseReservationInvoiceRef(payment.invoice_ref),invoice=invoices.find(i=>String(i.id)===String(ref?.id));
   if(!ref||!invoice||!Number(invoice.monto_acreditado)||!(moneyMethods as readonly string[]).includes(normalizeToSpanishPaymentMethod(payment.method)))continue;
   const amountCents=Math.min(available.get(payment.id)||0,proposalCapacities.get(Number(invoice.id))||0);
   if(amountCents>0){proposals.push({paymentId:payment.id,invoiceId:Number(invoice.id),amountCents});proposalCapacities.set(Number(invoice.id),(proposalCapacities.get(Number(invoice.id))||0)-amountCents);}
  }
  if(new Set(request.restorations.map(r=>`${r.paymentId}:${r.invoiceId}`)).size!==request.restorations.length)throw new FundingError('INVALID_RESTORATION','No se puede repetir una restauración para el mismo cobro y factura.');
  const changes:any[]=[];
  for(const r of request.restorations){
   const payment=remaining.find(p=>p.id===r.paymentId),invoice=invoices.find(i=>Number(i.id)===r.invoiceId),ref=parseReservationInvoiceRef(payment?.invoice_ref);
   if(!payment||!(moneyMethods as readonly string[]).includes(normalizeToSpanishPaymentMethod(payment.method))||!invoice||!ref||String(ref.id)!==String(invoice.id)||!Number(invoice.monto_acreditado))throw new FundingError('RESTORATION_ORIGIN_MISSING','La restauración debe corresponder a la factura original con NC y a un cobro activo.');
   if(r.amountCents>(available.get(payment.id)||0)||r.amountCents>(capacities.get(r.invoiceId)||0))throw new FundingError('FUNDS_UNAVAILABLE','El saldo cambió o ya fue reutilizado. Actualizá la previsualización.');
   const restoredSource=await this.adapter.source(c,{source_payment_id:payment.id,scope_id:id});
   await this.adapter.assertReceipt(c,{source_payment_id:payment.id,scope_id:id,method:normalizeToSpanishPaymentMethod(payment.method),effective_cents:cents(payment.amount),cash_movement_id:restoredSource.cash.id,folio_movement_id:restoredSource.fm.id});
   const prior=changes.find(row=>row.payment.id===payment.id)?.ref??ref;
   const release=reservationPaymentReleasedCents(prior,invoice.id,cents(payment.amount),Number(invoice.monto_acreditado)/Number(invoice.monto_total));
   if(r.amountCents>release)throw new FundingError('FUNDS_UNAVAILABLE','La restauración supera el crédito liberado por esta NC.');
   const changed={...prior,fundingReleases:{...prior.fundingReleases,[String(invoice.id)]:release-r.amountCents}};
   changes.push({payment,ref:changed});available.set(payment.id,(available.get(payment.id)||0)-r.amountCents);capacities.set(r.invoiceId,(capacities.get(r.invoiceId)||0)-r.amountCents);
  }
  const totals=await this.adapter.totals(c,{kind:'reservation',id});
  return {previewHash:hash({request,payments,invoices,source,shift:context.shift}),request,receipt,changes,proposals,restorationSummary:proposals.map(r=>({ ...r,method:normalizeToSpanishPaymentMethod(payments.find(p=>p.id===r.paymentId)?.method),invoiceLabel:`Factura #${r.invoiceId}`})),amountCents:cents(p.amount),method:p.method,debtAfterCents:Math.max(0,totals.totalCents-totals.paidCents+(request.action==='void_nonexistent'?cents(p.amount):0)),obligations:[...capacities].map(([invoiceId,uncoveredCents])=>({invoiceId,uncoveredCents}))};
 }
 async locked<T>(id:string,run:(c:PoolClient)=>Promise<T>){return this.store.transaction({kind:'reservation',id},null,async c=>{const lock=(await c.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',[`folio-invoice:${id}`])).rows[0];if(!lock?.locked)throw new FundingError('CONCURRENT_CHANGE','Hay una factura o NC en curso. Reintentá la misma operación.',409,true);return run(c);},undefined,'try');}
 async preview(id:string,raw:unknown,actor:Actor){requirePermission(actor);const request=reservationCorrectionSchema.parse(raw);return this.locked(id,async c=>{const p=await this.inside(c,id,request,actor);const {receipt,changes,...view}=p;return view;});}
 async confirm(id:string,operationId:string,previewHash:string,raw:unknown,actor:Actor,operatorLabel=actor.id){
  requirePermission(actor);z.string().uuid().parse(operationId);const request=reservationCorrectionSchema.parse(raw),fingerprint=hash({id,request,previewHash,actor:actor.id});
  return this.locked(id,async c=>{
   const key=`reservation-correction:${operationId}`,previous=(await c.query('SELECT payload FROM payment_funding.events WHERE event_key=$1',[key])).rows[0]?.payload;
   if(previous){if(previous.fingerprint!==fingerprint)throw new FundingError('IDEMPOTENCY_CONFLICT','La operación ya se usó con otros datos.');return previous.result;}
   const plan=await this.inside(c,id,request,actor);if(plan.previewHash!==previewHash)throw new FundingError('PREVIEW_STALE','Cambió el cobro, la factura o la caja. Volvé a revisar.');
   await this.adapter.correct(c,plan.receipt,{...request,scope:{kind:'reservation',id},receiptId:plan.receipt.id,historical:false,restorations:[]} as any,operationId,actor,true);
   if(request.action==='void_nonexistent')await c.query(`UPDATE ${this.s}.payments SET anulado_por=$2 WHERE id=$1`,[request.paymentId,actor.id]);
   for(const change of plan.changes)await c.query(`UPDATE ${this.s}.payments SET invoice_ref=$2 WHERE id=$1`,[change.payment.id,JSON.stringify(change.ref)]);
   const result={operationId,paymentId:request.paymentId,action:request.action,debtAfterCents:plan.debtAfterCents,restorations:request.restorations};
   await c.query(`INSERT INTO ${this.s}.reservation_changelog(reservation_id,operador,tipo,descripcion) VALUES($1,$2,'pago',$3)`,[id,operatorLabel,`${request.action==='change_method'?`Medio de cobro corregido (${normalizeToSpanishPaymentMethod(plan.method)} → ${request.newMethod})`:'Retiro de cobro inexistente'} · $${(plan.amountCents/100).toFixed(2)} · ${request.reason}. Comprobación: ${request.evidenceRef}. Operación: ${operationId}`]);
   await this.store.event(c,null,key,'reservation_payment_correction',{scopeKey:`reservation:${id}`,fingerprint,request,result,before:plan.receipt},actor.id);
   return result;
  });
 }
}
