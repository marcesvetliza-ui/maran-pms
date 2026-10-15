import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  fundingRequestSchema, FundingError, hash, number, requirePermission, stableId,
  type Actor, type FundingAdapter, type FundingRequest, type Scope, type FiscalGateway, type InvoiceResult,
} from "./contracts";
import { FundingStore } from "./store";

export class PaymentFundingService {
  constructor(
    readonly store: FundingStore,
    readonly adapters: Record<Scope["kind"], FundingAdapter>,
    readonly fiscal: FiscalGateway,
    readonly fault: (point: string) => void = () => {},
  ) {}
  adapter(scope: Scope) { return this.adapters[scope.kind]; }
  async scope(scope: Scope, actor: Actor) {
    requirePermission(actor, "funding:read");
    return this.store.transaction(scope,null,async c => {
      await this.store.assertAdopted(c,scope);
      const params=[scope.kind,scope.id];
      const receipts=(await c.query("SELECT * FROM payment_funding.balances WHERE scope_kind=$1 AND scope_id=$2 ORDER BY id",params)).rows;
      const documents=(await c.query("SELECT * FROM payment_funding.documents WHERE scope_kind=$1 AND scope_id=$2 ORDER BY id",params)).rows;
      const operations=(await c.query("SELECT * FROM payment_funding.operations WHERE scope_kind=$1 AND scope_id=$2 ORDER BY created_at",params)).rows;
      const rectifications=(await c.query(`SELECT DISTINCT r.* FROM payment_funding.rectifications r
        JOIN payment_funding.operations o ON o.id=r.operation_id WHERE o.scope_kind=$1 AND o.scope_id=$2 ORDER BY r.revision`,params)).rows;
      const events=(await c.query(`SELECT e.* FROM payment_funding.events e
        LEFT JOIN payment_funding.operations o ON o.id=e.operation_id
        WHERE (o.scope_kind=$1 AND o.scope_id=$2) OR (e.payload->>'scopeKey')=$3 ORDER BY e.seq`,[...params,`${scope.kind}:${scope.id}`])).rows;
      const totals=await this.adapter(scope).totals(c,scope);
      return {scope,receipts:receipts.map(r=>({
        id:r.id,sourcePaymentId:r.source_payment_id,method:r.method,amountCents:number(r.effective_cents),
        originalAmountCents:number(r.original_cents),appliedCents:number(r.applied_cents),
        heldCents:number(r.held_cents),freeCents:number(r.free_cents),version:number(r.version),
      })),documents:documents.map(d=>({id:d.id,totalCents:number(d.total_cents),status:d.status,snapshot:d.snapshot})),
      operations:operations.map(o=>this.present(o)),debtCents:Math.max(0,totals.totalCents-totals.paidCents),
      rectifications:rectifications.map(r=>({shiftId:r.shift_id,revision:r.revision,delta:r.delta,
        expectedAfter:r.expected_after,physicalCountCents:r.physical_count_cents===null?null:number(r.physical_count_cents),reason:r.reason})),events};
    });
  }
  present(o: any, replayed=false) {
    return {id:o.id,scope:{kind:o.scope_kind,id:o.scope_id},status:o.status,invoice:o.invoice,
      result:o.result,lastError:o.last_error,replayed,fundsRetained:!["applied","aborted"].includes(o.status),
      canAuthorize:o.kind==="invoice" && o.status==="reserved",
      canFinalize:o.status==="authorized_pending_link",canResume:["authorizing","fiscal_unknown","authorized_pending_link"].includes(o.status)};
  }
  async get(id: string, actor: Actor) {
    requirePermission(actor,"funding:read");
    return this.present(await this.store.operation(id));
  }
  async previewInside(c: PoolClient, request: FundingRequest) {
    const scope=request.scope;
    await this.store.assertAdopted(c,scope);
    await this.adapter(scope).assertScope(c,scope);
    const doc=(await c.query("SELECT * FROM payment_funding.documents WHERE id=$1",[request.documentId])).rows[0];
    if (!doc || doc.scope_kind!==scope.kind || doc.scope_id!==scope.id) throw new FundingError("SCOPE_MISMATCH","El documento no pertenece al folio.");
    if (doc.status!=="draft") throw new FundingError("DOCUMENT_ALREADY_ISSUED","El documento ya fue autorizado o emitido.");
    const active=(await c.query("SELECT 1 FROM payment_funding.applications WHERE document_id=$1 AND status IN ('held','applied') LIMIT 1",[doc.id])).rowCount;
    if (active) throw new FundingError("DOCUMENT_CLAIMED","El documento ya tiene fondos reclamados.");
    if (scope.kind==="spa" && (await c.query("SELECT 1 FROM payment_funding.operations WHERE scope_kind='spa' AND scope_id=$1 AND kind='invoice' AND status<>'aborted'",[scope.id])).rowCount) {
      throw new FundingError("FISCAL_OPERATION_PENDING","La cuenta SPA ya tiene una operación fiscal; recupere esa operación.");
    }
    const totals=await this.adapter(scope).totals(c,scope);
    const pending=(await c.query(`SELECT COALESCE(SUM((r->>'amountCents')::bigint),0)::bigint AS n
      FROM payment_funding.operations o CROSS JOIN LATERAL jsonb_array_elements(o.request->'newCollections') r
      WHERE o.scope_kind=$1 AND o.scope_id=$2 AND o.kind='invoice' AND o.status NOT IN ('applied','aborted')`,[scope.kind,scope.id])).rows[0].n;
    const newCents=request.newCollections.reduce((n,r)=>n+r.amountCents,0);
    if (newCents>Math.max(0,totals.totalCents-totals.paidCents-number(pending)))
      throw new FundingError("COLLECTION_EXCEEDS_DEBT","El cobro nuevo excede la deuda no reservada de la cuenta.",422);
    const shifts=[];
    for(const row of [...request.newCollections].sort((a,b)=>a.shiftId.localeCompare(b.shiftId)))
      shifts.push(await this.adapter(scope).validateCollection(c,scope,row));
    const ids=request.applications.map(a=>a.receiptId);
    if (new Set(ids).size!==ids.length || new Set(request.newCollections.map(r=>r.rowId)).size!==request.newCollections.length)
      throw new FundingError("DUPLICATE_SELECTION","No repita recibos ni filas de cobro.",422);
    const paymentMethods: Array<{method:string;amountCents:number}>=[];
    const versions:any[]=[];
    for (const a of [...request.applications].sort((a,b)=>a.receiptId.localeCompare(b.receiptId))) {
      const r=(await c.query("SELECT * FROM payment_funding.balances WHERE id=$1",[a.receiptId])).rows[0];
      if (!r || r.scope_kind!==scope.kind || r.scope_id!==scope.id) throw new FundingError("SCOPE_MISMATCH","El cobro no pertenece al folio.");
      await this.adapter(scope).assertReceipt(c,r);
      if (a.amountCents>number(r.free_cents)) throw new FundingError("FUNDS_UNAVAILABLE","Los fondos ya están aplicados o reservados.");
      versions.push({id:r.id,version:r.version,free:r.free_cents});
      paymentMethods.push({method:r.method,amountCents:a.amountCents});
    }
    for (const row of request.newCollections) paymentMethods.push({method:row.method,amountCents:row.amountCents});
    const totalCents=paymentMethods.reduce((s,r)=>s+r.amountCents,0);
    if (totalCents!==number(doc.total_cents)) throw new FundingError("FUNDING_TOTAL_MISMATCH","La financiación debe cubrir exactamente el documento.",422);
    // No client-provided fiscal identity, total or method snapshot is trusted.
    const claim={documentId:doc.id,scope,totalCents,snapshot:doc.snapshot,paymentMethods,
      fundingMode:request.newCollections.length?"existing_and_new":"existing_only"};
    return {previewHash:hash({request,versions,shifts,totals,pending,documentVersion:doc.version,claim}),...claim,request};
  }
  async preview(raw: unknown, actor: Actor) {
    requirePermission(actor);
    const request=fundingRequestSchema.parse(raw);
    return this.store.transaction(request.scope,null,c=>this.previewInside(c,request));
  }
  async reserve(operationId: string, previewHash: string, raw: unknown, actor: Actor) {
    requirePermission(actor);
    const request=fundingRequestSchema.parse(raw);
    const fingerprint=hash({kind:"invoice",request,previewHash});
    return this.store.transaction(request.scope,operationId,async c=>{
      const previous=(await c.query("SELECT * FROM payment_funding.operations WHERE id=$1 FOR UPDATE",[operationId])).rows[0];
      if (previous) {
        if (previous.fingerprint!==fingerprint) throw new FundingError("IDEMPOTENCY_CONFLICT","El UUID ya fue usado con otro contenido.");
        return this.present(previous,true);
      }
      const preview=await this.previewInside(c,request);
      if (preview.previewHash!==previewHash) throw new FundingError("PREVIEW_STALE","Cambió el folio. Genere una nueva previsualización.");
      const claim={...preview,claimHash:hash(preview)};
      const op=(await c.query(`INSERT INTO payment_funding.operations(id,scope_kind,scope_id,kind,fingerprint,request,claim,status,actor_id)
        VALUES($1,$2,$3,'invoice',$4,$5,$6,'reserved',$7) RETURNING *`,
        [operationId,request.scope.kind,request.scope.id,fingerprint,JSON.stringify(request),JSON.stringify(claim),actor.id])).rows[0];
      for (const a of [...request.applications].sort((a,b)=>a.receiptId.localeCompare(b.receiptId))) {
        await c.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,operation_id,application_key,amount_cents,original_cents,status,origin)
          VALUES($1,$2,$3,$4,$2,$5,$5,'held','invoice')`,[randomUUID(),a.receiptId,request.documentId,operationId,a.amountCents]);
      }
      await this.store.event(c,operationId,`${operationId}:reserved`,"funds_reserved",claim,actor.id);
      return this.present(op);
    });
  }
  async withOperation<T>(id: string, actor: Actor, run:(c:PoolClient,o:any)=>Promise<T>) {
    requirePermission(actor);
    const initial=await this.store.operation(id);
    return this.store.transaction({kind:initial.scope_kind,id:initial.scope_id},id,async c=>{
      const o=(await c.query("SELECT * FROM payment_funding.operations WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if (o.kind!=="invoice") throw new FundingError("WRONG_OPERATION_KIND","Esta operación no es una emisión.");
      return run(c,o);
    });
  }
  async authorize(id: string, actor: Actor) {
    const started=await this.withOperation(id,actor,async(c,o)=>{
      if (o.status!=="reserved") return {start:false,operation:o};
      const updated=(await c.query("UPDATE payment_funding.operations SET status='authorizing',updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
      await this.store.event(c,id,`${id}:authorizing`,"authorization_started",{},actor.id);
      return {start:true,operation:updated};
    });
    if (!started.start) return this.present(started.operation,true);
    try {
      const outcome=await this.fiscal.authorize(id,started.operation.claim);
      // External authorization was durably committed by the fiscal provider.
      // Deliberate crash point proves recovery even before local CAE persistence.
      this.fault("after_cae");
      if (outcome.outcome==="authorized") return this.recordAuthorization(id,outcome.invoice,actor);
      return this.markUnknown(id,actor,outcome.outcome==="rejected"?"Rechazo fiscal confirmado; puede abortar explícitamente.":"Resultado fiscal desconocido; fondos retenidos.");
    } catch (error:any) {
      return this.markUnknown(id,actor,error.message);
    }
  }
  async markUnknown(id:string,actor:Actor,message:string) {
    return this.withOperation(id,actor,async(c,o)=>{
      if (o.status==="authorizing") {
        o=(await c.query("UPDATE payment_funding.operations SET status='fiscal_unknown',last_error=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,message])).rows[0];
      }
      return this.present(o);
    });
  }
  async recordAuthorization(id:string,invoice:InvoiceResult,actor:Actor) {
    return this.withOperation(id,actor,async(c,o)=>{
      if (o.invoice) {
        if (hash(o.invoice)!==hash(invoice)) throw new FundingError("AUTHORIZATION_MISMATCH","La autorización no coincide con la operación.");
        return this.present(o,true);
      }
      if (!["authorizing","fiscal_unknown"].includes(o.status) ||
        invoice.operationId!==id || invoice.documentId!==o.claim.documentId ||
        invoice.totalCents!==o.claim.totalCents || invoice.claimHash!==o.claim.claimHash ||
        !/^\d{14}$/.test(invoice.cae)) throw new FundingError("AUTHORIZATION_MISMATCH","La autorización no coincide con el snapshot reservado.");
      const updated=(await c.query(`UPDATE payment_funding.operations SET invoice=$2,status='authorized_pending_link',last_error=NULL,updated_at=now()
        WHERE id=$1 RETURNING *`,[id,JSON.stringify(invoice)])).rows[0];
      await c.query("UPDATE payment_funding.documents SET status='authorized',invoice_id=$2,version=version+1 WHERE id=$1",[invoice.documentId,invoice.invoiceId]);
      await this.store.event(c,id,`${id}:cae`,"cae_authorized_funds_retained",invoice,actor.id);
      return this.present(updated);
    });
  }
  async finalize(id:string,actor:Actor) {
    try {
      return await this.withOperation(id,actor,async(c,o)=>{
        if (o.status==="applied") return this.present(o,true);
        if (o.status!=="authorized_pending_link" || !o.invoice) throw new FundingError("NOT_AUTHORIZED","Debe recuperar o autorizar esta misma operación antes de vincular.");
        const scope:Scope={kind:o.scope_kind,id:o.scope_id};
        const adapter=this.adapter(scope);
        await adapter.assertScope(c,scope,id);
        for(const row of [...o.request.newCollections as FundingRequest["newCollections"]].sort((a,b)=>a.shiftId.localeCompare(b.shiftId)))
          await adapter.validateCollection(c,scope,row);
        const totals=await adapter.totals(c,scope);
        const newCents=(o.request.newCollections as FundingRequest["newCollections"]).reduce((n,r)=>n+r.amountCents,0);
        if(newCents>Math.max(0,totals.totalCents-totals.paidCents))
          throw new FundingError("COLLECTION_EXCEEDS_DEBT","La deuda cambió: conservar la operación para conciliación, sin registrar otro ingreso.");
        const held=(await c.query(`SELECT b.* FROM payment_funding.balances b JOIN payment_funding.applications a ON a.receipt_id=b.id
          WHERE a.operation_id=$1 AND a.status='held' ORDER BY b.id`,[id])).rows;
        for (const r of held) await adapter.assertReceipt(c,r);
        for (const row of o.request.newCollections as FundingRequest["newCollections"]) {
          const r=await adapter.collect(c,scope,row,id,actor);
          await c.query(`INSERT INTO payment_funding.receipts(id,scope_kind,scope_id,source_payment_id,original_cents,effective_cents,method,cash_movement_id,folio_movement_id)
            VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8)`,
            [r.id,scope.kind,scope.id,r.sourcePaymentId,row.amountCents,row.method,r.cashMovementId,r.folioMovementId]);
          await c.query("INSERT INTO payment_funding.collections(operation_id,row_id,receipt_id) VALUES($1,$2,$3)",[id,row.rowId,r.id]);
          await c.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,operation_id,application_key,amount_cents,original_cents,status,origin)
            VALUES($1,$2,$3,$4,$5,$6,$6,'applied','new_collection')`,
            [stableId(`${id}:${row.rowId}:application`),r.id,o.claim.documentId,id,`new:${row.rowId}`,row.amountCents]);
        }
        this.fault("finalize_after_cash");
        // This is the only application transition. Held amounts are not debited again.
        await c.query("UPDATE payment_funding.applications SET status='applied' WHERE operation_id=$1 AND status='held'",[id]);
        await adapter.finalize(c,scope,o,o.invoice,actor);
        await c.query("UPDATE payment_funding.documents SET status='issued',version=version+1 WHERE id=$1",[o.claim.documentId]);
        const result={invoiceId:o.invoice.invoiceId,documentId:o.claim.documentId,
          fundingMode:o.claim.fundingMode,totalCents:o.claim.totalCents,
          newCollectionCents:(o.request.newCollections as any[]).reduce((s,r)=>s+r.amountCents,0),
          paymentMethods:o.claim.paymentMethods};
        await c.query("INSERT INTO payment_funding.settlements(operation_id,invoice_id,result) VALUES($1,$2,$3)",[id,o.invoice.invoiceId,JSON.stringify(result)]);
        await this.store.event(c,id,`${id}:settled`,"funding_finalized",result,actor.id);
        const updated=(await c.query("UPDATE payment_funding.operations SET status='applied',result=$2,last_error=NULL,updated_at=now() WHERE id=$1 RETURNING *",[id,JSON.stringify(result)])).rows[0];
        return this.present(updated);
      });
    } catch (error:any) {
      // Financial writes rolled back. The CAE and holds must survive this failure.
      await this.store.pool.query("UPDATE payment_funding.operations SET last_error=$2 WHERE id=$1 AND status='authorized_pending_link'",[id,error.message]);
      throw error;
    }
  }
  async resume(id:string,actor:Actor) {
    requirePermission(actor);
    let op=await this.store.operation(id);
    if (op.status==="applied") return this.present(op,true);
    if (["authorizing","fiscal_unknown"].includes(op.status)) {
      const outcome=await this.fiscal.lookup(id);
      if (outcome.outcome!=="authorized") return this.present(op,true);
      await this.recordAuthorization(id,outcome.invoice,actor);
      op=await this.store.operation(id);
    }
    if (op.status==="authorized_pending_link") return this.finalize(id,actor);
    return this.present(op,true);
  }
  async abort(id:string,actor:Actor) {
    requirePermission(actor);
    const initial=await this.store.operation(id);
    const proof=initial.status==="fiscal_unknown"?await this.fiscal.lookup(id):null;
    return this.withOperation(id,actor,async(c,o)=>{
      if (o.status==="aborted") return this.present(o,true);
      if(o.request.newCollections.length)
        throw new FundingError("NEW_COLLECTION_RECONCILIATION_REQUIRED","La intención contiene dinero nuevo confirmado; requiere conciliación de ese cobro antes de abortar.");
      if (o.invoice || !(
        o.status==="reserved" || (o.status==="fiscal_unknown" && proof?.outcome==="rejected")
      )) throw new FundingError("FUNDS_MUST_REMAIN_RESERVED","Hay CAE o resultado fiscal pendiente. Recupere la misma operación; no se liberan fondos.");
      await c.query("UPDATE payment_funding.applications SET status='reversed' WHERE operation_id=$1 AND status='held'",[id]);
      const updated=(await c.query("UPDATE payment_funding.operations SET status='aborted',updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
      await this.store.event(c,id,`${id}:aborted`,"funding_aborted",{},actor.id);
      return this.present(updated);
    });
  }
}
