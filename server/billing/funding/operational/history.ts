import type { Pool } from "pg";
import { SqlFundingAdapter, type FirstSpaClose } from "../adapters";
import { FundingStore } from "../store";
import { FundingError, hash, identifier, number, requirePermission, stableId, type Actor, type Scope } from "../contracts";

/** Internal review input, never an automatic scan or browser adoption route.
 * IDs MUST be backed by persisted source links, not amount matching.
 * Complex NC/reuse/non-fiscal/partial coverage histories fail closed.
 */
export type HistoryPlan = {
 scope: Scope; evidenceRef: string;
 documents: Array<{invoiceId:string; applications:Array<{
   paymentId:string;cashMovementId:string;folioMovementId:string;amountCents:number;
 }> }>;
};
export async function adoptVerifiedHistory(pool:Pool,plan:HistoryPlan,actor:Actor,firstSpaClose:FirstSpaClose,schema="public") {
 requirePermission(actor,"funding:historical");
 const s=identifier(schema),store=new FundingStore(pool),adapter=new SqlFundingAdapter(plan.scope.kind,schema,firstSpaClose);
 if(plan.evidenceRef.trim().length<10 || new Set(plan.documents.map(d=>d.invoiceId)).size!==plan.documents.length)
   throw new FundingError("HISTORY_REVIEW_REQUIRED","Falta evidencia o hay documentos duplicados.");
 return store.transaction(plan.scope,null,async c=>{
   await adapter.adoptScope(c,plan.scope,async tx=>{
     const invoices=(await tx.query(`SELECT * FROM ${s}.sales_invoices WHERE ${plan.scope.kind==="spa"?"spa_account_id":"reserva_id"}=$1
       AND estado<>'descartada' ORDER BY id FOR UPDATE`,[plan.scope.id])).rows;
     if(hash(invoices.map(i=>String(i.id)).sort())!==hash(plan.documents.map(d=>d.invoiceId).sort()))
       throw new FundingError("HISTORY_REVIEW_REQUIRED","El plan no contiene exactamente los documentos del scope.");
     for(const p of plan.documents) {
       const i=invoices.find(i=>String(i.id)===p.invoiceId);
       if(!i || i.estado!=="emitida" || !["FA","FB"].includes(i.tipo_comprobante) || !/^\d{14}$/.test(i.cae??"") ||
          Number(i.monto_acreditado??0)!==0 || i.nota_credito_id)
         throw new FundingError("HISTORY_REVIEW_REQUIRED","Historia parcial, NC o documento pendiente: requiere conciliación específica.");
       if((await tx.query(`SELECT id FROM ${s}.sales_invoices WHERE nota_credito_id=$1 AND estado<>'descartada'`,[i.id])).rowCount)
         throw new FundingError("HISTORY_REVIEW_REQUIRED","La factura tiene notas: no se infiere su reutilización.");
       const total=number(Math.round(Number(i.monto_total)*100));
       if(total<=0 || !p.applications.length || new Set(p.applications.map(a=>a.paymentId)).size!==p.applications.length ||
         p.applications.some(a=>!Number.isSafeInteger(a.amountCents)||a.amountCents<=0) ||
         p.applications.reduce((n,a)=>n+a.amountCents,0)!==total)
         throw new FundingError("HISTORY_REVIEW_REQUIRED","La cobertura documental no conserva centavos.");
       const docId=`history:${plan.scope.kind}:${i.id}`;
       const snapshot={historical:true,invoiceId:String(i.id),recipient:{razonSocial:i.cliente_razon_social,cuit:i.cliente_cuit,
         dni:i.cliente_dni,condicionIva:i.cliente_condicion_iva},tipo:i.tipo_comprobante,currency:"ARS",
         puntoVenta:i.punto_venta,numero:i.numero,fecha:i.fecha_emision,items:i.items,totalCents:total,evidenceRef:plan.evidenceRef};
       await tx.query(`INSERT INTO payment_funding.documents(id,scope_kind,scope_id,original_cents,total_cents,snapshot,status,invoice_id)
         VALUES($1,$2,$3,$4,$4,$5,'issued',$6)`,[docId,plan.scope.kind,plan.scope.id,total,JSON.stringify(snapshot),String(i.id)]);
       for(const a of p.applications) {
         const receipt=(await tx.query("SELECT * FROM payment_funding.receipts WHERE scope_kind=$1 AND scope_id=$2 AND source_payment_id=$3 FOR UPDATE",
           [plan.scope.kind,plan.scope.id,a.paymentId])).rows[0];
         if(!receipt || receipt.cash_movement_id!==a.cashMovementId || receipt.folio_movement_id!==a.folioMovementId)
           throw new FundingError("PAYMENT_LINK_AMBIGUOUS","El plan no coincide con los IDs de pago, Caja y folio.");
         await adapter.assertReceipt(tx,receipt);
         const source=await adapter.source(tx,receipt);
         let reference=source.p.invoice_ref;
         if(typeof reference==="string") {try {reference=JSON.parse(reference);} catch {/* Plain legacy ID remains an ID. */}}
         const referencedId=typeof reference==="object"&&reference!==null?(reference.invoiceId??reference.id):reference;
         if(String(referencedId??"")!==String(i.id) && String(i.payment_id??"")!==a.paymentId)
           throw new FundingError("HISTORY_REVIEW_REQUIRED","No existe un vínculo fiscal persistido por ID para esta aplicación.");
         await tx.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
           VALUES($1,$2,$3,$4,$5,$5,'applied','verified_history')`,
           [stableId(`${docId}:${receipt.id}`),receipt.id,docId,`history:${receipt.id}`,a.amountCents]);
       }
     }
     if(plan.scope.kind==="spa") {
       const account=(await tx.query(`SELECT invoice_id FROM ${s}.spa_accounts WHERE id=$1`,[plan.scope.id])).rows[0];
       if(account.invoice_id && !invoices.some(i=>String(i.id)===String(account.invoice_id)))
         throw new FundingError("HISTORY_REVIEW_REQUIRED","La factura propietaria de la cuenta fue omitida.");
     }
     await store.event(tx,null,`adopted:${plan.scope.kind}:${plan.scope.id}`,"history_adopted",
       {scopeKey:`${plan.scope.kind}:${plan.scope.id}`,planHash:hash(plan),evidenceRef:plan.evidenceRef},actor.id);
   });
   return {scope:plan.scope,planHash:hash(plan)};
 });
}
