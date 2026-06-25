import type { Express } from "express";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { storage } from "../db-storage";
import { requireAuth } from "../auth";
import type { FolioEntityType, FolioStatus, FolioWithMovements } from "@shared/schema";

const HOTEL_NAME    = "Maran Suites & Towers";
const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE   = "+54 (0343) 503-8070";
const HOTEL_EMAIL   = "recepcion@maran.com.ar";

const ENTITY_LABELS: Record<string, string> = {
  reservation: "Reserva",
  restaurant_order: "Orden Restaurant",
  spa_account: "Cuenta SPA",
  group: "Grupo",
  event: "Evento",
  company: "Empresa",
  agency: "Agencia",
};

const MOVEMENT_LABELS: Record<string, string> = {
  charge: "Cargo",
  payment: "Pago",
  advance: "Anticipo",
  discount: "Descuento",
  adjustment: "Ajuste",
  transfer_in: "Transferencia entrada",
  transfer_out: "Transferencia salida",
  void: "Anulación",
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  cash: "Efectivo",
  tarjeta_debito: "Tarj. Débito",
  debit_card: "Tarj. Débito",
  tarjeta_credito: "Tarj. Crédito",
  credit_card: "Tarj. Crédito",
  transferencia: "Transferencia",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cta. Corriente",
  current_account: "Cta. Corriente",
  room_charge: "Cargo a Habitación",
};

function genFolioPDF(folio: FolioWithMovements, entityLabel?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fmtCurrency = (n: string | number) =>
      `$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (iso: string) => {
      try {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } catch { return iso; }
    };

    const pageW   = 595;
    const pageH   = 842;
    const margin  = 40;
    const cW      = pageW - margin * 2;   // content width = 515
    const L       = margin;
    const R       = pageW - margin;
    const NAVY    = "#1a3a6c";
    const ORANGE  = "#e8841a";
    const FOOTER_BG = "#8b4513";
    const DARK    = "#1a1a1a";
    const MUTED   = "#6b6b6b";
    const slate   = "#4a5568";
    const lightBg = "#f7f9fc";
    const rowAlt  = "#edf2f7";
    const green   = "#276749";
    const red     = "#9b2335";
    const balOrange = "#c05621";

    // ── HEADER IMAGE (mismo que presupuestos) ────────────────────────────
    const headerH = 148;
    const headerImgPath = path.join(process.cwd(), "server", "assets", "confirmacion-header.jpg");
    if (fs.existsSync(headerImgPath)) {
      doc.image(headerImgPath, 0, 0, { width: pageW, height: headerH, cover: [pageW, headerH] });
    } else {
      doc.rect(0, 0, pageW, headerH).fill(NAVY);
    }
    doc.rect(0, headerH, pageW, 5).fill(ORANGE);

    // ── TÍTULO + CÓDIGO FOLIO ────────────────────────────────────────────
    const titleY = headerH + 16;
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
       .text("ESTADO DE CUENTA", margin, titleY, { characterSpacing: 2 });
    doc.fillColor(DARK).fontSize(17).font("Helvetica-Bold")
       .text(HOTEL_NAME, margin, titleY + 11, { width: 300 });
    doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
       .text("Hotel & Spa · Paraná, Entre Ríos", margin, titleY + 33);

    // Code box (right) — folio código + estado
    const statusLabel = folio.status === "open" ? "ABIERTO" : folio.status === "closed" ? "CERRADO" : "FACTURADO";
    const codeBoxW = 138;
    const codeBoxX = pageW - margin - codeBoxW;
    doc.roundedRect(codeBoxX, titleY, codeBoxW, 44, 5).fillAndStroke("#f8f4ef", ORANGE);
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
       .text("FOLIO", codeBoxX, titleY + 7, { width: codeBoxW, align: "center", characterSpacing: 0.3 });
    doc.fillColor("#333333").fontSize(11).font("Helvetica-Bold")
       .text(folio.codigo, codeBoxX, titleY + 19, { width: codeBoxW, align: "center" });
    doc.fillColor("#aaaaaa").fontSize(7).font("Helvetica")
       .text(statusLabel, codeBoxX, titleY + 33, { width: codeBoxW, align: "center" });

    // ── INFO BAR ─────────────────────────────────────────────────────────
    let y = titleY + 56;
    doc.moveTo(margin, y).lineTo(R, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 10;

    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Tipo de cuenta", L, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
       .text(ENTITY_LABELS[folio.entityType] ?? folio.entityType, L, y + 11);

    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Fecha apertura", L + 155, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
       .text(fmtDate(folio.openedAt ?? ""), L + 155, y + 11);

    if (folio.closedAt) {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Fecha cierre", L + 310, y);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
         .text(fmtDate(folio.closedAt), L + 310, y + 11);
    }

    y += 28;
    doc.moveTo(margin, y).lineTo(R, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 10;

    // ── REFERENCIA ───────────────────────────────────────────────────────
    if (entityLabel) {
      doc.roundedRect(L, y, cW, 24, 4).fillAndStroke("#fffbf0", ORANGE);
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Referencia:", L + 8, y + 5);
      const refText = entityLabel.length > 92 ? entityLabel.slice(0, 92) + "…" : entityLabel;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text(refText, L + 72, y + 5, { width: cW - 80 });
      y += 32;
    } else {
      y += 4;
    }

    // ── TABLA: header ────────────────────────────────────────────────────
    y += 6;
    const COL = { date: L, type: L + 100, method: L + 190, desc: L + 295, amt: R };
    const ROW_H = 18;

    doc.roundedRect(L, y, cW, ROW_H, 3).fill(NAVY);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("white");
    doc.text("Fecha / Hora",  COL.date   + 4, y + 5);
    doc.text("Tipo",          COL.type   + 4, y + 5);
    doc.text("Método pago",   COL.method + 4, y + 5);
    doc.text("Descripción",   COL.desc   + 4, y + 5);
    doc.text("Importe",       COL.amt - 55,   y + 5, { width: 55, align: "right" });
    y += ROW_H;

    // ── TABLA: rows ───────────────────────────────────────────────────────
    if (folio.movements.length === 0) {
      doc.rect(L, y, cW, 28).fill(lightBg);
      doc.font("Helvetica").fontSize(9).fillColor(MUTED)
         .text("Sin movimientos registrados.", L + 10, y + 9);
      y += 28;
    } else {
      for (let i = 0; i < folio.movements.length; i++) {
        const m = folio.movements[i];
        const isDebit = ["charge", "transfer_in"].includes(m.type);
        const rowBg = i % 2 === 0 ? "#ffffff" : "#fafafa";
        doc.rect(L, y, cW, ROW_H).fill(rowBg).stroke("#eeeeee");

        doc.font("Helvetica").fontSize(8).fillColor(MUTED)
           .text(fmtDate(m.createdAt ?? ""), COL.date + 4, y + 5, { width: 92 });
        doc.fillColor(DARK)
           .text(MOVEMENT_LABELS[m.type] ?? m.type, COL.type + 4, y + 5, { width: 90 });
        const payLabel = m.paymentMethod ? (PAYMENT_LABELS[m.paymentMethod] ?? m.paymentMethod) : "—";
        doc.fillColor(MUTED)
           .text(payLabel, COL.method + 4, y + 5, { width: 100 });
        const desc = m.description && m.description.length > 28 ? m.description.slice(0, 28) + "…" : (m.description || "—");
        doc.fillColor(DARK)
           .text(desc, COL.desc + 4, y + 5, { width: 98 });
        doc.font("Helvetica-Bold").fontSize(8)
           .fillColor(isDebit ? red : green)
           .text(fmtCurrency(m.amount), COL.amt - 55, y + 5, { width: 55, align: "right" });

        y += ROW_H;
        if (y > pageH - 100) {
          doc.addPage();
          y = 40;
          doc.roundedRect(L, y, cW, ROW_H, 3).fill(NAVY);
          doc.font("Helvetica-Bold").fontSize(8).fillColor("white");
          doc.text("Fecha / Hora",  COL.date   + 4, y + 5);
          doc.text("Tipo",          COL.type   + 4, y + 5);
          doc.text("Método pago",   COL.method + 4, y + 5);
          doc.text("Descripción",   COL.desc   + 4, y + 5);
          doc.text("Importe",       COL.amt - 55,   y + 5, { width: 55, align: "right" });
          y += ROW_H;
        }
      }
    }

    // ── TOTALES ───────────────────────────────────────────────────────────
    y += 14;
    doc.moveTo(L, y).lineTo(R, y).strokeColor(ORANGE).lineWidth(1).stroke();
    y += 12;

    const totalPanelX = R - 200;
    const balance = parseFloat(folio.balance ?? "0");

    const totals = [
      { label: "Total Cargos",  value: folio.totalCharges ?? "0",  color: red },
      { label: "Total Pagado",  value: folio.totalPayments ?? "0", color: green },
    ];
    for (const t of totals) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED)
         .text(t.label, totalPanelX, y, { width: 100 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(t.color)
         .text(fmtCurrency(t.value), totalPanelX + 104, y, { width: 92, align: "right" });
      y += 15;
    }

    // Saldo final
    y += 4;
    const saldoColor = balance > 0 ? balOrange : balance < 0 ? "#2b6cb0" : green;
    const saldoLabel = balance > 0 ? "SALDO PENDIENTE" : balance < 0 ? "SALDO A FAVOR" : "SALDO SALDADO";
    doc.roundedRect(totalPanelX - 6, y - 5, 202, 28, 4)
       .fill(balance > 0 ? "#fff5e6" : balance < 0 ? "#ebf4ff" : "#f0fff4");
    doc.rect(totalPanelX - 6, y - 5, 3, 28).fill(saldoColor);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(saldoColor)
       .text(saldoLabel, totalPanelX, y, { width: 100 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(saldoColor)
       .text(fmtCurrency(balance), totalPanelX + 100, y - 1, { width: 96, align: "right" });

    // ── FOOTER (mismo que presupuestos) ───────────────────────────────────
    const footerY = pageH - 72;
    doc.rect(0, footerY, pageW, 72).fill(FOOTER_BG);
    const logoPath = path.join(process.cwd(), "server", "assets", "hotel-logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, footerY + 14, { width: 95 });
    }
    const cx = margin + 100;
    const cw = cW - 200;
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica")
       .text(HOTEL_ADDRESS, cx, footerY + 13, { width: cw, align: "center" });
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica")
       .text(`${HOTEL_EMAIL}  ·  ${HOTEL_PHONE}`, cx, footerY + 26, { width: cw, align: "center" });
    doc.fillColor("#cccccc").fontSize(7).font("Helvetica")
       .text("CUIT 33-68110008-9 · Responsable Inscripto", cx, footerY + 40, { width: cw, align: "center" });
    doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
       .text("MARAN.COM.AR", pageW - margin - 100, footerY + 26, { width: 100, align: "right" });

    doc.end();
  });
}

export function registerFolioRoutes(app: Express) {

  // Balance breakdown by entity type — MUST be before /:entityType/:entityId
  app.get("/api/folios/stats/by-entity-type", requireAuth, async (req, res) => {
    try {
      const { db } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(sql`
        SELECT
          entity_type,
          COUNT(*) AS total_folios,
          COUNT(*) FILTER (WHERE status = 'open') AS open_folios,
          COALESCE(SUM(balance::numeric) FILTER (WHERE status = 'open' AND balance::numeric > 0), 0) AS pending_balance,
          COALESCE(SUM(total_charges::numeric), 0) AS total_charges,
          COALESCE(SUM(total_payments::numeric), 0) AS total_payments
        FROM folios
        GROUP BY entity_type
        ORDER BY pending_balance DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching folio breakdown:", error);
      res.status(500).json({ error: "Error al obtener desglose" });
    }
  });

  // MUST be before /:entityType/:entityId to avoid route collision
  app.get("/api/folios/stats/summary", requireAuth, async (req, res) => {
    try {
      const { db } = await import("../db");
      const { folios } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      const [totals] = await db.select({
        open: sql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
        closed: sql<number>`COUNT(*) FILTER (WHERE status = 'closed')`,
        total_balance: sql<number>`COALESCE(SUM(balance::numeric), 0)`,
        total_charges: sql<number>`COALESCE(SUM(total_charges::numeric), 0)`,
        total_payments: sql<number>`COALESCE(SUM(total_payments::numeric), 0)`,
      }).from(folios);

      res.json({
        openFolios: Number(totals.open),
        closedFolios: Number(totals.closed),
        totalBalance: Number(totals.total_balance),
        totalCharges: Number(totals.total_charges),
        totalPayments: Number(totals.total_payments),
      });
    } catch (error) {
      console.error("Error fetching folio stats:", error);
      res.status(500).json({ error: "Error al obtener estadísticas de folios" });
    }
  });

  // Daily movements — all folio_movements for a given date across all modules
  app.get("/api/folios/movements/by-date", requireAuth, async (req, res) => {
    try {
      const { db } = await import("../db");
      const { sql } = await import("drizzle-orm");

      const date = (req.query.date as string) || new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const entityType = req.query.entityType as string | undefined;
      const movType = req.query.type as string | undefined;

      let query = sql`
        SELECT
          fm.id,
          fm.folio_id,
          fm.type,
          fm.amount,
          fm.description,
          fm.source_type,
          fm.source_id,
          fm.payment_method,
          fm.registered_by,
          fm.receipt_type,
          fm.created_at,
          f.codigo,
          f.entity_type,
          f.entity_id
        FROM folio_movements fm
        JOIN folios f ON fm.folio_id = f.id
        WHERE DATE(fm.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = ${date}
      `;

      if (entityType && entityType !== "all") {
        query = sql`${query} AND f.entity_type = ${entityType}`;
      }
      if (movType && movType !== "all") {
        query = sql`${query} AND fm.type = ${movType}`;
      }

      query = sql`${query} ORDER BY fm.created_at ASC`;

      const result = await db.execute(query);

      const rows = result.rows.map((r: any) => ({
        id: r.id,
        folioId: r.folio_id,
        type: r.type,
        amount: r.amount,
        description: r.description,
        sourceType: r.source_type,
        sourceId: r.source_id,
        paymentMethod: r.payment_method,
        registeredBy: r.registered_by,
        receiptType: r.receipt_type,
        createdAt: r.created_at,
        folioCodigo: r.codigo,
        entityType: r.entity_type,
        entityId: r.entity_id,
      }));

      // Daily totals
      const charges = rows.filter((r: any) => ["charge", "transfer_in"].includes(r.type)).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const payments = rows.filter((r: any) => ["payment", "advance"].includes(r.type)).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const discounts = rows.filter((r: any) => r.type === "discount").reduce((s: number, r: any) => s + Number(r.amount), 0);

      res.json({ date, movements: rows, totals: { charges, payments, discounts } });
    } catch (error) {
      console.error("Error fetching daily movements:", error);
      res.status(500).json({ error: "Error al obtener movimientos del día" });
    }
  });

  // PDF export — must be before /:entityType/:entityId
  app.get("/api/folios/:entityType/:entityId/pdf", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const folio = await storage.getFolioWithMovementsByEntity(
        entityType as FolioEntityType, entityId,
      );
      if (!folio) return res.status(404).json({ error: "Folio no encontrado" });

      // Try to build a readable entity label
      let entityLabel = entityId;
      try {
        if (entityType === "reservation") {
          const resv = await storage.getReservation(entityId);
          if (resv) {
            const g = resv.guest as any;
            const guestName = g
              ? (g.tipoPersona === "juridica"
                  ? (g.firstName ?? "")
                  : `${g.lastName ?? ""} ${g.firstName ?? ""}`.trim())
              : "";
            const room = (resv as any).room?.roomNumber ?? resv.roomId;
            entityLabel = `${resv.reservationCode} — ${guestName} — Hab. ${room} (${resv.checkInDate} → ${resv.checkOutDate})`;
          }
        } else if (entityType === "event") {
          const evt = await storage.getEvent(entityId);
          if (evt) entityLabel = `${evt.name} (${evt.eventDate ?? ""})`;
        } else if (entityType === "group") {
          const grp = await storage.getGroup(entityId);
          if (grp) entityLabel = `${grp.name}`;
        }
      } catch { /* non-critical */ }

      const pdf = await genFolioPDF(folio, entityLabel);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="folio-${folio.codigo}.pdf"`);
      res.send(pdf);
    } catch (error) {
      console.error("Error generating folio PDF:", error);
      res.status(500).json({ error: "Error generando el PDF del folio" });
    }
  });

  app.get("/api/folios/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const folio = await storage.getFolioWithMovementsByEntity(
        entityType as FolioEntityType,
        entityId,
      );
      if (!folio) {
        return res.json(null);
      }
      res.json(folio);
    } catch (error) {
      console.error("Error fetching folio:", error);
      res.status(500).json({ error: "Error al obtener el folio" });
    }
  });

  app.post("/api/folios/:entityType/:entityId/ensure", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const folio = await storage.getOrCreateFolio(entityType as FolioEntityType, entityId);
      res.json(folio);
    } catch (error) {
      console.error("Error creating folio:", error);
      res.status(500).json({ error: "Error al crear el folio" });
    }
  });

  app.post("/api/folios/:folioId/movements", requireAuth, async (req, res) => {
    try {
      const { folioId } = req.params;
      const folio = await storage.getFolioById(folioId);
      if (!folio) return res.status(404).json({ error: "Folio no encontrado" });

      const { type, amount, description, paymentMethod, sourceType, sourceId, registeredBy, receiptType } = req.body;
      const movement = await storage.addFolioAdjustment(
        folioId, type, parseFloat(amount), description,
        registeredBy, undefined, undefined,
      );
      res.status(201).json(movement);
    } catch (error) {
      console.error("Error adding folio movement:", error);
      res.status(500).json({ error: "Error al agregar movimiento al folio" });
    }
  });

  app.post("/api/folios/:folioId/close", requireAuth, async (req, res) => {
    try {
      const { folioId } = req.params;
      const user = (req as any).user;
      const folio = await storage.closeFolio(folioId, user?.username || "sistema");
      res.json(folio);
    } catch (error) {
      console.error("Error closing folio:", error);
      res.status(500).json({ error: "Error al cerrar el folio" });
    }
  });

  app.post("/api/folios/:folioId/reopen", requireAuth, async (req, res) => {
    try {
      const { folioId } = req.params;
      const [updated] = await (await import("../db")).db
        .update((await import("@shared/schema")).folios)
        .set({ status: "open", closedAt: null, closedBy: null })
        .where((await import("drizzle-orm")).eq((await import("@shared/schema")).folios.id, folioId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Folio no encontrado" });
      res.json(updated);
    } catch (error) {
      console.error("Error reopening folio:", error);
      res.status(500).json({ error: "Error al reabrir el folio" });
    }
  });

  app.get("/api/folios", requireAuth, async (req, res) => {
    try {
      const { entityType, status } = req.query;
      const result = await storage.listFolios(
        entityType as FolioEntityType | undefined,
        status as FolioStatus | undefined,
      );
      res.json(result);
    } catch (error) {
      console.error("Error listing folios:", error);
      res.status(500).json({ error: "Error al listar folios" });
    }
  });

}
