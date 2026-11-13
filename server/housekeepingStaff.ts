import {randomUUID} from "node:crypto";
import type {Express} from "express";
import {sql} from "drizzle-orm";
import {db,withDatabaseTransaction} from "./db";
import {requireAuth,requirePermission} from "./auth";
import {getArgentinaToday} from "./db-storage";
import {validCalendarDate} from "./stayEligibility";
import {addShiftStaffSchema,type ShiftStaff} from "@shared/housekeepingShift";

export async function getShiftStaff(date:string):Promise<ShiftStaff[]> {
  const result=await db.execute(sql`
    SELECT id,full_name AS "fullName",role,'permanent' AS kind,NULL::text AS "serviceDate",'user' AS source
      FROM system_users WHERE role='housekeeping' AND is_active='true'
    UNION ALL
    SELECT id,full_name AS "fullName",'housekeeping' AS role,kind,service_date AS "serviceDate",'operational' AS source
      FROM housekeeping_operational_staff WHERE kind='permanent' OR service_date=${date}
    ORDER BY "fullName",id`);
  return result.rows as ShiftStaff[];
}

export async function validateShiftAssignee(id:string|null|undefined,date:string) {
  if(!id)return;
  const found=await db.execute(sql`SELECT id FROM system_users WHERE id=${id} AND role='housekeeping' AND is_active='true'
    UNION ALL SELECT id FROM housekeeping_operational_staff WHERE id=${id} AND (kind='permanent' OR service_date=${date})`);
  if(!found.rows.length)throw Object.assign(new Error("Elegí personal activo para la fecha de la tarea. El personal extra sólo trabaja en su jornada."),{statusCode:400});
}

export function registerHousekeepingStaff(app:Express) {
  const manage=[requireAuth,requirePermission("sidebar:/housekeeping"),requirePermission("api:housekeeping:supervisor-view")];
  app.get("/api/housekeeping/staff",...manage,async(req,res)=>{
    const date=req.query.date===undefined?getArgentinaToday():req.query.date;
    if(typeof date!=="string"||!validCalendarDate(date))return res.status(400).json({error:"Fecha inválida."});
    try {res.json(await getShiftStaff(date));}
    catch {res.status(500).json({error:"No se pudo consultar el personal de Housekeeping."});}
  });
  app.get("/api/housekeeping/staff/expired",...manage,async(req,res)=>{
    const date=req.query.date===undefined?getArgentinaToday():req.query.date;
    if(typeof date!=="string"||!validCalendarDate(date))return res.status(400).json({error:"Fecha inválida."});
    try {
      const result=await db.execute(sql`SELECT s.id,s.full_name AS "fullName",'housekeeping' AS role,s.kind,
        s.service_date AS "serviceDate",'operational' AS source,count(t.id)::integer AS "pendingCount"
        FROM housekeeping_operational_staff s JOIN housekeeping_tasks t ON t.assigned_to=s.id
        WHERE s.kind='extra' AND s.service_date<${date} AND t.scheduled_date<=${date}
        AND t.status IN ('pending','in_progress')
        GROUP BY s.id ORDER BY s.service_date,s.full_name,s.id`);
      res.json(result.rows);
    } catch {res.status(500).json({error:"No se pudieron consultar los pendientes del personal extra."});}
  });
  app.post("/api/housekeeping/staff",...manage,async(req,res)=>{
    const parsed=addShiftStaffSchema.safeParse(req.body);
    if(!parsed.success||!validCalendarDate(parsed.data.date))return res.status(400).json({error:"Indicá nombre, tipo de personal y una fecha válida."});
    const v=parsed.data;
    try {
      const person=await withDatabaseTransaction(async()=>{
        await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('housekeeping-staff:'||lower(${v.fullName}),0))`);
        const active=await getShiftStaff(v.date);
        if(active.some(p=>p.fullName.toLocaleLowerCase()===v.fullName.toLocaleLowerCase()))
          throw Object.assign(new Error("Ya hay una persona con ese nombre en la jornada. Seleccionala de la lista."),{statusCode:409});
        const id=`hkstaff:${randomUUID()}`,serviceDate=v.kind==="extra"?v.date:null;
        await db.execute(sql`INSERT INTO housekeeping_operational_staff(id,full_name,kind,service_date,created_by)
          VALUES(${id},${v.fullName},${v.kind},${serviceDate},${req.user!.id})`);
        await db.execute(sql`INSERT INTO housekeeping_operational_availability(user_id,scheduled_date,status,updated_by)
          VALUES(${id},${v.date},'working',${req.user!.id})`);
        await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
          VALUES(${req.user!.id},${req.user!.username},'create','housekeeping','operational_staff',${id},
          'Alta de personal operativo sin cuenta de acceso',${JSON.stringify({fullName:v.fullName,kind:v.kind,serviceDate})},NOW())`);
        return {id,fullName:v.fullName,role:"housekeeping",kind:v.kind,serviceDate,source:"operational"};
      });
      res.status(201).json(person);
    } catch(e:any) {res.status(e.statusCode||500).json({error:e.statusCode?e.message:"No se pudo agregar el personal."});}
  });
}
