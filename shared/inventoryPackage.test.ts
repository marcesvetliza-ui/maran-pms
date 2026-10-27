import { expect, it } from 'vitest';
import { packageConversions } from './inventoryPackage';
import { inventoryUnitFactor } from './inventoryUnits';

it('records 1 unit containing 3000 g in the correct direction, including kg', () => {
  const rows = packageConversions('unidad','unidad','g',3000);
  expect(rows).toEqual([{fromUnit:'kg',factor:'0.333333333'},{fromUnit:'g',factor:'0.000333333'}]);
  const grams = Number(rows[1].factor);
  expect(300 * 18000 * grams).toBeCloseTo(1800,2);
});
it('keeps weight stock and converts a 3 kg package without an inverse factor', () => {
  expect(packageConversions('kg','unidad','g',3000)).toEqual([{fromUnit:'unidad',factor:'3'}]);
  expect(packageConversions('g','unidad','kg',3)).toEqual([{fromUnit:'unidad',factor:'3000'}]);
  expect(packageConversions('litro','caja','ml',2000)).toEqual([{fromUnit:'caja',factor:'2'}]);
});
it('rejects missing content and mass/volume conversions', () => {
  for (const amount of [0,-1,NaN,Infinity]) expect(()=>packageConversions('kg','unidad','g',amount)).toThrow();
  expect(()=>packageConversions('kg','unidad','litro',3)).toThrow();
  expect(inventoryUnitFactor('g','kg',3000)).toBe(0.001);
});
