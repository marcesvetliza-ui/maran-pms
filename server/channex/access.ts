import type {Express,RequestHandler} from 'express';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import {db,withDatabaseTransaction} from '../db';
import {requireAuth} from '../auth';
import {audit} from '../audit';
import {CHANNEX_CAPABILITIES,type ChannexCapability} from '@shared/channexAccess';
const capabilities=Object.keys(CHANNEX_CAPABILITIES) as ChannexCapability[];
export async function ensureChannexAccessSchema(){
 await db.execute(sql`CREATE TABLE IF NOT EXISTS user_permission_overrides(user_id varchar NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,resource_key text NOT NULL,allowed boolean NOT NULL,updated_at timestamp NOT NULL DEFAULT now(),updated_by varchar,UNIQUE(user_id,resource_key))`);
}
export async function channexAccess(userId:string){
 const rows=(await db.execute(sql`SELECT u.id,u.role,p.resource_key,p.allowed FROM system_users u
  LEFT JOIN user_permission_overrides p ON p.user_id=u.id AND p.resource_key LIKE 'api:ota:%'
  WHERE u.id=${userId} AND u.is_active='true'`)).rows as any[];
 const owner=!!rows.length&&rows[0].role==='admin';
 return {owner,ownerConfigured:true,...Object.fromEntries(capabilities.map(key=>[key,owner||rows.some(row=>row.resource_key===`api:ota:${key}`&&row.allowed===true)]))} as {owner:boolean;ownerConfigured:boolean}&Record<ChannexCapability,boolean>;
}
export function requireChannex(capability:ChannexCapability):RequestHandler{
 return (req,res,next)=>requireAuth(req,res,async()=>{try{const access=await channexAccess(req.user!.id);if(!access[capability])return res.status(403).json({error:'No tenés permiso para esta función de Canales OTAs.'});next();}catch{res.status(503).json({error:'No se pudo verificar el permiso de Canales OTAs.'});}});
}
export function registerChannexAccessRoutes(app:Express){
 app.get('/api/channex/access',requireAuth,async(req,res)=>{res.setHeader('Cache-Control','private, no-store');try{res.json(await channexAccess(req.user!.id));}catch{res.status(503).json({error:'No se pudieron consultar tus permisos de OTAs.'});}});
 const owner:RequestHandler=(req,res,next)=>requireAuth(req,res,async()=>{try{if(!(await channexAccess(req.user!.id)).owner)return res.status(403).json({error:'Solo admin puede administrar estos accesos.'});next();}catch{res.sendStatus(503);}});
 app.get('/api/channex/access/users',owner,async(_req,res)=>{
  const users=(await db.execute(sql`SELECT id,username,full_name AS "fullName",role,is_active AS "isActive" FROM system_users ORDER BY full_name,id`)).rows;
  const grants=(await db.execute(sql`SELECT user_id AS "userId",resource_key AS "resourceKey",allowed FROM user_permission_overrides WHERE resource_key LIKE 'api:ota:%'`)).rows;
  res.setHeader('Cache-Control','private, no-store');res.json({users,grants,catalog:CHANNEX_CAPABILITIES});
 });
 app.put('/api/channex/access/users/:id',owner,async(req,res)=>{
  const parsed=z.object({permissions:z.array(z.enum(['read','config','bookings','sync'])).max(4)}).strict().safeParse(req.body);if(!parsed.success)return res.sendStatus(400);
  try{await withDatabaseTransaction(async()=>{
   const target=(await db.execute(sql`SELECT id FROM system_users WHERE id=${req.params.id} AND is_active='true' FOR UPDATE`)).rows[0];if(!target)throw Object.assign(Error('Usuario activo no encontrado'),{statusCode:404});
   for(const key of capabilities)await db.execute(sql`INSERT INTO user_permission_overrides(user_id,resource_key,allowed,updated_by) VALUES(${req.params.id},${`api:ota:${key}`},${(key==='read' ? parsed.data.permissions.length>0 : parsed.data.permissions.includes(key))},${req.user!.id}) ON CONFLICT(user_id,resource_key) DO UPDATE SET allowed=EXCLUDED.allowed,updated_at=now(),updated_by=EXCLUDED.updated_by`);
   await audit(req,'update','permisos','Accesos de Canales OTAs actualizados',{entityType:'channex_access',entityId:req.params.id});
  });res.json({saved:true});}catch(error:any){res.status(error.statusCode||503).json({error:error.statusCode?error.message:'No se pudieron guardar los permisos de OTAs.'});}
 });
}
