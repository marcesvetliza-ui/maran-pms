import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
const state=vi.hoisted(()=>({db:null as any,readOnly:null as string|null}));
vi.mock('../db',()=>({db:{
  execute:(q:any)=>state.db.execute(q),select:(...args:any[])=>state.db.select(...args),
  transaction:(fn:any,config:any)=>state.db.transaction(async(tx:any)=>{state.readOnly=(await tx.execute((await import('drizzle-orm')).sql`SHOW transaction_read_only`)).rows[0].transaction_read_only;return fn(tx);},config),
},pool:{},withDatabaseTransaction:(fn:any)=>fn(),withReadOnlyDatabaseTransaction:(fn:any)=>fn()}));
const suite=process.env.DATABASE_URL?describe:describe.skip;
let client:Client;
suite('Informes de ocupación futura contra Planning',()=>{
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.includes('test'))throw Error('Use a disposable local test database.');
    client=new Client({connectionString:url.toString()});await client.connect();state.db=drizzle(client);
    for(const table of ['rooms','reservations','charges','maintenance_blocks','group_charges','group_reservation_links','group_room_blocks'])await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-23T12:44:00Z'));
  },30000);
  beforeEach(async()=>{
    await client.query('TRUNCATE rooms,reservations,charges,maintenance_blocks,group_charges,group_reservation_links,group_room_blocks');
    for(let i=0;i<66;i++)await client.query("INSERT INTO rooms(id,room_number,room_type_id,status,is_active,is_virtual)VALUES($1,$2,'type',$3,true,false)",['r'+i,String(200+i),i<20?'occupied':'available']);
    for(let i=0;i<58;i++)await client.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,status,check_in_date,check_out_date,nights,total_room_amount,final_rate_per_night,pricing_scheme,source,created_at)VALUES($1::text,$1::text,'synthetic',$2,'type','confirmed','2026-11-24','2026-11-27',3,300,100,'legacy','directo',now())",['s'+i,'r'+i]);
    await client.query("INSERT INTO group_reservation_links(group_id,reservation_id)VALUES('synthetic-group','s0');INSERT INTO group_room_blocks(group_id,room_type_id,quantity,agreed_rate,block_check_in_date,block_check_out_date)VALUES('synthetic-group','type',1,100,'2026-11-24','2026-11-27')");
  });
  afterAll(async()=>{vi.useRealTimers();await client?.end();});
  async function compare(from='2026-11-24',to='2026-11-27'){
    const {storage}=await import('../db-storage');const {computeRevenueBoard}=await import('../revenue/metrics');const {nextDate}=await import('../reports/lodging');
    const rows=await storage.getReportOccupancy(from,to),planning=await computeRevenueBoard(from,nextDate(to));
    for(const row of rows){const same=planning.find(p=>p.date===row.date)!;expect(row.totalRooms).toBe(same.roomsAvailable);expect(row.counted).toBe(same.roomsSold);expect(row.occupancy).toBeCloseTo(same.occupancyPct,1);}
    return rows;
  }
  it('reproduce 58 reservas sobre 66 habitaciones y excluye la noche de salida sin check-in',async()=>{
    const before=(await client.query('SELECT * FROM reservations ORDER BY id')).rows;
    const rows=await compare();expect(rows[0]).toMatchObject({occupied:0,forecast:58,counted:58,totalRooms:66,available:8,basis:'reserved'});expect(rows[0].occupancy).toBeCloseTo(58/66*100);
    expect(rows[3]).toMatchObject({counted:0,forecast:0,occupancy:0,available:66});expect(state.readOnly).toBe('on');
    expect((await client.query('SELECT * FROM reservations ORDER BY id')).rows).toEqual(before);
  });
  it('el KPI ejecutivo usa las noches reservadas del período, con el estado actual de habitaciones separado',async()=>{
    const {storage}=await import('../db-storage');const stats=await storage.getExecutiveStats('2026-11-24','2026-11-26');
    expect(stats.occupancyRate).toBeCloseTo(58/66*100);expect(stats.occupancySummary).toMatchObject({basis:'reserved',roomNights:174,capacityNights:198});
    expect(stats.occupiedRooms).toBe(20);expect(stats.alojamiento.resumen.roomNights).toBe(0);expect(stats.alojamiento.proyeccion.roomNights).toBe(174);expect(stats.accommodationRevenue).toBe(0);
  });
  it('cuenta a quienes ya están alojados también en sus noches futuras, sin contar dos veces el grupo asignado',async()=>{
    await client.query("UPDATE reservations SET status='checked_in',check_in_date='2026-11-23',nights=4,total_room_amount=400 WHERE id='s0'");
    const rows=await compare('2026-11-23','2026-11-24');expect(rows[0]).toMatchObject({occupied:1,forecast:0,counted:1});expect(rows[1].counted).toBe(58);
  });
  it('excluye canceladas, no-show y habitaciones no operativas; deduplica bloqueos fechados igual que Planning',async()=>{
    // Explicit rows keep the fixture independent of physical schema column order.
    for(const status of ['cancelled','no_show','checked_out'])await client.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,status,check_in_date,check_out_date,created_at)VALUES($1::text,$1::text,'synthetic','r60','type',$1,'2026-11-24','2026-11-27',now())",[status]);
    await client.query("INSERT INTO rooms(id,room_number,room_type_id,is_active,is_virtual)VALUES('virtual','V','type',true,true),('inactive','I','type',false,false),('reub','REUB','type',true,false)");
    for(const id of ['virtual','inactive','reub'])await client.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,status,check_in_date,check_out_date,created_at)VALUES($1::text,$1::text,'synthetic',$1::text,'type','confirmed','2026-11-24','2026-11-27',now())",[id]);
    await client.query("INSERT INTO maintenance_blocks(room_id,block_from,block_to,blocked_by)VALUES('r65','2026-11-24','2026-11-25','synthetic'),('r65','2026-11-24','2026-11-26','synthetic')");
    const rows=await compare();expect(rows[0]).toMatchObject({totalRooms:65,counted:58,available:7});expect(rows[0].occupancy).toBeCloseTo(58/65*100);
  });
  it('el histórico usa estadías realizadas; una reserva confirmada que no ingresó no fabrica ocupación pasada',async()=>{
    await client.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,status,check_in_date,check_out_date,nights,total_room_amount,created_at)VALUES('past-real','past-real','synthetic','r1','type','checked_out','2026-11-21','2026-11-23',2,200,now()),('past-unfulfilled','past-unfulfilled','synthetic','r2','type','confirmed','2026-11-21','2026-11-23',2,200,now())");
    const rows=await compare('2026-11-22','2026-11-24');expect(rows[0]).toMatchObject({basis:'actual',occupied:1,forecast:0,counted:1});expect(rows[1].counted).toBe(0);expect(rows[2].counted).toBe(58);
  });
});
