export type BillingPointConfig = { arcaAmbiente?: string | null; puntoVenta?: number | null; puntoVentaHomolog?: number | null };
export type BillingPoint = { numero: number; activo?: boolean | null; id?: string | number; nombre?: string; tipo?: string };
export function validPointNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string" || String(value).trim() === "" || !/^\d+$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 99999 ? number : null;
}
export function billingPointOptions(config: BillingPointConfig | null | undefined, points: BillingPoint[], allowManual = false): BillingPoint[] {
  if (!config) return [];
  if (config.arcaAmbiente === "homologacion") {
    const number = validPointNumber(config.puntoVentaHomolog);
    return number ? [{ id: "homologacion", numero: number, nombre: "Homologación (pruebas ARCA)" }] : [];
  }
  const active = points.filter(point => point.activo !== false && (allowManual || config.arcaAmbiente !== "produccion" || point.tipo !== "manual") && validPointNumber(point.numero));
  if (active.length) return active;
  const number = validPointNumber(config.puntoVenta);
  // An explicitly disabled point is never revived by the fallback.
  return number && !points.some(point => Number(point.numero) === number && (point.activo === false || !allowManual && config.arcaAmbiente === "produccion" && point.tipo === "manual"))
    ? [{ id: "configurado", numero: number, nombre: "" }] : [];
}
export function billingPointError(config: BillingPointConfig | null | undefined, points: BillingPoint[], selected: unknown): string | null {
  if (config?.arcaAmbiente && !["ficticio", "homologacion", "produccion"].includes(config.arcaAmbiente)) return "El ambiente de facturación configurado no es válido. Pedí a Administración que revise la configuración.";
  if (!config) return "Estamos cargando la configuración de facturación. Esperá un momento.";
  const number = validPointNumber(selected);
  if (!number || !billingPointOptions(config, points).some(point => Number(point.numero) === number)) {
    return config.arcaAmbiente === "homologacion"
      ? "El punto de venta no corresponde al ambiente de homologación. Seleccioná el punto de pruebas configurado."
      : "Elegí un punto de venta habilitado antes de emitir.";
  }
  return null;
}
