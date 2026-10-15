import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const id = `spa-operations-${randomUUID()}`;
let server: http.Server;
let base = '';
let role = 'admin';
const request = async (method: string, path: string, body?: object) => fetch(base + path, {
  method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
});

suite('SPA: tratamiento recuperable y costo de insumos de solo lectura', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') throw new Error('Solo base de pruebas');
    const { registerSpaRoutes } = await import('../routes/spa');
    const { loadRolePermissionsCache } = await import('../permissions');
    await loadRolePermissionsCache();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { id, username: id, role } as any; req.isAuthenticated = () => true; next(); });
    registerSpaRoutes(app);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    await pool!.query("INSERT INTO spa_treatments(id,name,duration_minutes,price,is_active) VALUES($1,'Tratamiento histórico',60,70000,'true')", [id]);
    await pool!.query("INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,status,created_at) VALUES($1,'test',$1,'PRUEBA','2026-10-15','10:00','11:00','completed',now())", [id]);
    await pool!.query("INSERT INTO inventory_items(id,name,unit,current_stock,cost_price) VALUES($1,'Aceite','litro',10,20000)", [id]);
    await pool!.query("INSERT INTO treatment_supplies(id,treatment_id,inventory_item_id,quantity,unit) VALUES($1,$1,$1,50,'ml')", [id]);
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool!.query('DELETE FROM inventory_consumption_jobs WHERE source_id=$1', [id]);
    await pool!.query('DELETE FROM stock_movements WHERE item_id IN ($1,$2)', [id, id+'-second']);
    await pool!.query('DELETE FROM warehouse_stock WHERE warehouse_id=$1', [id]);
    await pool!.query('DELETE FROM inventory_warehouses WHERE id=$1', [id]);
    await pool!.query('DELETE FROM treatment_supplies WHERE treatment_id=$1', [id]);
    await pool!.query('DELETE FROM spa_accounts WHERE id=$1', [id]);
    await pool!.query('DELETE FROM spa_appointments WHERE id=$1', [id]);
    await pool!.query('DELETE FROM spa_treatments WHERE id=$1', [id]);
    await pool!.query('DELETE FROM inventory_unit_conversions WHERE item_id=$1', [id]);
    await pool!.query('DELETE FROM inventory_items WHERE id IN ($1,$2)', [id, id+'-second']);
    await pool!.end();
  });
  it('desactiva por compatibilidad con DELETE, conserva el historial y permite reactivar', async () => {
    expect((await request('DELETE', `/api/spa/treatments/${id}`)).status).toBe(204);
    const active = await (await request('GET', '/api/spa/treatments')).json();
    expect(active.some((t: any) => t.id === id)).toBe(false);
    const inactive = await (await request('GET', '/api/spa/treatments?status=inactive')).json();
    expect(inactive.find((t: any) => t.id === id)?.isActive).toBe('false');
    expect((await pool!.query('SELECT treatment_id FROM spa_appointments WHERE id=$1', [id])).rows[0].treatment_id).toBe(id);
    expect((await request('PATCH', `/api/spa/treatments/${id}`, { isActive: 'true' })).status).toBe(200);
    const all = await (await request('GET', '/api/spa/treatments?status=all')).json();
    expect(all.find((t: any) => t.id === id)?.isActive).toBe('true');
  });
  it('calcula ml a litros al costo actual sin modificar stock ni generar movimientos', async () => {
    const response = await request('GET', `/api/spa/treatments/${id}/supplies`);
    expect(response.status).toBe(200);
    const rows = await response.json();
    expect(rows[0]).toMatchObject({ estimatedCost: 1000, costWarning: null });
    expect((await pool!.query('SELECT current_stock::text FROM inventory_items WHERE id=$1', [id])).rows[0].current_stock).toBe('10.000');
    expect((await pool!.query('SELECT id FROM stock_movements WHERE item_id=$1', [id])).rows).toHaveLength(0);
  });
  it('expone el costo como desconocido si falta equivalencia y admite una equivalencia explícita', async () => {
    await pool!.query("UPDATE treatment_supplies SET unit='caja',quantity=2 WHERE id=$1", [id]);
    const missing = await (await request('GET', `/api/spa/treatments/${id}/supplies`)).json();
    expect(missing[0].estimatedCost).toBeNull();
    expect(missing[0].costWarning).toContain('Falta equivalencia');
    await pool!.query("INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES($1,'caja',3)", [id]);
    const configured = await (await request('GET', `/api/spa/treatments/${id}/supplies`)).json();
    expect(configured[0].estimatedCost).toBe(120000);
    expect((await pool!.query('SELECT current_stock::text FROM inventory_items WHERE id=$1', [id])).rows[0].current_stock).toBe('10.000');
  });
  it('no consume parcialmente: conserva pendientes y reintenta todos los insumos una sola vez', async () => {
    const second = id + '-second';
    await pool!.query("UPDATE treatment_supplies SET unit='ml',quantity=50 WHERE id=$1", [id]);
    await pool!.query("INSERT INTO spa_accounts(id,appointment_id,guest_name,status,opened_at) VALUES($1,$1,'PRUEBA','open',now())", [id]);
    await pool!.query("INSERT INTO inventory_items(id,name,unit,current_stock,cost_price,is_active) VALUES($1,'Segundo insumo','unidad',0,100,'true')", [second]);
    await pool!.query("UPDATE inventory_items SET is_active='true' WHERE id=$1", [id]);
    await pool!.query("INSERT INTO treatment_supplies(id,treatment_id,inventory_item_id,quantity,unit) VALUES($1,$2,$1,1,'unidad')", [second, id]);
    await pool!.query("INSERT INTO inventory_warehouses(id,name,is_active) VALUES($1,'SPA Prueba','true')", [id]);
    for (const [item, qty] of [[id, 10], [second, 0]] as const) {
      await pool!.query('INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1,$2,$3)', [item, id, qty]);
      await pool!.query("INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,to_warehouse_id,warehouse_id,created_at) VALUES($1,'transferencia',$3,0,$3,$2,$2,now())", [item, id, qty]);
    }
    const { storage } = await import('../db-storage');
    await storage.deductStockFromSpaAccount(id);
    expect((await pool!.query("SELECT id FROM stock_movements WHERE source_type='spa_account' AND source_id=$1", [id])).rows).toHaveLength(0);
    expect((await pool!.query('SELECT current_stock::text FROM inventory_items WHERE id=$1', [id])).rows[0].current_stock).toBe('10.000');
    expect((await pool!.query('SELECT status FROM inventory_consumption_jobs WHERE source_id=$1', [id])).rows[0].status).toBe('pending');
    await pool!.query('UPDATE inventory_items SET current_stock=10 WHERE id=$1', [second]);
    await pool!.query('UPDATE warehouse_stock SET current_stock=10 WHERE item_id=$1', [second]);
    await storage.deductStockFromSpaAccount(id);
    await storage.deductStockFromSpaAccount(id);
    expect((await pool!.query("SELECT id FROM stock_movements WHERE source_type='spa_account' AND source_id=$1", [id])).rows).toHaveLength(2);
    expect((await pool!.query('SELECT current_stock::text FROM inventory_items WHERE id=$1', [id])).rows[0].current_stock).toBe('9.950');
    expect((await pool!.query('SELECT current_stock::text FROM inventory_items WHERE id=$1', [second])).rows[0].current_stock).toBe('9.000');
  });
  it('rechaza modificaciones sin permiso y estados de consulta desconocidos', async () => {
    expect((await request('GET', '/api/spa/treatments?status=invalid')).status).toBe(400);
    expect((await request('PATCH', `/api/spa/treatments/${id}`, { isActive: 'invalid' })).status).toBe(400);
    expect((await request('DELETE', '/api/spa/treatments/inexistente')).status).toBe(404);
    role = 'sin-permiso-spa';
    try {
      expect((await request('PATCH', `/api/spa/treatments/${id}`, { isActive: 'false' })).status).toBe(403);
      expect((await request('DELETE', `/api/spa/treatments/${id}`)).status).toBe(403);
    } finally { role = 'admin'; }
    expect((await pool!.query('SELECT is_active FROM spa_treatments WHERE id=$1', [id])).rows[0].is_active).toBe('true');
  });
});
