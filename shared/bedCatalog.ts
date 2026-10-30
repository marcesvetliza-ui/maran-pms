/** Codes are persisted identities, not display names. Never rewrite historical codes. */
export type BedCatalogEntry = { code: string; name: string; isActive: boolean; displayOrder?: number };
export const legacyBedLabels: Record<string, string> = {
  MAT: "Matrimonial", TWIN: "Twin (2 camas)", MAT_CC: "Matrimonial + Cama cucheta",
  TWIN_CC: "Twin + Cama cucheta", MAT_EXTRA: "Matrimonial + Extra", MAT_CC_EXTRA: "Matrimonial + Cama cucheta + Extra",
};
export type BedOption = { value: string; label: string; disabled: boolean };
export function bedLabel(code: string, catalog: readonly BedCatalogEntry[] = []) {
  return catalog.find(b => b.code === code)?.name || (Object.hasOwn(legacyBedLabels, code) ? legacyBedLabels[code] : code);
}
export function bedCatalogOptions(catalog: readonly BedCatalogEntry[], retained: readonly string[] = []): BedOption[] {
  const codes = new Set([...catalog.filter(b => b.isActive).map(b => b.code), ...retained.filter(Boolean)]);
  return [...codes].map(value => {
    const entry = catalog.find(b => b.code === value);
    return { value, label: bedLabel(value, catalog), disabled: entry ? !entry.isActive : !Object.hasOwn(legacyBedLabels, value) };
  }).sort((a,b) => a.label.localeCompare(b.label, "es", { sensitivity: "base", numeric: true }));
}
export function roomBedOptions(catalog: readonly BedCatalogEntry[], allowed?: readonly string[] | null, current?: string | null) {
  return bedCatalogOptions(catalog, [...(allowed || []), ...(current ? [current] : [])])
    .filter(option => !allowed?.length || allowed.includes(option.value) || option.value === current)
    .map(option => ({ ...option, disabled: option.disabled || !!(allowed?.length && !allowed.includes(option.value)) }));
}
/** Keep old/inactive values unchanged, but reject new unknown/inactive choices and room-incompatible changes. */
export function validateRoomBeds(catalog: readonly BedCatalogEntry[], patch: { bedConfig?: unknown; allowedBedConfigs?: unknown }, previous?: { bedConfig?: string | null; allowedBedConfigs?: readonly string[] | null }) {
  const active = new Set(catalog.filter(b => b.isActive).map(b => b.code));
  const retained = new Set([previous?.bedConfig, ...(previous?.allowedBedConfigs || [])].filter(Boolean));
  const validNew = (code: string) => active.has(code) || (Object.hasOwn(legacyBedLabels, code) && retained.has(code) && !catalog.some(b => b.code === code));
  if (patch.allowedBedConfigs !== undefined && patch.allowedBedConfigs !== null) {
    if (!Array.isArray(patch.allowedBedConfigs) || patch.allowedBedConfigs.some(code => typeof code !== "string" || (!validNew(code) && !previous?.allowedBedConfigs?.includes(code)))) return "Elegí camajes activos del catálogo para la habitación.";
  }
  if (patch.bedConfig !== undefined && patch.bedConfig !== null && patch.bedConfig !== previous?.bedConfig) {
    if (typeof patch.bedConfig !== "string" || !validNew(patch.bedConfig)) return "El camaje seleccionado no está activo en Tipos de Camaje.";
    const allowed = patch.allowedBedConfigs === undefined ? previous?.allowedBedConfigs : patch.allowedBedConfigs;
    if (Array.isArray(allowed) && allowed.length && !allowed.includes(patch.bedConfig)) return "Ese camaje no está permitido para la habitación.";
  }
  return null;
}
