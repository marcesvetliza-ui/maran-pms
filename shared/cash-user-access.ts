/** Explicit operating-cash roster approved by hotel management, 2026-10-30.
 * Exact account names: no role, department or display-name grants. New accounts
 * retain viewing but cannot open, take or hand over an operating shift.
 */
const globalOperators = new Set([
  "admin", "analia.martinez", "berta.goldbarg", "diego.beber", "gerencia",
  "gonzalo.villanueva", "jesica.bonilla", "jessica.schusler", "ailin.celestre", "luciana.lisman",
]);
const operators: Record<string, ReadonlySet<string>> = {
  reception: new Set(["emanuel.castro", "leonardo.de.castro", "lucia.espinosa", "recepcion1", "matias.cardozo", "matias.hernandez", "yamil.latuf"]),
  restaurant: new Set(["florencia.ruiz.diaz", "gabriel.sobrino", "martin.gamarra", "martin.gimenez", "matias.sobrino", "miguel.sartori", "rosina.rodriguez"]),
  spa: new Set(["spa1", "nerina.almada", "solana.marzolini"]),
};
const excluded = new Set([
  "aixa.duarte", "housekeeping1", "paula.deharbe", "Jose Pablo Hskn",
  "diego.godoy", "emiliano.duarte", "ezequiel.ramirez", "Jose Pablo Mant",
  "julian.rendler", "Jose Pablo Deposito", "helga.solis", "Jose Pablo Even",
]);
export function canViewCash(username?: string | null): boolean {
  return !!username && !excluded.has(username);
}
export function canOperateCash(username: string | null | undefined, area: string): boolean {
  const canonical = ({ recepcion: "reception", restaurante: "restaurant" } as Record<string, string>)[area] || area;
  return canViewCash(username) && Object.hasOwn(operators, canonical)
    && (globalOperators.has(username!) || operators[canonical].has(username!));
}
export function hasGlobalCashAccess(username?: string | null): boolean {
  return !!username && globalOperators.has(username);
}
