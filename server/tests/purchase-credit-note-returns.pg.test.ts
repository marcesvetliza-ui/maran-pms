import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, describe, expect } from "vitest";
const url = process.env.DATABASE_URL || "";
const enabled =
  !!url &&
  (process.env.CI === "true" ||
    process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true");
if (
  enabled &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !/test/i.test(new URL(url).pathname))
)
  throw Error("Disposable local test database required");
let pool: any,
  server: any,
  base: string,
  account: number,
  createdVatAccount: number | undefined;
const actor = "nc-return-test-" + randomUUID(),
  fixtures: any[] = [];
async function request(body: any) {
  const r = await fetch(base + "/api/purchase-invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as any };
}
async function fixture(stock = 10) {
  const supplier = (
    await pool.query(
      "INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva) VALUES($1,$2,'Responsable Inscripto') RETURNING id",
      [
        actor + randomUUID(),
        String(Math.floor(Math.random() * 1e11)).padStart(11, "0"),
      ],
    )
  ).rows[0].id;
  const warehouse = (
    await pool.query(
      "INSERT INTO inventory_warehouses(name) VALUES($1) RETURNING id",
      [actor],
    )
  ).rows[0].id;
  const item = (
    await pool.query(
      "INSERT INTO inventory_items(name,unit,current_stock,cost_price) VALUES($1,'unidad',$2,9) RETURNING id",
      [actor, stock],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock) VALUES($1,$2,$3)",
    [warehouse, item, stock],
  );
  const f = { supplier, warehouse, item };
  fixtures.push(f);
  return f;
}
function body(f: any, extra: any = {}) {
  return {
    tipoComprobante: "NC-A",
    supplierId: f.supplier,
    puntoVenta: "1",
    numeroComprobante: randomUUID(),
    fechaEmision: "2026-11-19",
    periodo: "11/2026",
    montoNeto: "200",
    montoIva21: "42",
    cuentaContableId: account,
    stockItems: [
      {
        itemId: f.item,
        warehouseId: f.warehouse,
        quantity: 2,
        unitCost: 100,
        vatRate: "21",
        unit: "unidad",
      },
    ],
    ...extra,
  };
}
async function stock(f: any) {
  return (
    await pool.query(
      "SELECT i.current_stock AS global,w.current_stock AS warehouse,i.cost_price FROM inventory_items i JOIN warehouse_stock w ON w.item_id=i.id AND w.warehouse_id=$2 WHERE i.id=$1",
      [f.item, f.warehouse],
    )
  ).rows[0];
}
describe.skipIf(!enabled)(
  "Supplier credit notes return goods and retain their full financial amount",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      await (await import("../permissions")).loadRolePermissionsCache();
      account = (
        await pool.query(
          "SELECT id FROM accounting_accounts WHERE codigo='4.2.1.08.05.02'",
        )
      ).rows[0].id;
      createdVatAccount = (
        await pool.query(
          "INSERT INTO accounting_accounts(codigo,nombre,tipo,nivel,activo) SELECT '1.1.4.07.01','IVA crédito de prueba','activo',5,true WHERE NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE codigo='1.1.4.07.01') RETURNING id",
        )
      ).rows[0]?.id;
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = { id: actor, username: actor, role: "admin" } as any;
        req.isAuthenticated = () => true;
        next();
      });
      server = createServer(app);
      await (await import("../routes")).registerRoutes(server, app);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${server.address().port}`;
    }, 30000);
    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(r));
      for (const f of fixtures) {
        const ids = (
          await pool.query(
            "SELECT id,asiento_id FROM purchase_invoices WHERE supplier_id=$1",
            [f.supplier],
          )
        ).rows;
        await pool.query("DELETE FROM stock_movements WHERE item_id=$1", [
          f.item,
        ]);
        for (const inv of ids) {
          await pool.query(
            "DELETE FROM inventory_source_reversals WHERE source_type='purchase_invoice' AND source_id=$1",
            [String(inv.id)],
          );
          await pool.query(
            "DELETE FROM purchase_invoice_lines WHERE invoice_id=$1",
            [inv.id],
          );
          await pool.query(
            "DELETE FROM accounting_entry_lines WHERE entry_id=$1",
            [inv.asiento_id],
          );
          await pool.query("DELETE FROM accounting_entries WHERE id=$1", [
            inv.asiento_id,
          ]);
          await pool.query("DELETE FROM purchase_invoices WHERE id=$1", [
            inv.id,
          ]);
        }
        await pool.query("DELETE FROM item_price_history WHERE item_id=$1", [
          f.item,
        ]);
        await pool.query(
          "DELETE FROM inventory_item_suppliers WHERE item_id=$1",
          [f.item],
        );
        await pool.query("DELETE FROM warehouse_stock WHERE item_id=$1", [
          f.item,
        ]);
        await pool.query("DELETE FROM inventory_items WHERE id=$1", [f.item]);
        await pool.query("DELETE FROM inventory_warehouses WHERE id=$1", [
          f.warehouse,
        ]);
        await pool.query("DELETE FROM accounting_suppliers WHERE id=$1", [
          f.supplier,
        ]);
      }
      await pool.query("DELETE FROM audit_logs WHERE user_id=$1", [actor]);
      if (createdVatAccount)
        await pool.query("DELETE FROM accounting_accounts WHERE id=$1", [
          createdVatAccount,
        ]);
      await pool?.end();
    });
    it.each(["NC-A", "NC-B", "NC-C", "NC-M"])(
      "records %s as an output without changing cost or creating a payment",
      async (tipo) => {
        const f = await fixture();
        const expected = ["NC-B", "NC-C"].includes(tipo) ? "200.00" : "242.00";
        const r = await request(
          body(f, {
            tipoComprobante: tipo,
            montoIva21: ["NC-B", "NC-C"].includes(tipo) ? "0" : "42",
          }),
        );
        expect(r.status, JSON.stringify(r.body)).toBe(201);
        expect(r.body).toMatchObject({
          monto_total: expected,
          saldo_pendiente: expected,
          estado: "pendiente",
        });
        expect(await stock(f)).toEqual({
          global: "8.000",
          warehouse: "8.000",
          cost_price: "9.00",
        });
        expect(
          (
            await pool.query(
              "SELECT movement_type,quantity,previous_stock,new_stock FROM stock_movements WHERE item_id=$1",
              [f.item],
            )
          ).rows,
        ).toMatchObject([
          {
            movement_type: "salida",
            quantity: "2.000",
            previous_stock: "10.000",
            new_stock: "8.000",
          },
        ]);
        expect(
          (
            await pool.query(
              "SELECT id FROM item_price_history WHERE item_id=$1",
              [f.item],
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await pool.query(
              "SELECT id FROM payment_order_items WHERE invoice_id=$1",
              [r.body.id],
            )
          ).rows,
        ).toHaveLength(0);
        const payable = (
          await pool.query(
            "SELECT SUM(haber) AS amount FROM accounting_entry_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE entry_id=$1 AND a.codigo='2.1.1.01'",
            [r.body.asiento_id],
          )
        ).rows[0];
        expect(Number(payable.amount)).toBe(-Number(expected));
      },
    );
    it("rejects the reported taxes-only payload when valued articles have no base", async () => {
      const f = await fixture(),
        before = await stock(f);
      const r = await request(
        body(f, { montoNeto: "0", montoIva21: "0", impuestosInternos: "10" }),
      );
      expect(r.status).toBe(400);
      expect(r.body.error).toContain("falta su neto");
      expect(await stock(f)).toEqual(before);
      expect(
        (
          await pool.query(
            "SELECT id FROM purchase_invoices WHERE supplier_id=$1",
            [f.supplier],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("rolls back the whole invoice if a later return row exceeds remaining stock", async () => {
      const f = await fixture(3),
        row = body(f).stockItems[0];
      const r = await request(body(f, { stockItems: [row, row] }));
      expect(r.status).toBe(409);
      expect(await stock(f)).toEqual({
        global: "3.000",
        warehouse: "3.000",
        cost_price: "9.00",
      });
      expect(
        (
          await pool.query(
            "SELECT id FROM purchase_invoices WHERE supplier_id=$1",
            [f.supplier],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await pool.query("SELECT id FROM stock_movements WHERE item_id=$1", [
            f.item,
          ])
        ).rows,
      ).toHaveLength(0);
    });
    it("converts return boxes to stock units and reverses the output only once", async () => {
      const f = await fixture(50),
        r = await request(
          body(f, {
            stockItems: [
              {
                ...body(f).stockItems[0],
                unit: "caja",
                stockUnitsPerInput: 12,
              },
            ],
          }),
        );
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(Number((await stock(f)).global)).toBe(26);
      const { reverseInventorySource } = await import(
        "../inventorySourceReversal"
      );
      expect(
        (
          await reverseInventorySource(
            "purchase_invoice",
            String(r.body.id),
            "Devolución cancelada",
            actor,
          )
        ).alreadyReversed,
      ).toBe(false);
      expect(
        (
          await reverseInventorySource(
            "purchase_invoice",
            String(r.body.id),
            "Reintento",
            actor,
          )
        ).alreadyReversed,
      ).toBe(true);
      expect(Number((await stock(f)).global)).toBe(50);
    });
    it("serializes concurrent returns so warehouse and global stock stay consistent", async () => {
      const f = await fixture(3);
      const results = await Promise.all([request(body(f)), request(body(f))]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(Number((await stock(f)).global)).toBe(1);
      expect(Number((await stock(f)).warehouse)).toBe(1);
    });
    it("keeps a purely financial NC available without requiring stock articles", async () => {
      const f = await fixture(),
        r = await request(body(f, { stockItems: [] }));
      expect(r.status).toBe(201);
      expect(Number((await stock(f)).global)).toBe(10);
    });
    it("keeps ordinary receipts able to replenish an existing negative balance", async () => {
      const f = await fixture(-2);
      const r = await request(
        body(f, {
          tipoComprobante: "FACT-A",
          montoNeto: "300",
          montoIva21: "63",
          stockItems: [{ ...body(f).stockItems[0], quantity: 3 }],
        }),
      );
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(Number((await stock(f)).global)).toBe(1);
      expect(Number((await stock(f)).warehouse)).toBe(1);
    });
  },
);
