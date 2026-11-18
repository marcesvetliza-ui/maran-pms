import {sql} from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import {db} from '../db';
import {formatDisplayDate} from '@shared/date-display';
import {normalizeToSpanishPaymentMethod} from '../payment-method';

export interface ReservationCollectionReceipt {
  operationId:string; reservationId:string; payerName:string; guestName:string; roomNumber:string;
  checkInDate:string; checkOutDate:string; nights:number; date:string; total:number; received:number; retained:number;
  payments:Array<{id:string;method:string;amount:number;date:string}>;
}
const money=(value:number)=>`$${value.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const monetaryMethods=new Set(['efectivo','tarjeta_credito','tarjeta_debito','tarjeta','debito','transferencia','mercadopago','cheque','echeq','retencion_iibb','retencion_ganancias','retencion_iva']);
const labels:Record<string,string>={efectivo:'Efectivo',transferencia:'Transferencia',tarjeta_credito:'Tarjeta de crédito',tarjeta_debito:'Tarjeta de débito',tarjeta:'Tarjeta',debito:'Débito',mercadopago:'Mercado Pago',cheque:'Cheque',echeq:'eCheq',retencion_iibb:'Retención IIBB',retencion_ganancias:'Retención Ganancias',retencion_iva:'Retención IVA'};

/** A receipt proves the whole collection, independently of the document's
 * selected sources. A void document does not void still-active money. */
export function collectionReceiptFromRow(row:any):ReservationCollectionReceipt|null {
  const snapshot=row.request_snapshot;
  const expected=snapshot?.prefacturaRecovery?.payments;
  if(snapshot?.reservaId!==row.reservation_id || snapshot?.prefacturaRecovery?.version!==2 || !Array.isArray(expected) ||
     !expected.length || !expected.some((payment:any)=>payment.unlinkedAdvance===true) ||
     new Set(expected.map((payment:any)=>payment.paymentRequestId)).size!==expected.length) return null;
  const actual=new Map<string,any>((Array.isArray(row.payments)?row.payments:[]).map((payment:any)=>[payment.payment_request_id,payment]));
  const payments:ReservationCollectionReceipt['payments']=[];
  let total=0,retained=0;
  for(const planned of expected){
    const saved=actual.get(planned.paymentRequestId),amount=Number(saved?.amount),cents=Math.round(amount*100);
    const method=normalizeToSpanishPaymentMethod(saved?.method || '');
    if(String(planned.reservationId)!==String(row.reservation_id) || !saved || saved.status==='anulado' ||
       !Number.isSafeInteger(cents) || cents<=0 || Math.abs(amount*100-cents)>0.00001 || cents!==Math.round(Number(planned.amount)*100) ||
       !monetaryMethods.has(method))return null;
    total+=cents;if(method.startsWith('retencion_'))retained+=cents;
    payments.push({id:saved.id,method,amount:cents/100,date:saved.date});
  }
  return {operationId:row.operation_id,reservationId:row.reservation_id,payerName:snapshot.cliente?.razonSocial || row.guest_name,
    guestName:row.guest_name,roomNumber:row.room_number || '',checkInDate:row.check_in_date,checkOutDate:row.check_out_date,nights:Number(row.nights)||0,
    date:payments.map(payment=>payment.date).sort()[0],total:total/100,received:(total-retained)/100,retained:retained/100,payments};
}

/** One MVCC snapshot; GET never emits documents or records payments. */
export async function reservationCollectionReceipts(reservationId:string,operationId?:string) {
  const result=await db.execute(sql`
    SELECT o.operation_id,o.request_snapshot,r.id AS reservation_id,
      concat_ws(' ',g.last_name,g.first_name) AS guest_name,rm.room_number,
      r.check_in_date::text,r.check_out_date::text,r.nights,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'payment_request_id',p.payment_request_id,
          'amount',p.amount,'method',p.method,'date',p.date::text,'status',p.status) ORDER BY p.date,p.id)
        FROM payments p WHERE p.reservation_id=r.id AND p.payment_request_id IN (
          SELECT planned->>'paymentRequestId' FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(o.request_snapshot#>'{prefacturaRecovery,payments}')='array'
              THEN o.request_snapshot#>'{prefacturaRecovery,payments}' ELSE '[]'::jsonb END) planned)), '[]'::jsonb) payments
    FROM billing_operations o JOIN reservations r ON r.id=o.owner_id JOIN guests g ON g.id=r.guest_id
      LEFT JOIN rooms rm ON rm.id=r.room_id
    WHERE o.owner_type='reservation' AND o.owner_id=${reservationId}
      AND (${operationId || null}::text IS NULL OR o.operation_id=${operationId || null})
      AND o.request_snapshot#>'{prefacturaRecovery,payments}' @> '[{"unlinkedAdvance":true}]'::jsonb
    ORDER BY o.created_at DESC`);
  return (result.rows as any[]).flatMap(row=>{const receipt=collectionReceiptFromRow(row);return receipt?[receipt]:[];});
}

export async function generateReservationCollectionReceiptPdf(receipt:ReservationCollectionReceipt,hotelName:string):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:44});const chunks:Buffer[]=[];
    doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    const line=(text:string,bold=false)=>{if(doc.y>745)doc.addPage();doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(10).fillColor('#222').text(text,{width:505});};
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#174b65').text(hotelName || 'Maran Suites & Towers');
    doc.moveDown(.5).fontSize(16).text('RECIBO DE COBRO');
    doc.font('Helvetica').fontSize(8).fillColor('#555').text('COMPROBANTE NO FISCAL');doc.moveDown();
    line(`Referencia: RC-${receipt.operationId.replaceAll('-','').slice(0,12).toUpperCase()}`);
    line(`Fecha del cobro: ${formatDisplayDate(receipt.date)}`);
    line(`Recibimos de: ${receipt.payerName}`,true);
    line(`Huésped: ${receipt.guestName}`);
    line(`Habitación: ${receipt.roomNumber}`);
    line(`Estadía: ${formatDisplayDate(receipt.checkInDate)} al ${formatDisplayDate(receipt.checkOutDate)}`);
    if(receipt.nights>0)line(`Duración de la estadía: ${receipt.nights} noche${receipt.nights===1?'':'s'}`);
    doc.moveDown();line('Concepto: pago a cuenta de la estadía.');doc.moveDown();
    line('Detalle del cobro',true);
    const methods=new Map<string,number>();
    for(const payment of receipt.payments)methods.set(payment.method,(methods.get(payment.method)||0)+Math.round(payment.amount*100));
    for(const [method,cents] of methods)line(`${labels[method] || method}: ${money(cents/100)}`);
    doc.moveDown();doc.font('Helvetica-Bold').fontSize(18).fillColor('#174b65').text(`TOTAL DEL COBRO: ${money(receipt.total)}`);
    if(receipt.retained>0){doc.moveDown(.5);line(`Dinero recibido: ${money(receipt.received)}`);line(`Retenciones informadas: ${money(receipt.retained)}`);}
    doc.moveDown();doc.font('Helvetica').fontSize(9).fillColor('#555').text('Este recibo acredita los pagos registrados de esta operación. No reemplaza la factura. Importes expresados en pesos argentinos (ARS).');
    doc.end();
  });
}
