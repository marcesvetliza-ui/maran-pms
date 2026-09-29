/**
 * Regresión: GET/DELETE /api/billing/invoices/non-fiscal usaban
 * `tipo_comprobante = ANY(${NON_FISCAL_TIPOS}::text[])`, interpolando el
 * array de drizzle-orm directo en el `sql` — eso nunca serializa como
 * literal de array de Postgres real (con más de un elemento tira "cannot
 * cast type record to text[]"), así que la purga de comprobantes no
 * fiscales estaba rota desde siempre para el array real (9 tipos).
 */
import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;

async function request(method: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`, { method });
  return { status: response.status, body: (await response.json()) as any };
}

suite("PostgreSQL real: purga de comprobantes no fiscales — array param", () => {
  beforeAll(async () => {
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "purge-pg", username: "purge-pg", fullName: "Prueba Purga", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerBillingRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("cuenta y purga solo los comprobantes no fiscales del rango, sin romper con el array real (9 tipos)", async () => {
    if (!pool) return;
    const fecha = "2020-05-15";
    // Números de comprobante altos y aleatorios para no chocar con datos reales.
    const numeroBase = 900_000 + Math.floor(Math.random() * 90_000);
    const ids: number[] = [];
    try {
      let numero = numeroBase;
      for (const tipo of ["ticket", "voucher_justo", "cierre_habitacion"]) {
        const inserted = await pool.query(
          `INSERT INTO sales_invoices (
             tipo_comprobante, punto_venta, numero, fecha_emision,
             cliente_razon_social, cliente_condicion_iva, monto_neto, monto_total
           ) VALUES ($1, 1, $2, $3, 'Prueba Purga', 'Consumidor Final', 100, 100)
           RETURNING id`,
          [tipo, numero++, fecha],
        );
        ids.push(Number(inserted.rows[0].id));
      }
      // Una factura fiscal en el mismo rango: no debe contarse ni borrarse.
      const fiscal = await pool.query(
        `INSERT INTO sales_invoices (
           tipo_comprobante, punto_venta, numero, fecha_emision,
           cliente_razon_social, cliente_condicion_iva, monto_neto, monto_total
         ) VALUES ('FB', 1, $1, $2, 'Prueba Purga Fiscal', 'Consumidor Final', 100, 100)
         RETURNING id`,
        [numero, fecha],
      );
      const fiscalId = Number(fiscal.rows[0].id);

      const count = await request("GET", `/api/billing/invoices/non-fiscal/count?startDate=${fecha}&endDate=${fecha}`);
      expect(count.status, JSON.stringify(count.body)).toBe(200);
      expect(count.body.count).toBe(3);

      const deleted = await request("DELETE", `/api/billing/invoices/non-fiscal?startDate=${fecha}&endDate=${fecha}`);
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
      expect(deleted.body.deleted).toBe(3);

      const remaining = await pool.query("SELECT id FROM sales_invoices WHERE id = ANY($1::int[])", [ids]);
      expect(remaining.rows).toHaveLength(0);
      const fiscalStillThere = await pool.query("SELECT id FROM sales_invoices WHERE id = $1", [fiscalId]);
      expect(fiscalStillThere.rows).toHaveLength(1);
      ids.length = 0; // ya purgadas por el endpoint
      await pool.query("DELETE FROM sales_invoices WHERE id = $1", [fiscalId]);
    } finally {
      if (ids.length) await pool.query("DELETE FROM sales_invoices WHERE id = ANY($1::int[])", [ids]);
    }
  });
});
