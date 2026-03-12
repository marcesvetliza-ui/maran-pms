import PDFDocument from "pdfkit";
import type { EventWithDetails } from "@shared/schema";

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    corporate: "Corporativo",
    social: "Social",
    wedding: "Casamiento",
    conference: "Conferencia",
    meeting: "Reunión",
    table_event: "Por Mesa",
    other: "Otro",
  };
  return labels[type] || type;
}

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

const fmtMoney = (v: string | number) =>
  parseFloat(String(v)).toLocaleString("es-AR", { minimumFractionDigits: 2 });

export async function generateHojaFuncionPdf(event: EventWithDetails): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // ── ENCABEZADO ──────────────────────────────────────────────────────────
    doc.fontSize(18).font("Helvetica-Bold").text("HOJA DE FUNCIÓN", { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Hotel Maran Suites & Towers", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // ── DATOS DEL EVENTO ────────────────────────────────────────────────────
    doc.fontSize(14).font("Helvetica-Bold").text(event.name);
    doc.fontSize(10).font("Helvetica").text(`Código: ${event.eventCode}`);
    doc.moveDown(0.5);

    const col1 = 50;
    const col2 = 200;
    const col3 = 320;
    const col4 = 460;

    const row = (label1: string, val1: string, label2?: string, val2?: string) => {
      const y = doc.y;
      doc.fontSize(9).font("Helvetica-Bold").text(label1, col1, y);
      doc.fontSize(9).font("Helvetica").text(val1, col2, y);
      if (label2 && val2) {
        doc.fontSize(9).font("Helvetica-Bold").text(label2, col3, y);
        doc.fontSize(9).font("Helvetica").text(val2, col4, y);
      }
      doc.moveDown(0.6);
    };

    row("Salón:", event.eventRoom?.name || "-", "Tipo:", eventTypeLabel(event.eventType));
    row(
      "Fecha:",
      event.startDate === event.endDate
        ? fmtDate(event.startDate)
        : `${fmtDate(event.startDate)} al ${fmtDate(event.endDate)}`,
      "Asistentes:",
      String(event.attendees)
    );
    if (event.startTime) {
      row("Horario:", `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ""}`, "", "");
    }
    row("Contacto:", event.contactName, "Teléfono:", event.contactPhone || "-");
    if (event.contactEmail) {
      row("Email:", event.contactEmail, "", "");
    }
    if (event.company) {
      row("Empresa:", (event.company as any).name || "-", "", "");
    }

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    // ── SERVICIOS / CARGOS (sin precios) ────────────────────────────────────
    if (event.charges && event.charges.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Servicios contratados");
      doc.moveDown(0.3);

      const y0 = doc.y;
      doc.rect(50, y0, 495, 18).fillColor("#f0f0f0").fill();
      doc.fillColor("#000000");
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Descripción", 55, y0 + 4);
      doc.text("Cantidad", 420, y0 + 4, { width: 60, align: "right" });
      doc.moveDown(1.2);

      for (const charge of event.charges) {
        const yc = doc.y;
        doc.fontSize(9).font("Helvetica");
        doc.text(charge.description, 55, yc, { width: 340 });
        doc.text(String(charge.quantity), 420, yc, { width: 60, align: "right" });
        if (charge.notes) {
          doc.moveDown(0.2);
          doc.fontSize(8).fillColor("#666666").text(`   ${charge.notes}`, 55);
          doc.fillColor("#000000");
        }
        doc.moveDown(0.5);
      }
    }

    // ── NOTAS INTERNAS ──────────────────────────────────────────────────────
    if (event.notes) {
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica-Bold").text("Notas / Instrucciones operativas");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica").text(event.notes, { width: 495 });
    }

    // ── PIE DE PÁGINA ───────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor("#888888").text(
      `Hoja de Función — USO INTERNO — Generado el ${new Date().toLocaleDateString("es-AR")}`,
      { align: "center" }
    );

    doc.end();
  });
}

export async function generateConfirmacionEventoPdf(event: EventWithDetails): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // ── ENCABEZADO ──────────────────────────────────────────────────────────
    doc.fontSize(18).font("Helvetica-Bold").text("CONFIRMACIÓN DE EVENTO", { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Hotel Maran Suites & Towers", { align: "center" });
    doc.fontSize(9).fillColor("#666666")
      .text("Alameda de la Federación 698, Paraná, Entre Ríos | reservas@maran.com.ar", { align: "center" });
    doc.fillColor("#000000");
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // ── DATOS DEL EVENTO ────────────────────────────────────────────────────
    doc.fontSize(14).font("Helvetica-Bold").text(event.name);
    doc.fontSize(10).font("Helvetica").fillColor("#444444").text(`Código de reserva: ${event.eventCode}`);
    doc.fillColor("#000000");
    doc.moveDown(0.5);

    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.fontSize(9).font("Helvetica-Bold").text(label, 50, y, { width: 130 });
      doc.fontSize(9).font("Helvetica").text(value, 185, y, { width: 360 });
      doc.moveDown(0.55);
    };

    row("Salón:", event.eventRoom?.name || "-");
    row(
      "Fecha:",
      event.startDate === event.endDate
        ? fmtDate(event.startDate)
        : `${fmtDate(event.startDate)} al ${fmtDate(event.endDate)}`
    );
    if (event.startTime) {
      row("Horario:", `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ""}`);
    }
    row("Cantidad de personas:", String(event.attendees));
    row("Tipo de evento:", eventTypeLabel(event.eventType));
    row("Contacto:", event.contactName);
    if (event.contactPhone) row("Teléfono:", event.contactPhone);
    if (event.contactEmail) row("Email:", event.contactEmail);
    if (event.company) row("Empresa:", (event.company as any).name || "-");

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    // ── CARGOS CON PRECIOS ───────────────────────────────────────────────────
    if (event.charges && event.charges.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Detalle de servicios");
      doc.fontSize(8).font("Helvetica").fillColor("#666666").text("Precios con IVA (21%) incluido");
      doc.fillColor("#000000");
      doc.moveDown(0.4);

      const y0 = doc.y;
      doc.rect(50, y0, 495, 18).fillColor("#f0f0f0").fill();
      doc.fillColor("#000000");
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Descripción", 55, y0 + 4, { width: 260 });
      doc.text("Cantidad", 320, y0 + 4, { width: 60, align: "right" });
      doc.text("Precio unit.", 385, y0 + 4, { width: 80, align: "right" });
      doc.text("Total", 470, y0 + 4, { width: 70, align: "right" });
      doc.moveDown(1.3);

      let totalConIva = 0;
      for (const charge of event.charges) {
        const yc = doc.y;
        const total = parseFloat(String(charge.totalAmount) || "0");
        totalConIva += total;
        doc.fontSize(9).font("Helvetica");
        doc.text(charge.description, 55, yc, { width: 260 });
        doc.text(String(charge.quantity), 320, yc, { width: 60, align: "right" });
        doc.text(`$${fmtMoney(charge.unitPrice)}`, 385, yc, { width: 80, align: "right" });
        doc.text(`$${fmtMoney(charge.totalAmount)}`, 470, yc, { width: 70, align: "right" });
        doc.moveDown(0.6);
      }

      doc.moveDown(0.3);
      doc.moveTo(320, doc.y).lineTo(545, doc.y).strokeColor("#000000").stroke();
      doc.moveDown(0.4);

      const yTot = doc.y;
      doc.fontSize(10).font("Helvetica-Bold")
        .text("TOTAL (con IVA incluido):", 320, yTot, { width: 145, align: "right" });
      doc.text(`$${fmtMoney(totalConIva)}`, 470, yTot, { width: 70, align: "right" });
      doc.moveDown(0.5);

      doc.fontSize(8).font("Helvetica").fillColor("#666666")
        .text("* IVA a aplicar según condición impositiva del cliente al momento de facturar.", 50, doc.y, { width: 495 });
      doc.fillColor("#000000");
    }

    // ── NOTAS ───────────────────────────────────────────────────────────────
    if (event.notes) {
      doc.moveDown(0.7);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica-Bold").text("Observaciones");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica").text(event.notes, { width: 495 });
    }

    // ── FIRMA Y CONDICIONES ──────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    const ySig = doc.y;
    doc.fontSize(9).font("Helvetica");
    doc.text("Firma y aclaración cliente:", 50, ySig);
    doc.moveTo(220, ySig + 12).lineTo(400, ySig + 12).stroke();
    doc.text("Fecha:", 420, ySig);
    doc.moveTo(455, ySig + 12).lineTo(545, ySig + 12).stroke();
    doc.moveDown(2);

    doc.fontSize(8).fillColor("#888888").text(
      `Confirmación de Evento — Maran SA — CUIT 33-68110008-9 — Generado el ${new Date().toLocaleDateString("es-AR")}`,
      { align: "center" }
    );

    doc.end();
  });
}
