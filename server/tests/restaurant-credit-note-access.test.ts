import express from 'express';
import {createServer,type Server} from 'node:http';
import {afterEach,expect,it,vi} from 'vitest';
import {PgDialect} from 'drizzle-orm/pg-core';
const state=vi.hoisted(()=>({grants:new Set<string>(),rows:[] as unknown[],queries:[] as unknown[]}));
vi.mock('../permissions',()=>({hasPermission:(_role:string,key:string)=>state.grants.has(key)}));
vi.mock('../db',()=>({db:{execute:vi.fn(async(query:unknown)=>{state.queries.push(query);return {rows:state.rows};})}}));
import {db} from '../db';
import {requireCreditNoteAccess,RESTAURANT_CREDIT_NOTE_PERMISSION} from '../billing/restaurantCreditNoteAccess';
let server:Server|undefined;
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;state.grants.clear();state.rows=[];state.queries=[];});
async function request(){
 const app=express();app.use((req,_res,next)=>{req.user={role:'restaurant'} as any;next();});
 app.post('/invoices/:id/nota-credito',requireCreditNoteAccess,(_req,res)=>res.json({authorized:true}));
 server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
 return fetch(`http://127.0.0.1:${(server.address() as any).port}/invoices/123/nota-credito`,{method:'POST'});
}
it('keeps general finance access without an origin lookup',async()=>{
 state.grants.add('api:billing:nc-reconciliation');expect((await request()).status).toBe(200);expect(state.queries).toHaveLength(0);
});
it('allows the scoped restaurant grant only after a matching persisted origin lookup',async()=>{
 state.grants.add(RESTAURANT_CREDIT_NOTE_PERMISSION);state.rows=[{id:123}];expect((await request()).status).toBe(200);
 const query=new PgDialect().sqlToQuery(state.queries[0] as any);
 expect(query.params).toEqual([123]);
 expect(query.sql).toContain('JOIN restaurant_orders ro ON ro.id=si.restaurant_order_id');
 for(const guard of ['si.reserva_id IS NULL','si.group_id IS NULL','si.spa_account_id IS NULL',"si.center_settlement_area='restaurant'"])expect(query.sql).toContain(guard);
});
it('rejects invoices outside the scoped lookup and never enters the fiscal handler',async()=>{
 state.grants.add(RESTAURANT_CREDIT_NOTE_PERMISSION);expect((await request()).status).toBe(403);
});
it('does not grant fiscal access from the restaurant sidebar alone',async()=>{
 state.grants.add('sidebar:/restaurant');expect((await request()).status).toBe(403);expect(state.queries).toHaveLength(0);
});

it('fails closed if origin verification is unavailable',async()=>{
 state.grants.add(RESTAURANT_CREDIT_NOTE_PERMISSION);
 vi.mocked(db.execute).mockRejectedValueOnce(Error('synthetic database failure'));
 expect((await request()).status).toBe(503);
});
