import {describe,it,expect} from 'vitest';
import {validateInventoryConversions} from '../inventoryConversionValidation';
describe('equivalencias en alta y edición',()=>{
 it('permite artículos sin equivalencias y factores propios positivos',()=>{
  expect(()=>validateInventoryConversions([],'unidad')).not.toThrow();
  expect(()=>validateInventoryConversions([{fromUnit:'caja',factor:'12.5'}],'unidad')).not.toThrow();
 });
 it('rechaza duplicados, factores inválidos y cambios de equivalencias estándar',()=>{
  for(const lines of [[{fromUnit:'caja',factor:'0'}],[{fromUnit:'caja',factor:'NaN'}],[{fromUnit:'caja',factor:'12'},{fromUnit:'caja',factor:'24'}],[{fromUnit:'g',factor:'2'}]]) {
   expect(()=>validateInventoryConversions(lines,'kg')).toThrow();
  }
  expect(()=>validateInventoryConversions([{fromUnit:'g',factor:'0.001'}],'kg')).not.toThrow();
 });
});
