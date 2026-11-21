import type { Express } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { requireAuth, requirePermission } from './auth';
import { getCcInvoiceTrackingList, getCcInvoiceTrackingMonthReport, type CcInvoiceTrackingFilters, type CcInvoiceTrackingRow, type CcInvoiceTrackingMonthSummary } from './ccInvoiceTracking';
import { formatArgentinaDate, formatArgentinaDateTime } from './utils/argentinaDateTime';

const states: Record<string, string> = { pendiente: 'Pendiente', enviada: 'Enviada', reclamada: 'Reclamada', pagada: 'Pagada', cargada_extranet: 'Cargada a Extranet' };
const documents: Record<string, string> = { facturada: 'Con factura vinculada', facturacion_parcial: 'Facturación parcial', sin_factura: 'Sin factura vinculada', factura_anulada: 'Factura anulada · revisar cargo', revision_vinculo: 'Vínculo documental a revisar', manual: 'Gestión manual · no suma deuda' };
const note = 'Los estados y observaciones son de gestión: no modifican saldos ni emiten comprobantes. Las gestiones manuales libres no suman deuda. Un saldo sin verificar no se considera cero ni se presume impago.';
type Value = string | number | null;
type Section = { name: string; headers: string[]; rows: Value[][]; moneyColumns: number[]; widths?: number[] };
export type CcTrackingReport = { title: string; scope: string[]; summary: Array<[string, Value]>; sections: Section[]; pdfSections?: Section[] };
const amount = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => value ? formatArgentinaDate(value.slice(0, 10)) : '';

function summaryRows(billed: number, unbilled: number, pending: number, unknown: number, manual: number): Array<[string, Value]> {
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return [['Facturado vigente (neto de NC)', round(billed)], ['Cargos sin factura vinculada', round(unbilled)], ['Saldo de cargos según imputaciones', round(pending)], ['Facturas sin saldo verificable', unknown], ['Gestiones manuales libres (no suman deuda)', manual]];
}
export function ccTrackingListReport(rows: CcInvoiceTrackingRow[], filters: CcInvoiceTrackingFilters): CcTrackingReport {
  const billed = rows.filter(r => ['facturada', 'facturacion_parcial'].includes(r.documentStatus || '')).reduce((s, r) => s + (r.importeFacturado ?? r.monto), 0);
  const summary = summaryRows(billed, rows.reduce((s, r) => s + (r.importeSinFactura ?? 0), 0), rows.reduce((s, r) => s + (r.saldoPendiente ?? 0), 0), rows.filter(r => r.documentStatus !== 'manual' && r.saldoPendiente == null).length, rows.filter(r => r.documentStatus === 'manual').length);
  const values = rows.map(r => {
    const manual = r.documentStatus === 'manual';
    const observations = [r.observaciones, ...(r.gestionAdicional || []).map(g => `Gestión adicional: ${states[g.estado] || g.estado}${g.observaciones ? ' · ' + g.observaciones : ''}`)].filter(Boolean).join('\n');
    return [date(r.fecha), r.entityName, manual ? 'Gestión manual' : r.entityType === 'agency' ? 'Agencia' : 'Empresa', documents[r.documentStatus || 'facturada'], `${r.tipoComprobante} ${r.numeroFactura}`.trim(), r.motivo || '', r.referencia || '', r.conceptos || '', r.amountPending ? null : r.monto, manual ? null : r.importeFacturado ?? 0, manual ? null : r.importeSinFactura ?? 0, manual ? null : r.saldoPendiente ?? null, states[r.estado] || r.estado, r.motivoGestion || '', observations, r.amountPending ? 'Pendiente de liquidación' : 'Conocido', manual ? 'No suma deuda' : r.saldoPendiente == null ? 'Sin verificar' : 'Verificado'] as Value[];
  });
  const list: Section = { name: 'Listado', headers: ['Fecha', 'Empresa / agencia', 'Tipo de entidad', 'Situación documental', 'Comprobante', 'Referencia de estadía', 'Referencia de operación', 'Conceptos', 'Importe conocido', 'Facturado vigente', 'Sin factura vinculada', 'Saldo pendiente', 'Estado de gestión', 'Motivo de gestión', 'Observaciones', 'Estado del importe', 'Situación del saldo'], rows: values, moneyColumns: [8, 9, 10, 11] };
  const pdf: Section = { name: 'Listado', headers: ['Fecha', 'Empresa / agencia', 'Documento', 'Referencias y observaciones', 'Importe conocido', 'Facturado vigente', 'Sin factura', 'Saldo pendiente', 'Gestión'], widths: [50, 115, 125, 170, 65, 65, 65, 65, 65], moneyColumns: [4, 5, 6, 7], rows: values.map((v, i) => [v[0], `${v[1]}\n${v[2]}`, `${v[4]}\n${v[3]}`, [v[5], v[6], v[7], v[13] && `Motivo: ${v[13]}`, v[14] && `Observaciones: ${v[14]}`].filter(Boolean).join('\n'), rows[i].amountPending ? 'Pendiente de liquidación' : v[8], v[9], v[10], rows[i].documentStatus === 'manual' ? 'No suma deuda' : v[11] ?? 'Sin verificar', v[12]]) };
  return { title: 'Seguimiento de cuentas corrientes', scope: [`Desde: ${filters.from ? date(filters.from) : 'sin límite'} · Hasta: ${filters.to ? date(filters.to) : 'sin límite'}`, `Estado: ${states[filters.estado || ''] || 'Todos los estados'} · Situación documental: ${documents[filters.documentStatus || ''] || 'Todas'}`, `Búsqueda: ${filters.search || 'sin filtro'} · ${rows.length} registro(s)`, ...(filters.entityType || filters.entityId ? [`Entidad: ${filters.entityType || 'Todas'} ${filters.entityId || ''}`] : [])], summary, sections: [list], pdfSections: [pdf] };
}
export function ccTrackingMonthReport(data: CcInvoiceTrackingMonthSummary, year: number, month: number): CcTrackingReport {
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { title: 'Seguimiento de cuentas corrientes · Informe mensual', scope: [label], summary: [...summaryRows(data.totalFacturado, data.totalSinFactura || 0, data.totalSaldoPendiente || 0, data.saldosSinVerificar || 0, data.totalGestionesManuales || 0), ['Cantidad de facturas', data.totalFacturas]], sections: [
    { name: 'Por estado', headers: ['Estado de gestión', 'Facturas', 'Facturado vigente'], moneyColumns: [2], rows: data.porEstado.filter(r => r.cantidad > 0).map(r => [states[r.estado] || r.estado, r.cantidad, r.monto]) },
    { name: 'Por empresa y agencia', headers: ['Empresa / agencia', 'Tipo de entidad', 'Facturas', 'Facturado vigente'], moneyColumns: [3], rows: data.porEmpresa.map(r => [r.entityName, r.entityType === 'agency' ? 'Agencia' : 'Empresa', r.cantidad, r.monto]) },
  ] };
}

export async function ccTrackingWorkbook(report: CcTrackingReport) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Maran Suites & Towers';
  const summary = wb.addWorksheet('Resumen');
  summary.addRow([report.title]); report.scope.forEach(line => summary.addRow([line]));
  summary.addRow([`Generado: ${formatArgentinaDateTime(new Date())} (Argentina)`]); summary.addRow([]);
  report.summary.forEach(([label, value], index) => { const row = summary.addRow([label, value]); if (index < 3) row.getCell(2).numFmt = '#,##0.00'; });
  summary.addRow([]); summary.addRow([note]); summary.getColumn(1).width = 80; summary.getColumn(2).width = 25; summary.getColumn(1).alignment = { wrapText: true }; summary.getRow(summary.rowCount).height = 65;
  for (const section of report.sections) {
    const sheet = wb.addWorksheet(section.name, { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' } });
    sheet.addRow(section.headers); section.rows.forEach(values => sheet.addRow(values));
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: section.headers.length } };
    sheet.columns.forEach((col, index) => { col.width = section.moneyColumns.includes(index) ? 21 : /Empresa|Referencia|Conceptos|Observaciones|Motivo/.test(section.headers[index]) ? 45 : 28; col.alignment = { vertical: 'top', wrapText: true }; if (section.moneyColumns.includes(index)) col.numFmt = '#,##0.00'; });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174A77' } }; sheet.getRow(1).height = 30;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Split tall table rows across pages, retaining every observation and repeating
 * column headings. No ellipsis or fixed-height text boxes hide report content. */
export function ccTrackingPdf(report: CcTrackingReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
    const chunks: Buffer[] = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try {
      const width = doc.page.width - 56, bottom = doc.page.height - 42, lineHeight = 10; let y = 28;
      const wrap = (value: Value, w: number): string[] => {
        const lines: string[] = [];
        for (const paragraph of String(value ?? '').split('\n')) {
          let line = '';
          for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (line && doc.widthOfString(line + ' ' + word) > w) { lines.push(line); line = ''; }
            if (doc.widthOfString(word) > w) { for (const char of word) { if (line && doc.widthOfString(line + char) > w) { lines.push(line); line = ''; } line += char; } }
            else line = line ? line + ' ' + word : word;
          }
          lines.push(line);
        }
        return lines;
      };
      const header = () => {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#174A77').text('Maran Suites & Towers', 28, 28, { width });
        doc.fontSize(11).text(report.title, 28, 46, { width }); y = doc.y + 6;
        doc.font('Helvetica').fontSize(8).fillColor('black');
        for (const scope of report.scope) { doc.text(scope, 28, y, { width }); y = doc.y + 2; }
        y += 6;
      };
      const page = () => { doc.addPage(); header(); };
      header();
      report.summary.forEach(([label, value], index) => { doc.font('Helvetica').fontSize(9).text(`${label}: ${index < 3 && typeof value === 'number' ? amount(value) : value}`, 28, y, { width }); y = doc.y + 3; });
      doc.fontSize(8).text(note, 28, y + 3, { width }); y = doc.y + 12;
      for (const section of report.pdfSections || report.sections) {
        const widths = section.widths || section.headers.map(() => width / section.headers.length);
        const columns = () => {
          if (y > bottom - 65) page();
          doc.font('Helvetica-Bold').fontSize(9).text(section.name, 28, y, { width }); y = doc.y + 5;
          doc.fontSize(7.5); const cells = section.headers.map((h, i) => wrap(h, widths[i] - 8)); const height = Math.max(...cells.map(c => c.length)) * lineHeight + 8;
          doc.rect(28, y, width, height).fill('#174A77'); doc.fillColor('white'); let x = 32;
          cells.forEach((lines, i) => { lines.forEach((line, n) => doc.text(line, x, y + 4 + n * lineHeight, { width: widths[i] - 8, lineBreak: false })); x += widths[i]; }); y += height + 4; doc.fillColor('black');
        };
        columns();
        if (!section.rows.length) { doc.font('Helvetica').fontSize(8).text('Sin registros para los filtros elegidos.', 28, y, { width }); y = doc.y + 12; }
        for (const values of section.rows) {
          doc.font('Helvetica').fontSize(7.5);
          const cells = values.map((value, i) => wrap(section.moneyColumns.includes(i) && typeof value === 'number' ? amount(value) : value, widths[i] - 8)); const totalLines = Math.max(1, ...cells.map(c => c.length)); let offset = 0;
          while (offset < totalLines) {
            if (y > bottom - lineHeight - 5) { page(); columns(); doc.font('Helvetica').fontSize(7.5); }
            const count = Math.min(totalLines - offset, Math.max(1, Math.floor((bottom - y - 5) / lineHeight))); let x = 32;
            cells.forEach((lines, i) => { lines.slice(offset, offset + count).forEach((line, n) => doc.text(line, x, y + n * lineHeight, { width: widths[i] - 8, lineBreak: false, align: section.moneyColumns.includes(i) ? 'right' : 'left' })); x += widths[i]; });
            y += count * lineHeight + 5; offset += count;
            if (offset < totalLines) { page(); columns(); doc.font('Helvetica').fontSize(7.5); }
          }
          doc.moveTo(28, y - 2).lineTo(28 + width, y - 2).strokeColor('#dddddd').stroke();
        }
        y += 12;
      }
      const pages = doc.bufferedPageRange();
      for (let i = pages.start; i < pages.start + pages.count; i++) { doc.switchToPage(i); doc.font('Helvetica').fontSize(7).fillColor('#666666').text(`Generado ${formatArgentinaDateTime(new Date())} (Argentina) · Página ${i + 1} de ${pages.count}`, 28, doc.page.height - 38, { width, align: 'right', lineBreak: false }); }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

const querySchema = z.object({ format: z.enum(['pdf', 'xlsx']), from: z.string().date().optional(), to: z.string().date().optional(), entityType: z.enum(['company', 'agency']).optional(), entityId: z.string().max(200).optional(), estado: z.enum(['pendiente', 'enviada', 'reclamada', 'pagada', 'cargada_extranet']).optional(), search: z.string().max(2000).optional(), documentStatus: z.enum(['facturada', 'facturacion_parcial', 'sin_factura', 'factura_anulada', 'revision_vinculo', 'manual']).optional() }).strict();
export function registerCcTrackingReportRoutes(app: Express) {
  const readAccess = [requireAuth, requirePermission('sidebar:/admin/cuentas')];
  const send = async (res: import('express').Response, report: CcTrackingReport, format: 'pdf' | 'xlsx', filename: string) => {
    const bytes = format === 'pdf' ? await ccTrackingPdf(report) : await ccTrackingWorkbook(report);
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${filename}.${format}"`); res.send(bytes);
  };
  app.get('/api/cc-invoice-tracking/export', ...readAccess, async (req, res) => {
    const input = querySchema.safeParse(req.query);
    if (!input.success || input.data.from && input.data.to && input.data.from > input.data.to) return res.status(400).json({ error: 'Revisá el formato y los filtros de la descarga.' });
    try { const { format, ...filters } = input.data; const rows = await getCcInvoiceTrackingList(filters); await send(res, ccTrackingListReport(rows, filters), format, `seguimiento-cc-${filters.from || 'inicio'}-${filters.to || 'actual'}`); }
    catch { res.status(500).json({ error: 'No se pudo generar la descarga del seguimiento.' }); }
  });
  app.get('/api/cc-invoice-tracking/month/:year/:month/export', ...readAccess, async (req, res) => {
    const input = z.object({ format: z.enum(['pdf', 'xlsx']) }).strict().safeParse(req.query);
    const period = z.object({ year: z.coerce.number().int().min(1900).max(9999), month: z.coerce.number().int().min(1).max(12) }).safeParse(req.params);
    if (!input.success || !period.success) return res.status(400).json({ error: 'Revisá el mes, el año y el formato de la descarga.' });
    try { const { year, month } = period.data; const summary = await getCcInvoiceTrackingMonthReport(year, month); await send(res, ccTrackingMonthReport(summary, year, month), input.data.format, `seguimiento-cc-mensual-${year}-${String(month).padStart(2, '0')}`); }
    catch { res.status(500).json({ error: 'No se pudo generar la descarga mensual.' }); }
  });
}
