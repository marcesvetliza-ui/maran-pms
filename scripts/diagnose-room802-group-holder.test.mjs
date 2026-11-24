import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseGroupHolder,receiptFacts} from './diagnose-room802-group-holder.mjs';
test('distinguishes valid current-account settlement from an invalid hypothetical release',()=>{
 const receipt={amount:'100.00',method:'cuenta_corriente',distributionDetail:{room:100,__unassigned__:0}};
 const current=receiptFacts(receipt,[{reservationId:'room',amount:'100.00',method:'cuenta_corriente'}]);assert.equal(current.requiresReview,false);
 const after=receiptFacts({...receipt,distributionDetail:{room:0,__unassigned__:100}},[]);assert.equal(after.requiresReview,true);assert.equal(after.reason,'NON_CASH_RETENTION_OR_INSTRUMENT_TOTAL');
});
test('reads only room/group snapshots, sanitizes output and logs out',async()=>{
 const requests=[];const row={id:'private-reservation',groupId:'private-group',status:'confirmed',checkInDate:'2026-11-23',checkOutDate:'2026-11-30',room:{roomNumber:'802'}};
 const payment={id:'private-payment',groupPaymentId:'private-receipt',reservationId:row.id,amount:'12345.00',method:'cuenta_corriente',status:'active'};
 const result=await diagnoseGroupHolder({password:'private-password',now:new Date('2026-11-24T12:00:00Z'),fetchImpl:async(url,init)=>{
  requests.push({url,method:init.method});if(url.endsWith('/login'))return {status:200,headers:{getSetCookie:()=>['sid=private-session']},json:async()=>({role:'admin'})};
  let body={};if(url.includes('/api/reservations?'))body=[row];else if(url.endsWith('/assignment-preview'))body={canReplace:false,groupAdvance:12345,personalAdvance:0,replacementBlockers:['La distribución o los medios de un recibo requieren conciliación. Cuenta Corriente y retenciones no se convierten en anticipos disponibles.']};else if(url.endsWith('/holder-correction'))body={canCorrect:false,blockers:['checkin']};else if(url.endsWith('/group-account'))body={reviewReceipts:[]};else if(url.endsWith('/payments'))body=[{id:'private-receipt',amount:'12345.00',method:'cuenta_corriente',distributionDetail:{[row.id]:12345,__unassigned__:0}}];else if(url.endsWith('/private-group'))body={name:'FICER',reservations:[{...row,payments:[payment]}]};
  return {status:200,json:async()=>body};
 }});
 assert.equal(result.reservations.length,1);assert.equal(result.reservations[0].receiptChecks[0].currentServerRequiresReview,false);assert.equal(result.reservations[0].receiptChecks[0].simulatedReleaseRequiresReview,true);
 for(const value of ['private-reservation','private-group','private-payment','private-receipt','private-password','private-session','12345'])assert.equal(JSON.stringify(result).includes(value),false);
 assert.equal(requests.filter(r=>r.method!=='GET').length,2);assert.equal(requests.at(-1).url,'https://maranpms.com.ar/api/auth/logout');assert.equal(requests.some(r=>new URL(r.url).pathname==='/api/rooms'),false);
});
