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

      // Fetch editable T&C from system settings (same as confirmation PDF)
      const DEFAULT_TERMINOS = [
        "La tarifa incluye desayuno buffet y gimnasio con turno previo.",
        "La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.",
        "Nuestro horario de Check-in es a partir de las 15:00 hs y el Check-out es hasta las 10:00 hs.",
        "Early Check-in o Late Check-out tienen costo adicional del 50% del valor de una noche.",
        "Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI / PASAPORTE / CÉDULA DE IDENTIDAD. En el caso de viajar con menores de edad deberá presentar su correspondiente identificación.",
        "La entrega de la habitación queda condicionada al pago total del alojamiento al momento del check-in. Los comprobantes, constancias de transferencia, capturas de pantalla o avisos de pago no constituyen pago válido hasta la efectiva acreditación del importe en los medios de cobro habilitados por el hotel. Ante la falta de acreditación, el hotel podrá exigir el pago por otro medio aceptado y suspender el ingreso a la habitación hasta la regularización total del saldo correspondiente.",
      ];
      let terminos = DEFAULT_TERMINOS;
      try {
        const termSetting = await storage.getSystemSetting("confirmation_terms");
        if (termSetting !== null && termSetting !== undefined) {
          // Setting exists in DB — respect it even if empty (user cleared it on purpose)
          terminos = termSetting.value
            ? termSetting.value.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0)
            : [];
        }
      } catch (_) { /* fallback to default */ }

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
      const DARK    = "#1a1a1a";
      const MUTED   = "#6b6b6b";

      // ── FULL PAGE BACKGROUND (header + footer baked in) ─────
      const headerH = 148;
      const headerImgPath = path.join(process.cwd(), "server", "assets", "confirmacion-header.jpg");
      const drawPageBackground = () => {
        if (fs.existsSync(headerImgPath)) {
          doc.image(headerImgPath, 0, 0, { width: pageW, height: pageH });
        } else {
          doc.rect(0, 0, pageW, headerH).fill(NAVY);
          doc.rect(0, headerH, pageW, 5).fill(ORANGE);
          doc.rect(0, pageH - 90, pageW, 90).fill("#8b4513");
        }
      };
      drawPageBackground();

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

      // ── TABLE ────────────────────────────────────────────────
      // Without DTO% column — redistribute width to desc, precio and sub
      const cols = {
        sector: margin,           // 40
        desc:   margin + 62,      // 102
        cant:   margin + 272,     // 312
        precio: margin + 312,     // 352
        sub:    margin + 420,     // 460
      };
      const W = { sector: 58, desc: 205, cant: 32, precio: 98, sub: 95 };
      doc.roundedRect(margin, y, contentW, 20, 4).fill(NAVY);
      doc.fillColor("white").fontSize(8).font("Helvetica-Bold");
      const thY = y + 6;
      doc.text("SECTOR",      cols.sector + 6, thY, { width: W.sector });
      doc.text("DESCRIPCIÓN", cols.desc,       thY, { width: W.desc });
      doc.text("CANT",        cols.cant,        thY, { width: W.cant,   align: "right" });
      doc.text("PRECIO",      cols.precio,      thY, { width: W.precio, align: "right" });
      doc.text("SUBTOTAL",    cols.sub,         thY, { width: W.sub,    align: "right" });
      y += 22;

      const SECTOR_LABELS: Record<string, string> = {
        alojamiento: "Alojamiento", restaurant: "Restaurant",
        spa: "SPA", evento: "Evento", otro: "Otro",
      };
      items.forEach((item, idx) => {
        const descH   = doc.heightOfString(item.descripcion, { width: W.desc, fontSize: 8 });
        const detailH = item.detalle
          ? doc.heightOfString(item.detalle, { width: W.desc, fontSize: 7 }) + 5
          : 0;
        const rowH = Math.max(22, descH + detailH + 14);
        if (y + rowH > pageH - 100) { doc.addPage(); drawPageBackground(); y = headerH + 10; }
        doc.rect(margin, y, contentW, rowH)
          .fill(idx % 2 === 0 ? "#ffffff" : "#fafafa").stroke("#e8e8e8");
        doc.fillColor(DARK).fontSize(8).font("Helvetica");
        const cellY = y + 6;
        doc.text(SECTOR_LABELS[item.sector] || item.sector, cols.sector + 6, cellY, { width: W.sector });
        doc.font("Helvetica-Bold").text(item.descripcion, cols.desc, cellY, { width: W.desc });
        if (item.detalle) {
          doc.font("Helvetica").fillColor(MUTED).fontSize(7)
            .text(item.detalle, cols.desc, cellY + descH + 3, { width: W.desc });
        }
        doc.font("Helvetica").fillColor(DARK).fontSize(8);
        doc.text(formatNum(item.cantidad),                cols.cant,  cellY, { width: W.cant,   align: "right" });
        doc.text(`$ ${formatMoney(item.precioUnitario)}`, cols.precio, cellY, { width: W.precio, align: "right" });
        doc.font("Helvetica-Bold")
          .text(`$ ${formatMoney(item.subtotal)}`,        cols.sub,   cellY, { width: W.sub,    align: "right" });
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

      // ── CONDITIONS (editable) ────────────────────────────────
      if (pres.condiciones) {
        const condLines = pres.condiciones.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        let condBodyH = 10;
        for (const line of condLines) {
          condBodyH += doc.heightOfString(line, { width: contentW - 28 }) + 5;
        }
        const condBoxH = 24 + condBodyH + 8;
        if (y + condBoxH > pageH - 100) { doc.addPage(); drawPageBackground(); y = headerH + 10; }
        doc.roundedRect(margin, y, contentW, condBoxH, 6).stroke("#e0e0e0");
        doc.roundedRect(margin, y, contentW, 22, 6).fill(NAVY);
        doc.rect(margin, y + 12, contentW, 10).fill(NAVY);
        doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold")
          .text("CONDICIONES Y OBSERVACIONES", margin + 14, y + 8, { characterSpacing: 1, width: contentW - 28 });
        let cy = y + 28;
        for (const line of condLines) {
          if (cy > pageH - 110) { doc.addPage(); drawPageBackground(); cy = headerH + 10; }
          doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
            .text(line, margin + 14, cy, { width: contentW - 28 });
          cy += doc.heightOfString(line, { width: contentW - 28 }) + 5;
        }
        y += condBoxH + 10;
      }

      // ── TÉRMINOS Y CONDICIONES (auto from system settings) ───
      if (terminos.length > 0) {
        let tcBodyH = 10;
        for (const t of terminos) {
          tcBodyH += doc.heightOfString(t, { width: contentW - 30 }) + 6;
        }
        const tcH = 24 + tcBodyH + 8;
        if (y + tcH > pageH - 100) { doc.addPage(); drawPageBackground(); y = headerH + 10; }
        doc.roundedRect(margin, y, contentW, tcH, 6).stroke("#e0e0e0");
        doc.roundedRect(margin, y, contentW, 22, 6).fill(NAVY);
        doc.rect(margin, y + 12, contentW, 10).fill(NAVY);
        doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold")
          .text("TÉRMINOS Y CONDICIONES", margin + 14, y + 8, { characterSpacing: 1.5, width: contentW - 28 });
        let ty = y + 28;
        terminos.forEach((t, i) => {
          if (ty > pageH - 110) { doc.addPage(); drawPageBackground(); ty = headerH + 10; }
          const lineH = doc.heightOfString(`${i + 1}.  ${t}`, { width: contentW - 28 });
          doc.fillColor("#333333").fontSize(8).font("Helvetica")
            .text(`${i + 1}.  ${t}`, margin + 14, ty, { width: contentW - 28 });
          ty += lineH + 6;
        });
      }

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
