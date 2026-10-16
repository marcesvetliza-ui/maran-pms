import type { PoolClient } from "pg";
import {
  FundingError, amount, hash, identifier, moneyMethods, number, stableId,
  type Actor, type Collection, type CorrectionRequest, type FundingAdapter, type InvoiceResult, type Scope,
} from "./contracts";

const spaToCanonical:Record<string,string>={cash:"efectivo",debit_card:"tarjeta_debito",credit_card:"tarjeta_credito",transfer:"transferencia",mercadopago:"mercadopago"};
const canonicalToSpa=Object.fromEntries(Object.entries(spaToCanonical).map(([k,v])=>[v,k]));
export type FirstSpaClose = (client:PoolClient,accountId:string,actor:Actor)=>Promise<void>;

/** SQL adapter against the existing operational tables; no global DB/env imports.
 * public = operational integration, funding_demo = isolated synthetic fixtures.
 */
export class SqlFundingAdapter implements FundingAdapter {
  readonly s:string;
  constructor(readonly kind:Scope["kind"], schema="public", readonly onFirstSpaClose?:FirstSpaClose) { this.s=identifier(schema); }
  get paymentTable() { return `${this.s}.${this.kind==="spa"?"spa_payments":"payments"}`; }
  get ownerColumn() { return this.kind==="spa"?"account_id":"reservation_id"; }
  normalize(method:string) {
    const m=this.kind==="spa"?(spaToCanonical[method]??method):method;
    if (!(moneyMethods as readonly string[]).includes(m)) throw new FundingError("UNSUPPORTED_SETTLEMENT","CC, retenciones, vouchers y cargos a habitación requieren su propio adaptador.",422);
    return m;
  }
  async folio(c:PoolClient,scope:Scope) {
    const rows=(await c.query(`SELECT * FROM ${this.s}.folios WHERE entity_type=$1 AND entity_id=$2`,
      [this.kind==="spa"?"spa_account":"reservation",scope.id])).rows;
    if (rows.length!==1) throw new FundingError("FOLIO_LINK_AMBIGUOUS","Falta un folio unívoco para esta cuenta.");
    return rows[0];
  }
  async assertScope(c:PoolClient,scope:Scope,operationId?:string,verifiedAdoption=false) {
    if (scope.kind==="spa" && (await c.query("SELECT 1 FROM payment_funding.events WHERE kind='spa_rollout_history' AND event_key=$1",[`adopted:spa:${scope.id}`])).rowCount)
      throw new FundingError("HISTORICAL_ACCOUNT_READ_ONLY","Esta cuenta conserva su liquidación anterior como historial; no se factura ni cobra nuevamente.");
    await this.folio(c,scope);
    if (this.kind!=="spa") return;
    const a=(await c.query(`SELECT * FROM ${this.s}.spa_accounts WHERE id=$1`,[scope.id])).rows[0];
    if (!a) throw new FundingError("NOT_FOUND","Cuenta SPA inexistente.",404);
    if (!["open","closed"].includes(a.status) || ["room","room_charge","cuenta_habitacion"].includes(a.charged_to))
      throw new FundingError("UNSUPPORTED_SETTLEMENT","La cuenta no corresponde al circuito directo SPA.");
    if (a.invoice_id && !verifiedAdoption) {
      const owned=operationId && (await c.query("SELECT 1 FROM payment_funding.operations WHERE id=$1 AND invoice->>'invoiceId'=$2",[operationId,String(a.invoice_id)])).rowCount;
      if (!owned) throw new FundingError("DOCUMENT_ALREADY_ISSUED","La cuenta SPA ya tiene factura. No se factura de nuevo para cobrar.");
    }
    if (a.status==="open" && !this.onFirstSpaClose)
      throw new FundingError("INVENTORY_ADAPTER_REQUIRED","Falta configurar el cierre transaccional de stock antes de emitir.",503);
  }
  async totals(c:PoolClient,scope:Scope) {
    const f=await this.folio(c,scope);
    const paid=(await c.query(`SELECT COALESCE(round(SUM(amount)*100),0)::bigint AS n FROM ${this.paymentTable}
      WHERE ${this.ownerColumn}=$1 AND status='active'`,[scope.id])).rows[0].n;
    const total=this.kind==="spa"?(await c.query(`SELECT COALESCE(round(SUM(subtotal)*100),0)::bigint AS n FROM ${this.s}.spa_account_items WHERE account_id=$1`,[scope.id])).rows[0].n:Math.round(Number(f.total_charges)*100);
    return {totalCents:number(total),paidCents:number(paid)};
  }
  async source(c:PoolClient,r:any) {
    const rows=(await c.query(`SELECT *,round(amount*100)::bigint AS cents FROM ${this.paymentTable} WHERE id=$1 AND ${this.ownerColumn}=$2`,[r.source_payment_id,r.scope_id])).rows;
    if (rows.length!==1) throw new FundingError("PAYMENT_LINK_MISSING","No existe el pago propietario verificado.");
    const p=rows[0];
    const cash=(await c.query(`SELECT *,round(amount*100)::bigint AS cents FROM ${this.s}.cash_movements WHERE payment_id=$1 AND anulado=false AND movement_type='income'`,[p.id])).rows;
    const f=await this.folio(c,{kind:this.kind,id:r.scope_id});
    const fm=(await c.query(`SELECT m.*,round(m.amount*100)::bigint AS cents FROM ${this.s}.folio_movements m
      WHERE m.folio_id=$1 AND m.source_type=$2 AND m.source_id=$3 AND m.type='payment'
      AND NOT EXISTS(SELECT 1 FROM ${this.s}.folio_movements v WHERE v.voided_movement_id=m.id AND v.type='void')`,
      [f.id,this.kind==="spa"?"spa_payment":"payment",p.id])).rows;
    if (cash.length!==1 || fm.length!==1 || fm[0].cash_movement_id!==cash[0].id)
      throw new FundingError("PAYMENT_LINK_AMBIGUOUS","Caja y folio no identifican un único ingreso para este pago.");
    return {p,cash:cash[0],fm:fm[0],folio:f};
  }
  async assertReceipt(c:PoolClient,r:any) {
    const {p,cash,fm}=await this.source(c,r);
    if (p.status!=="active" || number(p.cents)!==number(r.effective_cents) ||
      number(cash.cents)!==number(p.cents) || number(fm.cents)!==number(p.cents) ||
      cash.id!==r.cash_movement_id || fm.id!==r.folio_movement_id ||
      this.normalize(p.method)!==r.method || this.normalize(cash.payment_method)!==r.method)
      throw new FundingError("SOURCE_CHANGED","El pago, Caja o folio cambió; requiere conciliación.");
  }
  /** Explicit adoption only; never invoked by preview or by a generic request. */
  async adoptScope(c:PoolClient,scope:Scope,importVerifiedHistory?:(client:PoolClient)=>Promise<void>) {
    await this.assertScope(c,scope,undefined,Boolean(importVerifiedHistory));
    const already=(await c.query("SELECT 1 FROM payment_funding.scopes WHERE kind=$1 AND id=$2",[scope.kind,scope.id])).rowCount;
    if (already) throw new FundingError("SCOPE_ALREADY_ADOPTED","El folio ya fue adoptado.");
    const payments=(await c.query(`SELECT *,round(amount*100)::bigint AS cents FROM ${this.paymentTable} WHERE ${this.ownerColumn}=$1 AND status='active' ORDER BY id`,[scope.id])).rows;
    const fiscalHistory=(await c.query(`SELECT id FROM ${this.s}.sales_invoices
      WHERE ${this.kind==="spa"?"spa_account_id":"reserva_id"}=$1 AND estado<>'descartada'`,[scope.id])).rows;
    if ((fiscalHistory.length || payments.some(p=>p.invoice_ref)) && !importVerifiedHistory)
      throw new FundingError("HISTORY_REVIEW_REQUIRED","Hay historia fiscal: debe importarse un plan verificado completo dentro de la misma transacción.");
    // All-or-nothing: no partial adoption that leaves a second legacy balance.
    await c.query("INSERT INTO payment_funding.scopes(kind,id) VALUES($1,$2)",[scope.kind,scope.id]);
    for (const p of payments) {
      const receipt={scope_id:scope.id,source_payment_id:p.id};
      const source=await this.source(c,receipt);
      if (number(p.cents)<=0 || number(source.cash.cents)!==number(p.cents) || number(source.fm.cents)!==number(p.cents))
        throw new FundingError("SOURCE_AMOUNT_MISMATCH","Los vínculos no conservan el importe del cobro.");
      const method=this.normalize(p.method);
      if (this.normalize(source.cash.payment_method)!==method) throw new FundingError("SOURCE_CHANGED","El medio de Caja difiere del pago.");
      await c.query(`INSERT INTO payment_funding.receipts(id,scope_kind,scope_id,source_payment_id,original_cents,effective_cents,method,cash_movement_id,folio_movement_id)
        VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8)`,[`${scope.kind}:${p.id}`,scope.kind,scope.id,p.id,p.cents,method,source.cash.id,source.fm.id]);
    }
    if(importVerifiedHistory) await importVerifiedHistory(c);
    for(const invoice of fiscalHistory) {
      if(!(await c.query(`SELECT 1 FROM payment_funding.documents
        WHERE scope_kind=$1 AND scope_id=$2 AND invoice_id=$3`,[scope.kind,scope.id,String(invoice.id)])).rowCount)
        throw new FundingError("HISTORY_REVIEW_REQUIRED","El plan omitió un documento fiscal del scope.");
    }
    for(const p of payments.filter(p=>p.invoice_ref)) {
      const evidence=(await c.query(`SELECT 1 FROM payment_funding.applications WHERE receipt_id=$1 LIMIT 1`,[`${scope.kind}:${p.id}`])).rowCount;
      if(!evidence) throw new FundingError("HISTORY_REVIEW_REQUIRED","El plan no reconstruyó la cobertura del pago con referencia fiscal.");
    }
  }
  async validateCollection(c:PoolClient,scope:Scope,row:Collection) {
    const shift=(await c.query(`SELECT * FROM ${this.s}.cash_shifts WHERE id=$1 FOR UPDATE`,[row.shiftId])).rows[0];
    if (!shift || shift.status!=="open" || (scope.kind==="spa" && shift.area!=="spa") ||
      (scope.kind==="reservation" && !["recepcion","reception"].includes(shift.area)))
      throw new FundingError("SHIFT_CLOSED","El turno seleccionado no está abierto en el área correcta.");
    return shift;
  }
  async collect(c:PoolClient,scope:Scope,row:Collection,operationId:string,actor:Actor) {
    const shift=await this.validateCollection(c,scope,row);
    const p=stableId(`${operationId}:${row.rowId}:payment`),cm=stableId(`${operationId}:${row.rowId}:cash`),fm=stableId(`${operationId}:${row.rowId}:folio`);
    const method=this.kind==="spa"?canonicalToSpa[row.method]:row.method;
    if (this.kind==="spa") {
      await c.query(`INSERT INTO ${this.paymentTable}(id,account_id,amount,method,created_at,status,is_advance)
        VALUES($1,$2,$3,$4,now(),'active','false')`,[p,scope.id,amount(row.amountCents),method]);
    } else {
      await c.query(`INSERT INTO ${this.paymentTable}(id,reservation_id,amount,method,date,status,payment_request_id,received_by)
        VALUES($1,$2,$3,$4,(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'active',$5,$6)`,
        [p,scope.id,amount(row.amountCents),method,`${operationId}:${row.rowId}`,actor.id]);
    }
    await c.query(`INSERT INTO ${this.s}.cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id,registered_by,receipt_number)
      VALUES($1,$2,$3,$4,$5,$6,$7,'income',$8,$9,nextval('${this.s}.cash_movements_receipt_number_seq')::text)`,
      [cm,row.shiftId,shift.area,this.kind==="spa"?"spa_payment":"reservation",this.kind==="spa"?p:scope.id,row.method,amount(row.amountCents),p,actor.id]);
    const f=await this.folio(c,scope);
    await c.query(`INSERT INTO ${this.s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,payment_method,cash_movement_id,registered_by)
      VALUES($1,$2,'payment',$3,'Cobro confirmado en operación financiera',$4,$5,$6,$7,$8)`,
      [fm,f.id,amount(row.amountCents),this.kind==="spa"?"spa_payment":"payment",p,method,cm,actor.id]);
    await this.refreshFolio(c,scope);
    return {id:`${scope.kind}:${p}`,sourcePaymentId:p,cashMovementId:cm,folioMovementId:fm};
  }
  async refreshFolio(c:PoolClient,scope:Scope) {
    const totals=await this.totals(c,scope);
    const f=await this.folio(c,scope);
    await c.query(`UPDATE ${this.s}.folios SET total_payments=$2,balance=total_charges-$2::numeric WHERE id=$1`,[f.id,amount(totals.paidCents)]);
    return totals;
  }
  /** Sole finalizer: never calls createSpaPayment for existing_only funding. */
  async finalize(c:PoolClient,scope:Scope,o:any,invoice:InvoiceResult,actor:Actor) {
    if (this.kind!=="spa") return;
    const account=(await c.query(`SELECT * FROM ${this.s}.spa_accounts WHERE id=$1 FOR UPDATE`,[scope.id])).rows[0];
    const totals=await this.totals(c,scope);
    if (totals.totalCents!==o.claim.totalCents || totals.paidCents!==totals.totalCents)
      throw new FundingError("SPA_BALANCE_CHANGED","La cuenta SPA no coincide con la financiación reservada.");
    if (account.invoice_id && String(account.invoice_id)!==invoice.invoiceId)
      throw new FundingError("DOCUMENT_ALREADY_ISSUED","La cuenta tiene otra factura.");
    if (account.status==="open") {
      if (!this.onFirstSpaClose) throw new FundingError("INVENTORY_ADAPTER_REQUIRED","No hay cierre transaccional configurado.",503);
      await this.onFirstSpaClose(c,scope.id,actor);
    }
    // Preserve receipt_type: the original non-fiscal receipt remains evidence.
    await c.query(`UPDATE ${this.s}.spa_accounts SET status='closed',invoice_id=$2,total_paid=$3,closed_at=COALESCE(closed_at,now()) WHERE id=$1`,
      [scope.id,invoice.invoiceId,amount(totals.paidCents)]);
    const f=await this.folio(c,scope);
    await c.query(`UPDATE ${this.s}.folios SET status='closed',total_payments=$2,balance=0,closed_at=COALESCE(closed_at,now()),closed_by=COALESCE(closed_by,$3) WHERE id=$1`,
      [f.id,amount(totals.paidCents),actor.id]);
  }
  async correctionContext(c:PoolClient,r:any,request:CorrectionRequest) {
    const source=await this.source(c,r);
    const shift=(await c.query(`SELECT * FROM ${this.s}.cash_shifts WHERE id=$1 FOR UPDATE`,[source.cash.shift_id])).rows[0];
    if (!shift) throw new FundingError("SHIFT_LINK_MISSING","El ingreso no tiene turno propietario verificable.");
    let evidence:any=null,previous:any=null;
    if (shift.status==="closed") {
      if (!request.historical) throw new FundingError("HISTORICAL_CONFIRMATION_REQUIRED","El turno está cerrado; requiere nueva preview histórica.");
      evidence=(await c.query("SELECT * FROM payment_funding.shift_evidence WHERE shift_id=$1",[shift.id])).rows[0];
      if (!evidence) throw new FundingError("HISTORY_REVIEW_REQUIRED","Falta evidencia del esperado original; no se infiere del efectivo del cierre.");
      const original=(await c.query(`SELECT to_jsonb(s) AS row FROM ${this.s}.cash_closing_summaries s WHERE id=$1 AND shift_id=$2`,[evidence.summary_id,shift.id])).rows[0]?.row;
      if (!original || hash(original)!==hash(evidence.original_summary)) throw new FundingError("CLOSING_SOURCE_CHANGED","El cierre original no coincide con la evidencia.");
      previous=(await c.query("SELECT * FROM payment_funding.rectifications WHERE shift_id=$1 ORDER BY revision DESC LIMIT 1",[shift.id])).rows[0];
    }
    return {...source,shift,evidence,previous};
  }
  async correct(c:PoolClient,r:any,request:CorrectionRequest,operationId:string,actor:Actor) {
    const ctx=await this.correctionContext(c,r,request);
    const delta:Record<string,number>={[r.method]:-number(r.effective_cents)};
    await c.query(`UPDATE ${this.s}.cash_movements SET anulado=true,motivo_anulacion=$2,anulado_por=$3,anulado_at=now() WHERE id=$1`,
      [ctx.cash.id,request.reason,actor.id]);
    if (request.action==="change_method") {
      const cm=stableId(`${operationId}:replacement`);
      const method=request.newMethod!;
      delta[method]=(delta[method]??0)+number(r.effective_cents);
      await c.query(`INSERT INTO ${this.s}.cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id,registered_by,receipt_number)
        VALUES($1,$2,$3,$4,$5,$6,$7,'income',$8,$9,nextval('${this.s}.cash_movements_receipt_number_seq')::text)`,
        [cm,ctx.shift.id,ctx.cash.area,ctx.cash.source_type,ctx.cash.source_id,method,ctx.p.amount,ctx.p.id,actor.id]);
      await c.query(`UPDATE ${this.paymentTable} SET method=$2 WHERE id=$1`,[ctx.p.id,this.kind==="spa"?canonicalToSpa[method]:method]);
      // Preserve original folio entry. A zero-value audit entry is not a payment.
      await c.query(`INSERT INTO ${this.s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,registered_by)
        VALUES($1,$2,'adjustment',0,$3,'financial_correction',$4,$5)`,
        [stableId(`${operationId}:note`),ctx.folio.id,`Medio corregido: ${r.method} → ${method}. ${request.reason}`,operationId,actor.id]);
      // Canonical link changes; history retains the original link in events.
      await c.query(`UPDATE ${this.s}.folio_movements SET cash_movement_id=$2 WHERE id=$1`,[ctx.fm.id,cm]);
      await c.query("UPDATE payment_funding.receipts SET method=$2,cash_movement_id=$3,version=version+1 WHERE id=$1",[r.id,method,cm]);
    } else {
      await c.query(`UPDATE ${this.paymentTable} SET status='anulado',motivo_anulacion=$2,anulado_at=now() WHERE id=$1`,[ctx.p.id,request.reason]);
      await c.query(`INSERT INTO ${this.s}.folio_movements(id,folio_id,type,amount,description,source_type,source_id,voided_movement_id,registered_by)
        VALUES($1,$2,'void',$3,$4,'financial_correction',$5,$6,$7)`,
        [stableId(`${operationId}:void`),ctx.folio.id,amount(-number(r.effective_cents)),request.reason,operationId,ctx.fm.id,actor.id]);
      await c.query("UPDATE payment_funding.receipts SET effective_cents=0,version=version+1 WHERE id=$1",[r.id]);
      await this.refreshFolio(c,{kind:this.kind,id:r.scope_id});
    }
    if (ctx.evidence) {
      const expected={...(ctx.previous?.expected_after??ctx.evidence.expected)};
      for (const [k,v] of Object.entries(delta)) expected[k]=(expected[k]??0)+v;
      if (Object.values(expected).some(v=>number(v)<0)) throw new FundingError("CLOSING_INCONSISTENT","La rectificación no conserva el esperado verificable.");
      await c.query(`INSERT INTO payment_funding.rectifications(id,shift_id,revision,operation_id,delta,expected_after,physical_count_cents,reason,actor_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[stableId(`${operationId}:revision`),ctx.shift.id,(ctx.previous?.revision??0)+1,operationId,
          JSON.stringify(delta),JSON.stringify(expected),ctx.evidence.physical_count_cents,request.reason,actor.id]);
    }
  }
}
