/**
 * ivaCodiva (server/exports.ts) traduce la condición IVA de texto libre al
 * código AFIP "Condición IVA del Receptor" (tabla CondicionIVAReceptorId,
 * WSFEv1 RG 4291) que va en el archivo CBTE del Libro IVA Digital, tanto de
 * Compras como de Ventas. La tabla real es 1=Responsable Inscripto,
 * 4=Exento, 5=Consumidor Final, 6=Monotributo, 7=No Categorizado
 * (Extranjero — el que usa Factura T). La versión anterior tenía Monotributo
 * y Exento invertidos (4↔6), mandaba Consumidor Final al código 6 en vez de
 * 5, y "No Categorizado" no matcheaba nada y caía en el default de
 * Responsable Inscripto. Este test verifica los códigos reales en el TXT
 * generado, tanto para Compras (texto tipo "R.Inscrp." de la planilla real)
 * como para Ventas (texto tipo "No Categorizado (Extranjero)" que manda
 * Factura T).
 */

import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
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

// codIva ocupa el byte [56,57) en ambas líneas CBTE (fecha 8 + tipo 3 + pv 5
// + num 20 + num 20 = 56), tanto en Compras (cbteComprasLine) como en Ventas
// (cbteVentasLine).
const COD_IVA_OFFSET = 56;

suite("PostgreSQL real: código AFIP de condición IVA en el CBTE del Libro IVA Digital", () => {
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

  it("Compras: Monotributo → 6, Exento → 4, Responsable Inscripto (R.Inscrp.) → 1", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const casos = [
      { condicionIva: "Monotributo", esperado: "6" },
      { condicionIva: "Exento", esperado: "4" },
      { condicionIva: "R.Inscrp.", esperado: "1" },
    ];
    const invoiceIds: number[] = [];
    const supplierIds: number[] = [];
    try {
      for (const [i, caso] of casos.entries()) {
        const supplier = await pool.query<{ id: number }>(
          "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva) VALUES ($1, $2, $3) RETURNING id",
          [`Proveedor CodIva ${i} ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 8)}${i}`, caso.condicionIva],
        );
        supplierIds.push(supplier.rows[0].id);
        const numero = String(20000000 + i * 1000 + Math.floor(Math.random() * 900));
        const inv = await pool.query<{ id: number }>(
          `INSERT INTO purchase_invoices
             (tipo_comprobante, supplier_id, proveedor_nombre, proveedor_cuit, numero_comprobante,
              fecha_emision, periodo, condicion_pago, monto_neto, monto_total, estado)
           VALUES ('FACT-A', $1, $2, $3, $4, '2026-08-19', '08/2026', 'cuenta_corriente', 100, 121, 'pendiente')
           RETURNING id`,
          [supplier.rows[0].id, `Proveedor CodIva ${i} ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 8)}${i}`, numero],
        );
        invoiceIds.push(inv.rows[0].id);

        const txtRaw = await fetch(`${baseUrl}/api/exports/libro-iva-compras?periodo=08/2026&tipo=cbte`);
        const txt = await txtRaw.text();
        const numPadded = numero.padStart(20, "0");
        const line = txt.split("\r\n").find((l) => l.includes(numPadded));
        expect(line, `no se encontró la línea del comprobante ${numero} (${caso.condicionIva})`).toBeTruthy();
        expect(line!.slice(COD_IVA_OFFSET, COD_IVA_OFFSET + 1)).toBe(caso.esperado);
      }
    } finally {
      if (invoiceIds.length) await pool.query("DELETE FROM purchase_invoices WHERE id = ANY($1::int[])", [invoiceIds]);
      if (supplierIds.length) await pool.query("DELETE FROM accounting_suppliers WHERE id = ANY($1::int[])", [supplierIds]);
    }
  });

  it("Ventas: Consumidor Final → 5, No Categorizado (Extranjero, Factura T) → 7", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const casos = [
      { condicionIva: "Consumidor Final", esperado: "5" },
      { condicionIva: "No Categorizado (Extranjero)", esperado: "7" },
    ];
    const invoiceIds: number[] = [];
    try {
      for (const [i, caso] of casos.entries()) {
        const numero = 30000000 + i * 1000 + Math.floor(Math.random() * 900);
        const ins = await pool.query<{ id: number }>(
          `INSERT INTO sales_invoices
             (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social, cliente_condicion_iva,
              monto_neto, monto_total, cae, modo_ficticio, estado)
           VALUES ('FB', 1, $1, '2026-08-19', $2, $3, 100, 121, '99999999999999', false, 'emitida')
           RETURNING id`,
          [numero, `Cliente CodIva ${i} ${suffix}`, caso.condicionIva],
        );
        invoiceIds.push(ins.rows[0].id);

        const txtRaw = await fetch(`${baseUrl}/api/exports/libro-iva-ventas?desde=2026-08-18&hasta=2026-08-20&tipo=cbte`);
        const txt = await txtRaw.text();
        const numPadded = String(numero).padStart(20, "0");
        const line = txt.split("\r\n").find((l) => l.includes(numPadded));
        expect(line, `no se encontró la línea del comprobante ${numero} (${caso.condicionIva})`).toBeTruthy();
        expect(line!.slice(COD_IVA_OFFSET, COD_IVA_OFFSET + 1)).toBe(caso.esperado);
      }
    } finally {
      if (invoiceIds.length) await pool.query("DELETE FROM sales_invoices WHERE id = ANY($1::int[])", [invoiceIds]);
    }
  });
});
