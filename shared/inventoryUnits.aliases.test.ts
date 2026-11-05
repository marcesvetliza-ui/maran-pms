import {describe,it,expect} from 'vitest';
import {inventoryUnitFactor} from './inventoryUnits';
describe('Recipe and inventory unit names',()=>{
 it.each([['L','litro',1],['L','ml',1000],['mL','L',.001],['unidades','unidad',1],['kg','g',1000]])('recognizes %s as the same dimension as %s', (from,to,factor)=>{expect(inventoryUnitFactor(from as string,to as string)).toBe(factor);});
 it('still requires an explicitly measured mass/volume equivalence',()=>{
  expect(()=>inventoryUnitFactor('L','kg')).toThrow(/equivalencia explícita/);
  expect(inventoryUnitFactor('L','kg',1.03)).toBe(1.03);
 });
});
