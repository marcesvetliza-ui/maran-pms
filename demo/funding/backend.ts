import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { SqlFundingAdapter } from "../../server/billing/funding/adapters";
import { FundingStore } from "../../server/billing/funding/store";
import { PaymentFundingService } from "../../server/billing/funding/service";
import { amount, FundingError, hash, type Actor, type FiscalGateway, type FiscalLookup, type Scope } from "../../server/billing/funding/contracts";
import { reconcileVerifiedCreditNote } from "../../server/billing/funding/creditNotes";

export const demoActor:Actor={id:"synthetic-supervisor",permissions:["funding:read","funding:write","funding:historical"]};
export class SyntheticFiscalGateway implements FiscalGateway {
  nextOutcome:"authorized"|"rejected"|"unknown"="authorized";
  constructor(readonly pool:Pool) {}
  async authorize(id:string,claim:Record<string,any>):Promise<FiscalLookup> {
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`synthetic-fiscal:${id}`]);
      let previous=(await c.query("SELECT * FROM funding_demo.fiscal_authorizations WHERE operation_id=$1",[id])).rows[0];
      if (previous && previous.claim_hash!==claim.claimHash) throw new FundingError("FISCAL_CLAIM_MISMATCH","Snapshot fiscal diferente.");
      if (!previous) {
        const outcome=this.nextOutcome; this.nextOutcome="authorized";
        const invoiceId=String((await c.query("SELECT nextval('funding_demo.invoice_number_seq') AS n")).rows[0].n);
        const invoice={operationId:id,documentId:claim.documentId,invoiceId,cae:"999999"+invoiceId,
          totalCents:claim.totalCents,claimHash:claim.claimHash};
        previous=(await c.query(`INSERT INTO funding_demo.fiscal_authorizations(operation_id,claim_hash,result,outcome)
          VALUES($1,$2,$3,$4) RETURNING *`,[id,claim.claimHash,outcome==="authorized"?JSON.stringify(invoice):null,outcome])).rows[0];
      }
      await c.query("COMMIT");
      return previous.outcome==="authorized"?{outcome:"authorized",invoice:previous.result}:{outcome:previous.outcome};
    } catch(e) { await c.query("ROLLBACK");throw e; } finally { c.release(); }
  }
  async lookup(id:string):Promise<FiscalLookup> {
    const r=(await this.pool.query("SELECT * FROM funding_demo.fiscal_authorizations WHERE operation_id=$1",[id])).rows[0];
    // Absence is UNKNOWN, never proof that an authorization cannot appear later.
    if (!r || r.outcome==="unknown") return {outcome:"unknown"};
    return r.outcome==="authorized"?{outcome:"authorized",invoice:r.result}:{outcome:"rejected"};
  }
}
export function createDemoService(pool:Pool) {
  const faults=new Set<string>(),gateway=new SyntheticFiscalGateway(pool);
  const spa=new SqlFundingAdapter("spa","funding_demo",async(c,id,actor)=>{
    await c.query("INSERT INTO funding_demo.inventory_closures(account_id,actor_id) VALUES($1,$2)",[id,actor.id]);
  });
  const service=new PaymentFundingService(new FundingStore(pool),{
    reservation:new SqlFundingAdapter("reservation","funding_demo"),spa,
  },gateway,point=>{if(faults.delete(point)) throw new Error(`SYNTHETIC_FAILURE:${point}`);});
  return {service,gateway,faults};
}
export async function installSyntheticSchema(pool:Pool) {
  // Caller supplies a dedicated, empty, disposable DB. Never consult DATABASE_URL.
  if ((await pool.query("SELECT current_database() AS name")).rows[0].name!=="folio_funding_synthetic")
    throw new Error("Refusing: this runner requires the dedicated folio_funding_synthetic database.");
  if ((await pool.query("SELECT inet_server_addr() IS NULL AS local")).rows[0].local!==true)
    throw new Error("Refusing: synthetic installation requires a local Unix socket, never a network database.");
  await pool.query(await readFile(new URL("../../server/billing/funding/schema.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("./fixture.sql",import.meta.url),"utf8"));
}
export async function stageSyntheticDocument(pool:Pool,scope:Scope,id:string,totalCents:number,status="draft") {
  const snapshot={recipient:{id:"synthetic-recipient",label:"Huésped sintético",condicionIva:"consumidor_final"},
    tipoComprobante:"FB",currency:"ARS",items:[{sourceId:`${scope.id}:verified-source`,description:"Consumo sintético",amountCents:totalCents}]};
  await pool.query(`INSERT INTO payment_funding.documents(id,scope_kind,scope_id,original_cents,total_cents,status,snapshot)
    VALUES($1,$2,$3,$4,$4,$5,$6)`,[id,scope.kind,scope.id,totalCents,status,JSON.stringify(snapshot)]);
}
export async function seedSyntheticScope(service:PaymentFundingService,id:string,kind:Scope["kind"],options:{
  partial?:boolean;closedShift?:boolean;withNC?:boolean;reused?:boolean;
}={}) {
  const pool=service.store.pool,scope:Scope={kind,id};
  const isSpa=kind==="spa",total=isSpa?9_500_000:27_000_000;
  const shift=`${id}:shift`,folio=`${id}:folio`;
  const payments=isSpa?[
    {id:`${id}:S1`,amount:500_000,method:"debit_card"},
    ...(options.partial?[]:[{id:`${id}:S2`,amount:9_000_000,method:"cash"}]),
  ]:[{id:`${id}:P-D`,amount:18_000_000,method:"tarjeta_debito"},{id:`${id}:P-C`,amount:9_000_000,method:"tarjeta_credito"}];
  const paid=payments.reduce((s,p)=>s+p.amount,0);
  await service.store.transaction(scope,null,async c=>{
    await c.query(`INSERT INTO funding_demo.cash_shifts(id,area,status,closed_at) VALUES($1,$2,$3,$4)`,
      [shift,isSpa?"spa":"recepcion",options.closedShift?"closed":"open",options.closedShift?new Date("2026-10-10T18:00:00Z"):null]);
    await c.query(`INSERT INTO funding_demo.folios(id,entity_type,entity_id,status,total_charges,total_payments,balance)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[folio,isSpa?"spa_account":"reservation",id,isSpa&&!options.partial?"closed":"open",amount(total),amount(paid),amount(total-paid)]);
    if (isSpa) {
      await c.query(`INSERT INTO funding_demo.spa_accounts(id,guest_name,status,total_paid,charged_to,receipt_type)
        VALUES($1,'Huésped sintético',$2,$3,'direct',NULL)`,[id,options.partial?"open":"closed",amount(paid)]);
      await c.query("INSERT INTO funding_demo.spa_account_items(id,account_id,description,subtotal) VALUES($1,$2,'Tratamiento sintético',$3)",[`${id}:item`,id,amount(total)]);
    }
    for (const p of payments) {
      if (isSpa) await c.query("INSERT INTO funding_demo.spa_payments(id,account_id,amount,method,created_at) VALUES($1,$2,$3,$4,now())",[p.id,id,amount(p.amount),p.method]);
      else await c.query("INSERT INTO funding_demo.payments(id,reservation_id,amount,method,date,invoice_ref) VALUES($1,$2,$3,$4,'2026-10-10',$5)",
        [p.id,id,amount(p.amount),p.method,JSON.stringify({invoiceId:`${id}:F1`})]);
      const method=isSpa?(p.method==="cash"?"efectivo":"tarjeta_debito"):p.method;
      await c.query(`INSERT INTO funding_demo.cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,'income',$8)`,[`${p.id}:cash`,shift,isSpa?"spa":"recepcion",isSpa?"spa_account":"reservation",id,method,amount(p.amount),p.id]);
      await c.query(`INSERT INTO funding_demo.folio_movements(id,folio_id,type,amount,description,source_type,source_id,payment_method,cash_movement_id)
        VALUES($1,$2,'payment',$3,'Cobro sintético',$4,$5,$6,$7)`,[`${p.id}:fm`,folio,amount(p.amount),isSpa?"spa_payment":"payment",p.id,p.method,`${p.id}:cash`]);
    }
    await (service.adapter(scope) as SqlFundingAdapter).adoptScope(c,scope,isSpa?undefined:async client=>{
      const snapshot={recipient:{id:"synthetic-recipient",label:"Huésped sintético",condicionIva:"consumidor_final"},
        tipoComprobante:"FB",currency:"ARS",items:[{sourceId:`${id}:verified-source`,description:"Consumo sintético",amountCents:total}]};
      await client.query(`INSERT INTO payment_funding.documents(id,scope_kind,scope_id,original_cents,total_cents,status,snapshot)
        VALUES($1,$2,$3,$4,$4,'issued',$5)`,[`${id}:F1`,scope.kind,id,total,JSON.stringify(snapshot)]);
      for(const p of payments) await client.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
        VALUES($1,$2,$3,$4,$5,$5,'applied','legacy_verified')`,[randomUUID(),`${kind}:${p.id}`,`${id}:F1`,p.id,p.amount]);
    });
    if (options.closedShift) {
      await c.query(`INSERT INTO funding_demo.cash_closing_summaries(id,shift_id,total_cash,total_debit_card,total_credit_card,total_general)
        VALUES($1,$2,0,180000,90000,270000)`,[`${id}:closing`,shift]);
      const original=(await c.query("SELECT to_jsonb(s) AS row FROM funding_demo.cash_closing_summaries s WHERE id=$1",[`${id}:closing`])).rows[0].row;
      await c.query(`INSERT INTO payment_funding.shift_evidence(shift_id,summary_id,original_summary,expected,physical_count_cents,evidence_ref)
        VALUES($1,$2,$3,$4,NULL,'synthetic-closing-evidence')`,
        [shift,`${id}:closing`,JSON.stringify(original),JSON.stringify({efectivo:0,tarjeta_debito:18_000_000,tarjeta_credito:9_000_000})]);
    }
  });
  if (!isSpa) {
    if (options.withNC) await reconcileVerifiedCreditNote(service,scope,{creditNoteId:`${id}:NC1`,documentId:`${id}:F1`,amountCents:9_000_000},demoActor);
    await stageSyntheticDocument(pool,scope,`${id}:F2`,9_000_000,options.reused?"issued":"draft");
    if (options.reused) for (const [index,p] of payments.entries()) await pool.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
      VALUES($1,$2,$3,$4,$5,$5,'applied','legacy_verified')`,
      [randomUUID(),`${kind}:${p.id}`,`${id}:F2`,`reuse:${p.id}`,index===0?6_000_000:3_000_000]);
  } else await stageSyntheticDocument(pool,scope,`${id}:F1`,total);
  return scope;
}
export async function seedDemo(service:PaymentFundingService) {
  const scenarios:any[]=[];
  for (const id of ["spa-existing","spa-post-cae","spa-mixed"]) {
    const partial=id==="spa-mixed";
    const scope=await seedSyntheticScope(service,id,"spa",{partial});
    scenarios.push({id,title:partial?"SPA · cobro del faltante":id==="spa-post-cae"?"SPA · recuperar después del CAE":"SPA · facturar cobros existentes",
      description:partial?"$5.000 ya cobrados; se cobran únicamente $90.000 nuevos.":"$95.000 ya cobrados. La factura no crea dinero ni pagos adicionales.",
      scope,request:{scope,documentId:`${id}:F1`,applications:[{receiptId:`spa:${id}:S1`,amountCents:500_000},
        ...(partial?[]:[{receiptId:`spa:${id}:S2`,amountCents:9_000_000}])],
        newCollections:partial?[{rowId:"faltante",method:"efectivo",amountCents:9_000_000,shiftId:`${id}:shift`}]:[]},correctionRequest:null});
  }
  for (const [id,options] of [
    ["reservation-A",{closedShift:true}],["reservation-B",{closedShift:true,withNC:true}],
    ["reservation-C",{withNC:true}],["reservation-reused",{withNC:true,reused:true}],
  ] as const) {
    const scope=await seedSyntheticScope(service,id,"reservation",options);
    const correctionRequest=id==="reservation-C"?null:{
      scope,receiptId:`reservation:${id}:P-C`,action:id==="reservation-A"?"change_method":"void_nonexistent",
      ...(id==="reservation-A"?{newMethod:"efectivo"}:{}),
      historical:!!("closedShift" in options && options.closedShift),reason:"Corrección sintética documentada por supervisor",
      evidenceRef:"synthetic-proof",restorations:id==="reservation-B"?[{receiptId:`reservation:${id}:P-D`,documentId:`${id}:F1`,amountCents:6_000_000}]:[],
    };
    scenarios.push({id,title:id==="reservation-A"?"Folio A · corregir medio":id==="reservation-B"?"Folio B · retirar y restaurar":id==="reservation-C"?"Folio C · refacturar sin cobrar":"Folio · crédito ya reutilizado",
      description:id==="reservation-A"?"Turno cerrado: reclasificación, sin cambiar el conteo original.":id==="reservation-B"?"La reserva queda con $90.000 pendientes de cobro; no se atribuyen al SPA.":id==="reservation-C"?"Aplica $60.000 + $30.000 a F2 sin otro ingreso.":"Retirar P-C deja $60.000 sin cobertura en F1 y $30.000 en F2.",
      scope,correctionRequest,request:id==="reservation-C"?{scope,documentId:`${id}:F2`,
        applications:[{receiptId:`reservation:${id}:P-D`,amountCents:6_000_000},{receiptId:`reservation:${id}:P-C`,amountCents:3_000_000}],newCollections:[]}:null});
  }
  return scenarios;
}
