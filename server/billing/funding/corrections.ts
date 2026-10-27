import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { correctionRequestSchema, FundingError, hash, number, requirePermission, type Actor, type CorrectionRequest } from "./contracts";
import { SqlFundingAdapter } from "./adapters";
import { PaymentFundingService } from "./service";

export class PaymentCorrectionService {
  constructor(readonly funding:PaymentFundingService) {}
  async previewInside(c:PoolClient,request:CorrectionRequest,actor:Actor) {
    if (request.historical) requirePermission(actor,"funding:historical");
    const scope=request.scope,store=this.funding.store;
    await store.assertAdopted(c,scope);
    const pending=(await c.query(`SELECT id FROM payment_funding.operations
      WHERE scope_kind=$1 AND scope_id=$2 AND kind='invoice' AND status NOT IN ('applied','aborted') LIMIT 1`,[scope.kind,scope.id])).rows[0];
    if (pending) throw new FundingError("FISCAL_OPERATION_PENDING","Hay fondos reservados o autorización pendiente. Recupere la operación antes de corregir.",409,false,{operationId:pending.id});
    const receipts=(await c.query("SELECT * FROM payment_funding.balances WHERE scope_kind=$1 AND scope_id=$2 ORDER BY id",[scope.kind,scope.id])).rows;
    const primary=receipts.find(r=>r.id===request.receiptId);
    if (!primary) throw new FundingError("SCOPE_MISMATCH","El cobro no pertenece al folio.");
    const adapter=this.funding.adapter(scope) as SqlFundingAdapter;
    await adapter.assertReceipt(c,primary);
    if (request.action==="change_method" && (!request.newMethod || request.newMethod===primary.method))
      throw new FundingError("METHOD_REQUIRED","Indique un medio diferente.",422);
    if (request.action!=="void_nonexistent" && request.action!=="restore_coverage" && request.restorations.length)
      throw new FundingError("INVALID_RESTORATION","Esta acción no admite restauraciones.",422);
    if (request.action==="restore_coverage" && request.restorations.length===0)
      throw new FundingError("RESTORATION_REQUIRED","Indique el destino y monto explícitos.",422);
    const context=request.action==="restore_coverage"?null:await adapter.correctionContext(c,primary,request);
    const applications=(await c.query(`SELECT a.*,d.total_cents FROM payment_funding.applications a
      JOIN payment_funding.documents d ON d.id=a.document_id
      WHERE d.scope_kind=$1 AND d.scope_id=$2 AND a.status='applied' ORDER BY a.id`,[scope.kind,scope.id])).rows;
    const simulated=new Map(receipts.map(r=>[r.id,number(r.free_cents)]));
    const coverage=new Map<string,number>();
    for (const a of applications) {
      if (request.action==="void_nonexistent" && a.receipt_id===primary.id) continue;
      coverage.set(a.document_id,(coverage.get(a.document_id)??0)+number(a.amount_cents));
    }
    for (const restoration of request.restorations) {
      const r=receipts.find(r=>r.id===restoration.receiptId);
      if (!r || (request.action==="void_nonexistent" && r.id===primary.id)) throw new FundingError("INVALID_RESTORATION","El cobro anulado no puede financiar la restauración.");
      await adapter.assertReceipt(c,r);
      // Evidence of a prior NC release is mandatory. Not an amount-match heuristic.
      const release=(await c.query(`SELECT 1 FROM payment_funding.events WHERE kind='nc_release'
        AND payload->>'receiptId'=$1 AND payload->>'documentId'=$2 LIMIT 1`,[r.id,restoration.documentId])).rowCount;
      if (!release) throw new FundingError("RESTORATION_ORIGIN_MISSING","No hay liberación por NC documentada para ese cobro y factura.");
      const d=(await c.query("SELECT * FROM payment_funding.documents WHERE id=$1",[restoration.documentId])).rows[0];
      if (!d || d.scope_kind!==scope.kind || d.scope_id!==scope.id) throw new FundingError("SCOPE_MISMATCH","La factura no pertenece al folio.");
      const free=(simulated.get(r.id)??0)-restoration.amountCents;
      if (free<0) throw new FundingError("FUNDS_UNAVAILABLE","Los fondos fueron reservados o aplicados en otro documento.");
      simulated.set(r.id,free);
      const used=(coverage.get(d.id)??0)+restoration.amountCents;
      if (used>number(d.total_cents)) throw new FundingError("DOCUMENT_CAPACITY","La restauración excede el neto de la factura.");
      coverage.set(d.id,used);
    }
    const documents=(await c.query("SELECT * FROM payment_funding.documents WHERE scope_kind=$1 AND scope_id=$2 ORDER BY id",[scope.kind,scope.id])).rows;
    const obligations=documents.filter(d=>d.status!=="draft").map(d=>({documentId:d.id,uncoveredCents:Math.max(0,number(d.total_cents)-(coverage.get(d.id)??0))}));
    const totals=await adapter.totals(c,scope);
    return {
      previewHash:hash({request,receipts,applications,documents,shift:context?.shift,evidence:context?.evidence,previous:context?.previous}),
      request,totalCents:number(primary.effective_cents),fundingMode:"correction",paymentMethods:[],
      before:{primary,source:context?{payment:context.p,cash:context.cash,folioMovement:context.fm}:null},
      obligations,debtAfterCents:Math.max(0,totals.totalCents-totals.paidCents+(request.action==="void_nonexistent"?number(primary.effective_cents):0)),
      closingRevisionRequired:context?.shift.status==="closed",
    };
  }
  async preview(raw:unknown,actor:Actor) {
    requirePermission(actor);
    const request=correctionRequestSchema.parse(raw);
    return this.funding.store.transaction(request.scope,null,c=>this.previewInside(c,request,actor));
  }
  async confirm(id:string,previewHash:string,raw:unknown,actor:Actor) {
    requirePermission(actor);
    const request=correctionRequestSchema.parse(raw),fingerprint=hash({kind:"correction",request,previewHash});
    const f=this.funding,store=f.store;
    return store.transaction(request.scope,id,async c=>{
      const existing=(await c.query("SELECT * FROM payment_funding.operations WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if (existing) {
        if (existing.fingerprint!==fingerprint) throw new FundingError("IDEMPOTENCY_CONFLICT","El UUID ya fue usado con otro contenido.");
        return f.present(existing,true);
      }
      const preview=await this.previewInside(c,request,actor);
      if (preview.previewHash!==previewHash) throw new FundingError("PREVIEW_STALE","Cambió el folio; vuelva a previsualizar.");
      await c.query(`INSERT INTO payment_funding.operations(id,scope_kind,scope_id,kind,fingerprint,request,claim,status,actor_id)
        VALUES($1,$2,$3,'correction',$4,$5,$6,'reserved',$7)`,
        [id,request.scope.kind,request.scope.id,fingerprint,JSON.stringify(request),JSON.stringify(preview),actor.id]);
      if (request.action==="void_nonexistent") await c.query("UPDATE payment_funding.applications SET status='reversed' WHERE receipt_id=$1 AND status='applied'",[request.receiptId]);
      if (request.action!=="restore_coverage") await f.adapter(request.scope).correct(c,preview.before.primary,request,id,actor);
      for (const [index,r] of request.restorations.entries()) {
        await c.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,operation_id,application_key,amount_cents,original_cents,status,origin)
          VALUES($1,$2,$3,$4,$5,$6,$6,'applied','restore_coverage')`,[randomUUID(),r.receiptId,r.documentId,id,`restoration:${index}`,r.amountCents]);
      }
      f.fault("correction_before_commit");
      const result={action:request.action,receiptId:request.receiptId,restorations:request.restorations,
        debtCents:preview.debtAfterCents,obligations:preview.obligations};
      await store.event(c,id,`${id}:correction`,request.action,{...result,before:preview.before,reason:request.reason,evidenceRef:request.evidenceRef},actor.id);
      const op=(await c.query("UPDATE payment_funding.operations SET status='applied',result=$2 WHERE id=$1 RETURNING *",[id,JSON.stringify(result)])).rows[0];
      return f.present(op);
    });
  }
}
