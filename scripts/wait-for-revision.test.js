import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForRevision } from './wait-for-revision.js';
const expected = 'a'.repeat(40), old = 'b'.repeat(40);
const health = changes => ({ status: 'ok', database: 'ok', revision: expected, financialReady: true, ...changes });
const response = body => ({ok:true,status:200,json:async()=>body});
function options(fetcher, overrides={}) {let time=0;return {fetcher,now:()=>time,pause:async ms=>{time+=ms;},report:()=>{},...overrides};}
test('waits past the former seven-minute window for the exact deployed revision',async()=>{
 let calls=0;
 const result=await waitForRevision('https://example.test',expected,options(async()=>response(health({revision:++calls<50?old:expected}))));
 assert.equal(calls,50);assert.equal(result.revision,expected);
});
test('never accepts another revision and reports the last observed revision',async()=>{
 await assert.rejects(waitForRevision('https://example.test',expected,options(async()=>response(health({revision:old})),{attempts:2})),new RegExp(`revisión=${old}`));
});
for(const change of [{database:'error'},{financialReady:false},{status:'error'}])test(`rejects unhealthy exact revision ${JSON.stringify(change)}`,async()=>{
 await assert.rejects(waitForRevision('https://example.test',expected,options(async()=>response(health(change)),{attempts:1})),/No se ejecutan pruebas/);
});
test('enforces the wall-clock budget even when requests themselves take time',async()=>{
 let time=0,calls=0;
 await assert.rejects(waitForRevision('https://example.test',expected,{fetcher:async()=>{calls++;time+=8000;throw new TypeError('network');},now:()=>time,pause:async ms=>{time+=ms;},report:()=>{},maxWaitMs:15000}),/TypeError/);
 assert.equal(calls,1);assert.equal(time,15000);
});
test('rejects an HTTP failure even if its JSON advertises a healthy revision',async()=>{
 await assert.rejects(waitForRevision('https://example.test',expected,options(async()=>({...response(health()),ok:false,status:503}),{attempts:1})),/HTTP 503/);
});
test('requires a complete Git revision before making requests',async()=>{
 await assert.rejects(waitForRevision('https://example.test','abc',options(()=>{throw Error('must not fetch');})),/completa/);
});
