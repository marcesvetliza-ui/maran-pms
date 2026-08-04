import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const HOTEL_NAME    = "Maran Suites & Towers";
const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE   = "+54 (0343) 503-8070";
const NAVY          = "#1a3a6c";
const ORANGE        = "#e8841a";

function fmtMoney(v: string | number): string {
  return parseFloat(String(v)).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

const receiptTypeLabels: Record<string, string> = {
  ticket: "Ticket",
  factura_a: "Factura A",
  factura_b: "Factura B",
  factura_c: "Factura C",
  voucher: "Voucher Justo",
  voucher_pedidos_ya: "Voucher Pedidos Ya",
  consumo_interno: "Consumo Interno",
  cuenta_habitacion: "Cargo a Habitación",
};

export interface RestaurantReceiptData {
  orderNumber: string;
  orderLabel: string | null;
  waiterName: string | null;
  receiptType: string | null;
  closedAt?: string | null;
  total: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }>;
}

export async function generateRestaurantOrderReceiptPdf(data: RestaurantReceiptData): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const pageW  = 595;
    const pageH  = 842;
    const margin = 40;
    const contentW = pageW - margin * 2;

    // ── HEADER ───────────────────────────────────────────────────────────────
    const headerH = 50;
    doc.rect(0, 0, pageW, headerH).fill(NAVY);
    doc.rect(0, headerH, pageW, 4).fill(ORANGE);

    const logoPath = path.join(process.cwd(), "server", "assets", "hotel-logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, 5, { height: 38, fit: [120, 38] });
    } else {
      doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
        .text(HOTEL_NAME, margin, 15);
    }

    // Subtitle top right
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold")
      .text("COMPROBANTE DE RESTAURANTE", pageW - margin - 180, 10, { width: 180, align: "right", characterSpacing: 0.5 });
    doc.fillColor(ORANGE).fontSize(9).font("Helvetica-Bold")
      .text("MARAN SUITES & TOWERS", pageW - margin - 180, 22, { width: 180, align: "right" });
    doc.fillColor("#aadddd").fontSize(7).font("Helvetica")
      .text(HOTEL_ADDRESS, pageW - margin - 180, 34, { width: 180, align: "right" });

    let y = headerH + 14;

    // ── ORDER INFO BOX ───────────────────────────────────────────────────────
    const infoBoxW = 160;
    const infoBoxX = pageW - margin - infoBoxW;
    doc.roundedRect(infoBoxX, y, infoBoxW, 48, 4).fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("PEDIDO / MESA", infoBoxX, y + 5, { width: infoBoxW, align: "center", characterSpacing: 0.3 });
    doc.fillColor("#333333").fontSize(13).font("Helvetica-Bold")
      .text(data.orderLabel || `Pedido ${data.orderNumber}`, infoBoxX, y + 16, { width: infoBoxW, align: "center" });
    doc.fillColor("#aaaaaa").fontSize(6.5).font("Helvetica")
      .text(new Date().toLocaleDateString("es-AR"), infoBoxX, y + 34, { width: infoBoxW, align: "center" });

    // Left info column
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica")
      .text("COMPROBANTE DE RESTAURANTE", margin, y, { characterSpacing: 2 });
    doc.fillColor("#1a1a1a").fontSize(15).font("Helvetica-Bold")
      .text(HOTEL_NAME, margin, y + 10, { width: 300 });
    doc.fillColor("#666666").fontSize(8).font("Helvetica")
      .text("Hotel & Spa · Paraná, Entre Ríos", margin, y + 28);

    y += 56;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 8;

    // ── RECEIPT META ─────────────────────────────────────────────────────────
    const closedStr = data.closedAt
      ? new Date(data.closedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
      : new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

    const receiptLabel = data.receiptType ? (receiptTypeLabels[data.receiptType] || data.receiptType) : "Ticket";

    if (data.waiterName) {
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(`Mozo: ${data.waiterName}`, margin, y, { width: contentW / 2 });
    }
    doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
      .text(`Comprobante: ${receiptLabel}  ·  ${closedStr}`, margin + contentW / 2, y, { width: contentW / 2, align: "right" });
    y += 16;

    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    y += 10;

    // ── ITEMS TABLE ──────────────────────────────────────────────────────────
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("Ítems consumidos", margin, y);
    y += 14;

    const colDesc  = margin;
    const colQty   = margin + 310;
    const colUnit  = margin + 360;
    const colTotal = margin + 430;

    // Header row
    doc.roundedRect(margin, y, contentW, 17, 3).fill(NAVY);
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
    const hY = y + 5;
    doc.text("Descripción", colDesc + 4, hY, { width: 300 });
    doc.text("Cant.", colQty, hY, { width: 46, align: "right" });
    doc.text("P.Unit.", colUnit, hY, { width: 65, align: "right" });
    doc.text("Total", colTotal, hY, { width: contentW - (colTotal - margin), align: "right" });
    y += 19;

    const safeBottom = pageH - 80;
    let runningTotal = 0;

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const total = parseFloat(item.subtotal);
      runningTotal += total;

      const descH = Math.max(14, doc.heightOfString(item.name, { width: 296 }) + 4);
      if (y + descH > safeBottom) {
        // New page
        doc.addPage();
        doc.rect(0, 0, pageW, 28).fill(NAVY);
        doc.rect(0, 28, pageW, 3).fill(ORANGE);
        doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
          .text(`Pedido ${data.orderNumber} — continuación`, margin, 9, { width: contentW });
        y = 39;
      }

      doc.rect(margin, y, contentW, descH).fill(i % 2 === 0 ? "#fafafa" : "#f3f3f3").stroke("#e8e8e8");
      doc.fillColor("#1a1a1a").fontSize(8.5).font("Helvetica")
        .text(item.name, colDesc + 4, y + 3, { width: 296 });
      doc.text(String(item.quantity), colQty, y + 3, { width: 46, align: "right" });
      doc.text(`$${fmtMoney(item.unitPrice)}`, colUnit, y + 3, { width: 65, align: "right" });
      doc.text(`$${fmtMoney(total)}`, colTotal, y + 3, { width: contentW - (colTotal - margin), align: "right" });
      y += descH;
    }

    if (data.items.length === 0) {
      doc.fillColor("#888888").fontSize(8).font("Helvetica").text("Sin ítems", margin + 4, y + 4);
      y += 18;
    }

    // ── TOTAL ────────────────────────────────────────────────────────────────
    y += 6;
    const totalAmount = parseFloat(data.total);
    doc.roundedRect(margin + contentW - 220, y, 220, 22, 3).fill(NAVY);
    doc.fillColor("white").fontSize(9.5).font("Helvetica-Bold")
      .text("TOTAL:", margin + contentW - 216, y + 6, { width: 100 });
    doc.text(`$${fmtMoney(totalAmount)}`, margin + contentW - 120, y + 6, { width: 115, align: "right" });
    y += 32;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    const footerY = pageH - 55;
    doc.moveTo(margin, footerY - 8).lineTo(margin + contentW, footerY - 8).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    doc.rect(0, footerY, pageW, 55).fill(NAVY);
    doc.fillColor("white").fontSize(8).font("Helvetica-Bold")
      .text(`${HOTEL_NAME} — Restaurante`, margin, footerY + 10, { width: contentW });
    doc.fillColor("#aadddd").fontSize(6.8).font("Helvetica")
      .text(HOTEL_ADDRESS, margin, footerY + 22, { width: contentW });
    doc.fillColor("#aadddd").fontSize(6.8).font("Helvetica")
      .text(HOTEL_PHONE, margin, footerY + 32, { width: contentW });
    const ts = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fillColor("#888888").fontSize(6).font("Helvetica")
      .text(`Generado el ${ts}`, margin, footerY + 42, { width: contentW, align: "right" });

    doc.end();
  });
}
