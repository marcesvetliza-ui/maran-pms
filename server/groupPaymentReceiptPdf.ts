import PDFDocument from "pdfkit";

export interface GroupPaymentReceiptData {
  receiptNumber: number | null;
  legacyId: string;
  group: { name: string; code?: string | null };
  payment: {
    amount: string | number; date: string; reference?: string | null; method?: string | null;
    receiptType?: string | null; receivedBy?: string | null; notes?: string | null;
    paymentMethodDetail?: unknown; receiverDetails?: unknown; retentionDetail?: unknown;
    concepts?: unknown; invoiceRef?: string | null; invoiceNcRef?: string | null;
    settlementBreakdown?: {
      documentTotal: number;
      appliedAdvances: number;
      newCollection: number;
    } | null;
  };
  roomDistribution: Array<{ roomNumber?: string | null; guestName?: string | null; reservationCode?: string | null; amount: number }>;
}

const money = (value: unknown) => `$${(Number(value) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (method: string) => ({
  cash: "Efectivo", transfer: "Transferencia", debit_card: "Tarjeta de débito",
  credit_card: "Tarjeta de crédito", mercadopago: "Mercado Pago",
  cuenta_corriente: "Cuenta corriente",
} as Record<string, string>)[method] || method;
const array = (value: unknown) => Array.isArray(value) ? value : [];
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const json = (value: unknown) => {
  if (typeof value !== "string") return object(value);
  try { return object(JSON.parse(value)); } catch { return {}; }
};

/** Generates the immutable-view receipt for the one parent group payment. */
export async function generateGroupPaymentReceiptPdf(data: GroupPaymentReceiptData): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const write = (text: string, bold = false) => {
      if (doc.y > 760) doc.addPage();
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#222").text(text, { width: 510 });
    };
    const heading = (text: string) => {
      if (doc.y > 735) doc.addPage();
      doc.moveDown(.7).font("Helvetica-Bold").fontSize(10).fillColor("#1d4e67").text(text.toUpperCase());
      doc.moveTo(42, doc.y + 3).lineTo(553, doc.y + 3).strokeColor("#b9cbd3").stroke();
      doc.moveDown(.45);
    };
    const receiver = object(data.payment.receiverDetails);
    const methods = array(data.payment.paymentMethodDetail);
    const concepts = array(data.payment.concepts);
    const retentions = array(data.payment.retentionDetail);
    const invoice = json(data.payment.invoiceRef);
    const nc = json(data.payment.invoiceNcRef);
    const storedBreakdown = object(data.payment.settlementBreakdown);
    const conceptTotal = concepts.reduce((sum: number, concept: any) => sum + (Number(concept?.amount) || 0), 0);
    const documentTotal = Number(storedBreakdown.documentTotal)
      || (Object.keys(invoice).length ? conceptTotal : Number(data.payment.amount) || 0);
    const newCollection = Number(storedBreakdown.newCollection) || Number(data.payment.amount) || 0;
    const appliedAdvances = Number(storedBreakdown.appliedAdvances)
      || Math.max(0, documentTotal - newCollection);

    doc.font("Helvetica-Bold").fontSize(19).fillColor("#143d52").text("RECIBO DE PAGO GRUPAL");
    doc.moveDown(.25).font("Helvetica").fontSize(9).fillColor("#333")
      .text(`Recibo Nº ${data.receiptNumber ?? `LEG-${data.legacyId}`}   |   Fecha: ${data.payment.date}`);
    write(`Grupo: ${data.group.name}${data.group.code ? ` (${data.group.code})` : ""}`, true);
    heading("Desglose del cobro");
    write(`Total del comprobante: ${money(documentTotal)}`, true);
    write(`Anticipos aplicados: ${money(appliedAdvances)}`);
    write(`Cobro nuevo: ${money(newCollection)}`, true);
    heading("Receptor y recepción");
    write(`Receptor: ${receiver.razonSocial || "No informado"}${receiver.cuit ? ` — CUIT ${receiver.cuit}` : receiver.dni ? ` — DNI ${receiver.dni}` : ""}`);
    if (receiver.condicionIva) write(`Condición IVA: ${receiver.condicionIva}`);
    if (receiver.domicilio) write(`Domicilio: ${receiver.domicilio}`);
    write(`Recibido por: ${data.payment.receivedBy || "No informado"}`);
    heading("Medios de pago");
    (methods.length ? methods : [{ method: data.payment.method, amount: data.payment.amount, reference: data.payment.reference }]).forEach((row: any) =>
      write(`${label(String(row.method || ""))}: ${money(row.amount)}${row.reference ? ` — Ref. ${row.reference}` : ""}`));
    if (retentions.length) {
      heading("Retenciones");
      retentions.forEach((row: any) => write(`${row.tipo || "Retención"}: ${money(row.monto)}`));
    }
    heading("Conceptos");
    (concepts.length ? concepts : [{ description: "Conceptos no disponibles en recibos históricos", amount: data.payment.amount }])
      .forEach((concept: any) => write(`${concept.description || "Concepto"}: ${money(concept.amount)}`));
    heading("Distribución en habitaciones");
    if (!data.roomDistribution.length) write("Aplicado al Folio Maestro / cargos grupales.");
    data.roomDistribution.forEach((room) => write(
      `Hab. ${room.roomNumber || "—"} · ${room.guestName || "Huésped"}${room.reservationCode ? ` (${room.reservationCode})` : ""}: ${money(room.amount)}`));
    heading("Comprobante fiscal y estado");
    write(`Tipo: ${data.payment.receiptType || "Sin comprobante"}`);
    if (Object.keys(invoice).length) write(`Factura vinculada: ${invoice.tipoComprobante || invoice.tipo_comprobante || ""} ${invoice.puntoVenta ?? ""}-${invoice.numero ?? ""} ${invoice.estado ? `(${invoice.estado})` : ""}`.trim());
    else write("Factura vinculada: no");
    if (Object.keys(nc).length) write(`Nota de crédito: ${nc.tipoComprobante || nc.tipo_comprobante || "emitida"} ${nc.numero ?? ""}`.trim());
    else write("Nota de crédito: no emitida");
    if (data.payment.reference) write(`Referencia general: ${data.payment.reference}`);
    if (data.payment.notes) { heading("Notas"); write(data.payment.notes); }
    doc.moveDown(1).fontSize(7).fillColor("#666").text("Este documento representa un único recibo financiero padre; sus distribuciones son asignaciones informativas.", { align: "center" });
    doc.end();
  });
}