import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
const source = vi.hoisted(() => ({ list: vi.fn(), month: vi.fn() }));
vi.mock('../ccInvoiceTracking', () => ({ getCcInvoiceTrackingList: source.list, getCcInvoiceTrackingMonthReport: source.month }));
vi.mock('../auth', () => ({
  requireAuth: (req: any, res: any, next: any) => req.headers['x-test-user'] ? next() : res.status(401).json({ error: 'Login required' }),
  requirePermission: (key: string) => (req: any, res: any, next: any) => key === 'sidebar:/admin/cuentas' && req.headers['x-test-access'] === 'yes' ? next() : res.status(403).json({ error: 'Forbidden' }),
}));
import { ccTrackingListReport, ccTrackingMonthReport, ccTrackingWorkbook, ccTrackingPdf, registerCcTrackingReportRoutes } from '../ccTrackingReport';
const observation = 'Observación de gestión completa. '.repeat(250) + 'FIN OBSERVACIÓN';
const common = { fecha: '2026-11-19', entityType: 'company', entityId: 'synthetic-company', entityName: 'Empresa de prueba', numeroFactura: '00005-00000252', tipoComprobante: 'FA', motivo: 'Huésped de prueba · Habitación 307', referencia: 'RES-SYNTHETIC', conceptos: 'Alojamiento', estado: 'pagada', observaciones: observation, updatedAt: null };
const rows: any[] = [
  { ...common, salesInvoiceId: 1, documentStatus: 'facturada', monto: 630000, importeFacturado: 585000, importeSinFactura: 0, saldoPendiente: 100000 },
  { ...common, salesInvoiceId: 0, documentStatus: 'sin_factura', monto: 108500, importeFacturado: 0, importeSinFactura: 108500, saldoPendiente: 100000 },
  { ...common, salesInvoiceId: 0, documentStatus: 'manual', monto: 90000, amountPending: true, saldoPendiente: 0 },
  { ...common, salesInvoiceId: 2, documentStatus: 'facturada', monto: 20000, importeFacturado: 20000, saldoPendiente: null },
  { ...common, salesInvoiceId: 3, documentStatus: 'facturada', entityName: '=HYPERLINK("https://example.invalid","Texto")', monto: 500, importeFacturado: 500, saldoPendiente: 0, observaciones: 'Importe efectivamente cancelado' },
];
const summary: any = { totalFacturado: 605500, totalSinFactura: 108500, totalSaldoPendiente: 200000, totalGestionesManuales: 1, saldosSinVerificar: 1, totalFacturas: 3, porEstado: [{ estado: 'pagada', cantidad: 3, monto: 605500 }, { estado: 'pendiente', cantidad: 0, monto: 0 }], porEmpresa: [{ entityType: 'company', entityId: 'synthetic-company', entityName: 'Empresa de prueba', cantidad: 3, monto: 605500 }] };
let server: ReturnType<ReturnType<typeof express>['listen']>, base: string;
beforeAll(async () => { const app = express(); registerCcTrackingReportRoutes(app); server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as any).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { source.list.mockReset().mockResolvedValue(rows); source.month.mockReset().mockResolvedValue(summary); });
const get = (path: string, headers: Record<string, string> = { 'x-test-user': 'reader', 'x-test-access': 'yes' }) => fetch(base + path, { headers });

it('exports real numeric amounts, net credit notes, administrative states, unknown balances and manual follow-ups without changing debt', async () => {
  const report = ccTrackingListReport(rows, { from: '2026-11-01', search: 'Empresa & prueba' });
  const bytes = await ccTrackingWorkbook(report), wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as any);
  const sheet = wb.getWorksheet('Listado')!;
  expect(sheet.rowCount).toBe(6); expect(sheet.getCell('J2').value).toBe(585000); expect(sheet.getCell('L2').value).toBe(100000);
  expect(sheet.getCell('M2').value).toBe('Pagada'); expect(sheet.getCell('O2').value).toBe(observation);
  expect(sheet.getCell('I4').value).toBeNull(); expect(sheet.getCell('L4').value).toBeNull(); expect(sheet.getCell('Q4').value).toBe('No suma deuda');
  expect(sheet.getCell('L5').value).toBeNull(); expect(sheet.getCell('Q5').value).toBe('Sin verificar');
  expect(sheet.getCell('L6').value).toBe(0); expect(sheet.getCell('B6').type).toBe(ExcelJS.ValueType.String);
  expect(sheet.getCell('B6').value).toBe(rows[4].entityName); expect(sheet.autoFilter).toBeTruthy(); expect(sheet.views[0].state).toBe('frozen');
  expect(report.summary.map(r => r[1])).toEqual([605500, 108500, 200000, 1, 1]);
  if (process.env.CC_REPORT_TEST_ARTIFACT_DIR) { await mkdir(process.env.CC_REPORT_TEST_ARTIFACT_DIR, { recursive: true }); await writeFile(process.env.CC_REPORT_TEST_ARTIFACT_DIR + '/listado.xlsx', bytes); }
});
it('exports the monthly totals and both breakdowns from the same monthly summary', async () => {
  const report = ccTrackingMonthReport(summary, 2026, 11), bytes = await ccTrackingWorkbook(report), wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as any);
  expect(report.summary.map(r => r[1])).toEqual([605500, 108500, 200000, 1, 1, 3]);
  expect(wb.getWorksheet('Por estado')!.rowCount).toBe(2); expect(wb.getWorksheet('Por estado')!.getCell('C2').value).toBe(605500);
  expect(wb.getWorksheet('Por empresa y agencia')!.getCell('D2').value).toBe(605500);
  if (process.env.CC_REPORT_TEST_ARTIFACT_DIR) await writeFile(process.env.CC_REPORT_TEST_ARTIFACT_DIR + '/mensual.xlsx', bytes);
});
it('generates a paginated PDF even when one observation spans several pages', async () => {
  const bytes = await ccTrackingPdf(ccTrackingListReport(rows, { search: 'Empresa de prueba' }));
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect((bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(3);
  expect(bytes.subarray(-20).toString()).toContain('%%EOF');
  if (process.env.CC_REPORT_TEST_ARTIFACT_DIR) { await writeFile(process.env.CC_REPORT_TEST_ARTIFACT_DIR + '/listado.pdf', bytes); await writeFile(process.env.CC_REPORT_TEST_ARTIFACT_DIR + '/mensual.pdf', await ccTrackingPdf(ccTrackingMonthReport(summary, 2026, 11))); await writeFile(process.env.CC_REPORT_TEST_ARTIFACT_DIR + '/listado-corto.pdf', await ccTrackingPdf(ccTrackingListReport(rows.map(r => ({...r, observaciones:'Se envió el detalle a la empresa. Pendiente de confirmación de pago.'})), {from:'2026-11-01',to:'2026-11-30'}))); }
});
it.each(['pdf', 'xlsx'])('downloads %s with every list filter and attachment headers', async format => {
  const params = new URLSearchParams({ format, from: '2026-11-01', to: '2026-11-30', estado: 'pagada', documentStatus: 'facturada', search: 'Empresa & prueba', entityType: 'company', entityId: 'synthetic-company' });
  const response = await get('/api/cc-invoice-tracking/export?' + params);
  expect(response.status).toBe(200); expect(response.headers.get('content-disposition')).toContain(`seguimiento-cc-2026-11-01-2026-11-30.${format}`); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(source.list).toHaveBeenCalledExactlyOnceWith({ from: '2026-11-01', to: '2026-11-30', estado: 'pagada', documentStatus: 'facturada', search: 'Empresa & prueba', entityType: 'company', entityId: 'synthetic-company' });
  expect(source.month).not.toHaveBeenCalled(); await response.arrayBuffer();
});
it.each(['pdf', 'xlsx'])('downloads the chosen monthly report as %s', async format => {
  const response = await get(`/api/cc-invoice-tracking/month/2026/11/export?format=${format}`);
  expect(response.status).toBe(200); expect(source.month).toHaveBeenCalledExactlyOnceWith(2026, 11); expect(source.list).not.toHaveBeenCalled();
  expect(response.headers.get('content-disposition')).toContain(`mensual-2026-11.${format}`); await response.arrayBuffer();
});
it.each(['/export?format=csv', '/export?format=pdf&from=2026-02-30', '/export?format=pdf&from=2026-12-01&to=2026-11-01', '/export?format=xlsx&documentStatus=unknown', '/month/2026/13/export?format=pdf', '/month/2026x/11/export?format=pdf'])('rejects invalid report parameters before reading data: %s', async path => {
  const response = await get('/api/cc-invoice-tracking' + path); expect(response.status).toBe(400); expect(source.list).not.toHaveBeenCalled(); expect(source.month).not.toHaveBeenCalled();
});
it.each([['/export?format=pdf', {}, 401], ['/month/2026/11/export?format=xlsx', { 'x-test-user': 'reader' }, 403]])('requires account access for downloads', async (path, headers, status) => {
  expect((await get(String('/api/cc-invoice-tracking' + path), headers as any)).status).toBe(status); expect(source.list).not.toHaveBeenCalled(); expect(source.month).not.toHaveBeenCalled();
});
it('returns an error rather than an empty financial report when the query fails', async () => {
  source.list.mockRejectedValue(new Error('Synthetic query failure')); const response = await get('/api/cc-invoice-tracking/export?format=xlsx');
  expect(response.status).toBe(500); expect(response.headers.get('content-type')).toContain('application/json'); expect(response.headers.get('content-disposition')).toBeNull();
});
