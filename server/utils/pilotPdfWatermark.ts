import { isPilotEnv } from "../app-env";

/**
 * Fase 5 (indicadores visuales del ambiente piloto): marca de agua diagonal
 * de baja opacidad en los PDFs generados, además de la marca ya existente de
 * "comprobante ficticio" (que depende del dato `modoFicticio` de cada
 * factura, no de APP_ENV). Se aplica a la página actual y se re-aplica en
 * cada página nueva vía el evento `pageAdded`, para cubrir documentos
 * multi-página.
 *
 * No-op fuera de APP_ENV=pilot.
 */
export function applyPilotPdfWatermark(doc: PDFKit.PDFDocument): void {
  if (!isPilotEnv()) return;

  const draw = () => {
    const { width, height } = doc.page;
    doc.save();
    doc.rotate(-45, { origin: [width / 2, height / 2] });
    doc
      .font("Helvetica-Bold")
      .fontSize(54)
      .fillColor("#cc0000", 0.12)
      .text("AMBIENTE PILOTO — DATOS DE PRUEBA", -width / 4, height / 2 - 30, {
        width: width * 1.5,
        align: "center",
      });
    doc.restore();
    doc.fillColor("#000000").fillOpacity(1);
  };

  draw();
  doc.on("pageAdded", draw);
}
