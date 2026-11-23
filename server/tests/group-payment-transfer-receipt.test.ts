import { describe, it, expect, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { generateGroupPaymentReceiptPdf } from '../groupPaymentReceiptPdf';
describe('Comprobante del traspaso de un anticipo ya cobrado',()=>{
 it('presenta el anticipo existente sin mostrar otro cobro de dinero',async()=>{
  const text=vi.spyOn(PDFDocument.prototype,'text');
  try {
   const buffer=await generateGroupPaymentReceiptPdf({receiptNumber:1,legacyId:'source',group:{name:'Synthetic group'},payment:{amount:40,date:'2027-01-01',method:'transferencia',notes:'Traspaso de anticipo personal. Sin nuevo cobro.',settlementBreakdown:{documentTotal:40,appliedAdvances:40,newCollection:0}},roomDistribution:[]});
   expect(buffer.subarray(0,4).toString()).toBe('%PDF');
   const lines=text.mock.calls.map(([line])=>line);expect(lines).toContain('Cobro nuevo: $0,00');expect(lines).toContain('Anticipos aplicados: $40,00');expect(lines).not.toContain('Cobro nuevo: $40,00');
  } finally { text.mockRestore(); }
 });
});
