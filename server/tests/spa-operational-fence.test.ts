import {expect,it} from 'vitest';
import {isSpaOperationalRequest} from '../billing/funding/legacyFence';
it('allows only operational status/notes and the separately validated planning move',()=>{
 for(const status of ['confirmed','in_progress','completed'])expect(isSpaOperationalRequest({method:'PATCH',path:'/spa/appointments/a',body:{status}})).toBe(true);
 expect(isSpaOperationalRequest({method:'PATCH',path:'/spa/appointments/a',body:{notes:'Sin perfume'}})).toBe(true);
 expect(isSpaOperationalRequest({method:'POST',path:'/spa/appointments/a/move',body:{}})).toBe(true);
});
it('keeps money, room identity, cancellation and arbitrary appointment edits behind the financial fence',()=>{
 for(const body of [{status:'cancelled'},{status:'no_show'},{status:'in_progress',reservationId:'r'},{status:'completed',payment:1},{treatmentId:'t'},{guestId:'g'},null,[]])
  expect(isSpaOperationalRequest({method:'PATCH',path:'/spa/appointments/a',body})).toBe(false);
 expect(isSpaOperationalRequest({method:'POST',path:'/spa/accounts/a/close',body:{}})).toBe(false);
});
