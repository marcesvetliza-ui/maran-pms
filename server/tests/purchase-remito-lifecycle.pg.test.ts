import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
let db: typeof import("../db").db;
let updatePurchaseRemito: typeof import("../purchase-remito").updatePurchaseRemito;
let enterPurchaseInvoiceStock: typeof import("../purchase-invoice-stock").enterPurchaseInvoiceStock;
let createPaymentOrder: typeof import("../paymentOrder").createPaymentOrder;
let assertPurchaseInvoiceNotDuplicate: typeof import("../purchase-invoice-duplicates").assertPurchaseInvoiceNotDuplicate;

const suite = process.env.DATABASE_URL ? describe : describe.skip;
async function fixture(run: (tx: any, data: any) => Promise<void>) {
  const rollback = new Error("rollback fixture");
  try {
    await db.transaction(async tx => {
      const expense = (await tx.execute(sql`INSERT INTO accounting_accounts(codigo,nombre,tipo) VALUES(${randomUUID()},'Gasto prueba','egreso') RETURNING id`)).rows[0].id;
      for (const [code, name, type] of [["2.1.1.01", "Proveedores", "pasivo"], ["1.1.1.01", "Caja", "activo"], ["1.1.4.07.01", "IVA", "activo"]]) await tx.execute(sql`INSERT INTO accounting_accounts(codigo,nombre,tipo) VALUES(${code},${name},${type}) ON CONFLICT(codigo) DO NOTHING`);
      const supplier = (await tx.execute(sql`INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva) VALUES('Proveedor prueba',${randomUUID()},'responsable_inscripto') RETURNING id`)).rows[0].id;
      const item = (await tx.execute(sql`INSERT INTO inventory_items(name,unit,cost_price) VALUES('Artículo','unidad',1200) RETURNING id`)).rows[0].id;
      const warehouse = (await tx.execute(sql`INSERT INTO inventory_warehouses(name) VALUES('Depósito prueba') RETURNING id`)).rows[0].id;
      const number = randomUUID();
      const invoice = (await tx.execute(sql`INSERT INTO purchase_invoices(tipo_comprobante,supplier_id,numero_comprobante,fecha_emision,periodo,monto_neto,monto_total,saldo_pendiente,estado,condicion_pago,cuenta_contable_id) VALUES('REMITO',${supplier},${number},'2026-11-03','11/2026',0,0,0,'pagado','contado',${expense}) RETURNING id`)).rows[0].id;
      await enterPurchaseInvoiceStock(tx as any, Number(invoice), Number(supplier), [{ itemId: String(item), warehouseId: String(warehouse), quantity: 2, unitCost: 1200, vatRate: null }], "Remito prueba");
      await run(tx, { invoice: Number(invoice), supplier: Number(supplier), item, number, expense });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}

suite("Remito: stock, deuda, pagos y factura en una transacción", () => {
  beforeAll(async () => {
    ({ db } = await import("../db"));
    ({ updatePurchaseRemito } = await import("../purchase-remito"));
    ({ enterPurchaseInvoiceStock } = await import("../purchase-invoice-stock"));
    ({ createPaymentOrder } = await import("../paymentOrder"));
    ({ assertPurchaseInvoiceNotDuplicate } = await import("../purchase-invoice-duplicates"));
  });
  it("cambia de uso sin tocar stock y revierte el asiento anterior sin borrarlo", async () => fixture(async (tx, f) => {
    const nf = await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    expect(Number(nf.monto_total)).toBe(2400); expect(nf.estado).toBe("pendiente");
    const delivery = await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO" });
    expect(Number(delivery.saldo_pendiente)).toBe(0); expect(delivery.asiento_id).toBeNull();
    expect((await tx.execute(sql`SELECT id FROM accounting_entries WHERE id=${nf.asiento_id}`)).rows).toHaveLength(1);
    await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    expect(Number((await tx.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${f.item}`)).rows[0].current_stock)).toBe(2);
    expect((await tx.execute(sql`SELECT id FROM stock_movements WHERE source_id=${String(f.invoice)}`)).rows).toHaveLength(1);
  }));

  it("vincula una factura conservando el pago parcial, el ingreso y el historial", async () => fixture(async (tx, f) => {
    // Other suites may already have supplier entries: assert this transaction's delta.
    const openingLedger = (await tx.execute(sql`SELECT coalesce(sum(l.haber-l.debe),0) AS balance FROM accounting_entry_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE a.codigo='2.1.1.01'`)).rows[0];
    await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    await createPaymentOrder(tx, { supplierId: f.supplier, facturaIds: [f.invoice], formaPago: "efectivo", efectivo: 1000, montoParcial: 1000 }, () => "2026-11-03");
    await expect(updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO" })).rejects.toThrow("pagos aplicados");
    const invoice = await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "FACT-A", supplierId: f.supplier, numeroComprobante: "123", puntoVenta: "1", fechaEmision: "2026-11-03", periodo: "11/2026", montoNeto: "2000", montoIva21: "420", cuentaContableId: f.expense, stockItems: [], formasPago: [] }, "admin-test", true);
    expect(invoice.id).toBe(f.invoice); expect(invoice.tipo_comprobante).toBe("FACT-A");
    expect(Number(invoice.saldo_pendiente)).toBe(1420); expect(invoice.estado).toBe("parcial");
    expect(invoice.special_details.remitoHistory.at(-1).previous.tipo_comprobante).toBe("REMITO-NF");
    expect((await tx.execute(sql`SELECT invoice_id,importe_cancelado FROM payment_order_items WHERE invoice_id=${f.invoice}`)).rows).toMatchObject([{ invoice_id: f.invoice, importe_cancelado: "1000.00" }]);
    expect((await tx.execute(sql`SELECT id FROM stock_movements WHERE source_type='purchase_invoice' AND source_id=${String(f.invoice)}`)).rows).toHaveLength(1);
    expect((await tx.execute(sql`SELECT id FROM purchase_invoice_lines WHERE invoice_id=${f.invoice}`)).rows).toHaveLength(1);
    const ledger = (await tx.execute(sql`SELECT sum(l.haber-l.debe) AS balance FROM accounting_entry_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE a.codigo='2.1.1.01'`)).rows[0];
    expect(Number(ledger.balance) - Number(openingLedger.balance)).toBe(1420);
    await expect(assertPurchaseInvoiceNotDuplicate(tx, { supplierId: f.supplier, tipoComprobante: "REMITO", numeroComprobante: f.number })).rejects.toThrow("duplicados");
    await expect(updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "FACT-A" }, undefined, true)).rejects.toThrow("cambió de estado");
  }));

  it("rechaza transferencia antes de crear OP o cancelar deuda", async () => fixture(async (tx, f) => {
    await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    await expect(createPaymentOrder(tx, { supplierId: f.supplier, facturaIds: [f.invoice], formaPago: "transferencia", depBancario: 2400 }, () => "2026-11-03")).rejects.toThrow("únicamente en efectivo");
    expect((await tx.execute(sql`SELECT id FROM payment_order_items WHERE invoice_id=${f.invoice}`)).rows).toHaveLength(0);
    expect(Number((await tx.execute(sql`SELECT saldo_pendiente FROM purchase_invoices WHERE id=${f.invoice}`)).rows[0].saldo_pendiente)).toBe(2400);
  }));

  it("la factura de un remito totalmente pagado queda saldada sin otra OP", async () => fixture(async (tx, f) => {
    await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    await createPaymentOrder(tx, { supplierId: f.supplier, facturaIds: [f.invoice], formaPago: "efectivo", efectivo: 2400 }, () => "2026-11-03");
    const invoice = await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "FACT-A", numeroComprobante: "456", fechaEmision: "2026-11-03", montoNeto: 2400 }, undefined, true);
    expect(invoice.estado).toBe("pagado"); expect(Number(invoice.saldo_pendiente)).toBe(0);
    expect((await tx.execute(sql`SELECT id FROM payment_order_items WHERE invoice_id=${f.invoice}`)).rows).toHaveLength(1);
  }));

  it("un fallo posterior revierte el cambio de tipo y los asientos como una unidad", async () => fixture(async (tx, f) => {
    const nf = await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    await expect(tx.transaction(async (nested: any) => {
      await updatePurchaseRemito(nested, f.invoice, { tipoComprobante: "FACT-A", numeroComprobante: "789", fechaEmision: "2026-11-03", montoNeto: 2400 }, undefined, true);
      throw new Error("Fallo posterior simulado");
    })).rejects.toThrow("Fallo posterior simulado");
    const restored = (await tx.execute(sql`SELECT tipo_comprobante,asiento_id,monto_total FROM purchase_invoices WHERE id=${f.invoice}`)).rows[0];
    expect(restored.tipo_comprobante).toBe("REMITO-NF"); expect(restored.asiento_id).toBe(nf.asiento_id);
    expect((await tx.execute(sql`SELECT id FROM accounting_entries WHERE origen_tipo='purchase_remito_reversal' AND origen_id=${f.invoice}`)).rows).toHaveLength(0);
  }));

  it("rechaza proveedor ajeno, stock revertido y factura menor al pago", async () => fixture(async (tx, f) => {
    await expect(updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "FACT-A", supplierId: f.supplier + 1 }, undefined, true)).rejects.toThrow("mismo proveedor");
    await updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    await createPaymentOrder(tx, { supplierId: f.supplier, facturaIds: [f.invoice], formaPago: "efectivo", efectivo: 2400 }, () => "2026-11-03");
    await expect(updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "FACT-A", montoNeto: 2000 }, undefined, true)).rejects.toThrow("ya pagado");
    await tx.execute(sql`INSERT INTO inventory_source_reversals(source_type,source_id,reason,actor,completed_at) VALUES('purchase_invoice',${String(f.invoice)},'Prueba','test',now())`);
    await expect(updatePurchaseRemito(tx, f.invoice, { tipoComprobante: "REMITO-NF" })).rejects.toThrow("revertido");
  }));
});
