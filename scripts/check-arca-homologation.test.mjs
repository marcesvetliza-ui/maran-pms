import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkArcaHomologation} from './check-arca-homologation.mjs';
const good={ok:true,ambiente:'homologacion',pointOfSale:5,documentType:'FB',checks:{authentication:'ok',lastAuthorized:'ok',authorizedLookup:'ok',missingLookup:'ok'}};
function fixture(report=good,status=200){
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/login'))return Response.json({id:'ci-user',role:'admin'},{headers:{'Set-Cookie':'maran.sid=secret-cookie; Secure; HttpOnly'}});
    if(url.endsWith('/logout'))return Response.json({ok:true});
    return Response.json(report,{status});
  };return {calls,fetchImpl};
}
test('reuses the existing PMS access and only invokes login, the read-only probe and logout',async()=>{
  const f=fixture({...good,token:'server-secret'});
  const result=await checkArcaHomologation({password:'secret-password',...f});
  assert.equal(result.ok,true);assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.deepEqual(f.calls.map(x=>new URL(x.url).pathname),['/api/auth/login','/api/billing/homologation-check','/api/auth/logout']);
  assert(f.calls.every(x=>new URL(x.url).origin==='https://maranpms.com.ar'&&x.init.redirect==='manual'));
  assert.equal(f.calls[1].init.headers.Cookie,'maran.sid=secret-cookie');
});
test('missing secret never initiates a request',async()=>{
  const f=fixture();await assert.rejects(checkArcaHomologation({password:'',...f}),/SMOKE_TEST_PASSWORD/);assert.equal(f.calls.length,0);
});
test('rejects production or incomplete evidence and logs the session out',async()=>{
  for(const report of [{...good,ambiente:'produccion'},{...good,checks:{}},{...good,ok:false}]){
    const f=fixture(report);await assert.rejects(checkArcaHomologation({password:'secret-password',...f}),/INVALID_PROBE_RESULT/);
    assert(f.calls.at(-1).url.endsWith('/logout'));
  }
});
test('does not print raw API errors that could contain credentials',async()=>{
  const f=fixture({code:'HOMOLOGATION_LOOKUP_FAILED',error:'raw private-token'},503);
  await assert.rejects(checkArcaHomologation({password:'secret-password',...f}),error=>!error.message.includes('private-token')&&error.message.includes('HOMOLOGATION_LOOKUP_FAILED'));
});
