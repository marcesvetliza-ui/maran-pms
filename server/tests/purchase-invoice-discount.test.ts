import {it,expect} from 'vitest';
import {applyPurchaseDiscount,restorePurchaseDiscount} from '@shared/purchaseInvoiceDiscount';
import {calculatePurchaseInvoiceTotal} from '@shared/purchaseInvoiceTotals';
const base={tipoComprobante:'FACT-A',montoNeto:'200',montoIva21:'21',montoIva105:'10.50',percepcionIibb:'7',descuentoDescripcion:'Bonificación',descuentoTipo:'porcentaje',descuentoPorcentaje:'10',stockItems:[{itemId:'i',quantity:'2',unitCost:'100'}]};
it('descuenta antes de impuestos, reduce cada IVA proporcionalmente y conserva percepciones y precios de stock',()=>{
 const invoice=applyPurchaseDiscount(base);expect(invoice).toMatchObject({montoNeto:'180.00',montoIva21:'18.90',montoIva105:'9.45',percepcionIibb:'7',stockItems:base.stockItems});expect(invoice.stockItems).toBe(base.stockItems);expect(calculatePurchaseInvoiceTotal(invoice)).toBe(215.35);expect(invoice.descuento?.importe).toBe('20.00');
});
it('el importe manual sustituye al porcentaje y distribuye centavos sin perder importe',()=>{
 const invoice=applyPurchaseDiscount({...base,montoNeto:'1',montoExento:'1',montoNoGravado:'1',descuentoTipo:'importe',descuentoImporte:'.01'});expect(Number(invoice.montoNeto)+Number(invoice.montoExento)+Number(invoice.montoNoGravado)).toBe(2.99);expect(invoice.descuento?.porcentaje).toBeNull();
});
it('Factura C disminuye la base sin inventar IVA',()=>{expect(calculatePurchaseInvoiceTotal(applyPurchaseDiscount({...base,tipoComprobante:'FACT-C',montoNeto:'100',montoIva21:'0',montoIva105:'0',percepcionIibb:'0'}))).toBe(90);});
it('Factura B aplica únicamente el descuento final informado sin recalcular IVA',()=>{
 const input={...base,tipoComprobante:'FACT-B',montoNeto:'121',montoIva21:'0',montoIva105:'0',percepcionIibb:'0',descuentoTipo:'importe',descuentoImporte:'12.10'};expect(calculatePurchaseInvoiceTotal(applyPurchaseDiscount(input))).toBe(108.90);expect(()=>applyPurchaseDiscount({...input,descuentoTipo:'porcentaje'})).toThrow('descuento final');
});
it('editar restaura los valores anteriores y no aplica la bonificación dos veces',()=>{const one=applyPurchaseDiscount(base);const two=applyPurchaseDiscount(restorePurchaseDiscount(one));expect(two.descuento).toEqual(one.descuento);expect(calculatePurchaseInvoiceTotal(two)).toBe(calculatePurchaseInvoiceTotal(one));});
it.each([{descuentoTipo:'importe',descuentoImporte:'201'},{descuentoPorcentaje:'101'},{descuentoTipo:'importe',descuentoImporte:'-1'},{descuentoDescripcion:''}])('rechaza descuentos inválidos: %j',patch=>{expect(()=>applyPurchaseDiscount({...base,...patch})).toThrow();});
it('los comprobantes sin descuento conservan todos los importes anteriores',()=>{const input={tipoComprobante:'NC-A',montoNeto:'100',montoIva21:'21'};expect(applyPurchaseDiscount(input)).toEqual({...input,descuento:null});});
