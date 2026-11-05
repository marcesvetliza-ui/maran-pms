import { expect, it } from 'vitest';
import {giftVoucherExpiryError,giftVoucherItemsExpiryError} from './gift-voucher-expiry';
it.each([undefined,null,'','2028-02-29','2027-12-31'])('acepta fecha opcional o válida: %s',value=>expect(giftVoucherExpiryError(value)).toBeNull());
it.each(['2027-02-29','2027-02-30','2027-13-01','31/12/2027','2027-01-01T00:00:00Z','0000-01-01',123])('rechaza fecha imposible o no calendario: %s',value=>expect(giftVoucherExpiryError(value)).toBeTruthy());
it('no admite una validez sin tratamiento y beneficiario',()=>{
 expect(giftVoucherItemsExpiryError([{giftExpiresAt:'2027-12-31'}])).toBeTruthy();
 expect(giftVoucherItemsExpiryError([{spaTreatmentId:'test',giftBeneficiaryName:'Prueba',giftExpiresAt:'2027-12-31'}])).toBeNull();
});
