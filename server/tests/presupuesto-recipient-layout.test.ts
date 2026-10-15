import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { presupuestoRecipientLayout } from "../presupuestoRecipientLayout";

describe("presupuesto: destinatario multilínea", () => {
  it.each([
    [220, 220, 20, 64],
    [220, 240, 20, 64],
    [250, 250, 22, 70],
  ])("separa nombre, datos y tabla con ancho %s/%s", (nameWidth, detailsWidth, nameTop, minimumHeight) => {
    const doc = new PDFDocument();
    const name = "Coordinación de DDHH Municipalidad de Paraná";
    const details = "CUIT: 30-12345678-9 · Dirección: PALACIO MUNICIPAL CALLE URQUIZA Y CORRIENTES · Contacto: Lic. Nora Pereira";
    const layout = presupuestoRecipientLayout(doc, name, details, nameWidth, detailsWidth, nameTop, minimumHeight);
    doc.font("Helvetica-Bold").fontSize(12).text(name, 52, 100 + nameTop, { width: nameWidth, characterSpacing: 0 });
    expect(layout.nameHeight).toBeGreaterThan(20);
    expect(100 + layout.detailsTop).toBeGreaterThan(doc.y);
    doc.font("Helvetica").fontSize(7).text(details, 52, 100 + layout.detailsTop, { width: detailsWidth, characterSpacing: 0 });
    expect(100 + layout.height).toBeGreaterThanOrEqual(doc.y + 12 - 0.001);
    doc.end();
  });

  it("conserva el alto mínimo para un destinatario corto sin datos adicionales", () => {
    const doc = new PDFDocument();
    expect(presupuestoRecipientLayout(doc, "Ana Pérez", "", 220, 220, 20, 64).height).toBe(64);
    doc.end();
  });
});
