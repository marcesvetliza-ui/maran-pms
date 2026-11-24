import express from 'express';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import ExcelJS from 'exceljs';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {inHousePax} from '@shared/inHousePax';
vi.mock('../auth',()=>({requireAuth:(req:any,_res:any,next:()=>void)=>{req.user={id:'inhouse-test',role:'admin'};next();},requireRole:()=> (_req:any,_res:any,next:()=>void)=>next(),requirePermission:()=> (_req:any,_res:any,next:()=>void)=>next()}));
vi.mock('../audit',()=>({audit:vi.fn()}));
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL}):null;
suite('current In House is shared by Dashboard, list and workbook',()=>{
 const prefix='inhouse-'+randomUUID(),guest=prefix+'-guest',type=prefix+'-type';
 let server:http.Server,base:string,today:string,storage:typeof import('../db-storage').storage;
 const roomNumbers=new Map<string,string>();
 const day=(offset:number)=>new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
 beforeAll(async()=>{
  ({storage}=await import('../db-storage'));today=(await import('../db-storage')).getArgentinaToday();
  await pool!.query("INSERT INTO guests(id,first_name,last_name)VALUES($1,'Synthetic','Occupant')",[guest]);
  await pool!.query("INSERT INTO room_types(id,code,name)VALUES($1,$2,'Synthetic In House')",[type,prefix]);
  const cases=[
   ['901','checked_in',-1,0,1,0,false],['1006','checked_in',-1,0,2,1,false],
   ['1001','checked_in',-1,1,1,0,false],['903','checked_in',-2,-1,2,1,false],
   ['906','checked_in',-2,-1,1,0,false],
   ['companions','checked_in',-1,1,1,2,false],['declared','checked_in',-1,1,4,1,false],
   ['future','checked_in',1,2,3,0,false],['planned','confirmed',0,1,3,0,false],
   ['departed','checked_out',-1,1,2,1,false],['web','web_checkin',0,1,2,0,false],
   ['virtual','checked_in',-1,1,9,0,true],
  ] as const;
  for(const [name,status,start,end,pax,companions,virtual] of cases){
   const id=prefix+'-'+name;roomNumbers.set(name,id);
   await pool!.query('INSERT INTO rooms(id,room_number,room_type_id,is_virtual)VALUES($1::text,$1::text,$2,$3)',[id,type,virtual]);
   await pool!.query('INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,number_of_guests,created_at)VALUES($1::text,$1::text,$2,$3,$1::text,$4,$5,$6,$7,now())',[id,guest,type,day(start),day(end),status,pax]);
   for(let i=0;i<companions;i++)await pool!.query("INSERT INTO reservation_companions(reservation_id,first_name,last_name)VALUES($1,$2,'Synthetic')",[id,'Companion '+i]);
  }
  const app=express();app.use(express.json());server=http.createServer(app);await(await import('../routes')).registerRoutes(server,app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{
  if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool!.query('DELETE FROM reservation_companions WHERE reservation_id IN(SELECT id FROM reservations WHERE guest_id=$1)',[guest]);
  await pool!.query('DELETE FROM reservations WHERE guest_id=$1',[guest]);
  await pool!.query('DELETE FROM rooms WHERE room_type_id=$1',[type]);
  await pool!.query('DELETE FROM guests WHERE id=$1',[guest]);await pool!.query('DELETE FROM room_types WHERE id=$1',[type]);await pool!.end();
 });
 const list=async(date=today)=>{const response=await fetch(`${base}/api/dashboard/inhouse?date=${date}`);expect(response.status).toBe(200);return response.json();};
 it('includes today and overdue departures until actual checkout, with the same pax as the card',async()=>{
  const rows=await list(),own=rows.filter((r:any)=>r.reservationId.startsWith(prefix));
  expect(own.map((r:any)=>r.roomNumber).sort()).toEqual(['901','1006','1001','903','906','companions','declared'].map(n=>roomNumbers.get(n)).sort());
  const stats=await storage.getDashboardStats();
  expect(stats.inHouseGuests).toBe(rows.reduce((sum:number,r:any)=>sum+inHousePax(r.numberOfGuests,r.companions.length),0));
  expect(own.reduce((sum:number,r:any)=>sum+inHousePax(r.numberOfGuests,r.companions.length),0)).toBe(14);
 });
 it('exports the same current rooms and companion rows to Excel',async()=>{
  const rows=(await list()).filter((r:any)=>r.reservationId.startsWith(prefix));
  const response=await fetch(`${base}/api/dashboard/inhouse/export-xls?mode=inhouse&date=${today}`);expect(response.status).toBe(200);
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
  const values=wb.worksheets[0].getSheetValues() as any[];
  for(const entry of rows)expect(values.filter(row=>row?.[1]===entry.roomNumber)).toHaveLength(1+entry.companions.length);
  for(const excluded of ['future','planned','departed','web','virtual'])expect(JSON.stringify(values)).not.toContain(roomNumbers.get(excluded));
 });
 it('removes the prior stay after checkout and counts a replacement only after check-in',async()=>{
  const old=prefix+'-906',replacement=prefix+'-replacement';
  await pool!.query("UPDATE reservations SET status='checked_out',checked_out_at=now() WHERE id=$1",[old]);
  await pool!.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,number_of_guests,created_at)VALUES($1::text,$1::text,$2,$3,$4,$5,$6,'confirmed',1,now())",[replacement,guest,type,old,today,day(1)]);
  let ids=(await list()).map((r:any)=>r.reservationId);expect(ids).not.toContain(old);expect(ids).not.toContain(replacement);
  await pool!.query("UPDATE reservations SET status='checked_in' WHERE id=$1",[replacement]);
  ids=(await list()).map((r:any)=>r.reservationId);expect(ids).toContain(replacement);expect(ids).not.toContain(old);
 });
 it('retains the established date interval for a historical request',async()=>{
  const rows=await list(day(-1));
  expect(rows.some((r:any)=>r.reservationId===prefix+'-901')).toBe(true);
  expect(rows.some((r:any)=>r.reservationId===prefix+'-903')).toBe(false);
 });
});
