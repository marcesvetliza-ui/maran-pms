import type { Pool, PoolClient } from "pg";
import { FundingError, hash, identifier, type FiscalGateway, type FiscalLookup } from "../contracts";
import { FundingStore } from "../store";

/** No credentials in this identity or in the funding projection. */
export type FiscalIdentity = {
 environment: "homologacion" | "produccion"; issuer: string; tipo: "FA" | "FB";
 puntoVenta: number; numero: number; fecha: string; snapshot: any;
};
export interface FiscalTransport {
  lastNumber(identity: Omit<FiscalIdentity, "numero">, client: PoolClient): Promise<number>;
 authorize(identity: FiscalIdentity): Promise<{ cae: string; caeFechaVto: Date }>;
 lookup(identity: FiscalIdentity): Promise<{ cae: string; caeFechaVto: Date } | null>;
}

/** A restarted/parallel caller can ONLY query a previously sending identity.
 * Null/not-found and all transport failures retain the claim and funds.
 * Definitive rejection is intentionally not inferred from provider exceptions.
 */
export class PersistentFiscalGateway implements FiscalGateway {
 readonly s: string;
 readonly store: FundingStore;
 constructor(readonly pool: Pool, readonly transport: FiscalTransport, schema = "public") {
   this.s = identifier(schema); this.store = new FundingStore(pool);
 }
 private async persistResult(c: PoolClient, row: any, result: { cae: string; caeFechaVto: Date }): Promise<FiscalLookup> {
   if (!/^\d{14}$/.test(result.cae) || !Number.isFinite(result.caeFechaVto.getTime()))
     throw new FundingError("AUTHORIZATION_MISMATCH", "Respuesta fiscal inválida.");
   const o = (await c.query("SELECT claim FROM payment_funding.operations WHERE id=$1", [row.operation_id])).rows[0];
   const invoice = { operationId: row.operation_id, documentId: row.document_id, invoiceId: row.invoice_id,
     cae: result.cae, totalCents: o.claim.totalCents, claimHash: row.claim_hash };
   if (row.result && hash(row.result) !== hash(invoice))
     throw new FundingError("AUTHORIZATION_MISMATCH", "La consulta fiscal difiere del CAE guardado.");
   const linked=await c.query(`UPDATE ${this.s}.sales_invoices SET cae=$2,cae_fecha_vto=$3,estado='emitida'
     WHERE id::text=$1 AND estado IN ('autorizacion_pendiente','emitida') AND (cae IS NULL OR cae=$2)`,
     [row.invoice_id, result.cae, result.caeFechaVto.toISOString().slice(0,10)]);
   if(linked.rowCount!==1) throw new FundingError("AUTHORIZATION_MISMATCH","El borrador fiscal fue modificado o eliminado.");
   await c.query("UPDATE payment_funding.fiscal_claims SET status='authorized',result=$2 WHERE operation_id=$1",
     [row.operation_id, JSON.stringify(invoice)]);
   return { outcome: "authorized", invoice };
 }
 async authorize(operationId: string, claim: Record<string, any>): Promise<FiscalLookup> {
   const o = await this.store.operation(operationId);
   if (hash(o.claim) !== hash(claim) || o.kind !== "invoice" || o.scope_kind!=="spa" || !["authorizing","fiscal_unknown"].includes(o.status))
     throw new FundingError("AUTHORIZATION_MISMATCH", "No existe una operación fiscal reservada coincidente.");
   const ready = await this.store.transaction({kind:o.scope_kind,id:o.scope_id}, operationId, async c => {
     let row = (await c.query("SELECT * FROM payment_funding.fiscal_claims WHERE operation_id=$1 FOR UPDATE", [operationId])).rows[0];
     if (row) {
       if(row.claim_hash!==claim.claimHash || row.document_id!==claim.documentId)
         throw new FundingError("AUTHORIZATION_MISMATCH","La identidad fiscal pertenece a otra reserva.");
       return { row };
     }
     const doc = (await c.query("SELECT * FROM payment_funding.documents WHERE id=$1 FOR UPDATE", [claim.documentId])).rows[0];
     const snapshot = doc?.snapshot;
     if (!snapshot?.validatedPreparation || snapshot.currency !== "ARS" || !["FA","FB"].includes(snapshot.tipo))
       throw new FundingError("FISCAL_PREPARATION_REQUIRED", "Falta preparación fiscal validada.", 503);
     const base = {environment:snapshot.environment,issuer:snapshot.issuer,tipo:snapshot.tipo,
       puntoVenta:snapshot.puntoVenta,fecha:snapshot.fecha,snapshot} as Omit<FiscalIdentity,"numero">;
     // Serialize this series, including local drafts, BEFORE choosing a number.
      const lock=await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",
        [`funding-fiscal:${base.environment}:${base.issuer}:${base.tipo}:${base.puntoVenta}`]);
      if(lock.rows[0]?.locked!==true)
        throw new FundingError("FISCAL_OPERATION_PENDING","La serie fiscal está ocupada. Reintentá la misma operación.");
      const last = await this.transport.lastNumber(base,c);
     if (!Number.isSafeInteger(last) || last < 0) throw new Error("Invalid last fiscal number");
     const pending = await c.query(`SELECT id FROM ${this.s}.sales_invoices
       WHERE tipo_comprobante=$1 AND punto_venta=$2 AND numero>$3 AND estado<>'descartada' LIMIT 1`,
       [base.tipo,base.puntoVenta,last]);
     if (pending.rowCount) throw new FundingError("FISCAL_OPERATION_PENDING", "La serie tiene un borrador pendiente de conciliación.");
     const identity: FiscalIdentity = {...base,numero:last+1};
     const r = snapshot.recipient, m = snapshot.amounts;
     const invoice = (await c.query(`INSERT INTO ${this.s}.sales_invoices
       (tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_cuit,cliente_dni,
        cliente_document_type,cliente_condicion_iva,cliente_domicilio,monto_neto,monto_iva21,monto_iva105,
        monto_exento,monto_no_gravado,monto_total,modo_ficticio,estado,spa_account_id,folio_id,items,operador,
        cash_forma_pago_detalle)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false,'autorizacion_pendiente',
        $17,$18,$19,$20,$21) RETURNING id`,
       [base.tipo,base.puntoVenta,identity.numero,base.fecha,r.razonSocial,r.cuit??null,r.dni??null,
        r.documentType??null,r.condicionIva,r.domicilio??null,m.montoNeto,m.montoIva21,m.montoIva105,
        m.montoExento,m.montoNoGravado,m.montoTotal,o.scope_id,snapshot.folioId,
        JSON.stringify(snapshot.items),o.actor_id,JSON.stringify(claim.paymentMethods.map((p:any)=>({method:p.method,amount:p.amountCents/100})))])).rows[0];
     row = (await c.query(`INSERT INTO payment_funding.fiscal_claims
       (operation_id,document_id,claim_hash,identity,invoice_id,status) VALUES($1,$2,$3,$4,$5,'prepared') RETURNING *`,
       [operationId,claim.documentId,claim.claimHash,JSON.stringify(identity),String(invoice.id)])).rows[0];
     return { row };
   });
   if (ready.row.result) return {outcome:"authorized",invoice:ready.row.result};
   // A crash before this compare-and-set is recoverable; no network has run.
   const sending = await this.pool.query(`UPDATE payment_funding.fiscal_claims SET status='sending'
     WHERE operation_id=$1 AND status='prepared' RETURNING *`, [operationId]);
   if (!sending.rowCount) return this.lookup(operationId);
   try {
     const result = await this.transport.authorize(ready.row.identity);
     return await this.store.transaction({kind:o.scope_kind,id:o.scope_id},operationId,
       c => this.persistResult(c, ready.row, result));
   } catch {
     await this.pool.query(`UPDATE payment_funding.fiscal_claims SET status='unknown'
       WHERE operation_id=$1 AND status='sending'`, [operationId]);
     return {outcome:"unknown"};
   }
 }
 async lookup(operationId: string): Promise<FiscalLookup> {
   const row = (await this.pool.query("SELECT * FROM payment_funding.fiscal_claims WHERE operation_id=$1", [operationId])).rows[0];
   if (!row) {
     // Crash before number reservation: no possible send; initialize the same operation.
     const o = await this.store.operation(operationId);
     return this.authorize(operationId,o.claim);
   }
   if (row.result) return {outcome:"authorized",invoice:row.result};
   if (row.status === "prepared") {
     const o = await this.store.operation(operationId);
     return this.authorize(operationId,o.claim);
   }
   try {
     const result = await this.transport.lookup(row.identity);
     if (!result) return {outcome:"unknown"};
     const o = await this.store.operation(operationId);
     return await this.store.transaction({kind:o.scope_kind,id:o.scope_id}, operationId,
       async c => {
         const latest = (await c.query("SELECT * FROM payment_funding.fiscal_claims WHERE operation_id=$1 FOR UPDATE",[operationId])).rows[0];
         return this.persistResult(c, latest, result);
       });
   } catch { return {outcome:"unknown"}; }
 }
}
