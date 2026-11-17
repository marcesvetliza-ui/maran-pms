import type { Express } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { requireAuth } from './auth';
import { formatDisplayDate } from '@shared/date-display';
import {
  retentionFilterKeys, validateRetentionFilters, receivedRetentionRow, matchesRetentionFilters,
  retentionTotals, retentionFilterSummary, retentionMoney, type RetentionFilters, type ReceivedRetentionRow,
} from '@shared/received-retention-report';

const note = 'Retenciones recibidas cargadas en el PMS. Importes en ARS. Las anuladas se muestran por separado y no suman al total vigente. No sustituye la consulta de ARCA.';
const headers = ['Emisión', 'Carga', 'Agente de retención', 'CUIT', 'Impuesto', 'Certificado', 'Jurisdicción', 'Período', 'Estado', 'Importe ARS'];
const values = (row: ReceivedRetentionRow) => [formatDisplayDate(row.fecha), formatDisplayDate(row.carga), row.agente, row.cuit, row.impuestoLabel, row.certificado, row.jurisdiccion, row.periodo, row.estado, Number(row.importe)];

export async function receivedRetentionWorkbook(rows: ReceivedRetentionRow[], filters: RetentionFilters) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Maran PMS';
  const sheet = workbook.addWorksheet('Retenciones', { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' } });
  sheet.addRow(['Retenciones recibidas — Maran PMS']);
  sheet.addRow([retentionFilterSummary(filters)]);
  sheet.addRow([note]);
  sheet.addRow(headers);
  for (let row = 1; row <= 3; row++) sheet.mergeCells(row, 1, row, headers.length);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.getRow(2).height = 44; sheet.getRow(3).height = 30;
  sheet.getRow(2).alignment = sheet.getRow(3).alignment = { wrapText: true, vertical: 'middle' };
  const widths = [14, 14, 40, 20, 18, 28, 24, 14, 16, 22];
  sheet.columns.forEach((column, i) => { column.width = widths[i]; });
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174A77' } };
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  for (const row of rows) {
    const added = sheet.addRow(values(row));
    added.alignment = { wrapText: true, vertical: 'top' };
    added.getCell(4).numFmt = '@'; added.getCell(6).numFmt = '@'; added.getCell(10).numFmt = '#,##0.00';
    if (row.estado === 'anulado') added.font = { color: { argb: 'FF9B2C2C' } };
  }
  const totals = retentionTotals(rows);
  const summary = workbook.addWorksheet('Resumen');
  summary.addRows([
    ['Retenciones recibidas'], ['Filtros', retentionFilterSummary(filters)], ['Registros filtrados', rows.length],
    ['Vigentes', totals.vigentes], ['Total vigente ARS', Number(totals.totalVigente)],
    ['Anuladas', totals.anuladas], ['Total anulado ARS (excluido)', Number(totals.totalAnulado)], ['Alcance', note],
  ]);
  summary.getColumn(1).width = 38; summary.getColumn(2).width = 100;
  summary.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; summary.getRow(2).height = 60;
  for (const row of [5, 7]) summary.getCell(row, 2).numFmt = '#,##0.00';
  return workbook.xlsx.writeBuffer();
}

export function receivedRetentionPdf(rows: ReceivedRetentionRow[], filters: RetentionFilters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const width = doc.page.width - 56, bottom = doc.page.height - 58;
    const widths = [68, 174, 82, 64, 112, 96, 62, width - 658];
    const tableHeaders = ['Emisión / carga', 'Agente de retención', 'CUIT', 'Impuesto', 'Certificado', 'Jurisdicción / período', 'Estado', 'Importe ARS'];
    let y = 28;
    const tableRow = (cells: string[], header = false) => {
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8 : 8.5);
      const height = Math.max(24, ...cells.map((cell, i) => doc.heightOfString(cell || '—', { width: widths[i] - 10 }))) + 8;
      if (!header && y + height > bottom) { doc.addPage(); heading(); }
      if (header) doc.rect(28, y - 3, width, height).fill('#EDF2F7').fillColor('#111111');
      let x = 28;
      cells.forEach((cell, i) => {
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8 : 8.5)
          .text(cell || '—', x + 4, y, { width: widths[i] - 10, align: i === 7 ? 'right' : 'left' });
        x += widths[i];
      });
      y += height;
      doc.moveTo(28, y - 3).lineTo(28 + width, y - 3).strokeColor('#DCE1E7').stroke();
    };
    const heading = () => {
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(15).text('Retenciones recibidas — Maran PMS', 28, 28);
      doc.font('Helvetica').fontSize(8).text(retentionFilterSummary(filters), 28, 50, { width });
      y = doc.y + 12;
      tableRow(tableHeaders, true);
    };
    heading();
    for (const row of rows) tableRow([
      `${formatDisplayDate(row.fecha)}\n${formatDisplayDate(row.carga)}`,
      row.agente, row.cuit, row.impuestoLabel, row.certificado,
      [row.jurisdiccion, row.periodo].filter(Boolean).join('\n'), row.estado, retentionMoney(row.importe),
    ]);
    if (!rows.length) { doc.font('Helvetica').fontSize(10).text('No hay retenciones para este filtrado.', 32, y + 10); y += 35; }
    if (y + 95 > bottom) { doc.addPage(); heading(); }
    const totals = retentionTotals(rows);
    doc.font('Helvetica-Bold').fontSize(11).text(`${rows.length} registros · ${totals.vigentes} vigentes · Total vigente ARS ${retentionMoney(totals.totalVigente)}`, 28, y + 12, { width });
    doc.font('Helvetica').fontSize(9).text(`${totals.anuladas} anuladas · Total anulado ARS ${retentionMoney(totals.totalAnulado)} (excluido)`, { width });
    doc.fontSize(8).text(note, 28, doc.y + 10, { width });
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.font('Helvetica').fontSize(8).text(`Página ${i + 1} de ${pages.count}`, 28, doc.page.height - 44, { width, align: 'right', lineBreak: false }); }
    doc.end();
  });
}

export function registerReceivedRetentionReportRoutes(app: Express) {
  app.get('/api/purchase-retentions/report', requireAuth, async (req, res) => {
    const filters: RetentionFilters = {};
    try {
      for (const key of retentionFilterKeys) {
        if (req.query[key] !== undefined) {
          if (typeof req.query[key] !== 'string') throw new Error('Los filtros no son válidos.');
          filters[key] = (req.query[key] as string).trim();
        }
      }
      validateRetentionFilters(filters);
      if (req.query.format !== undefined && (typeof req.query.format !== 'string' || !['json', 'pdf', 'xlsx'].includes(req.query.format))) throw new Error('Formato inválido.');
      if (req.query.inline !== undefined && req.query.inline !== 'true') throw new Error('Opción de impresión inválida.');
      if (req.query.page !== undefined && (typeof req.query.page !== 'string' || !/^[1-9]\d{0,6}$/.test(req.query.page))) throw new Error('Página inválida.');
    } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    try {
      // Only received-retention certificates. Never supplier OP withholdings or card settlements.
      const result = await db.execute(sql`SELECT pi.id, pi.tipo_comprobante, pi.proveedor_nombre, pi.proveedor_cuit,
        pi.punto_venta, pi.numero_comprobante, pi.numero_comprobante_ext, pi.fecha_emision::text AS fecha_emision,
        pi.created_at, pi.periodo, pi.subtipo_retencion, pi.special_details, pi.estado, pi.monto_total,
        s.razon_social AS supplier_nombre, s.cuit AS supplier_cuit
        FROM purchase_invoices pi LEFT JOIN accounting_suppliers s ON s.id=pi.supplier_id
        WHERE pi.tipo_comprobante='RETENCION' ORDER BY pi.fecha_emision DESC, pi.id DESC`);
      const rows = result.rows.map(receivedRetentionRow).filter((row): row is ReceivedRetentionRow => row !== null && matchesRetentionFilters(row, filters));
      res.setHeader('Cache-Control', 'private, no-store');
      const format = req.query.format || 'json';
      if (format === 'json') {
        const pageSize = 50, pages = Math.max(1, Math.ceil(rows.length / pageSize));
        const page = Math.min(Number(req.query.page || 1), pages);
        return res.json({ rows: rows.slice((page - 1) * pageSize, page * pageSize), count: rows.length, page, pageSize, totals: retentionTotals(rows) });
      }
      const buffer = format === 'xlsx' ? await receivedRetentionWorkbook(rows, filters) : await receivedRetentionPdf(rows, filters);
      res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
      res.setHeader('Content-Disposition', `${format === 'pdf' && req.query.inline === 'true' ? 'inline' : 'attachment'}; filename="retenciones-recibidas-${filters.desde || 'inicio'}-${filters.hasta || 'actual'}.${format}"`);
      return res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('[received-retention-report] No se pudo generar el informe', error instanceof Error ? error.name : 'Error');
      return res.status(500).json({ error: 'No se pudo generar el informe de retenciones. Intentá nuevamente.' });
    }
  });
}
