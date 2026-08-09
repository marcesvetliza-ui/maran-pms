import PDFDocument from "pdfkit";

const $n = (v: any) => parseFloat(String(v ?? 0)) || 0;

function fPeso(n: number | string) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format($n(n));
}

function fDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + "T12:00:00") : d;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function padNum(n: number, len: number) {
  return String(n).padStart(len, "0");
}

// ── Amount in words (Spanish) ────────────────────────────────────────────────
function _group(n: number): string {
  const u = ["","UN","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE"];
  const d = ["","","VEINTE","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"];
  const c = ["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  let r = "";
  if (n >= 100) { r = c[Math.floor(n / 100)] + " "; n = n % 100; }
  if (n >= 20)  { r += d[Math.floor(n / 10)]; if (n % 10) r += " Y " + u[n % 10]; }
  else if (n > 0) r += u[n];
  return r.trim();
}

function montoEnPalabras(total: number): string {
  const entero = Math.floor(total);
  const cents  = Math.round((total - entero) * 100);
  if (entero === 0) return `SON PESOS CERO CON ${String(cents).padStart(2, "0")}/100`;
  const mill = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1_000);
  const rest  = entero % 1_000;
  const parts: string[] = [];
  if (mill)  parts.push(mill === 1 ? "UN MILLÓN" : _group(mill) + " MILLONES");
  if (miles) parts.push(miles === 1 ? "MIL" : _group(miles) + " MIL");
  if (rest)  parts.push(_group(rest));
  return `Son Pesos ${parts.join(" ")} CON ${String(cents).padStart(2, "0")}/100`;
}

// ── Código de artículo por defecto ───────────────────────────────────────────
function deriveCode(descripcion: string, provided?: string): string {
  if (provided) return provided.toUpperCase().slice(0, 6);
  const d = descripcion.toLowerCase();
  if (d.includes("hospedaje") || d.includes("estadía") || d.includes("estadia") || d.includes("alojam")) return "ALOJA";
  if (d.includes("desayuno"))  return "DESAY";
  if (d.includes("spa"))       return "SPA";
  if (d.includes("restauran") || d.includes("consumición")) return "REST";
  if (d.includes("estacion")  || d.includes("parking"))     return "PARK";
  if (d.includes("minibar"))   return "MBAR";
  if (d.includes("lavandería") || d.includes("lavanderia"))  return "LAV";
  if (d.includes("anulación")  || d.includes("anulacion"))   return "ANUL";
  return "SER";
}

// ── Tipo labels ───────────────────────────────────────────────────────────────
const TIPO_LABELS: Record<string, { nombre: string; letra: string; codigo: string }> = {
  FA:  { nombre: "FACTURA",             letra: "A", codigo: "001" },
  FB:  { nombre: "FACTURA",             letra: "B", codigo: "006" },
  FC:  { nombre: "FACTURA",             letra: "C", codigo: "011" },
  FT:  { nombre: "FACTURA",             letra: "T", codigo: "195" },
  FM:  { nombre: "FACTURA MiPyME",      letra: "A", codigo: "201" },
  NCA: { nombre: "NOTA DE CRÉDITO",     letra: "A", codigo: "003" },
  NCB: { nombre: "NOTA DE CRÉDITO",     letra: "B", codigo: "008" },
  NCC: { nombre: "NOTA DE CRÉDITO",     letra: "C", codigo: "013" },
  NCT: { nombre: "NOTA DE CRÉDITO",     letra: "T", codigo: "197" },
  NCM: { nombre: "NOTA DE CRÉDITO MiPyME", letra: "A", codigo: "203" },
  NDA: { nombre: "NOTA DE DÉBITO",      letra: "A", codigo: "002" },
  NDB: { nombre: "NOTA DE DÉBITO",      letra: "B", codigo: "007" },
  NDC: { nombre: "NOTA DE DÉBITO",      letra: "C", codigo: "012" },
  NDT: { nombre: "NOTA DE DÉBITO",      letra: "T", codigo: "196" },
  NDM: { nombre: "NOTA DE DÉBITO MiPyME", letra: "A", codigo: "202" },
};

// ── Guest data (optional, enriched from reservation) ─────────────────────────
export interface InvoiceGuestData {
  guestName: string;
  guestDni?: string | null;
  roomNumber?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  numberOfGuests?: number | null;
}

export interface NotaCreditoInfo {
  tipoComprobante: string;
  puntoVenta: number;
  numero: number;
  fechaEmision: string;
  montoTotal: number;
}

// ── Main PDF generator ────────────────────────────────────────────────────────
export interface FacturaRetenciones {
  iibb: number;
  ganancias: number;
  iva: number;
}

export async function generarFacturaPDF(
  factura: any,
  config: any,
  notaCredito?: NotaCreditoInfo,
  guestData?: InvoiceGuestData,
  logoBuffer?: Buffer,
  retenciones?: FacturaRetenciones,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Field aliases ──────────────────────────────────────────────────────
    const tipoKey    = factura.tipo_comprobante  ?? factura.tipoComprobante  ?? "";
    const puntoVenta = factura.punto_venta        ?? factura.puntoVenta       ?? 1;
    const numero     = factura.numero             ?? 0;
    const fechaEmision  = factura.fecha_emision   ?? factura.fechaEmision;
    const fechaVtoPago  = factura.fecha_vto_pago  ?? factura.fechaVtoPago;
    const caeFechaVto   = factura.cae_fecha_vto   ?? factura.caeFechaVto;
    const cae           = factura.cae             ?? null;
    const modoFicticio  = factura.modo_ficticio   ?? factura.modoFicticio    ?? false;
    const operador      = factura.operador        ?? null;
    const cashFormaPago = factura.cash_forma_pago ?? factura.cashFormaPago   ?? null;

    const clienteRazonSocial  = factura.cliente_razon_social  ?? factura.clienteRazonSocial  ?? "—";
    const clienteDomicilio    = factura.cliente_domicilio     ?? factura.clienteDomicilio     ?? "—";
    const clienteCuit         = factura.cliente_cuit          ?? factura.clienteCuit          ?? null;
    const clienteDni          = factura.cliente_dni           ?? factura.clienteDni           ?? null;
    const clienteCondicionIva = factura.cliente_condicion_iva ?? factura.clienteCondicionIva  ?? "—";

    const montoNeto      = $n(factura.monto_neto       ?? factura.montoNeto       ?? 0);
    const montoExento    = $n(factura.monto_exento     ?? factura.montoExento     ?? 0);
    const montoNoGravado = $n(factura.monto_no_gravado ?? factura.montoNoGravado  ?? 0);
    const montoIva21     = $n(factura.monto_iva21      ?? factura.montoIva21      ?? 0);
    const montoIva105    = $n(factura.monto_iva105     ?? factura.montoIva105     ?? 0);
    const montoTotal     = $n(factura.monto_total      ?? factura.montoTotal      ?? factura.total ?? 0);

    const tipo = TIPO_LABELS[tipoKey] ?? { nombre: tipoKey, letra: "?", codigo: "000" };
    const PV   = padNum(Number(puntoVenta), 4);
    const NRO  = padNum(Number(numero), 8);

    const W  = 535;
    const x0 = 30;

    // Config fields
    const cfgRazonSocial  = config?.razonSocial       ?? "MARAN S.A.";
    const cfgCuit         = config?.cuit              ?? "33-68110008-9";
    const cfgIibb         = (config as any)?.iibb     ?? cfgCuit; // IIBB defaults to CUIT
    const cfgTelefono     = (config as any)?.telefono ?? "";
    const cfgDomicilio    = config?.domicilioComercial ?? "Alameda de la Federación 698";
    const cfgLocalidad    = config?.localidad         ?? "Paraná";
    const cfgProvincia    = config?.provincia         ?? "Entre Ríos";
    const cfgCp           = config?.cp                ?? "3100";
    const cfgCondIva      = config?.condicionIva      ?? "Responsable Inscripto";
    const cfgInicio       = config?.inicioActividades ?? "01/01/2000";

    const discriminaIVA = ["FA", "NCA", "NDA", "FM", "NCM", "NDM"].includes(tipoKey);

    // ── Helpers ────────────────────────────────────────────────────────────
    function hline(yy: number, lx = x0, lw = W, color = "#ccc") {
      doc.moveTo(lx, yy).lineTo(lx + lw, yy).strokeColor(color).lineWidth(0.5).stroke();
    }

    function box(bx: number, by: number, bw: number, bh: number, stroke = "#aaa", fill?: string) {
      if (fill) doc.rect(bx, by, bw, bh).fillColor(fill).fill();
      doc.rect(bx, by, bw, bh).strokeColor(stroke).lineWidth(0.5).stroke();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 1 — HEADER (emisor + doc type)
    // Layout: izquierda = info empresa  |  centro = letra/codigo/ORIGINAL  |  derecha = tipo+fecha+CUIT
    // ══════════════════════════════════════════════════════════════════════════
    let y = 30;
    const hdrH = 128;
    box(x0, y, W, hdrH);

    const midX  = x0 + Math.floor(W / 2);
    const ctrW  = 72; // width of center column
    const ctrX  = midX - ctrW / 2;

    // Vertical dividers
    doc.moveTo(ctrX, y).lineTo(ctrX, y + hdrH).strokeColor("#aaa").lineWidth(0.5).stroke();
    doc.moveTo(ctrX + ctrW, y).lineTo(ctrX + ctrW, y + hdrH).strokeColor("#aaa").lineWidth(0.5).stroke();

    // ── Centro: Letra grande + código + ORIGINAL ───────────────────────────
    doc.font("Helvetica-Bold").fontSize(46).fillColor("#000")
       .text(tipo.letra, ctrX, y + 10, { width: ctrW, align: "center" });
    doc.font("Helvetica").fontSize(7.5)
       .text(`Cód. ${tipo.codigo}`, ctrX, y + 64, { width: ctrW, align: "center" });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#333")
       .text("ORIGINAL", ctrX, y + 77, { width: ctrW, align: "center" });
    doc.fillColor("#000");

    // ── Izquierda: logo (si existe) + info emisor ──────────────────────────
    const lx = x0 + 7;
    const lw = ctrX - x0 - 10;

    let ly = y + 8;
    if (logoBuffer) {
      // Logo proporcional: max 120px ancho × 52px alto dentro del header
      const logoMaxW = Math.min(lw, 120);
      const logoMaxH = 50;
      // Calcular proporción real (1491×756 → ~1.97:1)
      const aspectRatio = 1491 / 756; // original aspect ratio
      let logoW = logoMaxW;
      let logoH = logoW / aspectRatio;
      if (logoH > logoMaxH) { logoH = logoMaxH; logoW = logoH * aspectRatio; }
      try {
        doc.image(logoBuffer, lx, ly, { width: logoW, height: logoH });
      } catch { /* non-fatal: if image fails, continue without it */ }
      ly += logoH + 4;
    }

    doc.font("Helvetica-Bold").fontSize(logoBuffer ? 9 : 10)
       .text(cfgRazonSocial, lx, ly, { width: lw });
    ly += logoBuffer ? 13 : 15;
    doc.font("Helvetica").fontSize(7.8);
    doc.text(`Dirección: ${cfgDomicilio}`, lx, lyStart, { width: lw }); lyStart += 11;
    doc.text(`Localidad: ${cfgLocalidad} (${cfgCp}), ${cfgProvincia}, Argentina`, lx, lyStart, { width: lw }); lyStart += 11;
    if (cfgTelefono) { doc.text(`Teléfono: ${cfgTelefono}`, lx, lyStart, { width: lw }); lyStart += 11; }

    // ── Derecha: tipo de comprobante + CUIT + IIBB + actividades ───────────
    const rx = ctrX + ctrW + 7;
    const rw = x0 + W - rx - 5;
    doc.font("Helvetica-Bold").fontSize(11)
       .text(tipo.nombre, rx, y + 6, { width: rw });
    doc.font("Helvetica").fontSize(8);
    let ry = y + 22;
    doc.text(`Fecha: ${fDate(fechaEmision)}`, rx, ry, { width: rw }); ry += 11;
    doc.text(`Número: ${PV}-${NRO}`, rx, ry, { width: rw }); ry += 11;
    if (fechaVtoPago) { doc.text(`Vto. de Pago: ${fDate(fechaVtoPago)}`, rx, ry, { width: rw }); ry += 11; }
    if (operador) { doc.text(`Vendedor: ${operador}`, rx, ry, { width: rw }); ry += 11; }
    ry = Math.max(ry, y + 66);
    doc.text(`C.U.I.T.: ${cfgCuit}`, rx, ry, { width: rw }); ry += 11;
    doc.text(`Ingresos Brutos: ${cfgIibb}`, rx, ry, { width: rw }); ry += 11;
    doc.text(`Inicio de actividades: ${cfgInicio}`, rx, ry, { width: rw }); ry += 11;
    doc.font("Helvetica-Bold").fontSize(7.8)
       .text(cfgCondIva.toUpperCase(), rx, ry, { width: rw });
    doc.font("Helvetica");

    y += hdrH + 2;

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 2 — RECEPTOR (cliente)
    // ══════════════════════════════════════════════════════════════════════════
    const rcH = guestData ? 38 : 36;
    box(x0, y, W, rcH);

    const mid2 = x0 + W * 0.55;
    doc.moveTo(mid2, y).lineTo(mid2, y + rcH).strokeColor("#ccc").lineWidth(0.5).stroke();

    doc.font("Helvetica-Bold").fontSize(7.5).text("Datos del Cliente", x0 + 6, y + 4);
    doc.font("Helvetica").fontSize(7.8)
       .text(`Razón Social / Nombre: ${clienteRazonSocial}`, x0 + 6, y + 14, { width: mid2 - x0 - 10 })
       .text(`Domicilio: ${clienteDomicilio}`, x0 + 6, y + 24, { width: mid2 - x0 - 10 });

    let rvx = mid2 + 6;
    let rvy = y + 4;
    if (clienteCuit) {
      doc.text(`C.U.I.T.: ${clienteCuit}`, rvx, rvy, { width: x0 + W - rvx - 5 }); rvy += 11;
    } else if (clienteDni) {
      doc.text(`D.N.I.: ${clienteDni}`, rvx, rvy, { width: x0 + W - rvx - 5 }); rvy += 11;
    }
    doc.text(`I.V.A.: ${clienteCondicionIva}`, rvx, rvy, { width: x0 + W - rvx - 5 });

    y += rcH + 2;

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 2b — HUÉSPED (si hay datos de reserva)
    // ══════════════════════════════════════════════════════════════════════════
    if (guestData) {
      const ghH = 20;
      box(x0, y, W, ghH);

      doc.font("Helvetica-Bold").fontSize(7.5).text("Huésped:", x0 + 6, y + 6);
      doc.font("Helvetica").fontSize(7.8);

      const parts: string[] = [];
      if (guestData.guestName)     parts.push(guestData.guestName);
      if (guestData.guestDni)      parts.push(`D.N.I.: ${guestData.guestDni}`);
      if (guestData.roomNumber)    parts.push(`Habitación: ${guestData.roomNumber}`);
      if (guestData.checkInDate)   parts.push(`Llegada: ${fDate(guestData.checkInDate)}`);
      if (guestData.checkOutDate)  parts.push(`Salida: ${fDate(guestData.checkOutDate)}`);
      if (guestData.numberOfGuests) parts.push(`Pax: ${guestData.numberOfGuests}`);

      doc.text(parts.join("   "), x0 + 50, y + 6, { width: W - 56 });
      y += ghH + 2;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 3 — TABLA DE ITEMS
    // ══════════════════════════════════════════════════════════════════════════
    const tblHdr = 16;

    // ── Column layout ─────────────────────────────────────────────────────
    // discriminaIVA: Código | Descripción | Cant | P.Unit.(neto) | Subtotal(neto) | IVA% | TOTAL(bruto)
    // no discrimina: Código | Descripción | Cant | P.Unit.(bruto) | Total(bruto)
    type Col = { label: string; x: number; w: number; align: "left" | "right" | "center" };
    let cols: Col[];
    if (discriminaIVA) {
      cols = [
        { label: "Código",           x: x0,       w: 44,  align: "left"   },
        { label: "Producto / Servicio", x: x0+44,  w: 196, align: "left"   },
        { label: "Cant.",            x: x0+240,   w: 28,  align: "center" },
        { label: "P.Unitario",       x: x0+268,   w: 68,  align: "right"  },
        { label: "Subtotal",         x: x0+336,   w: 68,  align: "right"  },
        { label: "IVA",              x: x0+404,   w: 38,  align: "right"  },
        { label: "TOTAL",            x: x0+442,   w: 93,  align: "right"  },
      ];
    } else {
      cols = [
        { label: "Código",           x: x0,       w: 44,  align: "left"   },
        { label: "Producto / Servicio", x: x0+44,  w: 264, align: "left"   },
        { label: "Cant.",            x: x0+308,   w: 32,  align: "center" },
        { label: "P.Unitario",       x: x0+340,   w: 90,  align: "right"  },
        { label: "TOTAL",            x: x0+430,   w: 105, align: "right"  },
      ];
    }

    // Header row
    doc.rect(x0, y, W, tblHdr).fillColor("#e8e8e8").fill()
       .rect(x0, y, W, tblHdr).strokeColor("#aaa").lineWidth(0.5).stroke();
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(7);
    for (const col of cols) {
      doc.text(col.label, col.x + 2, y + 4, { width: col.w - 4, align: col.align });
    }
    y += tblHdr;

    // Item rows
    const items: any[] = Array.isArray(factura.items) ? factura.items : [];
    doc.font("Helvetica").fontSize(7.5);

    for (const item of items) {
      if (y > 680) { doc.addPage(); y = 40; }

      const rowH = 14;
      box(x0, y, W, rowH, "#ccc");

      const cod   = deriveCode(item.descripcion ?? "", item.codigo);
      const desc  = item.descripcion ?? "";
      const cant  = item.cantidad ?? 1;
      const neto  = $n(item.subtotalNeto ?? item.subtotal ?? 0);
      const bruto = $n(item.subtotal ?? 0);
      const alicPct = item.alicuotaIva === "21" ? 21 : item.alicuotaIva === "10.5" ? 10.5 : 0;
      const unitNeto = cant > 0 ? neto / cant : 0;

      doc.text(cod,  cols[0].x + 2, y + 3, { width: cols[0].w - 4, align: "left" });
      doc.text(desc, cols[1].x + 2, y + 3, { width: cols[1].w - 4, align: "left" });
      doc.text(String(cant), cols[2].x + 2, y + 3, { width: cols[2].w - 4, align: "center" });

      if (discriminaIVA) {
        doc.text(`$${fPeso(unitNeto)}`, cols[3].x + 2, y + 3, { width: cols[3].w - 4, align: "right" });
        doc.text(`$${fPeso(neto)}`,     cols[4].x + 2, y + 3, { width: cols[4].w - 4, align: "right" });
        const alicLabel = alicPct > 0 ? `${alicPct}%` : (item.alicuotaIva === "exento" ? "Exento" : "—");
        doc.text(alicLabel,             cols[5].x + 2, y + 3, { width: cols[5].w - 4, align: "right" });
        doc.text(`$${fPeso(bruto)}`,    cols[6].x + 2, y + 3, { width: cols[6].w - 4, align: "right" });
      } else {
        const grossUnit = cant > 0 ? bruto / cant : 0;
        doc.text(`$${fPeso(grossUnit)}`, cols[3].x + 2, y + 3, { width: cols[3].w - 4, align: "right" });
        doc.text(`$${fPeso(bruto)}`,     cols[4].x + 2, y + 3, { width: cols[4].w - 4, align: "right" });
      }
      y += rowH;
    }

    y += 6;

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 4 — Excepción IVA (solo FA/FM)
    // ══════════════════════════════════════════════════════════════════════════
    if (discriminaIVA) {
      doc.font("Helvetica-Oblique").fontSize(7).fillColor("#444")
         .text("Excepción Cómputo IVA Crédito Fiscal — Motivo Excepción: Locador / Prestador", x0, y, { width: W })
         .fillColor("#000");
      y += 12;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 5 — FORMAS DE PAGO + OTROS TRIBUTOS + TOTALES
    // Layout: [left: pago + tributos] [right: totales]
    // ══════════════════════════════════════════════════════════════════════════
    const PAGO_LABELS: Record<string, string> = {
      efectivo: "Efectivo", transferencia: "Depósito / Transf.", echeq: "eCheq",
      cheque: "Cheque", tarjeta: "Tarjeta Cto.", debito: "Tarjeta Dbo.",
      mercadopago: "Mercado Pago", compensacion: "Compensación",
      cuenta_corriente: "Cta. Corriente", adelanto: "Adelantos", otro: "Otros",
    };

    // Grid de formas de pago
    const allMethods = [
      { key: "efectivo",      label: "Efectivo" },
      { key: "tarjeta",       label: "T.Crédito" },
      { key: "mercadopago",   label: "Mercado Pago" },
      { key: "adelanto",      label: "Adelantos" },
      { key: "debito",        label: "T.Débito" },
      { key: "transferencia", label: "Depósitos" },
      { key: "cheque",        label: "Cheques" },
    ];

    // Determine amounts
    const pagoAmounts: Record<string, number> = {};
    for (const m of allMethods) pagoAmounts[m.key] = 0;
    if (cashFormaPago) {
      const key = cashFormaPago === "efectivo" ? "efectivo"
        : cashFormaPago === "tarjeta" ? "tarjeta"
        : cashFormaPago === "mercadopago" ? "mercadopago"
        : cashFormaPago === "transferencia" ? "transferencia"
        : cashFormaPago === "cheque" ? "cheque"
        : cashFormaPago === "echeq" ? "cheque"
        : cashFormaPago === "debito" ? "debito"
        : cashFormaPago === "cuenta_corriente" ? "transferencia"
        : "efectivo";
      pagoAmounts[key] = montoTotal;
    }

    const pagoSectionW = Math.floor(W * 0.55);
    const totalsSectionW = W - pagoSectionW;
    const totX = x0 + pagoSectionW;

    // ── Formas de pago: grid 3 columnas × 3 filas ─────────────────────────
    if (y > 610) { doc.addPage(); y = 40; }

    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000")
       .text("Formas de Pago", x0, y);
    y += 10;

    const cols3 = 3;
    const cellW = Math.floor(pagoSectionW / cols3);
    const cellH = 13;

    // Draw 3 rows of payment methods (7 methods → rows of 3,3,1)
    for (let i = 0; i < allMethods.length; i++) {
      const col = i % cols3;
      const row = Math.floor(i / cols3);
      const px = x0 + col * cellW;
      const py = y + row * cellH;
      const m  = allMethods[i];
      doc.font("Helvetica").fontSize(7.2)
         .text(`${m.label}`, px + 2, py + 2, { width: cellW * 0.52 - 2 })
         .text(`$${fPeso(pagoAmounts[m.key])}`, px + cellW * 0.52, py + 2, { width: cellW * 0.46, align: "right" });
    }
    const pagoGridH = Math.ceil(allMethods.length / cols3) * cellH + 2;
    box(x0, y, pagoSectionW, pagoGridH, "#ccc");
    y += pagoGridH;

    // ── Otros Tributos ─────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(7.5).text("Otros Tributos", x0, y + 3);
    y += 12;
    const retGanancias = retenciones?.ganancias ?? 0;
    const retIva       = retenciones?.iva       ?? 0;
    const retIibb      = retenciones?.iibb      ?? 0;
    const otrosTribTotal = retGanancias + retIva + retIibb;
    const trib = [
      ["Per./Ret. Imp. Ganancias", retGanancias > 0 ? fPeso(retGanancias) : "0,00"],
      ["Per./Ret. de IVA",         retIva       > 0 ? fPeso(retIva)       : "0,00"],
      ["Importe Otros Tributos",   otrosTribTotal > 0 ? fPeso(otrosTribTotal) : "0,00"],
    ];
    const tribH = trib.length * 12 + 4;
    box(x0, y, pagoSectionW, tribH, "#ccc");
    for (let i = 0; i < trib.length; i++) {
      doc.font("Helvetica").fontSize(7.2)
         .text(trib[i][0], x0 + 4, y + 3 + i * 12, { width: pagoSectionW * 0.7 })
         .text(trib[i][1], x0 + pagoSectionW * 0.7, y + 3 + i * 12, { width: pagoSectionW * 0.28, align: "right" });
    }

    // ── Totales (columna derecha, alineada con las secciones de pago) ──────
    const totW = totalsSectionW - 4;
    let ty = y - pagoGridH - 12; // align top with formas de pago label

    // Moneda
    doc.font("Helvetica").fontSize(7).fillColor("#555")
       .text("Moneda: ($a) PESO ARGENTINO", totX + 4, ty + 3, { width: totW - 4 })
       .fillColor("#000");
    ty += 13;

    // Totales individuales
    doc.font("Helvetica").fontSize(8);
    const totRows: [string, number][] = [];
    if (montoNeto !== 0)      totRows.push(["Importe Neto Gravado", montoNeto]);
    if (montoExento !== 0)    totRows.push(["Importe Exento",       montoExento]);
    if (montoNoGravado !== 0) totRows.push(["Importe No Gravado",   montoNoGravado]);
    if (montoIva21 !== 0)     totRows.push(["IVA 21%",              montoIva21]);
    if (montoIva105 !== 0)    totRows.push(["IVA 10.5%",            montoIva105]);

    for (const [label, val] of totRows) {
      doc.text(label, totX + 4, ty, { width: totW * 0.55 });
      doc.text(`$${fPeso(val)}`, totX + totW * 0.55, ty, { width: totW * 0.43, align: "right" });
      ty += 13;
      hline(ty - 2, totX, totW, "#eee");
    }

    // Importe Total (highlighted)
    doc.rect(totX, ty - 2, totW, 18).fillColor("#e8e8e8").fill()
       .rect(totX, ty - 2, totW, 18).strokeColor("#aaa").lineWidth(0.5).stroke();
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(9.5)
       .text("IMPORTE TOTAL", totX + 4, ty + 2, { width: totW * 0.55 })
       .text(`$${fPeso(montoTotal)}`, totX + totW * 0.55, ty + 2, { width: totW * 0.43, align: "right" });
    ty += 20;

    // bottom of pago/tributos section
    y += tribH;

    // Align y with the lower of totals or tributos
    y = Math.max(y, ty) + 6;

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 6 — MONTO EN PALABRAS
    // ══════════════════════════════════════════════════════════════════════════
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#222")
       .text(montoEnPalabras(montoTotal), x0, y, { width: W })
       .fillColor("#000");
    y += 14;

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 7 — Nota de Crédito / Anulación (si aplica)
    // ══════════════════════════════════════════════════════════════════════════
    if (notaCredito) {
      const ncTipo  = TIPO_LABELS[notaCredito.tipoComprobante] ?? { nombre: "NOTA DE CRÉDITO", letra: "?", codigo: "000" };
      const ncPV    = padNum(Number(notaCredito.puntoVenta), 4);
      const ncNRO   = padNum(Number(notaCredito.numero), 8);
      const ncLabel = `${ncTipo.nombre} ${ncTipo.letra} N° ${ncPV}-${ncNRO} (${fDate(notaCredito.fechaEmision)})`;
      const saldoNeto = montoTotal - $n(notaCredito.montoTotal);

      y += 4;
      const txL2 = x0 + W - 200; const tw2 = 196;
      doc.rect(txL2 - 4, y - 2, tw2 + 8, 16).fillColor("#fff3e0").fill()
         .rect(txL2 - 4, y - 2, tw2 + 8, 16).strokeColor("#e65100").lineWidth(0.5).stroke();
      doc.fillColor("#bf360c").font("Helvetica-Bold").fontSize(7.5)
         .text("ANULACIÓN NC:", txL2, y + 1, { width: tw2 * 0.55 });
      doc.font("Helvetica").fontSize(7)
         .text(`− $${fPeso(notaCredito.montoTotal)}`, txL2 + tw2 * 0.55, y + 1, { width: tw2 * 0.43, align: "right" });
      y += 16;
      doc.font("Helvetica-Oblique").fontSize(6.5)
         .text(ncLabel, txL2, y, { width: tw2 });
      y += 12;

      const netColor = saldoNeto <= 0.01 ? "#2e7d32" : "#c62828";
      doc.rect(txL2 - 4, y - 2, tw2 + 8, 18).fillColor(saldoNeto <= 0.01 ? "#e8f5e9" : "#ffebee").fill()
         .rect(txL2 - 4, y - 2, tw2 + 8, 18).strokeColor(netColor).lineWidth(0.5).stroke();
      doc.fillColor(netColor).font("Helvetica-Bold").fontSize(9)
         .text("SALDO NETO", txL2, y + 2, { width: tw2 * 0.55 })
         .text(`$${fPeso(Math.max(saldoNeto, 0))}`, txL2 + tw2 * 0.55, y + 2, { width: tw2 * 0.43, align: "right" });
      doc.fillColor("#000").lineWidth(0.5);
      y += 22;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 8 — Comprobante ficticio warning
    // ══════════════════════════════════════════════════════════════════════════
    if (modoFicticio) {
      y += 4;
      doc.font("Helvetica").fontSize(7).fillColor("#cc0000")
         .text("⚠ COMPROBANTE FICTICIO — NO VÁLIDO FISCALMENTE — SOLO USO INTERNO / PRUEBAS", x0, y, { align: "center", width: W })
         .fillColor("#000");
      y += 12;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECCIÓN 9 — CONDICIÓN DE VENTA + OBSERVACIONES ARCA + CAE
    // ══════════════════════════════════════════════════════════════════════════
    if (y > 680) { doc.addPage(); y = 40; }
    y = Math.max(y, 660);

    // Condición de venta
    const COND_LABELS: Record<string, string> = {
      efectivo: "Contado/Efectivo", transferencia: "Transferencia Bancaria",
      tarjeta: "Tarjeta de Crédito", debito: "Tarjeta de Débito",
      cheque: "Cheque", echeq: "eCheq", cuenta_corriente: "Cuenta Corriente",
      mercadopago: "Mercado Pago", adelanto: "Adelanto",
    };
    const condVenta = cashFormaPago ? (COND_LABELS[cashFormaPago] ?? cashFormaPago) : "Contado";

    // CAE box (two-column: left = ARCA info, right = Condición de Venta)
    const caeH = 44;
    box(x0, y, W, caeH);
    doc.moveTo(x0 + W * 0.6, y).lineTo(x0 + W * 0.6, y + caeH).strokeColor("#ccc").lineWidth(0.5).stroke();

    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#333")
       .text("Observaciones ARCA: Comprobante Autorizado", x0 + 6, y + 5, { width: W * 0.58 })
       .fillColor("#000").font("Helvetica").fontSize(8)
       .text(`CAE Nº: ${cae ?? "—"}`, x0 + 6, y + 18, { width: W * 0.58 })
       .text(`Fecha Venc. CAE: ${fDate(caeFechaVto)}`, x0 + 6, y + 30, { width: W * 0.58 });

    doc.font("Helvetica-Bold").fontSize(7.5)
       .text("Condición de Venta:", x0 + W * 0.62, y + 8, { width: W * 0.36 })
       .font("Helvetica").fontSize(8)
       .text(condVenta, x0 + W * 0.62, y + 20, { width: W * 0.36 });

    y += caeH + 2;

    // Observaciones (free text, empty by default)
    box(x0, y, W, 22);
    doc.font("Helvetica-Bold").fontSize(7.5).text("Observaciones:", x0 + 6, y + 7);
    y += 22;

    // Footer timestamp
    const _ts = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fontSize(6).font("Helvetica").fillColor("#aaaaaa")
       .text(`Generado el ${_ts} | ${cfgRazonSocial}`, x0, y + 4, { align: "center", width: W })
       .fillColor("#000");

    doc.end();
  });
}

// ── Voucher y Resumen (sin cambios) ─────────────────────────────────────────

export interface VoucherHabitacionData {
  numero: number;
  puntoVenta: number;
  fechaEmision: string;
  reservationCode: string | null;
  guestName: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  roomRate: number;
  roomTotal: number;
  charges: Array<{ description: string; date: string; amount: string; category?: string }>;
  payments: Array<{ date: string; method: string; amount: string; reference?: string | null; notes?: string | null }>;
  adjustments?: Array<{ description: string; date: string; amount: string }>;
  grandTotal: number;
  totalPayments: number;
  balance: number;
}

export async function generarVoucherHabitacionPDF(data: VoucherHabitacionData, config: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W  = 535;
    const x0 = 30;

    const NAVY = "#1e3a5f";
    const GOLD = "#c9a227";
    const LIGHT_BLUE = "#e8f0fe";

    function hline(y: number) {
      doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").lineWidth(0.5).stroke();
    }

    // ── Header ─────────────────────────────────────────────────────────────
    const margin = 30;
    let y = margin;

    doc.rect(x0, y, W, 80).fillColor(NAVY).fill();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(22)
       .text(config?.razonSocial ?? "MARAN S.A.", x0 + 16, y + 14, { width: W / 2 - 16 });
    doc.font("Helvetica").fontSize(8).fillColor("#ccc")
       .text(config?.domicilioComercial ?? "", x0 + 16, y + 42)
       .text(`${config?.localidad ?? ""}, ${config?.provincia ?? ""}`, x0 + 16, y + 53);

    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(18)
       .text("COMPROBANTE DE ESTADÍA", x0 + W / 2, y + 16, { width: W / 2 - 8, align: "right" });
    doc.fillColor("white").font("Helvetica").fontSize(9)
       .text(`N° ${String(data.puntoVenta).padStart(4, "0")}-${String(data.numero).padStart(8, "0")}`, x0 + W / 2, y + 44, { width: W / 2 - 8, align: "right" })
       .text(`Emitido: ${fDate(data.fechaEmision)}`, x0 + W / 2, y + 57, { width: W / 2 - 8, align: "right" });

    y += 90;

    // ── Guest info card ────────────────────────────────────────────────────
    doc.rect(x0, y, W, 70).fillColor(LIGHT_BLUE).fill()
       .rect(x0, y, W, 70).strokeColor("#90b4d4").lineWidth(0.5).stroke();
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10)
       .text(data.guestName || "Huésped", x0 + 16, y + 10, { width: W / 2 - 16 });
    if (data.reservationCode) {
      doc.fillColor("#555").font("Helvetica").fontSize(8)
         .text(`Código: ${data.reservationCode}`, x0 + 16, y + 24);
    }

    const infoItems = [
      { label: "Habitación", value: data.roomNumber || "—" },
      { label: "Check-in",   value: fDate(data.checkInDate) },
      { label: "Check-out",  value: fDate(data.checkOutDate) },
      { label: "Noches",     value: String(data.nights) },
    ];
    const colW4 = W / 4;
    for (let i = 0; i < infoItems.length; i++) {
      const ix = x0 + i * colW4;
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8)
         .text(infoItems[i].label, ix + 8, y + 38, { width: colW4 - 8 });
      doc.fillColor("#000").font("Helvetica").fontSize(9)
         .text(infoItems[i].value, ix + 8, y + 50, { width: colW4 - 8 });
    }
    y += 80;

    // ── Room rate row ──────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY)
       .text("Tarifa habitación:", x0, y + 4, { width: W * 0.6 });
    doc.font("Helvetica").fontSize(9).fillColor("#000")
       .text(`$${fPeso(data.roomRate)}/noche × ${data.nights} = $${fPeso(data.roomTotal)}`, x0 + W * 0.6, y + 4, { width: W * 0.4, align: "right" });
    y += 20; hline(y); y += 4;

    // ── Charges table ──────────────────────────────────────────────────────
    if (data.charges.length > 0) {
      doc.rect(x0, y, W, 18).fillColor("#f0f0f0").fill()
         .rect(x0, y, W, 18).strokeColor("#ccc").lineWidth(0.5).stroke();
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(7.5)
         .text("FECHA",  x0 + 4,       y + 5, { width: 60 })
         .text("DETALLE", x0 + 68,     y + 5, { width: 320 })
         .text("IMPORTE", x0 + W - 80, y + 5, { width: 76, align: "right" });
      y += 18;

      for (const charge of data.charges) {
        if (y > 720) { doc.addPage(); y = 40; }
        doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
        doc.fillColor("#000").font("Helvetica").fontSize(7.5)
           .text(fDate(charge.date), x0 + 4, y + 3, { width: 60 })
           .text(charge.description, x0 + 68, y + 3, { width: 320 })
           .text(`$${fPeso(charge.amount)}`, x0 + W - 80, y + 3, { width: 76, align: "right" });
        y += 14;
      }
      hline(y); y += 6;
    }

    // ── Adjustments (void) ─────────────────────────────────────────────────
    if (data.adjustments && data.adjustments.length > 0) {
      doc.fillColor("#c62828").font("Helvetica-Bold").fontSize(8).text("Ajustes / Anulaciones:", x0, y);
      y += 14;
      for (const adj of data.adjustments) {
        doc.fillColor("#c62828").font("Helvetica").fontSize(7.5)
           .text(fDate(adj.date), x0 + 4, y, { width: 60 })
           .text(adj.description, x0 + 68, y, { width: 300 })
           .text(`-$${fPeso(adj.amount)}`, x0 + W - 80, y, { width: 76, align: "right" });
        y += 12;
      }
      hline(y); y += 6;
    }

    // ── Total grande ───────────────────────────────────────────────────────
    doc.rect(x0, y, W, 26).fillColor(NAVY).fill();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(12)
       .text("TOTAL", x0 + 16, y + 7, { width: W / 2 })
       .text(`$${fPeso(data.grandTotal)}`, x0 + W / 2, y + 7, { width: W / 2 - 16, align: "right" });
    y += 30;

    // ── Payments ───────────────────────────────────────────────────────────
    const PAGO_LABELS2: Record<string, string> = {
      efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta de crédito",
      debito: "Tarjeta de débito", cheque: "Cheque", echeq: "eCheq",
      mercadopago: "Mercado Pago", compensacion: "Compensación",
      cuenta_corriente: "Cuenta Corriente", adelanto: "Adelanto",
    };

    if (data.payments.length > 0) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text("Pagos registrados:", x0, y + 4);
      y += 18;
      for (const pago of data.payments) {
        doc.fillColor("#000").font("Helvetica").fontSize(8)
           .text(fDate(pago.date), x0 + 4, y, { width: 60 })
           .text(PAGO_LABELS2[pago.method] ?? pago.method, x0 + 68, y, { width: 200 })
           .text(pago.reference ? `Ref: ${pago.reference}` : "", x0 + 280, y, { width: 150 })
           .text(`$${fPeso(pago.amount)}`, x0 + W - 80, y, { width: 76, align: "right" });
        y += 14;
      }
      hline(y); y += 6;
    }

    // ── Balance ────────────────────────────────────────────────────────────
    const balColor = data.balance > 0.5 ? "#c62828" : "#2e7d32";
    doc.rect(x0, y, W, 24).fillColor(data.balance > 0.5 ? "#ffebee" : "#e8f5e9").fill()
       .rect(x0, y, W, 24).strokeColor(balColor).lineWidth(0.5).stroke();
    doc.fillColor(balColor).font("Helvetica-Bold").fontSize(11)
       .text(data.balance > 0.5 ? "SALDO PENDIENTE" : "✓ SALDADO", x0 + 12, y + 6, { width: W / 2 });
    if (Math.abs(data.balance) > 0.5) {
      doc.text(`$${fPeso(Math.abs(data.balance))}`, x0 + W / 2, y + 6, { width: W / 2 - 12, align: "right" });
    }
    y += 28;

    // ── Footer ─────────────────────────────────────────────────────────────
    const _ts = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.font("Helvetica").fontSize(6).fillColor("#aaaaaa")
       .text(`Generado el ${_ts} | ${config?.razonSocial ?? "Maran Suites & Towers"}`, x0, y + 8, { align: "center", width: W });

    doc.end();
  });
}

// ── Resumen de cuenta (sin cambios estructurales) ────────────────────────────
export async function generarResumenCuentaPDF(data: any, config: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W  = 535;
    const x0 = 30;
    const NAVY = "#1e3a5f";

    let y = 30;

    // Header
    doc.rect(x0, y, W, 64).fillColor(NAVY).fill();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(18)
       .text(config?.razonSocial ?? "MARAN S.A.", x0 + 12, y + 10, { width: W / 2 });
    doc.font("Helvetica").fontSize(8).fillColor("#ccc")
       .text(config?.domicilioComercial ?? "", x0 + 12, y + 34)
       .text(`${config?.localidad ?? ""}, ${config?.provincia ?? ""}`, x0 + 12, y + 44);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(14)
       .text("RESUMEN DE CUENTA", x0 + W / 2, y + 14, { width: W / 2 - 8, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#ccc")
       .text(new Date().toLocaleDateString("es-AR"), x0 + W / 2, y + 38, { width: W / 2 - 8, align: "right" });
    y += 74;

    // Entity info
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY)
       .text(data.entityName ?? "—", x0, y);
    if (data.entityCuit) {
      doc.font("Helvetica").fontSize(8).fillColor("#333")
         .text(`CUIT: ${data.entityCuit}`, x0, y + 14);
    }
    y += 30;
    doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").lineWidth(0.5).stroke();
    y += 10;

    // Movements table
    if (data.movements && data.movements.length > 0) {
      doc.rect(x0, y, W, 16).fillColor("#e8e8e8").fill()
         .rect(x0, y, W, 16).strokeColor("#ccc").stroke();
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(7.5)
         .text("FECHA",     x0 + 4,       y + 4, { width: 55 })
         .text("TIPO",      x0 + 63,      y + 4, { width: 60 })
         .text("CONCEPTO",  x0 + 127,     y + 4, { width: 230 })
         .text("IMPORTE",   x0 + W - 75,  y + 4, { width: 71, align: "right" });
      y += 16;

      for (const mv of data.movements) {
        if (y > 750) { doc.addPage(); y = 40; }
        doc.rect(x0, y, W, 13).strokeColor("#eee").stroke();
        const isDebit = (mv.type === "charge" || mv.type === "invoice");
        doc.fillColor(isDebit ? "#000" : "#1565c0").font("Helvetica").fontSize(7.5)
           .text(fDate(mv.date),        x0 + 4,      y + 2, { width: 55 })
           .text(mv.type ?? "",         x0 + 63,     y + 2, { width: 60 })
           .text(mv.description ?? "",  x0 + 127,    y + 2, { width: 230 })
           .text(`${isDebit ? "" : "-"}$${fPeso(mv.amount)}`, x0 + W - 75, y + 2, { width: 71, align: "right" });
        y += 13;
      }
      doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").lineWidth(0.5).stroke();
      y += 8;
    }

    // Balance
    const saldo = $n(data.balance ?? 0);
    const balColor = saldo > 0.5 ? "#c62828" : saldo < -0.5 ? "#1565c0" : "#2e7d32";
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text("Saldo:", x0 + W - 180, y);
    doc.fillColor(balColor).font("Helvetica-Bold").fontSize(12)
       .text(`$${fPeso(saldo)}`, x0 + W - 120, y, { width: 116, align: "right" });
    y += 20;

    const _ts = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.font("Helvetica").fontSize(6).fillColor("#aaaaaa")
       .text(`Generado el ${_ts}`, x0, y + 8, { align: "center", width: W });

    doc.end();
  });
}
