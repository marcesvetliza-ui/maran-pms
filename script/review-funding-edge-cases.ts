/** Review only. Uses the synthetic Unix-socket DB, never DATABASE_URL. */
import pg from 'pg';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createDemoService, demoActor, seedSyntheticScope } from '../demo/funding/backend';
import { reconcileVerifiedCreditNote } from '../server/billing/funding/creditNotes';
import { mountPaymentFunding } from '../server/billing/funding/integration';
const pool = new pg.Pool({host:'/tmp/folio-funding-isolated/socket',port:55439,user:'runner',password:'',database:'folio_funding_synthetic',ssl:false});
const {service,gateway} = createDemoService(pool);
async function proportionalCase(count:number,nc:number) {
  const id='review-rounding-'+randomUUID();const scope={kind:'reservation' as const,id};const each=10000000;
  await service.store.transaction(scope,null,async c=>{
    await c.query("INSERT INTO payment_funding.scopes(kind,id) VALUES('reservation',$1)",[id]);
    await c.query("INSERT INTO payment_funding.documents(id,scope_kind,scope_id,original_cents,total_cents,status,snapshot) VALUES($1,'reservation',$2,$3,$3,'issued','{}')",[id+':F',id,each*count]);
    for(let i=0;i<count;i++) {
      const rid=id+':P'+i;
      await c.query("INSERT INTO payment_funding.receipts(id,scope_kind,scope_id,source_payment_id,original_cents,effective_cents,method,cash_movement_id,folio_movement_id) VALUES($1,'reservation',$2,$1,$3,$3,'efectivo',$4,$5)",[rid,id,each,rid+':cash',rid+':folio']);
      await c.query("INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin) VALUES($1,$2,$3,$2,$4,$4,'applied','legacy_verified')",[randomUUID(),rid,id+':F',each]);
    }
  });
  try {
    await reconcileVerifiedCreditNote(service,scope,{creditNoteId:id+':NC',documentId:id+':F',amountCents:nc},demoActor);
    const rows=(await pool.query('SELECT SUM(free_cents)::text AS free FROM payment_funding.balances WHERE scope_id=$1',[id])).rows;
    console.log(JSON.stringify({case:'NC rounding',payments:count,creditNoteCents:nc,actualReleasedCents:Number(rows[0].free),expectedReleasedCents:nc}));
  }catch(e:any){console.log(JSON.stringify({case:'NC rounding',payments:count,creditNoteCents:nc,error:e.code,message:e.message,expected:'valid credit note reconciles exactly'}));}
}
async function legacyItemFence() {
  const scope=await seedSyntheticScope(service,'review-fence-'+randomUUID(),'spa',{partial:true});
  const request={scope,documentId:scope.id+':F1',applications:[{receiptId:'spa:'+scope.id+':S1',amountCents:500000}],newCollections:[{rowId:'remainder',method:'efectivo' as const,amountCents:9000000,shiftId:scope.id+':shift'}]};
  const preview=await service.preview(request,demoActor);
  await service.reserve(randomUUID(),preview.previewHash,request,demoActor);
  const app=express();app.use(express.json());
  mountPaymentFunding(app,{enabled:true,pool,fiscal:gateway,operationalSchema:'funding_demo',firstSpaClose:async()=>{},authenticate:(_q,_s,next)=>next(),actor:()=>demoActor});
  let writes=0;
  app.patch('/api/spa/account-items/:id',async(req,res)=>{writes++;await pool.query('UPDATE funding_demo.spa_account_items SET subtotal=subtotal+1 WHERE id=$1',[req.params.id]);res.json({legacy:true});});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  try {
    const res=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/spa/account-items/${scope.id}:item`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
    console.log(JSON.stringify({case:'legacy account-item fence',httpStatus:res.status,legacyWrites:writes,expectedStatus:409,scopeAdopted:true,fundsAlreadyReserved:true}));
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
try{await proportionalCase(3,10000);await proportionalCase(2,10001);await legacyItemFence();}finally{await pool.end();}
