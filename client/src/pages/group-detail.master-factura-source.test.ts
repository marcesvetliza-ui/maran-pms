import { describe, expect, it } from "vitest";
import { resolveMasterFacturaSource, type MasterFacturaSourceState } from "./group-detail";

// Regression test for the bug where the shared "showMasterFacturaDialog" invoice dialog
// (opened both from the legacy "Pago al Folio Maestro" flow and from the "Aplicar al Folio
// Maestro" destino inside the unified "Pago Grupal" dialog) always read the legacy
// masterPayment* state regardless of which flow actually registered the payment. Any future
// change to resolveMasterFacturaSource, or a new consumer that bypasses it, must keep these
// two flows fully isolated from each other.

const groupState: MasterFacturaSourceState = {
  receiptType: "factura_b",
  paymentRows: [{ amount: "1000" }, { amount: "500" }],
  items: [{ descripcion: "Pago grupal ítem", cantidad: 1, precioUnitario: 1500, alicuotaIva: "21", subtotalNeto: 1239.67, subtotal: 1500 }],
  razonSocial: "Grupo Receptor SA",
  cuit: "30-11111111-1",
  condicionIva: "Responsable Inscripto",
  domicilio: "Calle Grupal 123",
};

const masterState: MasterFacturaSourceState = {
  receiptType: "factura_a",
  paymentRows: [{ amount: "2000" }],
  items: [{ descripcion: "Pago folio maestro ítem", cantidad: 1, precioUnitario: 2000, alicuotaIva: "21", subtotalNeto: 1652.89, subtotal: 2000 }],
  razonSocial: "Empresa Maestro SRL",
  cuit: "30-22222222-2",
  condicionIva: "Monotributista",
  domicilio: "Calle Maestro 456",
};

const defaultDescripcion = { fromGroupDialog: "Pago grupal — Grupo Test", fromMasterDialog: "Pago Folio Maestro — Grupo Test" };

describe("resolveMasterFacturaSource", () => {
  it("reads exclusively from the Pago Grupal state when the payment came from that flow", () => {
    const result = resolveMasterFacturaSource(true, groupState, masterState, defaultDescripcion);

    expect(result.effectiveReceiptType).toBe("factura_b");
    expect(result.totalPaid).toBe(1500);
    expect(result.effectiveItems).toBe(groupState.items);
    expect(result.effectiveRazonSocial).toBe("Grupo Receptor SA");
    expect(result.effectiveCuit).toBe("30-11111111-1");
    expect(result.effectiveCondicionIva).toBe("Responsable Inscripto");
    expect(result.effectiveDomicilio).toBe("Calle Grupal 123");
    expect(result.defaultDescripcion).toBe("Pago grupal — Grupo Test");
  });

  it("reads exclusively from the legacy Pago al Folio Maestro state when the payment came from that flow", () => {
    const result = resolveMasterFacturaSource(false, groupState, masterState, defaultDescripcion);

    expect(result.effectiveReceiptType).toBe("factura_a");
    expect(result.totalPaid).toBe(2000);
    expect(result.effectiveItems).toBe(masterState.items);
    expect(result.effectiveRazonSocial).toBe("Empresa Maestro SRL");
    expect(result.effectiveCuit).toBe("30-22222222-2");
    expect(result.effectiveCondicionIva).toBe("Monotributista");
    expect(result.effectiveDomicilio).toBe("Calle Maestro 456");
    expect(result.defaultDescripcion).toBe("Pago Folio Maestro — Grupo Test");
  });

  it("never mixes fields across flows even when only one side has data (stale/empty legacy state)", () => {
    const emptyMasterState: MasterFacturaSourceState = {
      receiptType: "none",
      paymentRows: [],
      items: [],
      razonSocial: "",
      cuit: "",
      condicionIva: "",
      domicilio: "",
    };

    // This is exactly the shipped bug scenario: the Pago Grupal flow ran and produced a
    // real payment, but the legacy masterPayment* state is empty/stale because that dialog
    // was never opened this session. The resolver must still surface the Pago Grupal data.
    const result = resolveMasterFacturaSource(true, groupState, emptyMasterState, defaultDescripcion);

    expect(result.effectiveReceiptType).toBe("factura_b");
    expect(result.totalPaid).toBe(1500);
    expect(result.effectiveRazonSocial).toBe("Grupo Receptor SA");
  });
});
