import type { Express } from "express";
import PDFDocument from "pdfkit";
import { storage } from "../db-storage";
import { requireAuth } from "../auth";
import type { FolioEntityType, FolioStatus, FolioWithMovements } from "@shared/schema";

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

    const L = 45;          // left margin
    const R = 550;         // right edge
    const W = R - L;       // usable width = 505
    const navy   = "#1a3a5c";
    const gold   = "#b8963e";
    const slate  = "#4a5568";
    const lightBg = "#f7f9fc";
    const rowAlt  = "#edf2f7";
    const green  = "#276749";
    const red    = "#9b2335";
    const orange = "#c05621";

    // ── Header band ─────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 90).fill(navy);

    // Hotel name
    doc.fillColor("white").font("Helvetica-Bold").fontSize(22)
       .text("MARAN SUITES & TORRES", L, 18, { width: 320 });
    doc.font("Helvetica").fontSize(9).fillColor("#aac4e0")
       .text("Av. Urquiza 1220  |  Paraná, Entre Ríos  |  Tel: (343) 400-0000", L, 46);

    // Folio badge — right side
    doc.font("Helvetica").fontSize(9).fillColor("#aac4e0")
       .text("FOLIO", R - 110, 20, { width: 110, align: "right" });
    doc.font("Helvetica-Bold").fontSize(18).fillColor("white")
       .text(folio.codigo, R - 140, 34, { width: 140, align: "right" });
    const statusLabel = folio.status === "open" ? "ABIERTO" : folio.status === "closed" ? "CERRADO" : "FACTURADO";
    const statusColor = folio.status === "open" ? "#68d391" : folio.status === "closed" ? "#90cdf4" : "#fbd38d";
    doc.font("Helvetica-Bold").fontSize(8).fillColor(statusColor)
       .text(statusLabel, R - 140, 58, { width: 140, align: "right" });

    // ── Info bar ────────────────────────────────────────────────────────
    doc.rect(0, 90, 595, 44).fill(lightBg);
    doc.moveTo(0, 134).lineTo(595, 134).strokeColor(gold).lineWidth(1.5).stroke();

    const infoY = 100;
    const col = (i: number) => L + i * 155;

    doc.font("Helvetica").fontSize(8).fillColor(slate).text("Tipo de cuenta", col(0), infoY);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a202c")
       .text(ENTITY_LABELS[folio.entityType] ?? folio.entityType, col(0), infoY + 12);

    doc.font("Helvetica").fontSize(8).fillColor(slate).text("Fecha apertura", col(1), infoY);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a202c")
       .text(fmtDate(folio.openedAt ?? ""), col(1), infoY + 12);

    if (folio.closedAt) {
      doc.font("Helvetica").fontSize(8).fillColor(slate).text("Fecha cierre", col(2), infoY);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a202c")
         .text(fmtDate(folio.closedAt), col(2), infoY + 12);
    }

    // ── Reference block ─────────────────────────────────────────────────
    let y = 146;
    if (entityLabel) {
      doc.rect(L, y, W, 26).fill("#fffbeb");
      doc.rect(L, y, 3, 26).fill(gold);
      doc.font("Helvetica").fontSize(8).fillColor(slate).text("Referencia:", L + 10, y + 5);
      const refText = entityLabel.length > 90 ? entityLabel.slice(0, 90) + "…" : entityLabel;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a202c").text(refText, L + 72, y + 5);
      y += 34;
    } else {
      y += 10;
    }

    // ── Section title ────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(10).fillColor(navy)
       .text("DETALLE DE MOVIMIENTOS", L, y);
    doc.moveTo(L, y + 14).lineTo(R, y + 14).strokeColor(navy).lineWidth(0.5).stroke();
    y += 20;

    // ── Table header ─────────────────────────────────────────────────────
    const COL = { date: L, type: L + 100, method: L + 190, desc: L + 295, amt: R };
    const ROW_H = 18;

    doc.rect(L, y, W, ROW_H).fill(navy);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("white");
    doc.text("Fecha / Hora",  COL.date   + 4, y + 5);
    doc.text("Tipo",          COL.type   + 4, y + 5);
    doc.text("Método pago",   COL.method + 4, y + 5);
    doc.text("Descripción",   COL.desc   + 4, y + 5);
    doc.text("Importe",       COL.amt - 55,   y + 5, { width: 55, align: "right" });
    y += ROW_H;

    // ── Rows ─────────────────────────────────────────────────────────────
    if (folio.movements.length === 0) {
      doc.rect(L, y, W, 28).fill(lightBg);
      doc.font("Helvetica").fontSize(9).fillColor(slate)
         .text("Sin movimientos registrados.", L + 10, y + 9);
      y += 28;
    } else {
      for (let i = 0; i < folio.movements.length; i++) {
        const m = folio.movements[i];
        const isDebit = ["charge", "transfer_in"].includes(m.type);
        const rowBg = i % 2 === 0 ? "white" : rowAlt;
        doc.rect(L, y, W, ROW_H).fill(rowBg);

        doc.font("Helvetica").fontSize(8).fillColor(slate)
           .text(fmtDate(m.createdAt ?? ""), COL.date + 4, y + 5, { width: 92 });
        doc.fillColor("#1a202c")
           .text(MOVEMENT_LABELS[m.type] ?? m.type, COL.type + 4, y + 5, { width: 90 });
        const payLabel = m.paymentMethod ? (PAYMENT_LABELS[m.paymentMethod] ?? m.paymentMethod) : "—";
        doc.fillColor(slate)
           .text(payLabel, COL.method + 4, y + 5, { width: 100 });
        const desc = m.description && m.description.length > 28 ? m.description.slice(0, 28) + "…" : (m.description || "—");
        doc.fillColor("#1a202c")
           .text(desc, COL.desc + 4, y + 5, { width: 98 });
        doc.font("Helvetica-Bold").fontSize(8)
           .fillColor(isDebit ? red : green)
           .text(fmtCurrency(m.amount), COL.amt - 55, y + 5, { width: 55, align: "right" });

        y += ROW_H;
        if (y > 730) {
          doc.addPage();
          y = 40;
          // Re-draw table header on new page
          doc.rect(L, y, W, ROW_H).fill(navy);
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

    // ── Totals panel ─────────────────────────────────────────────────────
    y += 14;
    doc.moveTo(L, y).lineTo(R, y).strokeColor(gold).lineWidth(1.2).stroke();
    y += 12;

    const totalPanelX = R - 200;
    const balance = parseFloat(folio.balance ?? "0");

    const totals = [
      { label: "Total Cargos",  value: folio.totalCharges ?? "0",  color: red },
      { label: "Total Pagado",  value: folio.totalPayments ?? "0", color: green },
    ];
    for (const t of totals) {
      doc.font("Helvetica").fontSize(9).fillColor(slate)
         .text(t.label, totalPanelX, y, { width: 100 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(t.color)
         .text(fmtCurrency(t.value), totalPanelX + 104, y, { width: 92, align: "right" });
      y += 15;
    }

    // Saldo final — highlighted box
    y += 4;
    const saldoColor = balance > 0 ? orange : balance < 0 ? "#2b6cb0" : green;
    const saldoLabel = balance > 0 ? "SALDO PENDIENTE" : balance < 0 ? "SALDO A FAVOR" : "SALDO SALDADO";
    doc.rect(totalPanelX - 6, y - 5, 202, 26).fill(balance > 0 ? "#fff5e6" : balance < 0 ? "#ebf4ff" : "#f0fff4")
       .rect(totalPanelX - 6, y - 5, 3, 26).fill(saldoColor);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(saldoColor)
       .text(saldoLabel, totalPanelX, y, { width: 100 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(saldoColor)
       .text(fmtCurrency(balance), totalPanelX + 100, y - 1, { width: 96, align: "right" });
    y += 30;

    // ── Footer ───────────────────────────────────────────────────────────
    doc.moveTo(L, y + 6).lineTo(R, y + 6).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor("#718096")
       .text(
         `Documento emitido el ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}  |  Maran Suite System  |  Maran Suites & Torres — Paraná, Entre Ríos`,
         L, y + 12, { align: "center", width: W }
       );

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
            const guestName = g ? `${g.lastName ?? ""} ${g.firstName ?? ""}`.trim() : "";
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
