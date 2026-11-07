import type { Pool } from 'pg';
import { isNonFiscalDocument } from '../../shared/cash-document-classification';

const fail = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
const creditTypes = new Set(['NCA','NCB','NCC','NCT','NCM','NCMB']);
export function isInvalidOriginalDraft(nc: any, originalType: unknown) {
  return creditTypes.has(nc?.tipo_comprobante) && nc.estado === 'autorizacion_pendiente' &&
    !nc.cae && nc.modo_ficticio === false && nc.reconciliation_status === 'pendiente' && isNonFiscalDocument(originalType);
}

/** Caller holds the reservation financial lock. Only FECompConsultar is supplied:
 * an HTTP failure/unknown response must throw, never count as not authorized. */
export async function discardInvalidCreditDraft(pool: Pool, id: number, reservationId: string,
  actorId: string | null, identity: { environment: string; issuer: string }, lookup: (invoice: any) => Promise<unknown>) {
  const c = await pool.connect();
  let seriesKey: string | undefined;
  try {
    const candidate = (await c.query('SELECT * FROM sales_invoices WHERE id=$1', [id])).rows[0];
    if (!candidate) {
      const proof = (await c.query("SELECT id FROM audit_logs WHERE entity_type='discarded_invalid_credit_draft' AND entity_id=$1", [String(id)])).rows;
      if (proof.length) return { discarded: true, alreadyDiscarded: true };
      throw fail('No se encontró el intento. Actualizá Facturación.');
    }
    const stored = candidate.fiscal_identity;
    if (!stored || !['homologacion','produccion'].includes(stored.environment) || stored.environment !== identity.environment || stored.issuer !== identity.issuer ||
      stored.type !== candidate.tipo_comprobante || stored.pointOfSale !== Number(candidate.punto_venta) || !stored.operationId || candidate.reserva_id !== reservationId)
      throw fail('No se pudo verificar el ambiente y emisor originales. Se conserva el intento.');
    seriesKey = `funding-fiscal:${stored.environment}:${stored.issuer}:${stored.type}:${stored.pointOfSale}`;
    if (!(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [seriesKey])).rows[0]?.locked) {
      seriesKey = undefined; throw fail('La serie fiscal está ocupada. Volvé a verificar en unos segundos.');
    }
    await c.query('BEGIN');
    const nc = (await c.query('SELECT * FROM sales_invoices WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const original = (await c.query('SELECT * FROM sales_invoices WHERE id=$1 FOR UPDATE', [nc?.nota_credito_id || 0])).rows[0];
    const operation = (await c.query('SELECT * FROM billing_operations WHERE operation_id=$1 FOR UPDATE', [stored.operationId])).rows[0];
    if (!isInvalidOriginalDraft(nc, original?.tipo_comprobante) || original.reserva_id !== reservationId || nc.reserva_id !== reservationId ||
      JSON.stringify(nc.fiscal_identity) !== JSON.stringify(stored) || !operation || operation.invoice_id !== id || operation.owner_type !== 'reservation' || operation.owner_id !== reservationId ||
      !['numbered','submitting','uncertain','rejected'].includes(operation.stage) ||
      ['environment','issuer','type','pointOfSale'].some(k => operation.fiscal_identity?.[k] !== stored[k]) ||
      nc.payment_id || nc.group_id || nc.group_payment_id || nc.group_payment_intent || nc.spa_account_id || nc.restaurant_order_id || nc.center_settlement_status ||
      nc.credit_reapplication_intent || Number(nc.monto_acreditado || 0) !== 0 || Number(original.monto_acreditado || 0) !== 0)
      throw fail('El intento tiene autorización, aplicaciones u otros vínculos que requieren revisión. No se descartó.');
    // Cover durable invoice links and NC-specific markers used by reconciliation.
    // A payment of the ORIGINAL is not a payment of this unissued credit note.
    const marker = `[nc:${id}`;
    const reference = `${nc.tipo_comprobante}-${String(nc.numero).padStart(8,'0')}`;
    const links = await c.query(`SELECT 1 FROM sales_invoices WHERE nota_credito_id=$1::integer
      UNION ALL SELECT 1 FROM payments WHERE invoice_ref ~ $5
      UNION ALL SELECT 1 FROM cash_movements WHERE source_type IN ('comprobante','invoice','credit_note') AND source_id=$1::text
      UNION ALL SELECT 1 FROM folio_movements WHERE (source_type IN ('comprobante','invoice','credit_note') AND source_id=$1::text) OR position($2 in description)>0
      UNION ALL SELECT 1 FROM charges WHERE position($2 in description)>0 OR position($3 in description)>0
      UNION ALL SELECT 1 FROM account_movements WHERE position($2 in description)>0 OR reference=$4 LIMIT 1`,
      [id, marker, `[ft-nc:${id}:`, reference, `"id"[[:space:]]*:[[:space:]]*"?${id}"?([[:space:]]*[,}])`]);
    if (links.rows.length) throw fail('Hay movimientos vinculados a la NC. Se conserva el intento para revisión.');
    if (await lookup(nc) !== null) throw fail('ARCA informa una autorización. No se puede descartar este comprobante.');
    await c.query(`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES($1,'delete','billing','discarded_invalid_credit_draft',$2,$3,$4,now())`,
      [actorId, String(id), 'Intento de NC sobre comprobante no fiscal descartado tras consulta ARCA sin autorización',
        JSON.stringify({ before: nc, operationBefore: operation, originalId: original.id, arcaNotAuthorized: true, checkedIdentity: stored })]);
    await c.query(`UPDATE billing_operations SET stage='corrected',error_code='BILLING_INVALID_CREDIT_DRAFT_DISCARDED',invoice_id=NULL,
      request_snapshot=jsonb_set(request_snapshot,'{discardedDraft}',$2::jsonb),updated_at=now() WHERE operation_id=$1`, [stored.operationId, JSON.stringify(nc)]);
    await c.query('DELETE FROM sales_invoices WHERE id=$1', [id]);
    await c.query('COMMIT');
    return { discarded: true, alreadyDiscarded: false };
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally {
    if (seriesKey) await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [seriesKey]).catch(() => {});
    c.release();
  }
}
