import { inventoryUnitFactor } from './inventoryUnits';

/** Translate a human-readable package content to stock units per input unit. */
export function packageConversions(stockUnit: string, packageUnit: string, contentUnit: string, content: number) {
  if (!['unidad', 'caja', 'paquete'].includes(packageUnit) || !['kg', 'g', 'litro', 'ml'].includes(contentUnit)
    || !Number.isFinite(content) || content <= 0) throw new Error('Ingresá un contenido positivo y una unidad de peso o volumen.');
  const factorText = (factor: number) => {
    if (!Number.isFinite(factor) || factor > 9999999 || factor < 0.000000001) throw new Error('El contenido está fuera del rango de equivalencias.');
    return String(Number(factor.toFixed(9)));
  };
  if (stockUnit === packageUnit) {
    const units = ['kg', 'g'].includes(contentUnit) ? ['kg', 'g'] : ['litro', 'ml'];
    return units.map(fromUnit => ({ fromUnit, factor: factorText(1 / (content * inventoryUnitFactor(contentUnit, fromUnit))) }));
  }
  return [{ fromUnit: packageUnit, factor: factorText(content * inventoryUnitFactor(contentUnit, stockUnit)) }];
}
