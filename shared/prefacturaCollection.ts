/** Collection and documentation are separate: excess money remains an advance. */
export function prefacturaCollectionDifference(request: any, invoiceTotal?: number) {
  const documented = invoiceTotal ?? (request?.items || []).reduce((sum: number, item: any) => sum + Number(item.subtotal || 0), 0);
  const collected = (request?.cashFormaPagoDetalle || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  return { documented: Math.round(documented * 100) / 100, collected: Math.round(collected * 100) / 100,
    excess: Math.max(0, Math.round((collected - documented) * 100) / 100) };
}
