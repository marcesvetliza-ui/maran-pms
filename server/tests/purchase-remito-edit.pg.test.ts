import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

let db: typeof import("../db").db;
let update: typeof import("../purchase-remito").updatePurchaseRemito;
let enter: typeof import("../purchase-invoice-stock").enterPurchaseInvoiceStock;
let pay: typeof import("../paymentOrder").createPaymentOrder;
const suite = process.env.DATABASE_URL ? describe : describe.skip;

async function fixture(run: (tx: any, f: any) => Promise<void>, packaged = false) {
  const rollback = new Error("rollback synthetic remito");
  try {
    await db.transaction(async tx => {
      const expense = (await tx.execute(sql`INSERT INTO accounting_accounts(codigo,nombre,tipo) VALUES(${randomUUID()},'Gasto sintético','egreso') RETURNING id`)).rows[0].id;
      for (const [code, type] of [["2.1.1.01", "pasivo"], ["1.1.1.01", "activo"], ["1.1.4.07.01", "activo"]]) {
        await tx.execute(sql`INSERT INTO accounting_accounts(codigo,nombre,tipo) VALUES(${code},'Cuenta sintética',${type}) ON CONFLICT(codigo) DO NOTHING`);
      }
      const supplier = (await tx.execute(sql`INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva) VALUES('Proveedor sintético',${randomUUID()},'responsable_inscripto') RETURNING id`)).rows[0].id;
      const item = (await tx.execute(sql`INSERT INTO inventory_items(name,unit,cost_price) VALUES('Artículo sintético','unidad',1200) RETURNING id`)).rows[0].id;
      const warehouse = (await tx.execute(sql`INSERT INTO inventory_warehouses(name) VALUES('Depósito sintético') RETURNING id`)).rows[0].id;
      const invoice = Number((await tx.execute(sql`INSERT INTO purchase_invoices(tipo_comprobante,supplier_id,numero_comprobante,fecha_emision,periodo,monto_neto,monto_total,saldo_pendiente,estado,condicion_pago,cuenta_contable_id)
        VALUES('REMITO',${supplier},${randomUUID()},'2026-11-03','11/2026',0,0,0,'registrado','cuenta_corriente',${expense}) RETURNING id`)).rows[0].id);
      await enter(tx as any, invoice, Number(supplier), [{ itemId: String(item), warehouseId: String(warehouse), quantity: 2, unitCost: 1200, vatRate: null,
        ...(packaged ? { unit: "paquete", stockUnitsPerInput: 6 } : {}) }], "Remito sintético");
      const line = (await tx.execute(sql`SELECT * FROM purchase_invoice_lines WHERE invoice_id=${invoice}`)).rows[0] as any;
      const row = { originalLineId: Number(line.id), itemId: String(item), warehouseId: String(warehouse), quantity: 2, unit: packaged ? "paquete" : "unidad", unitCost: 1200, vatRate: null };
      await run(tx, { invoice, supplier: Number(supplier), item: String(item), warehouse: String(warehouse), row });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
const document = async (tx: any, id: number) => (await tx.execute(sql`SELECT * FROM purchase_invoices WHERE id=${id}`)).rows[0] as any;
const balance = async (tx: any, item: string) => Number((await tx.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${item}`)).rows[0].current_stock);

suite("Edición de remitos: corrección atómica por diferencia", () => {
  beforeAll(async () => {
    ({ db } = await import("../db"));
    ({ updatePurchaseRemito: update } = await import("../purchase-remito"));
    ({ enterPurchaseInvoiceStock: enter } = await import("../purchase-invoice-stock"));
    ({ createPaymentOrder: pay } = await import("../paymentOrder"));
  });
  it("guarda encabezado y aumenta únicamente la diferencia, sin otra compra ni pago", async () => fixture(async (tx, f) => {
    const result = await update(tx, f.invoice, { expectedRemitoVersion: 0, numeroComprobante: "456", puntoVenta: "2", fechaEmision: "2026-11-04", periodo: "11/2026", observaciones: "Corregido", stockItems: [{ ...f.row, quantity: 5 }] }, "operador");
    expect(result.id).toBe(f.invoice);
    expect(result.numero_comprobante_ext).toBe("00002-00000456");
    expect(result.fecha_emision).toBe("2026-11-04");
    expect(result.observaciones).toBe("Corregido");
    expect(Number(result.monto_total)).toBe(0);
    expect(result.asiento_id).toBeNull();
    expect(await balance(tx, f.item)).toBe(5);
    const movements = (await tx.execute(sql`SELECT movement_type,quantity FROM stock_movements WHERE source_type='purchase_invoice' AND source_id=${String(f.invoice)} ORDER BY created_at,id`)).rows;
    expect(movements).toHaveLength(2);
    expect(movements).toContainEqual({ movement_type: "entrada", quantity: "3.000" });
    expect(result.special_details.remitoHistory.at(-1).articles.previous[0].quantity).toBe("2.000");
    expect((await tx.execute(sql`SELECT id FROM payment_order_items WHERE invoice_id=${f.invoice}`)).rows).toHaveLength(0);
    await expect(update(tx, f.invoice, { expectedRemitoVersion: 0, stockItems: [{ ...f.row, quantity: 5 }] })).rejects.toThrow("cambió mientras");
    expect(await balance(tx, f.item)).toBe(5);
  }));
  it("reduce el ingreso sin borrar su evidencia original", async () => fixture(async (tx, f) => {
    await update(tx, f.invoice, { expectedRemitoVersion: 0, stockItems: [{ ...f.row, quantity: 1 }] });
    expect(await balance(tx, f.item)).toBe(1);
    const movements = (await tx.execute(sql`SELECT movement_type,quantity FROM stock_movements WHERE source_type='purchase_invoice' AND source_id=${String(f.invoice)}`)).rows;
    expect(movements).toContainEqual({ movement_type: "entrada", quantity: "2.000" });
    expect(movements).toContainEqual({ movement_type: "salida", quantity: "1.000" });
    const line = (await tx.execute(sql`SELECT id FROM purchase_invoice_lines WHERE invoice_id=${f.invoice}`)).rows[0];
    await update(tx, f.invoice, { expectedRemitoVersion: 1, stockItems: [{ ...f.row, originalLineId: Number(line.id), quantity: 1 }] });
    expect((await tx.execute(sql`SELECT id FROM stock_movements WHERE source_type='purchase_invoice' AND source_id=${String(f.invoice)}`)).rows).toHaveLength(2);
  }));
  it("reemplaza artículos y depósitos y conserva el costo actual del catálogo", async () => fixture(async (tx, f) => {
    const item = (await tx.execute(sql`INSERT INTO inventory_items(name,unit,cost_price) VALUES('Reemplazo','unidad',777) RETURNING id`)).rows[0].id;
    const warehouse = (await tx.execute(sql`INSERT INTO inventory_warehouses(name) VALUES('Destino sintético') RETURNING id`)).rows[0].id;
    await update(tx, f.invoice, { expectedRemitoVersion: 0, stockItems: [{ ...f.row, itemId: item, warehouseId: warehouse, quantity: 3, unitCost: 100 }] });
    expect(await balance(tx, f.item)).toBe(0);
    expect(await balance(tx, item as string)).toBe(3);
    expect(Number((await tx.execute(sql`SELECT cost_price FROM inventory_items WHERE id=${item}`)).rows[0].cost_price)).toBe(777);
    expect((await tx.execute(sql`SELECT item_id,warehouse_id FROM purchase_invoice_lines WHERE invoice_id=${f.invoice}`)).rows).toMatchObject([{ item_id: item, warehouse_id: warehouse }]);
  }));
  it("preserva el factor recibido de un paquete al corregir cantidades", async () => fixture(async (tx, f) => {
    await update(tx, f.invoice, { expectedRemitoVersion: 0, stockItems: [{ ...f.row, quantity: 3 }] });
    expect(await balance(tx, f.item)).toBe(18);
    expect(Number((await tx.execute(sql`SELECT stock_quantity FROM purchase_invoice_lines WHERE invoice_id=${f.invoice}`)).rows[0].stock_quantity)).toBe(18);
  }, true));
  it("revierte todo si la mercadería ya se consumió y la diferencia no alcanza", async () => fixture(async (tx, f) => {
    await tx.execute(sql`UPDATE inventory_items SET current_stock=0.5 WHERE id=${f.item}`);
    await tx.execute(sql`UPDATE warehouse_stock SET current_stock=0.5 WHERE item_id=${f.item}`);
    const before = await document(tx, f.invoice);
    await expect(tx.transaction((nested: any) => update(nested, f.invoice, { expectedRemitoVersion: 0, numeroComprobante: "999", stockItems: [{ ...f.row, quantity: 0.2 }] }))).rejects.toThrow("Stock insuficiente");
    expect(await document(tx, f.invoice)).toEqual(before);
    expect(await balance(tx, f.item)).toBe(0.5);
    expect(Number((await tx.execute(sql`SELECT quantity FROM purchase_invoice_lines WHERE invoice_id=${f.invoice}`)).rows[0].quantity)).toBe(2);
  }));
  it("no confunde una línea ajena con el detalle original ni permite inventar uno antiguo", async () => fixture(async (tx, f) => {
    await expect(update(tx, f.invoice, { expectedRemitoVersion: 0, stockItems: [{ ...f.row, originalLineId: -5 }] })).rejects.toThrow("otro remito");
    await tx.execute(sql`UPDATE purchase_invoice_lines SET stock_quantity=NULL WHERE invoice_id=${f.invoice}`);
    await expect(update(tx, f.invoice, { expectedRemitoVersion: 0, stockItems: [f.row] })).rejects.toThrow("detalle de stock completo");
    await update(tx, f.invoice, { expectedRemitoVersion: 0, observaciones: "Solo encabezado" });
    expect((await document(tx, f.invoice)).observaciones).toBe("Solo encabezado");
    expect(await balance(tx, f.item)).toBe(2);
  }));
  it("no permite cambiar cantidades por un endpoint antiguo sin control de versión", async () => fixture(async (tx, f) => {
    await expect(update(tx, f.invoice, { stockItems: [f.row] })).rejects.toThrow("conserva su stock");
    expect(await balance(tx, f.item)).toBe(2);
  }));
  it("conserva pagos y revierte stock/asientos si la corrección queda por debajo de lo pagado", async () => fixture(async (tx, f) => {
    await update(tx, f.invoice, { tipoComprobante: "REMITO-NF" });
    await pay(tx, { supplierId: f.supplier, facturaIds: [f.invoice], formaPago: "efectivo", efectivo: 1000, montoParcial: 1000 }, () => "2026-11-03");
    const before = await document(tx, f.invoice);
    await expect(tx.transaction((nested: any) => update(nested, f.invoice, { expectedRemitoVersion: 1, stockItems: [{ ...f.row, quantity: 0.5, unitCost: 100 }] }))).rejects.toThrow("ya pagado");
    expect(await balance(tx, f.item)).toBe(2);
    expect(await document(tx, f.invoice)).toEqual(before);
    await expect(update(tx, f.invoice, { expectedRemitoVersion: 1, supplierId: f.supplier + 1 })).rejects.toThrow("pagos aplicados");
    expect((await tx.execute(sql`SELECT importe_cancelado FROM payment_order_items WHERE invoice_id=${f.invoice}`)).rows).toMatchObject([{ importe_cancelado: "1000.00" }]);
  }));
});
