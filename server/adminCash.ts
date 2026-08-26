import type { Express } from "express";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import { adminCashMovements, adminCashArqueos, adminCashConfig } from "@shared/schema";
import PDFDocument from "pdfkit";
import { requireAuth } from "./auth";
import { getArgentinaToday } from "./db-storage";
import { isValidCentroCosto } from "./routes/cost-centers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $n = (v: any) => parseFloat(v ?? 0) || 0;

function fPeso(n: number): string {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + "T12:00:00") : d;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

async function genPDF(fn: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    fn(doc);
    const ts = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fontSize(6.5).font("Helvetica").fillColor("#aaaaaa")
      .text(`Generado el ${ts} | Hotel Maran Suites & Towers`, 40, doc.page.height - 22, { align: "center", width: 515 });
    doc.end();
  });
}

// ─── Saldo acumulado ──────────────────────────────────────────────────────────

async function getSaldoActual(): Promise<number> {
  const res = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN signo = '+' THEN importe::numeric ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN signo = '-' THEN importe::numeric ELSE 0 END), 0) AS saldo
    FROM admin_cash_movements
    WHERE anulado = false
  `);
  return $n((res.rows[0] as any)?.saldo);
}

async function getSaldoHasta(fechaHasta: string, excludingId?: number): Promise<number> {
  const excl = excludingId ? sql`AND id < ${excludingId}` : sql``;
  const res = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN signo = '+' THEN importe::numeric ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN signo = '-' THEN importe::numeric ELSE 0 END), 0) AS saldo
    FROM admin_cash_movements
    WHERE anulado = false AND fecha <= ${fechaHasta} ${excl}
  `);
  return $n((res.rows[0] as any)?.saldo);
}

async function getSaldoHastaFechaExcluyendo(fechaHasta: string): Promise<number> {
  // Saldo hasta el día ANTERIOR a fechaHasta
  const dt = new Date(fechaHasta + "T12:00:00");
  dt.setDate(dt.getDate() - 1);
  const prev = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return getSaldoHasta(prev);
}

async function getConfig() {
  const rows = await db.select().from(adminCashConfig).limit(1);
  return rows[0] ?? { id: 0, fondoFijo: "0", alertaBajo: "0" };
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerAdminCashRoutes(app: Express) {

  // GET /api/admin-cash/saldo
  app.get("/api/admin-cash/saldo", requireAuth, async (req, res) => {
    try {
      const saldoActual = await getSaldoActual();
      const config = await getConfig();
      const fondoFijo = $n(config.fondoFijo);
      const alertaBajo = $n(config.alertaBajo);
      res.json({
        saldoActual,
        fondoFijo,
        alertaBajo,
        enAlerta: alertaBajo > 0 && saldoActual < alertaBajo,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin-cash/movimientos
  app.get("/api/admin-cash/movimientos", requireAuth, async (req, res) => {
    try {
      const { fecha, desde, hasta } = req.query as Record<string, string>;

      let whereClause: any;
      if (fecha) {
        whereClause = sql`fecha = ${fecha}`;
      } else if (desde && hasta) {
        whereClause = sql`fecha BETWEEN ${desde} AND ${hasta}`;
      } else {
        const today = getArgentinaToday();
        whereClause = sql`fecha = ${today}`;
      }

      const rows = (await db.execute(sql`
        SELECT m.*, aa.nombre AS cuenta_nombre
        FROM admin_cash_movements m
        LEFT JOIN accounting_accounts aa ON aa.id = m.cuenta_contable_id
        WHERE ${whereClause}
        ORDER BY fecha DESC, created_at DESC
      `)).rows as any[];

      // Add running balance to each row
      let runningTotal = 0;
      const withBalance = rows.slice().reverse().map((r) => {
        const imp = $n(r.importe);
        runningTotal = r.signo === "+" ? runningTotal + imp : runningTotal - imp;
        return { ...r, saldoAcumulado: runningTotal };
      }).reverse();

      res.json(withBalance);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin-cash/movimientos
  app.post("/api/admin-cash/movimientos", requireAuth, async (req, res) => {
    try {
      const {
        tipo, concepto, importe, signo,
        cuentaContableId, centroCosto, areaOrigen,
        paymentOrderId, fecha, hora,
      } = req.body;

      if (!tipo || !concepto || !importe || !signo) {
        return res.status(400).json({ error: "tipo, concepto, importe y signo son requeridos" });
      }

      // ── Validar centro de costo contra la lista gestionada ─────────────────
      const centroCostoTrim = centroCosto ? String(centroCosto).trim() || null : null;
      if (centroCostoTrim && !(await isValidCentroCosto(centroCostoTrim))) {
        return res.status(400).json({
          error: `El centro de costo "${centroCostoTrim}" no existe o está inactivo. Elegí uno de la lista de centros de costo.`,
        });
      }

      // Check for duplicate cierre
      if (req.body.cierreOrigenId) {
        const dup = await db.execute(sql`
          SELECT id FROM admin_cash_movements WHERE cierre_origen_id = ${req.body.cierreOrigenId} AND anulado = false
        `);
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: "Este cierre ya fue transferido a la caja de administración" });
        }
      }

      const user = (req as any).user;
      const movFecha = fecha || getArgentinaToday();
      const movHora = hora || new Date().toTimeString().slice(0, 5);

      const inserted = await db.insert(adminCashMovements).values({
        fecha: movFecha,
        hora: movHora,
        tipo,
        concepto,
        importe: String(importe),
        signo,
        cuentaContableId: cuentaContableId || null,
        centroCosto: centroCostoTrim,
        paymentOrderId: paymentOrderId || null,
        areaOrigen: areaOrigen || null,
        cierreOrigenId: req.body.cierreOrigenId || null,
        operador: user?.fullName || user?.username || "Sistema",
        anulado: false,
      }).returning();

      // Auto-generate accounting entry for gastos de caja chica
      if ((tipo === "egreso_gasto" || tipo === "egreso_proveedor") && cuentaContableId) {
        try {
          const cajaId = await db.execute(sql`
            SELECT id FROM accounting_accounts WHERE codigo LIKE '1.1.1%' LIMIT 1
          `);
          const cajaAccount = (cajaId.rows[0] as any)?.id;

          if (cajaAccount) {
            const periodoDate = new Date(movFecha + "T12:00:00");
            const periodo = `${String(periodoDate.getMonth() + 1).padStart(2, "0")}/${periodoDate.getFullYear()}`;

            const entryRes = await db.execute(sql`
              INSERT INTO accounting_entries (numero_minuta, fecha, periodo, concepto, tipo_origen, origen_id, origen_tipo)
              VALUES (
                COALESCE((SELECT MAX(numero_minuta) FROM accounting_entries), 0) + 1,
                ${movFecha}, ${periodo}, ${concepto}, 'caja_admin', ${inserted[0].id}, 'admin_cash'
              ) RETURNING id
            `);
            const entryId = (entryRes.rows[0] as any)?.id;

            if (entryId) {
              await db.execute(sql`
                INSERT INTO accounting_entry_lines (entry_id, account_id, debe, haber, concepto)
                VALUES
                  (${entryId}, ${cuentaContableId}, ${importe}, 0, ${concepto}),
                  (${entryId}, ${cajaAccount}, 0, ${importe}, ${concepto})
              `);
            }
          }
        } catch (ae) {
          console.error("Error generando asiento caja admin:", ae);
        }
      }

      res.status(201).json(inserted[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/admin-cash/movimientos/:id/anular
  app.patch("/api/admin-cash/movimientos/:id/anular", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { motivoAnulacion } = req.body;
      await db.update(adminCashMovements)
        .set({ anulado: true, motivoAnulacion: motivoAnulacion || "Anulado por usuario" })
        .where(eq(adminCashMovements.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin-cash/arqueo
  app.post("/api/admin-cash/arqueo", requireAuth, async (req, res) => {
    try {
      const { fecha, saldoFisico, observaciones } = req.body;
      if (!fecha || saldoFisico == null) {
        return res.status(400).json({ error: "fecha y saldoFisico son requeridos" });
      }
      const user = (req as any).user;
      const saldoSistema = await getSaldoHasta(fecha);
      const diferencia = $n(saldoFisico) - saldoSistema;

      // Upsert arqueo
      await db.execute(sql`
        INSERT INTO admin_cash_arqueos (fecha, saldo_sistema, saldo_fisico, diferencia, observaciones, operador)
        VALUES (${fecha}, ${saldoSistema}, ${saldoFisico}, ${diferencia}, ${observaciones || null}, ${user?.fullName || "Sistema"})
        ON CONFLICT (fecha) DO UPDATE SET
          saldo_sistema = EXCLUDED.saldo_sistema,
          saldo_fisico = EXCLUDED.saldo_fisico,
          diferencia = EXCLUDED.diferencia,
          observaciones = EXCLUDED.observaciones,
          operador = EXCLUDED.operador
      `);

      // Create adjustment movement if difference exists
      if (Math.abs(diferencia) > 0.01) {
        const signo = diferencia > 0 ? "+" : "-";
        const label = diferencia > 0 ? "Sobrante" : "Faltante";
        await db.insert(adminCashMovements).values({
          fecha,
          hora: new Date().toTimeString().slice(0, 5),
          tipo: "arqueo",
          concepto: `Ajuste arqueo ${fDate(fecha)} - ${label}: $${fPeso(Math.abs(diferencia))}`,
          importe: String(Math.abs(diferencia)),
          signo,
          operador: user?.fullName || "Sistema",
          anulado: false,
        });
      }

      res.json({ ok: true, saldoSistema, diferencia });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin-cash/arqueos
  app.get("/api/admin-cash/arqueos", requireAuth, async (req, res) => {
    try {
      const rows = await db.select().from(adminCashArqueos).orderBy(adminCashArqueos.fecha);
      res.json(rows.reverse());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin-cash/config
  app.get("/api/admin-cash/config", requireAuth, async (req, res) => {
    try {
      const config = await getConfig();
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/admin-cash/config
  app.put("/api/admin-cash/config", requireAuth, async (req, res) => {
    try {
      const { fondoFijo, alertaBajo } = req.body;
      const existing = await getConfig();
      if (existing.id > 0) {
        await db.update(adminCashConfig)
          .set({ fondoFijo: String(fondoFijo ?? 0), alertaBajo: String(alertaBajo ?? 0) })
          .where(eq(adminCashConfig.id, existing.id));
      } else {
        await db.insert(adminCashConfig).values({
          fondoFijo: String(fondoFijo ?? 0),
          alertaBajo: String(alertaBajo ?? 0),
        });
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin-cash/cierre-diario?fecha=YYYY-MM-DD → PDF
  app.get("/api/admin-cash/cierre-diario", requireAuth, async (req, res) => {
    try {
      const { fecha } = req.query as Record<string, string>;
      const dia = fecha || getArgentinaToday();

      const movs = (await db.execute(sql`
        SELECT * FROM admin_cash_movements
        WHERE fecha = ${dia} AND anulado = false
        ORDER BY created_at ASC
      `)).rows as any[];

      const saldoInicial = await getSaldoHastaFechaExcluyendo(dia);

      const ingresos = movs.filter((m) => m.signo === "+");
      const egresos = movs.filter((m) => m.signo === "-");
      const totalIngresos = ingresos.reduce((s, m) => s + $n(m.importe), 0);
      const totalEgresos = egresos.reduce((s, m) => s + $n(m.importe), 0);
      const saldoFinal = saldoInicial + totalIngresos - totalEgresos;

      const arqueo = (await db.execute(sql`
        SELECT * FROM admin_cash_arqueos WHERE fecha = ${dia} LIMIT 1
      `)).rows[0] as any;

      const pdfBuf = await genPDF((doc) => {
        const x0 = 40;
        let y = 40;

        // Header
        doc.font("Helvetica-Bold").fontSize(10)
          .text("Hotel Maran Suites & Towers", x0, y, { align: "center", width: 515 });
        doc.font("Helvetica").fontSize(9)
          .text("Maran S.A. - CUIT 33-68110008-9", x0, y + 14, { align: "center", width: 515 })
          .text("Alameda de la Federacion 698 - Parana, Entre Rios", x0, y + 26, { align: "center", width: 515 });
        y += 46;

        doc.font("Helvetica-Bold").fontSize(13)
          .text("RENDICION DE CAJA - ADMINISTRACION", x0, y, { align: "center", width: 515, underline: true });
        y += 18;
        doc.font("Helvetica-Bold").fontSize(10)
          .text(`Fecha: ${fDate(dia)}`, x0, y, { align: "center", width: 515 });
        y += 20;

        // Saldo inicial
        doc.font("Helvetica").fontSize(9)
          .text(`Saldo Inicial del Dia:`, x0, y)
          .text(`$ ${fPeso(saldoInicial)}`, x0 + 300, y, { align: "right", width: 215 });
        y += 18;

        // ─── RESUMEN POR MÓDULO ─────────────────────────────────────
        const moduloMap: Record<string, string> = {
          ingreso_recepcion: "Hotel / Recepción",
          ingreso_restaurant: "Restaurante",
          ingreso_spa: "SPA",
          ingreso_manual: "Otros ingresos",
        };
        const moduloTotals: Record<string, number> = {};
        for (const m of ingresos) {
          const k = m.tipo in moduloMap ? m.tipo : "ingreso_manual";
          moduloTotals[k] = (moduloTotals[k] || 0) + $n(m.importe);
        }
        if (Object.keys(moduloTotals).length > 0) {
          doc.font("Helvetica-Bold").fontSize(9).text("RESUMEN DE INGRESOS POR MÓDULO", x0, y);
          y += 14;
          doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").lineWidth(0.5).stroke();
          y += 4;
          for (const [tipo, total] of Object.entries(moduloTotals)) {
            doc.font("Helvetica").fontSize(8.5);
            doc.text(moduloMap[tipo] ?? tipo, x0 + 10, y, { width: 280 });
            doc.text(`$ ${fPeso(total)}`, x0 + 310, y, { align: "right", width: 205 });
            y += 11;
          }
          doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
          y += 18;
        }

        // INGRESOS
        doc.font("Helvetica-Bold").fontSize(9).text("DETALLE DE INGRESOS", x0, y).moveDown(0);
        y += 14;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").lineWidth(0.5).stroke();
        y += 4;
        doc.font("Helvetica").fontSize(8.5);

        for (const m of ingresos) {
          if (y > 730) { doc.addPage(); y = 60; }
          const tipoLabel = tipoDisplay(m.tipo);
          doc.text(`${tipoLabel} — ${m.concepto}`, x0, y, { width: 300 });
          doc.text(`+ $ ${fPeso($n(m.importe))}`, x0 + 310, y, { align: "right", width: 205 });
          y += 13;
        }
        y += 2;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 4;
        doc.font("Helvetica-Bold").text("TOTAL INGRESOS", x0, y)
          .text(`$ ${fPeso(totalIngresos)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 18;

        // EGRESOS
        doc.font("Helvetica-Bold").fontSize(9).text("EGRESOS", x0, y);
        y += 14;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 4;
        doc.font("Helvetica").fontSize(8.5);

        for (const m of egresos) {
          if (y > 730) { doc.addPage(); y = 60; }
          const tipoLabel = tipoDisplay(m.tipo);
          doc.text(`${tipoLabel} — ${m.concepto}`, x0, y, { width: 300 });
          doc.text(`- $ ${fPeso($n(m.importe))}`, x0 + 310, y, { align: "right", width: 205 });
          y += 13;
        }
        y += 2;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 4;
        doc.font("Helvetica-Bold").text("TOTAL EGRESOS", x0, y)
          .text(`$ ${fPeso(totalEgresos)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 20;

        // Resumen saldo
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#000").lineWidth(1).stroke();
        y += 8;
        doc.font("Helvetica").fontSize(9)
          .text("Saldo Inicial del Dia:", x0, y)
          .text(`$ ${fPeso(saldoInicial)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 13;
        doc.text("+ Ingresos:", x0, y)
          .text(`$ ${fPeso(totalIngresos)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 13;
        doc.text("- Egresos:", x0, y)
          .text(`$ ${fPeso(totalEgresos)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 4;
        doc.moveTo(x0 + 200, y).lineTo(555, y).strokeColor("#000").stroke();
        y += 6;
        doc.font("Helvetica-Bold").fontSize(10)
          .text("SALDO FINAL:", x0, y)
          .text(`$ ${fPeso(saldoFinal)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 20;

        // Arqueo
        if (arqueo) {
          const dif = $n(arqueo.diferencia);
          const difLabel = dif > 0 ? "Sobrante" : dif < 0 ? "Faltante" : "Sin diferencia";
          doc.font("Helvetica").fontSize(9)
            .text(`Arqueo: $ ${fPeso($n(arqueo.saldo_fisico))}    Diferencia: ${dif >= 0 ? "+" : ""}${fPeso(dif)} (${difLabel})`, x0, y);
          y += 16;
        } else {
          doc.font("Helvetica").fontSize(9).fillColor("#999")
            .text("Arqueo: no registrado para este dia", x0, y).fillColor("#000");
          y += 16;
        }

        // Signature
        y = Math.max(y, 700);
        doc.moveTo(x0, y).lineTo(x0 + 180, y).strokeColor("#000").lineWidth(0.5).stroke();
        doc.moveTo(x0 + 340, y).lineTo(x0 + 515, y).stroke();
        y += 5;
        doc.font("Helvetica").fontSize(8)
          .text("Firma Responsable", x0, y)
          .text("Aclaracion", x0 + 340, y);
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="rendicion_caja_${dia}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin-cash/cierre-mensual?periodo=MM/YYYY → PDF
  app.get("/api/admin-cash/cierre-mensual", requireAuth, async (req, res) => {
    try {
      const { periodo } = req.query as Record<string, string>;
      if (!periodo) return res.status(400).json({ error: "Se requiere 'periodo' (MM/YYYY)" });

      const [mm, yyyy] = periodo.split("/");
      const desde = `${yyyy}-${mm.padStart(2, "0")}-01`;
      const hasta = `${yyyy}-${mm.padStart(2, "0")}-31`;

      const movs = (await db.execute(sql`
        SELECT m.*, aa.nombre AS cuenta_nombre
        FROM admin_cash_movements m
        LEFT JOIN accounting_accounts aa ON aa.id = m.cuenta_contable_id
        WHERE m.fecha BETWEEN ${desde} AND ${hasta} AND m.anulado = false
        ORDER BY m.fecha ASC, m.created_at ASC
      `)).rows as any[];

      const arqueos = (await db.execute(sql`
        SELECT * FROM admin_cash_arqueos
        WHERE fecha BETWEEN ${desde} AND ${hasta}
        ORDER BY fecha ASC
      `)).rows as any[];

      const saldoInicialMes = await getSaldoHastaFechaExcluyendo(desde);
      const ingresos = movs.filter((m) => m.signo === "+");
      const egresos = movs.filter((m) => m.signo === "-");
      const totalIngresos = ingresos.reduce((s, m) => s + $n(m.importe), 0);
      const totalEgresos = egresos.reduce((s, m) => s + $n(m.importe), 0);
      const saldoFinal = saldoInicialMes + totalIngresos - totalEgresos;

      // Group by area / tipo
      const ingresosPorTipo: Record<string, number> = {};
      for (const m of ingresos) {
        ingresosPorTipo[m.tipo] = (ingresosPorTipo[m.tipo] || 0) + $n(m.importe);
      }
      const egresosPorCuenta: Record<string, number> = {};
      for (const m of egresos) {
        const k = m.cuenta_nombre || m.concepto?.substring(0, 20) || m.tipo;
        egresosPorCuenta[k] = (egresosPorCuenta[k] || 0) + $n(m.importe);
      }

      const pdfBuf = await genPDF((doc) => {
        const x0 = 40;
        let y = 40;

        doc.font("Helvetica-Bold").fontSize(10)
          .text("Hotel Maran Suites & Towers", x0, y, { align: "center", width: 515 });
        doc.font("Helvetica").fontSize(9)
          .text("Maran S.A. - CUIT 33-68110008-9", x0, y + 14, { align: "center", width: 515 });
        y += 34;

        doc.font("Helvetica-Bold").fontSize(13)
          .text("CIERRE MENSUAL — CAJA ADMINISTRACION", x0, y, { align: "center", width: 515, underline: true });
        y += 18;
        doc.font("Helvetica-Bold").fontSize(10)
          .text(`Periodo: ${periodo}`, x0, y, { align: "center", width: 515 });
        y += 20;

        // Summary
        doc.font("Helvetica-Bold").fontSize(9).text("RESUMEN DEL PERIODO", x0, y);
        y += 14;
        doc.font("Helvetica").fontSize(9)
          .text(`Saldo Inicial del Periodo:`, x0, y)
          .text(`$ ${fPeso(saldoInicialMes)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 13;
        doc.text(`Total Ingresos:`, x0, y)
          .text(`$ ${fPeso(totalIngresos)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 13;
        doc.text(`Total Egresos:`, x0, y)
          .text(`$ ${fPeso(totalEgresos)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 4;
        doc.moveTo(x0 + 200, y).lineTo(555, y).strokeColor("#000").stroke();
        y += 6;
        doc.font("Helvetica-Bold").text(`Saldo Final:`, x0, y)
          .text(`$ ${fPeso(saldoFinal)}`, x0 + 310, y, { align: "right", width: 205 });
        y += 20;

        // Ingresos por tipo
        doc.font("Helvetica-Bold").fontSize(9).text("INGRESOS POR TIPO", x0, y);
        y += 14;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").lineWidth(0.5).stroke();
        y += 4;
        doc.font("Helvetica").fontSize(8.5);
        for (const [tipo, monto] of Object.entries(ingresosPorTipo)) {
          doc.text(tipoDisplay(tipo), x0, y)
            .text(`$ ${fPeso(monto)}`, x0 + 310, y, { align: "right", width: 205 });
          y += 12;
        }
        y += 6;

        // Egresos por cuenta
        doc.font("Helvetica-Bold").fontSize(9).text("EGRESOS POR CUENTA", x0, y);
        y += 14;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 4;
        doc.font("Helvetica").fontSize(8.5);
        for (const [cuenta, monto] of Object.entries(egresosPorCuenta)) {
          doc.text(cuenta.substring(0, 40), x0, y)
            .text(`$ ${fPeso(monto)}`, x0 + 310, y, { align: "right", width: 205 });
          y += 12;
        }
        y += 10;

        // Arqueos del mes
        if (arqueos.length > 0) {
          if (y > 650) { doc.addPage(); y = 60; }
          doc.font("Helvetica-Bold").fontSize(9).text("ARQUEOS DEL PERIODO", x0, y);
          y += 14;
          doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
          y += 4;
          doc.font("Helvetica").fontSize(8.5);
          const totalDifs = arqueos.reduce((s, a) => s + $n(a.diferencia), 0);
          for (const a of arqueos) {
            const dif = $n(a.diferencia);
            doc.text(fDate(a.fecha), x0, y);
            doc.text(`Sis: $${fPeso($n(a.saldo_sistema))}  Fis: $${fPeso($n(a.saldo_fisico))}  Dif: ${dif >= 0 ? "+" : ""}${fPeso(dif)}`, x0 + 60, y);
            y += 12;
          }
          doc.font("Helvetica-Bold").text(`Total diferencias:`, x0, y)
            .text(`${totalDifs >= 0 ? "+" : ""}$ ${fPeso(totalDifs)}`, x0 + 310, y, { align: "right", width: 205 });
          y += 16;
        }

        // Detalle movimientos
        if (y > 650) { doc.addPage(); y = 60; }
        doc.font("Helvetica-Bold").fontSize(9).text("DETALLE DE MOVIMIENTOS", x0, y);
        y += 14;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 4;

        // Column headers
        doc.font("Helvetica-Bold").fontSize(7.5);
        doc.text("Fecha", x0, y);
        doc.text("Hora", x0 + 55, y);
        doc.text("Tipo", x0 + 90, y);
        doc.text("Concepto", x0 + 175, y);
        doc.text("Importe", x0 + 390, y, { align: "right", width: 80 });
        doc.text("Saldo", x0 + 475, y, { align: "right", width: 80 });
        y += 12;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#ccc").stroke();
        y += 3;

        doc.font("Helvetica").fontSize(7.5);
        let runSaldo = saldoInicialMes;
        for (const m of movs) {
          if (y > 760) { doc.addPage(); y = 60; }
          const imp = $n(m.importe);
          runSaldo = m.signo === "+" ? runSaldo + imp : runSaldo - imp;
          doc.text(fDate(m.fecha), x0, y);
          doc.text(m.hora || "", x0 + 55, y);
          doc.text(tipoDisplay(m.tipo).substring(0, 10), x0 + 90, y);
          doc.text((m.concepto || "").substring(0, 24), x0 + 175, y);
          doc.text(`${m.signo}$${fPeso(imp)}`, x0 + 390, y, { align: "right", width: 80 });
          doc.text(`$${fPeso(runSaldo)}`, x0 + 475, y, { align: "right", width: 80 });
          y += 11;
        }
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="cierre_mensual_caja_${periodo.replace("/", "_")}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin-cash/resumen-dia?fecha=YYYY-MM-DD (for frontend summary cards)
  app.get("/api/admin-cash/resumen-dia", requireAuth, async (req, res) => {
    try {
      const { fecha } = req.query as Record<string, string>;
      const dia = fecha || getArgentinaToday();

      const result = (await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN signo = '+' AND anulado = false THEN importe::numeric ELSE 0 END), 0) AS hoy_ingresos,
          COALESCE(SUM(CASE WHEN signo = '-' AND anulado = false THEN importe::numeric ELSE 0 END), 0) AS hoy_egresos,
          COALESCE(SUM(CASE WHEN signo = '+' AND anulado = false AND tipo = 'ingreso_recepcion' THEN importe::numeric ELSE 0 END), 0) AS ingreso_hotel,
          COALESCE(SUM(CASE WHEN signo = '+' AND anulado = false AND tipo = 'ingreso_restaurant' THEN importe::numeric ELSE 0 END), 0) AS ingreso_restaurant,
          COALESCE(SUM(CASE WHEN signo = '+' AND anulado = false AND tipo = 'ingreso_spa' THEN importe::numeric ELSE 0 END), 0) AS ingreso_spa,
          COALESCE(SUM(CASE WHEN signo = '+' AND anulado = false AND tipo NOT IN ('ingreso_recepcion','ingreso_restaurant','ingreso_spa') THEN importe::numeric ELSE 0 END), 0) AS ingreso_otros
        FROM admin_cash_movements
        WHERE fecha = ${dia}
      `)).rows[0] as any;

      res.json({
        hoyIngresos: $n(result?.hoy_ingresos),
        hoyEgresos: $n(result?.hoy_egresos),
        porModulo: {
          hotel: $n(result?.ingreso_hotel),
          restaurant: $n(result?.ingreso_restaurant),
          spa: $n(result?.ingreso_spa),
          otros: $n(result?.ingreso_otros),
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

// ─── Display helpers (shared) ─────────────────────────────────────────────────

export function tipoDisplay(tipo: string): string {
  const map: Record<string, string> = {
    ingreso_recepcion: "Recepcion",
    ingreso_restaurant: "Restaurante",
    ingreso_spa: "Spa",
    ingreso_manual: "Ingreso Manual",
    egreso_proveedor: "Pago Proveedor",
    egreso_gasto: "Gasto Chico",
    egreso_manual: "Egreso Manual",
    arqueo: "Arqueo",
  };
  return map[tipo] || tipo;
}
