import {groupAccountSnapshot} from './groupAccount';
import {sql} from 'drizzle-orm';
import {db} from '../db';
import {getGroupInvoiceSnapshot} from './groupInvoiceScope';
import {reservationGroupSources} from '@shared/reservationGroupSources';
import {operationSnapshot, payloadHash} from './operationJournal';
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409,code:'GROUP_INDIVIDUAL_FOLIO_REVIEW'});
/** Require a deliberate invoice-only choice before creating a new journal entry.
 * Existing frozen requests must remain recoverable with their original hash. */
export async function assertGroupBillingAction(body:any){
 const action=body.reservationBillingAction;
 if(action!==undefined&&!['invoice_only','collect_and_invoice'].includes(action))throw fail('Elegí cobrar y facturar, o sólo facturar.');
 if(action!==undefined && (action==='invoice_only')!==(body.groupDocumentationOnly===true))throw fail('La acción elegida no coincide con el plan de cobro. No se emitió ni cobró.');
 if(body.groupDocumentationOnly!==true||action==='invoice_only')return;
 const prior=(await db.execute(sql`SELECT payload_hash,owner_type,owner_id FROM billing_operations WHERE operation_id=${String(body.creditOperationId||'')}`)).rows[0] as any;
 if(prior?.owner_type==='reservation'&&prior.owner_id===String(body.reservaId)&&prior.payload_hash===payloadHash(operationSnapshot(body)))return;
 const claimed=(await db.execute(sql`SELECT id FROM sales_invoices WHERE reserva_id=${String(body.reservaId||'')} AND credit_reapplication_intent->>'operationId'=${String(body.creditOperationId||'')} LIMIT 1`)).rows.length>0;
 throw Object.assign(fail('Actualizá la pantalla y elegí explícitamente «Sólo facturar» o «Cobrar y facturar estos cargos». No se emitió ni cobró.'),{code:'GROUP_BILLING_ACTION_REQUIRED',safeToReset:!prior&&!claimed});
}
export async function assertIndividualGroupBalance(groupId:string,reservationId:string,amount:number,verifiedAccount?:Awaited<ReturnType<typeof groupAccountSnapshot>>,acknowledgeUnassignedAdvance=false){
 // A master receipt already applied to another room is not a reason to
 // block this room. Only money with no verified destination needs a choice.
 const account=verifiedAccount||await groupAccountSnapshot(reservationId);
 if(account.groupId!==groupId||!['confirmed','checked_in','checked_out'].includes(account.status))throw fail('La reserva no tiene un saldo verificable en este grupo. Actualizá el folio.');
 if(!acknowledgeUnassignedAdvance&&(account.unassigned>0.009||account.reviewReceipts.length))throw fail('Hay anticipos grupales sin asignar o pendientes de revisión. Aplicá el anticipo o confirmá que estás registrando dinero nuevo.');
 if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)>Math.round(account.balance*100))throw fail('El pago supera el saldo pendiente verificado de esta habitación. Actualizá el folio.');
}
export function validateIndividualGroupPlan(reservationId:string,recovery:any,expectedAmount:number){
 const payments=recovery?.version===2&&Array.isArray(recovery.payments)?recovery.payments:[];
 const methods=new Set(['efectivo','cash','tarjeta_debito','debit_card','tarjeta_credito','credit_card','transferencia','transfer','mercadopago','retencion_iibb','retencion_ganancias','retencion_iva']);
 if(!payments.length||new Set(payments.map((p:any)=>p.paymentRequestId)).size!==payments.length||payments.some((p:any)=>String(p.reservationId)!==reservationId||!methods.has(p.method)||!Number.isFinite(Number(p.amount))||Number(p.amount)<=0||!/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.paymentRequestId||''))||Math.round(payments.reduce((n:number,p:any)=>n+Number(p.amount),0)*100)!==Math.round(expectedAmount*100))throw fail('El intento no conserva un plan de cobro individual verificable. No se emitió ni cobró.');
 return payments;
}
export async function assertIndividualGroupInvoice(groupId:string,reservationId:string,amounts:Record<string,number>,newMoney:number,acknowledgeUnassignedAdvance=false){
 const account=await groupAccountSnapshot(reservationId);
 if(account.groupId!==groupId||account.fiscalRequiresReview)throw fail('La facturación histórica del grupo no permite verificar qué habitación o conceptos cubre. Requiere conciliación antes de emitir desde este folio.');
 if(newMoney>0)await assertIndividualGroupBalance(groupId,reservationId,newMoney,account,acknowledgeUnassignedAdvance);
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
 await assertIndividualGroupBalance(groupId,reservationId,Number(payment.amount),undefined,intent.individualGroupSettlement.acknowledgeUnassignedAdvance===true);
}
