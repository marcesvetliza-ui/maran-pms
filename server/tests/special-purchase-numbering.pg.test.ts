import express from 'express';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';

vi.mock('../auth', () => ({
  requireAuth: (req: any, _res: any, next: () => void) => { req.user = { role: 'admin', username: 'numbering-test' }; next(); },
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
  requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock('../audit', () => ({ audit: vi.fn() }));
const url = process.env.DATABASE_URL;
const enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === 'true';
if (enabled && (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname) || !/test/i.test(new URL(url!).pathname))) throw Error('Use a disposable local test database');
const pool = enabled ? new pg.Pool({ connectionString: url }) : null;

describe.skipIf(!enabled)('PV y número en registros administrativos', () => {
  let server: Server, base: string, supplierId: number, companyId: string, before: any;
  const createdAccounts: number[] = [];
  let sequence = 100;
  const number = () => String(++sequence);
  const counts = async () => (await pool!.query('SELECT (SELECT count(*) FROM cash_movements) cash,(SELECT count(*) FROM account_movements) cc,(SELECT count(*) FROM accounting_entries) ledger,(SELECT count(*) FROM stock_movements) stock')).rows[0];

  beforeAll(async () => {
    const accountIds: Record<string, number> = {};
    for (const code of ['4.2.1.08.18', '4.2.1.08.05.02', '1.1.4.01.04.01']) {
      const existing = await pool!.query('SELECT id FROM accounting_accounts WHERE codigo=$1 AND activo=true', [code]);
      if (existing.rows.length) accountIds[code] = existing.rows[0].id;
      else {
        const row = await pool!.query("INSERT INTO accounting_accounts(codigo,nombre,tipo,activo) VALUES($1,'Prueba numeración',$2,true) RETURNING id", [code, code.startsWith('1.') ? 'activo' : 'egreso']);
        accountIds[code] = row.rows[0].id; createdAccounts.push(row.rows[0].id);
      }
    }
    const suffix = randomUUID();
    supplierId = (await pool!.query("INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva,cuenta_contable_id) VALUES($1,$2,'responsable_inscripto',$3) RETURNING id", ['Numeración ' + suffix, suffix, accountIds['4.2.1.08.18']])).rows[0].id;
    companyId = (await pool!.query('INSERT INTO companies(razon_social,cuil_cuit) VALUES($1,$2) RETURNING id', ['Agente ' + suffix, suffix])).rows[0].id;
    const { verifyFinancialSchema } = await import('../migrate'); await verifyFinancialSchema();
    const { registerRoutes } = await import('../routes');
    const app = express(); app.use(express.json()); server = createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    before = await counts();
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      if (pool && supplierId) {
        expect(await counts()).toEqual(before);
      }
    } finally {
      if (pool) {
        const own = (await pool.query('SELECT id FROM purchase_invoices WHERE supplier_id=$1 OR special_details->>\'issuerId\'=$2', [supplierId || 0, companyId || ''])).rows.map(row => row.id);
        if (own.length) {
          await pool.query("DELETE FROM audit_logs WHERE entity_type='special_purchase' AND entity_id=ANY($1::text[])", [own.map(String)]);
          await pool.query('DELETE FROM purchase_invoice_lines WHERE invoice_id=ANY($1::int[])', [own]);
          await pool.query('DELETE FROM purchase_invoices WHERE id=ANY($1::int[])', [own]);
        }
        if (supplierId) await pool.query('DELETE FROM accounting_suppliers WHERE id=$1', [supplierId]);
        if (companyId) await pool.query('DELETE FROM companies WHERE id=$1', [companyId]);
        if (createdAccounts.length) await pool.query('DELETE FROM accounting_accounts WHERE id=ANY($1::int[])', [createdAccounts]);
        await pool.end();
      }
      const { pool: appPool } = await import('../db'); await appPool.end();
    }
  });

  function payload(tipo = 'RESUMEN-BANCO', point: unknown = '00024', numero = number()) {
    return { tipoComprobante: tipo, puntoVenta: point, numeroComprobante: numero, fechaEmision: '2026-11-16', specialDetails: tipo === 'RETENCION'
      ? { version: 1, issuerType: 'company', issuerId: companyId, subtipo: 'iva', importe: 100 }
      : { version: 1, issuerType: 'supplier', issuerId: String(supplierId), neto21: 100 } };
  }
  async function request(path: string, body?: unknown) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }

  it.each(['RESUMEN-BANCO', 'LIQ-TARJETA', 'RETENCION'])('persiste y devuelve la referencia completa de %s', async tipo => {
    const input = payload(tipo);
    const result = await request('/api/purchase-invoices', input);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    const expected = { punto_venta: '00024', numero_comprobante: input.numeroComprobante, numero_comprobante_ext: `00024-${input.numeroComprobante.padStart(8, '0')}`, estado: 'registrado', asiento_id: null, saldo_pendiente: '0.00' };
    expect(result.body).toMatchObject(expected);
    const detail = await request(`/api/purchase-invoices/${result.body.id}`);
    expect(detail.status).toBe(200); expect(detail.body).toMatchObject(expected);
  });

  it('permite igual número en dos puntos conocidos y bloquea variantes con ceros iniciales', async () => {
    const input = payload();
    expect((await request('/api/purchase-invoices', input)).status).toBe(201);
    expect((await request('/api/purchase-invoices', { ...input, puntoVenta: '24', numeroComprobante: input.numeroComprobante.padStart(8, '0') })).status).toBe(409);
    expect((await request('/api/purchase-invoices', { ...input, puntoVenta: '00025' })).status).toBe(201);
  });

  it('serializa dos cargas simultáneas de la misma serie sin duplicar el documento', async () => {
    const input = payload();
    const results = await Promise.all([request('/api/purchase-invoices', input), request('/api/purchase-invoices', { ...input, puntoVenta: 24, numeroComprobante: input.numeroComprobante.padStart(8, '0') })]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
  });

  it('conserva un número anterior sin PV y requiere revisar su serie antes de repetirlo', async () => {
    const input = payload('RESUMEN-BANCO', undefined);
    delete (input as any).puntoVenta;
    const old = await request('/api/purchase-invoices', input); expect(old.status).toBe(201);
    expect(old.body).toMatchObject({ punto_venta: null, numero_comprobante_ext: null });
    expect((await request('/api/purchase-invoices', { ...input, puntoVenta: '00001' })).status).toBe(409);
    const row = (await pool!.query('SELECT punto_venta,numero_comprobante,numero_comprobante_ext FROM purchase_invoices WHERE id=$1', [old.body.id])).rows[0];
    expect(row).toEqual({ punto_venta: null, numero_comprobante: input.numeroComprobante, numero_comprobante_ext: null });
  });

  it('reconoce un número completo histórico sin reescribirlo', async () => {
    const ownNumber = number(), input = payload('RESUMEN-BANCO', undefined, '00013-' + ownNumber.padStart(8, '0'));
    delete (input as any).puntoVenta;
    const old = await request('/api/purchase-invoices', input); expect(old.status).toBe(201);
    expect((await request('/api/purchase-invoices', { ...input, puntoVenta: '13', numeroComprobante: ownNumber })).status).toBe(409);
    expect((await request('/api/purchase-invoices', { ...input, puntoVenta: '14', numeroComprobante: ownNumber })).status).toBe(201);
    expect((await request(`/api/purchase-invoices/${old.body.id}`)).body.numero_comprobante).toBe(input.numeroComprobante);
  });

  it('conserva PV y referencia alfanumérica desde el formulario compatible anterior', async () => {
    const ownNumber = 'LIQ-' + number();
    const old = await request('/api/purchase-invoices', { tipoComprobante: 'LIQ-TARJETA', supplierId, puntoVenta: '00024', numeroComprobante: ownNumber, fechaEmision: '2026-11-16', montoNeto: '100' });
    expect(old.status, JSON.stringify(old.body)).toBe(201);
    expect(old.body).toMatchObject({ punto_venta: '00024', numero_comprobante: ownNumber, numero_comprobante_ext: '00024-' + ownNumber });
    expect((await request('/api/purchase-invoices', payload('LIQ-TARJETA', '24', ownNumber))).status).toBe(409);
  });

  it.each(['ABCDE', '123456', '-1', '1.5', true])('rechaza el PV inválido %s sin crear el registro', async point => {
    const input = payload('RESUMEN-BANCO', point);
    expect((await request('/api/purchase-invoices', input)).status).toBe(400);
    expect((await pool!.query('SELECT id FROM purchase_invoices WHERE supplier_id=$1 AND numero_comprobante=$2', [supplierId, input.numeroComprobante])).rows).toHaveLength(0);
  });
});
