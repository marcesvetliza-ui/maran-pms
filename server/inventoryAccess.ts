import type {RequestHandler} from 'express';
import {requirePermission} from './auth';
import {hasPermission} from './permissions';
export function inventoryWriteKey(path:string,body:any={}) {
 if (/source-stock-reversals|\/movements\/[^/]+\/(corregir|anular)|\/counts\/.+\/close/.test(path) || body.movementType==='ajuste') return 'api:inventory:adjust';
 if (/\/categories|\/brands|unit-conversions|\/items(?:\/[^/]+(?:\/metadata|\/deactivate)?)?$/.test(path) || /\/warehouses(?:\/[^/]+)?$/.test(path)) return 'api:inventory:catalog';
 return 'api:inventory:operate';
}
export const inventoryWritePermission:RequestHandler=(req,res,next)=>requirePermission(inventoryWriteKey(req.path,req.body))(req,res,next);
const costFields=new Set(['costPrice','cost_price','unitCost','unit_cost','totalCost','total_cost','totalValue','total_value','stockValue','stock_value','previousCost','previous_cost','newCost','new_cost']);
export function hideInventoryCosts(value:any):any {
 if(Array.isArray(value))return value.map(hideInventoryCosts);
 if(typeof value==='string' && /^[\[{]/.test(value)){try{return JSON.stringify(hideInventoryCosts(JSON.parse(value)));}catch{}}
 if(value && typeof value==='object' && !(value instanceof Date))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,(costFields.has(k) || /cost|costo|valuation/i.test(k))?null:hideInventoryCosts(v)]));
 return value;
}
export const inventoryAccess:RequestHandler=(req,res,next)=>{
 const canCost=hasPermission(req.user!.role,'api:inventory:cost');
 if(req.method==='GET') {
  // Area alerts remain available to the service's authenticated operators.
  const serviceAlert=req.path==='/pending-consumptions' && ((req.query.area==='spa' && req.user!.role==='spa') || (req.query.area==='restaurant' && req.user!.role==='restaurant'));
  if(!serviceAlert && !hasPermission(req.user!.role,'api:inventory:read'))return res.status(403).json({error:'No tenés permiso para consultar Inventario'});
  if(/price-history/.test(req.path) && !canCost)return res.status(403).json({error:'No tenés permiso para consultar costos'});
 }
 if(req.method!=='GET' && !canCost && req.body && ['costPrice','cost_price','unitCost','unit_cost'].some(k=>req.body[k]!==undefined))return res.status(403).json({error:'No tenés permiso para modificar costos'});
 if(!canCost){const json=res.json.bind(res);res.json=((body:any)=>json(hideInventoryCosts(body))) as typeof res.json;}
 next();
};
