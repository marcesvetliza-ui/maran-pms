import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,beforeEach,afterEach,afterAll} from 'vitest';
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL}):null;
let storage:typeof import('../db-storage').storage;
let id:string,item:string,otherItem:string,warehouse:string,otherWarehouse:string,count:string;
async function quantity(w=warehouse){return Number((await pool!.query('SELECT current_stock FROM warehouse_stock WHERE item_id=$1 AND warehouse_id=$2',[item,w])).rows[0]?.current_stock ?? 0);}
async function global(){return Number((await pool!.query('SELECT current_stock FROM inventory_items WHERE id=$1',[item])).rows[0].current_stock);}
async function create(){const c=await storage.createInventoryCount({date:'2026-10-08',warehouseId:warehouse,createdBy:id});count=c.id;return storage.getInventoryCountWithItems(count);}
suite('Tomas por depósito',()=>{
 beforeAll(async()=>{
  if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname)||process.env.NODE_ENV==='production')throw new Error('Solo base local');
  ({storage}=await import('../db-storage'));await (await import('../inventoryCountSchema')).ensureInventoryCountWarehouseSchema();
 });
 beforeEach(async()=>{
  id='count-'+randomUUID();item=id+'-a';otherItem=id+'-b';warehouse=id+'-w';otherWarehouse=id+'-other';count='';
  await pool!.query("INSERT INTO inventory_items(id,name,unit,current_stock,item_kind) VALUES($1,'Carne','kg',14,'materia_prima'),($2,'Plato menú','unidad',1,'plato')",[item,otherItem]);
  await pool!.query("INSERT INTO inventory_warehouses(id,name) VALUES($1,'Cocina'),($2,'General')",[warehouse,otherWarehouse]);
  await pool!.query('INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock) VALUES($1,$3,10),($2,$3,4),($1,$4,1)',[warehouse,otherWarehouse,item,otherItem]);
 });
 afterEach(async()=>{
  await pool!.query('DELETE FROM audit_logs WHERE user_id=$1',[id]);
  await pool!.query('DELETE FROM inventory_counts WHERE warehouse_id IN ($1,$2) OR id=$3',[warehouse,otherWarehouse,count]);
  await pool!.query('DELETE FROM stock_movements WHERE item_id IN ($1,$2)',[item,otherItem]);
  await pool!.query('DELETE FROM inventory_location_policies WHERE item_id IN ($1,$2)',[item,otherItem]);
  await pool!.query('DELETE FROM warehouse_stock WHERE item_id IN ($1,$2)',[item,otherItem]);
  await pool!.query('DELETE FROM inventory_items WHERE id IN ($1,$2)',[item,otherItem]);
  await pool!.query('DELETE FROM inventory_warehouses WHERE id IN ($1,$2)',[warehouse,otherWarehouse]);
 });
 afterAll(async()=>{await pool!.end();await (await import('../db')).pool.end();});
 it('exige depósito y toma el saldo local, excluyendo platos del menú',async()=>{
  await expect(storage.createInventoryCount({date:'2026-10-08'} as any)).rejects.toThrow('depósito');
  const c=await create();expect(c.warehouse_name).toBe('Cocina');expect(c.items).toHaveLength(1);expect(Number(c.items[0].expected_stock)).toBe(10);
 });
 it('ajusta el depósito y suma solo la diferencia al global, una sola vez',async()=>{
  await create();await storage.updateInventoryCountItem(count,item,8);
  const responses=await Promise.all([storage.closeInventoryCount(count,id),storage.closeInventoryCount(count,id)]);
  expect(responses.map(r=>r.adjustments).sort()).toEqual([0,1]);expect(await quantity()).toBe(8);expect(await quantity(otherWarehouse)).toBe(4);expect(await global()).toBe(12);
  const movements=await pool!.query("SELECT warehouse_id,previous_stock,new_stock FROM stock_movements WHERE source_id=$1",[count]);
  expect(movements.rows).toHaveLength(1);expect(movements.rows[0]).toMatchObject({warehouse_id:warehouse,previous_stock:'10.000',new_stock:'8.000'});
 });
 it('otros depósitos pueden operar durante la toma',async()=>{
  await create();await storage.updateInventoryCountItem(count,item,8);
  const {safeWarehouseMovement}=await import('../inventorySafety');await safeWarehouseMovement(otherWarehouse,{itemId:item,movementType:'entrada',quantity:3},id);
  expect((await storage.closeInventoryCount(count,id)).adjustments).toBe(1);expect(await quantity(otherWarehouse)).toBe(7);expect(await global()).toBe(15);
 });
 it('detecta movimientos locales incluso si el saldo vuelve y la fecha del movimiento es anterior',async()=>{
  await create();await storage.updateInventoryCountItem(count,item,8);
  await pool!.query("INSERT INTO stock_movements(item_id,warehouse_id,movement_type,quantity,previous_stock,new_stock,created_at) VALUES($1,$2,'ajuste',0,10,10,now()-interval '1 day')",[item,warehouse]);
  await expect(storage.closeInventoryCount(count,id)).rejects.toThrow('cambió');expect(await global()).toBe(14);
 });
 it('una transferencia entrante invalida el conteo aunque su origen sea otro depósito',async()=>{
  await create();await storage.updateInventoryCountItem(count,item,8);
  await (await import('../inventorySafety')).safeInventoryTransfer(otherWarehouse,warehouse,[{itemId:item,quantity:1}],undefined,id);
  await expect(storage.closeInventoryCount(count,id)).rejects.toThrow('cambió');
 });
 it('no convierte los artículos sin contar a cero',async()=>{
  await pool!.query("UPDATE inventory_items SET item_kind='materia_prima' WHERE id=$1",[otherItem]);
  await create();await storage.updateInventoryCountItem(count,item,8);await storage.closeInventoryCount(count,id);
  expect(Number((await pool!.query('SELECT current_stock FROM warehouse_stock WHERE warehouse_id=$1 AND item_id=$2',[warehouse,otherItem])).rows[0].current_stock)).toBe(1);
 });
 it('incluye artículos esperados sin saldo y permite registrarlos por primera vez',async()=>{
  await pool!.query('DELETE FROM warehouse_stock WHERE item_id=$1',[item]);await pool!.query('UPDATE inventory_items SET current_stock=0 WHERE id=$1',[item]);
  await pool!.query('INSERT INTO inventory_location_policies(warehouse_id,item_id,is_expected,min_stock) VALUES($1,$2,true,0)',[warehouse,item]);
  const c=await create();expect(Number(c.items[0].expected_stock)).toBe(0);await storage.updateInventoryCountItem(count,item,2);await storage.closeInventoryCount(count,id);
  expect(await quantity()).toBe(2);expect(await global()).toBe(2);
 });
 it('conserva las tomas anteriores para consulta sin permitir ajustes globales',async()=>{
  count=id+'-legacy';await pool!.query("INSERT INTO inventory_counts(id,date) VALUES($1,'2026-10-07')",[count]);
  await expect(storage.closeInventoryCount(count,id)).rejects.toThrow('anterior');await expect(storage.updateInventoryCountItem(count,item,2)).rejects.toThrow('anterior');
  expect((await storage.getInventoryCountWithItems(count)).warehouse_id).toBeNull();expect(await global()).toBe(14);
 });
 it('anula con motivo, conserva conteos y no aplica stock',async()=>{
  await create();await storage.updateInventoryCountItem(count,item,8);
  await expect(storage.cancelInventoryCount(count,id,'')).rejects.toThrow('motivo');
  await storage.cancelInventoryCount(count,id,'Conteo desactualizado');
  expect((await storage.getInventoryCountWithItems(count)).status).toBe('anulado');expect(await global()).toBe(14);
  await expect(storage.closeInventoryCount(count,id)).rejects.toThrow('borrador');
  await expect(storage.updateInventoryCountItem(count,item,7)).rejects.toThrow('cerrada');
 });
 it('una toma abierta protege artículos y depósito contra bajas',async()=>{
  await create();await expect(storage.updateInventoryItem(item,{isActive:'false'})).rejects.toThrow('Toma');
  const {db,withDatabaseTransaction}=await import('../db');await expect(withDatabaseTransaction(()=>(import('../inventoryLifecycle').then(m=>m.protectWarehouseDeactivation(db,warehouse))))).rejects.toThrow('Toma');
 });
});
