import {describe,it,expect} from 'vitest';
import {informationalSummary} from './cash-informational-summary';
describe('Resumen informativo de caja',()=>{
 it('separa NC y cuenta corriente sin sumar cobros ni anulados',()=>{
  const rows=[
   {paymentMethod:'nc',amount:'390000',movementType:'informational'},
   {paymentMethod:'nc',amount:'144000',movementType:'informational'},
   ...['151500','382800','466000','501000.04'].map(amount=>({paymentMethod:'cuenta_corriente',amount,movementType:'informational'})),
   {paymentMethod:'credit',amount:'21600',movementType:'income'},
   {paymentMethod:'nc',amount:'999999',movementType:'informational',anulado:true},
  ];
  const result=informationalSummary(rows,method=>method);
  expect(result.nc.count).toBe(2);expect(result.nc.total).toBe(534000);
  expect(result.cuenta_corriente.count).toBe(4);expect(result.cuenta_corriente.total).toBeCloseTo(1501300.04);
  expect(result.credit).toBeUndefined();expect(result.nc.items).toHaveLength(2);
 });
 it('agrupa alias y conserva cada detalle para desplegarlo',()=>{
  const rows=[{paymentMethod:'voucher',amount:'100',movementType:'informational'},
   {paymentMethod:'vale',amount:'200',movementType:'informational'}];
  const result=informationalSummary(rows,method=>method==='vale'?'voucher':method);
  expect(result.voucher).toEqual({count:2,total:300,items:rows});
 });
});
