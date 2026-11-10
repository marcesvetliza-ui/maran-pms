import { unitParent } from '@shared/chargeUnits';
import type { PoolClient } from "pg";

/** Shared provenance check for edits and cancellations of reservation charges. */
export async function invoiceSourceConflict(client: PoolClient, reservationId: string, chargeId: string, schema?: string, allowReversed = false): Promise<string | null> {
  if (schema && !/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
  const prefix = schema ? `"${schema}".` : "";
  const result = await client.query(
    `WITH RECURSIVE invoice_history(id) AS (
       SELECT si.id
         FROM ${prefix}sales_invoices si
        WHERE si.reserva_id = $1
           OR si.folio_id IN (
                SELECT f.id FROM ${prefix}folios f
                 WHERE f.entity_type = 'reservation' AND f.entity_id = $1
              )
       UNION
       SELECT child.id
         FROM ${prefix}sales_invoices child
         JOIN invoice_history parent ON child.nota_credito_id = parent.id
     )
     SELECT si.id, si.tipo_comprobante, si.estado, si.source_charge_ids,
            si.source_charge_amounts, si.items, si.observaciones, si.nota_credito_id,
            to_jsonb(si)->>'monto_total' AS monto_total,
            to_jsonb(si)->>'monto_acreditado' AS monto_acreditado,
            to_jsonb(si)->>'reconciliation_status' AS reconciliation_status
       FROM ${prefix}sales_invoices si
       JOIN invoice_history history ON history.id = si.id`,
    [reservationId],
  );

  const invoicesById = new Map(result.rows.map((row: any) => [String(row.id), row]));
  const mappingCache = new Map<string, { mapped: boolean; sourceIds: Set<string> }>();
  const resolveSourceMap = (invoice: any, seen = new Set<string>()): { mapped: boolean; sourceIds: Set<string> } => {
    const invoiceId = String(invoice.id);
    const cached = mappingCache.get(invoiceId);
    if (cached) return cached;
    if (seen.has(invoiceId)) return { mapped: false, sourceIds: new Set() };
    seen.add(invoiceId);

    const ids = new Set<string>();
    let hasMapping = false;
    const parsedIds = invoice.source_charge_ids;
    if (Array.isArray(parsedIds)) {
      const strings = parsedIds.filter((id: unknown): id is string => typeof id === "string");
      strings.forEach((id: string) => ids.add(id));
      hasMapping ||= strings.length > 0;
    } else if (parsedIds && typeof parsedIds === "object") {
      const keys = Object.keys(parsedIds);
      keys.forEach((id) => ids.add(id));
      hasMapping ||= keys.length > 0;
    }
    const parsedAmounts = invoice.source_charge_amounts;
    if (parsedAmounts && typeof parsedAmounts === "object" && !Array.isArray(parsedAmounts)) {
      const keys = Object.keys(parsedAmounts);
      keys.forEach((id) => ids.add(id));
      hasMapping ||= keys.length > 0;
    }
    const itemIds = Array.isArray(invoice.items)
      ? invoice.items.flatMap((item: any) => [
          item?.sourceChargeId,
          item?.source_charge_id,
          item?.chargeId,
          item?.charge_id,
        ].filter((id: unknown): id is string => typeof id === "string"))
      : [];
    itemIds.forEach((id: string) => ids.add(id));
    hasMapping ||= itemIds.length > 0;

    if (!hasMapping && invoice.nota_credito_id != null) {
      const parent = invoicesById.get(String(invoice.nota_credito_id));
      if (parent) {
        const inherited = resolveSourceMap(parent, seen);
        if (inherited.mapped) {
          inherited.sourceIds.forEach((id) => ids.add(id));
          hasMapping = true;
        }
      }
    }
    const resolved = { mapped: hasMapping, sourceIds: ids };
    mappingCache.set(invoiceId, resolved);
    return resolved;
  };

  // Editing an operational charge is valid once every peso of its original
  // invoice has been reversed by completed credit notes. History alone is not
  // outstanding fiscal coverage. Pending/partial credits or debit reversals
  // must keep the existing guard.
  const released = new Set<string>();
  const money = (value: unknown): bigint | null => {
    if(typeof value!=='string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value))return null;
    const [whole,decimal='']=value.split('.');return BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
  };
  const saleTypes=new Set(['FA','FB','FC','FT','FM','FMB']);
  const creditTypes=new Set(['NCA','NCB','NCC','NCT','NCM','NCMB']);
  if(allowReversed)for(const original of result.rows){
    if(!saleTypes.has(original.tipo_comprobante) || original.estado!=='anulada' || !resolveSourceMap(original).mapped)continue;
    const total=money(original.monto_total);
    if(!total || money(original.monto_acreditado)!==total)continue;
    const notes=result.rows.filter(row=>String(row.nota_credito_id)===String(original.id));
    if(!notes.length || notes.some(note=>!creditTypes.has(note.tipo_comprobante) || note.estado!=='emitida' ||
      ![null,undefined,'conciliada'].includes(note.reconciliation_status) || !money(note.monto_total)))continue;
    if(notes.reduce((sum,note)=>sum+money(note.monto_total)!,0n)!==total)continue;
    const originalSources=resolveSourceMap(original).sourceIds;
    if(notes.some(note=>[...resolveSourceMap(note).sourceIds].some(id=>!originalSources.has(id) &&
      ![...originalSources].some(source=>unitParent(source)===unitParent(id)))))continue;
    const noteIds=new Set(notes.map(note=>String(note.id)));
    // A debit note, pending adjustment, or unknown descendant can restore
    // coverage. The original may hold a backwards pointer to its latest NC.
    if(result.rows.some(row=>String(row.id)!==String(original.id) && noteIds.has(String(row.nota_credito_id))))continue;
    released.add(String(original.id));notes.forEach(note=>released.add(String(note.id)));
  }

  for (const invoice of result.rows) {
    if(released.has(String(invoice.id)))continue;
    const mapping = resolveSourceMap(invoice);
    if (!mapping.mapped) {
      return `La factura ${invoice.id} no conserva el detalle de cargos de origen; no se puede modificar con seguridad.`;
    }
    const referencias = typeof invoice.observaciones === "string" && invoice.observaciones.includes(chargeId);
    if (mapping.sourceIds.has(chargeId) || [...mapping.sourceIds].some(id=>unitParent(id)===chargeId) || referencias) {
      return `El cargo ya tiene historial fiscal asociado (comprobante ${invoice.id}, estado ${invoice.estado ?? "desconocido"}).`;
    }
  }
  return null;
}
