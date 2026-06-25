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
  NCA: { nombre: "NOTA DE CRÉDITO",  letra: "A", codigo: "003" },
  NCB: { nombre: "NOTA DE CRÉDITO",  letra: "B", codigo: "008" },
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
    // Factura A / NC-A discriminan IVA; B, C, NC-B no discriminan
    const discriminaIVA = ["FA", "NCA"].includes(tipoKey);

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

    doc.end();
  });
}
