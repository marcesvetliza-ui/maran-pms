import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseInHouse} from './diagnose-inhouse-rooms.mjs';
test('uses only bounded read endpoints, sanitizes output and closes its own session',async()=>{
 const requests=[];
 const privateData={firstName:'private-guest-name',documentNumber:'private-document',notes:'private-notes',folioBalance:99999};
 const fetchImpl=async(url,init)=>{
  requests.push({url,method:init.method});
  const path=new URL(url).pathname;
  if(path==='/api/auth/login')return {status:200,headers:{getSetCookie:()=>['sid=private-session; HttpOnly']},json:async()=>({role:'admin'})};
  const row={...privateData,id:'private-id',reservationId:'private-id',roomNumber:'901',reservationStatus:'checked_in',status:'checked_in',checkIn:'2026-11-23',checkOut:'2026-11-24',checkInDate:'2026-11-23',checkOutDate:'2026-11-24',numberOfGuests:1,companionsCount:1,room:{roomNumber:'901',isVirtual:false,status:'occupied'}};
  const data=path==='/api/dashboard/stats'?{inHouseGuests:0}:path==='/api/dashboard/inhouse'?[]:path==='/api/rooms/in-house'?[row]:path==='/api/reservations'?[row]:{};
  return {status:200,json:async()=>data};
 };
 const report=await diagnoseInHouse({password:'private-password',fetchImpl,now:new Date('2026-11-24T12:00:00Z')});
 assert.equal(report.rooms[0].reservations[0].listed,false);
 assert.equal(report.checkedInPeopleRows,2);
 assert.equal(report.verification.currentCheckedInsIncluded,false);
 for(const secret of [...Object.values(privateData),'private-id','private-session','private-password'])assert.equal(JSON.stringify(report).includes(String(secret)),false);
 assert.equal(requests.at(-1).url,'https://maranpms.com.ar/api/auth/logout');
 assert.equal(requests.filter(r=>r.method!=='GET').length,2);
 assert.equal(requests.some(r=>r.url==='https://maranpms.com.ar/api/rooms'),false);
});
test('does not read hotel data without authenticating',async()=>{
 const paths=[];
 await assert.rejects(diagnoseInHouse({password:'private-password',fetchImpl:async(url)=>{paths.push(url);return {status:401};}}),/autenticar/);
 assert.deepEqual(paths,['https://maranpms.com.ar/api/auth/login']);
});
