import express from 'express';
import type {Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';

vi.mock('../auth',()=>({requireAuth:(req:any,res:any,next:()=>void)=>{if(!req.headers['x-test-user'])return res.status(401).json({error:'No autenticado'});req.user={role:'admin',id:'restaurant-search-test'};next();},requireRole:()=> (_req:any,_res:any,next:()=>void)=>next(),requirePermission:()=> (_req:any,_res:any,next:()=>void)=>next()}));
const url=process.env.DATABASE_URL;
const enabled=!!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS==='true';
if(enabled && (!['localhost','127.0.0.1'].includes(new URL(url!).hostname)||!/test/i.test(new URL(url!).pathname)))throw Error('Disposable local test database required');
const pool=enabled?new pg.Pool({connectionString:url}):null;
const prefix='restaurant-search-'+randomUUID();
const sharedPoint=7000000+Math.floor(Math.random()*100000),restaurantPoint=sharedPoint+100001;
const ids:Record<string,number>={};const configIds:number[]=[];let server:Server,base:string;
async function invoice(key:string,extra:Record<string,unknown>={}){
  const values={tipo_comprobante:'FB',punto_venta:sharedPoint,numero:Object.keys(ids).length+1,fecha_emision:'2026-11-15',cliente_razon_social:prefix+' '+key,cliente_condicion_iva:'Consumidor Final',monto_neto:'100',monto_total:'121',estado:'emitida',...extra};
  const keys=Object.keys(values),params=Object.values(values);
  const row=await pool!.query(`INSERT INTO sales_invoices(${keys.join(',')}) VALUES(${params.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,params);
  ids[key]=row.rows[0].id;return ids[key];
}
describe.skipIf(!enabled)('búsqueda de comprobantes Restaurant con punto fiscal compartido',()=>{
  beforeAll(async()=>{
    const configs=await pool!.query("INSERT INTO pos_configs(numero,nombre,area,activo,tipo) VALUES($1,'Shared fiscal test','recepcion',true,'electronico'),($2,'Restaurant legacy test','restaurant',true,'electronico') RETURNING id",[sharedPoint,restaurantPoint]);configIds.push(...configs.rows.map(r=>r.id));
    await pool!.query("INSERT INTO restaurant_orders(id,order_number,status,opened_at) VALUES($1::text,$1::text,'closed',NOW())",[prefix+'-order']);
    const order=await invoice('order',{restaurant_order_id:prefix+'-order'});
    await invoice('center',{center_settlement_area:'restaurant'});
    const cash=await invoice('cash');
    await pool!.query("INSERT INTO cash_movements(id,area,source_type,source_id,payment_method,amount,movement_type) VALUES($1,'restaurant','comprobante',$2,'efectivo',121,'income')",[prefix+'-cash',String(cash)]);
    await invoice('legacy',{punto_venta:restaurantPoint});
    await invoice('credit',{tipo_comprobante:'NCB',nota_credito_id:order});
    await invoice('reception',{punto_venta:restaurantPoint,reserva_id:prefix+'-reservation'});
    await invoice('spa',{punto_venta:restaurantPoint,spa_account_id:prefix+'-spa'});
    await invoice('event',{punto_venta:restaurantPoint,center_settlement_area:'events'});
    const other=await invoice('other-cash',{punto_venta:restaurantPoint});
    await pool!.query("INSERT INTO cash_movements(id,area,source_type,source_id,payment_method,amount,movement_type) VALUES($1,'recepcion','comprobante',$2,'efectivo',121,'income')",[prefix+'-other-cash',String(other)]);
    await invoice('dangling-order',{punto_venta:restaurantPoint,restaurant_order_id:prefix+'-missing'});
    const reception=await invoice('original-reception',{punto_venta:restaurantPoint,reserva_id:prefix+'-reservation'});
    await invoice('credit-reception',{tipo_comprobante:'NCB',punto_venta:restaurantPoint,nota_credito_id:reception});
    const {registerBillingRoutes}=await import('../billing/routes');const app=express();app.use(express.json());registerBillingRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
  },60000);
  afterAll(async()=>{
    if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
    if(pool){await pool.query('DELETE FROM cash_movements WHERE id IN ($1,$2)',[prefix+'-cash',prefix+'-other-cash']);if(Object.keys(ids).length)await pool.query('DELETE FROM sales_invoices WHERE id=ANY($1::int[])',[Object.values(ids)]);await pool.query('DELETE FROM restaurant_orders WHERE id=$1',[prefix+'-order']);await pool.query('DELETE FROM pos_configs WHERE id=ANY($1::int[])',[configIds]);await pool.end();}
    const {pool:applicationPool}=await import('../db');await applicationPool.end();
  });
  it('encuentra pedidos, Centro, cobros y NC de Restaurant aunque el PV esté asignado a Recepción',async()=>{
    const response=await fetch(base+'/api/billing/invoices?area=restaurant&cliente='+encodeURIComponent(prefix),{headers:{'x-test-user':'synthetic'}});
    expect(response.status).toBe(200);const rows=await response.json();
    expect(rows.map((r:any)=>r.id).sort((a:number,b:number)=>a-b)).toEqual(['order','center','cash','legacy','credit'].map(k=>ids[k]).sort((a,b)=>a-b));
    expect(rows.every((r:any)=>r.area_name==='restaurant')).toBe(true);
  });
  it('conserva los filtros de fecha y no entrega registros sin sesión',async()=>{
    const path='/api/billing/invoices?area=restaurant&cliente='+encodeURIComponent(prefix)+'&desde=2026-11-16';
    const response=await fetch(base+path,{headers:{'x-test-user':'synthetic'}});expect(response.status).toBe(200);expect(await response.json()).toEqual([]);
    expect((await fetch(base+path)).status).toBe(401);
  });
});
