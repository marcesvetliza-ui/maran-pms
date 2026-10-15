import { FundingError, hash, number, type Actor, type Scope } from "./contracts";
import { PaymentFundingService } from "./service";

/** Called ONLY by a trusted NC reconciler after verifying fiscal provenance.
 * Not exposed as a client endpoint and does not issue a credit note.
 */
export async function reconcileVerifiedCreditNote(f:PaymentFundingService,scope:Scope,proof:{
  creditNoteId:string; documentId:string; amountCents:number;
},actor:Actor) {
  return f.store.transaction(scope,null,async c=>{
    await f.store.assertAdopted(c,scope);
    const eventKey=`nc:${proof.documentId}:${proof.creditNoteId}`;
    const previous=(await c.query("SELECT payload FROM payment_funding.events WHERE event_key=$1",[eventKey])).rows[0];
    if (previous) {
      if (hash(previous.payload.proof)!==hash(proof)) throw new FundingError("IDEMPOTENCY_CONFLICT","La misma NC tiene otro importe o documento.");
      return previous.payload;
    }
    if (!Number.isSafeInteger(proof.amountCents) || proof.amountCents<=0) throw new FundingError("INVALID_MONEY","Importe de NC inválido.",422);
    const doc=(await c.query("SELECT * FROM payment_funding.documents WHERE id=$1 FOR UPDATE",[proof.documentId])).rows[0];
    if (!doc || doc.scope_kind!==scope.kind || doc.scope_id!==scope.id || doc.status!=="issued")
      throw new FundingError("NC_SOURCE_MISMATCH","No existe la factura original de esta NC.");
    if ((await c.query("SELECT 1 FROM payment_funding.applications WHERE document_id=$1 AND status='held'",[doc.id])).rowCount)
      throw new FundingError("FISCAL_OPERATION_PENDING","No se libera cobertura con fondos reservados.");
    if (proof.amountCents>number(doc.total_cents)) throw new FundingError("NC_EXCEEDS_NET","La NC excede el neto vigente.");
    const originals=(await c.query(`SELECT * FROM payment_funding.applications
      WHERE document_id=$1 AND status='applied' AND origin IN ('legacy_verified','invoice','new_collection') ORDER BY receipt_id`,[doc.id])).rows;
    for (const a of originals) {
      // Existing proportional rule. Never match a payment to a service's price.
      const release=Math.round(number(a.original_cents)*proof.amountCents/number(doc.original_cents));
      if (!release) continue;
      if (release>number(a.amount_cents)) throw new FundingError("NC_RECONCILIATION_REQUIRED","Las aplicaciones posteriores requieren revisión; no se reinfiere el reparto.");
      if (release===number(a.amount_cents)) await c.query("UPDATE payment_funding.applications SET status='reversed' WHERE id=$1",[a.id]);
      else await c.query("UPDATE payment_funding.applications SET amount_cents=amount_cents-$2 WHERE id=$1",[a.id,release]);
      await f.store.event(c,null,`${eventKey}:${a.id}`,"nc_release",{
        receiptId:a.receipt_id,documentId:doc.id,applicationId:a.id,creditNoteId:proof.creditNoteId,
        amountCents:release,scopeKey:`${scope.kind}:${scope.id}`,
      },actor.id);
    }
    await c.query("UPDATE payment_funding.documents SET total_cents=total_cents-$2,version=version+1 WHERE id=$1",[doc.id,proof.amountCents]);
    const payload={proof,scopeKey:`${scope.kind}:${scope.id}`};
    await f.store.event(c,null,eventKey,"credit_note_reconciled",payload,actor.id);
    return payload;
  });
}
