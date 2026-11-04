import {describe,it,expect} from 'vitest';
import {canReviewCreditNoteAccount,isCashOnlySettlement} from './credit-note-account-recovery';
describe('NC Account recovery availability',()=>{
 it.each(['tarjeta_credito','tarjeta_debito','credit_card','efectivo'])('does not offer CC for cash receipt %s',method=>{
   expect(canReviewCreditNoteAccount({original_cash_forma_pago:method})).toBe(false);
   expect(isCashOnlySettlement({cash_forma_pago:method})).toBe(true);
 });
 it('retains mixed CC, atomic account settlements and independently linked cargos',()=>{
  expect(canReviewCreditNoteAccount({original_cash_forma_pago_detalle:[{method:'tarjeta_debito'},{method:'cuenta_corriente'}]})).toBe(true);
  expect(canReviewCreditNoteAccount({original_credit_reapplication_intent:{settlement:{destination:'cuenta_corriente'}}})).toBe(true);
  expect(canReviewCreditNoteAccount({original_account_charge_linked:true})).toBe(true);
  expect(isCashOnlySettlement({cash_forma_pago:'tarjeta_credito',cash_forma_pago_detalle:[{method:'cuenta_corriente'}]})).toBe(false);
 });
 it('does not describe unknown legacy data as a verified cash-only payment',()=>{
   expect(isCashOnlySettlement({})).toBe(false);
 });
});
