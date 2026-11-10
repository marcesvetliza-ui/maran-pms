import type {Request,Response,NextFunction} from 'express';
import {sql} from 'drizzle-orm';
import {db} from '../db';
import {hasPermission} from '../permissions';

export const RESTAURANT_CREDIT_NOTE_PERMISSION='api:billing:restaurant-credit-note';
/** General finance access remains unchanged. Restaurant grants apply only to
 * invoices durably linked to an existing restaurant order, never another folio. */
export async function requireCreditNoteAccess(req:Request,res:Response,next:NextFunction){
  const role=String(req.user?.role||'');
  if(hasPermission(role,'api:billing:nc-reconciliation'))return next();
  if(!hasPermission(role,RESTAURANT_CREDIT_NOTE_PERMISSION))return res.status(403).json({message:'No autorizado para esta acción'});
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Comprobante inválido'});
  try{
    const result=await db.execute(sql`SELECT si.id FROM sales_invoices si
      JOIN restaurant_orders ro ON ro.id=si.restaurant_order_id
      WHERE si.id=${id} AND si.reserva_id IS NULL AND si.group_id IS NULL AND si.spa_account_id IS NULL
      AND (si.center_settlement_area IS NULL OR si.center_settlement_area='restaurant')`);
    if(!result.rows.length)return res.status(403).json({message:'Este permiso permite emitir notas de crédito únicamente de facturas de Restaurant'});
    return next();
  }catch{return res.status(503).json({error:'No se pudo verificar el origen de la factura'});}
}
