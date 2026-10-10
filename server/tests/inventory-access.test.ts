import {describe,it,expect,vi} from 'vitest';
const grants=vi.hoisted(()=>new Set<string>());
vi.mock('../permissions',()=>({hasPermission:(_role:string,key:string)=>grants.has(key)}));
vi.mock('../auth',()=>({requirePermission:(key:string)=>(_req:any,res:any,next:any)=>grants.has(key)?next():res.status(403).json({error:'denied'})}));
import {inventoryAccess,inventoryWriteKey,inventoryWritePermission,hideInventoryCosts} from '../inventoryAccess';
function request(method:string,path:string,body:any={}){
 const req:any={method,path,body,query:{},user:{role:'restaurant'}};
 const res:any={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};const next=vi.fn();return {req,res,next};
}
describe('Inventory permission boundaries',()=>{
 it.each([
  ['/api/inventory/items/i/purchasing',{purchaseEnabled:false},'catalog'],['/api/inventory/categories',{},'catalog'],['/api/inventory/items/i/metadata',{},'catalog'],['/api/inventory/items/i/unit-conversions',{},'catalog'],['/api/inventory/transfer',{},'operate'],['/api/inventory/internal-movements',{},'operate'],['/api/inventory/pending-consumptions/j/retry',{},'operate'],['/api/inventory/warehouses/w/movements',{movementType:'entrada'},'operate'],['/api/inventory/warehouses/w/movements',{movementType:'ajuste'},'adjust'],['/api/inventory/movements/m/anular',{},'adjust'],['/api/inventory/source-stock-reversals',{},'adjust'],['/api/inventory/counts/c/close',{},'adjust']
 ])('classifies %s', (path,body,key)=>expect(inventoryWriteKey(path as string,body)).toBe('api:inventory:'+key));
 it('the old broad permission cannot bypass granular operation guards',()=>{grants.clear();grants.add('api:inventory:write');const {req,res,next}=request('POST','/api/inventory/transfer');inventoryWritePermission(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();});
 it('operating permission does not grant adjustments',()=>{grants.clear();grants.add('api:inventory:operate');const ok=request('POST','/api/inventory/transfer');inventoryWritePermission(ok.req,ok.res,ok.next);expect(ok.next).toHaveBeenCalled();const bad=request('POST','/api/inventory/movements',{movementType:'ajuste'});inventoryWritePermission(bad.req,bad.res,bad.next);expect(bad.res.status).toHaveBeenCalledWith(403);});
 it('withholds nested costs while retaining quantities and source references',()=>{expect(hideInventoryCosts({totalCost:20,items:[{costPrice:10,unit_cost:10,quantity:2,sourceId:'invoice'}]})).toEqual({totalCost:null,items:[{costPrice:null,unit_cost:null,quantity:2,sourceId:'invoice'}]});});
 it('rejects unauthorised cost writes and price history',()=>{grants.clear();grants.add('api:inventory:read');for(const [method,path,body] of [['PATCH','/items/i',{costPrice:10}],['POST','/movements',{unitCost:10}],['GET','/items/i/price-history',{}],['GET','/price-history-comparison',{}]] as const){const r=request(method,path,body);inventoryAccess(r.req,r.res,r.next);expect(r.res.status).toHaveBeenCalledWith(403);}});
 it('redacts API reports and allows the approved cost permission',()=>{grants.clear();grants.add('api:inventory:read');const r=request('GET','/consumo-report');const json=r.res.json;inventoryAccess(r.req,r.res,r.next);r.res.json({totalCost:900,items:[{cost_price:12}]});expect(json).toHaveBeenCalledWith({totalCost:null,items:[{cost_price:null}]});grants.add('api:inventory:cost');const allowed=request('GET','/consumo-report');const original=allowed.res.json;inventoryAccess(allowed.req,allowed.res,allowed.next);expect(allowed.res.json).toBe(original);});
});
