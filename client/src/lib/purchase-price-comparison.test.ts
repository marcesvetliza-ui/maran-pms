import {describe,it,expect} from 'vitest';
import {comparePurchasePrices} from './purchase-price-comparison';
const row=(price:number,extra={})=>({item_id:'a',stock_quantity:12,quantity:1,stock_unit:'unidad',unit_price:price,tipo_comprobante:'FACT-A',...extra});
describe('precios de compras',()=>{
  it('convierte cajas y omite el regalo como precio anterior',()=>{
    const rows=comparePurchasePrices([row(120),row(0),row(144)]);
    expect(rows[1].free).toBe(true);expect(rows[2]).toMatchObject({before:10,price:12,delta:2,percent:20});
  });
  it('no mezcla IVA incluido ni unidades y no inventa conversiones antiguas',()=>{
    const rows=comparePurchasePrices([row(120),row(144,{tipo_comprobante:'FACT-B'}),row(20,{stock_unit:'kg'}),row(10,{stock_quantity:null})]);
    expect(rows.slice(1).every(r=>r.delta===null)).toBe(true);expect(rows[3].price).toBeNull();
  });
});
