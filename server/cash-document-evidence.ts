import { sql } from "drizzle-orm";
import { db } from "./db";
import { classifyCashDocument, type CashDocument } from "@shared/cash-document-classification";

type Movement = {id: string | number; sourceType: string; sourceId?: string | null; paymentId?: string | null; receiptType?: string | null; receiptNumber?: string | null};
type Executor = {execute: (query: any) => Promise<{rows: any[]}>};
/** Read-only batch lookup: exact payment/document IDs; never reservation+amount. */
export async function enrichCashDocumentEvidence<T extends Movement>(movements: T[], executor: Executor = db) {
  if (!movements.length) return [];
  const input = JSON.stringify(movements.map((m, index) => ({key:String(index), source_type:m.sourceType, source_id:m.sourceId || null, payment_id:m.paymentId || null})));
  const sources = await executor.execute(sql`
    WITH input AS (SELECT * FROM jsonb_to_recordset(${input}::jsonb) AS i(key text,source_type text,source_id text,payment_id text))
    SELECT i.*, p.invoice_ref AS reservation_ref, gp.invoice_ref AS group_ref, ep.invoice_ref AS event_ref,
           gp.invoice_id AS group_invoice, sa.invoice_id AS spa_invoice,
           COALESCE(p.id,gp.id,sp.id,ep.id) AS known_payment
    FROM input i
    LEFT JOIN payments p ON i.source_type='reservation' AND p.id=i.payment_id AND p.reservation_id=i.source_id
    LEFT JOIN group_payments gp ON i.source_type='group_payment' AND gp.id=COALESCE(i.payment_id,i.source_id)
    LEFT JOIN spa_payments sp ON i.source_type='spa_account' AND sp.id=i.payment_id AND sp.account_id=i.source_id
    LEFT JOIN spa_accounts sa ON sa.id=sp.account_id
    LEFT JOIN event_payments ep ON i.source_type='event_payment' AND ep.id=COALESCE(i.payment_id,i.source_id)
  `);
  const evidence = sources.rows.map(row => {
    const ids = new Set<number>();
    let invalid_ref = false;
    for (const ref of [row.reservation_ref,row.group_ref,row.event_ref]) {
      try { const id=Number(JSON.parse(ref || "null")?.id); if (Number.isSafeInteger(id) && id>0) ids.add(id); else if (ref) invalid_ref = true; } catch { invalid_ref = true; }
    }
    for (const value of [row.group_invoice,row.spa_invoice,row.source_type==='comprobante' ? row.source_id : null]) {
      const id=Number(value); if (Number.isSafeInteger(id) && id>0) ids.add(id);
    }
    return {...row,invoice_ids:[...ids],invalid_ref};
  });
  const claims=JSON.stringify(evidence.map(row=>({key:row.key,source_type:row.source_type,source_id:row.source_id,payment_id:row.payment_id,invoice_ids:row.invoice_ids})));
  const result = await executor.execute(sql`
    WITH input AS (SELECT * FROM jsonb_to_recordset(${claims}::jsonb) AS i(key text,source_type text,source_id text,payment_id text,invoice_ids jsonb))
    SELECT i.key, si.id, si.tipo_comprobante AS type, si.punto_venta AS "pointOfSale", si.numero AS number, si.estado AS status
    FROM input i JOIN sales_invoices si ON
      si.id IN (SELECT value::integer FROM jsonb_array_elements_text(i.invoice_ids))
      OR (i.source_type='reservation' AND si.payment_id=i.payment_id AND si.reserva_id=i.source_id)
      OR (i.source_type='group_payment' AND si.group_payment_id=COALESCE(i.payment_id,i.source_id))
      OR (i.source_type='restaurant_order' AND si.restaurant_order_id=i.source_id)
    WHERE (i.source_type <> 'reservation' OR (si.reserva_id=i.source_id AND (si.payment_id IS NULL OR si.payment_id=i.payment_id)))
      AND si.nota_credito_id IS NULL AND si.tipo_comprobante NOT LIKE 'NC%' AND si.tipo_comprobante NOT LIKE 'ND%'
    ORDER BY i.key, si.id
  `);
  const sourcesByKey = new Map(evidence.map(row=>[row.key,row]));
  const documentsByKey = new Map<string,CashDocument[]>();
  for (const row of result.rows) {
    const documents=documentsByKey.get(row.key) || [];
    documents.push(row); documentsByKey.set(row.key,documents);
  }
  return movements.map((movement,index) => {
    const source = sourcesByKey.get(String(index));
    let documents=documentsByKey.get(String(index)) || [];
    // A partial restaurant receipt belongs to its selected type, not every document on the order.
    if (movement.sourceType==='restaurant_order') documents=documents.filter(d=>d.type===movement.receiptType || ({factura_a:'FA',factura_b:'FB',factura_c:'FC'} as Record<string,string>)[movement.receiptType || '']===d.type);
    if (!documents.length && (source?.invalid_ref || source?.invoice_ids.length)) return {...movement,documentClass:"unclassified" as const,documentReference:"Vínculo de comprobante no verificable"};
    return {...movement,...classifyCashDocument(movement,documents,!!source?.known_payment)};
  });
}
