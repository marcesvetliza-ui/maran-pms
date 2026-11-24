import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseHolder} from './diagnose-room1001-holder.mjs';
test('reads only the selected room and group preview, never leaks identity or money and logs out',async()=>{
 const requests=[];const row={id:'private-reservation',groupId:'private-group',status:'checked_in',checkInDate:'2026-11-23',checkOutDate:'2026-11-25',room:{roomNumber:'1001'},guest:{id:'private-guest',codigo:'NORMAL',firstName:'private-name',lastName:'private-last',documentNumber:'private-document',email:'private@hotel.invalid',active:true}};
 const report=await diagnoseHolder({password:'private-password',now:new Date('2026-11-24T12:00:00Z'),verifyCorrection:true,fetchImpl:async(url,init)=>{
  requests.push({url,method:init.method});
  if(url.endsWith('/login'))return {status:200,headers:{getSetCookie:()=>['sid=private-session']},json:async()=>({role:'admin'})};
  const body=url.includes('/holder-correction')?{reservationId:row.id,guest:row.guest,canCorrect:true,blockers:[],groupLinked:true,companionCount:0}:url.includes('/assignment-preview')?{canReplace:false,replacementBlockers:['Solo se pueden liberar o reemplazar pasajeros antes del check-in.'],personalAdvance:12345,groupAdvance:56789}:url.includes('/api/reservations?')?[row,{...row,room:{roomNumber:'1002'}}]:{};
  return {status:200,json:async()=>body};
 }});
 assert.equal(report.reservations.length,1);assert.equal(report.reservations[0].holderCorrection.guestMatches,true);assert.deepEqual(report.reservations[0].groupPreview.blockers,['STAY_ALREADY_STARTED_OR_CLOSED']);
 for(const value of ['private-reservation','private-group','private-guest','private-name','private-last','private-document','private@hotel.invalid','private-password','private-session','12345','56789'])assert.equal(JSON.stringify(report).includes(value),false);
 assert.equal(requests.filter(r=>r.method!=='GET').length,2);assert.equal(requests.at(-1).url,'https://maranpms.com.ar/api/auth/logout');
 assert.equal(requests.some(r=>new URL(r.url).pathname==='/api/rooms'),false);
});
test('does not read data if authentication fails',async()=>{
 const requests=[];await assert.rejects(diagnoseHolder({password:'private',fetchImpl:async(url)=>{requests.push(url);return {status:401};}}));assert.equal(requests.length,1);
});
