import fs from "node:fs";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./db-storage";
import {
  reservations,
  guests,
  rooms,
  roomTypes,
  type Reservation,
  type Guest,
} from "@shared/schema";
import { getOperationalReservationCharges } from "@shared/reservationFolio";
import { assetPath } from "./utils/assetPath";
import { formatArgentinaDate } from "./utils/argentinaDateTime";

const HOTEL_NAME = "Maran Suites & Towers";

function fmtDatePdf(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function fmtMoneyPdf(v: any): string {
  const n = parseFloat(String(v ?? 0));
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}
function extractPackageName(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/\[?\s*Paquete\s*:\s*([^\]\n]+?)(?:\]|$)/i);
  return match?.[1]?.trim() || null;
}
function nightCount(checkIn: string, checkOut: string): number {
  return Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );
}
/** Shared by the authenticated download and the automatic confirmation email. */
export async function generateReservationConfirmationPdf(
  reservationId: string,
  snapshot?: { reservation: Reservation; guest: Guest | null | undefined },
) {
  if (
    snapshot &&
    (snapshot.reservation.id !== reservationId ||
      (snapshot.guest && snapshot.guest.id !== snapshot.reservation.guestId))
  )
    throw new Error("La confirmación no corresponde a esta reserva");
  const [reservation] = snapshot
    ? [snapshot.reservation]
    : await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, reservationId));
  if (!reservation) return null;

  const [guest] = snapshot
    ? [snapshot.guest]
    : reservation.guestId
      ? await db.select().from(guests).where(eq(guests.id, reservation.guestId))
      : [null];
  const [room] =
    !reservation.roomTypeId && reservation.roomId
      ? await db.select().from(rooms).where(eq(rooms.id, reservation.roomId))
      : [null];
  const roomTypeId = reservation.roomTypeId || room?.roomTypeId;
  const [roomType] = roomTypeId
    ? await db.select().from(roomTypes).where(eq(roomTypes.id, roomTypeId))
    : [null];

  const guestName = guest
    ? `${guest.lastName?.toUpperCase() || ""} ${guest.firstName || ""}`.trim()
    : "Huésped";
  const nights = nightCount(reservation.checkInDate, reservation.checkOutDate);
  const totalAlojamiento = parseFloat(reservation.totalRoomAmount || "0");
  const ratePerNight = parseFloat(String(reservation.finalRatePerNight || 0));
  const packageName = extractPackageName(reservation.notes);
  const activeCharges = getOperationalReservationCharges(
    await storage.getCharges(reservation.id),
  );
  const totalAdicionales = activeCharges.reduce(
    (sum, charge) => sum + parseFloat(String(charge.amount || 0)),
    0,
  );
  const totalReserva = totalAlojamiento + totalAdicionales;
  const additionalDetails = activeCharges
    .map((charge) => `${charge.description} — ${fmtMoneyPdf(charge.amount)}`)
    .join("  ·  ");

  const doc = new PDFDocument({ margin: 0, size: "A4" });
  const code = String(reservation.reservationCode || reservation.id).replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
  const filename = `Confirmacion-${code}.pdf`;
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });

  // Handle an early stream error even while terms are being loaded.
  void finished.catch(() => undefined);
  try {
    const pageW = 595;
    const pageH = 842;
    const margin = 40;
    const contentW = pageW - margin * 2; // 515
    const NAVY = "#1a3a6c";
    const ORANGE = "#e8841a";
    const FOOTER_BG = "#8b4513";

    // ── FULL PAGE TEMPLATE BACKGROUND ─────────────────────────────────────
    // The template image includes the skyline header, orange stripe, white content
    // area, and footer with the white Maran logo. We use it as a full-page background
    // so all branding elements appear correctly without needing to draw them manually.
    const headerH = 165;
    const headerImgPath = assetPath("confirmacion-header.jpg");
    if (fs.existsSync(headerImgPath)) {
      doc.image(headerImgPath, 0, 0, { width: pageW, height: pageH });
    } else {
      doc.rect(0, 0, pageW, headerH).fill(NAVY);
      doc.rect(0, headerH - 6, pageW, 6).fill(ORANGE);
      doc.rect(0, pageH - 90, pageW, 90).fill(FOOTER_BG);
    }

    let y = headerH + 16;

    // ── TITLE ROW ─────────────────────────────────────────────────────────
    // Left: label + hotel name + subtitle
    doc
      .fillColor("#888888")
      .fontSize(7)
      .font("Helvetica")
      .text("CONFIRMACIÓN DE RESERVA", margin, y, { characterSpacing: 2 });
    y += 11;
    doc
      .fillColor("#1a1a1a")
      .fontSize(17)
      .font("Helvetica-Bold")
      .text(HOTEL_NAME, margin, y, { width: 300 });
    y += 22;
    doc
      .fillColor("#666666")
      .fontSize(8.5)
      .font("Helvetica")
      .text("Hotel & Spa · Paraná, Entre Ríos", margin, y);

    // Right: reservation code box (includes status badge inside)
    const codeBoxW = 138;
    const codeBoxX = pageW - margin - codeBoxW;
    const codeBoxY = headerH + 16;
    doc
      .roundedRect(codeBoxX, codeBoxY, codeBoxW, 60, 5)
      .fillAndStroke("#f8f4ef", ORANGE);
    doc
      .fillColor("#888888")
      .fontSize(7)
      .font("Helvetica")
      .text("N° DE RESERVA", codeBoxX, codeBoxY + 7, {
        width: codeBoxW,
        align: "center",
        characterSpacing: 0.5,
      });
    doc
      .fillColor("#333333")
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(
        reservation.reservationCode || reservation.id,
        codeBoxX,
        codeBoxY + 18,
        { width: codeBoxW, align: "center" },
      );
    // Status badge — inside the box
    const badgeX = codeBoxX + 20;
    const badgeW = codeBoxW - 40;
    doc
      .roundedRect(badgeX, codeBoxY + 33, badgeW, 13, 6)
      .fillAndStroke("#e8f5e9", "#a5d6a7");
    doc
      .fillColor("#2e7d32")
      .fontSize(6.5)
      .font("Helvetica-Bold")
      .text("CONFIRMADA", badgeX, codeBoxY + 36, {
        width: badgeW,
        align: "center",
        characterSpacing: 0.5,
      });
    doc
      .fillColor("#aaaaaa")
      .fontSize(7)
      .font("Helvetica")
      .text(
        `Emitida: ${formatArgentinaDate(new Date())}`,
        codeBoxX,
        codeBoxY + 49,
        { width: codeBoxW, align: "center" },
      );

    y += 20;

    // ── SEPARATOR (stops before the code box) ─────────────────────────────
    doc
      .moveTo(margin, y)
      .lineTo(codeBoxX - 10, y)
      .strokeColor("#e0e0e0")
      .lineWidth(0.5)
      .stroke();
    y += 12;

    // ── DATES GRID (4 cells) ──────────────────────────────────────────────
    const gridH = 46;
    const cellW = contentW / 4;
    const gridCells = [
      { label: "CHECK-IN", value: fmtDatePdf(reservation.checkInDate) },
      { label: "CHECK-OUT", value: fmtDatePdf(reservation.checkOutDate) },
      { label: "NOCHES", value: String(nights) },
      { label: "HUÉSPEDES", value: String(reservation.numberOfGuests || 1) },
    ];
    doc
      .roundedRect(margin, y, contentW, gridH, 6)
      .fillAndStroke("#ffffff", "#dddddd");
    gridCells.forEach((cell, i) => {
      const cx = margin + i * cellW;
      if (i > 0) {
        doc
          .moveTo(cx, y + 7)
          .lineTo(cx, y + gridH - 7)
          .strokeColor("#dddddd")
          .lineWidth(0.5)
          .stroke();
      }
      doc
        .fillColor("#999999")
        .fontSize(7)
        .font("Helvetica-Bold")
        .text(cell.label, cx + 4, y + 9, {
          width: cellW - 8,
          align: "center",
          characterSpacing: 0.3,
        });
      doc
        .fillColor(NAVY)
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(cell.value, cx + 4, y + 24, {
          width: cellW - 8,
          align: "center",
        });
    });
    y += gridH + 12;

    // ── TWO COLUMNS: GUEST + ROOM ─────────────────────────────────────────
    const colGap = 12;
    const colW = (contentW - colGap) / 2;
    const col2X = margin + colW + colGap;
    const boxH = 90;

    const drawColBox = (
      bx: number,
      by: number,
      bw: number,
      bh: number,
      title: string,
    ) => {
      doc.roundedRect(bx, by, bw, bh, 6).fillAndStroke("#f8f9fa", "#eeeeee");
      doc
        .fillColor("#888888")
        .fontSize(7)
        .font("Helvetica-Bold")
        .text(title, bx + 12, by + 10, { characterSpacing: 1 });
      doc
        .moveTo(bx + 12, by + 21)
        .lineTo(bx + 12 + title.length * 5.2, by + 21)
        .strokeColor(ORANGE)
        .lineWidth(2)
        .stroke();
    };

    // Guest box
    drawColBox(margin, y, colW, boxH, "HUÉSPED PRINCIPAL");
    doc
      .fillColor("#111111")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(guestName, margin + 12, y + 27, { width: colW - 24 });
    let guestInfoY = y + 43;
    if (guest?.documentNumber) {
      doc
        .fillColor("#555555")
        .fontSize(8.5)
        .font("Helvetica")
        .text(`DNI: ${guest.documentNumber}`, margin + 12, guestInfoY);
      guestInfoY += 12;
    }
    if (guest?.email) {
      doc
        .fillColor("#555555")
        .fontSize(8.5)
        .font("Helvetica")
        .text(guest.email, margin + 12, guestInfoY, { width: colW - 24 });
      guestInfoY += 12;
    }
    if (guest?.phone) {
      doc
        .fillColor("#555555")
        .fontSize(8.5)
        .font("Helvetica")
        .text(guest.phone, margin + 12, guestInfoY, { width: colW - 24 });
    }

    // Room box
    drawColBox(col2X, y, colW, boxH, "TIPO DE HABITACIÓN");
    doc
      .fillColor("#111111")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(roomType?.name || "—", col2X + 12, y + 27, { width: colW - 24 });

    // Rate per night
    doc
      .fillColor("#555555")
      .fontSize(9)
      .font("Helvetica")
      .text("Tarifa por noche", col2X + 12, y + 50);
    doc
      .fillColor("#333333")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(fmtMoneyPdf(ratePerNight), col2X + 12, y + 50, {
        width: colW - 24,
        align: "right",
      });

    // Divider + total
    doc
      .moveTo(col2X + 12, y + 64)
      .lineTo(col2X + colW - 12, y + 64)
      .strokeColor("#dddddd")
      .lineWidth(0.5)
      .stroke();
    doc
      .fillColor(NAVY)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(
        `Total (${nights} noche${nights !== 1 ? "s" : ""})`,
        col2X + 12,
        y + 68,
      );
    doc
      .fillColor(NAVY)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(fmtMoneyPdf(totalAlojamiento), col2X + 12, y + 68, {
        width: colW - 24,
        align: "right",
      });

    // Early / Late extras
    const extras: string[] = [];
    if (reservation.earlyCheckIn && reservation.earlyCheckInTime)
      extras.push(
        `Early Check-in ${reservation.earlyCheckInTime} hs (+${fmtMoneyPdf(reservation.earlyCheckInCharge)})`,
      );
    if (reservation.lateCheckOut && reservation.lateCheckOutTime)
      extras.push(
        `Late Check-out ${reservation.lateCheckOutTime} hs (+${fmtMoneyPdf(reservation.lateCheckOutCharge)})`,
      );
    if (extras.length > 0) {
      doc
        .fillColor("#888888")
        .fontSize(7.5)
        .font("Helvetica")
        .text(extras.join("  ·  "), col2X + 12, y + 81, { width: colW - 24 });
    }

    y += boxH + 12;

    // ── RESERVATION DETAILS / EXTRAS ────────────────────────────────────────
    // Keep reservation-specific information separate from the general terms.
    // The two-column layout keeps this block short even when the reservation
    // has several extras, helping the confirmation remain on one page.
    if (packageName || activeCharges.length > 0) {
      const detailLeft = [
        packageName ? `Paquete: ${packageName}` : null,
        additionalDetails ? `Adicionales: ${additionalDetails}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const detailsLeftW = contentW * 0.62;
      const detailTextH = doc.heightOfString(detailLeft, {
        width: detailsLeftW - 24,
      });
      const detailBodyH = Math.max(44, detailTextH + 14);
      const detailHeaderH = 20;
      const detailBoxH = detailHeaderH + detailBodyH;

      doc
        .roundedRect(margin, y, contentW, detailBoxH, 6)
        .fillAndStroke("#f5f8fb", "#dfe5eb");
      doc.roundedRect(margin, y, contentW, detailHeaderH, 6).fill("#eaf0f6");
      doc.rect(margin, y + 10, contentW, 10).fill("#eaf0f6");
      doc
        .fillColor(NAVY)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("DETALLE DE LA RESERVA", margin + 12, y + 7, {
          characterSpacing: 1.2,
        });

      const detailsY = y + detailHeaderH + 7;
      if (detailLeft) {
        doc
          .fillColor("#444444")
          .fontSize(8.5)
          .font("Helvetica")
          .text(detailLeft, margin + 12, detailsY, {
            width: detailsLeftW - 24,
            lineGap: 2,
          });
      }

      const totalsX = margin + detailsLeftW;
      const totalsW = contentW - detailsLeftW;
      doc
        .fillColor("#666666")
        .fontSize(7.5)
        .font("Helvetica")
        .text("Total alojamiento", totalsX, detailsY, { width: totalsW - 12 });
      doc
        .fillColor("#444444")
        .fontSize(8)
        .font("Helvetica-Bold")
        .text(fmtMoneyPdf(totalAlojamiento), totalsX, detailsY, {
          width: totalsW - 12,
          align: "right",
        });
      doc
        .fillColor("#666666")
        .fontSize(7.5)
        .font("Helvetica")
        .text("Total adicionales", totalsX, detailsY + 12, {
          width: totalsW - 12,
        });
      doc
        .fillColor("#444444")
        .fontSize(8)
        .font("Helvetica-Bold")
        .text(fmtMoneyPdf(totalAdicionales), totalsX, detailsY + 12, {
          width: totalsW - 12,
          align: "right",
        });
      doc
        .moveTo(totalsX, detailsY + 25)
        .lineTo(margin + contentW - 12, detailsY + 25)
        .strokeColor("#d5dde5")
        .lineWidth(0.5)
        .stroke();
      doc
        .fillColor(NAVY)
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text("TOTAL A PAGAR", totalsX, detailsY + 29, { width: totalsW - 12 });
      doc
        .fillColor(NAVY)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(fmtMoneyPdf(totalReserva), totalsX, detailsY + 28, {
          width: totalsW - 12,
          align: "right",
        });

      y += detailBoxH + 10;
    }

    // ── TÉRMINOS Y CONDICIONES ────────────────────────────────────────────
    const DEFAULT_TERMINOS = [
      "La tarifa incluye desayuno buffet y gimnasio con turno previo.",
      "La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.",
      "Nuestro horario de Check-in es a partir de las 15:00 hs y el Check-out es hasta las 10:00 hs.",
      "Early Check-in o Late Check-out tienen costo adicional del 50% del valor de una noche.",
      "Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI / PASAPORTE / CÉDULA DE IDENTIDAD. En el caso de viajar con menores de edad deberá presentar su correspondiente identificación.",
      "La entrega de la habitación queda condicionada al pago total del alojamiento al momento del check-in. Los comprobantes, constancias de transferencia, capturas de pantalla o avisos de pago no constituyen pago válido hasta la efectiva acreditación del importe en los medios de cobro habilitados por el hotel. Ante la falta de acreditación, el hotel podrá exigir el pago por otro medio aceptado y suspender el ingreso a la habitación hasta la regularización total del saldo correspondiente.",
    ];
    let terminos = DEFAULT_TERMINOS;
    try {
      const termSetting = await storage.getSystemSetting("confirmation_terms");
      if (termSetting?.value) {
        const lines = termSetting.value
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        if (lines.length > 0) terminos = lines;
      }
    } catch (_) {
      // fallback to default
    }

    // Pre-calculate T&C body height using the same font, width and numbered
    // text that will be rendered below. This keeps the border tight around
    // the terms instead of extending into the greeting area.
    const termTextWidth = contentW - 28;
    doc.font("Helvetica").fontSize(8);
    let tcBodyH = 10;
    for (const [i, t] of terminos.entries()) {
      const termLine = `${i + 1}.  ${t}`;
      tcBodyH += doc.heightOfString(termLine, { width: termTextWidth }) + 6;
    }
    const tcH = 22 + tcBodyH + 8;

    // Box border
    doc.roundedRect(margin, y, contentW, tcH, 6).stroke("#e0e0e0");
    // Navy header band
    doc.roundedRect(margin, y, contentW, 22, 6).fill(NAVY);
    doc.rect(margin, y + 12, contentW, 10).fill(NAVY); // fill bottom corners of header
    doc
      .fillColor("#ffffff")
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .text("TÉRMINOS Y CONDICIONES", margin + 14, y + 8, {
        characterSpacing: 1.5,
        width: contentW - 28,
      });

    let ty = y + 26;
    terminos.forEach((t, i) => {
      const termLine = `${i + 1}.  ${t}`;
      doc
        .fillColor("#333333")
        .fontSize(8)
        .font("Helvetica")
        .text(termLine, margin + 14, ty, { width: termTextWidth });
      ty += doc.heightOfString(termLine, { width: termTextWidth }) + 6;
    });
    // Deja un renglón de aire entre el borde inferior del recuadro de
    // Términos y el saludo — sin esto ambos quedan pegados (ver reporte de
    // usuario: el texto "choca" contra el recuadro de arriba).
    y = ty + 14 + 14;

    // ── GREETING ─────────────────────────────────────────────────────────
    if (y < pageH - 88) {
      const greetingText = `Estimado/a ${guestName}, gracias por elegirnos. Le esperamos con mucho gusto en nuestro establecimiento.\nAnte cualquier consulta no dude en contactarnos.`;
      doc
        .fillColor("#666666")
        .fontSize(9)
        .font("Helvetica")
        .text(greetingText, margin, y, { width: contentW, align: "center" });
      const greetingH = doc.heightOfString(greetingText, { width: contentW });
      doc
        .fillColor("#8a8a8a")
        .fontSize(7.5)
        .font("Helvetica-Oblique")
        .text(
          "Recomendamos no imprimir esta información por políticas de sustentabilidad.",
          margin,
          y + greetingH + 6,
          { width: contentW, align: "center" },
        );
    }
    const _confTs = formatArgentinaDate(new Date());
    doc
      .fontSize(6)
      .font("Helvetica")
      .fillColor("#aaaaaa")
      .text(
        `Generado el ${_confTs} | Maran Suites & Towers`,
        margin,
        pageH - 20,
        { align: "center", width: contentW },
      );

    doc.end();
    return {
      filename,
      content: await finished,
      roomTypeName: roomType?.name || "Categoría reservada",
    };
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
