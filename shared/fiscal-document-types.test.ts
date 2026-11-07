import {it,expect} from 'vitest';
import {creditTypeForInvoice,requireFiscalInvoiceForCredit,fiscalDocumentCode} from './fiscal-document-types';
it.each([['FA','NCA',1],['FB','NCB',6],['FC','NCC',11],['FT','NCT',195],['FM','NCM',201],['FMB','NCMB',206]])('preserves the fiscal invoice/credit mapping for %s',(invoice,note,code)=>{
 expect(creditTypeForInvoice(invoice)).toBe(note);expect(requireFiscalInvoiceForCredit(invoice)).toBe(note);expect(fiscalDocumentCode(String(invoice))).toBe(code);
});
it.each(['cierre_habitacion','cierre_spa','cierre_spa_agustin','cierre_spa_cortesia','ticket','voucher_justo','voucher_pedidos_ya','voucher_room_service','voucher_consumo_interno','unknown','toString'])('never defaults %s to a fiscal invoice or credit',type=>{
 expect(creditTypeForInvoice(type)).toBeUndefined();expect(()=>requireFiscalInvoiceForCredit(type)).toThrow(/factura fiscal original/);expect(()=>fiscalDocumentCode(type)).toThrow(/Tipo de comprobante fiscal/);
});
it('allows a fiscal credit as an associated document for its legitimate debit reversal',()=>{
 expect(fiscalDocumentCode('NCB')).toBe(8);expect(creditTypeForInvoice('NCB')).toBeUndefined();
});
