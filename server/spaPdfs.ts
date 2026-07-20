import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { SpaAppointmentWithDetails, SpaAccountWithItems, SpaProfessional } from "@shared/schema";

const HOTEL_NAME    = "Maran Suites & Towers";
const HOTEL_ADDRESS = "Alameda de la Federación 698, Paraná, Entre Ríos";
const HOTEL_PHONE   = "+54 (0343) 503-8070";
const HOTEL_EMAIL   = "spa@maran.com.ar";
const HOTEL_WEB     = "MARAN.COM.AR";
const NAVY          = "#1a3a6c";
const ORANGE        = "#e8841a";
const TEAL          = "#4a9b8e";
const FOOTER_BG     = "#1a3a6c";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  const fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
  const diaSemana = DIAS[fecha.getDay()];
  return `${diaSemana} ${day}/${m}/${y}`;
};

const fmtMoney = (v: string | number) =>
  parseFloat(String(v)).toLocaleString("es-AR", { minimumFractionDigits: 2 });

const statusLabel: Record<string, string> = {
  pending: "PENDIENTE",
  confirmed: "CONFIRMADO",
  in_progress: "EN CURSO",
  completed: "COMPLETADO",
  cancelled: "CANCELADO",
  no_show: "NO SHOW",
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

    const pageW    = 595;
    const pageH    = 842;
    const margin   = 40;
    const contentW = pageW - margin * 2;

    // ── RIGHT PANEL BACKGROUND IMAGE ─────────────────────────────────────────
    const panelX   = pageW * 0.62;
    const panelW   = pageW - panelX;
    const bgPath   = path.join(process.cwd(), "server", "assets", "spa-confirmacion-bg.jpg");
    if (fs.existsSync(bgPath)) {
      doc.save();
      doc.rect(panelX, 0, panelW, pageH).clip();
      doc.image(bgPath, panelX, 0, { width: panelW, height: pageH, cover: [panelW, pageH] });
      doc.restore();
      // Semi-transparent dark overlay via low-opacity white fade on left edge
      const overlayGrad = doc.linearGradient(panelX, 0, panelX + 40, 0);
      overlayGrad.stop(0, "white", 1).stop(1, "white", 0);
      doc.rect(panelX, 0, 40, pageH).fill(overlayGrad);
      // Dark tint
      doc.rect(panelX, 0, panelW, pageH).fillOpacity(0.38).fill("#000000");
      doc.fillOpacity(1);
    } else {
      doc.rect(panelX, 0, panelW, pageH).fill(TEAL);
    }

    // ── HEADER BAR ──────────────────────────────────────────────────────────
    doc.rect(0, 0, pageW, 6).fill(TEAL);
    doc.rect(0, 6, panelX, 4).fill(ORANGE);

    // Hotel logo area (top left)
    const logoPath = path.join(process.cwd(), "server", "assets", "hotel-logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, 18, { height: 36, fit: [120, 36] });
    } else {
      doc.fillColor(NAVY).fontSize(13).font("Helvetica-Bold")
        .text("MARAN SUITES & TOWERS", margin, 22);
    }

    // SPA label top right (over image panel)
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold")
      .text("SPA & WELLNESS", panelX + 10, 18, { width: panelW - 20, align: "center", characterSpacing: 2 });
    doc.fillColor("white").fontSize(7).font("Helvetica")
      .text("MARAN SUITES & TOWERS", panelX + 10, 33, { width: panelW - 20, align: "center" });

    let y = 68;

    // ── TITLE BLOCK ─────────────────────────────────────────────────────────
    doc.fillColor("#999999").fontSize(7).font("Helvetica")
      .text("CONFIRMACIÓN DE TURNO SPA", margin, y, { characterSpacing: 2 });
    y += 13;
    doc.fillColor(NAVY).fontSize(19).font("Helvetica-Bold")
      .text("Confirmación de Turno", margin, y, { width: panelX - margin - 20 });
    y += 26;
    doc.fillColor("#555555").fontSize(9).font("Helvetica")
      .text(`Emitida: ${new Date().toLocaleDateString("es-AR")}`, margin, y);
    y += 18;

    // Thin divider
    doc.moveTo(margin, y).lineTo(panelX - 20, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 14;

    // ── STATUS BADGE ─────────────────────────────────────────────────────────
    const st = appointment.status;
    const sc = statusColors[st] || statusColors["confirmed"];
    const sl = statusLabel[st] || st.toUpperCase();
    const badgeW = 90;
    doc.roundedRect(margin, y, badgeW, 16, 8).fillAndStroke(sc.bg, sc.border);
    doc.fillColor(sc.text).fontSize(7).font("Helvetica-Bold")
      .text(sl, margin, y + 4, { width: badgeW, align: "center", characterSpacing: 0.5 });
    y += 28;

    // ── GUEST NAME ───────────────────────────────────────────────────────────
    const guestFull = `${appointment.guestName} ${appointment.guestLastName || ""}`.trim();
    doc.fillColor("#888888").fontSize(7).font("Helvetica-Bold")
      .text("HUÉSPED / CLIENTE", margin, y, { characterSpacing: 1 });
    doc.moveTo(margin, y + 10).lineTo(margin + 80, y + 10).strokeColor(TEAL).lineWidth(2).stroke();
    y += 14;
    doc.fillColor(NAVY).fontSize(15).font("Helvetica-Bold")
      .text(guestFull, margin, y, { width: panelX - margin - 20 });
    y += 22;
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
    y += 8;

    // ── KEY DATA GRID ────────────────────────────────────────────────────────
    const gridW = panelX - margin - 20;
    const cells: { label: string; value: string; icon?: string }[] = [
      { label: "FECHA",       value: fmtDate(appointment.appointmentDate) },
      { label: "HORARIO",     value: `${appointment.startTime} — ${appointment.endTime} hs` },
      { label: "TRATAMIENTO", value: appointment.treatment?.name || "—" },
      { label: "GABINETE",    value: appointment.cabin?.name || "—" },
    ];
    if (professional) {
      cells.push({ label: "PROFESIONAL", value: `${professional.name} ${professional.lastName || ""}`.trim() });
    }

    const cellH = 44;
    const cellPad = 8;
    cells.forEach((cell, i) => {
      const cx = margin;
      const cy = y + i * (cellH + 6);

      // Shadow effect
      doc.roundedRect(cx + 1, cy + 1, gridW, cellH, 5).fill("#f0f0f0");
      doc.roundedRect(cx, cy, gridW, cellH, 5).fillAndStroke("#ffffff", "#e8e8e8");

      // Accent left bar
      doc.roundedRect(cx, cy, 4, cellH, 2).fill(TEAL);

      doc.fillColor("#999999").fontSize(6.5).font("Helvetica-Bold")
        .text(cell.label, cx + 14, cy + cellPad, { characterSpacing: 0.8 });
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold")
        .text(cell.value, cx + 14, cy + cellPad + 14, { width: gridW - 20 });
    });

    y += cells.length * (cellH + 6) + 12;

    // ── NOTES ────────────────────────────────────────────────────────────────
    if (appointment.notes) {
      doc.roundedRect(margin, y, gridW, 12 + doc.heightOfString(appointment.notes, { width: gridW - 20 }) + 8, 5)
        .fillAndStroke("#fffbf0", "#ffe082");
      doc.fillColor("#888888").fontSize(7).font("Helvetica-Bold")
        .text("NOTAS", margin + 10, y + 8, { characterSpacing: 1 });
      doc.fillColor("#555555").fontSize(8.5).font("Helvetica")
        .text(appointment.notes, margin + 10, y + 19, { width: gridW - 20 });
      y += doc.heightOfString(appointment.notes, { width: gridW - 20 }) + 36;
    }

    // ── CHARGES / CUENTA ────────────────────────────────────────────────────
    if (account && account.items && account.items.length > 0) {
      doc.moveTo(margin, y).lineTo(panelX - 20, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
      y += 12;
      doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold").text("Detalle de servicios", margin, y);
      y += 18;

      // Table header
      const tW = gridW;
      doc.roundedRect(margin, y, tW, 18, 4).fill(NAVY);
      doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold");
      const thY = y + 5;
      doc.text("Descripción",   margin + 8, thY, { width: tW * 0.55 });
      doc.text("Cant.",         margin + 8, thY, { width: tW * 0.68, align: "right" });
      doc.text("P. Unit.",      margin + 8, thY, { width: tW * 0.82, align: "right" });
      doc.text("Total",         margin + 8, thY, { width: tW - 8,    align: "right" });
      y += 20;

      let totalItems = 0;
      for (const item of account.items) {
        const rowH = 18;
        doc.rect(margin, y, tW, rowH).fillAndStroke("#fafafa", "#eeeeee");
        doc.fillColor("#1a1a1a").fontSize(8).font("Helvetica")
          .text(item.description, margin + 8, y + 4, { width: tW * 0.55 });
        doc.text(String(item.quantity),                 margin + 8, y + 4, { width: tW * 0.68, align: "right" });
        doc.text(`$ ${fmtMoney(item.unitPrice)}`,       margin + 8, y + 4, { width: tW * 0.82, align: "right" });
        doc.text(`$ ${fmtMoney(item.subtotal)}`,        margin + 8, y + 4, { width: tW - 8,    align: "right" });
        totalItems += parseFloat(String(item.subtotal || "0"));
        y += rowH;
      }

      // Total row
      doc.roundedRect(margin, y + 2, tW, 20, 4).fill("#f0f4ff");
      doc.fillColor(NAVY).fontSize(9.5).font("Helvetica-Bold")
        .text("TOTAL", margin + 8, y + 6, { width: tW * 0.7 });
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold")
        .text(`$ ${fmtMoney(totalItems)}`, margin + 8, y + 6, { width: tW - 8, align: "right" });
      y += 28;
    }

    // ── FOOTER ───────────────────────────────────────────────────────────────
    const footerY = pageH - 55;
    doc.rect(0, footerY, pageW, 3).fill(ORANGE);
    doc.rect(0, footerY + 3, panelX, 52).fill(FOOTER_BG);

    doc.fillColor("white").fontSize(8.5).font("Helvetica-Bold")
      .text("MARAN SUITES & TOWERS — SPA", margin, footerY + 12, { width: panelX - margin * 2 });
    doc.fillColor("#aadddd").fontSize(7).font("Helvetica")
      .text(HOTEL_ADDRESS, margin, footerY + 25, { width: panelX - margin * 2 });
    doc.fillColor("#aadddd").fontSize(7).font("Helvetica")
      .text(`${HOTEL_EMAIL}  ·  ${HOTEL_PHONE}`, margin, footerY + 36, { width: panelX - margin * 2 });

    doc.fillColor("white").fontSize(9.5).font("Helvetica-Bold")
      .text(HOTEL_WEB, 0, footerY + 21, { width: panelX - margin, align: "right" });

    doc.end();
  });
}
