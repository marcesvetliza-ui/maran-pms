import { describe, expect, it } from 'vitest';
import { buildCashClosingHtml, compactClosingIdentity, type ClosingPrintReport } from './cash-closing-print';
const base:ClosingPrintReport={area:'Recepción',shift:'Lunes Mañana',date:'lunes, 16/11/2026',openedBy:'A',openedTime:'05:52',closedBy:'B',closedTime:'14:15',generatedAt:'16/11/2026 14:27',total:90,count:2,methods:[{label:'Efectivo',total:90,count:2}],documents:[{label:'Comprobante fiscal',total:100}],systemCash:90,countedCash:90,movements:[]};
const movement={time:'12:30',description:'PÉREZ',room:'307',method:'Efectivo',amount:100,kind:'income',document:'Factura B 0005-00000001',documentClass:'Comprobante fiscal'};
describe('compact cash closing print',()=>{
 it('extracts a reliable surname and room without repeating reservation or payment identifiers',()=>{
  expect(compactClosingIdentity({description:'Reserva RES-1700000000000-345 — Hab. 506 — DE LA CRUZ, JUAN PEDRO — Pago tarjeta_credito'},'Crédito')).toEqual({room:'506',description:'DE LA CRUZ'});
  expect(compactClosingIdentity({sourceLabel:'Reserva RS-001304 — Hab. 12A — Pérez, Juan — Pago efectivo'},'Efectivo')).toEqual({room:'12A',description:'Pérez'});
 });
 it('keeps unstructured names, meaningful concepts and corporate names intact',()=>{
  expect(compactClosingIdentity({description:'Check-out sin cargos — Hab. 901 — ANA DE LA CRUZ'},'Sin cargo')).toEqual({room:'901',description:'ANA DE LA CRUZ'});
  expect(compactClosingIdentity({description:'Reposición de caja para compra de materiales'},'Efectivo').description).toBe('Reposición de caja para compra de materiales');
  expect(compactClosingIdentity({description:'Reserva de salón — Hab. 401 — Equipamiento, luces'},'Efectivo').description).toBe('Reserva de salón — Hab. 401 — Equipamiento, luces');
  expect(compactClosingIdentity({description:'Recibo CC — EMPRESA, S.A. (Transferencia)'},'Transferencia').description).toBe('Recibo CC · EMPRESA, S.A.');
  expect(compactClosingIdentity({description:'Recibo CC — EMPRESA (Retención IVA)'},'Retención IVA').description).toBe('Recibo CC · EMPRESA');
  expect(compactClosingIdentity({description:'Saldo por estadía RES-1700000000001-743 — Hab. 401 (cierre con deuda)'},'Cuenta Corriente')).toEqual({room:'401',description:'Saldo por estadía (cierre con deuda)'});
 });
 it('prints informative and cancelled movements once, keeps reasons, signs expenses and preserves the supplied closing total',()=>{
  const html=buildCashClosingHtml({...base,movements:[movement,{...movement,description:'Retiro',kind:'expense',amount:10},{...movement,description:'Informativo único',kind:'informational',amount:500},{...movement,description:'Anulado único',amount:999,cancelled:true,cancelReason:'Duplicado'}]});
  const doc=new DOMParser().parseFromString(html,'text/html');
  expect(doc.querySelectorAll('table.movements tbody tr')).toHaveLength(4);
  expect(doc.querySelectorAll('.cancelled')).toHaveLength(1);expect(html.match(/Informativo único/g)).toHaveLength(1);
  expect(doc.querySelector('header .total strong')?.textContent).toContain('90,00');expect(doc.body.textContent).toContain('-$');expect(doc.body.textContent).toContain('Motivo: Duplicado');
  expect(doc.body.textContent).toContain('FB 0005-00000001');expect(html).toContain('display:table-header-group');
 });
 it('escapes all dynamic fields and prints missing cash counts explicitly rather than as zero',()=>{
  const html=buildCashClosingHtml({...base,openedBy:'<svg onload=alert(1)>',area:'<script>x</script>',systemCash:null,countedCash:null,movements:[{...movement,description:'<img src=x onerror=alert(1)>',document:'<script>x</script>',cancelled:true,cancelReason:'<b>motivo</b>'}]});
  const doc=new DOMParser().parseFromString(html,'text/html');expect(doc.querySelector('svg,img,b')).toBeNull();expect(doc.querySelectorAll('script')).toHaveLength(1);expect(doc.body.textContent).toContain('No informado');
 });
 it('uses the frozen snapshot value and exposes its source even if current detail differs',()=>{
  const html=buildCashClosingHtml({...base,total:50,count:1,snapshot:[{label:'Efectivo',total:50}],movements:[movement]});
  const doc=new DOMParser().parseFromString(html,'text/html');expect(doc.querySelector('header .total strong')?.textContent).toContain('50,00');expect(doc.body.textContent).toContain('Total y cantidad conservados al cerrar');expect(doc.body.textContent).toContain('100,00');
 });
});
