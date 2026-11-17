import { expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
vi.mock('../db', () => ({ db: { execute: vi.fn() } }));
vi.mock('../auth', () => ({ requireAuth: (req: any, res: any, next: any) => req.headers.authorization === 'test' ? next() : res.status(401).end() }));
import { db } from '../db';
import { registerReceivedRetentionReportRoutes, receivedRetentionPdf } from '../received-retention-report';
import { receivedRetentionRow } from '@shared/received-retention-report';

const certificate = { id: 1, tipo_comprobante: 'RETENCION', proveedor_nombre: 'Agente José de prueba', proveedor_cuit: '30-01234567-8', fecha_emision: '2026-11-01', created_at: '2026-11-02T12:00:00Z', numero_comprobante_ext: '00001-00000123', monto_total: '1234.56', estado: 'registrado', special_details: { subtipo: 'iibb', jurisdiction: 'Entre Ríos', period: '2026-11' } };
beforeEach(() => vi.clearAllMocks());

async function withServer(run: (url: string) => Promise<void>) {
  const app = express(); registerReceivedRetentionReportRoutes(app);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as any).port}/api/purchase-retentions/report`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
const auth = { headers: { authorization: 'test' } };

it('requiere sesión y valida antes de consultar, incluyendo parámetros duplicados', async () => withServer(async url => {
  expect((await fetch(url)).status).toBe(401);
  for (const query of ['desde=2026-02-30', 'estado=otro', 'agente[]=a', 'format=csv', 'format[]=pdf', 'page=0', 'page=1&page=2', 'inline=false', 'cuit=abc']) expect((await fetch(`${url}?${query}`, auth)).status).toBe(400);
  expect(db.execute).not.toHaveBeenCalled();
}));

it('JSON pagina 50 registros y totaliza todas las páginas; exportaciones respetan los mismos filtros y conservan CUIT/número', async () => withServer(async url => {
  vi.mocked(db.execute).mockResolvedValue({ rows: [
    ...Array.from({ length: 52 }, (_, i) => ({ ...certificate, id: i + 1 })),
    { ...certificate, id: 99, estado: 'anulado', monto_total: '50.00' },
    { ...certificate, id: 100, proveedor_nombre: 'Otro agente' },
    { ...certificate, id: 101, tipo_comprobante: 'LIQ-TARJETA' },
  ] } as any);
  const filters = '?agente=jose&desde=2026-11-01&hasta=2026-11-01&cuit=30012345678&impuesto=iibb&estado=todas';
  const response = await fetch(url + filters + '&page=2', auth), result = await response.json();
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(result).toMatchObject({ count: 53, page: 2, pageSize: 50, totals: { vigentes: 52, anuladas: 1, totalVigente: '64197.12', totalAnulado: '50.00' } });
  expect(result.rows).toHaveLength(3);
  const excel = await fetch(url + filters + '&format=xlsx&page=2', auth);
  expect(excel.headers.get('content-disposition')).toContain('attachment;');
  const bytes = Buffer.from(await excel.arrayBuffer()); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as any);
  const sheet = workbook.getWorksheet('Retenciones')!;
  expect(sheet.rowCount).toBe(57); expect(sheet.getCell('D5').value).toBe('30-01234567-8'); expect(sheet.getCell('F5').value).toBe('00001-00000123');
  expect(sheet.getCell('J5').value).toBe(1234.56); expect(sheet.autoFilter).toBeTruthy();
  expect(workbook.getWorksheet('Resumen')!.getCell('B5').value).toBe(64197.12);
  writeFileSync('/tmp/received-retentions-sample.xlsx', bytes);
  const pdf = await fetch(url + filters + '&format=pdf&inline=true', auth);
  expect(pdf.status).toBe(200); expect(pdf.headers.get('content-disposition')).toContain('inline;');
  expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
  const { PgDialect } = await import('drizzle-orm/pg-core');
  for (const [query] of vi.mocked(db.execute).mock.calls) {
    const sql = new PgDialect().sqlToQuery(query as any).sql;
    expect(sql).toMatch(/WHERE pi.tipo_comprobante='RETENCION'/); expect(sql.trim()).toMatch(/^SELECT /);
  }
}));

it('PDF repite encabezados y conserva nombres/referencias largos; también funciona sin filas', async () => {
  const rows = Array.from({ length: 110 }, (_, i) => receivedRetentionRow({ ...certificate, id: i, proveedor_nombre: 'Agente de prueba con nombre extenso ' + 'sociedad '.repeat(15) + 'FIN-AGENTE', numero_comprobante_ext: 'CERTIFICADO-' + '0123456789'.repeat(8) + '-FIN-CERTIFICADO' })!);
  const pdf = await receivedRetentionPdf(rows, { agente: 'prueba', estado: 'todas' });
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(2);
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeLessThan(30);
  writeFileSync('/tmp/received-retentions-long.pdf', pdf);
  expect((await receivedRetentionPdf([], {})).length).toBeGreaterThan(1000);
});

it('fallas de lectura devuelven error, no un reporte vacío', async () => withServer(async url => {
  vi.mocked(db.execute).mockRejectedValue(new Error('fixture db failure'));
  const response = await fetch(url, auth); expect(response.status).toBe(500); expect((await response.json()).error).toContain('No se pudo generar');
}));
