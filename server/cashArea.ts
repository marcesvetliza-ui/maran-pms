// Distintas pantallas usan vocabularios de área distintos para el mismo
// lugar físico: "reception" vs "recepcion", "eventos" vs "events". Los
// cash_shifts realmente abiertos hoy usan recepcion/restaurant/spa/events —
// normalizar acá antes de buscar o crear un turno evita crear uno "fantasma"
// que nunca aparece junto al resto de los movimientos de esa área.
const CASH_SHIFT_AREA_ALIASES: Record<string, string> = {
  reception: "recepcion",
  eventos: "events",
};

export const CASH_SHIFT_AREAS = ["recepcion", "restaurant", "spa", "events"] as const;
export type CashShiftArea = (typeof CASH_SHIFT_AREAS)[number];

export function normalizeCashShiftArea(rawArea: string): string {
  return CASH_SHIFT_AREA_ALIASES[rawArea] ?? rawArea;
}

export function isValidCashShiftArea(rawArea: unknown): rawArea is CashShiftArea {
  return typeof rawArea === "string" && (CASH_SHIFT_AREAS as readonly string[]).includes(normalizeCashShiftArea(rawArea));
}
