import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

/**
 * Real-PostgreSQL coverage for purchase-invoice accounting edits.
 *
 * A card settlement is a pending purchase invoice whose retentions are
 * suffered by the hotel: they increase the total and are debited as tax
 * credits, but they must not become practiced IIBB certificates. The PATCH
 * route replaces its accounting entry inside the same transaction, so this
 * suite verifies the old entry disappears and the replacement remains
 * balanced. FACT-A is included as the control case for the ordinary
 * supplier-retention behavior.
 */

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

const testPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

type Fixture = {
  supplierId: number;
  supplierCuit: string;
  cardInvoiceId: number | null;
  facturaInvoiceId: number | null;
};

type InvoiceResponse = {
  id: number;
  asiento_id: number | null;
  monto_total: string;
};

type AccountingLine = {
  codigo: string;
  debe: string;
  haber: string;
};

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startApp() {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());

  httpServer = http.createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve, reject) => {
    httpServer!.listen(0, "127.0.0.1", () => resolve());
    httpServer!.once("error", reject);
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto del servidor de prueba");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopApp() {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer!.close((error) => (error ? reject(error) : resolve()));
  });
  httpServer = null;
}

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");

  const suffix = randomUUID();
  const supplierCuit = `30${suffix.replaceAll("-", "").slice(0, 9)}`;
  const result = await testPool.query<{ id: number }>(
    `INSERT INTO accounting_suppliers
       (razon_social, cuit, condicion_iva, alicuota_iibb)
     VALUES ($1, $2, 'responsable_inscripto', '3.00')
     RETURNING id`,
    [`Proveedor prueba liquidaciones ${suffix}`, supplierCuit],
  );

  return {
    supplierId: result.rows[0].id,
    supplierCuit,
    cardInvoiceId: null,
    facturaInvoiceId: null,
  };
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;

  const invoiceIds = [fixture.cardInvoiceId, fixture.facturaInvoiceId].filter(
    (id): id is number => id !== null,
  );
  if (invoiceIds.length > 0) {
    const entries = await testPool.query<{ asiento_id: number | null }>(
      `SELECT asiento_id
       FROM purchase_invoices
       WHERE id = ANY($1::int[])`,
      [invoiceIds],
    );
    const entryIds = entries.rows
      .map((row) => row.asiento_id)
      .filter((id): id is number => id !== null);

    await testPool.query(
      `DELETE FROM iibb_retentions
       WHERE invoice_id = ANY($1::int[])`,
      [invoiceIds],
    );
    if (entryIds.length > 0) {
      await testPool.query(
        `DELETE FROM accounting_entry_lines
         WHERE entry_id = ANY($1::int[])`,
        [entryIds],
      );
      await testPool.query(
        `DELETE FROM accounting_entries
         WHERE id = ANY($1::int[])`,
        [entryIds],
      );
    }
    await testPool.query(
      `DELETE FROM purchase_invoices
       WHERE id = ANY($1::int[])`,
      [invoiceIds],
    );
  }

  await testPool.query(
    "DELETE FROM accounting_suppliers WHERE id = $1",
    [fixture.supplierId],
  );
}

async function requestInvoice(
  method: "POST" | "PATCH",
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: InvoiceResponse & Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as InvoiceResponse & Record<string, unknown>,
  };
}

async function readAccountingLines(entryId: number): Promise<AccountingLine[]> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query<AccountingLine>(
    `SELECT aa.codigo, ael.debe, ael.haber
     FROM accounting_entry_lines ael
     JOIN accounting_accounts aa ON aa.id = ael.account_id
     WHERE ael.entry_id = $1
     ORDER BY ael.id`,
    [entryId],
  );
  return result.rows;
}

function accountingTotals(lines: AccountingLine[]) {
  return lines.reduce(
    (totals, line) => ({
      debe: totals.debe + Number(line.debe),
      haber: totals.haber + Number(line.haber),
    }),
    { debe: 0, haber: 0 },
  );
}

runIfDatabaseIsConfigured("PostgreSQL real: edición de retenciones en comprobantes de compra", () => {
  beforeAll(async () => {
    if (!testPool) return;

    const financialSchema = await verifyFinancialSchema();
    expect(
      financialSchema,
      "La base de datos debe tener las migraciones financieras aplicadas.",
    ).toMatchObject({
      ready: true,
      missingColumns: [],
      missingIndexes: [],
    });

    const requiredAccounts = await testPool.query<{ codigo: string }>(
      `SELECT codigo
       FROM accounting_accounts
       WHERE codigo = ANY($1::text[])`,
      [[
        "1.1.1.01",
        "1.1.4.01.04.01",
        "1.1.4.01.05",
        "1.1.4.01.08.01",
        "2.1.1.01",
        "4.2.1.08.05.02",
      ]],
    );
    expect(
      requiredAccounts.rows.map((row) => row.codigo).sort(),
      "La base de pruebas debe tener las cuentas contables sembradas.",
    ).toEqual([
      "1.1.1.01",
      "1.1.4.01.04.01",
      "1.1.4.01.05",
      "1.1.4.01.08.01",
      "2.1.1.01",
      "4.2.1.08.05.02",
    ]);

    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("reemplaza el asiento de una LIQ-TARJETA editada sin practicar IIBB", async () => {
    if (!testPool) return;

    const fixture = await createFixture();
    try {
      const expenseAccount = await testPool.query<{ id: number }>(
        "SELECT id FROM accounting_accounts WHERE codigo = '4.2.1.08.05.02'",
      );
      const accountId = expenseAccount.rows[0].id;
      const cardNumber = `PG-LIQ-${randomUUID()}`;

      const created = await requestInvoice("POST", "/api/purchase-invoices", {
        tipoComprobante: "LIQ-TARJETA",
        supplierId: fixture.supplierId,
        proveedorNombre: "Procesadora de tarjetas prueba",
        proveedorCuit: fixture.supplierCuit,
        numeroComprobante: cardNumber,
        fechaEmision: "2026-08-31",
        periodo: "08/2026",
        condicionPago: "cuenta_corriente",
        montoNeto: "100.00",
        retencionIibb: "5.00",
        retencionGanancias: "3.00",
        cuentaContableId: accountId,
      });
      expect(created.status).toBe(201);
      fixture.cardInvoiceId = Number(created.body.id);

      const initial = await testPool.query<{
        asiento_id: number | null;
        monto_total: string;
      }>(
        `SELECT asiento_id, monto_total
         FROM purchase_invoices
         WHERE id = $1`,
        [fixture.cardInvoiceId],
      );
      expect(initial.rows[0].monto_total).toBe("108.00");
      expect(initial.rows[0].asiento_id).toBeTruthy();
      const previousEntryId = Number(initial.rows[0].asiento_id);

      const updated = await requestInvoice(
        "PATCH",
        `/api/purchase-invoices/${fixture.cardInvoiceId}`,
        {
          montoNeto: "200.00",
          montoIva21: "0.00",
          montoIva105: "0.00",
          montoIva27: "0.00",
          montoIva5: "0.00",
          montoIva25: "0.00",
          montoExento: "0.00",
          montoNoGravado: "0.00",
          impuestosInternos: "0.00",
          ley25413: "0.00",
          percepcionIibb: "0.00",
          percepcionIva: "0.00",
          percepcionGanancias: "0.00",
          retencionIibb: "12.00",
          retencionGanancias: "4.00",
          retencionIva: "0.00",
          retencionSuss: "0.00",
          cuentaContableId: accountId,
        },
      );
      expect(updated.status).toBe(200);
      expect(updated.body.id).toBe(fixture.cardInvoiceId);

      const cardState = await testPool.query<{
        asiento_id: number | null;
        monto_total: string;
      }>(
        `SELECT asiento_id, monto_total
         FROM purchase_invoices
         WHERE id = $1`,
        [fixture.cardInvoiceId],
      );
      expect(cardState.rows[0].monto_total).toBe("216.00");
      expect(cardState.rows[0].asiento_id).toBeTruthy();
      const replacementEntryId = Number(cardState.rows[0].asiento_id);
      expect(replacementEntryId).not.toBe(previousEntryId);

      const oldEntry = await testPool.query(
        "SELECT id FROM accounting_entries WHERE id = $1",
        [previousEntryId],
      );
      expect(oldEntry.rows).toEqual([]);

      const lines = await readAccountingLines(replacementEntryId);
      const totals = accountingTotals(lines);
      expect(totals.debe).toBeCloseTo(216, 2);
      expect(totals.haber).toBeCloseTo(216, 2);
      expect(lines).toEqual(
        expect.arrayContaining([
          { codigo: "1.1.4.01.08.01", debe: "12.00", haber: "0.00" },
          { codigo: "1.1.4.01.05", debe: "4.00", haber: "0.00" },
        ]),
      );

      const practicedIibb = await testPool.query(
        "SELECT id FROM iibb_retentions WHERE invoice_id = $1",
        [fixture.cardInvoiceId],
      );
      expect(practicedIibb.rows).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("mantiene retenciones practicadas y restadas para FACT-A", async () => {
    if (!testPool) return;

    const fixture = await createFixture();
    try {
      const expenseAccount = await testPool.query<{ id: number }>(
        "SELECT id FROM accounting_accounts WHERE codigo = '4.2.1.08.05.02'",
      );
      const accountId = expenseAccount.rows[0].id;

      const created = await requestInvoice("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A",
        supplierId: fixture.supplierId,
        proveedorNombre: "Proveedor FACT-A prueba",
        proveedorCuit: fixture.supplierCuit,
        numeroComprobante: `PG-FACT-A-${randomUUID()}`,
        fechaEmision: "2026-08-31",
        periodo: "08/2026",
        condicionPago: "contado",
        montoNeto: "100.00",
        retencionIibb: "10.00",
        cuentaContableId: accountId,
        alicuotaIibbProveedor: "3.00",
      });
      expect(created.status).toBe(201);
      fixture.facturaInvoiceId = Number(created.body.id);

      const facturaState = await testPool.query<{
        asiento_id: number | null;
        monto_total: string;
      }>(
        `SELECT asiento_id, monto_total
         FROM purchase_invoices
         WHERE id = $1`,
        [fixture.facturaInvoiceId],
      );
      expect(facturaState.rows[0].monto_total).toBe("90.00");
      expect(facturaState.rows[0].asiento_id).toBeTruthy();

      const lines = await readAccountingLines(Number(facturaState.rows[0].asiento_id));
      const totals = accountingTotals(lines);
      expect(totals.debe).toBeCloseTo(100, 2);
      expect(totals.haber).toBeCloseTo(100, 2);
      expect(lines).toEqual(
        expect.arrayContaining([
          { codigo: "1.1.4.01.08.01", debe: "0.00", haber: "10.00" },
        ]),
      );

      const practicedIibb = await testPool.query<{
        importe_retenido: string;
        invoice_id: number;
      }>(
        `SELECT importe_retenido, invoice_id
         FROM iibb_retentions
         WHERE invoice_id = $1`,
        [fixture.facturaInvoiceId],
      );
      expect(practicedIibb.rows).toEqual([
        { importe_retenido: "10.00", invoice_id: fixture.facturaInvoiceId },
      ]);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);
});