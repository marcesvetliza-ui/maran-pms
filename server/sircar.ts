import { iibbRateFromAmount } from '@shared/iibbRate';

export function sircarAlicuota(row: any): number {
  const saved = Number(row.alicuota);
  return Number.isFinite(saved) && saved > 0
    ? saved
    : iibbRateFromAmount(Number(row.importe_base), Number(row.importe_retenido));
}

/** Keep the existing SIRCAR layout; export the actual rate instead of a fixed zero. */
export function sircarLine(row: any, index: number): string {
  const number = String(index).padStart(5, '0');
  const cuit = (row.cuit_proveedor || '').replace(/-/g, '').padStart(11, '0');
  const date = new Date((row.fecha_comprobante || row.fecha_retencion) + 'T12:00:00');
  const formattedDate = `${date.getDate()}/${date.getMonth() + 1} /${date.getFullYear()}`;
  const base = (Number(row.importe_base) || 0).toFixed(2);
  const rate = sircarAlicuota(row).toFixed(2).padStart(6, ' ');
  const retained = (Number(row.importe_retenido) || 0).toFixed(2);
  return `${number},1,1,${row.nro_constancia},${cuit},${formattedDate},${base},${rate},${retained},004,908`;
}
