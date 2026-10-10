import express from 'express';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import ExcelJS from 'exceljs';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
vi.mock('../auth',()=>({requireAuth:(req:any,_res:any,next:()=>void)=>{req.user={id:'stay-test',role:'admin'};next();},requireRole:()=> (_req:any,_res:any,next:()=>void)=>next(),requirePermission:()=> (_req:any,_res:any,next:()=>void)=>next()}));
vi.mock('../audit',()=>({audit:vi.fn()}));
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL}):null;
suite('Fecha de estadía y previsión de desayunos',()=>{
 const prefix='stay-'+randomUUID(),type=prefix+'-type',guest=prefix+'-guest',room=prefix+'-room',virtual=prefix+'-virtual';
 let server:http.Server,base:string,storage:typeof import('../db-storage').storage,breakfast:typeof import('../breakfastControl');
 const date='2002-01-15';
 beforeAll(async()=>{
  ({storage}=await import('../db-storage'));breakfast=await import('../breakfastControl');
  await pool!.query("INSERT INTO room_types(id,code,name) VALUES($1,$2,'Prueba estadías')",[type,prefix]);
  await pool!.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Prueba','Estadía')",[guest]);
  await pool!.query("INSERT INTO rooms(id,room_number,room_type_id,is_virtual) VALUES($1::varchar,$1::text,$3,false),($2::varchar,$2::text,$3,true)",[room,virtual,type]);
  const cases=[['current','2002-01-14','2002-01-16','checked_in',2,room],['stale','2001-01-01','2001-01-02','checked_in',7,room],['departure','2002-01-14','2002-01-15','checked_in',3,room],['future','2002-01-16','2002-01-18','checked_in',9,room],['planned','2002-01-14','2002-01-16','confirmed',4,room],['cancelled','2002-01-14','2002-01-16','cancelled',8,room],['virtual','2002-01-14','2002-01-16','checked_in',10,virtual]];
  for(const [name,start,end,status,pax,r] of cases)await pool!.query('INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,number_of_guests,created_at) VALUES($1::varchar,$1::text,$2,$3,$4,$5,$6,$7,$8,now())',[prefix+'-'+name,guest,type,r,start,end,status,pax]);
  const app=express();app.use(express.json());server=http.createServer(app);await (await import('../routes')).registerRoutes(server,app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{
  if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool!.query('DELETE FROM breakfast_days WHERE date=$1',[date]);await pool!.query('DELETE FROM reservations WHERE guest_id=$1',[guest]);await pool!.query('DELETE FROM rooms WHERE id IN ($1,$2)',[room,virtual]);await pool!.query('DELETE FROM guests WHERE id=$1',[guest]);await pool!.query('DELETE FROM room_types WHERE id=$1',[type]);await pool!.end();
 });
 it('el listado y Excel solo incluyen check-ins cuya estadía cubre la fecha',async()=>{
  const response=await fetch(`${base}/api/dashboard/inhouse?date=${date}`);expect(response.status).toBe(200);const rows=await response.json();expect(rows.filter((r:any)=>r.roomNumber.startsWith(prefix)).map((r:any)=>r.reservationId)).toEqual([prefix+'-current']);
  const xls=await fetch(`${base}/api/dashboard/inhouse/export-xls?mode=inhouse&date=${date}`);expect(xls.status).toBe(200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await xls.arrayBuffer()) as any);const contents=JSON.stringify(wb.worksheets[0].getSheetValues());expect(contents).toContain(room);expect(contents).not.toContain(virtual);expect(contents).not.toContain('01/01/2001');
  expect((await fetch(`${base}/api/dashboard/inhouse?date=2026-02-30`)).status).toBe(400);
 });
 it('el desayuno incluye la mañana de salida y conserva el dato real cargado',async()=>{
  expect(await breakfast.suggestedBreakfastPax(date)).toBe(9);let day=await breakfast.getBreakfastDay(date);expect(day.pax).toBe(9);expect(day.forecastPax).toBe(9);expect(day.paxIsSuggested).toBe(true);
  await breakfast.saveBreakfastDay(date,6,'Servicio real',[],'stay-test');day=await breakfast.getBreakfastDay(date);expect(day.pax).toBe(6);expect(day.forecastPax).toBe(9);expect(day.paxIsSuggested).toBe(false);
 });
 it('dashboard, detalle y carga diaria comparten el previsto de mañana',async()=>{
  const today=(await import('../db-storage')).getArgentinaToday();const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  await pool!.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,number_of_guests,created_at) VALUES($1::varchar,$1::text,$2,$3,$4,$5,$6,'confirmed',4,now())",[prefix+'-today',guest,type,room,today,tomorrow]);
  const stats=await storage.getDashboardStats();const response=await fetch(base+'/api/dashboard/breakfasts');expect(response.status).toBe(200);const list=await response.json();expect(list.some((r:any)=>r.reservationId===prefix+'-today')).toBe(true);
  const listed=list.reduce((sum:number,r:any)=>sum+r.adults+r.children,0);expect(stats.breakfastsTomorrow).toBe(listed);expect((await breakfast.getBreakfastDay(tomorrow)).forecastPax).toBe(listed);
 });

});
