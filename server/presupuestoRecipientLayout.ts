import type PDFDocument from "pdfkit";

/** Measure with the same fonts and widths used to render the recipient block. */
export function presupuestoRecipientLayout(
  doc: InstanceType<typeof PDFDocument>,
  name: string,
  details: string,
  nameWidth: number,
  detailsWidth: number,
  nameTop: number,
  minimumHeight: number,
) {
  const nameHeight = doc.font("Helvetica-Bold").fontSize(12)
    .heightOfString(name, { width: nameWidth, characterSpacing: 0 });
  const detailsTop = nameTop + nameHeight + 5;
  const detailsHeight = details ? doc.font("Helvetica").fontSize(7)
    .heightOfString(details, { width: detailsWidth, characterSpacing: 0 }) : 0;
  return {
    nameHeight,
    detailsTop,
    detailsHeight,
    height: Math.max(minimumHeight, detailsTop + detailsHeight + 12),
  };
}
