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

const TIPO_LABELS: Record<string, { nombre: string; letra: string; codigo: string }> = {
  FA:  { nombre: "FACTURA",          letra: "A", codigo: "001" },
  FB:  { nombre: "FACTURA",          letra: "B", codigo: "006" },
  FC:  { nombre: "FACTURA",          letra: "C", codigo: "011" },
  FT:  { nombre: "FACTURA",          letra: "T", codigo: "195" },
  FM:  { nombre: "FACTURA MiPyME",   letra: "A", codigo: "201" },
  NCA: { nombre: "NOTA DE CRÉDITO",  letra: "A", codigo: "003" },
  NCB: { nombre: "NOTA DE CRÉDITO",  letra: "B", codigo: "008" },
  NCC: { nombre: "NOTA DE CRÉDITO",  letra: "C", codigo: "013" },
  NCT: { nombre: "NOTA DE CRÉDITO",  letra: "T", codigo: "197" },
  NCM: { nombre: "NOTA DE CRÉDITO MiPyME", letra: "A", codigo: "203" },
  NDA: { nombre: "NOTA DE DÉBITO",   letra: "A", codigo: "002" },
  NDB: { nombre: "NOTA DE DÉBITO",   letra: "B", codigo: "007" },
  NDC: { nombre: "NOTA DE DÉBITO",   letra: "C", codigo: "012" },
  NDT: { nombre: "NOTA DE DÉBITO",   letra: "T", codigo: "196" },
  NDM: { nombre: "NOTA DE DÉBITO MiPyME", letra: "A", codigo: "202" },
};

export async function generarFacturaPDF(factura: any, config: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Support both snake_case (DB rows) and camelCase (in-memory objects)
    const tipoKey   = factura.tipo_comprobante  ?? factura.tipoComprobante  ?? "";
    const puntoVenta = factura.punto_venta       ?? factura.puntoVenta       ?? 1;
    const numero    = factura.numero             ?? 0;
    const fechaEmision = factura.fecha_emision   ?? factura.fechaEmision;
    const fechaVtoPago = factura.fecha_vto_pago  ?? factura.fechaVtoPago;
    const caeFechaVto  = factura.cae_fecha_vto   ?? factura.caeFechaVto;
    const cae          = factura.cae             ?? null;
    const modoFicticio = factura.modo_ficticio   ?? factura.modoFicticio    ?? false;

    const clienteRazonSocial  = factura.cliente_razon_social  ?? factura.clienteRazonSocial  ?? "—";
    const clienteDomicilio    = factura.cliente_domicilio     ?? factura.clienteDomicilio     ?? "—";
    const clienteCuit         = factura.cliente_cuit          ?? factura.clienteCuit          ?? null;
    const clienteDni          = factura.cliente_dni           ?? factura.clienteDni           ?? null;
    const clienteCondicionIva = factura.cliente_condicion_iva ?? factura.clienteCondicionIva  ?? "—";

    const montoNeto      = factura.monto_neto       ?? factura.montoNeto       ?? 0;
    const montoExento    = factura.monto_exento      ?? factura.montoExento     ?? 0;
    const montoNoGravado = factura.monto_no_gravado  ?? factura.montoNoGravado  ?? 0;
    const montoIva21     = factura.monto_iva21       ?? factura.montoIva21      ?? 0;
    const montoIva105    = factura.monto_iva105      ?? factura.montoIva105     ?? 0;
    const montoTotal     = factura.monto_total       ?? factura.montoTotal      ?? factura.total ?? 0;

    const tipo = TIPO_LABELS[tipoKey] ?? { nombre: tipoKey, letra: "?", codigo: "000" };
    const PV = padNum(Number(puntoVenta), 4);
    const NRO = padNum(Number(numero), 8);
    const W = 535;
    const x0 = 30;

    // ── Header ─────────────────────────────────────────────────
    let y = 30;
    doc.rect(x0, y, W, 110).strokeColor("#ccc").lineWidth(0.5).stroke();

    const centerX = x0 + W / 2;
    doc.moveTo(centerX, y).lineTo(centerX, y + 110).stroke();

    // Large letter in center
    doc.font("Helvetica-Bold").fontSize(50).fillColor("#000")
      .text(tipo.letra, centerX - 18, y + 28, { width: 36, align: "center" });
    doc.font("Helvetica").fontSize(8)
      .text(`Código ${tipo.codigo}`, centerX - 25, y + 85, { width: 50, align: "center" });

    // Left block — emisor
    const lx = x0 + 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000")
      .text(config?.razonSocial ?? "MARAN S.A.", lx, y + 10, { width: centerX - x0 - 16 });
    doc.font("Helvetica").fontSize(8)
      .text(`CUIT: ${config?.cuit ?? "33-68110008-9"}`, lx, y + 26)
      .text(config?.condicionIva ?? "Responsable Inscripto", lx, y + 37)
      .text(config?.domicilioComercial ?? "Alameda de la Federación 698", lx, y + 48)
      .text(`${config?.localidad ?? "Paraná"}, ${config?.provincia ?? "Entre Ríos"} (${config?.cp ?? "3100"})`, lx, y + 59)
      .text(`Inicio Actividades: ${config?.inicioActividades ?? "01/01/2000"}`, lx, y + 70);

    // Right block — tipo + número
    const rx = centerX + 8;
    doc.font("Helvetica-Bold").fontSize(13)
      .text(tipo.nombre, rx, y + 10, { width: W / 2 - 16 });
    doc.font("Helvetica").fontSize(9)
      .text(`N° ${PV}-${NRO}`, rx, y + 27)
      .text(`Fecha de Emisión: ${fDate(fechaEmision)}`, rx, y + 40);
    if (fechaVtoPago) {
      doc.text(`Vto. de Pago: ${fDate(fechaVtoPago)}`, rx, y + 53);
    }

    y += 118;

    // ── Receptor ────────────────────────────────────────────────
    doc.rect(x0, y, W, 48).strokeColor("#ccc").stroke();
    doc.font("Helvetica-Bold").fontSize(8).text("Datos del Cliente:", x0 + 6, y + 5);
    doc.font("Helvetica").fontSize(8)
      .text(`Razón Social / Nombre: ${clienteRazonSocial}`, x0 + 6, y + 16)
      .text(`Domicilio: ${clienteDomicilio}`, x0 + 6, y + 27);

    const midRight = x0 + W / 2;
    doc.font("Helvetica").fontSize(8);
    if (clienteCuit) {
      doc.text(`CUIT: ${clienteCuit}`, midRight, y + 16);
    } else if (clienteDni) {
      doc.text(`DNI: ${clienteDni}`, midRight, y + 16);
    }
    doc.text(`Condición IVA: ${clienteCondicionIva}`, midRight, y + 27);

    y += 56;

    // ── Items table ─────────────────────────────────────────────
    // Factura A y MiPyme A discriminan IVA; B, T, C no discriminan
    const discriminaIVA = ["FA", "NCA", "NDA", "FM", "NCM", "NDM"].includes(tipoKey);

    doc.rect(x0, y, W, 16).fillColor("#f0f0f0").fill().rect(x0, y, W, 16).strokeColor("#ccc").stroke();
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(7.5);

    if (discriminaIVA) {
      doc.text("Descripción",  x0 + 4,   y + 4, { width: 240 });
      doc.text("Cant.",        x0 + 248,  y + 4, { width: 30,  align: "right" });
      doc.text("P. Unit.",     x0 + 282,  y + 4, { width: 60,  align: "right" });
      doc.text("Alíc. IVA",   x0 + 348,  y + 4, { width: 55,  align: "right" });
      doc.text("Subtotal",     x0 + 407,  y + 4, { width: 70,  align: "right" });
      doc.text("IVA",          x0 + 480,  y + 4, { width: 48,  align: "right" });
    } else {
      doc.text("Descripción",  x0 + 4,   y + 4, { width: 320 });
      doc.text("Cant.",        x0 + 328,  y + 4, { width: 35,  align: "right" });
      doc.text("P. Unit.",     x0 + 367,  y + 4, { width: 80,  align: "right" });
      doc.text("Subtotal",     x0 + 451,  y + 4, { width: 80,  align: "right" });
    }
    y += 16;

    const items: any[] = Array.isArray(factura.items) ? factura.items : [];
    doc.font("Helvetica").fontSize(7.5);

    for (const item of items) {
      if (y > 700) { doc.addPage(); y = 40; }
      doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
      doc.text(item.descripcion ?? "", x0 + 4, y + 3, { width: discriminaIVA ? 240 : 320 });

      if (discriminaIVA) {
        const alicLabel = item.alicuotaIva === "21" ? "21%" : item.alicuotaIva === "10.5" ? "10.5%" : item.alicuotaIva === "exento" ? "Exento" : "No Grav.";
        const iva = item.alicuotaIva === "21" ? item.subtotalNeto * 0.21 : item.alicuotaIva === "10.5" ? item.subtotalNeto * 0.105 : 0;
        doc.text(String(item.cantidad ?? 1), x0 + 248, y + 3, { width: 30,  align: "right" });
        doc.text(`$ ${fPeso(item.precioUnitario ?? 0)}`, x0 + 282, y + 3, { width: 60,  align: "right" });
        doc.text(alicLabel,                              x0 + 348, y + 3, { width: 55,  align: "right" });
        doc.text(`$ ${fPeso(item.subtotalNeto ?? item.subtotal ?? 0)}`, x0 + 407, y + 3, { width: 70, align: "right" });
        doc.text(iva !== 0 ? `$ ${fPeso(iva)}` : "—",  x0 + 480, y + 3, { width: 48,  align: "right" });
      } else {
        // Precio con IVA incluido (no discrimina)
        const qty = item.cantidad || 1;
        const grossSubtotal = $n(item.subtotal);
        const grossUnit = grossSubtotal / qty;
        doc.text(String(qty),                       x0 + 328, y + 3, { width: 35,  align: "right" });
        doc.text(`$ ${fPeso(grossUnit)}`,            x0 + 367, y + 3, { width: 80,  align: "right" });
        doc.text(`$ ${fPeso(grossSubtotal)}`,        x0 + 451, y + 3, { width: 80,  align: "right" });
      }
      y += 14;
    }

    y += 4;

    // ── Totals ──────────────────────────────────────────────────
    const txL = x0 + W - 200;
    const tw = 190;
    doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").lineWidth(0.5).stroke();
    y += 4;

    doc.font("Helvetica").fontSize(8);

    if (discriminaIVA) {
      const totals: [string, number][] = [];
      if ($n(montoNeto) !== 0)      totals.push(["Importe Neto Gravado", $n(montoNeto)]);
      if ($n(montoExento) !== 0)    totals.push(["Importe Exento",       $n(montoExento)]);
      if ($n(montoNoGravado) !== 0) totals.push(["Importe No Gravado",   $n(montoNoGravado)]);
      if ($n(montoIva21) !== 0)     totals.push(["IVA 21%",              $n(montoIva21)]);
      if ($n(montoIva105) !== 0)    totals.push(["IVA 10.5%",            $n(montoIva105)]);
      for (const [label, val] of totals) {
        doc.text(label, txL, y, { width: tw - 70 });
        doc.text(`$ ${fPeso(val)}`, txL + tw - 70, y, { width: 65, align: "right" });
        y += 12;
      }
    }

    // TOTAL (todas las facturas muestran importe total)
    doc.rect(txL - 4, y - 2, tw + 8, 18).fillColor("#f0f0f0").fill().strokeColor("#ccc").stroke();
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(10)
      .text("IMPORTE TOTAL", txL, y + 2, { width: tw - 70 })
      .text(`$ ${fPeso(montoTotal)}`, txL + tw - 70, y + 2, { width: 65, align: "right" });
    y += 22;

    if (modoFicticio) {
      y += 4;
      doc.font("Helvetica").fontSize(7).fillColor("#cc0000")
        .text("⚠ COMPROBANTE FICTICIO — NO VÁLIDO FISCALMENTE — SOLO USO INTERNO / PRUEBAS", x0, y, { align: "center", width: W })
        .fillColor("#000");
      y += 12;
    }

    // ── CAE section ─────────────────────────────────────────────
    if (y > 700) { doc.addPage(); y = 40; }
    y = Math.max(y, 680);

    doc.rect(x0, y, W, 40).strokeColor("#ccc").stroke();
    doc.font("Helvetica").fontSize(8)
      .text(`CAE N°: ${cae ?? "—"}`, x0 + 8, y + 6)
      .text(`Fecha de Vto. CAE: ${fDate(caeFechaVto)}`, x0 + 8, y + 20);

    doc.font("Helvetica-Bold").fontSize(7)
      .text("Comprobante Autorizado — ARCA/AFIP", x0 + W - 200, y + 6, { width: 192, align: "right" })
      .font("Helvetica").fontSize(6).fillColor("#666")
      .text(cae ? `||${cae}||` : "", x0 + W - 200, y + 20, { width: 192, align: "right" })
      .fillColor("#000");
    const _ts1 = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fontSize(6).font("Helvetica").fillColor("#aaaaaa")
      .text(`Generado el ${_ts1} | Maran Suites & Towers`, x0, y + 48, { align: "center", width: W });

    doc.end();
  });
}

export interface VoucherHabitacionData {
  numero: number;
  puntoVenta: number;
  fechaEmision: string;
  reservationCode: string;
  guestName: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  roomRate: number;
  roomTotal: number;
  charges: Array<{ description: string; date: string; amount: string; category?: string }>;
  payments: Array<{ date: string; method: string; amount: string; reference?: string | null; notes?: string | null }>;
  /** Void adjustments written when a Nota de Crédito voids a payment */
  adjustments?: Array<{ description: string; date: string; amount: string }>;
  grandTotal: number;
  totalPayments: number;
  balance: number;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo ARS",
  tarjeta_debito: "Tarjeta Débito",
  tarjeta_credito: "Tarjeta Crédito",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cuenta Corriente",
};

export async function generarVoucherHabitacionPDF(data: VoucherHabitacionData, config: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 535;
    const x0 = 30;
    let y = 30;

    // ── Header ─────────────────────────────────────────────────
    doc.rect(x0, y, W, 80).strokeColor("#ccc").lineWidth(0.5).stroke();
    const centerX = x0 + W / 2;
    doc.moveTo(centerX, y).lineTo(centerX, y + 80).stroke();

    // Left — emisor
    const lx = x0 + 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000")
      .text(config?.razonSocial ?? "MARAN S.A.", lx, y + 10, { width: centerX - x0 - 16 });
    doc.font("Helvetica").fontSize(8)
      .text(`CUIT: ${config?.cuit ?? ""}`, lx, y + 26)
      .text(config?.domicilioComercial ?? "", lx, y + 37)
      .text(`${config?.localidad ?? "Paraná"}, ${config?.provincia ?? "Entre Ríos"}`, lx, y + 48);

    // Right — voucher type + number
    const rx = centerX + 8;
    doc.font("Helvetica-Bold").fontSize(11)
      .text("VOUCHER DE ALOJAMIENTO", rx, y + 10, { width: W / 2 - 16 });
    doc.font("Helvetica").fontSize(9)
      .text(`N° ${String(data.puntoVenta).padStart(4, "0")}-${String(data.numero).padStart(8, "0")}`, rx, y + 26)
      .text(`Fecha: ${fDate(data.fechaEmision)}`, rx, y + 39)
      .text("Comprobante interno — Sin valor fiscal", rx, y + 52);
    y += 88;

    // ── Datos de la reserva ────────────────────────────────────
    doc.rect(x0, y, W, 52).strokeColor("#ccc").stroke();
    doc.font("Helvetica-Bold").fontSize(8).text("Datos de la reserva:", x0 + 6, y + 5);
    doc.font("Helvetica").fontSize(8)
      .text(`Huésped: ${data.guestName}`, x0 + 6, y + 17)
      .text(`Habitación: ${data.roomNumber}`, x0 + 6, y + 29)
      .text(`Reserva N°: ${data.reservationCode}`, x0 + 6, y + 41);

    const mid = x0 + W / 2;
    doc.font("Helvetica").fontSize(8)
      .text(`Check-in: ${fDate(data.checkInDate)}`, mid, y + 17)
      .text(`Check-out: ${fDate(data.checkOutDate)}`, mid, y + 29)
      .text(`Noches: ${data.nights}`, mid, y + 41);
    y += 60;

    // ── Cargos ─────────────────────────────────────────────────
    doc.rect(x0, y, W, 16).fillColor("#f0f0f0").fill().rect(x0, y, W, 16).strokeColor("#ccc").stroke();
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(7.5);
    doc.text("Concepto", x0 + 4, y + 4, { width: 300 });
    doc.text("Fecha", x0 + 308, y + 4, { width: 90, align: "center" });
    doc.text("Importe", x0 + 402, y + 4, { width: 125, align: "right" });
    y += 16;

    doc.font("Helvetica").fontSize(7.5);

    // Alojamiento (expandido por noche si hay más de 1)
    if (data.nights > 1 && data.roomRate > 0) {
      const checkIn = new Date(data.checkInDate + "T12:00:00");
      for (let i = 0; i < data.nights; i++) {
        if (y > 720) { doc.addPage(); y = 40; }
        const nightDate = new Date(checkIn);
        nightDate.setDate(nightDate.getDate() + i);
        const label = `Alojamiento noche ${i + 1} — ${fDate(nightDate.toISOString().split("T")[0])}`;
        doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
        doc.text(label, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(nightDate.toISOString().split("T")[0]), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(data.roomRate)}`, x0 + 402, y + 3, { width: 125, align: "right" });
        y += 14;
      }
    } else {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
      doc.text(`Alojamiento (${data.nights} noche${data.nights !== 1 ? "s" : ""})`, x0 + 4, y + 3, { width: 300 });
      doc.text(`${fDate(data.checkInDate)} — ${fDate(data.checkOutDate)}`, x0 + 308, y + 3, { width: 90, align: "center" });
      doc.text(`$ ${fPeso(data.roomTotal)}`, x0 + 402, y + 3, { width: 125, align: "right" });
      y += 14;
    }

    // Cargos adicionales
    for (const charge of data.charges) {
      if (y > 720) { doc.addPage(); y = 40; }
      const isTransferOut = charge.category === "transfer_out";
      const isTransferIn  = charge.category === "transfer_in";
      const isTransfer    = isTransferOut || isTransferIn;
      const isND          = charge.category === "nota_debito";

      if (isND) {
        doc.rect(x0, y, W, 14).fillColor("#fef3e2").fill()
          .rect(x0, y, W, 14).strokeColor("#f59e0b").lineWidth(0.5).stroke();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#92400e");
        doc.text(charge.description, x0 + 4, y + 3, { width: 300 });
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#92400e");
        doc.text(fDate(charge.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(charge.amount)}`, x0 + 402, y + 3, { width: 125, align: "right" });
        doc.font("Helvetica").fillColor("#000");
      } else if (isTransfer) {
        doc.rect(x0, y, W, 14).fillColor("#e8f4fd").fill()
          .rect(x0, y, W, 14).strokeColor("#b3d4f5").stroke();
        const cleanDesc = cleanTransferDesc(charge.description);
        const amt = $n(charge.amount);
        const sign = amt < 0 ? "−" : "+";
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#1a4f8a");
        doc.text(cleanDesc, x0 + 4, y + 3, { width: 300 });
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#1a4f8a");
        doc.text(fDate(charge.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`${sign} $ ${fPeso(Math.abs(amt))}`, x0 + 402, y + 3, { width: 125, align: "right" });
        doc.font("Helvetica").fillColor("#000");
      } else {
        doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
        doc.text(charge.description, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(charge.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(charge.amount)}`, x0 + 402, y + 3, { width: 125, align: "right" });
      }
      y += 14;
    }

    // Subtotal
    y += 4;
    doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").stroke();
    y += 4;
    doc.font("Helvetica-Bold").fontSize(8)
      .text("TOTAL CARGOS", x0 + 302, y, { width: 100 })
      .text(`$ ${fPeso(data.grandTotal)}`, x0 + 402, y, { width: 125, align: "right" });
    y += 18;

    // ── Ajustes / Anulaciones (NC void adjustments) ────────────
    if (data.adjustments && data.adjustments.length > 0) {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.rect(x0, y, W, 16).fillColor("#fff3e0").fill().rect(x0, y, W, 16).strokeColor("#e65100").lineWidth(0.5).stroke();
      doc.fillColor("#e65100").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Ajustes / Anulaciones", x0 + 4, y + 4, { width: 300 });
      doc.text("Fecha", x0 + 308, y + 4, { width: 90, align: "center" });
      doc.text("Importe", x0 + 402, y + 4, { width: 125, align: "right" });
      y += 16;

      doc.font("Helvetica").fontSize(7.5);
      for (const adj of data.adjustments) {
        if (y > 720) { doc.addPage(); y = 40; }
        doc.rect(x0, y, W, 14).fillColor("#fff8f0").fill()
          .rect(x0, y, W, 14).strokeColor("#ffcc80").stroke();
        doc.fillColor("#bf360c");
        doc.text(adj.description, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(adj.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(adj.amount)}`, x0 + 402, y + 3, { width: 125, align: "right" });
        doc.fillColor("#000");
        y += 14;
      }
      y += 6;
    }

    // ── Pagos ──────────────────────────────────────────────────
    if (data.payments.length > 0) {
      doc.rect(x0, y, W, 16).fillColor("#e8f5e9").fill().rect(x0, y, W, 16).strokeColor("#ccc").stroke();
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Pagos recibidos", x0 + 4, y + 4, { width: 300 });
      doc.text("Fecha", x0 + 308, y + 4, { width: 90, align: "center" });
      doc.text("Importe", x0 + 402, y + 4, { width: 125, align: "right" });
      y += 16;

      doc.font("Helvetica").fontSize(7.5);
      for (const pay of data.payments) {
        if (y > 720) { doc.addPage(); y = 40; }
        let ret: any = null;
        try { if (pay.notes) ret = JSON.parse(pay.notes)?.retencion; } catch {}
        const methodLabel = PAYMENT_METHOD_LABELS[pay.method] ?? pay.method;
        const label = ret
          ? `${methodLabel}${pay.reference ? ` (Ref: ${pay.reference})` : ""} + Ret. ${ret.tipo === "iibb" ? "IIBB" : "Ganancias"} $${fPeso(ret.monto)}`
          : `${methodLabel}${pay.reference ? ` (Ref: ${pay.reference})` : ""}`;
        const totalPay = ret ? $n(pay.amount) + $n(ret.monto) : $n(pay.amount);

        doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
        doc.text(label, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(pay.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(totalPay)}`, x0 + 402, y + 3, { width: 125, align: "right" });
        y += 14;
      }

      y += 4;
      doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").stroke();
      y += 4;
      doc.font("Helvetica-Bold").fontSize(8)
        .text("TOTAL PAGADO", x0 + 302, y, { width: 100 })
        .text(`$ ${fPeso(data.totalPayments)}`, x0 + 402, y, { width: 125, align: "right" });
      y += 18;
    }

    // ── Saldo ──────────────────────────────────────────────────
    if (y > 720) { doc.addPage(); y = 40; }
    const saldoColor = data.balance <= 0.01 ? "#2e7d32" : "#c62828";
    doc.rect(x0, y, W, 22).fillColor(data.balance <= 0.01 ? "#e8f5e9" : "#ffebee").fill()
      .rect(x0, y, W, 22).strokeColor(saldoColor).lineWidth(1).stroke().lineWidth(0.5);
    doc.fillColor(saldoColor).font("Helvetica-Bold").fontSize(10)
      .text(data.balance <= 0.01 ? "CUENTA SALDADA" : "SALDO PENDIENTE", x0 + 6, y + 5, { width: 300 })
      .text(`$ ${fPeso(Math.abs(data.balance))}`, x0 + 402, y + 5, { width: 125, align: "right" });
    doc.fillColor("#000");
    y += 30;

    // Footer
    if (y > 750) { doc.addPage(); y = 40; }
    doc.font("Helvetica").fontSize(6).fillColor("#888")
      .text("Este comprobante es un documento interno del hotel. No tiene validez fiscal.", x0, y, { align: "center", width: W })
      .fillColor("#000");
    y += 10;
    const _ts2 = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fontSize(6).font("Helvetica").fillColor("#aaaaaa")
      .text(`Generado el ${_ts2} | Maran Suites & Towers`, x0, y, { align: "center", width: W });

    doc.end();
  });
}

export interface ResumenCuentaData {
  reservationCode: string;
  guestName: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  roomRate: number;
  roomTotal: number;
  charges: Array<{ description: string; date: string; amount: string; category?: string }>;
  payments: Array<{ date: string; method: string; amount: string; reference?: string | null; notes?: string | null }>;
  /** Void adjustments written when a Nota de Crédito voids a payment */
  adjustments?: Array<{ description: string; date: string; amount: string }>;
  grandTotal: number;
  totalPayments: number;
  balance: number;
  printedAt: string;
}

/** Strip internal [xfer:…] [corr:…] [rev:…] tags from transfer descriptions */
function cleanTransferDesc(raw: string): string {
  return raw.replace(/\s*\[(xfer|corr|rev):[^\]]*\]/gi, "").trim();
}

export async function generarResumenCuentaPDF(data: ResumenCuentaData, config: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 535;
    const x0 = 30;
    let y = 30;

    // ── Header ─────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000")
      .text("RESUMEN DE CUENTA", x0, y, { width: W, align: "center" });
    y += 18;
    doc.font("Helvetica").fontSize(7).fillColor("#888")
      .text("Documento de cortesía — Sin valor fiscal", x0, y, { width: W, align: "center" });
    doc.fillColor("#000");
    y += 16;

    // Emisor + datos reserva en dos columnas
    doc.rect(x0, y, W, 64).strokeColor("#ccc").lineWidth(0.5).stroke();
    const mid = x0 + W / 2;
    doc.moveTo(mid, y).lineTo(mid, y + 64).stroke();

    doc.font("Helvetica-Bold").fontSize(9).text(config?.razonSocial ?? "MARAN S.A.", x0 + 6, y + 8, { width: W / 2 - 12 });
    doc.font("Helvetica").fontSize(7.5)
      .text(config?.domicilioComercial ?? "", x0 + 6, y + 22)
      .text(`${config?.localidad ?? ""}, ${config?.provincia ?? ""}`, x0 + 6, y + 33)
      .text(`Emitido: ${data.printedAt}`, x0 + 6, y + 48);

    doc.font("Helvetica-Bold").fontSize(8).text(`Huésped: ${data.guestName}`, mid + 6, y + 8, { width: W / 2 - 12 });
    doc.font("Helvetica").fontSize(7.5)
      .text(`Habitación: ${data.roomNumber}  |  Reserva: ${data.reservationCode}`, mid + 6, y + 22)
      .text(`Check-in: ${fDate(data.checkInDate)}`, mid + 6, y + 34)
      .text(`Check-out: ${fDate(data.checkOutDate)}  (${data.nights} noche${data.nights !== 1 ? "s" : ""})`, mid + 6, y + 46);
    y += 72;

    // ── Cargos ─────────────────────────────────────────────────
    doc.rect(x0, y, W, 16).fillColor("#f0f0f0").fill().rect(x0, y, W, 16).strokeColor("#ccc").stroke();
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(7.5);
    doc.text("Concepto", x0 + 4, y + 4, { width: 300 });
    doc.text("Fecha", x0 + 308, y + 4, { width: 90, align: "center" });
    doc.text("Importe", x0 + 402, y + 4, { width: 125, align: "right" });
    y += 16;

    doc.font("Helvetica").fontSize(7.5);

    // Alojamiento por noche
    if (data.nights > 1 && data.roomRate > 0) {
      const checkIn = new Date(data.checkInDate + "T12:00:00");
      for (let i = 0; i < data.nights; i++) {
        if (y > 720) { doc.addPage(); y = 40; }
        const nightDate = new Date(checkIn);
        nightDate.setDate(nightDate.getDate() + i);
        doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
        doc.text(`Alojamiento noche ${i + 1}`, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(nightDate.toISOString().split("T")[0]), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(data.roomRate)}`, x0 + 402, y + 3, { width: 125, align: "right" });
        y += 14;
      }
    } else {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
      doc.text(`Alojamiento (${data.nights} noche${data.nights !== 1 ? "s" : ""})`, x0 + 4, y + 3, { width: 300 });
      doc.text(`${fDate(data.checkInDate)} — ${fDate(data.checkOutDate)}`, x0 + 308, y + 3, { width: 90, align: "center" });
      doc.text(`$ ${fPeso(data.roomTotal)}`, x0 + 402, y + 3, { width: 125, align: "right" });
      y += 14;
    }

    for (const charge of data.charges) {
      if (y > 720) { doc.addPage(); y = 40; }
      const isTransferOut = charge.category === "transfer_out";
      const isTransferIn  = charge.category === "transfer_in";
      const isTransfer    = isTransferOut || isTransferIn;

      if (isTransfer) {
        // Distinct background for transfer entries
        doc.rect(x0, y, W, 14).fillColor("#e8f4fd").fill()
          .rect(x0, y, W, 14).strokeColor("#b3d4f5").stroke();
        const cleanDesc = cleanTransferDesc(charge.description);
        const amt = $n(charge.amount);
        const sign = amt < 0 ? "−" : "+";
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#1a4f8a");
        doc.text(cleanDesc, x0 + 4, y + 3, { width: 300 });
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#1a4f8a");
        doc.text(fDate(charge.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`${sign} $ ${fPeso(Math.abs(amt))}`, x0 + 402, y + 3, { width: 125, align: "right" });
        doc.font("Helvetica").fillColor("#000");
      } else {
        doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
        doc.text(charge.description, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(charge.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(charge.amount)}`, x0 + 402, y + 3, { width: 125, align: "right" });
      }
      y += 14;
    }

    y += 4;
    doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").stroke();
    y += 6;
    doc.font("Helvetica-Bold").fontSize(8)
      .text("TOTAL CARGOS", x0 + 302, y, { width: 100 })
      .text(`$ ${fPeso(data.grandTotal)}`, x0 + 402, y, { width: 125, align: "right" });
    y += 20;

    // ── Ajustes / Anulaciones ──────────────────────────────────
    if (data.adjustments && data.adjustments.length > 0) {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.rect(x0, y, W, 16).fillColor("#fff3e0").fill().rect(x0, y, W, 16).strokeColor("#e65100").lineWidth(0.5).stroke();
      doc.fillColor("#e65100").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Ajustes / Anulaciones", x0 + 4, y + 4, { width: 300 });
      doc.text("Fecha", x0 + 308, y + 4, { width: 90, align: "center" });
      doc.text("Importe", x0 + 402, y + 4, { width: 125, align: "right" });
      y += 16;

      doc.font("Helvetica").fontSize(7.5);
      for (const adj of data.adjustments) {
        if (y > 720) { doc.addPage(); y = 40; }
        doc.rect(x0, y, W, 14).fillColor("#fff8f0").fill()
          .rect(x0, y, W, 14).strokeColor("#ffcc80").stroke();
        doc.fillColor("#bf360c");
        doc.text(adj.description, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(adj.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(adj.amount)}`, x0 + 402, y + 3, { width: 125, align: "right" });
        doc.fillColor("#000");
        y += 14;
      }
      y += 6;
    }

    // ── Pagos / Anticipos ──────────────────────────────────────
    if (data.payments.length > 0) {
      doc.rect(x0, y, W, 16).fillColor("#e8f4fd").fill().rect(x0, y, W, 16).strokeColor("#ccc").stroke();
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Pagos y anticipos registrados", x0 + 4, y + 4, { width: 300 });
      doc.text("Fecha", x0 + 308, y + 4, { width: 90, align: "center" });
      doc.text("Importe", x0 + 402, y + 4, { width: 125, align: "right" });
      y += 16;

      doc.font("Helvetica").fontSize(7.5);
      for (const pay of data.payments) {
        if (y > 720) { doc.addPage(); y = 40; }
        let ret: any = null;
        try { if (pay.notes) ret = JSON.parse(pay.notes)?.retencion; } catch {}
        const methodLabel = PAYMENT_METHOD_LABELS[pay.method] ?? pay.method;
        const label = ret
          ? `${methodLabel} + Ret. ${ret.tipo === "iibb" ? "IIBB" : "Ganancias"} $${fPeso(ret.monto)}`
          : `${methodLabel}${pay.reference ? ` (Ref: ${pay.reference})` : ""}`;
        const totalPay = ret ? $n(pay.amount) + $n(ret.monto) : $n(pay.amount);

        doc.rect(x0, y, W, 14).strokeColor("#eee").stroke();
        doc.text(label, x0 + 4, y + 3, { width: 300 });
        doc.text(fDate(pay.date), x0 + 308, y + 3, { width: 90, align: "center" });
        doc.text(`$ ${fPeso(totalPay)}`, x0 + 402, y + 3, { width: 125, align: "right" });
        y += 14;
      }

      y += 4;
      doc.moveTo(x0, y).lineTo(x0 + W, y).strokeColor("#ccc").stroke();
      y += 6;
      doc.font("Helvetica-Bold").fontSize(8)
        .text("TOTAL PAGADO", x0 + 302, y, { width: 100 })
        .text(`$ ${fPeso(data.totalPayments)}`, x0 + 402, y, { width: 125, align: "right" });
      y += 20;
    }

    // ── Saldo ──────────────────────────────────────────────────
    if (y > 720) { doc.addPage(); y = 40; }
    const saldoColor = data.balance <= 0.01 ? "#2e7d32" : "#c62828";
    doc.rect(x0, y, W, 26).fillColor(data.balance <= 0.01 ? "#e8f5e9" : "#ffebee").fill()
      .rect(x0, y, W, 26).strokeColor(saldoColor).lineWidth(1).stroke().lineWidth(0.5);
    doc.fillColor(saldoColor).font("Helvetica-Bold").fontSize(11)
      .text(data.balance <= 0.01 ? "CUENTA SALDADA — SALDO $0.00" : `SALDO PENDIENTE: $ ${fPeso(data.balance)}`,
        x0 + 6, y + 7, { width: W - 12, align: "center" });
    doc.fillColor("#000");
    y += 34;

    // Footer
    if (y > 750) { doc.addPage(); y = 40; }
    doc.font("Helvetica").fontSize(6).fillColor("#888")
      .text("Este resumen es un documento de cortesía. No constituye comprobante fiscal.", x0, y, { align: "center", width: W })
      .fillColor("#000");
    y += 10;
    const _ts3 = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fontSize(6).font("Helvetica").fillColor("#aaaaaa")
      .text(`Generado el ${_ts3} | Maran Suites & Towers`, x0, y, { align: "center", width: W });

    doc.end();
  });
}
