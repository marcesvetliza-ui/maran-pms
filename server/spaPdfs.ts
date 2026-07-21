import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { SpaAppointmentWithDetails, SpaAccountWithItems, SpaProfessional } from "@shared/schema";

const NAVY  = "#1a3a6c";
const TEAL  = "#4a9b8e";
const ORANGE = "#e8841a";

const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE   = "+54 (0343) 503-8070";
const HOTEL_EMAIL   = "spa@maran.com.ar";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  const fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
  return `${DIAS[fecha.getDay()]} ${day}/${m}/${y}`;
};

const fmtMoney = (v: string | number) =>
  parseFloat(String(v)).toLocaleString("es-AR", { minimumFractionDigits: 2 });

const statusLabel: Record<string, string> = {
  pending:     "PENDIENTE",
  confirmed:   "CONFIRMADO",
  in_progress: "EN CURSO",
  completed:   "COMPLETADO",
  cancelled:   "CANCELADO",
  no_show:     "NO SHOW",
};

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  pending:     { bg: "#fff8e1", border: "#ffc107", text: "#e65100" },
  confirmed:   { bg: "#e8f5e9", border: "#a5d6a7", text: "#2e7d32" },
  in_progress: { bg: "#e3f2fd", border: "#90caf9", text: "#1565c0" },
  completed:   { bg: "#ede7f6", border: "#b39ddb", text: "#4527a0" },
  cancelled:   { bg: "#ffebee", border: "#ef9a9a", text: "#b71c1c" },
  no_show:     { bg: "#fafafa", border: "#bdbdbd", text: "#424242" },
};

export async function generateConfirmacionTurnoSpaPdf(
  appointment: SpaAppointmentWithDetails,
  account: SpaAccountWithItems | undefined,
  professional: SpaProfessional | undefined,
): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const pageW  = 595;
    const pageH  = 842;
    const margin = 44;

    // ── FULL PAGE BACKGROUND IMAGE ────────────────────────────────────────────
    const bgPath = path.join(process.cwd(), "server", "assets", "spa-confirmacion-bg.jpg");
    if (fs.existsSync(bgPath)) {
      doc.image(bgPath, 0, 0, { width: pageW, height: pageH });
    } else {
      doc.rect(0, 0, pageW, pageH).fill("#f0f0f0");
    }

    // Content lives on the left ~60% of the page (right side has the photos in the bg image)
    const contentW = pageW * 0.60 - margin;

    // ── LOGO (top left) ───────────────────────────────────────────────────────
    const logoPath = path.join(process.cwd(), "server", "assets", "hotel-logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, 28, { height: 42, fit: [130, 42] });
    } else {
      doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold")
        .text("MARAN SUITES & TOWERS", margin, 34);
    }

    // Orange accent line under logo
    doc.rect(margin, 76, 130, 2).fill(ORANGE);

    let y = 100;

    // ── TITLE BLOCK ───────────────────────────────────────────────────────────
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
      .text("CONFIRMACIÓN DE TURNO SPA", margin, y, { characterSpacing: 2 });
    y += 13;
    doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold")
      .text("Confirmación de Turno", margin, y, { width: contentW });
    y += 28;
    doc.fillColor("#666666").fontSize(8.5).font("Helvetica")
      .text(`Emitida: ${new Date().toLocaleDateString("es-AR")}`, margin, y);
    y += 20;

    // ── STATUS BADGE ──────────────────────────────────────────────────────────
    const st = appointment.status;
    const sc = statusColors[st] || statusColors["confirmed"];
    const sl = statusLabel[st] || st.toUpperCase();
    const badgeW = 94;
    doc.roundedRect(margin, y, badgeW, 17, 8).fillAndStroke(sc.bg, sc.border);
    doc.fillColor(sc.text).fontSize(7).font("Helvetica-Bold")
      .text(sl, margin, y + 5, { width: badgeW, align: "center", characterSpacing: 0.5 });
    y += 32;

    // Thin divider
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    y += 16;

    // ── GUEST NAME ────────────────────────────────────────────────────────────
    const guestFull = `${appointment.guestName} ${appointment.guestLastName || ""}`.trim();
    doc.fillColor("#888888").fontSize(6.5).font("Helvetica-Bold")
      .text("HUÉSPED / CLIENTE", margin, y, { characterSpacing: 1 });
    doc.moveTo(margin, y + 10).lineTo(margin + 70, y + 10).strokeColor(TEAL).lineWidth(2).stroke();
    y += 14;
    doc.fillColor(NAVY).fontSize(16).font("Helvetica-Bold")
      .text(guestFull, margin, y, { width: contentW });
    y += 24;
    if (appointment.guestPhone) {
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(`Tel: ${appointment.guestPhone}`, margin, y);
      y += 13;
    }
    if (appointment.guestEmail) {
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(appointment.guestEmail, margin, y);
      y += 13;
    }
    y += 10;

    // ── KEY DATA CARDS ────────────────────────────────────────────────────────
    const cells: { label: string; value: string }[] = [
      { label: "FECHA",        value: fmtDate(appointment.appointmentDate) },
      { label: "HORARIO",      value: `${appointment.startTime} — ${appointment.endTime} hs` },
      { label: "TRATAMIENTO",  value: appointment.treatment?.name || "—" },
      { label: "GABINETE",     value: appointment.cabin?.name || "—" },
    ];
    if (professional) {
      cells.push({ label: "PROFESIONAL", value: `${professional.name} ${professional.lastName || ""}`.trim() });
    }

    const cardH   = 42;
    const cardGap = 5;
    const cardW   = contentW;

    cells.forEach((cell) => {
      // White card with subtle shadow
      doc.roundedRect(margin + 1, y + 1, cardW, cardH, 5).fill("rgba(0,0,0,0.06)");
      doc.roundedRect(margin, y, cardW, cardH, 5).fillAndStroke("#ffffff", "#e0e0e0");
      // Teal left accent bar
      doc.roundedRect(margin, y, 4, cardH, 2).fill(TEAL);

      doc.fillColor("#999999").fontSize(6.5).font("Helvetica-Bold")
        .text(cell.label, margin + 14, y + 8, { characterSpacing: 0.8 });
      doc.fillColor(NAVY).fontSize(10.5).font("Helvetica-Bold")
        .text(cell.value, margin + 14, y + 20, { width: cardW - 20 });

      y += cardH + cardGap;
    });

    y += 6;

    // ── NOTES ─────────────────────────────────────────────────────────────────
    if (appointment.notes) {
      const noteH = doc.heightOfString(appointment.notes, { width: cardW - 24 });
      doc.roundedRect(margin, y, cardW, noteH + 28, 5).fillAndStroke("#fffbf0", "#ffe082");
      doc.fillColor("#888888").fontSize(6.5).font("Helvetica-Bold")
        .text("NOTAS", margin + 14, y + 9, { characterSpacing: 0.8 });
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(appointment.notes, margin + 14, y + 19, { width: cardW - 24 });
      y += noteH + 36;
    }

    // ── CHARGES TABLE ─────────────────────────────────────────────────────────
    if (account?.items?.length) {
      doc.moveTo(margin, y).lineTo(margin + cardW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
      y += 14;

      doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold")
        .text("Detalle de servicios", margin, y);
      y += 18;

      // Header
      doc.roundedRect(margin, y, cardW, 20, 4).fill(NAVY);
      const thY = y + 6;
      doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
      doc.text("Descripción",    margin + 8,  thY, { width: cardW * 0.52 });
      doc.text("Cant.",          margin + 8,  thY, { width: cardW * 0.66, align: "right" });
      doc.text("P. Unit.",       margin + 8,  thY, { width: cardW * 0.82, align: "right" });
      doc.text("Total",          margin + 8,  thY, { width: cardW - 8,    align: "right" });
      y += 22;

      let totalItems = 0;
      for (const item of account.items) {
        const rH = 18;
        doc.rect(margin, y, cardW, rH).fillAndStroke("#fafafa", "#eeeeee");
        doc.fillColor("#1a1a1a").fontSize(8).font("Helvetica")
          .text(item.description,                        margin + 8, y + 4, { width: cardW * 0.52 });
        doc.text(String(item.quantity),                  margin + 8, y + 4, { width: cardW * 0.66, align: "right" });
        doc.text(`$ ${fmtMoney(item.unitPrice)}`,        margin + 8, y + 4, { width: cardW * 0.82, align: "right" });
        doc.text(`$ ${fmtMoney(item.subtotal)}`,         margin + 8, y + 4, { width: cardW - 8,    align: "right" });
        totalItems += parseFloat(String(item.subtotal || "0"));
        y += rH;
      }

      // Total row
      doc.roundedRect(margin, y + 2, cardW, 20, 4).fill("#eef2ff");
      doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold")
        .text("TOTAL",                              margin + 8, y + 6, { width: cardW * 0.7 });
      doc.fillColor(NAVY).fontSize(9.5).font("Helvetica-Bold")
        .text(`$ ${fmtMoney(totalItems)}`,          margin + 8, y + 6, { width: cardW - 8, align: "right" });
      y += 28;
    }

    // ── FOOTER STRIP ──────────────────────────────────────────────────────────
    const footerY = pageH - 48;
    doc.rect(0, footerY, pageW * 0.62, 2).fill(ORANGE);
    doc.rect(0, footerY + 2, pageW * 0.62, 46).fill(NAVY);

    doc.fillColor("white").fontSize(8).font("Helvetica-Bold")
      .text("MARAN SUITES & TOWERS — SPA & WELLNESS", margin, footerY + 10, { width: pageW * 0.55 });
    doc.fillColor("#aacccc").fontSize(6.8).font("Helvetica")
      .text(HOTEL_ADDRESS, margin, footerY + 23, { width: pageW * 0.55 });
    doc.fillColor("#aacccc").fontSize(6.8).font("Helvetica")
      .text(`${HOTEL_EMAIL}  ·  ${HOTEL_PHONE}`, margin, footerY + 33, { width: pageW * 0.55 });
    const ts = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    doc.fillColor("#aaaaaa").fontSize(6).font("Helvetica")
      .text(`Generado el ${ts}`, pageW * 0.62 + margin, footerY + 20, { width: pageW * 0.35 - margin, align: "center" });

    doc.end();
  });
}
