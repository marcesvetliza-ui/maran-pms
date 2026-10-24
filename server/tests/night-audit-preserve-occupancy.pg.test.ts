import {randomUUID} from "node:crypto";
import {it,expect,afterAll,vi} from "vitest";
import {sql} from "drizzle-orm";
import {db,pool,withDatabaseTransaction} from "../db";
vi.mock("../email-service",()=>({runReminderScheduler:vi.fn()}));
import {runNightAudit} from "../night-audit";
const enabled=!!process.env.DATABASE_URL&&process.env.ALLOW_DESTRUCTIVE_PG_TESTS==="true";
afterAll(async()=>pool.end());
it.skipIf(!enabled)("night audit preserves a zero-balance occupied stay with overdue departure and No mover",async()=>{
 const url=new URL(process.env.DATABASE_URL!);
 expect(["localhost","127.0.0.1"]).toContain(url.hostname);expect(url.pathname).toMatch(/test/);
 const id="hk-audit-"+randomUUID(),date="2095-07-17",rollback=new Error("rollback synthetic audit");
 await expect(withDatabaseTransaction(async()=>{
  await db.execute(sql`DELETE FROM night_audit_logs WHERE audit_date=${date}`);
  await db.execute(sql`INSERT INTO room_types(id,code,name)VALUES(${id},${id},'Synthetic audit type')`);
  await db.execute(sql`INSERT INTO guests(id,first_name,last_name)VALUES(${id},'Synthetic','Audit')`);
  await db.execute(sql`INSERT INTO rooms(id,room_number,room_type_id,status)VALUES(${id},${id},${id},'limpia_ocupada')`);
  const preparation=JSON.stringify({roomId:id,state:'prepared',note:'No mover'});
  await db.execute(sql`INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,total_room_amount,final_rate_per_night,late_check_out,late_check_out_time,housekeeping_preparation,created_at)VALUES(${id},${id},${id},${id},${id},'2095-07-14','2095-07-16',2,'checked_in',0,0,true,'15:00',${preparation}::jsonb,NOW())`);
  const result=await runNightAudit({forceDate:date,executedBy:'Synthetic local test',isManual:false});
  expect(result.success,JSON.stringify(result)).toBe(true);
  const reservation=(await db.execute(sql`SELECT status,housekeeping_preparation FROM reservations WHERE id=${id}`)).rows[0] as any;
  expect(reservation.status).toBe('checked_in');expect(reservation.housekeeping_preparation).toEqual(JSON.parse(preparation));
  expect((await db.execute(sql`SELECT status FROM rooms WHERE id=${id}`)).rows[0]?.status).toBe('limpia_ocupada');
  throw rollback;
 })).rejects.toBe(rollback);
});
