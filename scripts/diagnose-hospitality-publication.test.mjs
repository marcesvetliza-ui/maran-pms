import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyHospitality} from './diagnose-hospitality-publication.mjs';
const revision='a'.repeat(40);
test('consulta las tres áreas sin escribir operaciones ni divulgar fichas o credenciales',async()=>{
 const requests=[];
 const report=await verifyHospitality({password:'private-password',expectedRevision:revision,fetchImpl:async(url,init)=>{
  requests.push({url,method:init.method});
  if(url.endsWith('/api/health'))return {status:200,json:async()=>({revision,status:'ok',database:'ok',financialReady:true})};
  if(url.endsWith('/login'))return {status:200,headers:{getSetCookie:()=>['sid=private-session']},json:async()=>({role:'admin',username:'private-name'})};
  if(url.endsWith('/logout'))return {status:200};
  if(url.endsWith('/api/charge-types/all'))return {status:200,json:async()=>[{label:'private-charge',defaultAmount:'private-price',hospitalityRules:[]}]};
  assert.equal(init.method,'GET');assert.equal(new URL(url).pathname,'/api/hospitality/included-services');
  return {status:200,json:async()=>({items:[{id:'private-id',person:'private-person',conditions:'private-condition',room:'PRIVATE-ROOM'}],areas:['restaurant','spa','reception'],pendingToday:1,canCoordinate:true,page:1})};
 }});
 assert.equal(report.authenticatedInboxChecks.length,6);assert.equal(report.operationalWrites,0);
 const output=JSON.stringify(report);for(const value of ['private-password','private-session','private-name','private-id','private-person','private-condition','PRIVATE-ROOM','private-charge','private-price'])assert.equal(output.includes(value),false);
 assert.deepEqual(requests.filter(r=>r.method!=='GET').map(r=>new URL(r.url).pathname),['/api/auth/login','/api/auth/logout']);
});
test('rechaza versiones incorrectas antes de autenticar y cierra su sesión si falla la consulta',async()=>{
 let authCalls=0,logoutCalls=0;
 await assert.rejects(verifyHospitality({password:'test',expectedRevision:revision,fetchImpl:async()=>({status:200,json:async()=>({revision:'b'.repeat(40)})})}));
 await assert.rejects(verifyHospitality({password:'test',expectedRevision:revision,fetchImpl:async(url)=>{
  if(url.endsWith('/api/health'))return {status:200,json:async()=>({revision,status:'ok',database:'ok',financialReady:true})};
  if(url.endsWith('/login')){authCalls++;return {status:200,headers:{getSetCookie:()=>['sid=test']},json:async()=>({role:'admin'})};}
  if(url.endsWith('/logout')){logoutCalls++;return {status:200};}return {status:500};
 }}));assert.equal(authCalls,1);assert.equal(logoutCalls,1);
});
