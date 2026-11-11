import {sql} from 'drizzle-orm';
import {db} from '../db';
import {storage} from '../db-storage';
import {getGroupInvoiceSnapshot} from './groupInvoiceScope';
import {reservationGroupSources} from '@shared/reservationGroupSources';
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409,code:'GROUP_INDIVIDUAL_FOLIO_REVIEW'});
export async function assertIndividualGroupBalance(groupId:string,reservationId:string,amount:number){
 // Unassigned master money cannot be attributed to one room without a choice.
 const master=(await db.execute(sql`SELECT r.status,(SELECT coalesce(sum(gp.amount::numeric),0) FROM group_payments gp WHERE gp.group_id=${groupId} AND gp.destination='master_folio') amount FROM reservations r JOIN group_reservation_links gl ON gl.reservation_id=r.id WHERE r.id=${reservationId} AND gl.group_id=${groupId} LIMIT 1`)).rows[0] as any;
 if(!['confirmed','checked_in'].includes(String(master?.status)))throw fail('La reserva no está activa en este grupo. Actualizá el folio.');
 if(Number(master?.amount)>0.009)throw fail('El Folio Maestro ya tiene cobros sin asignación a esta habitación. Revisá su aplicación antes de cobrarla otra vez.');
 const line=(await storage.getGroupReservationLedger(groupId)).find(r=>r.reservationId===reservationId);
 const balance=line?Math.max(0,Number(line.accommodationTotal)+Number(line.extrasTotal)-Number(line.paymentsTotal)):0;
 if(!line||!Number.isFinite(amount)||amount<=0||Math.round(amount*100)>Math.round(balance*100))throw fail('El pago supera el saldo pendiente verificado de esta habitación. Actualizá el folio.');
}
export function validateIndividualGroupPlan(reservationId:string,recovery:any,expectedAmount:number){
 const payments=recovery?.version===2&&Array.isArray(recovery.payments)?recovery.payments:[];
 const methods=new Set(['efectivo','cash','tarjeta_debito','debit_card','tarjeta_credito','credit_card','transferencia','transfer','mercadopago','retencion_iibb','retencion_ganancias','retencion_iva']);
 if(!payments.length||new Set(payments.map((p:any)=>p.paymentRequestId)).size!==payments.length||payments.some((p:any)=>String(p.reservationId)!==reservationId||!methods.has(p.method)||!Number.isFinite(Number(p.amount))||Number(p.amount)<=0||!/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.paymentRequestId||''))||Math.round(payments.reduce((n:number,p:any)=>n+Number(p.amount),0)*100)!==Math.round(expectedAmount*100))throw fail('El intento no conserva un plan de cobro individual verificable. No se emitió ni cobró.');
 return payments;
}
export async function assertIndividualGroupInvoice(groupId:string,reservationId:string,amounts:Record<string,number>,newMoney:number){
 await assertIndividualGroupBalance(groupId,reservationId,newMoney);
 const snapshot=await getGroupInvoiceSnapshot(groupId);
 const requested=reservationGroupSources(reservationId,amounts);
 for(const [id,amount] of Object.entries(requested)){
  const source=snapshot.sources.find(s=>s.id===id);
  if(!source||Math.round(amount*100)>Math.round(source.available*100))throw fail('Hay conceptos de esta habitación ya facturados desde el grupo. Revisá la cobertura fiscal antes de emitir.');
 }
}
export async function assertIndividualGroupPayment(groupId:string,reservationId:string,payment:any,requestId?:string){
 let ref:any;try{ref=typeof payment.invoiceRef==='string'?JSON.parse(payment.invoiceRef):payment.invoiceRef;}catch{}
 const invoice=(await db.execute(sql`SELECT id,reserva_id,estado,credit_reapplication_intent FROM sales_invoices WHERE id=${Number(ref?.id)||0} AND reserva_id=${reservationId}`)).rows[0] as any;
 const intent=invoice?.credit_reapplication_intent;
 const expected=intent?.individualGroupSettlement?.payments?.find((p:any)=>p.paymentRequestId===requestId);
 if(invoice?.estado!=='emitida'||intent?.individualGroupSettlement?.groupId!==groupId||!expected||String(expected.reservationId)!==reservationId||expected.method!==payment.method||Math.round(Number(expected.amount)*100)!==Math.round(Number(payment.amount)*100)||expected.date!==payment.date||String(expected.reference??'')!==String(payment.reference??'')||String(expected.notes??'')!==String(payment.notes??''))throw fail('El pago no coincide con la factura y el intento individual autorizados. Se conserva la operación para revisión.');
 await assertIndividualGroupBalance(groupId,reservationId,Number(payment.amount));
}
