import { INVENTORY_UNITS, inventoryUnitFactor } from './inventoryUnits';

export function validateInventoryConversions(lines: unknown, stockUnit: string): asserts lines is Array<{fromUnit:string;factor:string}> {
  const invalid = (message:string) => Object.assign(new Error(message), {statusCode:400});
  if (!Array.isArray(lines) || lines.length > 8 || new Set(lines.map(l=>l?.fromUnit)).size !== lines.length || lines.some(l=>!l || !INVENTORY_UNITS.includes(l.fromUnit) || !Number.isFinite(Number(l.factor)) || Number(l.factor)<=0 || Number(l.factor)>9999999)) {
    throw invalid('Equivalencias inválidas; usá unidades distintas y factores positivos');
  }
  for (const line of lines) {
    if (line.fromUnit===stockUnit && Number(line.factor)!==1) throw invalid('La unidad de stock siempre equivale a 1');
    let standard:number|undefined;
    try { standard=inventoryUnitFactor(line.fromUnit,stockUnit); } catch {}
    if (standard!==undefined && Math.abs(Number(line.factor)-standard)>1e-9) throw invalid('Las equivalencias estándar de masa, volumen y docena no se pueden modificar');
  }
}
