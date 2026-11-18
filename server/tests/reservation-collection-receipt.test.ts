import {inflateSync} from 'node:zlib';
import {describe,expect,it,vi} from 'vitest';
vi.mock('../db',()=>({db:{execute:vi.fn()}}));
import {collectionReceiptFromRow,generateReservationCollectionReceiptPdf} from '../billing/reservationCollectionReceipt';
const row=()=>({operation_id:'36c1c9b0-e7da-4dc4-92e2-878e74cbe25b',reservation_id:'506',guest_name:'González Daniel',room_number:'506',nights:2,check_in_date:'2026-11-18',check_out_date:'2026-11-20',
 request_snapshot:{reservaId:'506',cliente:{razonSocial:'Daniel González'},items:[{descripcion:'Una noche',subtotal:235800}],prefacturaRecovery:{version:2,payments:[{reservationId:'506',paymentRequestId:'first',amount:'235800.00'},{reservationId:'506',paymentRequestId:'advance',amount:'235800.00',unlinkedAdvance:true}]}},
 payments:[{id:'p1',payment_request_id:'first',amount:'235800.00',method:'efectivo',date:'2026-11-18',status:'active'},{id:'p2',payment_request_id:'advance',amount:'235800.00',method:'efectivo',date:'2026-11-18',status:'active'}]});
const text=(pdf:Buffer)=>[...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match=>{
 try{return [...inflateSync(Buffer.from(match[1],'latin1')).toString('latin1').matchAll(/\[([\s\S]*?)\]\s*TJ/g)].map(op=>[...op[1].matchAll(/<([0-9a-f]+)>/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(''));}catch{return[];}
}).join('\n');
describe('Recibo del cobro completo, independiente de la selección del comprobante',()=>{
 it('suma ambos pagos y muestra una sola línea de efectivo por $471.600',async()=>{
  const data=row(),before=structuredClone(data);const receipt=collectionReceiptFromRow(data)!;
  expect(receipt.total).toBe(471600);expect(data).toEqual(before);
  const pdf=text(await generateReservationCollectionReceiptPdf(receipt,'Maran Suites & Towers'));
  expect(pdf).toContain('RECIBO DE COBRO');expect(pdf).toContain('TOTAL DEL COBRO: $471.600,00');expect(pdf).toContain('Efectivo: $471.600,00');expect(pdf).not.toContain('Una noche');expect(pdf).toContain('18/11/2026 al 20/11/2026');expect(pdf).toContain('2 noches');
 });
 it.each(['missing','void','changed_amount','other_reservation'])('no acredita dinero no recibido o que ya fue anulado: %s',kind=>{
  const data=row();if(kind==='missing')data.payments.pop();if(kind==='void')data.payments[1].status='anulado';if(kind==='changed_amount')data.payments[1].amount='1.00';if(kind==='other_reservation')data.request_snapshot.reservaId='other';
  expect(collectionReceiptFromRow(data)).toBeNull();
 });
 it('admite la corrección autorizada del medio y muestra el medio efectivamente guardado',()=>{
  const data=row();data.payments[1].method='transferencia';expect(collectionReceiptFromRow(data)?.payments[1].method).toBe('transferencia');
 });
 it('separa las retenciones del dinero recibido',()=>{
  const data=row();data.payments[1].method='retencion_iibb';expect(collectionReceiptFromRow(data)).toMatchObject({total:471600,received:235800,retained:235800});
 });
 it('no confunde otro intento de cobro con éste',()=>{
  const data=row();data.payments[1].payment_request_id='unrelated';expect(collectionReceiptFromRow(data)).toBeNull();
 });
});
