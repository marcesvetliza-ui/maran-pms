import {describe,it,expect} from 'vitest';
import {calculateGroupPersonalExtrasCap} from './groupPersonalExtras';
const base={config:'accommodation',extras:77000,lodging:181500,directPaid:181500,personalPaid:0,groupFunds:0,groupLodging:181500};
describe('group room personal extras balance',()=>{
 it('keeps unpaid extras collectible after a direct payment of lodging',()=>{
  expect(calculateGroupPersonalExtrasCap(base)).toBe(77000);
  expect(calculateGroupPersonalExtrasCap({...base,directPaid:100000})).toBe(77000);
 });
 it('deducts explicit extras receipts regardless of unpaid lodging',()=>{
  expect(calculateGroupPersonalExtrasCap({...base,directPaid:38500,personalPaid:38500})).toBe(38500);
  expect(calculateGroupPersonalExtrasCap({...base,directPaid:258500,personalPaid:77000})).toBe(0);
 });
 it('uses only the excess of general payments above lodging toward extras',()=>{
  expect(calculateGroupPersonalExtrasCap({...base,directPaid:220000})).toBe(38500);
  expect(calculateGroupPersonalExtrasCap({...base,directPaid:258500})).toBe(0);
  expect(calculateGroupPersonalExtrasCap({...base,directPaid:200000,personalPaid:20000})).toBe(57000);
 });
 it('retains group funding safeguards and cent precision',()=>{
  expect(calculateGroupPersonalExtrasCap({...base,config:'all'})).toBe(0);
  expect(calculateGroupPersonalExtrasCap({...base,groupFunds:201500})).toBe(57000);
  expect(calculateGroupPersonalExtrasCap({...base,extras:'77000.01',directPaid:'181500.01'})).toBe(77000);
 });
});
