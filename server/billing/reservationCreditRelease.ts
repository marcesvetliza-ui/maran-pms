import { sql } from "drizzle-orm";
import { allocateFundingCents } from "@shared/fundingAllocation";
import { parseReservationInvoiceRef,reservationPaymentReleasedCents } from "@shared/reservationFolio";

/** Runs inside the same reservation-locked NC reconciliation transaction. */
export async function releaseReservationCredit(tx:any,original:any,nc:any) {
 const invoiceId=String(original.id),net=Math.round((Number(original.monto_total)-Number(original.monto_acreditado||0))*100),target=Math.round(Number(nc.monto_total??nc.montoTotal)*100);
 const payments=(await tx.execute(sql`SELECT * FROM payments WHERE reservation_id=${String(original.reserva_id)} ORDER BY id COLLATE "C" FOR UPDATE`)).rows as any[];
 const entries=payments.flatMap(p=>{
  if(p.status==='anulado'||['cuenta_corriente','current_account'].includes(p.method))return [];
  const ref=parseReservationInvoiceRef(p.invoice_ref);if(!ref)return [];
  const application=String(ref.id)===invoiceId?Math.round(Number(p.amount)*100):Math.round(Number(ref.reapplications?.find((a:any)=>String(a.invoiceId)===invoiceId)?.amount||0)*100);
  if(!application)return [];
  const ratio=Number(original.monto_acreditado||0)/Number(original.monto_total);
  const released=reservationPaymentReleasedCents(ref,invoiceId,application,ratio);
  return [{p,ref,application,released,capacity:application-released}];
 });
 const covered=entries.reduce((n,e)=>n+e.capacity,0);
 if(!Number.isSafeInteger(net)||!Number.isSafeInteger(target)||net<covered||target>net||target<=0)throw new Error('La cobertura de la NC requiere conciliación por IDs antes de liberar anticipos');
 // Unpaid coverage participates in the fiscal reduction, but never becomes money.
 const released=allocateFundingCents(target,[...entries.map(e=>e.capacity),net-covered]);
 for(let index=0;index<entries.length;index++){
  const e=entries[index],ref={...e.ref,fundingReleases:{...(e.ref as any).fundingReleases,[invoiceId]:e.released+released[index]}};
  await tx.execute(sql`UPDATE payments SET invoice_ref=${JSON.stringify(ref)} WHERE id=${e.p.id}`);
 }
}

/** An ND may reclaim only credit still free. Reused money stays on its target;
 * increasing the original document then leaves uncovered debt, not a second use. */
export async function reclaimReservationCredit(tx:any,original:any,debit:any) {
 const payments=(await tx.execute(sql`SELECT * FROM payments WHERE reservation_id=${String(original.reserva_id)} ORDER BY id COLLATE "C" FOR UPDATE`)).rows as any[];
 const invoices=(await tx.execute(sql`SELECT * FROM sales_invoices WHERE reserva_id=${String(original.reserva_id)} ORDER BY id FOR UPDATE`)).rows as any[];
 const {getAvailableReservationAdvancePayments}=await import('@shared/reservationFolio');
 const available=new Map(getAvailableReservationAdvancePayments(payments,invoices).map(p=>[p.id,Math.round(p.availableAdvanceAmount*100)]));
 const entries=payments.flatMap(p=>{
  const ref=parseReservationInvoiceRef(p.invoice_ref);if(!ref||p.status==='anulado')return [];
  const applied=String(ref.id)===String(original.id)?Math.round(Number(p.amount)*100):Math.round(Number(ref.reapplications?.find((a:any)=>String(a.invoiceId)===String(original.id))?.amount||0)*100);
  const released=reservationPaymentReleasedCents(ref,original.id,applied,Number(original.monto_acreditado||0)/Number(original.monto_total));
  return [{p,ref,released,capacity:Math.min(released,available.get(p.id)||0)}];
 });
 const target=Math.min(Math.round(Number(debit.monto_total??debit.montoTotal)*100),entries.reduce((n,e)=>n+e.capacity,0));
 const reclaimed=allocateFundingCents(target,entries.map(e=>e.capacity));
 for(let index=0;index<entries.length;index++)if(reclaimed[index]){
  const e=entries[index],ref={...e.ref,fundingReleases:{...e.ref.fundingReleases,[String(original.id)]:e.released-reclaimed[index]}};
  await tx.execute(sql`UPDATE payments SET invoice_ref=${JSON.stringify(ref)} WHERE id=${e.p.id}`);
 }
}
