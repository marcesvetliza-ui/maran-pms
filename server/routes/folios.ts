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
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fmtCurrency = (n: string | number) =>
      `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (iso: string) => {
      try {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } catch { return iso; }
    };

    const W = 495; // usable width
    const blue = "#1a4a7a";
    const gold = "#c8a97e";
    const gray = "#666666";
    const lightGray = "#f5f5f5";

    // ── Header ──────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 70).fill(blue);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(18)
       .text("MARAN SUITES & TORRES", 70, 65);
    doc.font("Helvetica").fontSize(10)
       .text("Av. Urquiza 1220 | Paraná, Entre Ríos | Tel: (343) 400-0000", 70, 87);
    doc.font("Helvetica-Bold").fontSize(11)
       .text("ESTADO DE CUENTA — FOLIO", 70, 103, { align: "right" });

    // ── Folio info ───────────────────────────────────────────────────────
    doc.fillColor(blue).font("Helvetica-Bold").fontSize(14)
       .text(folio.codigo, 370, 130, { align: "right" });

    doc.rect(50, 130, W, 50).fill(lightGray);
    doc.fillColor(gray).font("Helvetica").fontSize(9);
    doc.text("Tipo:", 60, 140);
    doc.fillColor("black").text(ENTITY_LABELS[folio.entityType] ?? folio.entityType, 110, 140);
    if (entityLabel) {
      doc.fillColor(gray).text("Referencia:", 60, 154);
      doc.fillColor("black").text(entityLabel, 110, 154);
    }
    doc.fillColor(gray).text("Estado:", 300, 140);
    const statusLabel = folio.status === "open" ? "Abierto" : folio.status === "closed" ? "Cerrado" : "Facturado";
    doc.fillColor("black").text(statusLabel, 350, 140);
    doc.fillColor(gray).text("Apertura:", 300, 154);
    doc.fillColor("black").text(fmtDate(folio.openedAt ?? ""), 350, 154);

    // ── Movements table header ───────────────────────────────────────────
    let y = 200;
    doc.rect(50, y, W, 18).fill(blue);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(8);
    doc.text("Fecha / Hora", 55, y + 5);
    doc.text("Descripción", 170, y + 5);
    doc.text("Tipo", 360, y + 5);
    doc.text("Importe", 440, y + 5, { width: 50, align: "right" });
    y += 18;

    // ── Movements rows ───────────────────────────────────────────────────
    let runningBalance = 0;
    for (let i = 0; i < folio.movements.length; i++) {
      const m = folio.movements[i];
      const isDebit = ["charge", "transfer_in"].includes(m.type);
      const sign = isDebit ? 1 : -1;
      runningBalance += sign * parseFloat(m.amount);
      const bg = i % 2 === 0 ? "white" : lightGray;
      doc.rect(50, y, W, 16).fill(bg);
      doc.fillColor(gray).font("Helvetica").fontSize(8).text(fmtDate(m.createdAt ?? ""), 55, y + 4);
      const desc = m.description.length > 35 ? m.description.slice(0, 35) + "…" : m.description;
      doc.fillColor("black").text(desc, 170, y + 4);
      doc.fillColor(gray).text(MOVEMENT_LABELS[m.type] ?? m.type, 360, y + 4);
      const payLabel = m.paymentMethod ? ` (${PAYMENT_LABELS[m.paymentMethod] ?? m.paymentMethod})` : "";
      doc.fillColor(isDebit ? "#c0392b" : "#27ae60").font("Helvetica-Bold")
         .text(fmtCurrency(m.amount), 440, y + 4, { width: 50, align: "right" });
      y += 16;
      if (y > 720) {
        doc.addPage();
        y = 60;
      }
    }

    if (folio.movements.length === 0) {
      doc.rect(50, y, W, 24).fill(lightGray);
      doc.fillColor(gray).font("Helvetica").fontSize(9)
         .text("Sin movimientos registrados", 55, y + 7);
      y += 24;
    }

    // ── Totals ───────────────────────────────────────────────────────────
    y += 10;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(gold).lineWidth(1).stroke();
    y += 10;

    const totals = [
      { label: "Total Cargos:", value: folio.totalCharges ?? "0", color: "#c0392b" },
      { label: "Total Pagado:", value: folio.totalPayments ?? "0", color: "#27ae60" },
      { label: "SALDO PENDIENTE:", value: folio.balance ?? "0", color: parseFloat(folio.balance ?? "0") > 0 ? "#e67e22" : "#2980b9" },
    ];
    for (const t of totals) {
      doc.fillColor(gray).font("Helvetica").fontSize(9).text(t.label, 360, y);
      doc.fillColor(t.color).font("Helvetica-Bold").fontSize(t.label.startsWith("SALDO") ? 11 : 9)
         .text(fmtCurrency(t.value), 440, y, { width: 50, align: "right" });
      y += t.label.startsWith("SALDO") ? 16 : 13;
    }

    // ── Footer ───────────────────────────────────────────────────────────
    doc.moveTo(50, y + 10).lineTo(545, y + 10).strokeColor(lightGray).lineWidth(0.5).stroke();
    doc.fillColor(gray).font("Helvetica").fontSize(7)
       .text(
         `Emitido el ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} — Maran Suite System`,
         50, y + 15, { align: "center", width: W }
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
