import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { presupuestos, presupuestoItems } from "@shared/schema";
import { requireAuth } from "../auth";
import { eq, desc, like } from "drizzle-orm";
import PDFDocument from "pdfkit";

const HOTEL_NAME = "Maran Suites & Towers";
const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE = "+54 (0343) 503-8070";
const HOTEL_EMAIL = "recepcion@maran.com.ar";

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

export function registerPresupuestosRoutes(app: Express) {
  // GET all
  app.get("/api/presupuestos", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(presupuestos).orderBy(desc(presupuestos.createdAt));
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
      const items = await db
        .select()
        .from(presupuestoItems)
        .where(eq(presupuestoItems.presupuestoId, pres.id))
        .orderBy(presupuestoItems.orden);
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
      const [pres] = await db
        .insert(presupuestos)
        .values({ ...data, numero, updatedAt: new Date() })
        .returning();
      if (items.length > 0) {
        await db.insert(presupuestoItems).values(
          items.map((it: any, idx: number) => ({ ...it, presupuestoId: pres.id, orden: idx }))
        );
      }
      const savedItems = await db
        .select()
        .from(presupuestoItems)
        .where(eq(presupuestoItems.presupuestoId, pres.id))
        .orderBy(presupuestoItems.orden);
      res.status(201).json({ ...pres, items: savedItems });
    } catch (e: any) {
      res.status(500).json({ error: "Error al crear presupuesto", detail: e?.message });
    }
  });

  // PATCH update
  app.patch("/api/presupuestos/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { items, ...data } = req.body;
      const [pres] = await db
        .update(presupuestos)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(presupuestos.id, req.params.id))
        .returning();
      if (!pres) return res.status(404).json({ error: "No encontrado" });

      if (Array.isArray(items)) {
        await db.delete(presupuestoItems).where(eq(presupuestoItems.presupuestoId, pres.id));
        if (items.length > 0) {
          await db.insert(presupuestoItems).values(
            items.map((it: any, idx: number) => ({ ...it, presupuestoId: pres.id, orden: idx }))
          );
        }
      }
      const savedItems = await db
        .select()
        .from(presupuestoItems)
        .where(eq(presupuestoItems.presupuestoId, pres.id))
        .orderBy(presupuestoItems.orden);
      res.json({ ...pres, items: savedItems });
    } catch {
      res.status(500).json({ error: "Error al actualizar" });
    }
  });

  // DELETE
  app.delete("/api/presupuestos/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await db.delete(presupuestos).where(eq(presupuestos.id, req.params.id));
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Error al eliminar" });
    }
  });

  // GET PDF
  app.get("/api/presupuestos/:id/pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const [pres] = await db.select().from(presupuestos).where(eq(presupuestos.id, req.params.id));
      if (!pres) return res.status(404).json({ error: "No encontrado" });
      const items = await db
        .select()
        .from(presupuestoItems)
        .where(eq(presupuestoItems.presupuestoId, pres.id))
        .orderBy(presupuestoItems.orden);

      const doc = new PDFDocument({ margin: 0, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${pres.numero}.pdf"`);
      doc.pipe(res);

      const pageW   = 595;
      const pageH   = 842;
      const margin  = 40;
      const contentW = pageW - margin * 2;
      const NAVY    = "#1a3a6c";
      const ORANGE  = "#e8841a";
      const FOOTER_BG = "#8b4513";
      const DARK    = "#1a1a1a";
      const MUTED   = "#6b6b6b";

      // ── HEADER IMAGE ────────────────────────────────────────
      const headerH = 148;
      const headerImgPath = path.join(process.cwd(), "server", "assets", "confirmacion-header.jpg");
      if (fs.existsSync(headerImgPath)) {
        doc.image(headerImgPath, 0, 0, { width: pageW, height: headerH, cover: [pageW, headerH] });
      } else {
        doc.rect(0, 0, pageW, headerH).fill(NAVY);
      }
      doc.rect(0, headerH, pageW, 5).fill(ORANGE);

      // ── TITLE ROW ───────────────────────────────────────────
      const titleY = headerH + 16;
      doc.fillColor("#888888").fontSize(7).font("Helvetica")
        .text("PRESUPUESTO", margin, titleY, { characterSpacing: 2 });
      doc.fillColor("#1a1a1a").fontSize(17).font("Helvetica-Bold")
        .text(HOTEL_NAME, margin, titleY + 11, { width: 300 });
      doc.fillColor("#666666").fontSize(8.5).font("Helvetica")
        .text("Hotel & Spa · Paraná, Entre Ríos", margin, titleY + 33);

      // Code box (right)
      const codeBoxW = 138;
      const codeBoxX = pageW - margin - codeBoxW;
      doc.roundedRect(codeBoxX, titleY, codeBoxW, 44, 5).fillAndStroke("#f8f4ef", ORANGE);
      doc.fillColor("#888888").fontSize(7).font("Helvetica")
        .text("N° DE PRESUPUESTO", codeBoxX, titleY + 7, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
      doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
        .text(pres.numero, codeBoxX, titleY + 19, { width: codeBoxW, align: "center" });
      doc.fillColor("#aaaaaa").fontSize(7).font("Helvetica")
        .text(`Emitida: ${formatFecha(pres.fechaEmision)}`, codeBoxX, titleY + 33, { width: codeBoxW, align: "center" });

      // Status badge
      const statusMap: Record<string, { bg: string; bd: string; tx: string; lb: string }> = {
        borrador:  { bg: "#f5f5f5", bd: "#cccccc", tx: "#666666", lb: "BORRADOR"  },
        enviado:   { bg: "#e3f2fd", bd: "#90caf9", tx: "#1565c0", lb: "ENVIADO"   },
        aceptado:  { bg: "#e8f5e9", bd: "#a5d6a7", tx: "#2e7d32", lb: "ACEPTADO"  },
        vencido:   { bg: "#fff3e0", bd: "#ffcc80", tx: "#e65100", lb: "VENCIDO"   },
        cancelado: { bg: "#fce4ec", bd: "#f48fb1", tx: "#c62828", lb: "CANCELADO" },
      };
      const st = statusMap[pres.estado || "borrador"] || statusMap.borrador;
      doc.roundedRect(codeBoxX + 16, titleY + 50, codeBoxW - 32, 15, 7).fillAndStroke(st.bg, st.bd);
      doc.fillColor(st.tx).fontSize(7).font("Helvetica-Bold")
        .text(st.lb, codeBoxX + 16, titleY + 54, { width: codeBoxW - 32, align: "center", characterSpacing: 0.5 });

      // Separator
      let y = titleY + 56;
      doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
      y += 10;

      // ── INFO BOX (para + fechas) ─────────────────────────────
      const infoBoxH = 62;
      doc.roundedRect(margin, y, contentW, infoBoxH, 6).fillAndStroke("#f8f9fa", "#eeeeee");
      doc.fillColor("#888888").fontSize(7).font("Helvetica-Bold")
        .text("DIRIGIDO A", margin + 12, y + 10, { characterSpacing: 1 });
      doc.fillColor("#111111").fontSize(12).font("Helvetica-Bold")
        .text(pres.para, margin + 12, y + 22, { width: 250 });

      const col2x = margin + 295;
      const col3x = margin + 395;
      doc.fillColor("#888888").fontSize(7).font("Helvetica-Bold")
        .text("FECHA EMISIÓN", col2x, y + 10, { characterSpacing: 0.5 });
      doc.fillColor("#333333").fontSize(9.5).font("Helvetica")
        .text(formatFecha(pres.fechaEmision), col2x, y + 22);
      if (pres.fechaVencimiento) {
        doc.fillColor("#888888").fontSize(7).font("Helvetica-Bold")
          .text("VÁLIDO HASTA", col2x, y + 38, { characterSpacing: 0.5 });
        doc.fillColor("#333333").fontSize(9.5).font("Helvetica")
          .text(formatFecha(pres.fechaVencimiento), col2x, y + 50);
      }
      if ((pres as any).fechaEvento) {
        doc.fillColor("#888888").fontSize(7).font("Helvetica-Bold")
          .text("FECHA EVENTO", col3x, y + 10, { characterSpacing: 0.5 });
        doc.fillColor(NAVY).fontSize(9.5).font("Helvetica-Bold")
          .text(formatFecha((pres as any).fechaEvento), col3x, y + 22);
      }
      y += infoBoxH + 8;

      if (pres.notas) {
        doc.fillColor(MUTED).fontSize(8).font("Helvetica")
          .text(pres.notas, margin, y, { width: contentW });
        y += doc.heightOfString(pres.notas, { width: contentW }) + 8;
      }

      // ── TABLE ────────────────────────────────────────────────
      const cols = {
        sector: margin,
        desc:   margin + 60,
        cant:   margin + 288,
        precio: margin + 328,
        dto:    margin + 378,
        sub:    margin + 428,
      };
      doc.roundedRect(margin, y, contentW, 20, 4).fill(NAVY);
      doc.fillColor("white").fontSize(8).font("Helvetica-Bold");
      const thY = y + 6;
      doc.text("SECTOR",      cols.sector + 6, thY, { width: 55 });
      doc.text("DESCRIPCIÓN", cols.desc,       thY, { width: 220 });
      doc.text("CANT",        cols.cant,        thY, { width: 35, align: "right" });
      doc.text("PRECIO",      cols.precio,      thY, { width: 45, align: "right" });
      doc.text("DTO%",        cols.dto,         thY, { width: 40, align: "right" });
      doc.text("SUBTOTAL",    cols.sub,         thY, { width: 75, align: "right" });
      y += 22;

      const SECTOR_LABELS: Record<string, string> = {
        alojamiento: "Alojamiento", restaurant: "Restaurant",
        spa: "SPA", evento: "Evento", otro: "Otro",
      };
      items.forEach((item, idx) => {
        const rowH = Math.max(22, doc.heightOfString(item.descripcion, { width: 220 }) + 12);
        if (y + rowH > pageH - 90) { doc.addPage(); y = 40; }
        doc.rect(margin, y, contentW, rowH)
          .fill(idx % 2 === 0 ? "#ffffff" : "#fafafa").stroke("#e8e8e8");
        doc.fillColor(DARK).fontSize(8).font("Helvetica");
        const cellY = y + 6;
        doc.text(SECTOR_LABELS[item.sector] || item.sector, cols.sector + 6, cellY, { width: 55 });
        doc.font("Helvetica-Bold").text(item.descripcion, cols.desc, cellY, { width: 220 });
        if (item.detalle) {
          doc.font("Helvetica").fillColor(MUTED).fontSize(7)
            .text(item.detalle, cols.desc, cellY + 11, { width: 220 });
        }
        doc.font("Helvetica").fillColor(DARK).fontSize(8);
        doc.text(formatNum(item.cantidad),           cols.cant,  cellY, { width: 35, align: "right" });
        doc.text(`$ ${formatMoney(item.precioUnitario)}`, cols.precio, cellY, { width: 45, align: "right" });
        doc.text(`${formatNum(item.descuento)}%`,    cols.dto,   cellY, { width: 40, align: "right" });
        doc.font("Helvetica-Bold")
          .text(`$ ${formatMoney(item.subtotal)}`,   cols.sub,   cellY, { width: 75, align: "right" });
        y = y + rowH;
      });
      y += 8;

      // ── TOTALS ───────────────────────────────────────────────
      const totW = 210;
      const totX = margin + contentW - totW;
      doc.fillColor(MUTED).fontSize(8).font("Helvetica")
        .text("Subtotal", totX + 6, y + 4, { width: totW / 2 });
      doc.text(`$ ${formatMoney(pres.subtotal)}`, totX, y + 4, { width: totW - 6, align: "right" });
      y += 18;
      if (parseFloat(pres.descuentoGlobal) > 0) {
        const descAmt = (parseFloat(pres.subtotal) * parseFloat(pres.descuentoGlobal) / 100).toFixed(2);
        doc.fillColor(MUTED).fontSize(8).font("Helvetica")
          .text(`Descuento (${pres.descuentoGlobal}%)`, totX + 6, y + 4, { width: totW / 2 });
        doc.text(`- $ ${formatMoney(descAmt)}`, totX, y + 4, { width: totW - 6, align: "right" });
        y += 18;
      }
      doc.roundedRect(totX, y, totW, 22, 4).fill(NAVY);
      doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
        .text("TOTAL", totX + 6, y + 5, { width: totW / 2 });
      doc.text(`$ ${formatMoney(pres.total)}`, totX, y + 5, { width: totW - 6, align: "right" });
      y += 30;

      // ── CONDITIONS ───────────────────────────────────────────
      if (pres.condiciones) {
        const condTextH = doc.heightOfString(pres.condiciones, { width: contentW - 28 });
        const condBoxH  = condTextH + 32;
        doc.roundedRect(margin, y, contentW, condBoxH, 6).stroke("#e0e0e0");
        doc.roundedRect(margin, y, contentW, 22, 6).fill(NAVY);
        doc.rect(margin, y + 12, contentW, 10).fill(NAVY);
        doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold")
          .text("CONDICIONES Y OBSERVACIONES", margin + 14, y + 8, { characterSpacing: 1, width: contentW - 28 });
        doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
          .text(pres.condiciones, margin + 14, y + 26, { width: contentW - 28 });
        y += condBoxH + 10;
      }

      // ── FOOTER ───────────────────────────────────────────────
      const footerY = pageH - 72;
      doc.rect(0, footerY, pageW, 72).fill(FOOTER_BG);
      const logoPath = path.join(process.cwd(), "server", "assets", "hotel-logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, margin, footerY + 14, { width: 95 });
      }
      const cx = margin + 100;
      const cw = contentW - 200;
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica")
        .text(HOTEL_ADDRESS, cx, footerY + 13, { width: cw, align: "center" });
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica")
        .text(`${HOTEL_EMAIL}  ·  ${HOTEL_PHONE}`, cx, footerY + 26, { width: cw, align: "center" });
      doc.fillColor("#cccccc").fontSize(7).font("Helvetica")
        .text("CUIT 33-68110008-9 · Responsable Inscripto", cx, footerY + 40, { width: cw, align: "center" });
      doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
        .text("MARAN.COM.AR", pageW - margin - 100, footerY + 26, { width: 100, align: "right" });

      doc.end();
    } catch (e: any) {
      res.status(500).json({ error: "Error generando PDF", detail: e?.message });
    }
  });
}

function formatFecha(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function formatMoney(v: any): string {
  const n = parseFloat(String(v ?? 0));
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatNum(v: any): string {
  const n = parseFloat(String(v ?? 0));
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
}
