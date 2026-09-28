/**
 * El Libro IVA Ventas (botón "excel"/"cbte"/"alicuotas", distinto del
 * "Agrupado") armaba el reporte a partir de payments+reservations+guests,
 * asumiendo que TODO cobro era una Factura B al 21% flat — sin mirar el tipo
 * de comprobante real, la condición de IVA del cliente, ni nada de
 * Restaurant/Spa/Eventos/Grupos (que no pasan por esa tabla). Confirmado
 * leyendo server/exports.ts. Este test inserta sales_invoices reales (una
 * Factura A con dos alícuotas y una Factura B) y confirma que el export
 * ahora lee esa tabla — el tipo, el punto de venta, el número y los montos
 * reales, no un flat 21% derivado de un pago.
 */

import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
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

suite("PostgreSQL real: Libro IVA Ventas lee de sales_invoices, no de payments", () => {
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

  it("una Factura A mixta y una Factura B aparecen con su tipo, punto de venta y montos reales", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const numeroA = 10000000 + Math.floor(Math.random() * 40000000);
    const numeroB = 50000000 + Math.floor(Math.random() * 40000000);
    const fecha = "2026-09-15";
    let invoiceAId: number | undefined;
    let invoiceBId: number | undefined;
    try {
      const insA = await pool.query<{ id: number }>(
        `INSERT INTO sales_invoices
           (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social, cliente_cuit,
            cliente_condicion_iva, monto_neto, monto_iva21, monto_iva105, monto_exento, monto_no_gravado,
            monto_total, cae, modo_ficticio, estado)
         VALUES ('FA', 1, $1, $2, $3, '30-71234567-8', 'Responsable Inscripto',
                 1200, 210, 21, 0, 0, 1431, '99999999999999', false, 'emitida')
         RETURNING id`,
        [numeroA, fecha, `Empresa Mixta ${suffix}`],
      );
      invoiceAId = insA.rows[0].id;

      const insB = await pool.query<{ id: number }>(
        `INSERT INTO sales_invoices
           (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social, cliente_cuit,
            cliente_condicion_iva, monto_neto, monto_iva21, monto_iva105, monto_exento, monto_no_gravado,
            monto_total, cae, modo_ficticio, estado)
         VALUES ('FB', 1, $1, $2, 'Consumidor Final', NULL, 'Consumidor Final',
                 413.22, 86.78, 0, 0, 0, 500, '99999999999999', false, 'emitida')
         RETURNING id`,
        [numeroB, fecha],
      );
      invoiceBId = insB.rows[0].id;

      const desde = "2026-09-14";
      const hasta = "2026-09-16";

      const excelRaw = await fetch(`${baseUrl}/api/exports/libro-iva-ventas?desde=${desde}&hasta=${hasta}&tipo=excel`);
      expect(excelRaw.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await excelRaw.arrayBuffer()));
      const ws = wb.worksheets[0];
      let rowA: any[] | undefined;
      let rowB: any[] | undefined;
      ws.eachRow((row) => {
        const values = row.values as any[];
        if (Number(values[4]) === numeroA) rowA = values;
        if (Number(values[4]) === numeroB) rowB = values;
      });
      // columnas: fecha(1) tipo(2) punto_venta(3) numero(4) proveedor_nro(5)
      // cliente(6) cuit(7) total(8) neto_gravado(9) iva(10) exento(11) no_gravado(12)
      expect(rowA, "no se encontró la Factura A en el export").toBeTruthy();
      expect(rowA![2]).toBe("FA");
      expect(Number(rowA![9])).toBeCloseTo(1200, 2); // neto total: 1000 + 200
      expect(Number(rowA![10])).toBeCloseTo(231, 2); // iva total: 210 + 21

      expect(rowB, "no se encontró la Factura B en el export").toBeTruthy();
      expect(rowB![2]).toBe("FB");
      expect(Number(rowB![8])).toBeCloseTo(500, 2); // total

      // TXT de alícuotas: la Factura A debe traer una línea 0210 y otra 0105
      // con la base real de cada una, no las dos pisadas en la misma.
      const txtRaw = await fetch(`${baseUrl}/api/exports/libro-iva-ventas?desde=${desde}&hasta=${hasta}&tipo=alicuotas`);
      const txt = await txtRaw.text();
      const numA = String(numeroA).padStart(20, "0");
      const matching = txt.split("\r\n").filter((l) => l.includes(numA));
      expect(matching.length).toBe(2);
      const parsed = matching.map((line) => ({
        base: Number(line.slice(28, 43)) / 100,
        cod: line.slice(43, 47),
      }));
      expect(parsed.find((p) => p.cod === "0210")?.base).toBeCloseTo(1000, 2);
      expect(parsed.find((p) => p.cod === "0105")?.base).toBeCloseTo(200, 2);
    } finally {
      if (invoiceAId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceAId]);
      if (invoiceBId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceBId]);
    }
  });
});
