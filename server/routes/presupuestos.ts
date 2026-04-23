import type { Express, Request, Response } from "express";
import { db } from "../db";
import { presupuestos, presupuestoItems } from "@shared/schema";
import { requireAuth } from "../auth";
import { eq, desc, like } from "drizzle-orm";
import PDFDocument from "pdfkit";

const HOTEL_NAME = "Maran Suites & Towers";
const HOTEL_ADDRESS = "San Martín 232, Maran, La Pampa";
const HOTEL_PHONE = "+54 9 2952 000000";
const HOTEL_EMAIL = "info@maransuites.com.ar";

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

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${pres.numero}.pdf"`);
      doc.pipe(res);

      const PRIMARY = "#1a4f8a";
      const LIGHT_GRAY = "#f5f5f5";
      const DARK = "#1a1a1a";
      const MUTED = "#6b6b6b";
      const pageW = 595 - 100;

      // ── HEADER ──────────────────────────────────────────────
      doc.rect(0, 0, 595, 90).fill(PRIMARY);
      doc.fillColor("white").fontSize(22).font("Helvetica-Bold").text(HOTEL_NAME, 50, 22);
      doc.fontSize(9).font("Helvetica").text(HOTEL_ADDRESS, 50, 48);
      doc.text(`${HOTEL_PHONE}  ·  ${HOTEL_EMAIL}`, 50, 61);

      // Número de presupuesto en la derecha del header
      doc.fontSize(10).font("Helvetica-Bold").text(pres.numero, 50, 22, { align: "right", width: pageW });
      doc.fontSize(9).font("Helvetica").fillColor("#cde").text("PRESUPUESTO", 50, 36, { align: "right", width: pageW });

      doc.y = 110;
      doc.fillColor(DARK);

      // ── INFO SECTION ────────────────────────────────────────
      doc.rect(50, doc.y, pageW, 68).fill(LIGHT_GRAY).stroke("#e0e0e0");
      const infoY = doc.y + 10;
      doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text("DIRIGIDO A", 62, infoY);
      doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text(pres.para, 62, infoY + 12);
      const emisY = infoY;
      const col2 = 340;
      doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text("FECHA EMISIÓN", col2, emisY);
      doc.fillColor(DARK).fontSize(10).font("Helvetica").text(formatFecha(pres.fechaEmision), col2, emisY + 12);
      if (pres.fechaVencimiento) {
        doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text("VÁLIDO HASTA", col2, emisY + 30);
        doc.fillColor(DARK).fontSize(10).font("Helvetica").text(formatFecha(pres.fechaVencimiento), col2, emisY + 42);
      }
      doc.y += 80;

      if (pres.notas) {
        doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(pres.notas, 50, doc.y, { width: pageW });
        doc.moveDown(0.5);
      }

      doc.moveDown(0.5);

      // ── TABLE HEADER ────────────────────────────────────────
      const cols = { sector: 50, desc: 110, cant: 335, precio: 375, dto: 425, sub: 470 };
      doc.rect(50, doc.y, pageW, 18).fill(PRIMARY);
      doc.fillColor("white").fontSize(8).font("Helvetica-Bold");
      const thY = doc.y + 5;
      doc.text("SECTOR", cols.sector, thY, { width: 55 });
      doc.text("DESCRIPCIÓN", cols.desc, thY, { width: 220 });
      doc.text("CANT", cols.cant, thY, { width: 35, align: "right" });
      doc.text("PRECIO", cols.precio, thY, { width: 45, align: "right" });
      doc.text("DTO%", cols.dto, thY, { width: 40, align: "right" });
      doc.text("SUBTOTAL", cols.sub, thY, { width: 75, align: "right" });
      doc.y += 20;

      // ── TABLE ROWS ──────────────────────────────────────────
      const SECTOR_LABELS: Record<string, string> = {
        alojamiento: "Alojamiento", restaurant: "Restaurant", spa: "SPA", evento: "Evento", otro: "Otro",
      };
      items.forEach((item, idx) => {
        const rowH = Math.max(22, doc.heightOfString(item.descripcion, { width: 220 }) + 12);
        if (doc.y + rowH > 750) { doc.addPage(); doc.y = 50; }
        const rowY = doc.y;
        if (idx % 2 === 0) doc.rect(50, rowY, pageW, rowH).fill("#fafafa");
        doc.rect(50, rowY, pageW, rowH).stroke("#e8e8e8");
        doc.fillColor(DARK).fontSize(8).font("Helvetica");
        const cellY = rowY + 6;
        doc.text(SECTOR_LABELS[item.sector] || item.sector, cols.sector, cellY, { width: 55 });
        doc.font("Helvetica-Bold").text(item.descripcion, cols.desc, cellY, { width: 220 });
        if (item.detalle) {
          doc.font("Helvetica").fillColor(MUTED).fontSize(7)
            .text(item.detalle, cols.desc, cellY + 11, { width: 220 });
        }
        doc.font("Helvetica").fillColor(DARK).fontSize(8);
        doc.text(formatNum(item.cantidad), cols.cant, cellY, { width: 35, align: "right" });
        doc.text(`$ ${formatMoney(item.precioUnitario)}`, cols.precio, cellY, { width: 45, align: "right" });
        doc.text(`${formatNum(item.descuento)}%`, cols.dto, cellY, { width: 40, align: "right" });
        doc.font("Helvetica-Bold").text(`$ ${formatMoney(item.subtotal)}`, cols.sub, cellY, { width: 75, align: "right" });
        doc.y = rowY + rowH;
      });

      doc.moveDown(0.5);

      // ── TOTALS ──────────────────────────────────────────────
      const totW = 200;
      const totX = 595 - 50 - totW;
      const drawTotRow = (label: string, val: string, bold = false, bg?: string) => {
        const rH = 18;
        if (bg) doc.rect(totX, doc.y, totW, rH).fill(bg);
        doc.fillColor(bold ? DARK : MUTED).fontSize(bold ? 10 : 8)
          .font(bold ? "Helvetica-Bold" : "Helvetica");
        doc.text(label, totX + 6, doc.y + 4, { width: totW / 2 });
        doc.text(val, totX, doc.y - rH + 4, { width: totW - 6, align: "right" });
        doc.y += rH;
      };
      drawTotRow("Subtotal", `$ ${formatMoney(pres.subtotal)}`);
      if (parseFloat(pres.descuentoGlobal) > 0) {
        drawTotRow(`Descuento (${pres.descuentoGlobal}%)`, `- $ ${formatMoney((parseFloat(pres.subtotal) * parseFloat(pres.descuentoGlobal) / 100).toFixed(2))}`);
      }
      doc.rect(totX, doc.y, totW, 22).fill(PRIMARY);
      doc.fillColor("white").fontSize(12).font("Helvetica-Bold");
      doc.text("TOTAL", totX + 6, doc.y + 5, { width: totW / 2 });
      doc.text(`$ ${formatMoney(pres.total)}`, totX, doc.y + 5, { width: totW - 6, align: "right" });
      doc.y += 24;

      // ── CONDICIONES ─────────────────────────────────────────
      if (pres.condiciones) {
        doc.moveDown(1);
        doc.rect(50, doc.y, pageW, 12).fill(LIGHT_GRAY);
        doc.fillColor(PRIMARY).fontSize(8).font("Helvetica-Bold")
          .text("CONDICIONES Y OBSERVACIONES", 56, doc.y + 2);
        doc.y += 14;
        doc.fillColor(MUTED).fontSize(8).font("Helvetica")
          .text(pres.condiciones, 50, doc.y, { width: pageW });
      }

      // ── FOOTER ──────────────────────────────────────────────
      doc.fontSize(7).fillColor(MUTED).font("Helvetica")
        .text(`${HOTEL_NAME}  ·  ${HOTEL_ADDRESS}  ·  ${HOTEL_EMAIL}`, 50, 790, {
          width: pageW, align: "center",
        });

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
