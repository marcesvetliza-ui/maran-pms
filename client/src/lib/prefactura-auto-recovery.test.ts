import { describe, expect, it } from 'vitest';
import { automaticPrefacturaAction } from './prefactura-auto-recovery';
const attempt = { invoiceRequest: { reservaId:'9001',creditOperationId:'operation-9001',prefacturaRecovery:{version:2} },
  invoice:null,payments:[{reservationId:'9001',paymentRequestId:'payment-9001',amount:'12100',method:'transferencia'}],checkoutRequested:true };
const status = { operationId:'operation-9001',stage:'prepared',attempt };
describe('automatic recovery requires a verified original room and operation',()=>{
  it.each(['prepared','numbered','submitting','uncertain','authorized'])('resumes the same idempotent request at stage %s',stage=>{
    expect(automaticPrefacturaAction('9001','operation-9001',{...status,stage})).toBe('resume');
  });
  it.each([
    undefined, {...status,operationId:'other'}, {...status,stage:'legacy_unknown'}, {...status,stage:'rejected'},
    {...status,stage:'cancelled'}, {...status,paymentConflicts:['payment-9001']}, {...status,departureReopened:true},
    {...status,attempt:{...attempt,invoiceRequest:{...attempt.invoiceRequest,reservaId:'9002'}}},
    {...status,attempt:{...attempt,payments:[{reservationId:'9002',paymentRequestId:'wrong'}]}},
    {...status,attempt:{...attempt,invoiceRequest:{...attempt.invoiceRequest,prefacturaRecovery:{version:1}}}},
  ])('does not automatically write on unknown or contradictory evidence: %j',value=>{
    expect(automaticPrefacturaAction('9001','operation-9001',value)).toBeNull();
  });
  it('distinguishes a guarded unsent correction from a same-number recovery',()=>{
    expect(automaticPrefacturaAction('9001','operation-9001',{...status,stage:'blocked',safeToCorrect:true,attempt:{...attempt,payments:[]}})).toBe('correct');
    expect(automaticPrefacturaAction('9001','operation-9001',{...status,stage:'blocked',safeToCorrect:true})).toBeNull();
    expect(automaticPrefacturaAction('9001','operation-9001',{...status,stage:'blocked',safeToCorrect:true,canRetryNumberConflict:true})).toBe('resume');
  });
});
