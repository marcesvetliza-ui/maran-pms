import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { presupuestos, presupuestoItems, quoteCatalogItems, quoteConditions } from "@shared/schema";
import { requireAuth } from "../auth";
import { eq, desc, like, and, asc } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { assetPath } from "../utils/assetPath";

const HOTEL_NAME = "Maran Suites & Towers";
const HOTEL_TAGLINE = "Hotel & Spa · Paraná, Entre Ríos";
const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE = "+54 9 343 5103636";
const HOTEL_EMAIL = "comercial@maransuites.com.ar";
const HOTEL_WEB = "www.maransuites.com.ar";

const BANK_DATA = [
  "Banco Macro — Suc. 777 Monte Caseros, Paraná, Entre Ríos",
  "Alias: MARAN.SUITES.TOWERS",
  "CBU: 2850777-6-3009411860328-1",
  "Cuenta Corriente en pesos N.º 3-777-0941186032-8",
  "Titular: Maran SA — CUIT: 33-68110008-9",
];

const AREA_LABELS: Record<string, string> = {
  grupos: "Grupos",
  recepcion: "Recepción",
  eventos: "Eventos",
  spa: "SPA",
  restaurant: "Restaurant Justo",
};

const CATEGORY_LABELS: Record<string, string> = {
  salon: "Salones",
  coffee_break: "Opciones de Coffee Break",
  coctel: "Opciones de Cóctel",
  equipamiento: "Equipamiento Técnico",
  menu: "Opciones de Menú",
  tratamiento: "Tratamientos",
  masaje: "Masajes",
  paquete: "Paquetes",
  entrada: "Entradas",
  principal: "Platos Principales",
  postre: "Postres",
  otro: "Otros Servicios",
};

async function generateNumero(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PRES-${year}-`;
  const last = await db
    .select({ numero: presupuestos.numero })
    .from(presupuestos)
    .where(like(presupuestos.numero, `${prefix}%`))
    .orderBy(desc(presupuestos.createdAt))
    .limit(1);
  const lastNum = last[0] ? parseInt(last[0].numero.replace(prefix, "")) : 0;
  return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
}

// ── PDF Helpers ──────────────────────────────────────────────────────────────

function formatFecha(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function formatMoney(v: any): string {
  const n = parseFloat(String(v ?? 0));
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatMoneyShort(v: any): string {
  const n = parseFloat(String(v ?? 0));
  if (n === 0) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatNum(v: any): string {
  const n = parseFloat(String(v ?? 0));
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
}

const NAVY = "#1a3a6c";
const ORANGE = "#e8841a";
const DARK = "#1a1a1a";
const MUTED = "#6b6b6b";
const LIGHT_BG = "#f8f9fa";
const BORDER = "#e0e0e0";

function drawPageBg(doc: any, imgPath: string, W: number, H: number) {
  if (fs.existsSync(imgPath)) {
    doc.image(imgPath, 0, 0, { width: W, height: H });
  } else {
    console.warn(`[presupuestos] Page background image not found: ${imgPath}. Rendering colour fallback.`);
    doc.rect(0, 0, W, 148).fill(NAVY);
    doc.rect(0, 148, W, 4).fill(ORANGE);
    doc.rect(0, H - 80, W, 80).fill("#2c1a0e");
    // Hotel name + tagline so the page is identifiable without the background image
    doc.fillColor("white").fontSize(16).font("Helvetica-Bold")
       .text(HOTEL_NAME, 0, 52, { width: W, align: "center" });
    doc.fillColor(ORANGE).fontSize(9).font("Helvetica")
       .text(HOTEL_TAGLINE, 0, 74, { width: W, align: "center" });
  }
}

function drawFallbackPortada(doc: any, area: string) {
  const W = 595, H = 842;
  const areaLabel = AREA_LABELS[area] || area;
  console.warn(`[presupuestos] Cover image not found for area "${area}". Rendering branded text fallback cover.`);
  // Navy background
  doc.rect(0, 0, W, H).fill(NAVY);
  // Accent stripe
  doc.rect(0, H / 2 - 36, W, 4).fill(ORANGE);
  // Bottom dark bar
  doc.rect(0, H - 100, W, 4).fill(ORANGE);
  doc.rect(0, H - 96, W, 96).fill("#0f2248");
  // Hotel name
  doc.fillColor("white").fontSize(30).font("Helvetica-Bold")
     .text(HOTEL_NAME, 0, H / 2 - 88, { width: W, align: "center" });
  // Tagline
  doc.fillColor(ORANGE).fontSize(13).font("Helvetica")
     .text(HOTEL_TAGLINE, 0, H / 2 - 50, { width: W, align: "center" });
  // Area label
  doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
     .text(areaLabel.toUpperCase(), 0, H / 2 - 12, { width: W, align: "center", characterSpacing: 3 });
  // Footer contact
  doc.fillColor("#aabbcc").fontSize(8).font("Helvetica")
     .text(`${HOTEL_ADDRESS}  ·  ${HOTEL_EMAIL}  ·  ${HOTEL_WEB}`, 0, H - 60, { width: W, align: "center" });
}

function sectionHeader(doc: any, label: string, x: number, y: number, w: number) {
  doc.roundedRect(x, y, w, 20, 4).fill(NAVY);
  doc.fillColor("white").fontSize(8).font("Helvetica-Bold")
    .text(label.toUpperCase(), x + 12, y + 6, { width: w - 24, characterSpacing: 1 });
  return y + 22;
}

function drawConditions(doc: any, condiciones: string | null, W: number, H: number, margin: number, imgPath: string, startY: number): number {
  if (!condiciones) return startY;
  const contentW = W - margin * 2;
  const lines = condiciones.split("\n").filter(l => l.trim().length > 0);
  let y = startY;
  let bodyH = 10;
  for (const line of lines) bodyH += doc.heightOfString(line, { width: contentW - 28, fontSize: 8 }) + 5;
  const boxH = 24 + bodyH + 8;
  if (y + boxH > H - 125) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = 158; }
  doc.roundedRect(margin, y, contentW, boxH, 6).stroke(BORDER);
  doc.roundedRect(margin, y, contentW, 22, 6).fill(NAVY);
  doc.rect(margin, y + 12, contentW, 10).fill(NAVY);
  doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold")
    .text("CONDICIONES Y OBSERVACIONES", margin + 14, y + 7, { characterSpacing: 1, width: contentW - 28 });
  let cy = y + 30;
  for (const line of lines) {
    if (cy > H - 140) { doc.addPage(); drawPageBg(doc, imgPath, W, H); cy = 158; }
    doc.fillColor(DARK).fontSize(8).font("Helvetica")
      .text(line, margin + 14, cy, { width: contentW - 28 });
    cy += doc.heightOfString(line, { width: contentW - 28, fontSize: 8 }) + 5;
  }
  return y + boxH + 10;
}

function drawBankData(doc: any, W: number, H: number, margin: number, imgPath: string, y: number): number {
  const contentW = W - margin * 2;
  const boxH = 16 + BANK_DATA.length * 13 + 8;
  if (y + boxH > H - 125) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = 158; }
  y = sectionHeader(doc, "Datos Bancarios", margin, y, contentW);
  doc.fillColor(DARK).fontSize(8).font("Helvetica");
  for (const line of BANK_DATA) {
    doc.text(line, margin + 12, y, { width: contentW - 24 });
    y += 13;
  }
  return y + 8;
}

// ── Grupos cover page ─────────────────────────────────────────────────────────

function drawGruposPortada(doc: any, year: number) {
  const W = 595, H = 842;
  const MAROON = "#7B1D3A";
  const ACCENT  = "#CFA882";   // sandy/peach accent shapes
  const DOT     = "#BBBBBB";

  // Background – very light gray
  doc.rect(0, 0, W, H).fill("#ECECEC");

  // ── White header area ─────────────────────────────────────────────────────
  doc.rect(0, 0, W, 98).fill("#FFFFFF");

  // Logo PNG (hotel-logo.png already has the full mark + wordmark)
  const logoPath = assetPath("hotel-logo.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 30, 14, { height: 66 });
  } else {
    // Fallback text logo
    doc.fillColor(MAROON).fontSize(20).font("Helvetica-Bold")
       .text("MARAN SUITES & Towers", 30, 36);
  }

  // Thin separator under header
  doc.rect(0, 98, W, 1).fill("#CCCCCC");

  // ── Peach accent – top right ──────────────────────────────────────────────
  doc.roundedRect(W - 74, 58, 52, 108, 14).fill(ACCENT);

  // ── Dot grid – top right (above photo) ───────────────────────────────────
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 6; c++)
      doc.circle(W - 175 + c * 12, 108 + r * 12, 1.5).fill(DOT);

  // ── Hotel photo – rounded, clipped ───────────────────────────────────────
  const pX = 26, pY = 108, pW = W - 52, pH = 440, pR = 18;
  // Subtle shadow
  doc.roundedRect(pX + 4, pY + 4, pW, pH, pR).fill("#C0C0C0");
  // Clip and draw
  doc.save();
  doc.roundedRect(pX, pY, pW, pH, pR).clip();
  const coverPath = assetPath("grupos-cover.jpg");
  if (fs.existsSync(coverPath)) {
    doc.image(coverPath, pX, pY, { width: pW, height: pH });
  } else {
    console.warn(`[presupuestos] Cover image not found: ${coverPath}. Rendering text fallback.`);
    // Gradient-style fallback: dark background with hotel branding
    doc.rect(pX, pY, pW, pH).fill("#2a3a5c");
    // Accent stripe at bottom of photo area
    doc.rect(pX, pY + pH - 6, pW, 6).fill(ACCENT);
    // Hotel name centred in the photo area
    doc.fillColor("#FFFFFF").fontSize(28).font("Helvetica-Bold")
       .text(HOTEL_NAME, pX, pY + pH / 2 - 42, { width: pW, align: "center" });
    doc.fillColor(ACCENT).fontSize(13).font("Helvetica")
       .text(HOTEL_TAGLINE, pX, pY + pH / 2 - 6, { width: pW, align: "center" });
    doc.fillColor("#AABBCC").fontSize(9).font("Helvetica")
       .text(HOTEL_ADDRESS, pX, pY + pH / 2 + 24, { width: pW, align: "center" });
  }
  doc.restore();

  // ── Peach accent – bottom right of photo ─────────────────────────────────
  doc.roundedRect(W - 66, pY + pH - 90, 48, 105, 13).fill(ACCENT);

  // ── Dot grid – bottom left ────────────────────────────────────────────────
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 6; c++)
      doc.circle(30 + c * 12, pY + pH + 28 + r * 12, 1.5).fill(DOT);

  // ── Bottom text block ─────────────────────────────────────────────────────
  const bY = pY + pH + 26;

  doc.fillColor(MAROON).fontSize(56).font("Helvetica-Bold")
     .text(String(year), 34, bY);

  // Orange rule
  doc.rect(34, bY + 68, 190, 2.5).fill("#C9956A");

  doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
     .text("PRESUPUESTO COMERCIAL", 34, bY + 78, { characterSpacing: 2.2 });

  // Sustainability badge (simplified, right side)
  const bX = W - 142, bBY = bY + 6;
  doc.roundedRect(bX, bBY, 108, 80, 54).stroke("#888888").lineWidth(0.8);
  doc.fillColor("#2E7D32").fontSize(6.5).font("Helvetica-Bold")
     .text("CERTIFICACIÓN EN", bX, bBY + 10, { width: 108, align: "center", characterSpacing: 0.5 });
  doc.fillColor("#2E7D32").fontSize(6).font("Helvetica")
     .text("SUSTENTABILIDAD", bX, bBY + 20, { width: 108, align: "center", characterSpacing: 0.5 });
  doc.rect(bX + 12, bBY + 42, 84, 20).fill("#2B2B2B");
  doc.fillColor("#FFFFFF").fontSize(11).font("Helvetica-Bold")
     .text("PLATA", bX, bBY + 47, { width: 108, align: "center" });
  doc.fillColor("#2E7D32").fontSize(5.5).font("Helvetica")
     .text("HOTELES más VERDES", bX, bBY + 66, { width: 108, align: "center" });

  // ── Footer bar ────────────────────────────────────────────────────────────
  doc.rect(0, H - 38, W, 38).fill(MAROON);
  doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica")
     .text("MARAN.COM.AR  |  f  ig", 0, H - 24, { width: W, align: "center" });
}

// ── Hockey-style PDF (grupos / recepcion) ────────────────────────────────────

function generateHockeyPdf(doc: any, pres: any, items: any[], conditions: string | null) {
  const W = 595, H = 842, M = 40;
  const imgPath = assetPath("confirmacion-header.jpg");
  const headerH = 148;
  const contentW = W - M * 2;

  // ── PAGE 1: Hotel Presentation ───────────────────────────────────────────
  drawPageBg(doc, imgPath, W, H);

  let y = headerH + 24;

  doc.fillColor(NAVY).fontSize(22).font("Helvetica-Bold")
    .text("Maran Suites & Towers", M, y, { width: contentW });
  y += 30;
  doc.fillColor(ORANGE).fontSize(13).font("Helvetica")
    .text("lo está esperando en Paraná", M, y);
  y += 24;
  doc.moveTo(M, y).lineTo(M + contentW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 14;

  const presText = (t: string, fSize: number, clr: string, bold = false, extra = 0) => {
    doc.fillColor(clr).fontSize(fSize).font(bold ? "Helvetica-Bold" : "Helvetica").text(t, M, y, { width: contentW });
    y += doc.heightOfString(t, { width: contentW, fontSize: fSize }) + extra;
  };

  presText("UBICACIÓN", 9, NAVY, true, 4);
  presText(
    "El hotel se encuentra en un lugar privilegiado de la capital entrerriana: en la costanera alta de la ciudad, en el corazón del Parque Urquiza y a sólo 8 cuadras del centro. A 30 km de la ciudad de Santa Fe, quedando a pocos minutos de su centro comercial y aeropuerto, usted estará alojado en una estratégica ubicación de Paraná por lo que podrá realizar sus negocios de manera ágil y placentera.",
    8.5, DARK, false, 14
  );

  presText("ALOJAMIENTO", 9, NAVY, true, 4);
  presText(
    "Nuestro hotel cuenta con 66 habitaciones, planteadas para satisfacer las distintas necesidades en comodidad y categoría. Todas ellas están estratégicamente diseñadas para disfrutar de la luminosidad natural del entorno. Tanto el mobiliario como la tecnología aseguran una placentera estadía.",
    8.5, DARK, false, 14
  );

  presText("SERVICIOS INCLUIDOS", 9, NAVY, true, 4);
  const features = [
    "• Desayuno buffet servido en Justo Restaurante",
    "• Acceso a piscina al aire libre y gimnasio (con turno previo)",
    "• Wi-Fi de alta velocidad en todas las instalaciones",
    "• Estacionamiento (consultar disponibilidad y tarifas)",
    "• Servicio de recepción 24 horas",
    "• Vista privilegiada al Parque Urquiza y Río Paraná",
  ];
  for (const f of features) {
    doc.fillColor(DARK).fontSize(8.5).font("Helvetica").text(f, M, y, { width: contentW });
    y += 13;
  }
  y += 6;

  doc.fillColor(MUTED).fontSize(8).font("Helvetica-Oblique")
    .text(`${HOTEL_ADDRESS}  |  Tel: ${HOTEL_PHONE}  |  ${HOTEL_EMAIL}`, M, y, { width: contentW, align: "center" });

  // ── PAGE 2: Quote Data ────────────────────────────────────────────────────
  doc.addPage();
  drawPageBg(doc, imgPath, W, H);
  y = headerH + 16;

  doc.fillColor(MUTED).fontSize(7).font("Helvetica")
    .text("PRESUPUESTO", M, y, { characterSpacing: 2 });
  doc.fillColor(DARK).fontSize(17).font("Helvetica-Bold")
    .text(HOTEL_NAME, M, y + 11, { width: 300 });
  doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
    .text(HOTEL_TAGLINE, M, y + 33);

  const codeBoxW = 138, codeBoxX = W - M - codeBoxW;
  doc.roundedRect(codeBoxX, y, codeBoxW, 44, 5).fillAndStroke("#f8f4ef", ORANGE);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica")
    .text("N° DE PRESUPUESTO", codeBoxX, y + 7, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
  doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold")
    .text(pres.numero, codeBoxX, y + 19, { width: codeBoxW, align: "center" });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica")
    .text(`Emisión: ${formatFecha(pres.fechaEmision)}`, codeBoxX, y + 33, { width: codeBoxW, align: "center" });

  y += 56;
  doc.moveTo(M, y).lineTo(M + contentW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 10;

  const infoH = 64;
  doc.roundedRect(M, y, contentW, infoH, 6).fillAndStroke(LIGHT_BG, BORDER);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("DIRIGIDO A", M + 12, y + 8, { characterSpacing: 1 });
  doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text(pres.para, M + 12, y + 20, { width: 220 });
  const c2 = M + 280, c3 = M + 390;
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA EMISIÓN", c2, y + 8, { characterSpacing: 0.5 });
  doc.fillColor(DARK).fontSize(9).font("Helvetica").text(formatFecha(pres.fechaEmision), c2, y + 20);
  if (pres.fechaVencimiento) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("VÁLIDO HASTA", c2, y + 36, { characterSpacing: 0.5 });
    doc.fillColor(DARK).fontSize(9).font("Helvetica").text(formatFecha(pres.fechaVencimiento), c2, y + 48);
  }
  if (pres.fechaEvento) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA INGRESO", c3, y + 8, { characterSpacing: 0.5 });
    doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold").text(formatFecha(pres.fechaEvento), c3, y + 20);
  }
  if (pres.fechaFin) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA EGRESO", c3, y + 36, { characterSpacing: 0.5 });
    doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold").text(formatFecha(pres.fechaFin), c3, y + 48);
  }
  y += infoH + 12;

  // Room rates table
  const hasDiscount = items.some(i => parseFloat(i.descuento ?? "0") > 0);
  if (hasDiscount) {
    const cols = { tipo: M, tarifa: M + 200, dto: M + 310, tarifa_dto: M + 380, sub: M + 450 };
    const Ws = { tipo: 195, tarifa: 105, dto: 65, tarifa_dto: 65, sub: 65 };
    doc.roundedRect(M, y, contentW, 20, 4).fill(NAVY);
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
    const th = y + 6;
    doc.text("DESCRIPCIÓN", cols.tipo + 6, th, { width: Ws.tipo });
    doc.text("PRECIO POR NOCHE", cols.tarifa, th, { width: Ws.tarifa, align: "right" });
    doc.text("DESC.", cols.dto, th, { width: Ws.dto, align: "right" });
    doc.text("P. ESPECIAL", cols.tarifa_dto, th, { width: Ws.tarifa_dto, align: "right" });
    doc.text("SUBTOTAL", cols.sub, th, { width: Ws.sub, align: "right" });
    y += 22;
    items.forEach((it, idx) => {
      const descH = doc.heightOfString(it.descripcion, { width: Ws.tipo, fontSize: 8 });
      const detH = it.detalle ? doc.heightOfString(it.detalle, { width: Ws.tipo, fontSize: 7 }) + 4 : 0;
      const rowH = Math.max(24, descH + detH + 14);
      if (y + rowH > H - 90) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }
      doc.rect(M, y, contentW, rowH).fill(idx % 2 === 0 ? "#fff" : "#fafafa").stroke(BORDER);
      const cy = y + 6;
      const dto = parseFloat(it.descuento ?? "0");
      const tarifaConDto = parseFloat(it.precioUnitario) * (1 - dto / 100);
      doc.fillColor(DARK).fontSize(8).font("Helvetica-Bold").text(it.descripcion, cols.tipo + 6, cy, { width: Ws.tipo });
      if (it.detalle) doc.font("Helvetica").fillColor(MUTED).fontSize(7).text(it.detalle, cols.tipo + 6, cy + descH + 3, { width: Ws.tipo });
      doc.fillColor(DARK).fontSize(8).font("Helvetica").text(`$ ${formatMoney(it.precioUnitario)}`, cols.tarifa, cy, { width: Ws.tarifa, align: "right" });
      doc.text(dto > 0 ? `${dto}%` : "—", cols.dto, cy, { width: Ws.dto, align: "right" });
      if (dto > 0) { doc.fillColor("#1a6c3a").font("Helvetica-Bold"); }
      doc.text(`$ ${formatMoney(tarifaConDto.toFixed(2))}`, cols.tarifa_dto, cy, { width: Ws.tarifa_dto, align: "right" });
      doc.fillColor(DARK).font("Helvetica-Bold").text(`$ ${formatMoney(it.subtotal)}`, cols.sub, cy, { width: Ws.sub, align: "right" });
      y += rowH;
    });
  } else {
    const cols = { tipo: M, noches: M + 220, tarifa: M + 290, sub: M + 420 };
    const Ws = { tipo: 215, noches: 65, tarifa: 125, sub: 95 };
    doc.roundedRect(M, y, contentW, 20, 4).fill(NAVY);
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
    const th = y + 6;
    doc.text("DESCRIPCIÓN", cols.tipo + 6, th, { width: Ws.tipo });
    doc.text("CANTIDAD", cols.noches, th, { width: Ws.noches, align: "right" });
    doc.text("PRECIO POR NOCHE — IVA incl.", cols.tarifa, th, { width: Ws.tarifa, align: "right" });
    doc.text("SUBTOTAL", cols.sub, th, { width: Ws.sub, align: "right" });
    y += 22;
    items.forEach((it, idx) => {
      const descH = doc.heightOfString(it.descripcion, { width: Ws.tipo, fontSize: 8 });
      const detH = it.detalle ? doc.heightOfString(it.detalle, { width: Ws.tipo, fontSize: 7 }) + 4 : 0;
      const rowH = Math.max(24, descH + detH + 14);
      if (y + rowH > H - 90) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }
      doc.rect(M, y, contentW, rowH).fill(idx % 2 === 0 ? "#fff" : "#fafafa").stroke(BORDER);
      const cy = y + 6;
      doc.fillColor(DARK).fontSize(8).font("Helvetica-Bold").text(it.descripcion, cols.tipo + 6, cy, { width: Ws.tipo });
      if (it.detalle) doc.font("Helvetica").fillColor(MUTED).fontSize(7).text(it.detalle, cols.tipo + 6, cy + descH + 3, { width: Ws.tipo });
      doc.fillColor(DARK).fontSize(8).font("Helvetica").text(formatNum(it.cantidad), cols.noches, cy, { width: Ws.noches, align: "right" });
      doc.text(`$ ${formatMoney(it.precioUnitario)}`, cols.tarifa, cy, { width: Ws.tarifa, align: "right" });
      doc.font("Helvetica-Bold").text(`$ ${formatMoney(it.subtotal)}`, cols.sub, cy, { width: Ws.sub, align: "right" });
      y += rowH;
    });
  }
  y += 8;

  // Totals — guard against footer overlap (footer starts at H - 80)
  const hockeyTotalsH = 18 + (parseFloat(pres.descuentoGlobal || "0") > 0 ? 18 : 0) + 34;
  if (y + hockeyTotalsH > H - 90) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }

  const totW = 210, totX = M + contentW - totW;
  doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Subtotal", totX + 6, y + 4, { width: totW / 2 });
  doc.text(`$ ${formatMoney(pres.subtotal)}`, totX, y + 4, { width: totW - 6, align: "right" });
  y += 18;
  if (parseFloat(pres.descuentoGlobal || "0") > 0) {
    const descAmt = (parseFloat(pres.subtotal) * parseFloat(pres.descuentoGlobal) / 100).toFixed(2);
    doc.fillColor(MUTED).text(`Descuento global (${pres.descuentoGlobal}%)`, totX + 6, y + 4, { width: totW / 2 });
    doc.text(`- $ ${formatMoney(descAmt)}`, totX, y + 4, { width: totW - 6, align: "right" });
    y += 18;
  }
  doc.roundedRect(totX, y, totW, 24, 4).fill(NAVY);
  doc.fillColor("white").fontSize(12).font("Helvetica-Bold").text("TOTAL GENERAL", totX + 6, y + 6, { width: totW / 2 });
  doc.text(`$ ${formatMoney(pres.total)}`, totX, y + 6, { width: totW - 6, align: "right" });
  y += 34;

  y = drawConditions(doc, conditions, W, H, M, imgPath, y);
  drawBankData(doc, W, H, M, imgPath, y);
}

// ── Catalog PDF (eventos) ─────────────────────────────────────────────────────

function generateEventosPdf(doc: any, pres: any, items: any[], conditions: string | null) {
  const W = 595, H = 842, M = 40;
  const imgPath = assetPath("confirmacion-header.jpg");
  const headerH = 148;
  const contentW = W - M * 2;

  // ── PAGE 1: Cover letter ─────────────────────────────────────────────────
  drawPageBg(doc, imgPath, W, H);
  let y = headerH + 20;

  doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold").text("Presupuesto de Eventos", M, y, { width: contentW });
  y += 28;
  doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold").text(HOTEL_NAME, M, y);
  doc.fillColor(MUTED).fontSize(8.5).font("Helvetica").text(HOTEL_TAGLINE, M + doc.widthOfString(HOTEL_NAME + "  ") + 4, y);
  y += 18;

  doc.moveTo(M, y).lineTo(M + contentW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 14;

  // Client info box
  doc.roundedRect(M, y, contentW, 70, 6).fillAndStroke(LIGHT_BG, BORDER);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("PARA", M + 12, y + 9, { characterSpacing: 1 });
  doc.fillColor(DARK).fontSize(13).font("Helvetica-Bold").text(pres.para, M + 12, y + 20, { width: 240 });
  const c2 = M + 280, c3 = M + 395;
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA INGRESO", c2, y + 9, { characterSpacing: 0.5 });
  doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text(pres.fechaEvento ? formatFecha(pres.fechaEvento) : "A confirmar", c2, y + 21);
  if (pres.fechaFin) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA EGRESO", c2, y + 38, { characterSpacing: 0.5 });
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text(formatFecha(pres.fechaFin), c2, y + 50);
  }
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("PRESUPUESTO N°", c3, y + 9, { characterSpacing: 0.5 });
  doc.fillColor(DARK).fontSize(9).font("Helvetica").text(pres.numero, c3, y + 21);
  if (pres.participantes) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("PARTICIPANTES", c3, y + 38, { characterSpacing: 0.5 });
    doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text(`${pres.participantes} personas`, c3, y + 50);
  }
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("EMISIÓN", c3, y + 38 + (pres.participantes ? 16 : 0), { characterSpacing: 0.5 });
  doc.fillColor(DARK).fontSize(9).font("Helvetica").text(formatFecha(pres.fechaEmision), c3, y + 50 + (pres.participantes ? 16 : 0));
  y += 82;

  // Intro text
  const intro = "Es un gusto que se haya puesto en contacto con nosotros, será un honor formar parte de este evento.\n\nLos salones de Maran Suites & Towers son un símbolo de Paraná. En ellos, la elegancia, estilo y servicio se combinan para lograr que cada evento sea un éxito. El asesoramiento permanente de nuestros especialistas y el cuidado en todos los detalles hacen que Maran sea el elegido para realizar su evento.\n\nOfrecemos propuestas creadas a medida y brindamos la asistencia personalizada de un Ejecutivo que lo acompañará y guiará durante toda la organización; especialmente abocado a un continuo seguimiento de los detalles.";
  doc.fillColor(DARK).fontSize(8.5).font("Helvetica").text(intro, M, y, { width: contentW });
  y += doc.heightOfString(intro, { width: contentW, fontSize: 8.5 }) + 14;

  // Beneficios Maran
  y = sectionHeader(doc, "Beneficios Maran", M, y, contentW);
  const benefits = [
    "Tarifas especiales en alojamiento para participantes y acompañantes.",
    "Maître a cargo: responsable de controlar y gestionar las actividades del evento.",
    "Atención permanente en toilettes durante todo el evento.",
    "Iluminación puntual de mesa · Mesas redondas (8 y 10 personas) · Mantelería negra.",
    "Vajilla de porcelana · Plato de sitio · Ingreso independiente al hotel.",
    "Climatización central frío-calor · Conexión Wi-Fi · Moderna cocina exclusiva para eventos.",
    "Vista privilegiada al Parque Urquiza · Accesibilidad para personas con movilidad reducida.",
  ];
  y += 6;
  for (const b of benefits) {
    doc.fillColor(DARK).fontSize(8).font("Helvetica").text(`• ${b}`, M + 10, y, { width: contentW - 20 });
    y += doc.heightOfString(`• ${b}`, { width: contentW - 20, fontSize: 8 }) + 4;
  }
  y += 6;
  doc.fillColor(MUTED).fontSize(7.5).font("Helvetica-Oblique")
    .text("El presente presupuesto se actualizará hasta un mes antes del evento.", M, y, { width: contentW, align: "center" });

  // ── PAGE 2: Selected items table ─────────────────────────────────────────
  doc.addPage();
  drawPageBg(doc, imgPath, W, H);
  y = headerH + 16;

  // Info header box
  const infoH2 = 64;
  doc.roundedRect(M, y, contentW, infoH2, 6).fillAndStroke(LIGHT_BG, BORDER);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("DIRIGIDO A", M + 12, y + 8, { characterSpacing: 1 });
  doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text(pres.para, M + 12, y + 20, { width: 220 });
  const c2e = M + 280, c3e = M + 390;
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA INGRESO", c2e, y + 8, { characterSpacing: 0.5 });
  doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold").text(pres.fechaEvento ? formatFecha(pres.fechaEvento) : "A confirmar", c2e, y + 20);
  if (pres.fechaFin) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA EGRESO", c2e, y + 36, { characterSpacing: 0.5 });
    doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold").text(formatFecha(pres.fechaFin), c2e, y + 48);
  }
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("PRESUPUESTO N°", c3e, y + 8, { characterSpacing: 0.5 });
  doc.fillColor(DARK).fontSize(9).font("Helvetica").text(pres.numero, c3e, y + 20);
  if (pres.participantes) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("PARTICIPANTES", c3e, y + 36, { characterSpacing: 0.5 });
    doc.fillColor(DARK).fontSize(9).font("Helvetica").text(`${pres.participantes} personas`, c3e, y + 48);
  }
  y += infoH2 + 14;

  // Items table
  if (items.length > 0) {
    const hasDiscount = items.some((i: any) => parseFloat(i.descuento ?? "0") > 0);
    // Footer safety margin: footer image starts ~120px from bottom
    const FOOT = 125;
    if (hasDiscount) {
      // 5-col layout: desc | precio unit | dto | precio esp | subtotal
      const cols = { tipo: M, tarifa: M + 195, dto: M + 305, tarifa_dto: M + 370, sub: M + 440 };
      const Ws  = { tipo: 190, tarifa: 105,    dto: 60,      tarifa_dto: 65,       sub: 70 };
      doc.roundedRect(M, y, contentW, 20, 4).fill(NAVY);
      doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
      const th = y + 6;
      doc.text("DESCRIPCIÓN", cols.tipo + 6, th, { width: Ws.tipo });
      doc.text("PRECIO UNITARIO", cols.tarifa, th, { width: Ws.tarifa, align: "right" });
      doc.text("DESC.", cols.dto, th, { width: Ws.dto, align: "right" });
      doc.text("P. ESPECIAL", cols.tarifa_dto, th, { width: Ws.tarifa_dto, align: "right" });
      doc.text("SUBTOTAL", cols.sub, th, { width: Ws.sub, align: "right" });
      y += 22;
      items.forEach((it: any, idx: number) => {
        const rowBg = idx % 2 === 0 ? "#fff" : "#fafafa";
        doc.fontSize(8).font("Helvetica-Bold");
        const descH = doc.heightOfString(it.descripcion, { width: Ws.tipo });
        doc.fontSize(7).font("Helvetica");
        const detH = it.detalle ? doc.heightOfString(it.detalle, { width: Ws.tipo }) + 4 : 0;
        const rowH = Math.max(24, descH + detH + 14);
        if (y + rowH > H - FOOT) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }
        const rowY = y;
        doc.rect(M, rowY, contentW, rowH).fill(rowBg).stroke(BORDER);
        const cy = rowY + 6;
        const dto = parseFloat(it.descuento ?? "0");
        const tarifaConDto = parseFloat(it.precioUnitario) * (1 - dto / 100);
        doc.fillColor(DARK).fontSize(8).font("Helvetica-Bold").text(it.descripcion, cols.tipo + 6, cy, { width: Ws.tipo });
        if (it.detalle) doc.font("Helvetica").fillColor(MUTED).fontSize(7).text(it.detalle, cols.tipo + 6, cy + descH + 3, { width: Ws.tipo });
        doc.fillColor(DARK).fontSize(8).font("Helvetica").text(`$ ${formatMoney(it.precioUnitario)}`, cols.tarifa, cy, { width: Ws.tarifa, align: "right" });
        doc.text(dto > 0 ? `${dto}%` : "—", cols.dto, cy, { width: Ws.dto, align: "right" });
        if (dto > 0) doc.fillColor("#1a6c3a").font("Helvetica-Bold");
        doc.text(`$ ${formatMoney(tarifaConDto.toFixed(2))}`, cols.tarifa_dto, cy, { width: Ws.tarifa_dto, align: "right" });
        doc.fillColor(DARK).font("Helvetica-Bold").text(`$ ${formatMoney(it.subtotal)}`, cols.sub, cy, { width: Ws.sub, align: "right" });
        // Correct row height using actual doc.y position (same-page overestimate fix)
        if (doc.y > rowY && doc.y < rowY + rowH - 8) {
          const actualEnd = doc.y + 8;
          doc.rect(M - 1, actualEnd, contentW + 2, rowY + rowH - actualEnd + 2).fill(rowBg);
          doc.rect(M, rowY, contentW, actualEnd - rowY).stroke(BORDER);
          y = actualEnd;
        } else {
          y = rowY + rowH;
        }
      });
    } else {
      // 4-col layout: desc | cantidad | precio unit | subtotal
      const cols = { tipo: M, noches: M + 215, tarifa: M + 280, sub: M + 405 };
      const Ws  = { tipo: 210, noches: 60,      tarifa: 120,     sub: 105 };
      doc.roundedRect(M, y, contentW, 20, 4).fill(NAVY);
      doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
      const th = y + 6;
      doc.text("DESCRIPCIÓN", cols.tipo + 6, th, { width: Ws.tipo });
      doc.text("CANT.", cols.noches, th, { width: Ws.noches, align: "right" });
      doc.text("PRECIO POR NOCHE — IVA incl.", cols.tarifa, th, { width: Ws.tarifa, align: "right" });
      doc.text("SUBTOTAL", cols.sub, th, { width: Ws.sub, align: "right" });
      y += 22;
      items.forEach((it: any, idx: number) => {
        const rowBg = idx % 2 === 0 ? "#fff" : "#fafafa";
        doc.fontSize(8).font("Helvetica-Bold");
        const descH = doc.heightOfString(it.descripcion, { width: Ws.tipo });
        doc.fontSize(7).font("Helvetica");
        const detH = it.detalle ? doc.heightOfString(it.detalle, { width: Ws.tipo }) + 4 : 0;
        const rowH = Math.max(24, descH + detH + 14);
        if (y + rowH > H - FOOT) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }
        const rowY = y;
        doc.rect(M, rowY, contentW, rowH).fill(rowBg).stroke(BORDER);
        const cy = rowY + 6;
        doc.fillColor(DARK).fontSize(8).font("Helvetica-Bold").text(it.descripcion, cols.tipo + 6, cy, { width: Ws.tipo });
        if (it.detalle) doc.font("Helvetica").fillColor(MUTED).fontSize(7).text(it.detalle, cols.tipo + 6, cy + descH + 3, { width: Ws.tipo });
        doc.fillColor(DARK).fontSize(8).font("Helvetica").text(formatNum(it.cantidad), cols.noches, cy, { width: Ws.noches, align: "right" });
        doc.text(`$ ${formatMoney(it.precioUnitario)}`, cols.tarifa, cy, { width: Ws.tarifa, align: "right" });
        doc.font("Helvetica-Bold").text(`$ ${formatMoney(it.subtotal)}`, cols.sub, cy, { width: Ws.sub, align: "right" });
        // Correct row height using actual doc.y position (same-page overestimate fix)
        if (doc.y > rowY && doc.y < rowY + rowH - 8) {
          const actualEnd = doc.y + 8;
          doc.rect(M - 1, actualEnd, contentW + 2, rowY + rowH - actualEnd + 2).fill(rowBg);
          doc.rect(M, rowY, contentW, actualEnd - rowY).stroke(BORDER);
          y = actualEnd;
        } else {
          y = rowY + rowH;
        }
      });
    }
    y += 8;

    // Totals — check page break before drawing
    const subtotalSum = items.reduce((sum: number, it: any) => sum + parseFloat(it.subtotal || "0"), 0);
    const descGlobal = parseFloat(pres.descuentoGlobal || "0");
    const descMonto = subtotalSum * descGlobal / 100;
    const total = subtotalSum - descMonto;
    const totalsH = 18 + (descGlobal > 0 ? 18 : 0) + 34;
    if (y + totalsH > H - FOOT) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }
    const totW = 220, totX = M + contentW - totW;
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Subtotal", totX + 6, y + 4, { width: totW / 2 });
    doc.fillColor(DARK).text(`$ ${formatMoney(subtotalSum)}`, totX, y + 4, { width: totW - 6, align: "right" });
    y += 18;
    if (descGlobal > 0) {
      doc.fillColor(MUTED).text(`Descuento global (${descGlobal}%)`, totX + 6, y + 4, { width: totW / 2 });
      doc.fillColor(DARK).text(`- $ ${formatMoney(descMonto)}`, totX, y + 4, { width: totW - 6, align: "right" });
      y += 18;
    }
    doc.roundedRect(totX, y, totW, 24, 4).fill(NAVY);
    doc.fillColor("white").fontSize(10).font("Helvetica-Bold").text("TOTAL GENERAL", totX + 8, y + 7, { width: totW / 2 });
    doc.text(`$ ${formatMoney(total)}`, totX, y + 7, { width: totW - 8, align: "right" });
    y += 34;
  }

  y = drawConditions(doc, conditions, W, H, M, imgPath, y);
  drawBankData(doc, W, H, M, imgPath, y);
}

// ── SPA branded PDF (cover page + clean content pages) ───────────────────────

const SPA_TEAL   = "#1a7a8a";
const SPA_NAVY   = "#1a3a6c";
const SPA_ROSE   = "#c0185a";
const SPA_CREAM  = "#faf8f6";
const SPA_LIGHT  = "#f0f7f9";

function generateSpaPdf(doc: any, pres: any, items: any[], conditions: string | null) {
  const W = 595, H = 842;
  const page2Path = assetPath("spa-page2.jpg");

  // ── PAGE 2+: Mix — foto SPA a la derecha, contenido limpio a la izquierda ──
  // (La portada full-bleed spa-cover.jpg es aplicada por el route handler antes de llamar esta función)
  // La imagen spa-page2.jpg se usa como fondo; cubrimos el lado izquierdo con
  // un rect crema para tapar su texto impreso. Foto queda visible en x>368.
  const M = 30;       // margen izquierdo
  const CW = 310;     // ancho de contenido (queda dentro del área crema)
  let y = 0;

  const drawContentPageBg = () => {
    // Fondo base crema (por si la imagen no carga)
    doc.rect(0, 0, W, H).fill(SPA_CREAM);
    // Imagen SPA de fondo completa (foto queda en el lado derecho)
    if (fs.existsSync(page2Path)) {
      doc.image(page2Path, 0, 0, { width: W, height: H });
    }
    // Rectángulo crema sobre el lado izquierdo para tapar el texto impreso en la imagen
    // El área de foto en spa-page2.jpg ocupa la parte derecha (~x>355), dejamos esa zona libre
    doc.rect(0, 0, 368, H).fill(SPA_CREAM);
    // Barra superior teal (ancho total, encima de todo)
    doc.rect(0, 0, W, 52).fill(SPA_TEAL);
    // Línea decorativa rosa bajo la barra
    doc.rect(0, 52, W, 3).fill(SPA_ROSE);
    // Barra inferior navy
    doc.rect(0, H - 28, W, 28).fill(SPA_NAVY);
    doc.fillColor("white").fontSize(7).font("Helvetica")
       .text("MARAN SUITES & TOWERS — Hotel & Spa | maran.com.ar", 0, H - 16, { width: W, align: "center" });
  };

  const drawContentPageHeader = () => {
    // Texto hotel en la barra izquierda
    doc.fillColor("white").fontSize(8).font("Helvetica-Bold")
       .text("SPA · MARAN SUITES & TOWERS", M, 14, { width: CW - 20 });
    doc.fillColor("#cceeff").fontSize(7).font("Helvetica")
       .text("Hotel & Spa", M, 26, { width: CW - 20 });
    // Badge número — en la zona del header, justo a la derecha de la foto
    // Lo ponemos dentro de la barra teal, alineado dentro de la columna de contenido
    const bW = CW - 10, bX = M;
    doc.roundedRect(bX + CW - 148, 8, 146, 36, 4).fill(SPA_NAVY);
    doc.fillColor("white").fontSize(5.5).font("Helvetica")
       .text("N° PRESUPUESTO", bX + CW - 148, 14, { width: 146, align: "center", characterSpacing: 0.8 });
    doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
       .text(pres.numero, bX + CW - 148, 21, { width: 146, align: "center" });
    doc.fillColor("#88c8d8").fontSize(6.5).font("Helvetica")
       .text(formatFecha(pres.fechaEmision), bX + CW - 148, 36, { width: 146, align: "center" });
  };

  const newContentPage = () => {
    doc.addPage();
    drawContentPageBg();
    drawContentPageHeader();
    y = 100;
  };

  doc.addPage();
  drawContentPageBg();
  drawContentPageHeader();
  y = 100;

  // ── Bloque cliente ─────────────────────────────────────────────────────────
  doc.rect(M, y, CW, 56).fill(SPA_LIGHT);
  doc.rect(M, y, 4, 56).fill(SPA_TEAL);
  doc.fillColor(SPA_TEAL).fontSize(6.5).font("Helvetica-Bold")
     .text("PRESUPUESTO PARA", M + 12, y + 8, { characterSpacing: 1, width: CW - 16 });
  doc.fillColor(SPA_NAVY).fontSize(16).font("Helvetica-Bold")
     .text(pres.para || "—", M + 12, y + 18, { width: CW - 16 });
  let metaY = y + 38;
  const metaParts: string[] = [];
  if (pres.fechaEmision) metaParts.push(`Emisión: ${formatFecha(pres.fechaEmision)}`);
  if (pres.validoHasta) metaParts.push(`Válido hasta: ${formatFecha(pres.validoHasta)}`);
  if (pres.fechaEvento) metaParts.push(`Fecha del servicio: ${formatFecha(pres.fechaEvento)}`);
  if (pres.empresa) metaParts.push(pres.empresa);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica")
     .text(metaParts.join("   ·   "), M + 12, metaY, { width: CW - 16 });
  y += 66;

  // ── Tabla de servicios ─────────────────────────────────────────────────────
  // Columnas dentro de M=30, CW=310 (right edge = 340)
  // SERVICIO: x=38, w=155 | CANT: x=193, w=30 | P.UNIT: x=223, w=55 | TOTAL: x=278, w=62
  const C_SVC = M + 8;    const W_SVC = 155;
  const C_QTY = M + 163;  const W_QTY = 30;
  const C_UNIT = M + 193; const W_UNIT = 55;
  const C_TOT = M + 248;  const W_TOT = CW - 252;

  if (items.length > 0) {
    // Encabezado de tabla
    doc.rect(M, y, CW, 16).fill(SPA_TEAL);
    doc.fillColor("white").fontSize(6.5).font("Helvetica-Bold");
    doc.text("SERVICIO", C_SVC, y + 4, { width: W_SVC });
    doc.text("CANT.", C_QTY, y + 4, { width: W_QTY, align: "right" });
    doc.text("P. UNIT.", C_UNIT, y + 4, { width: W_UNIT, align: "right" });
    doc.text("TOTAL", C_TOT, y + 4, { width: W_TOT, align: "right" });
    y += 16;

    items.forEach((item, idx) => {
      const detalleH = item.detalle ? Math.min(doc.heightOfString(item.detalle, { width: W_SVC, fontSize: 6.5 }), 20) : 0;
      const rowH = Math.max(24, detalleH + 16);
      if (y + rowH > H - 60) newContentPage();

      doc.rect(M, y, CW, rowH).fill(idx % 2 === 0 ? "#ffffff" : SPA_LIGHT)
         .strokeColor(BORDER).lineWidth(0.3).stroke();
      const cy = y + 6;
      doc.fillColor(SPA_NAVY).fontSize(7.5).font("Helvetica-Bold")
         .text(item.descripcion, C_SVC, cy, { width: W_SVC });
      if (item.detalle) {
        doc.fillColor(MUTED).fontSize(6.5).font("Helvetica")
           .text(item.detalle, C_SVC, cy + 10, { width: W_SVC });
      }
      doc.fillColor(DARK).fontSize(7.5).font("Helvetica")
         .text(String(item.cantidad), C_QTY, cy, { width: W_QTY, align: "right" });
      doc.fillColor(DARK).fontSize(7.5).font("Helvetica")
         .text(`$ ${formatMoneyShort(item.precioUnitario)}`, C_UNIT, cy, { width: W_UNIT, align: "right" });
      doc.fillColor(SPA_NAVY).fontSize(7.5).font("Helvetica-Bold")
         .text(`$ ${formatMoneyShort(item.subtotal)}`, C_TOT, cy, { width: W_TOT, align: "right" });
      y += rowH;
    });

    // Totales
    const total = items.reduce((acc: number, it: any) => acc + parseFloat(String(it.subtotal || 0)), 0);
    const dtoGlobal = parseFloat(String(pres.descuentoGlobal || 0));
    const totalFinal = dtoGlobal > 0 ? total * (1 - dtoGlobal / 100) : total;
    y += 4;
    if (dtoGlobal > 0) {
      if (y + 18 > H - 60) newContentPage();
      doc.rect(M, y, CW, 18).fill("#fff0f6");
      doc.fillColor(MUTED).fontSize(7.5).font("Helvetica")
         .text(`Descuento global ${dtoGlobal}%`, M + 8, y + 5, { width: CW - 16 });
      doc.fillColor(SPA_ROSE).fontSize(7.5).font("Helvetica-Bold")
         .text(`- $ ${formatMoneyShort(total - totalFinal)}`, M + 8, y + 5, { width: CW - 16, align: "right" });
      y += 20;
    }
    if (y + 28 > H - 60) newContentPage();
    doc.rect(M, y, CW, 28).fill(SPA_TEAL);
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold")
       .text("TOTAL", M + 12, y + 9, { width: CW - 24 });
    doc.fillColor("white").fontSize(13).font("Helvetica-Bold")
       .text(`$ ${formatMoney(totalFinal)}`, M + 12, y + 8, { width: CW - 24, align: "right" });
    y += 36;
  } else {
    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
       .text("Sin servicios seleccionados.", M, y + 10, { width: CW });
    y += 28;
  }

  // ── Condiciones ────────────────────────────────────────────────────────────
  if (conditions) {
    const lines = conditions.split("\n").filter(l => l.trim().length > 0);
    let condH = 28;
    for (const l of lines) condH += doc.heightOfString(l, { width: CW - 28, fontSize: 7 }) + 5;
    if (y + condH > H - 50) newContentPage();
    doc.rect(M, y, CW, 20).fill(SPA_NAVY);
    doc.fillColor("white").fontSize(6.5).font("Helvetica-Bold")
       .text("CONDICIONES Y OBSERVACIONES", M + 10, y + 6, { characterSpacing: 0.8, width: CW - 20 });
    y += 22;
    doc.rect(M, y, CW, condH - 24).strokeColor(BORDER).lineWidth(0.5).stroke();
    for (const line of lines) {
      if (y > H - 65) newContentPage();
      doc.fillColor(DARK).fontSize(7).font("Helvetica")
         .text(line, M + 10, y + 4, { width: CW - 28 });
      y += doc.heightOfString(line, { width: CW - 28, fontSize: 7 }) + 5;
    }
  }
}

// ── Simple catalog PDF (spa / restaurant) ───────────────────────────────────

function generateCatalogSimplePdf(doc: any, pres: any, catalogItems: any[], conditions: string | null, area: string) {
  const W = 595, H = 842, M = 40;
  const imgPath = assetPath("confirmacion-header.jpg");
  const headerH = 148;
  const contentW = W - M * 2;

  drawPageBg(doc, imgPath, W, H);
  let y = headerH + 16;

  const areaLabel = AREA_LABELS[area] || area;
  doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold").text(`Presupuesto — ${areaLabel}`, M, y, { width: contentW });
  doc.fillColor(DARK).fontSize(9).font("Helvetica").text(HOTEL_NAME, M, y + 28);
  y += 46;

  const codeBoxW = 138, codeBoxX = W - M - codeBoxW;
  doc.roundedRect(codeBoxX, headerH + 14, codeBoxW, 44, 5).fillAndStroke("#f8f4ef", ORANGE);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("N° PRESUPUESTO", codeBoxX, headerH + 21, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
  doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text(pres.numero, codeBoxX, headerH + 33, { width: codeBoxW, align: "center" });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(formatFecha(pres.fechaEmision), codeBoxX, headerH + 47, { width: codeBoxW, align: "center" });

  doc.moveTo(M, y).lineTo(M + contentW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 10;

  const infoH = 50;
  doc.roundedRect(M, y, contentW, infoH, 6).fillAndStroke(LIGHT_BG, BORDER);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("PARA", M + 12, y + 9, { characterSpacing: 1 });
  doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text(pres.para, M + 12, y + 20, { width: 220 });
  if (pres.fechaEvento) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA", M + 300, y + 9, { characterSpacing: 0.5 });
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text(formatFecha(pres.fechaEvento), M + 300, y + 20);
  }
  y += infoH + 12;

  // Group by category
  const grouped = new Map<string, any[]>();
  for (const item of catalogItems) {
    if (!item.isActive) continue;
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push(item);
  }

  for (const [cat, catItems] of grouped) {
    const catLabel = CATEGORY_LABELS[cat] || cat.replace("_", " ");
    const neededH = 28 + catItems.reduce((acc, item) => {
      return acc + Math.max(24, (item.description ? doc.heightOfString(item.description, { width: 260, fontSize: 7.5 }) : 0) + 14);
    }, 0);
    if (y + neededH > H - 90) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 16; }

    y = sectionHeader(doc, catLabel, M, y, contentW);
    y += 2;

    const cols = { nombre: M, desc: M + 165, precio: M + 430, unit: M + 460 };
    const Ws = { nombre: 160, desc: 260, precio: 80, unit: 55 };
    doc.roundedRect(M, y, contentW, 16, 3).fill("#e8eaf6");
    doc.fillColor(NAVY).fontSize(7).font("Helvetica-Bold");
    const th = y + 4;
    doc.text("SERVICIO", cols.nombre + 6, th, { width: Ws.nombre });
    doc.text("DESCRIPCIÓN", cols.desc, th, { width: Ws.desc });
    doc.text("PRECIO", cols.precio, th, { width: Ws.precio, align: "right" });
    doc.text("UNIDAD", cols.unit, th, { width: Ws.unit, align: "right" });
    y += 18;

    catItems.forEach((item, idx) => {
      const descH = item.description ? doc.heightOfString(item.description, { width: Ws.desc, fontSize: 7.5 }) : 0;
      const rowH = Math.max(24, descH + 14);
      if (y + rowH > H - 90) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 16; }
      doc.rect(M, y, contentW, rowH).fill(idx % 2 === 0 ? "#fff" : "#f9f9f9").stroke(BORDER);
      const cy = y + 5;
      doc.fillColor(DARK).fontSize(8).font("Helvetica-Bold").text(item.name, cols.nombre + 6, cy, { width: Ws.nombre });
      if (item.description) doc.fillColor(MUTED).fontSize(7.5).font("Helvetica").text(item.description, cols.desc, cy, { width: Ws.desc });
      doc.fillColor(DARK).fontSize(8).font("Helvetica-Bold").text(`$ ${formatMoneyShort(item.price)}`, cols.precio, cy, { width: Ws.precio, align: "right" });
      doc.fillColor(MUTED).fontSize(7.5).font("Helvetica").text(item.unit, cols.unit, cy, { width: Ws.unit, align: "right" });
      y += rowH;
    });
    y += 8;
  }

  drawConditions(doc, conditions, W, H, M, imgPath, y);
}

// ── General PDF (backwards compat) ───────────────────────────────────────────

function generateGeneralPdf(doc: any, pres: any, items: any[], conditions: string | null) {
  const W = 595, H = 842, M = 40;
  const imgPath = assetPath("confirmacion-header.jpg");
  const headerH = 148;
  const contentW = W - M * 2;

  drawPageBg(doc, imgPath, W, H);
  let y = headerH + 16;

  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("PRESUPUESTO", M, y, { characterSpacing: 2 });
  doc.fillColor(DARK).fontSize(17).font("Helvetica-Bold").text(HOTEL_NAME, M, y + 11, { width: 300 });
  doc.fillColor(MUTED).fontSize(8.5).font("Helvetica").text(HOTEL_TAGLINE, M, y + 33);

  const codeBoxW = 138, codeBoxX = W - M - codeBoxW;
  doc.roundedRect(codeBoxX, y, codeBoxW, 44, 5).fillAndStroke("#f8f4ef", ORANGE);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("N° DE PRESUPUESTO", codeBoxX, y + 7, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
  doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text(pres.numero, codeBoxX, y + 19, { width: codeBoxW, align: "center" });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(`Emitida: ${formatFecha(pres.fechaEmision)}`, codeBoxX, y + 33, { width: codeBoxW, align: "center" });

  y += 56;
  doc.moveTo(M, y).lineTo(M + contentW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 10;

  const infoH = 62;
  doc.roundedRect(M, y, contentW, infoH, 6).fillAndStroke(LIGHT_BG, BORDER);
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("DIRIGIDO A", M + 12, y + 10, { characterSpacing: 1 });
  doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text(pres.para, M + 12, y + 22, { width: 250 });
  const c2x = M + 295, c3x = M + 395;
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA EMISIÓN", c2x, y + 10, { characterSpacing: 0.5 });
  doc.fillColor(DARK).fontSize(9.5).font("Helvetica").text(formatFecha(pres.fechaEmision), c2x, y + 22);
  if (pres.fechaVencimiento) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("VÁLIDO HASTA", c2x, y + 38, { characterSpacing: 0.5 });
    doc.fillColor(DARK).fontSize(9.5).font("Helvetica").text(formatFecha(pres.fechaVencimiento), c2x, y + 50);
  }
  if (pres.fechaEvento) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA INGRESO", c3x, y + 10, { characterSpacing: 0.5 });
    doc.fillColor(NAVY).fontSize(9.5).font("Helvetica-Bold").text(formatFecha(pres.fechaEvento), c3x, y + 22);
  }
  if (pres.fechaFin) {
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("FECHA EGRESO", c3x, y + 38, { characterSpacing: 0.5 });
    doc.fillColor(NAVY).fontSize(9.5).font("Helvetica-Bold").text(formatFecha(pres.fechaFin), c3x, y + 50);
  }
  y += infoH + 8;

  const hasDiscount = items.some(i => parseFloat(i.descuento ?? "0") > 0);
  const SECTOR_LABELS: Record<string, string> = { alojamiento: "Alojamiento", restaurant: "Restaurant", spa: "SPA", evento: "Evento", otro: "Otro" };

  if (hasDiscount) {
    const cols6 = { sector: M, desc: M + 57, cant: M + 244, precioRack: M + 278, tarifaDto: M + 355, sub: M + 442 };
    const W6 = { sector: 55, desc: 185, cant: 32, precioRack: 75, tarifaDto: 85, sub: 73 };
    doc.roundedRect(M, y, contentW, 20, 4).fill(NAVY);
    doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
    const thY = y + 6;
    doc.text("SECTOR", cols6.sector + 6, thY, { width: W6.sector });
    doc.text("DESCRIPCIÓN", cols6.desc, thY, { width: W6.desc });
    doc.text("CANT", cols6.cant, thY, { width: W6.cant, align: "right" });
    doc.text("PRECIO RACK", cols6.precioRack, thY, { width: W6.precioRack, align: "right" });
    doc.text("TARIFA C/DTO.", cols6.tarifaDto, thY, { width: W6.tarifaDto, align: "right" });
    doc.text("SUBTOTAL", cols6.sub, thY, { width: W6.sub, align: "right" });
    y += 22;
    items.forEach((item, idx) => {
      const descH = doc.heightOfString(item.descripcion, { width: W6.desc, fontSize: 8 });
      const detH = item.detalle ? doc.heightOfString(item.detalle, { width: W6.desc, fontSize: 7 }) + 5 : 0;
      const rowH = Math.max(22, descH + detH + 14);
      if (y + rowH > H - 100) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }
      doc.rect(M, y, contentW, rowH).fill(idx % 2 === 0 ? "#ffffff" : "#fafafa").stroke("#e8e8e8");
      doc.fillColor(DARK).fontSize(8).font("Helvetica");
      const cellY = y + 6;
      const dto = parseFloat(item.descuento ?? "0");
      const tarifaConDto = parseFloat(item.precioUnitario) * (1 - dto / 100);
      doc.text(SECTOR_LABELS[item.sector] || item.sector, cols6.sector + 6, cellY, { width: W6.sector });
      doc.font("Helvetica-Bold").text(item.descripcion, cols6.desc, cellY, { width: W6.desc });
      if (item.detalle) doc.font("Helvetica").fillColor(MUTED).fontSize(7).text(item.detalle, cols6.desc, cellY + descH + 3, { width: W6.desc });
      doc.font("Helvetica").fillColor(DARK).fontSize(8);
      doc.text(formatNum(item.cantidad), cols6.cant, cellY, { width: W6.cant, align: "right" });
      doc.text(`$ ${formatMoney(item.precioUnitario)}`, cols6.precioRack, cellY, { width: W6.precioRack, align: "right" });
      if (dto > 0) { doc.fillColor("#1a6c3a"); doc.font("Helvetica-Bold"); }
      doc.text(`$ ${formatMoney(tarifaConDto.toFixed(2))}`, cols6.tarifaDto, cellY, { width: W6.tarifaDto, align: "right" });
      doc.fillColor(DARK).font("Helvetica-Bold").text(`$ ${formatMoney(item.subtotal)}`, cols6.sub, cellY, { width: W6.sub, align: "right" });
      y += rowH;
    });
  } else {
    const cols5 = { sector: M, desc: M + 62, cant: M + 272, precio: M + 312, sub: M + 420 };
    const W5 = { sector: 58, desc: 205, cant: 32, precio: 98, sub: 95 };
    doc.roundedRect(M, y, contentW, 20, 4).fill(NAVY);
    doc.fillColor("white").fontSize(8).font("Helvetica-Bold");
    const thY = y + 6;
    doc.text("SECTOR", cols5.sector + 6, thY, { width: W5.sector });
    doc.text("DESCRIPCIÓN", cols5.desc, thY, { width: W5.desc });
    doc.text("CANT", cols5.cant, thY, { width: W5.cant, align: "right" });
    doc.text("PRECIO", cols5.precio, thY, { width: W5.precio, align: "right" });
    doc.text("SUBTOTAL", cols5.sub, thY, { width: W5.sub, align: "right" });
    y += 22;
    items.forEach((item, idx) => {
      const descH = doc.heightOfString(item.descripcion, { width: W5.desc, fontSize: 8 });
      const detH = item.detalle ? doc.heightOfString(item.detalle, { width: W5.desc, fontSize: 7 }) + 5 : 0;
      const rowH = Math.max(22, descH + detH + 14);
      if (y + rowH > H - 100) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }
      doc.rect(M, y, contentW, rowH).fill(idx % 2 === 0 ? "#ffffff" : "#fafafa").stroke("#e8e8e8");
      doc.fillColor(DARK).fontSize(8).font("Helvetica");
      const cellY = y + 6;
      doc.text(SECTOR_LABELS[item.sector] || item.sector, cols5.sector + 6, cellY, { width: W5.sector });
      doc.font("Helvetica-Bold").text(item.descripcion, cols5.desc, cellY, { width: W5.desc });
      if (item.detalle) doc.font("Helvetica").fillColor(MUTED).fontSize(7).text(item.detalle, cols5.desc, cellY + descH + 3, { width: W5.desc });
      doc.font("Helvetica").fillColor(DARK).fontSize(8);
      doc.text(formatNum(item.cantidad), cols5.cant, cellY, { width: W5.cant, align: "right" });
      doc.text(`$ ${formatMoney(item.precioUnitario)}`, cols5.precio, cellY, { width: W5.precio, align: "right" });
      doc.font("Helvetica-Bold").text(`$ ${formatMoney(item.subtotal)}`, cols5.sub, cellY, { width: W5.sub, align: "right" });
      y += rowH;
    });
  }
  y += 8;

  // Totals — guard against footer overlap (footer starts at H - 80)
  const generalTotalsH = 18 + (parseFloat(pres.descuentoGlobal || "0") > 0 ? 18 : 0) + 30;
  if (y + generalTotalsH > H - 90) { doc.addPage(); drawPageBg(doc, imgPath, W, H); y = headerH + 10; }

  const totW = 210, totX = M + contentW - totW;
  doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Subtotal", totX + 6, y + 4, { width: totW / 2 });
  doc.text(`$ ${formatMoney(pres.subtotal)}`, totX, y + 4, { width: totW - 6, align: "right" });
  y += 18;
  if (parseFloat(pres.descuentoGlobal || "0") > 0) {
    const descAmt = (parseFloat(pres.subtotal) * parseFloat(pres.descuentoGlobal) / 100).toFixed(2);
    doc.fillColor(MUTED).text(`Descuento (${pres.descuentoGlobal}%)`, totX + 6, y + 4, { width: totW / 2 });
    doc.text(`- $ ${formatMoney(descAmt)}`, totX, y + 4, { width: totW - 6, align: "right" });
    y += 18;
  }
  doc.roundedRect(totX, y, totW, 22, 4).fill(NAVY);
  doc.fillColor("white").fontSize(12).font("Helvetica-Bold").text("TOTAL", totX + 6, y + 5, { width: totW / 2 });
  doc.text(`$ ${formatMoney(pres.total)}`, totX, y + 5, { width: totW - 6, align: "right" });
  y += 30;

  drawConditions(doc, conditions, W, H, M, imgPath, y);
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerPresupuestosRoutes(app: Express) {

  // GET all presupuestos (optional ?area= filter)
  app.get("/api/presupuestos", requireAuth, async (req: Request, res: Response) => {
    try {
      const area = req.query.area as string | undefined;
      const rows = area && area !== "todos"
        ? await db.select().from(presupuestos).where(eq(presupuestos.areaOrigen, area)).orderBy(desc(presupuestos.createdAt))
        : await db.select().from(presupuestos).orderBy(desc(presupuestos.createdAt));
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Error al obtener presupuestos" });
    }
  });

  // GET one with items
  app.get("/api/presupuestos/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const [pres] = await db.select().from(presupuestos).where(eq(presupuestos.id, req.params.id));
      if (!pres) return res.status(404).json({ error: "Presupuesto no encontrado" });
      const items = await db.select().from(presupuestoItems).where(eq(presupuestoItems.presupuestoId, pres.id)).orderBy(presupuestoItems.orden);
      res.json({ ...pres, items });
    } catch {
      res.status(500).json({ error: "Error al obtener presupuesto" });
    }
  });

  // POST create
  app.post("/api/presupuestos", requireAuth, async (req: Request, res: Response) => {
    try {
      const { items = [], ...data } = req.body;
      const numero = await generateNumero();
      const [pres] = await db.insert(presupuestos).values({ ...data, numero, updatedAt: new Date() }).returning();
      if (items.length > 0) {
        await db.insert(presupuestoItems).values(items.map((it: any, idx: number) => ({ ...it, presupuestoId: pres.id, orden: idx })));
      }
      const savedItems = await db.select().from(presupuestoItems).where(eq(presupuestoItems.presupuestoId, pres.id)).orderBy(presupuestoItems.orden);
      res.status(201).json({ ...pres, items: savedItems });
    } catch (e: any) {
      res.status(500).json({ error: "Error al crear presupuesto", detail: e?.message });
    }
  });

  // PATCH update
  app.patch("/api/presupuestos/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { items, ...data } = req.body;
      const [pres] = await db.update(presupuestos).set({ ...data, updatedAt: new Date() }).where(eq(presupuestos.id, req.params.id)).returning();
      if (!pres) return res.status(404).json({ error: "Presupuesto no encontrado" });
      if (items !== undefined) {
        await db.delete(presupuestoItems).where(eq(presupuestoItems.presupuestoId, pres.id));
        if (items.length > 0) {
          await db.insert(presupuestoItems).values(items.map((it: any, idx: number) => ({ ...it, id: undefined, presupuestoId: pres.id, orden: idx })));
        }
      }
      const savedItems = await db.select().from(presupuestoItems).where(eq(presupuestoItems.presupuestoId, pres.id)).orderBy(presupuestoItems.orden);
      res.json({ ...pres, items: savedItems });
    } catch (e: any) {
      res.status(500).json({ error: "Error al actualizar presupuesto", detail: e?.message });
    }
  });

  // DELETE
  app.delete("/api/presupuestos/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await db.delete(presupuestos).where(eq(presupuestos.id, req.params.id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Error al eliminar presupuesto" });
    }
  });

  // GET PDF
  app.get("/api/presupuestos/:id/pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const [pres] = await db.select().from(presupuestos).where(eq(presupuestos.id, req.params.id));
      if (!pres) return res.status(404).json({ error: "Presupuesto no encontrado" });
      const items = await db.select().from(presupuestoItems).where(eq(presupuestoItems.presupuestoId, pres.id)).orderBy(presupuestoItems.orden);

      const area = (pres as any).areaOrigen || "grupos";

      // Load conditions for this area
      let conditions = (pres as any).condiciones || null;
      if (!conditions) {
        const [cond] = await db.select().from(quoteConditions).where(eq(quoteConditions.area, area));
        if (cond) conditions = cond.content;
      }

      // For catalog-based areas, load catalog items
      let catalogItems: any[] = [];
      if (["eventos", "spa", "restaurant"].includes(area)) {
        catalogItems = await db.select().from(quoteCatalogItems)
          .where(and(eq(quoteCatalogItems.area, area), eq(quoteCatalogItems.isActive, true)))
          .orderBy(asc(quoteCatalogItems.sortOrder));
      }

      const doc = new PDFDocument({ margin: 0, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${pres.numero}.pdf"`);
      doc.pipe(res);

      if (area === "recepcion" || area === "grupos") {
        if (area === "grupos") {
          const portadaPath = assetPath("grupos-portada.jpg");
          if (fs.existsSync(portadaPath)) {
            doc.image(portadaPath, 0, 0, { width: 595, height: 842 });
            doc.addPage();
          }
        } else if (area === "recepcion") {
          const recepPortada = assetPath("recep-portada.jpg");
          if (fs.existsSync(recepPortada)) {
            doc.image(recepPortada, 0, 0, { width: 595, height: 842 });
          } else {
            drawFallbackPortada(doc, area);
          }
          doc.addPage();
        }
        // Página de presentación del hotel + datos del presupuesto
        generateHockeyPdf(doc, pres, items, conditions);
      } else if (area === "eventos") {
        // Portada full-bleed para eventos
        const eventosCover = assetPath("eventos-cover.jpg");
        if (fs.existsSync(eventosCover)) {
          doc.image(eventosCover, 0, 0, { width: 595, height: 842 });
        } else {
          drawFallbackPortada(doc, area);
        }
        doc.addPage();
        generateEventosPdf(doc, pres, items, conditions);
      } else if (area === "spa") {
        // Portada full-bleed para spa — NO addPage() aquí, generateSpaPdf lo hace internamente
        const spaCover = assetPath("spa-cover.jpg");
        if (fs.existsSync(spaCover)) {
          doc.image(spaCover, 0, 0, { width: 595, height: 842 });
        } else {
          drawFallbackPortada(doc, area);
        }
        generateSpaPdf(doc, pres, items, conditions);
      } else if (area === "restaurant") {
        // Portada Justo full-bleed, luego catálogo de servicios
        const restaurantCover = assetPath("restaurant-cover.jpg");
        if (fs.existsSync(restaurantCover)) {
          doc.image(restaurantCover, 0, 0, { width: 595, height: 842 });
        } else {
          drawFallbackPortada(doc, area);
        }
        doc.addPage();
        generateCatalogSimplePdf(doc, pres, catalogItems, conditions, area);
      } else {
        generateGeneralPdf(doc, pres, items, conditions);
      }

      const _presTs = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
      doc.fontSize(6).font("Helvetica").fillColor("#aaaaaa")
        .text(`Generado el ${_presTs} | Maran Suites & Towers`, 0, doc.page.height - 10, { align: "center", width: doc.page.width });
      doc.end();
    } catch (e: any) {
      res.status(500).json({ error: "Error generando PDF", detail: e?.message });
    }
  });

  // ── Quote Catalog Routes ───────────────────────────────────────────────────

  app.get("/api/quote-catalog", requireAuth, async (req: Request, res: Response) => {
    try {
      const area = req.query.area as string | undefined;
      const rows = area
        ? await db.select().from(quoteCatalogItems).where(eq(quoteCatalogItems.area, area)).orderBy(asc(quoteCatalogItems.sortOrder))
        : await db.select().from(quoteCatalogItems).orderBy(asc(quoteCatalogItems.sortOrder));
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Error al obtener catálogo" });
    }
  });

  app.post("/api/quote-catalog", requireAuth, async (req: Request, res: Response) => {
    try {
      const [item] = await db.insert(quoteCatalogItems).values(req.body).returning();
      res.status(201).json(item);
    } catch (e: any) {
      res.status(500).json({ error: "Error al crear ítem", detail: e?.message });
    }
  });

  app.patch("/api/quote-catalog/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const [item] = await db.update(quoteCatalogItems).set(req.body).where(eq(quoteCatalogItems.id, req.params.id)).returning();
      if (!item) return res.status(404).json({ error: "Ítem no encontrado" });
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: "Error al actualizar ítem", detail: e?.message });
    }
  });

  app.delete("/api/quote-catalog/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await db.delete(quoteCatalogItems).where(eq(quoteCatalogItems.id, req.params.id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Error al eliminar ítem" });
    }
  });

  // ── Quote Conditions Routes ────────────────────────────────────────────────

  app.get("/api/quote-conditions", requireAuth, async (_req: Request, res: Response) => {
    try {
      const rows = await db.select().from(quoteConditions);
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Error al obtener condiciones" });
    }
  });

  app.get("/api/quote-conditions/:area", requireAuth, async (req: Request, res: Response) => {
    try {
      const [row] = await db.select().from(quoteConditions).where(eq(quoteConditions.area, req.params.area));
      res.json(row || { area: req.params.area, content: "" });
    } catch {
      res.status(500).json({ error: "Error al obtener condiciones" });
    }
  });

  app.patch("/api/quote-conditions/:area", requireAuth, async (req: Request, res: Response) => {
    try {
      const { area } = req.params;
      const { content } = req.body;
      const existing = await db.select().from(quoteConditions).where(eq(quoteConditions.area, area));
      if (existing.length > 0) {
        const [row] = await db.update(quoteConditions).set({ content, updatedAt: new Date() }).where(eq(quoteConditions.area, area)).returning();
        res.json(row);
      } else {
        const [row] = await db.insert(quoteConditions).values({ area, content, updatedAt: new Date() }).returning();
        res.json(row);
      }
    } catch (e: any) {
      res.status(500).json({ error: "Error al guardar condiciones", detail: e?.message });
    }
  });
}
