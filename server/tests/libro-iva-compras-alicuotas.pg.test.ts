/**
 * El Libro IVA Compras exportaba SIEMPRE el neto total del comprobante en la
 * columna "gravado21" y CERO en gravado10_5/27/2_5/5, sin importar la mezcla
 * real de alícuotas — confirmado leyendo server/exports.ts. Un comprobante
 * con $100 netos al 21% y $300 netos al 10,5% mostraba $400 como gravado al
 * 21% y $0 al 10,5%, tanto en el Excel como en el archivo de alícuotas
 * (RG 3685). Este test reproduce ese caso con Postgres real y confirma que
 * el gravado ahora se reparte usando purchase_invoice_lines (el neto real
 * de cada renglón por alícuota), no el monto_neto agregado.
 */

import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;

async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

suite("PostgreSQL real: Libro IVA Compras reparte el gravado por alícuota", () => {
  beforeAll(async () => {
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("un comprobante con dos alícuotas muestra el gravado real de cada una, no el total pisado en 21%", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplier = await pool.query<{ id: number }>(
      "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva) VALUES ($1, $2, 'responsable_inscripto') RETURNING id",
      [`Proveedor mixto ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`],
    );
    const supplierId = supplier.rows[0].id;
    const item21 = await pool.query<{ id: string }>(
      "INSERT INTO inventory_items (name, unit, current_stock, cost_price) VALUES ($1, 'unidad', 0, 100) RETURNING id",
      [`Artículo 21% ${suffix}`],
    );
    const item105 = await pool.query<{ id: string }>(
      "INSERT INTO inventory_items (name, unit, current_stock, cost_price) VALUES ($1, 'unidad', 0, 300) RETURNING id",
      [`Artículo 10.5% ${suffix}`],
    );
    // El TXT de alícuotas usa ancho fijo (num=20 chars) — un número de
    // comprobante numérico corto, como en la vida real (AFIP), no como el
    // UUID que usan otros tests de este archivo para otros propósitos.
    const numero = String(10000000 + Math.floor(Math.random() * 89999999));
    let invoiceId: number | undefined;
    let invoiceEntryId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId, numeroComprobante: numero,
        fechaEmision: "2026-09-19", periodo: "09/2026", condicionPago: "cuenta_corriente",
        montoNeto: "400.00", montoIva21: "21.00", montoIva105: "31.50", montoTotal: "452.50",
        stockItems: [
          { itemId: item21.rows[0].id, quantity: "1", unitCost: "100", vatRate: "21", warehouseId: null },
          { itemId: item105.rows[0].id, quantity: "1", unitCost: "300", vatRate: "10.5", warehouseId: null },
        ],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      invoiceEntryId = created.body.asiento_id ? Number(created.body.asiento_id) : undefined;

      const lines = await pool.query(
        "SELECT vat_rate, line_total FROM purchase_invoice_lines WHERE invoice_id = $1 ORDER BY line_number", [invoiceId],
      );
      expect(lines.rows).toEqual([
        { vat_rate: "21", line_total: "100.00" },
        { vat_rate: "10.5", line_total: "300.00" },
      ]);

      // Excel: gravado21 y gravado10_5 deben reflejar el neto real de cada uno.
      const wb = new ExcelJS.Workbook();
      const excelRaw = await fetch(`${baseUrl}/api/exports/libro-iva-compras?periodo=09/2026&tipo=excel`);
      const excelBuf = Buffer.from(await excelRaw.arrayBuffer());
      if (excelRaw.headers.get("content-type")?.includes("json")) {
        throw new Error(`Respuesta inesperada del export: ${excelBuf.toString("utf-8")}`);
      }
      await wb.xlsx.load(excelBuf);
      const ws = wb.worksheets[0];
      let foundRow: any[] | undefined;
      ws.eachRow((row) => {
        const values = row.values as any[];
        if (values[7] === numero) foundRow = values; // numcomext
      });
      expect(foundRow, "no se encontró la fila del comprobante en el Excel").toBeTruthy();
      // gravado21=12, gravado10_5=13, gravado27=14, gravado2_5=15, gravado5=16
      expect(Number(foundRow![12])).toBeCloseTo(100, 2);
      expect(Number(foundRow![13])).toBeCloseTo(300, 2);
      expect(Number(foundRow![14])).toBeCloseTo(0, 2);

      // TXT de alícuotas (RG 3685): la base de cada línea debe ser su propio neto.
      const txtResponse = await fetch(`${baseUrl}/api/exports/libro-iva-compras?periodo=09/2026&tipo=alicuotas`);
      const txt = await txtResponse.text();
      // Formato fijo: arca(3) pv(5) num(20) cuit(11) base(15) cod(4) iva(15)
      const cuitDigits = (await pool.query("SELECT cuit FROM accounting_suppliers WHERE id = $1", [supplierId])).rows[0].cuit.replace(/-/g, "");
      const matching = txt.split("\r\n").filter((l) => l.includes(cuitDigits.padStart(11, "0")));
      expect(matching.length).toBeGreaterThanOrEqual(2);
      const parsed = matching.map((line) => ({
        base: Number(line.slice(39, 54)) / 100,
        cod: line.slice(54, 58),
        iva: Number(line.slice(58, 73)) / 100,
      }));
      const bracket21 = parsed.find((p) => p.cod === "0210");
      const bracket105 = parsed.find((p) => p.cod === "0105");
      expect(bracket21?.base).toBeCloseTo(100, 2);
      expect(bracket105?.base).toBeCloseTo(300, 2);
    } finally {
      if (invoiceEntryId) {
        await pool.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [invoiceEntryId]);
        await pool.query("DELETE FROM accounting_entries WHERE id = $1", [invoiceEntryId]);
      }
      if (invoiceId) {
        await pool.query("DELETE FROM purchase_invoice_lines WHERE invoice_id = $1", [invoiceId]);
        await pool.query("DELETE FROM stock_movements WHERE source_id = $1", [String(invoiceId)]);
        await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [invoiceId]);
      }
      await pool.query("DELETE FROM item_price_history WHERE item_id = ANY($1::text[])", [[item21.rows[0].id, item105.rows[0].id]]);
      await pool.query("DELETE FROM inventory_item_suppliers WHERE item_id = ANY($1::text[])", [[item21.rows[0].id, item105.rows[0].id]]);
      await pool.query("DELETE FROM inventory_items WHERE id = ANY($1::text[])", [[item21.rows[0].id, item105.rows[0].id]]);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });
});
