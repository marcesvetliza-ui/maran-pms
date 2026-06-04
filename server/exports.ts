import type { Express } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { requireAuth } from "./auth";
import { calcNeto, calcIva21 } from "./lib/pricing";

// ─── Hotel Constants ──────────────────────────────────────────────────────────
const H = {
  nombre: "Hotel Spa Maran Suites & Towers",
  empresa: "Maran S.A.",
  cuit: "33-68110008-9",
  domicilio: "Alameda de la Federacion 698",
  localidad: "Parana - Entre Rios (3100)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $n = (v: any) => parseFloat(v ?? 0) || 0;

function fDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + "T12:00:00") : d;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function fPeso(n: number): string {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function nowStr(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2,"0")}_${String(n.getMonth()+1).padStart(2,"0")}_${n.getFullYear()}_${String(n.getHours()).padStart(2,"0")}_${String(n.getMinutes()).padStart(2,"0")}`;
}

function pad(v: any, len: number, char = " ", right = false): string {
  const s = String(v ?? "");
  return right ? s.slice(0, len).padEnd(len, char) : s.slice(0, len).padStart(len, char);
}

async function genPDF(fn: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    fn(doc);
    doc.end();
  });
}

function pdfHeader(doc: InstanceType<typeof PDFDocument>, title: string, lines: string[] = []) {
  doc.font("Helvetica-Bold").fontSize(10).text(H.nombre, { align: "center" });
  doc.font("Helvetica").fontSize(9)
    .text(`${H.empresa} - CUIT ${H.cuit}`, { align: "center" })
    .text(`${H.domicilio} - ${H.localidad}`, { align: "center" })
    .moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11).text(title, { align: "center", underline: true }).moveDown(0.3);
  doc.font("Helvetica").fontSize(9);
  lines.forEach((l) => doc.text(l));
  doc.text(`Fecha: ${fDate(new Date())}`, { align: "right" }).moveDown(0.5);
}

// ─── SIRCAR ───────────────────────────────────────────────────────────────────

function formatDateSIRCAR(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return `${dt.getDate()}/${dt.getMonth() + 1} /${dt.getFullYear()}`;
}

function sircarLine(r: any, i: number): string {
  const nro = String(i).padStart(5, "0");
  const cuit = (r.cuit_proveedor || "").replace(/-/g, "").padStart(11, "0");
  const fecha = formatDateSIRCAR(r.fecha_comprobante || r.fecha_retencion);
  const base = $n(r.importe_base).toFixed(2);
  const alic = $n(r.alicuota).toFixed(2).padStart(6, " ");
  const ret = $n(r.importe_retenido).toFixed(2);
  return `${nro},1,1,${r.nro_constancia},${cuit},${fecha},${base},${alic},${ret},004,908`;
}

// ─── IVA tipo codes ───────────────────────────────────────────────────────────

function tipoInfo(tipo: string) {
  const m: Record<string, { arca: string; codcom: string; label: string }> = {
    "FACT-A":        { arca: "001", codcom: "1",   label: "PROV FACT -A-" },
    "FACT-B":        { arca: "002", codcom: "2",   label: "PROV FACT -B-" },
    "FACT-C":        { arca: "002", codcom: "2",   label: "PROV FACT -C-" },
    "FACT-M":        { arca: "051", codcom: "2",   label: "PROV FACT -M-" },
    "NC-A":          { arca: "003", codcom: "3",   label: "PROV N.CRED -A-" },
    "NC-B":          { arca: "003", codcom: "3",   label: "PROV N.CRED -B-" },
    "NC-C":          { arca: "003", codcom: "3",   label: "PROV N.CRED -C-" },
    "RESUMEN-BANCO": { arca: "099", codcom: "183", label: "PROV RESUMEN BANCOS" },
    "LIQ-TARJETA":   { arca: "011", codcom: "195", label: "PROV LIQ TARJETA" },
  };
  return m[tipo] || { arca: "001", codcom: "1", label: tipo };
}

function ivaCodiva(condIva: string): string {
  if (condIva?.includes("onotr")) return "4";
  if (condIva?.includes("xento")) return "5";
  if (condIva?.includes("o Resp") || condIva?.includes("onsumidor")) return "6";
  return "1"; // Responsable Inscripto
}

function ivaPeriodo(periodo: string): number {
  const [mm, yyyy] = (periodo || "01/2026").split("/");
  return (parseInt(yyyy) - 1900) * 12 + parseInt(mm);
}

// ─── CBTE compras TXT (ARCA RG 3685) ─────────────────────────────────────────
function cbteComprasLine(inv: any): string {
  const t = tipoInfo(inv.tipo_comprobante);
  const fecha = (() => {
    const d = new Date((inv.fecha_emision || "2026-01-01") + "T12:00:00");
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  })();
  const pv = String(inv.punto_venta || "1").padStart(5, "0");
  const num = String(inv.numero_comprobante || "0").padStart(20, "0");
  const cuit = (inv.proveedor_cuit || "").replace(/-/g, "").padStart(11, "0");
  const rs = pad((inv.supplier_nombre || inv.proveedor_nombre || "").toUpperCase(), 30, " ", true);
  const total = String(Math.round($n(inv.monto_total) * 100)).padStart(15, "0");
  const neto = String(Math.round($n(inv.monto_neto) * 100)).padStart(15, "0");
  const alicuota = inv.alicuota_iva === "10.5" ? "0105" : inv.alicuota_iva === "27" ? "0270" : "0210";
  const ivaTotal = String(Math.round(($n(inv.monto_iva21) + $n(inv.monto_iva105) + $n(inv.monto_iva27)) * 100)).padStart(15, "0");
  const impInt = String(Math.round($n(inv.impuestos_internos) * 100)).padStart(15, "0");
  const codIva = ivaCodiva(inv.condicion_iva || "");
  const numBis = num; // mismo número para comprobantes simples

  return [
    fecha,            // 8
    t.arca,           // 3  → 11
    pv,               // 5  → 16
    num,              // 20 → 36
    numBis,           // 20 → 56
    codIva,           // 1  → 57
    cuit,             // 11 → 68
    rs,               // 30 → 98
    total,            // 15 → 113
    neto,             // 15 → 128
    alicuota,         // 4  → 132
    ivaTotal,         // 15 → 147
    impInt,           // 15 → 162
    "PES",            // 3  → 165
    "0001000000",     // 10 → 175
    "1",              // 1  → 176
    "0",              // 1  → 177
    "000000000000000",// 15 → 192 crédito fiscal
    "000000000000000",// 15 → 207 otros atrib
  ].join("");
}

// ─── ALICUOTAS compras TXT ────────────────────────────────────────────────────
function alicuotasComprasLines(inv: any): string[] {
  const t = tipoInfo(inv.tipo_comprobante);
  const pv = String(inv.punto_venta || "1").padStart(5, "0");
  const num = String(inv.numero_comprobante || "0").padStart(20, "0");
  const cuit = (inv.proveedor_cuit || "").replace(/-/g, "").padStart(11, "0");
  const lines: string[] = [];

  const alicuotas = [
    { base: $n(inv.monto_neto), iva: $n(inv.monto_iva21), cod: "0210" },
    { base: $n(inv.monto_neto), iva: $n(inv.monto_iva105), cod: "0105" },
    { base: $n(inv.monto_neto), iva: $n(inv.monto_iva27), cod: "0270" },
    { base: $n(inv.monto_neto), iva: $n(inv.monto_iva5),  cod: "0050" },
    { base: $n(inv.monto_neto), iva: $n(inv.monto_iva25), cod: "0025" },
  ].filter((a) => a.iva > 0);

  for (const a of alicuotas) {
    const base = String(Math.round(a.base * 100)).padStart(15, "0");
    const ivaM = String(Math.round(a.iva * 100)).padStart(15, "0");
    lines.push(`${t.arca}${pv}${num}${cuit}${base}${a.cod}${ivaM}`);
  }
  // If no IVA lines (e.g. exento), add one with zeros
  if (!lines.length) {
    const base = String(Math.round($n(inv.monto_neto) * 100)).padStart(15, "0");
    lines.push(`${t.arca}${pv}${num}${cuit}${base}0000000000000000000`);
  }
  return lines;
}

// ─── CBTE ventas TXT ──────────────────────────────────────────────────────────
function cbteVentasLine(sale: any): string {
  const fecha = (() => {
    const d = new Date((sale.fecha || "2026-01-01") + "T12:00:00");
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  })();
  const pv = "0001"; // hotel point of sale
  const num = String(sale.id || "0").padStart(20, "0");
  const cuit = (sale.cuit || "").replace(/-/g, "").padStart(11, "0");
  const nombre = pad(((sale.guest_name || sale.nombre || "Consumidor Final")).toUpperCase(), 30, " ", true);
  const total = String(Math.round($n(sale.total) * 100)).padStart(15, "0");

  return [fecha, "001", pv, num, num, "8", cuit, nombre, total].join("");
}

// ─── ALICUOTAS ventas TXT ─────────────────────────────────────────────────────
function alicuotasVentasLine(sale: any): string {
  const pv = "0001";
  const num = String(sale.id || "0").padStart(20, "0");
  const neto = String(Math.round($n(sale.neto) * 100)).padStart(15, "0");
  const ivaM = String(Math.round($n(sale.iva) * 100)).padStart(15, "0");
  return `001${pv}${num}${neto}0210${ivaM}`;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerExportRoutes(app: Express) {
  // ── SIRCAR ────────────────────────────────────────────────────────────────

  app.get("/api/exports/sircar", requireAuth, async (req, res) => {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      if (!desde || !hasta) return res.status(400).json({ error: "Se requieren 'desde' y 'hasta'" });

      const retentions = await db.execute(sql`
        SELECT ir.*, s.razon_social
        FROM iibb_retentions ir
        LEFT JOIN accounting_suppliers s ON s.id = ir.supplier_id
        WHERE ir.fecha_retencion BETWEEN ${desde} AND ${hasta}
          AND (ir.anulacion = false OR ir.anulacion IS NULL)
        ORDER BY ir.fecha_retencion, ir.nro_constancia
      `);
      const rows = retentions.rows as any[];

      // TXT
      const txtLines = rows.map((r, i) => sircarLine(r, i + 1));
      const txtContent = txtLines.join("\r\n");

      // Excel: origen_sircar
      const wb1 = new ExcelJS.Workbook();
      const ws1 = wb1.addWorksheet("SIRCAR");
      ws1.addRow(["cuit", "nroconstancia", "fecha_retencion", "fecha_comprobante",
        "nro_comprobante", "letra_factura", "importe_base", "alicuota",
        "importe_retenido", "anulacion", "conv_multilateral", "importe_base_recalc", "redondeo_base"]);
      for (const r of rows) {
        ws1.addRow([
          r.cuit_proveedor, r.nro_constancia,
          fDate(r.fecha_retencion), fDate(r.fecha_comprobante),
          r.nro_comprobante, r.letra_factura || "",
          $n(r.importe_base), $n(r.alicuota), $n(r.importe_retenido),
          r.anulacion ? "S" : "N", "", $n(r.importe_base), 0,
        ]);
      }
      const buf1 = await wb1.xlsx.writeBuffer();

      // Excel: facturas_proceso_sircar
      const wb2 = new ExcelJS.Workbook();
      const ws2 = wb2.addWorksheet("Facturas");
      ws2.addRow(["op_codcom", "op_numcom", "op_codpos", "h_codcom", "h_numcom",
        "h_codpos", "fecha_e", "letra_f", "nro_f", "imp_gr_f",
        "cuit_p", "nro_cret", "fech_ret", "imp_ret", "filtro_txt"]);
      for (const r of rows) {
        ws2.addRow([
          1, r.nro_constancia, 1, 1, r.nro_comprobante, 1,
          fDate(r.fecha_comprobante), r.letra_factura || "A",
          r.nro_comprobante, $n(r.importe_base),
          r.cuit_proveedor, r.nro_constancia,
          fDate(r.fecha_retencion), $n(r.importe_retenido), "S",
        ]);
      }
      const buf2 = await wb2.xlsx.writeBuffer();

      const ts = nowStr();
      const zip = new JSZip();
      zip.file(`SIRCAR_${ts}.txt`, txtContent);
      zip.file(`origen_sircar_${ts}.xlsx`, buf1 as Buffer);
      zip.file(`facturas_proceso_sircar_${ts}.xlsx`, buf2 as Buffer);
      const zipBuf = await zip.generateAsync({ type: "nodebuffer" });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="SIRCAR_${ts}.zip"`);
      res.send(zipBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Listado Retenciones IIBB (PDF) ────────────────────────────────────────

  app.get("/api/exports/listado-retenciones", requireAuth, async (req, res) => {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      const rows = (await db.execute(sql`
        SELECT ir.*, s.razon_social
        FROM iibb_retentions ir
        LEFT JOIN accounting_suppliers s ON s.id = ir.supplier_id
        WHERE ir.fecha_retencion BETWEEN ${desde || "2000-01-01"} AND ${hasta || "2099-12-31"}
        ORDER BY ir.fecha_retencion, ir.nro_constancia
      `)).rows as any[];

      const pdfBuf = await genPDF((doc) => {
        pdfHeader(doc, "Retenciones de Ingresos Brutos", [
          `Desde: ${fDate(desde || "")}    Hasta: ${fDate(hasta || "")}`,
        ]);

        // Table header
        const cols = { fecha: 60, nro: 80, cuit: 100, proveedor: 180, importe: 80 };
        const x0 = 40;
        let y = doc.y;

        doc.font("Helvetica-Bold").fontSize(8);
        doc.text("Fecha", x0, y);
        doc.text("Nro. Comprobante", x0 + cols.fecha, y);
        doc.text("CUIT", x0 + cols.fecha + cols.nro, y);
        doc.text("Proveedor", x0 + cols.fecha + cols.nro + cols.cuit, y);
        doc.text("Importe Retención", x0 + cols.fecha + cols.nro + cols.cuit + cols.proveedor, y, { width: cols.importe, align: "right" });
        y += 14;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 4;

        doc.font("Helvetica").fontSize(8);
        let total = 0;
        for (const r of rows) {
          if (y > 750) { doc.addPage(); y = 60; }
          doc.text(fDate(r.fecha_retencion), x0, y);
          doc.text(String(r.nro_comprobante || ""), x0 + cols.fecha, y);
          doc.text(r.cuit_proveedor || "", x0 + cols.fecha + cols.nro, y);
          doc.text((r.razon_social || r.cuit_proveedor || "").substring(0, 30), x0 + cols.fecha + cols.nro + cols.cuit, y);
          const imp = $n(r.importe_retenido);
          doc.text(fPeso(imp), x0 + cols.fecha + cols.nro + cols.cuit + cols.proveedor, y, { width: cols.importe, align: "right" });
          total += imp;
          y += 14;
        }

        y += 6;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#000").stroke();
        y += 6;
        doc.font("Helvetica-Bold").fontSize(9)
          .text(`Total: $ ${fPeso(total)}`, x0 + cols.fecha + cols.nro + cols.cuit + cols.proveedor - 60, y, { width: cols.importe + 60, align: "right" });
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="retenciones_iibb_${nowStr()}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Libro IVA Compras ─────────────────────────────────────────────────────

  app.get("/api/exports/libro-iva-compras", requireAuth, async (req, res) => {
    try {
      const { periodo, tipo = "excel" } = req.query as Record<string, string>;
      if (!periodo) return res.status(400).json({ error: "Se requiere 'periodo' (MM/YYYY)" });

      const rows = (await db.execute(sql`
        SELECT pi.*, s.razon_social AS supplier_nombre, s.condicion_iva
        FROM purchase_invoices pi
        LEFT JOIN accounting_suppliers s ON s.id = pi.supplier_id
        WHERE pi.periodo = ${periodo} AND pi.estado != 'anulado'
        ORDER BY pi.fecha_emision, pi.numero_comprobante
      `)).rows as any[];

      const [mm, yyyy] = periodo.split("/");
      const periodoCode = ivaPeriodo(periodo);
      const ts = `${mm}${yyyy}`;

      if (tipo === "excel") {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Libro IVA Compras");
        const headers = [
          "_iva","codiva","codcom","comprobante","codpos","numcom","numcomext","fecemi",
          "codpro","proveedor","cuit","gravado21","gravado10_5","gravado27","gravado2_5","gravado5",
          "iva21","iva10_5","iva27","iva2_5","iva5","exento","nogravado","imp_internos","imp_25413",
          "per_iibb","per_iva","per_gcias","monotributo_c_b","ret_iibb","ret_gcia","ret_iva","ret_suss",
          "ret_municipal","total",
        ];
        const hRow = ws.addRow(headers);
        hRow.font = { bold: true };
        ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };

        for (const r of rows) {
          const ti = tipoInfo(r.tipo_comprobante);
          ws.addRow([
            periodoCode,
            ivaCodiva(r.condicion_iva || ""),
            ti.codcom,
            ti.label,
            r.punto_venta || 1,
            parseInt(r.numero_comprobante) || 0,
            r.numero_comprobante_ext || r.numero_comprobante,
            fDate(r.fecha_emision),
            r.supplier_id || 0,
            r.supplier_nombre || r.proveedor_nombre || "",
            (r.proveedor_cuit || "").replace(/-/g, ""),
            $n(r.monto_neto),
            0, 0, 0, 0, // gravado10_5, 27, 2_5, 5
            $n(r.monto_iva21),
            $n(r.monto_iva105),
            $n(r.monto_iva27),
            $n(r.monto_iva25),
            $n(r.monto_iva5),
            $n(r.monto_exento),
            $n(r.monto_no_gravado),
            $n(r.impuestos_internos),
            $n(r.ley_25413),
            $n(r.percepcion_iibb),
            $n(r.percepcion_iva),
            $n(r.percepcion_ganancias),
            $n(r.monotributo_comp_bc),
            $n(r.retencion_iibb),
            $n(r.retencion_ganancias),
            $n(r.retencion_iva),
            $n(r.retencion_suss),
            $n(r.retencion_municipal),
            $n(r.monto_total),
          ]);
        }

        // Totals row
        const totRow = ws.addRow([
          "", "", "", "TOTALES", "", "", "", "", "", "", "",
          rows.reduce((s, r) => s + $n(r.monto_neto), 0), 0, 0, 0, 0,
          rows.reduce((s, r) => s + $n(r.monto_iva21), 0),
          rows.reduce((s, r) => s + $n(r.monto_iva105), 0),
          rows.reduce((s, r) => s + $n(r.monto_iva27), 0),
          0, 0,
          rows.reduce((s, r) => s + $n(r.monto_exento), 0),
          rows.reduce((s, r) => s + $n(r.monto_no_gravado), 0),
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          rows.reduce((s, r) => s + $n(r.monto_total), 0),
        ]);
        totRow.font = { bold: true };

        const buf = await wb.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="libro_iva_compras_${ts}.xlsx"`);
        res.send(Buffer.from(buf as ArrayBuffer));
      } else if (tipo === "cbte") {
        const lines = rows.map(cbteComprasLine);
        const content = lines.join("\r\n");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="LIBRO_IVA_DIGITAL_COMPRAS_CBTE_p_${mm}_${yyyy}.txt"`);
        res.send(content);
      } else if (tipo === "alicuotas") {
        const lines = rows.flatMap(alicuotasComprasLines);
        const content = lines.join("\r\n");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_p_${mm}_${yyyy}.txt"`);
        res.send(content);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Libro IVA Ventas ──────────────────────────────────────────────────────

  app.get("/api/exports/libro-iva-ventas", requireAuth, async (req, res) => {
    try {
      const { desde, hasta, tipo = "excel" } = req.query as Record<string, string>;
      if (!desde || !hasta) return res.status(400).json({ error: "Se requieren 'desde' y 'hasta'" });

      // Sales: payments + reservations + guests
      const rows = (await db.execute(sql`
        SELECT
          p.id, p.date AS fecha, p.amount AS total, p.method,
          p.reservation_id,
          CONCAT(g.first_name, ' ', g.last_name) AS guest_name,
          COALESCE(g.cuil_cuit, '00000000000') AS cuit,
          r.reservation_code
        FROM payments p
        LEFT JOIN reservations r ON r.id = p.reservation_id
        LEFT JOIN guests g ON g.id = r.guest_id
        WHERE p.date BETWEEN ${desde} AND ${hasta}
        ORDER BY p.date, p.id
      `)).rows as any[];

      const [d1, d2] = [desde.replace(/-/g, ""), hasta.replace(/-/g, "")];
      const ts = `${d1}-${d2}`;

      // Calculate IVA 21% from total (total includes 21% IVA) — from shared pricing module
      const calcIVA = (total: number) => calcIva21(calcNeto(total));

      if (tipo === "excel") {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Libro IVA Ventas");
        const hRow = ws.addRow(["fecha","tipo","punto_venta","numero","proveedor_nro","cliente","cuit","total","neto_gravado","iva","exento","no_gravado"]);
        hRow.font = { bold: true };
        ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };

        for (const r of rows) {
          ws.addRow([
            fDate(r.fecha), "FACT-B", "0001", r.id,
            r.reservation_code, r.guest_name,
            (r.cuit || "").replace(/-/g, ""),
            $n(r.total), calcNeto($n(r.total)), calcIVA($n(r.total)), 0, 0,
          ]);
        }
        const buf = await wb.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="libro_iva_ventas_${ts}.xlsx"`);
        res.send(Buffer.from(buf as ArrayBuffer));
      } else if (tipo === "cbte") {
        const lines = rows.map(cbteVentasLine);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="LIBRO_IVA_DIGITAL_VENTAS_CBTE_f_${ts}.txt"`);
        res.send(lines.join("\r\n"));
      } else if (tipo === "alicuotas") {
        const lines = rows.map((r) =>
          alicuotasVentasLine({ ...r, neto: calcNeto($n(r.total)), iva: calcIVA($n(r.total)) })
        );
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_f_${ts}.txt"`);
        res.send(lines.join("\r\n"));
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Mayor de Cuentas (PDF) ────────────────────────────────────────────────

  app.get("/api/exports/mayor", requireAuth, async (req, res) => {
    try {
      const { periodo, tipo = "totalizado" } = req.query as Record<string, string>;
      if (!periodo) return res.status(400).json({ error: "Se requiere 'periodo' (MM/YYYY)" });

      const [mm, yyyy] = periodo.split("/");
      const year = parseInt(yyyy);

      // Get accounts with movements for this period
      const accounts = (await db.execute(sql`
        SELECT
          aa.id, aa.codigo, aa.nombre,
          SUM(ael.debe) AS total_debe,
          SUM(ael.haber) AS total_haber
        FROM accounting_accounts aa
        INNER JOIN accounting_entry_lines ael ON ael.account_id = aa.id
        INNER JOIN accounting_entries ae ON ae.id = ael.entry_id
        WHERE ae.periodo = ${periodo}
        GROUP BY aa.id, aa.codigo, aa.nombre
        ORDER BY aa.codigo
      `)).rows as any[];

      // Get detailed lines per account if needed
      const detailMap: Record<number, any[]> = {};
      if (tipo === "detallado") {
        const lines = (await db.execute(sql`
          SELECT
            ael.*, ae.fecha, ae.numero_minuta, ae.concepto,
            ael.comprobante_tipo, ael.comprobante_numero, ael.proveedor_nombre
          FROM accounting_entry_lines ael
          INNER JOIN accounting_entries ae ON ae.id = ael.entry_id
          WHERE ae.periodo = ${periodo}
          ORDER BY ael.account_id, ae.fecha, ae.numero_minuta
        `)).rows as any[];
        for (const l of lines) {
          if (!detailMap[l.account_id]) detailMap[l.account_id] = [];
          detailMap[l.account_id].push(l);
        }
      }

      const ejercicio = `Ejercicio ${year}/${year + 1}: 01/05/${year} - 30/06/${year + 1}`;
      const titlePDF = tipo === "totalizado" ? "Mayor de Cuentas Totalizado" : "Mayor de Cuentas Detallado";

      const pdfBuf = await genPDF((doc) => {
        pdfHeader(doc, titlePDF, [ejercicio, `Periodo: ${periodo}`]);

        const x0 = 40;
        let totalDebe = 0, totalHaber = 0;

        for (const acc of accounts) {
          const debe = $n(acc.total_debe);
          const haber = $n(acc.total_haber);
          const saldo = debe - haber;
          totalDebe += debe;
          totalHaber += haber;

          if (doc.y > 700) doc.addPage();

          // Account header
          doc.font("Helvetica-Bold").fontSize(9)
            .text(`Cuenta: ${acc.nombre} [${acc.codigo}]`, x0, doc.y)
            .moveDown(0.2);

          if (tipo === "detallado") {
            const lines = detailMap[acc.id] || [];
            doc.font("Helvetica").fontSize(7.5);
            const cols = { fecha: 55, minuta: 45, concepto: 100, comp: 60, num: 90, prov: 110, monto: 65, saldo: 65 };
            let runSaldo = 0;

            // Column headers
            let y = doc.y;
            doc.font("Helvetica-Bold");
            doc.text("Fecha", x0, y);
            doc.text("Minuta", x0 + cols.fecha, y);
            doc.text("Concepto", x0 + cols.fecha + cols.minuta, y);
            doc.text("Tipo", x0 + cols.fecha + cols.minuta + cols.concepto, y);
            doc.text("Nro.", x0 + cols.fecha + cols.minuta + cols.concepto + cols.comp, y);
            doc.text("Proveedor", x0 + cols.fecha + cols.minuta + cols.concepto + cols.comp + cols.num, y);
            doc.text("Debe/Haber", x0 + 400, y);
            doc.text("Saldo", x0 + 465, y);
            y += 12;
            doc.moveTo(x0, y).lineTo(555, y).strokeColor("#ccc").stroke();
            y += 3;
            doc.font("Helvetica").fontSize(7.5);

            for (const l of lines) {
              if (y > 760) { doc.addPage(); y = 60; }
              const isD = $n(l.debe) > 0;
              const monto = isD ? $n(l.debe) : $n(l.haber);
              runSaldo += isD ? monto : -monto;
              doc.text(fDate(l.fecha), x0, y);
              doc.text(String(l.numero_minuta || ""), x0 + cols.fecha, y);
              doc.text((l.concepto || "").substring(0, 16), x0 + cols.fecha + cols.minuta, y);
              doc.text((l.comprobante_tipo || "").substring(0, 8), x0 + cols.fecha + cols.minuta + cols.concepto, y);
              doc.text((l.comprobante_numero || "").substring(0, 14), x0 + cols.fecha + cols.minuta + cols.concepto + cols.comp, y);
              doc.text((l.proveedor_nombre || "").substring(0, 16), x0 + cols.fecha + cols.minuta + cols.concepto + cols.comp + cols.num, y);
              doc.text(`${isD ? "D" : "H"} ${fPeso(monto)}`, x0 + 400, y, { width: 65, align: "right" });
              doc.text(fPeso(runSaldo), x0 + 465, y, { width: 65, align: "right" });
              y += 11;
            }
            doc.moveDown(0.2);
          }

          // Subtotal row
          doc.font("Helvetica-Bold").fontSize(8)
            .text(`Subtotal:`, x0 + 260)
            .text(`Debe: ${fPeso(debe)}`, x0 + 320, doc.y - 12)
            .text(`Haber: ${fPeso(haber)}`, x0 + 400, doc.y - 12)
            .text(`Saldo: ${fPeso(saldo)}`, x0 + 470, doc.y - 12);
          doc.moveTo(x0, doc.y).lineTo(555, doc.y).strokeColor("#aaa").stroke();
          doc.moveDown(0.8);
        }

        // Grand total
        if (doc.y > 720) doc.addPage();
        doc.moveDown(0.5)
          .moveTo(x0, doc.y).lineTo(555, doc.y).strokeColor("#000").lineWidth(1.5).stroke()
          .moveDown(0.3)
          .font("Helvetica-Bold").fontSize(9)
          .text(`Total final:   Debe: ${fPeso(totalDebe)}   Haber: ${fPeso(totalHaber)}   Saldo: ${fPeso(totalDebe - totalHaber)}`, x0 + 200);
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="mayor_${tipo}_${periodo.replace("/", "_")}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── CC Proveedores (PDF) ──────────────────────────────────────────────────

  app.get("/api/exports/cc-proveedores", requireAuth, async (req, res) => {
    try {
      const suppliers = (await db.execute(sql`
        SELECT s.id, s.razon_social, s.cuit, s.condicion_iva,
          COALESCE(SUM(pi.monto_total::numeric), 0) AS total_saldo,
          COUNT(pi.id) AS cant_facturas
        FROM accounting_suppliers s
        INNER JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.estado = 'pendiente'
        GROUP BY s.id, s.razon_social, s.cuit, s.condicion_iva
        ORDER BY s.razon_social
      `)).rows as any[];

      const pdfBuf = await genPDF(async (doc) => {
        pdfHeader(doc, "Cuenta Corriente Proveedores");

        const x0 = 40;
        let y = doc.y;
        let grandTotal = 0;

        doc.font("Helvetica-Bold").fontSize(8);
        doc.text("Proveedor", x0, y);
        doc.text("CUIT", x0 + 200, y);
        doc.text("Cond. IVA", x0 + 300, y);
        doc.text("Facturas", x0 + 380, y, { width: 50, align: "right" });
        doc.text("Saldo", x0 + 440, y, { width: 90, align: "right" });
        y += 14;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 4;
        doc.font("Helvetica").fontSize(8);

        for (const s of suppliers) {
          if (y > 760) { doc.addPage(); y = 60; }
          const saldo = $n(s.total_saldo);
          grandTotal += saldo;
          doc.text((s.razon_social || "").substring(0, 30), x0, y);
          doc.text(s.cuit || "", x0 + 200, y);
          doc.text((s.condicion_iva || "").substring(0, 14), x0 + 300, y);
          doc.text(String(s.cant_facturas), x0 + 380, y, { width: 50, align: "right" });
          doc.text(fPeso(saldo), x0 + 440, y, { width: 90, align: "right" });
          y += 13;
        }

        y += 6;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#000").stroke();
        y += 6;
        doc.font("Helvetica-Bold").fontSize(9)
          .text(`TOTAL DEUDA: $ ${fPeso(grandTotal)}`, x0 + 350, y, { width: 180, align: "right" });
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="cc_proveedores_${nowStr()}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Orden de Pago PDF ─────────────────────────────────────────────────────

  app.get("/api/payment-orders/:id/pdf", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const opRes = await db.execute(sql`
        SELECT po.*, s.razon_social, s.cuit AS supplier_cuit, s.domicilio, s.localidad, s.condicion_iva
        FROM payment_orders po
        JOIN accounting_suppliers s ON s.id = po.supplier_id
        WHERE po.id = ${id}
      `);
      if (!opRes.rows.length) return res.status(404).json({ error: "OP no encontrada" });
      const op = opRes.rows[0] as any;

      // Get cancelled invoices
      const items = (await db.execute(sql`
        SELECT poi.*, pi.tipo_comprobante, pi.numero_comprobante_ext, pi.numero_comprobante, pi.fecha_emision, pi.monto_total
        FROM payment_order_items poi
        JOIN purchase_invoices pi ON pi.id = poi.invoice_id
        WHERE poi.payment_order_id = ${id}
        ORDER BY pi.fecha_emision
      `)).rows as any[];

      const pdfBuf = await genPDF((doc) => {
        const x0 = 40;
        let y = 40;

        // Header box
        doc.rect(x0, y, 515, 80).strokeColor("#333").lineWidth(1).stroke();

        doc.font("Helvetica-Bold").fontSize(16)
          .text("ORDEN DE PAGO", x0 + 200, y + 10, { align: "right", width: 300 });
        doc.font("Helvetica").fontSize(7.5).fillColor("#666")
          .text("DOCUMENTO NO VALIDO COMO FACTURA", x0 + 200, y + 32, { align: "right", width: 300 });
        doc.fillColor("#000").fontSize(9)
          .text(H.nombre, x0 + 8, y + 10)
          .text(`${H.empresa} - CUIT ${H.cuit}`, x0 + 8, y + 23)
          .text(H.domicilio, x0 + 8, y + 36)
          .text(H.localidad, x0 + 8, y + 49);
        doc.font("Helvetica-Bold")
          .text(`Orden N°: ${op.numero}`, x0 + 320, y + 52)
          .text(`Parana, ${fDate(op.fecha)}`, x0 + 320, y + 66);
        y += 90;

        // Supplier info
        doc.font("Helvetica").fontSize(9)
          .text(`Razon Social: ${op.razon_social}`, x0, y)
          .text(`Domicilio: ${op.domicilio || ""}`, x0, y + 12)
          .text(`Localidad: ${op.localidad || ""}`, x0, y + 24)
          .text(`IVA: ${op.condicion_iva || "R.Inscrp."}     CUIT: ${op.supplier_cuit}`, x0, y + 36);
        y += 55;

        doc.font("Helvetica").fontSize(9).text(
          "Tenemos el agrado de adjuntarle(s) en pago de las siguientes facturas:", x0, y
        );
        y += 20;

        // Invoices table
        doc.rect(x0, y, 515, 20).fill("#EEF2FA");
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(8.5);
        doc.text("Comprobante", x0 + 8, y + 6);
        doc.text("Numero", x0 + 150, y + 6);
        doc.text("Fecha", x0 + 280, y + 6);
        doc.text("Importe", x0 + 390, y + 6, { width: 120, align: "right" });
        y += 22;

        doc.font("Helvetica").fontSize(8.5).fillColor("#000");
        for (const item of items) {
          if (y > 660) { doc.addPage(); y = 60; }
          doc.text(item.tipo_comprobante, x0 + 8, y);
          doc.text(item.numero_comprobante_ext || item.numero_comprobante || "", x0 + 150, y);
          doc.text(fDate(item.fecha_emision), x0 + 280, y);
          doc.text(`$ ${fPeso($n(item.monto_total))}`, x0 + 390, y, { width: 120, align: "right" });
          y += 14;
        }

        // Payment method
        y += 10;
        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").lineWidth(0.5).stroke();
        y += 10;

        doc.font("Helvetica").fontSize(9)
          .text(`Mediante el pago en:`, x0, y);
        y += 14;

        const metodos = [
          ["Efectivo", $n(op.efectivo)],
          ["Transferencia", $n(op.total_abonado) - $n(op.efectivo) - $n(op.dep_bancario) - $n(op.cheques)],
          ["Cheques", $n(op.cheques)],
          ["Dep. Bancario", $n(op.dep_bancario)],
        ] as [string, number][];

        let xM = x0;
        for (const [label, val] of metodos) {
          doc.font("Helvetica-Bold").text(`${label}: `, xM, y, { continued: true })
            .font("Helvetica").text(`$ ${fPeso(val)}`);
          if (xM < 300) xM += 130; else { xM = x0; y += 14; }
        }
        y += 20;

        // Retenciones
        const retenciones = [
          ["Retencion Ganancias", $n(op.retencion_ganancias)],
          ["Retencion IIBB", $n(op.retencion_iibb)],
          ["Ret.Prof.Liberales", $n(op.retencion_prof_libs)],
          ["Retencion IVA", $n(op.retencion_iva)],
        ] as [string, number][];

        let xR = x0;
        for (const [label, val] of retenciones) {
          doc.font("Helvetica-Bold").text(`${label}: `, xR, y, { continued: true })
            .font("Helvetica").text(`$ ${fPeso(val)}`);
          if (xR < 300) xR += 130; else { xR = x0; y += 14; }
        }
        y += 24;

        // Totals box
        doc.rect(x0 + 280, y, 235, 50).strokeColor("#333").stroke();
        doc.font("Helvetica-Bold").fontSize(10)
          .text("Total Facturas:", x0 + 290, y + 6)
          .text(`$ ${fPeso($n(op.total_facturas))}`, x0 + 390, y + 6, { width: 110, align: "right" });
        doc.moveTo(x0 + 285, y + 22).lineTo(x0 + 510, y + 22).strokeColor("#666").stroke();
        doc.font("Helvetica-Bold").fontSize(12)
          .text("Total Abonado:", x0 + 290, y + 28)
          .text(`$ ${fPeso($n(op.total_abonado))}`, x0 + 390, y + 28, { width: 110, align: "right" });

        // Signature
        y += 80;
        doc.moveTo(x0 + 300, y).lineTo(x0 + 480, y).strokeColor("#000").stroke();
        doc.font("Helvetica").fontSize(8)
          .text("Firma y Sello", x0 + 350, y + 4);
      });

      const opNumStr = op.numero ? String(parseInt((op.numero as string).split("-")[1] || "0")).padStart(5, "0") : String(op.id);
      const provNameOp = ((op.razon_social as string) || "").replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/g, "").substring(0, 20);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="OP_${opNumStr}_${provNameOp}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Certificado de Retención Ingresos Brutos (IIBB) ──────────────────────

  app.get("/api/exports/cert-retencion/:opId", requireAuth, async (req, res) => {
    try {
      const opId = parseInt(req.params.opId);
      const opRes = await db.execute(sql`
        SELECT po.*, s.razon_social, s.cuit AS supplier_cuit, s.condicion_iva, s.domicilio, s.localidad, s.alicuota_iibb
        FROM payment_orders po
        JOIN accounting_suppliers s ON s.id = po.supplier_id
        WHERE po.id = ${opId} AND po.retencion_iibb > 0
      `);
      if (!opRes.rows.length) return res.status(404).json({ error: "OP no encontrada o sin retención de Ingresos Brutos" });
      const op = opRes.rows[0] as any;

      const retIibb = $n(op.retencion_iibb);

      // Base = suma de netos de las facturas de la OP (no el total)
      const netosRes = await db.execute(sql`
        SELECT COALESCE(SUM(pi.monto_neto), 0) AS base_netos
        FROM payment_order_items poi
        JOIN purchase_invoices pi ON pi.id = poi.invoice_id
        WHERE poi.payment_order_id = ${opId}
      `);
      const baseNetos = $n((netosRes.rows[0] as any)?.base_netos);
      const base = baseNetos > 0 ? baseNetos : $n(op.total_facturas);

      const alicuotaUsed = op.alicuota_iibb_op ? parseFloat(op.alicuota_iibb_op)
        : op.alicuota_iibb ? parseFloat(op.alicuota_iibb)
        : base > 0 ? (retIibb / base) * 100 : 0;
      const alicuota = alicuotaUsed.toFixed(2);

      const pdfBuf = await genPDF((doc) => {
        const x0 = 40;
        let y = 40;

        // Header
        doc.rect(x0, y, 515, 60).strokeColor("#333").lineWidth(1).stroke();
        doc.font("Helvetica-Bold").fontSize(14)
          .text("CERTIFICADO DE RETENCION", x0, y + 8, { align: "center", width: 515 });
        doc.font("Helvetica-Bold").fontSize(10)
          .text("Regimen: INGRESOS BRUTOS - SIRCAR", x0, y + 30, { align: "center", width: 515 });
        doc.font("Helvetica").fontSize(8)
          .text("Provincia de Entre Ríos", x0, y + 44, { align: "center", width: 515 });
        y += 70;

        // Agent info
        doc.font("Helvetica-Bold").fontSize(9).text("AGENTE DE RETENCION:", x0, y);
        doc.font("Helvetica").fontSize(9)
          .text(`Empresa: ${H.empresa}`, x0, y + 14)
          .text(`CUIT: ${H.cuit}`, x0, y + 27)
          .text(`Domicilio: ${H.domicilio} - ${H.localidad}`, x0, y + 40);
        y += 60;

        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 10;

        // Supplier info
        doc.font("Helvetica-Bold").fontSize(9).text("BENEFICIARIO:", x0, y);
        doc.font("Helvetica").fontSize(9)
          .text(`Empresa: ${op.razon_social}`, x0, y + 14)
          .text(`CUIT: ${op.supplier_cuit}`, x0, y + 27)
          .text(`Cond. IVA: ${op.condicion_iva}`, x0, y + 40)
          .text(`Domicilio: ${op.domicilio || ""} - ${op.localidad || ""}`, x0, y + 53);
        y += 72;

        doc.moveTo(x0, y).lineTo(555, y).strokeColor("#999").stroke();
        y += 10;

        // Datos de la OP
        doc.font("Helvetica-Bold").fontSize(9).text("DATOS DE LA RETENCION:", x0, y);
        y += 16;

        const tbl: [string, string][] = [
          ["Fecha de Pago", fDate(op.fecha)],
          ["N° de OP", op.numero],
          ["Importe Base de Calculo", `$ ${fPeso(base)}`],
          ["Alicuota Aplicada", `${alicuota}%`],
          ["Importe de Retencion", `$ ${fPeso(retIibb)}`],
        ];

        for (const [label, value] of tbl) {
          doc.font("Helvetica-Bold").text(`${label}:`, x0, y, { continued: true, width: 220 })
            .font("Helvetica").text(`  ${value}`);
          y += 14;
        }
        y += 20;

        // Signature
        doc.moveTo(x0 + 300, y).lineTo(x0 + 480, y).strokeColor("#000").stroke();
        doc.font("Helvetica").fontSize(8).text("Firma y Sello Agente de Retencion", x0 + 290, y + 4);
        doc.text(fDate(new Date()), x0, y + 4);
      });

      const opNum = op.numero ? String(parseInt(op.numero.split("-")[1] || "0")).padStart(5, "0") : String(opId);
      const provNameCert = (op.razon_social || "").replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/g, "").substring(0, 20);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="RETIIBB_${opNum}_${provNameCert}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Recibo de Cobro — Cuenta Corriente ───────────────────────────────────────
  app.get("/api/account-movements/:id/receipt-pdf", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const movResult = await db.execute(sql`SELECT * FROM account_movements WHERE id = ${id}`);
      const mov = movResult.rows[0] as any;
      if (!mov) return res.status(404).json({ error: "Movimiento no encontrado" });
      if (mov.type !== "pago") return res.status(400).json({ error: "Solo se generan recibos para movimientos de pago" });

      const createdAt = new Date(mov.created_at);
      const year = createdAt.getFullYear();

      const numResult = await db.execute(sql`
        SELECT COUNT(*)::int AS num FROM account_movements
        WHERE type = 'pago'
          AND EXTRACT(YEAR FROM created_at) = ${year}
          AND created_at <= ${mov.created_at}
      `);
      const recNum = parseInt((numResult.rows[0] as any).num) || 1;
      const recibo = `REC-${year}-${String(recNum).padStart(4, "0")}`;

      let entityName = "";
      let entityDoc = "";
      let entityAddress = "";

      if (mov.entity_type === "guest") {
        const r = await db.execute(sql`
          SELECT first_name, last_name, cuil_cuit, document_type, document_number, direccion, localidad
          FROM guests WHERE id = ${mov.entity_id}
        `);
        const g = r.rows[0] as any;
        if (g) {
          entityName = `${g.first_name} ${g.last_name}`;
          entityDoc = g.cuil_cuit
            ? `CUIL/CUIT ${g.cuil_cuit}`
            : g.document_number
            ? `${g.document_type || "DNI"} ${g.document_number}`
            : "";
          entityAddress = [g.direccion, g.localidad].filter(Boolean).join("  ·  ");
        }
      } else if (mov.entity_type === "company") {
        const r = await db.execute(sql`
          SELECT razon_social, nombre_fantasia, cuil_cuit, direccion, localidad
          FROM companies WHERE id = ${mov.entity_id}
        `);
        const c = r.rows[0] as any;
        if (c) {
          entityName = c.nombre_fantasia || c.razon_social;
          entityDoc = c.cuil_cuit ? `CUIT ${c.cuil_cuit}` : "";
          entityAddress = [c.direccion, c.localidad].filter(Boolean).join("  ·  ");
        }
      } else if (mov.entity_type === "agency") {
        const r = await db.execute(sql`
          SELECT razon_social, nombre_fantasia, cuil_cuit, direccion, localidad
          FROM agencies WHERE id = ${mov.entity_id}
        `);
        const a = r.rows[0] as any;
        if (a) {
          entityName = a.nombre_fantasia || a.razon_social;
          entityDoc = a.cuil_cuit ? `CUIT ${a.cuil_cuit}` : "";
          entityAddress = [a.direccion, a.localidad].filter(Boolean).join("  ·  ");
        }
      }

      const amount = Math.abs($n(mov.amount));
      const pageW = 595;
      const x0 = 50;

      const pdfBuf = await genPDF((doc) => {
        // ─── Header azul ───────────────────────────────────────────────────
        doc.rect(0, 0, pageW, 108).fill("#1a3a5c");
        doc.fill("white").font("Helvetica-Bold").fontSize(13)
          .text(H.nombre, x0, 20, { width: pageW - 160 });
        doc.font("Helvetica").fontSize(8.5)
          .text(`${H.empresa}  ·  CUIT ${H.cuit}`, x0, 37)
          .text(`${H.domicilio}  ·  ${H.localidad}`, x0, 50);

        doc.fill("white").font("Helvetica-Bold").fontSize(22)
          .text("RECIBO", pageW - 145, 18, { width: 120, align: "right" });
        doc.font("Helvetica-Bold").fontSize(10)
          .text(`Nº ${recibo}`, pageW - 145, 48, { width: 120, align: "right" });

        // ─── Bloque: Recibimos de ─────────────────────────────────────────
        let y = 128;
        doc.fill("#000000");
        doc.rect(x0, y, pageW - 100, 72).strokeColor("#cccccc").lineWidth(0.5).stroke();
        doc.font("Helvetica").fontSize(7.5).fill("#888")
          .text("Recibimos de:", x0 + 10, y + 9);
        doc.font("Helvetica-Bold").fontSize(11).fill("#111")
          .text(entityName || "—", x0 + 10, y + 21, { width: pageW - 125 });
        if (entityDoc) doc.font("Helvetica").fontSize(9).fill("#444").text(entityDoc, x0 + 10, y + 38);
        if (entityAddress) doc.font("Helvetica").fontSize(8.5).fill("#666").text(entityAddress, x0 + 10, y + 51);

        // ─── Bloque: Importe ──────────────────────────────────────────────
        y += 87;
        doc.rect(x0, y, pageW - 100, 52).strokeColor("#cccccc").lineWidth(0.5).stroke();
        doc.font("Helvetica").fontSize(7.5).fill("#888").text("La suma de pesos:", x0 + 10, y + 9);
        doc.font("Helvetica-Bold").fontSize(18).fill("#1a3a5c")
          .text(`$${fPeso(amount)}`, x0 + 10, y + 21, { width: 300 });

        // ─── Bloque: Concepto ─────────────────────────────────────────────
        y += 67;
        doc.rect(x0, y, pageW - 100, 52).strokeColor("#cccccc").lineWidth(0.5).stroke();
        doc.font("Helvetica").fontSize(7.5).fill("#888").text("En concepto de:", x0 + 10, y + 9);
        doc.font("Helvetica").fontSize(9.5).fill("#111")
          .text(mov.description || "Cobro cuenta corriente", x0 + 10, y + 22, { width: pageW - 125 });
        if (mov.reference) {
          doc.font("Helvetica").fontSize(8).fill("#777")
            .text(`Referencia: ${mov.reference}`, x0 + 10, y + 38);
        }

        // ─── Fecha ────────────────────────────────────────────────────────
        y += 67;
        doc.font("Helvetica").fontSize(9).fill("#333")
          .text(`Fecha de pago: ${fDate(mov.date || mov.created_at)}`, x0, y)
          .text(`Registrado: ${fDate(mov.created_at)}`, x0, y + 14);

        // ─── Líneas de firma ──────────────────────────────────────────────
        const sigY = y + 60;
        const half = (pageW - 100) / 2;
        doc.moveTo(x0, sigY).lineTo(x0 + half - 20, sigY).strokeColor("#aaa").lineWidth(0.5).stroke();
        doc.moveTo(x0 + half + 20, sigY).lineTo(pageW - 50, sigY).stroke();
        doc.font("Helvetica").fontSize(7.5).fill("#888")
          .text("Firma y aclaración del cobrador", x0, sigY + 5, { width: half - 20, align: "center" })
          .text("Sello del hotel", x0 + half + 20, sigY + 5, { width: half - 20, align: "center" });

        // ─── Pie ──────────────────────────────────────────────────────────
        doc.font("Helvetica").fontSize(6.5).fill("#bbb")
          .text(
            "Documento no válido como comprobante fiscal. Solo para uso interno.",
            x0, 782, { align: "center", width: pageW - 100 }
          );
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="recibo_${recibo}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
