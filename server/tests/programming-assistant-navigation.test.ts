import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { CodeSource } from "../../services/programming-assistant/source";
import { orientInvestigation } from "../../services/programming-assistant/navigation";
import type { SupportTicket } from "../../shared/programming-support";
describe("code navigation", () => {
  it("orients the user's exact invoice case even when the selected module is otro", async () => {
    const source=new CodeSource(process.cwd(),"a".repeat(40));
    const result=await orientInvestigation({module:"otro",title:"Descuento general y descuentos",actual:"Factura A con neto $1.000, IVA $210. Diez unidades a $100 cada una. Descuento general del 10 % y edito y guardo nuevamente.",expected:"Total de $1.089. El costo del artículo debe conservarse en $100 por unidad.",steps:"",messages:[]} as SupportTicket,source);
    expect(result.initialReads.map(r=>r.path)).toContain("shared/purchaseInvoiceDiscount.ts");
    expect(result.initialReads.map(r=>r.path)).toContain("server/purchase-invoice-stock.ts");
    expect(result.initialReads.map(r=>r.path)).toContain("server/tests/purchase-invoice-discount.test.ts");
    expect(result.initialReads[0].content).toContain("restorePurchaseDiscount");
  });
  it("does not route a reservation discount into purchase invoices", async () => {
    const source=new CodeSource(process.cwd(),"a".repeat(40));
    const result=await orientInvestigation({module:"otro",title:"Descuento general",actual:"Reserva de habitación con descuento",expected:"Conservar la tarifa",steps:"",messages:[]} as SupportTicket,source);
    expect(result.initialReads).toEqual([]);
  });
  it("provides pending production and its existing tests without needing a module selection", async () => {
    const source=new CodeSource(process.cwd(),"a".repeat(40));
    const result=await orientInvestigation({module:"otro",title:"Reintento de producción",actual:"Falta materia prima y dos usuarios reintentan",expected:"Sin movimientos duplicados",steps:"",messages:[]} as SupportTicket,source);
    expect(result.initialReads.map(r=>r.path)).toEqual(["server/productionPending.ts","server/production.ts","server/tests/production-workflow.pg.test.ts"]);
  });
  it("distributes content matches across backend, shared calculations, frontend and tests", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "assistant-nav-"));
    try {
      for (const dir of ["server/tests", "shared", "client/src"])
        await mkdir(path.join(root, dir), { recursive: true });
      await writeFile(
        path.join(root, "client/src/noisy.ts"),
        "discount\n".repeat(50),
      );
      await writeFile(path.join(root, "server/endpoint.ts"), "apply discount");
      await writeFile(
        path.join(root, "shared/purchaseInvoiceDiscount.ts"),
        "calculate discount",
      );
      await writeFile(
        path.join(root, "server/tests/purchase-invoice-discount.test.ts"),
        "expect discount",
      );
      const source = new CodeSource(root, "a".repeat(40));
      const matches = await source.search("discount");
      expect(new Set(matches.matches.map((m) => m.path)).size).toBe(4);
      expect(
        matches.matches.filter((m) => m.path === "client/src/noisy.ts"),
      ).toHaveLength(4);
      expect(source.readRanges.size).toBe(0); // Search results alone cannot validate citations.
      expect(
        (await source.findFiles("purchase-invoice-discount")).files,
      ).toContain("shared/purchaseInvoiceDiscount.ts");
      const orientation = await orientInvestigation(
        {
          title: "Descuento de compras",
          actual: "Compra de proveedor",
          expected: "Costo sin cambios",
          steps: "",
          module: "administracion",
          messages: [],
        } as SupportTicket,
        source,
      );
      expect(orientation.initialReads.map((r) => r.path)).toEqual([
        "shared/purchaseInvoiceDiscount.ts",
        "server/tests/purchase-invoice-discount.test.ts",
      ]);
      expect(
        source.validates({
          path: "shared/purchaseInvoiceDiscount.ts",
          start: 1,
          end: 1,
        }),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("locates the real purchase calculation, inventory update and regression tests", async () => {
    const source = new CodeSource(process.cwd(), "a".repeat(40));
    const result = await orientInvestigation(
      {
        title: "Descuento de compras y costo de artículos",
        actual: "Descuento general de una factura de compra",
        expected: "Conservar costo individual",
        module: "administracion",
        steps: "",
        messages: [],
      } as SupportTicket,
      source,
    );
    expect(result.initialReads.map((r) => r.path)).toEqual([
      "shared/purchaseInvoiceDiscount.ts",
      "server/purchase-invoice-stock.ts",
      "server/tests/purchase-invoice-discount.test.ts",
    ]);
    expect(result.initialReads[0].content).toContain("applyPurchaseDiscount");
    expect(result.initialReads[1].content).toContain("row.unitCost > 0");
    expect(result.candidateFiles).toContain(
      "client/src/pages/purchase-invoices.tsx",
    );
  });
});
