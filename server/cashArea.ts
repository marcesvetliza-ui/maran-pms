// Distintas pantallas usan vocabularios de área distintos para el mismo
// lugar físico: "reception" vs "recepcion", "eventos" vs "events".
const CASH_SHIFT_AREA_ALIASES: Record<string, string> = {
  reception: "recepcion",
  eventos: "events",
};

const CASH_SHIFT_AREA_ALIAS_VARIANTS: Record<string, string[]> = {
  reception: ["reception", "recepcion"],
  recepcion: ["reception", "recepcion"],
  eventos: ["eventos", "events"],
  events: ["eventos", "events"],
};

export const CASH_SHIFT_AREAS = ["recepcion", "restaurant", "spa", "events"] as const;
export type CashShiftArea = (typeof CASH_SHIFT_AREAS)[number];

export function normalizeCashShiftArea(rawArea: string): string {
  return CASH_SHIFT_AREA_ALIASES[rawArea] ?? rawArea;
}

export function getCashShiftAreaVariants(rawArea: string): string[] {
  return CASH_SHIFT_AREA_ALIAS_VARIANTS[rawArea] ?? [rawArea];
}

export function isValidCashShiftArea(rawArea: unknown): rawArea is CashShiftArea {
  return typeof rawArea === "string" && (CASH_SHIFT_AREAS as readonly string[]).includes(normalizeCashShiftArea(rawArea));
}
