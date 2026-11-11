import {describe,it,expect,vi} from 'vitest';
vi.mock('../billing/creditNoteAccountMovement',()=>({originalAccountChargeLinked:{}}));
vi.mock('../db',()=>({db:{},pool:{}}));
import {closedCorrectionProof} from '../billing/closedReservationCorrection';
const reservation={id:'r',status:'checked_out'};
const original=()=>({id:1,reserva_id:'r',tipo_comprobante:'FB',estado:'emitida',numero:1,monto_total:'121',monto_acreditado:'0',source_charge_ids:['accommodation'],source_charge_amounts:{accommodation:121},items:[{descripcion:'Estadía',alicuotaIva:'21'}]});
const note=()=>({id:2,reserva_id:'r',tipo_comprobante:'NCB',nota_credito_id:1,estado:'emitida',reconciliation_status:'conciliada',monto_total:'121',source_charge_amounts:{accommodation:121}});
describe('closed reservation invoice correction proof',()=>{
 it('starts with a full credit without changing operational fields',()=>{const o=original();expect(closedCorrectionProof(reservation,o,[o]).stage).toBe('credit');expect(o.monto_acreditado).toBe('0');});
 it('requires a fully authorized and reconciled NC before reissuing',()=>{const o={...original(),estado:'anulada',monto_acreditado:'121'};expect(closedCorrectionProof(reservation,o,[o,note()]).stage).toBe('reissue');expect(()=>closedCorrectionProof(reservation,o,[o,{...note(),reconciliation_status:'pendiente'}])).toThrow();});
 it.each([{monto_acreditado:'20',estado:'parcial'},{source_charge_amounts:null},{group_id:'g'},{reserva_id:'other'},{cash_forma_pago:'cuenta_corriente'},{tipo_comprobante:'FT'},{items:[{descripcion:'Sin IVA'}]},{source_charge_amounts:{accommodation:121.01}}])('blocks an unsafe historical correction %o',change=>{const o={...original(),...change};expect(()=>closedCorrectionProof(reservation,o,[o])).toThrow();});
 it('resumes the existing pending NC rather than creating another one',()=>{const o=original();expect(closedCorrectionProof(reservation,o,[o,{...note(),estado:'autorizacion_pendiente',reconciliation_status:'pendiente'}]).stage).toBe('pending_credit');});
 it('keeps a replaced original consumed even if its replacement is credited later',()=>{const o={...original(),estado:'anulada',monto_acreditado:'121'},replacement={id:3,estado:'anulada',credit_reapplication_intent:{correctionOriginalInvoiceId:1}};expect(closedCorrectionProof(reservation,o,[o,note(),replacement]).stage).toBe('completed');});
 it('rejects a mismatched NC source allocation',()=>{const o={...original(),estado:'anulada',monto_acreditado:'121'};expect(()=>closedCorrectionProof(reservation,o,[o,{...note(),source_charge_amounts:{other:121}}])).toThrow();});
 it('rejects an open stay',()=>{const o=original();expect(()=>closedCorrectionProof({...reservation,status:'confirmed'},o,[o])).toThrow();});
 it('blocks a source which no longer has its original folio capacity before crediting',()=>{const o=original();expect(()=>closedCorrectionProof({...reservation,correctionSourceCapacities:{accommodation:100}},o,[o])).toThrow(/conceptos originales/);});
 it('does not offer to resume an unrelated partial pending NC',()=>{const o=original();expect(()=>closedCorrectionProof(reservation,o,[o,{...note(),estado:'autorizacion_pendiente',reconciliation_status:'pendiente',monto_total:'20'}])).toThrow();});

});
