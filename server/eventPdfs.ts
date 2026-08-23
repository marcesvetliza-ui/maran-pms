import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { EventWithDetails } from "@shared/schema";
import { assetPath } from "./utils/assetPath";

const HOTEL_NAME    = "Maran Suites & Towers";
const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE   = "+54 (0343) 503-8070";
const HOTEL_EMAIL   = "recepcion@maran.com.ar";
const HOTEL_CUIT    = "33-68110008-9";
const HOTEL_WEB     = "MARAN.COM.AR";
const NAVY          = "#1a3a6c";
const ORANGE        = "#e8841a";
const FOOTER_BG     = "#8b4513";

function pdfBrandedHeader(doc: InstanceType<typeof PDFDocument>, pageW: number, subtitle: string) {
  const headerH = 148;
  const headerImgPath = path.join(process.cwd(), "server", "assets", "confirmacion-header.jpg");
  if (fs.existsSync(headerImgPath)) {
    doc.image(headerImgPath, 0, 0, { width: pageW, height: headerH, cover: [pageW, headerH] });
  } else {
    doc.rect(0, 0, pageW, headerH).fill(NAVY);
  }
  doc.rect(0, headerH, pageW, 5).fill(ORANGE);
  return headerH + 5;
}

function pdfBrandedFooter(doc: InstanceType<typeof PDFDocument>, pageW: number, pageH: number, margin: number, contentW: number) {
  const footerY = pageH - 60;
  // Orange top stripe
  doc.rect(0, footerY, pageW, 3).fill(ORANGE);
  // Dark brown bar
  doc.rect(0, footerY + 3, pageW, 57).fill(FOOTER_BG);
  // Left: hotel name in text
  doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold")
    .text("MARAN SUITES & TOWERS", margin, footerY + 12, { width: 160 });
  doc.fillColor("#ddbbaa").fontSize(7).font("Helvetica")
    .text("Hotel & Spa", margin, footerY + 25, { width: 160 });
  // Center: contact info
  const cx = margin + 168;
  const cw = contentW - 310;
  doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica")
    .text(HOTEL_ADDRESS, cx, footerY + 11, { width: cw, align: "center" });
  doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica")
    .text(`${HOTEL_EMAIL}  ·  ${HOTEL_PHONE}`, cx, footerY + 23, { width: cw, align: "center" });
  doc.fillColor("#cccccc").fontSize(6.5).font("Helvetica")
    .text(`CUIT ${HOTEL_CUIT} · Responsable Inscripto`, cx, footerY + 36, { width: cw, align: "center" });
  // Right: website
  doc.fillColor("#ffffff").fontSize(9.5).font("Helvetica-Bold")
    .text(HOTEL_WEB, pageW - margin - 110, footerY + 23, { width: 110, align: "right" });
  const ts = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  doc.fillColor("#aaaaaa").fontSize(6).font("Helvetica")
    .text(`Generado el ${ts}`, margin, footerY + 50, { width: contentW, align: "center" });
  return footerY;
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    corporate: "Corporativo",
    social: "Social",
    wedding: "Casamiento",
    conference: "Conferencia",
    meeting: "Reunión",
    table_event: "Por Mesa",
    other: "Otro",
  };
  return labels[type] || type;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  const fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
  const diaSemana = DIAS[fecha.getDay()];
  return `${diaSemana} ${day}/${m}/${y}`;
};

function desglosarAsistentes(event: EventWithDetails): string {
  const total = event.attendees || 0;
  const adults = (event as any).attendeesAdults || 0;
  const youth = (event as any).attendeesYouth || 0;
  const children = (event as any).attendeesChildren || 0;
  if (adults || youth || children) {
    const partes: string[] = [];
    if (adults) partes.push(`${adults} ad.`);
    if (youth) partes.push(`${youth} jóv.`);
    if (children) partes.push(`${children} niños`);
    return `${total} (${partes.join(" / ")})`;
  }
  return String(total);
}

const fmtMoney = (v: string | number) =>
  parseFloat(String(v)).toLocaleString("es-AR", { minimumFractionDigits: 2 });

export interface TableSummaryRow {
  tableNumber: number;
  label: string | null;
  seats: number | null;
  status: string;
  receiptType: string | null;
  invoiceRef: string | null;
  ncId: number | null;
  totalCharges: number;
  totalPayments: number;
  balance: number;
}

export async function generateTablesResumenPdf(
  eventName: string,
  eventCode: string,
  tables: TableSummaryRow[],
): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));

    const pageW    = 595;
    const pageH    = 842;
    const margin   = 36;
    const contentW = pageW - margin * 2;
    const FOOTER_H = 60;
    const safeBottom = pageH - FOOTER_H - 10;

    const drawContinuationHeader = () => {
      doc.rect(0, 0, pageW, 28).fill(NAVY);
      doc.rect(0, 28, pageW, 3).fill(ORANGE);
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
        .text(`RESUMEN DE MESAS — ${eventName} (${eventCode}) — continuación`, margin, 9, { width: contentW });
      return 31 + 8;
    };

    let y = 0;

    const checkOverflow = (neededHeight: number) => {
      if (y + neededHeight > safeBottom) {
        pdfBrandedFooter(doc, pageW, pageH, margin, contentW);
        doc.addPage();
        y = drawContinuationHeader();
      }
    };

    // ── HEADER ──────────────────────────────────────────────────────────────
    const stripeEnd = pdfBrandedHeader(doc, pageW, "RESUMEN DE MESAS");
    const titleY = stripeEnd + 10;

    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("RESUMEN DE MESAS — USO INTERNO", margin, titleY, { characterSpacing: 2 });
    doc.fillColor("#1a1a1a").fontSize(15).font("Helvetica-Bold")
      .text(HOTEL_NAME, margin, titleY + 10, { width: 340 });
    doc.fillColor("#666666").fontSize(8).font("Helvetica")
      .text("Hotel & Spa · Paraná, Entre Ríos", margin, titleY + 28);

    const codeBoxW = 130;
    const codeBoxX = pageW - margin - codeBoxW;
    doc.roundedRect(codeBoxX, titleY, codeBoxW, 40, 5).fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("CÓDIGO DE EVENTO", codeBoxX, titleY + 6, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
    doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
      .text(eventCode, codeBoxX, titleY + 17, { width: codeBoxW, align: "center" });
    doc.fillColor("#aaaaaa").fontSize(6.5).font("Helvetica")
      .text(new Date().toLocaleDateString("es-AR"), codeBoxX, titleY + 30, { width: codeBoxW, align: "center" });

    y = titleY + 48;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 8;

    doc.fillColor("#1a1a1a").fontSize(12).font("Helvetica-Bold")
      .text(eventName, margin, y);
    y += 18;

    // ── TABLE HEADER ROW ─────────────────────────────────────────────────────
    checkOverflow(60);
    const colMesa  = margin;
    const colEstado = margin + 60;
    const colComp  = margin + 130;
    const colCargos = margin + 280;
    const colPagado = margin + 360;
    const colSaldo  = margin + 440;

    doc.roundedRect(margin, y, contentW, 18, 3).fill(NAVY);
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
    const hY = y + 5;
    doc.text("Mesa",      colMesa,   hY, { width: 55 });
    doc.text("Estado",    colEstado, hY, { width: 65 });
    doc.text("Comprobante", colComp, hY, { width: 150 });
    doc.text("Cargos",    colCargos, hY, { width: 75, align: "right" });
    doc.text("Pagado",    colPagado, hY, { width: 75, align: "right" });
    doc.text("Saldo",     colSaldo,  hY, { width: contentW - (colSaldo - margin), align: "right" });
    y += 20;

    // ── TABLE ROWS ───────────────────────────────────────────────────────────
    const statusLabel = (s: string) =>
      s === "open" ? "Abierta" : s === "invoiced" ? "Facturada" : "Cerrada";

    let totalChargesAll = 0;
    let totalPaymentsAll = 0;

    for (const t of tables) {
      const rowH = t.ncId ? 26 : 18;
      checkOverflow(rowH + 2);

      const isEven = tables.indexOf(t) % 2 === 0;
      doc.rect(margin, y, contentW, rowH).fill(isEven ? "#fafafa" : "#f3f3f3").stroke("#e8e8e8");

      const rowY = y + (rowH === 26 ? 3 : 4);

      // Mesa number + label
      doc.fillColor("#1a1a1a").fontSize(8.5).font("Helvetica-Bold")
        .text(`Mesa ${t.tableNumber}${t.label ? ` – ${t.label}` : ""}`, colMesa + 4, rowY, { width: 52 });

      // Estado
      doc.fillColor(t.status === "open" ? "#2563eb" : "#555555").fontSize(8).font("Helvetica")
        .text(statusLabel(t.status), colEstado, rowY, { width: 64 });

      // NC badge (second line if present)
      if (t.ncId) {
        doc.roundedRect(colEstado, rowY + 12, 46, 10, 2).fill("#fff7ed").stroke("#f97316");
        doc.fillColor("#c2410c").fontSize(6.5).font("Helvetica-Bold")
          .text("NC EMITIDA", colEstado + 2, rowY + 14, { width: 42 });
      }

      // Comprobante / invoice ref
      const receiptDisplay = t.receiptType
        ? t.receiptType === "factura_a" ? "Factura A"
          : t.receiptType === "factura_b" ? "Factura B"
          : t.receiptType === "factura_c" ? "Factura C"
          : t.receiptType === "ticket" ? "Ticket"
          : t.receiptType === "voucher_no_fiscal" ? "Voucher"
          : t.receiptType
        : "—";
      doc.fillColor("#333333").fontSize(8).font("Helvetica")
        .text(receiptDisplay, colComp, rowY, { width: 90 });
      if (t.invoiceRef) {
        doc.fillColor("#888888").fontSize(7).font("Helvetica")
          .text(t.invoiceRef, colComp + 94, rowY, { width: 56 });
      }

      // Amounts
      doc.fillColor("#1a1a1a").fontSize(8.5).font("Helvetica")
        .text(`$${fmtMoney(t.totalCharges)}`, colCargos, rowY, { width: 75, align: "right" });
      doc.text(`$${fmtMoney(t.totalPayments)}`, colPagado, rowY, { width: 75, align: "right" });

      if (t.balance > 0.01) {
        doc.fillColor("#dc2626").font("Helvetica-Bold")
          .text(`$${fmtMoney(t.balance)}`, colSaldo, rowY, { width: contentW - (colSaldo - margin), align: "right" });
      } else {
        doc.fillColor("#16a34a").font("Helvetica")
          .text("—", colSaldo, rowY, { width: contentW - (colSaldo - margin), align: "right" });
      }

      totalChargesAll += t.totalCharges;
      totalPaymentsAll += t.totalPayments;
      y += rowH + 2;
    }

    // ── TOTALS ROW ───────────────────────────────────────────────────────────
    checkOverflow(28);
    y += 4;
    doc.roundedRect(margin + contentW - 280, y, 280, 22, 3).fill(NAVY);
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold");
    const totY = y + 6;
    doc.text("TOTAL:", colCargos - 40, totY, { width: 113, align: "right" });
    doc.text(`$${fmtMoney(totalChargesAll)}`, colCargos, totY, { width: 75, align: "right" });
    doc.text(`$${fmtMoney(totalPaymentsAll)}`, colPagado, totY, { width: 75, align: "right" });
    const totalBalance = totalChargesAll - totalPaymentsAll;
    doc.text(totalBalance > 0.01 ? `$${fmtMoney(totalBalance)}` : "—", colSaldo, totY, { width: contentW - (colSaldo - margin), align: "right" });
    y += 26;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    pdfBrandedFooter(doc, pageW, pageH, margin, contentW);
    doc.end();
  });
}

export interface TableReceiptData {
  tableNumber: number;
  label: string | null;
  seats: number | null;
  status: string;
  receiptType: string | null;
  invoiceRef: string | null;
  ncId: number | null;
  closedAt: string | null;
  charges: { description: string; quantity: number; unitPrice: string; total: string }[];
  payments: { amount: string; method: string; isAdvance: string; paidAt: string }[];
}

const paymentMethodLabel = (m: string) => {
  const map: Record<string, string> = {
    efectivo: "Efectivo",
    tarjeta_debito: "Tarjeta Débito",
    tarjeta_credito: "Tarjeta Crédito",
    transferencia: "Transferencia",
    mercadopago: "MercadoPago",
    room_charge: "Cargo a Habitación",
    cuenta_corriente: "Cuenta Corriente",
  };
  return map[m] || m;
};

const receiptTypeLabel = (r: string | null) => {
  if (!r) return "—";
  const map: Record<string, string> = {
    factura_a: "Factura A",
    factura_b: "Factura B",
    factura_c: "Factura C",
    ticket: "Ticket",
    voucher_no_fiscal: "Voucher (No Fiscal)",
    nota_credito: "Nota de Crédito",
  };
  return map[r] || r;
};

export async function generateTableReceiptPdf(
  eventName: string,
  eventCode: string,
  table: TableReceiptData,
): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const pageW    = 595;
    const pageH    = 842;
    const margin   = 40;
    const contentW = pageW - margin * 2;
    const FOOTER_H = 60;
    const safeBottom = pageH - FOOTER_H - 10;

    // ── HEADER ──────────────────────────────────────────────────────────────
    const stripeEnd = pdfBrandedHeader(doc, pageW, "COMPROBANTE DE MESA");
    const titleY = stripeEnd + 10;

    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("COMPROBANTE DE MESA — EVENTOS", margin, titleY, { characterSpacing: 2 });
    doc.fillColor("#1a1a1a").fontSize(15).font("Helvetica-Bold")
      .text(HOTEL_NAME, margin, titleY + 10, { width: 340 });
    doc.fillColor("#666666").fontSize(8).font("Helvetica")
      .text("Hotel & Spa · Paraná, Entre Ríos", margin, titleY + 28);

    // Table number box (top right)
    const codeBoxW = 130;
    const codeBoxX = pageW - margin - codeBoxW;
    doc.roundedRect(codeBoxX, titleY, codeBoxW, 40, 5).fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("MESA", codeBoxX, titleY + 6, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
    const tableLabel = `Mesa ${table.tableNumber}${table.label ? ` – ${table.label}` : ""}`;
    doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
      .text(tableLabel, codeBoxX, titleY + 17, { width: codeBoxW, align: "center" });
    doc.fillColor("#aaaaaa").fontSize(6.5).font("Helvetica")
      .text(new Date().toLocaleDateString("es-AR"), codeBoxX, titleY + 30, { width: codeBoxW, align: "center" });

    let y = titleY + 50;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 8;

    // ── EVENT INFO ───────────────────────────────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(12).font("Helvetica-Bold").text(eventName, margin, y);
    y += 16;
    doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
      .text(`Código: ${eventCode}`, margin, y, { width: contentW / 2 });

    // Receipt type + closed date
    const closedStr = table.closedAt
      ? new Date(table.closedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
      : "—";
    doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
      .text(`Comprobante: ${receiptTypeLabel(table.receiptType)}  ·  Cerrada: ${closedStr}`,
        margin + contentW / 2, y, { width: contentW / 2, align: "right" });
    y += 14;

    // Invoice ref line
    if (table.invoiceRef) {
      doc.fillColor("#7c3aed").fontSize(8).font("Helvetica-Bold")
        .text(`Ref. Factura: ${table.invoiceRef}`, margin, y);
      y += 12;
    }

    // NC badge
    if (table.ncId) {
      doc.roundedRect(margin, y, 100, 14, 3).fill("#fff7ed").stroke("#f97316");
      doc.fillColor("#c2410c").fontSize(7.5).font("Helvetica-Bold")
        .text("NC EMITIDA", margin + 4, y + 3, { width: 92 });
      y += 18;
    }

    y += 4;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    y += 8;

    // ── CHARGES TABLE ────────────────────────────────────────────────────────
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("Cargos", margin, y);
    y += 12;

    const colDesc  = margin;
    const colQty   = margin + 310;
    const colUnit  = margin + 360;
    const colTotal = margin + 430;

    doc.roundedRect(margin, y, contentW, 17, 3).fill(NAVY);
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
    const hY = y + 5;
    doc.text("Descripción", colDesc + 4, hY, { width: 300 });
    doc.text("Cant.", colQty, hY, { width: 46, align: "right" });
    doc.text("P.Unit.", colUnit, hY, { width: 65, align: "right" });
    doc.text("Total", colTotal, hY, { width: contentW - (colTotal - margin), align: "right" });
    y += 19;

    let totalCharges = 0;
    for (let i = 0; i < table.charges.length; i++) {
      const c = table.charges[i];
      const total = parseFloat(c.total);
      totalCharges += total;

      const descH = Math.max(14, doc.heightOfString(c.description, { width: 296 }) + 4);
      if (y + descH > safeBottom) {
        pdfBrandedFooter(doc, pageW, pageH, margin, contentW);
        doc.addPage();
        doc.rect(0, 0, pageW, 28).fill(NAVY);
        doc.rect(0, 28, pageW, 3).fill(ORANGE);
        doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
          .text(`${tableLabel} — ${eventName} — continuación`, margin, 9, { width: contentW });
        y = 39;
      }

      doc.rect(margin, y, contentW, descH).fill(i % 2 === 0 ? "#fafafa" : "#f3f3f3").stroke("#e8e8e8");
      doc.fillColor("#1a1a1a").fontSize(8.5).font("Helvetica")
        .text(c.description, colDesc + 4, y + 3, { width: 296 });
      doc.text(String(c.quantity), colQty, y + 3, { width: 46, align: "right" });
      doc.text(`$${fmtMoney(c.unitPrice)}`, colUnit, y + 3, { width: 65, align: "right" });
      doc.text(`$${fmtMoney(total)}`, colTotal, y + 3, { width: contentW - (colTotal - margin), align: "right" });
      y += descH;
    }

    if (table.charges.length === 0) {
      doc.fillColor("#888888").fontSize(8).font("Helvetica").text("Sin cargos", margin + 4, y + 4);
      y += 18;
    }

    // Charges total row
    y += 4;
    doc.roundedRect(margin + contentW - 200, y, 200, 18, 3).fill(NAVY);
    doc.fillColor("white").fontSize(8.5).font("Helvetica-Bold");
    doc.text("TOTAL CARGOS:", margin + contentW - 196, y + 5, { width: 100 });
    doc.text(`$${fmtMoney(totalCharges)}`, colTotal, y + 5, { width: contentW - (colTotal - margin), align: "right" });
    y += 24;

    // ── PAYMENTS TABLE ───────────────────────────────────────────────────────
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("Pagos", margin, y);
    y += 12;

    const colPayMethod = margin;
    const colPayDate   = margin + 220;
    const colPayAdv    = margin + 360;
    const colPayAmt    = margin + 430;

    doc.roundedRect(margin, y, contentW, 17, 3).fill(NAVY);
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
    const phY = y + 5;
    doc.text("Método", colPayMethod + 4, phY, { width: 210 });
    doc.text("Fecha", colPayDate, phY, { width: 136 });
    doc.text("Tipo", colPayAdv, phY, { width: 65 });
    doc.text("Monto", colPayAmt, phY, { width: contentW - (colPayAmt - margin), align: "right" });
    y += 19;

    let totalPayments = 0;
    for (let i = 0; i < table.payments.length; i++) {
      const p = table.payments[i];
      const amount = parseFloat(p.amount);
      totalPayments += amount;

      if (y + 16 > safeBottom) {
        pdfBrandedFooter(doc, pageW, pageH, margin, contentW);
        doc.addPage();
        doc.rect(0, 0, pageW, 28).fill(NAVY);
        doc.rect(0, 28, pageW, 3).fill(ORANGE);
        doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
          .text(`${tableLabel} — ${eventName} — continuación`, margin, 9, { width: contentW });
        y = 39;
      }

      doc.rect(margin, y, contentW, 16).fill(i % 2 === 0 ? "#fafafa" : "#f3f3f3").stroke("#e8e8e8");
      doc.fillColor("#1a1a1a").fontSize(8.5).font("Helvetica")
        .text(paymentMethodLabel(p.method), colPayMethod + 4, y + 4, { width: 210 });
      const paidDate = p.paidAt
        ? new Date(p.paidAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
        : "—";
      doc.text(paidDate, colPayDate, y + 4, { width: 136 });
      doc.fillColor(p.isAdvance === "true" ? "#92400e" : "#555555").fontSize(8).font("Helvetica")
        .text(p.isAdvance === "true" ? "Seña" : "Normal", colPayAdv, y + 4, { width: 65 });
      doc.fillColor("#16a34a").fontSize(8.5).font("Helvetica-Bold")
        .text(`$${fmtMoney(amount)}`, colPayAmt, y + 4, { width: contentW - (colPayAmt - margin), align: "right" });
      y += 16;
    }

    if (table.payments.length === 0) {
      doc.fillColor("#888888").fontSize(8).font("Helvetica").text("Sin pagos", margin + 4, y + 4);
      y += 18;
    }

    // Payments total + balance
    y += 4;
    doc.roundedRect(margin + contentW - 200, y, 200, 18, 3).fill(NAVY);
    doc.fillColor("white").fontSize(8.5).font("Helvetica-Bold");
    doc.text("TOTAL PAGADO:", margin + contentW - 196, y + 5, { width: 100 });
    doc.text(`$${fmtMoney(totalPayments)}`, colPayAmt, y + 5, { width: contentW - (colPayAmt - margin), align: "right" });
    y += 22;

    const balance = totalCharges - totalPayments;
    if (balance > 0.01) {
      doc.roundedRect(margin + contentW - 200, y, 200, 18, 3).fill("#dc2626");
      doc.fillColor("white").fontSize(8.5).font("Helvetica-Bold");
      doc.text("SALDO PENDIENTE:", margin + contentW - 196, y + 5, { width: 100 });
      doc.text(`$${fmtMoney(balance)}`, colPayAmt, y + 5, { width: contentW - (colPayAmt - margin), align: "right" });
      y += 22;
    } else {
      doc.roundedRect(margin + contentW - 200, y, 200, 18, 3).fill("#16a34a");
      doc.fillColor("white").fontSize(8.5).font("Helvetica-Bold");
      doc.text("SALDO:", margin + contentW - 196, y + 5, { width: 100 });
      doc.text("$0.00 — PAGADO", colPayAmt, y + 5, { width: contentW - (colPayAmt - margin), align: "right" });
      y += 22;
    }

    // ── FOOTER ───────────────────────────────────────────────────────────────
    pdfBrandedFooter(doc, pageW, pageH, margin, contentW);
    doc.end();
  });
}

export async function generateHojaFuncionPdf(event: EventWithDetails): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));

    const pageW    = 595;
    const pageH    = 842;
    const margin   = 36;
    const contentW = pageW - margin * 2;
    const col1     = margin;
    const col2     = margin + 140;
    const col3     = margin + 268;
    const col4     = margin + 398;
    const FOOTER_H = 60;
    const safeBottom = pageH - FOOTER_H - 10; // content must stay above this

    // ── Helper: compact header for continuation pages ─────────────────────
    const drawContinuationHeader = () => {
      doc.rect(0, 0, pageW, 28).fill(NAVY);
      doc.rect(0, 28, pageW, 3).fill(ORANGE);
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
        .text(`HOJA DE FUNCIÓN — ${event.name} (${event.eventCode}) — continuación`, margin, 9, { width: contentW });
      return 31 + 8; // returns y after header
    };

    // ── Helper: check overflow and add page if needed ─────────────────────
    const checkOverflow = (neededHeight: number) => {
      if (y + neededHeight > safeBottom) {
        pdfBrandedFooter(doc, pageW, pageH, margin, contentW);
        doc.addPage();
        y = drawContinuationHeader();
      }
    };

    // ── PAGE 1 HEADER ────────────────────────────────────────────────────
    const stripeEnd = pdfBrandedHeader(doc, pageW, "HOJA DE FUNCIÓN");
    const titleY = stripeEnd + 10;
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("HOJA DE FUNCIÓN — USO INTERNO", margin, titleY, { characterSpacing: 2 });
    doc.fillColor("#1a1a1a").fontSize(15).font("Helvetica-Bold")
      .text(HOTEL_NAME, margin, titleY + 10, { width: 340 });
    doc.fillColor("#666666").fontSize(8).font("Helvetica")
      .text("Hotel & Spa · Paraná, Entre Ríos", margin, titleY + 28);

    // Code box
    const codeBoxW = 130;
    const codeBoxX = pageW - margin - codeBoxW;
    doc.roundedRect(codeBoxX, titleY, codeBoxW, 40, 5).fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("CÓDIGO DE EVENTO", codeBoxX, titleY + 6, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
    doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
      .text(event.eventCode, codeBoxX, titleY + 17, { width: codeBoxW, align: "center" });
    doc.fillColor("#aaaaaa").fontSize(6.5).font("Helvetica")
      .text(`Generado: ${new Date().toLocaleDateString("es-AR")}`, codeBoxX, titleY + 30, { width: codeBoxW, align: "center" });

    let y = titleY + 48;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 8;

    // ── EVENT NAME + DETAILS ─────────────────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(13).font("Helvetica-Bold").text(event.name, margin, y);
    y += 17;
    doc.fillColor("#666666").fontSize(8.5).font("Helvetica")
      .text(`Tipo: ${eventTypeLabel(event.eventType)}`, margin, y);
    y += 12;

    // Data grid — compact rows
    const row = (label1: string, val1: string, label2?: string, val2?: string) => {
      checkOverflow(13);
      const ry = y;
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#555555").text(label1, col1, ry, { width: 126 });
      doc.fontSize(8.5).font("Helvetica").fillColor("#1a1a1a").text(val1, col2, ry, { width: 120 });
      if (label2 && val2) {
        doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#555555").text(label2, col3, ry, { width: 120 });
        doc.fontSize(8.5).font("Helvetica").fillColor("#1a1a1a").text(val2, col4, ry, { width: 110 });
      }
      y += 13;
    };

    row("Salón:", event.eventRoom?.name || "—", "Asistentes:", desglosarAsistentes(event));
    row(
      "Fecha:",
      event.startDate === event.endDate
        ? fmtDate(event.startDate)
        : `${fmtDate(event.startDate)} al ${fmtDate(event.endDate)}`,
      event.startTime ? "Horario:" : "",
      event.startTime ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ""}` : ""
    );
    row("Contacto:", event.contactName, "Teléfono:", event.contactPhone || "—");
    if (event.contactEmail) row("Email:", event.contactEmail, "", "");
    if (event.company)      row("Empresa:", (event.company as any).name || "—", "", "");
    y += 4;

    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    y += 8;

    // ── SERVICIOS ────────────────────────────────────────────────────────
    if (event.charges && event.charges.length > 0) {
      checkOverflow(46);
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("Servicios contratados", margin, y);
      y += 14;
      doc.roundedRect(margin, y, contentW, 18, 4).fill(NAVY);
      doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold")
        .text("Descripción", margin + 6, y + 5, { width: 360 });
      doc.text("Cantidad", margin + 6, y + 5, { width: contentW - 12, align: "right" });
      y += 20;
      for (const charge of event.charges) {
        const descH = doc.heightOfString(charge.description, { width: 350 });
        const notesH = charge.notes ? doc.heightOfString(charge.notes, { width: 350 }) + 4 : 0;
        const rh = Math.max(16, descH + notesH + 6);
        checkOverflow(rh);
        doc.rect(margin, y, contentW, rh).fill("#fafafa").stroke("#e8e8e8");
        doc.fillColor("#1a1a1a").fontSize(8.5).font("Helvetica")
          .text(charge.description, margin + 6, y + 4, { width: 350 });
        doc.text(String(charge.quantity), margin + 6, y + 4, { width: contentW - 12, align: "right" });
        if (charge.notes) {
          doc.fillColor("#666666").fontSize(7).font("Helvetica")
            .text(charge.notes, margin + 6, y + descH + 6, { width: 350 });
        }
        y += rh;
      }
      y += 8;
    }

    // ── NOTAS + ÁREAS ────────────────────────────────────────────────────
    if (event.notes) {
      checkOverflow(40);
      doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
      y += 6;
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("Notas / Instrucciones operativas", margin, y);
      y += 13;
      const notesH = doc.heightOfString(event.notes, { width: contentW });
      checkOverflow(notesH + 6);
      doc.fillColor("#444444").fontSize(8.5).font("Helvetica")
        .text(event.notes, margin, y, { width: contentW });
      y += notesH + 8;
    }

    const areas = [
      { label: "ARMADO",        value: (event as any).notasArmado },
      { label: "COCINA",        value: (event as any).notasCocina },
      { label: "MANTENIMIENTO", value: (event as any).notasMantenimiento },
      { label: "HOUSEKEEPING",  value: (event as any).notasHousekeeping },
    ].filter((a) => a.value);

    if (areas.length > 0) {
      checkOverflow(30);
      doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
      y += 6;
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("Coordinación por Área", margin, y);
      y += 13;
      for (const area of areas) {
        const areaTextH = doc.heightOfString(area.value!, { width: contentW - 8 });
        checkOverflow(areaTextH + 20);
        doc.fillColor("#333333").fontSize(9).font("Helvetica-Bold").text(`${area.label}:`, margin, y);
        y += 12;
        doc.fillColor("#444444").fontSize(8.5).font("Helvetica")
          .text(area.value!, margin + 8, y, { width: contentW - 8 });
        y += areaTextH + 6;
      }
    }

    // ── FOOTER (last page) ───────────────────────────────────────────────
    pdfBrandedFooter(doc, pageW, pageH, margin, contentW);

    doc.end();
  });
}

export async function generateConfirmacionEventoPdf(event: EventWithDetails): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const pageW    = 595;
    const pageH    = 842;
    const margin   = 44;
    const contentW = pageW - margin * 2;

    // ── BACKGROUND TEMPLATE ──────────────────────────────────────────────────
    // Usar la imagen institucional como fondo A4 completo (encabezado foto ciudad
    // + pie con logo y beneficios). El contenido se superpone en el área blanca.
    const bgPath = assetPath("confirmacion-evento-bg.jpg");
    if (fs.existsSync(bgPath)) {
      doc.image(bgPath, 0, 0, { width: pageW, height: pageH });
    } else {
      // Fallback: fondo blanco con franja naranja superior
      doc.rect(0, 0, pageW, 170).fill(NAVY);
      doc.rect(0, 170, pageW, 5).fill(ORANGE);
    }

    // El área blanca del template comienza ~185pt desde arriba y termina ~700pt.
    // Dejamos un poco de padding interno.
    let y = 188;

    // ── TÍTULO + CÓDIGO ───────────────────────────────────────────────────────
    // Label sutil "CONFIRMACIÓN DE EVENTO"
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
      .text("CONFIRMACIÓN DE EVENTO", margin, y, { characterSpacing: 2 });
    y += 13;

    // Nombre del evento a la izquierda, código a la derecha
    const codeBoxW = 130;
    const codeBoxX = pageW - margin - codeBoxW;

    doc.fillColor("#1a1a1a").fontSize(14).font("Helvetica-Bold")
      .text(event.name, margin, y, { width: codeBoxX - margin - 8 });
    const nameH = doc.heightOfString(event.name, { width: codeBoxX - margin - 8 });

    // Caja código
    doc.roundedRect(codeBoxX, y - 2, codeBoxW, 42, 5).fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("CÓDIGO", codeBoxX, y + 5, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
    doc.fillColor("#333333").fontSize(12).font("Helvetica-Bold")
      .text(event.eventCode, codeBoxX, y + 15, { width: codeBoxW, align: "center" });
    doc.fillColor("#aaaaaa").fontSize(6.5).font("Helvetica")
      .text(new Date().toLocaleDateString("es-AR"), codeBoxX, y + 30, { width: codeBoxW, align: "center" });

    y += Math.max(nameH + 4, 44);

    doc.fillColor("#666666").fontSize(8.5).font("Helvetica")
      .text(`${eventTypeLabel(event.eventType)}  ·  ${fmtDate(event.startDate)}${event.startDate !== event.endDate ? ` al ${fmtDate(event.endDate)}` : ""}`, margin, y);
    y += 14;

    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#d0d0d0").lineWidth(0.5).stroke();
    y += 10;

    // ── KEY DATA GRID ────────────────────────────────────────────────────────
    const gridCells: { label: string; value: string }[] = [
      { label: "SALÓN",      value: event.eventRoom?.name || "—" },
      { label: "FECHA",      value: event.startDate === event.endDate ? fmtDate(event.startDate) : `${fmtDate(event.startDate)} — ${fmtDate(event.endDate)}` },
      { label: "HORARIO",    value: event.startTime ? `${event.startTime}${event.endTime ? ` — ${event.endTime}` : ""}` : "—" },
      { label: "ASISTENTES", value: desglosarAsistentes(event) },
    ];
    const cellW = contentW / gridCells.length;
    const gridH = 42;
    doc.roundedRect(margin, y, contentW, gridH, 5).fillAndStroke("#ffffff", "#dddddd");
    gridCells.forEach((cell, i) => {
      const cx = margin + i * cellW;
      if (i > 0) doc.moveTo(cx, y + 7).lineTo(cx, y + gridH - 7).strokeColor("#dddddd").lineWidth(0.5).stroke();
      doc.fillColor("#999999").fontSize(6.5).font("Helvetica-Bold")
        .text(cell.label, cx + 4, y + 8, { width: cellW - 8, align: "center", characterSpacing: 0.3 });
      doc.fillColor(NAVY).fontSize(9.5).font("Helvetica-Bold")
        .text(cell.value, cx + 4, y + 22, { width: cellW - 8, align: "center" });
    });
    y += gridH + 10;

    // ── CONTACT BOX ──────────────────────────────────────────────────────────
    const contactBoxH = 50;
    doc.roundedRect(margin, y, contentW, contactBoxH, 5).fillAndStroke("#f8f9fa", "#eeeeee");
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica-Bold")
      .text("DATOS DE CONTACTO", margin + 12, y + 9, { characterSpacing: 1 });
    doc.moveTo(margin + 12, y + 19).lineTo(margin + 12 + 90, y + 19).strokeColor(ORANGE).lineWidth(2).stroke();

    const colA = margin + 12;
    const colB = margin + 12 + contentW / 2;
    doc.fillColor("#1a1a1a").fontSize(10.5).font("Helvetica-Bold")
      .text(event.contactName, colA, y + 25, { width: contentW / 2 - 20 });
    if (event.contactPhone)
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(`Tel: ${event.contactPhone}`, colA, y + 38, { width: contentW / 2 - 20 });
    if (event.contactEmail)
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(event.contactEmail, colB, y + 25, { width: contentW / 2 - 20 });
    if (event.company)
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(`Empresa: ${(event.company as any).razonSocial || (event.company as any).name || "—"}`, colB, y + 38, { width: contentW / 2 - 20 });
    y += contactBoxH + 10;

    // ── SERVICIOS CON PRECIOS ─────────────────────────────────────────────────
    if (event.charges && event.charges.length > 0) {
      doc.fillColor(NAVY).fontSize(10.5).font("Helvetica-Bold").text("Detalle de servicios", margin, y);
      doc.fillColor("#888888").fontSize(7.5).font("Helvetica")
        .text("Precios con IVA (21%) incluido", margin + 160, y + 2);
      y += 16;

      // Table header
      doc.roundedRect(margin, y, contentW, 18, 3).fill(NAVY);
      doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
      const thY = y + 5;
      doc.text("Descripción",  margin + 8,       thY, { width: 260 });
      doc.text("Cant.",        margin + 8,       thY, { width: contentW * 0.55, align: "right" });
      doc.text("P. Unit.",     margin + 8,       thY, { width: contentW * 0.75, align: "right" });
      doc.text("Total",        margin + 8,       thY, { width: contentW - 8,   align: "right" });
      y += 20;

      let totalConIva = 0;
      for (const charge of event.charges) {
        const total = parseFloat(String(charge.totalAmount) || "0");
        totalConIva += total;
        const rh = Math.max(18, doc.heightOfString(charge.description, { width: 260 }) + 6);
        doc.rect(margin, y, contentW, rh).fill("#fafafa").stroke("#e8e8e8");
        doc.fillColor("#1a1a1a").fontSize(8.5).font("Helvetica")
          .text(charge.description, margin + 8, y + 4, { width: 260 });
        doc.text(String(charge.quantity),             margin + 8, y + 4, { width: contentW * 0.55, align: "right" });
        doc.text(`$ ${fmtMoney(charge.unitPrice)}`,   margin + 8, y + 4, { width: contentW * 0.75, align: "right" });
        doc.font("Helvetica-Bold")
          .text(`$ ${fmtMoney(charge.totalAmount)}`,  margin + 8, y + 4, { width: contentW - 8,   align: "right" });
        y += rh;
      }

      // Total row
      doc.roundedRect(margin + contentW - 210, y + 5, 210, 20, 3).fill(NAVY);
      doc.fillColor("white").fontSize(9.5).font("Helvetica-Bold")
        .text("TOTAL (IVA incl.):", margin + 8, y + 10, { width: contentW * 0.72, align: "right" });
      doc.text(`$ ${fmtMoney(totalConIva)}`, margin + 8, y + 10, { width: contentW - 8, align: "right" });
      y += 32;

      doc.fillColor("#888888").fontSize(7).font("Helvetica")
        .text("* IVA a aplicar según condición impositiva del cliente al momento de facturar.", margin, y, { width: contentW });
      y += 14;
    }

    // ── FIRMA ────────────────────────────────────────────────────────────────
    // Solo dibujar si queda espacio razonable antes del pie del template (~700pt)
    if (y < 660) {
      y += 10;
      doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
      y += 14;
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text("Firma y aclaración cliente:", margin, y);
      doc.moveTo(margin + 175, y + 13).lineTo(margin + 350, y + 13).strokeColor("#333333").lineWidth(0.5).stroke();
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text("Fecha:", margin + contentW - 120, y);
      doc.moveTo(margin + contentW - 75, y + 13).lineTo(margin + contentW, y + 13).strokeColor("#333333").lineWidth(0.5).stroke();
    }

    doc.end();
  });
}
