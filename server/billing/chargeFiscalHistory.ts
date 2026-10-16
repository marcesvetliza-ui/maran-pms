import type { PoolClient } from "pg";

/** Shared provenance check for edits and cancellations of reservation charges. */
export async function invoiceSourceConflict(client: PoolClient, reservationId: string, chargeId: string, schema?: string): Promise<string | null> {
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
            si.source_charge_amounts, si.items, si.observaciones, si.nota_credito_id
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

  for (const invoice of result.rows) {
    const mapping = resolveSourceMap(invoice);
    if (!mapping.mapped) {
      return `La factura ${invoice.id} no conserva el detalle de cargos de origen; no se puede modificar con seguridad.`;
    }
    const referencias = typeof invoice.observaciones === "string" && invoice.observaciones.includes(chargeId);
    if (mapping.sourceIds.has(chargeId) || referencias) {
      return `El cargo ya tiene historial fiscal asociado (comprobante ${invoice.id}, estado ${invoice.estado ?? "desconocido"}).`;
    }
  }
  return null;
}
