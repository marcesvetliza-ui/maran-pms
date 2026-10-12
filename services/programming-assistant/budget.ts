/** Configurable pilot ceiling; never unlimited. Includes unsuccessful investigations. */
export function dailyInvestigationLimit(value?: string | number): number {
  if(value === undefined) return 10;
  const parsed=Number(value);
  if(!Number.isInteger(parsed) || parsed<1 || parsed>30) throw new Error("ASSISTANT_DAILY_LIMIT debe ser un entero entre 1 y 30.");
  return parsed;
}
