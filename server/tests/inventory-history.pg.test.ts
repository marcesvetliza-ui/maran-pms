import {it,expect,afterAll,beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,pool,withDatabaseTransaction} from '../db';
import {registerInventoryHistoryRoutes} from '../inventoryHistory';
let handler:any;
beforeAll(()=>{expect(['localhost','127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);registerInventoryHistoryRoutes({get:(_path:string,h:any)=>{handler=h;}} as any);});
afterAll(()=>pool.end());
async function read(date:string){let status=200,body:any;const res={status:(s:number)=>{status=s;return res;},json:(b:any)=>{body=b;return res;}};await handler({query:{date}},res);return {status,body};}
it('consulta una instantánea real de PostgreSQL y reconstruye depósito y global sin alterar stock',async()=>{
 const rollback=new Error('rollback');await expect(withDatabaseTransaction(async()=>{
 const item=randomUUID(),warehouse=randomUUID(),unknown=randomUUID();
 await db.execute(sql`INSERT INTO inventory_warehouses(id,name) VALUES(${warehouse},'Histórico prueba')`);
 await db.execute(sql`INSERT INTO inventory_items(id,name,unit,item_kind,current_stock) VALUES(${item},'Histórico','kg','materia_prima',15),(${unknown},'Sin historial','kg','materia_prima',5)`);
 await db.execute(sql`INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES(${item},${warehouse},15)`);
 await db.execute(sql`INSERT INTO stock_movements(item_id,warehouse_id,movement_type,quantity,previous_stock,new_stock,created_at) VALUES(${item},${warehouse},'entrada',10,0,10,'2026-10-05 12:00:00'),(${item},${warehouse},'entrada',5,10,15,'2026-10-06 04:00:00')`);
 const response=await read('2026-10-05');expect(response.status).toBe(200);expect(response.body.items.find((r:any)=>r.itemId===item).stock).toBe(10);expect(response.body.locations.find((r:any)=>r.itemId===item).stock).toBe(10);expect(response.body.items.find((r:any)=>r.itemId===unknown).stock).toBeNull();
 expect(Number((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${item}`)).rows[0].current_stock)).toBe(15);throw rollback;
 })).rejects.toBe(rollback);
});
it('rechaza fechas imposibles y futuras',async()=>{expect((await read('2026-02-30')).status).toBe(400);expect((await read('2026-13-01')).status).toBe(400);expect((await read('2099-01-01')).status).toBe(400);});
