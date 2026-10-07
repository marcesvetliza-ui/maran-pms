import {sql} from 'drizzle-orm';
import {db} from './db';
import type {Express} from 'express';
type Movement={id:string;itemId:string;warehouseId:string|null;toWarehouseId:string|null;movementType:string;quantity:string;previousStock:string;newStock:string;createdAt:string};
export function historicalWarehouseStock(current:number,movements:Movement[],warehouseId:string,cutoff:number):number|null{
 const events=movements.flatMap<{at:number;delta:number;anchor:number|null}>(m=>{
  const at=new Date(m.createdAt.endsWith('Z')||/[+-]\d\d:\d\d$/.test(m.createdAt)?m.createdAt:m.createdAt+'Z').getTime();
  if(m.warehouseId===warehouseId)return [{at,delta:Number(m.newStock)-Number(m.previousStock),anchor:Number(m.newStock)}];
  if(m.movementType==='transferencia'&&m.toWarehouseId===warehouseId)return [{at,delta:Number(m.quantity),anchor:null}];
  return [];
 });
 // An observed balance at or before the cut must reconcile with today's balance.
 // Ambiguous simultaneous anchors and untracked opening stock remain unknown.
 const counts=new Map<number,number>();for(const e of events)counts.set(e.at,(counts.get(e.at)||0)+1);
 const anchor=events.filter(e=>e.at<cutoff&&e.anchor!==null&&counts.get(e.at)===1).sort((a,b)=>b.at-a.at)[0];
 if(!anchor||Math.abs(anchor.anchor!+events.filter(e=>e.at>anchor.at).reduce((n,e)=>n+e.delta,0)-current)>.0005)return null;
 const stock=current-events.filter(e=>e.at>=cutoff).reduce((n,e)=>n+e.delta,0);
 return stock<-.0005?null:Math.round(stock*1000)/1000;
}
export function registerInventoryHistoryRoutes(app:Express){
 app.get('/api/inventory/stock-at-date',async(req,res)=>{try{
 const date=String(req.query.date||'');const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Cordoba',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||(!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)||date>today)return res.status(400).json({error:'Elegí una fecha válida, hasta hoy'});
 const cutoff=Date.parse(date+'T00:00:00-03:00')+86400000;
 // One statement provides a consistent snapshot of balances and movement history.
 const r=await db.execute(sql`SELECT json_build_object('items',(SELECT COALESCE(json_agg(json_build_object('id',id,'stock',current_stock)), '[]'::json) FROM inventory_items WHERE item_kind<>'plato'),'balances',(SELECT COALESCE(json_agg(json_build_object('itemId',item_id,'warehouseId',warehouse_id,'stock',current_stock)), '[]'::json) FROM warehouse_stock),'movements',(SELECT COALESCE(json_agg(json_build_object('id',id,'itemId',item_id,'warehouseId',warehouse_id,'toWarehouseId',to_warehouse_id,'movementType',movement_type,'quantity',quantity,'previousStock',previous_stock,'newStock',new_stock,'createdAt',to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))), '[]'::json) FROM stock_movements)) AS snapshot`);
 const snapshot=r.rows[0].snapshot as any;const movements=snapshot.movements as Movement[];
 const byItem=new Map<string,Movement[]>();for(const m of movements){const list=byItem.get(m.itemId)||[];list.push(m);byItem.set(m.itemId,list);}
 const locations=snapshot.balances.map((b:any)=>({...b,stock:historicalWarehouseStock(Number(b.stock),byItem.get(b.itemId)||[],b.warehouseId,cutoff)}));
 const items=snapshot.items.map((i:any)=>{const pairs=locations.filter((b:any)=>b.itemId===i.id);const current=snapshot.balances.filter((b:any)=>b.itemId===i.id).reduce((n:number,b:any)=>n+Number(b.stock),0);return {itemId:i.id,stock:!pairs.length||pairs.some((p:any)=>p.stock===null)||Math.abs(current-Number(i.stock))>.0005||(byItem.get(i.id)||[]).some(m=>!m.warehouseId)?null:pairs.reduce((n:number,p:any)=>n+p.stock,0)};});
 res.json({date,items,locations});
 }catch{res.status(500).json({error:'No se pudo reconstruir el stock histórico'});}});
}
