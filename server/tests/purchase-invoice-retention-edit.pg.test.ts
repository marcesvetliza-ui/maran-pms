import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

/**
 * Real-PostgreSQL coverage for purchase-invoice accounting edits.
 *
 * The PATCH route replaces a comprobante's accounting entry inside the same
 * transaction, so this suite verifies the old entry disappears and the
 * replacement remains balanced, using FACT-A as the control case for the
 * ordinary supplier-retention behavior.
 *
 * LIQ-TARJETA (card settlement) used to be a pending invoice with its own
 * "retenciones sufridas" (tax credits withheld by the card processor) and a
 * real Caja movement on settlement — this had its own dedicated test here.
 * Confirmed with the user: Liquidación Tarjeta is now purely informational,
 * same as RESUMEN-BANCO/RETENCION (see purchase-expense-only.pg.test.ts),
 * so that behavior no longer applies to newly created records.
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
        "1.1.4.01.11",
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
      "1.1.4.01.11",
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

  it("exige proveedor del ABM y total positivo para una factura, incluso al editarla", async () => {
    if (!testPool) return;

    const fixture = await createFixture();
    try {
      const payload = {
        tipoComprobante: "FACT-A",
        supplierId: fixture.supplierId,
        proveedorNombre: "Nombre ingresado a mano",
        proveedorCuit: "CUIT ingresado a mano",
        numeroComprobante: `PG-VALID-${randomUUID()}`,
        fechaEmision: "2026-08-31",
        periodo: "08/2026",
        condicionPago: "cuenta_corriente",
        montoNeto: "0",
      };

      expect((await requestInvoice("POST", "/api/purchase-invoices", { ...payload, supplierId: null, montoNeto: "100" })).status).toBe(400);
      expect((await requestInvoice("POST", "/api/purchase-invoices", { ...payload, supplierId: 999999999, montoNeto: "100" })).status).toBe(400);
      expect((await requestInvoice("POST", "/api/purchase-invoices", payload)).status).toBe(400);

      const created = await requestInvoice("POST", "/api/purchase-invoices", { ...payload, montoNeto: "100" });
      expect(created.status).toBe(201);
      fixture.facturaInvoiceId = Number(created.body.id);
      const supplier = await testPool.query("SELECT razon_social, cuit FROM accounting_suppliers WHERE id = $1", [fixture.supplierId]);
      const stored = await testPool.query("SELECT proveedor_nombre, proveedor_cuit, monto_total FROM purchase_invoices WHERE id = $1", [fixture.facturaInvoiceId]);
      expect(stored.rows[0]).toMatchObject({
        proveedor_nombre: supplier.rows[0].razon_social,
        proveedor_cuit: supplier.rows[0].cuit,
        monto_total: "100.00",
      });

      const rejected = await requestInvoice("PATCH", `/api/purchase-invoices/${fixture.facturaInvoiceId}`, { montoNeto: "0" });
      expect(rejected.status).toBe(400);
      const stillStored = await testPool.query("SELECT monto_total FROM purchase_invoices WHERE id = $1", [fixture.facturaInvoiceId]);
      expect(stillStored.rows[0].monto_total).toBe("100.00");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("permite un Remito sin importe y conserva esa excepción al editar", async () => {
    if (!testPool) return;

    const fixture = await createFixture();
    try {
      const created = await requestInvoice("POST", "/api/purchase-invoices", {
        tipoComprobante: "REMITO",
        supplierId: fixture.supplierId,
        numeroComprobante: `PG-REMITO-${randomUUID()}`,
        fechaEmision: "2026-08-31",
        condicionPago: "cuenta_corriente",
      });
      expect(created.status).toBe(201);
      fixture.facturaInvoiceId = Number(created.body.id);
      expect(created.body.monto_total).toBe("0.00");

      const edited = await requestInvoice("PATCH", `/api/purchase-invoices/${fixture.facturaInvoiceId}`, { montoNeto: "0" });
      expect(edited.status).toBe(200);
      const stored = await testPool.query("SELECT monto_total, asiento_id FROM purchase_invoices WHERE id = $1", [fixture.facturaInvoiceId]);
      expect(stored.rows[0]).toMatchObject({ monto_total: "0.00", asiento_id: null });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("rechaza retenciones en facturas nuevas y en la edición de facturas sin retenciones históricas", async () => {
    if (!testPool) return;

    const fixture = await createFixture();
    try {
      const expenseAccount = await testPool.query<{ id: number }>(
        "SELECT id FROM accounting_accounts WHERE codigo = '4.2.1.08.05.02'",
      );
      const accountId = expenseAccount.rows[0].id;

      const invoiceBody = {
        tipoComprobante: "FACT-A",
        supplierId: fixture.supplierId,
        numeroComprobante: `PG-FACT-A-${randomUUID()}`,
        fechaEmision: "2026-08-31",
        periodo: "08/2026",
        condicionPago: "contado",
        montoNeto: "100.00",
        cuentaContableId: accountId,
      };
      const rejected = await requestInvoice("POST", "/api/purchase-invoices", {
        ...invoiceBody, retencionIibb: "10.00", retencionMunicipal: "6.00",
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toMatch(/Orden de Pago/);
      expect((await testPool.query("SELECT id FROM purchase_invoices WHERE numero_comprobante = $1", [invoiceBody.numeroComprobante])).rowCount).toBe(0);

      const created = await requestInvoice("POST", "/api/purchase-invoices", invoiceBody);
      expect(created.status).toBe(201);
      fixture.facturaInvoiceId = Number(created.body.id);
      const rejectedEdit = await requestInvoice("PATCH", `/api/purchase-invoices/${fixture.facturaInvoiceId}`, {
        ...invoiceBody, retencionSuss: "2.00",
      });
      expect(rejectedEdit.status).toBe(400);
      expect(rejectedEdit.body.error).toMatch(/Orden de Pago/);
      const saved = await testPool.query<{ monto_total: string; retencion_suss: string }>(
        "SELECT monto_total, retencion_suss FROM purchase_invoices WHERE id = $1", [fixture.facturaInvoiceId],
      );
      expect(saved.rows[0]).toMatchObject({ monto_total: "100.00", retencion_suss: "0.00" });
      expect((await testPool.query("SELECT id FROM iibb_retentions WHERE invoice_id = $1", [fixture.facturaInvoiceId])).rowCount).toBe(0);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("persiste la retención municipal al editar (antes se perdía en el PATCH)", async () => {
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
        proveedorNombre: "Proveedor municipal prueba",
        proveedorCuit: fixture.supplierCuit,
        numeroComprobante: `PG-FACT-A-MUN-${randomUUID()}`,
        fechaEmision: "2026-08-31",
        periodo: "08/2026",
        condicionPago: "cuenta_corriente",
        montoNeto: "100.00",
        cuentaContableId: accountId,
      });
      expect(created.status).toBe(201);
      fixture.facturaInvoiceId = Number(created.body.id);

      // Simula un comprobante anterior al cambio: el importe histórico queda
      // disponible para corregirlo, aunque hoy ya no se permita cargarlo nuevo.
      await testPool.query(
        "UPDATE purchase_invoices SET retencion_municipal = 4.00, monto_total = 96.00 WHERE id = $1",
        [fixture.facturaInvoiceId],
      );

      const updated = await requestInvoice(
        "PATCH",
        `/api/purchase-invoices/${fixture.facturaInvoiceId}`,
        {
          montoNeto: "100.00",
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
          retencionIibb: "0.00",
          retencionGanancias: "0.00",
          retencionIva: "0.00",
          retencionSuss: "0.00",
          retencionMunicipal: "9.00",
          cuentaContableId: accountId,
        },
      );
      expect(updated.status).toBe(200);

      const facturaState = await testPool.query<{
        monto_total: string;
        retencion_municipal: string;
      }>(
        `SELECT monto_total, retencion_municipal
         FROM purchase_invoices
         WHERE id = $1`,
        [fixture.facturaInvoiceId],
      );
      // Antes del fix, el UPDATE del PATCH no incluía retencion_municipal en
      // absoluto: el valor cargado al crear (o editar) el comprobante se
      // perdía en silencio en cada edición posterior.
      expect(facturaState.rows[0].retencion_municipal).toBe("9.00");
      expect(facturaState.rows[0].monto_total).toBe("91.00");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("una Nota de Débito de compra suma al total y al Debe, igual que una Factura (no se resta como una NC)", async () => {
    if (!testPool) return;

    const fixture = await createFixture();
    try {
      const expenseAccount = await testPool.query<{ id: number }>(
        "SELECT id FROM accounting_accounts WHERE codigo = '4.2.1.08.05.02'",
      );
      const accountId = expenseAccount.rows[0].id;

      const created = await requestInvoice("POST", "/api/purchase-invoices", {
        tipoComprobante: "ND-A",
        supplierId: fixture.supplierId,
        proveedorNombre: "Proveedor ND-A prueba",
        proveedorCuit: fixture.supplierCuit,
        numeroComprobante: `PG-ND-A-${randomUUID()}`,
        fechaEmision: "2026-08-31",
        periodo: "08/2026",
        condicionPago: "contado",
        montoNeto: "100.00",
        cuentaContableId: accountId,
      });
      expect(created.status).toBe(201);
      fixture.facturaInvoiceId = Number(created.body.id);

      const ndState = await testPool.query<{
        asiento_id: number | null;
        monto_total: string;
      }>(
        `SELECT asiento_id, monto_total
         FROM purchase_invoices
         WHERE id = $1`,
        [fixture.facturaInvoiceId],
      );
      // Igual que una Factura: el neto no se resta (una NC sí restaría).
      expect(ndState.rows[0].monto_total).toBe("100.00");
      expect(ndState.rows[0].asiento_id).toBeTruthy();

      const lines = await readAccountingLines(Number(ndState.rows[0].asiento_id));
      const totals = accountingTotals(lines);
      expect(totals.debe).toBeCloseTo(100, 2);
      expect(totals.haber).toBeCloseTo(100, 2);
      // El gasto queda en el Debe con signo positivo (una NC lo dejaría negativo).
      expect(lines).toEqual(
        expect.arrayContaining([
          { codigo: "4.2.1.08.05.02", debe: "100.00", haber: "0.00" },
        ]),
      );
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("una Nota de Crédito M de compra resta al Debe, igual que las demás NC (no se comporta como Factura M)", async () => {
    if (!testPool) return;

    const fixture = await createFixture();
    try {
      const expenseAccount = await testPool.query<{ id: number }>(
        "SELECT id FROM accounting_accounts WHERE codigo = '4.2.1.08.05.02'",
      );
      const accountId = expenseAccount.rows[0].id;

      const created = await requestInvoice("POST", "/api/purchase-invoices", {
        tipoComprobante: "NC-M",
        supplierId: fixture.supplierId,
        proveedorNombre: "Proveedor NC-M prueba",
        proveedorCuit: fixture.supplierCuit,
        numeroComprobante: `PG-NC-M-${randomUUID()}`,
        fechaEmision: "2026-08-31",
        periodo: "08/2026",
        condicionPago: "contado",
        montoNeto: "100.00",
        cuentaContableId: accountId,
      });
      expect(created.status).toBe(201);
      fixture.facturaInvoiceId = Number(created.body.id);

      const ncmState = await testPool.query<{
        asiento_id: number | null;
        monto_total: string;
      }>(
        `SELECT asiento_id, monto_total
         FROM purchase_invoices
         WHERE id = $1`,
        [fixture.facturaInvoiceId],
      );
      // El total guardado es siempre el importe absoluto — el signo negativo
      // de una NC se aplica únicamente en el asiento contable.
      expect(ncmState.rows[0].monto_total).toBe("100.00");
      expect(ncmState.rows[0].asiento_id).toBeTruthy();

      const lines = await readAccountingLines(Number(ncmState.rows[0].asiento_id));
      const totals = accountingTotals(lines);
      expect(totals.debe).toBeCloseTo(-100, 2);
      expect(totals.haber).toBeCloseTo(-100, 2);
      expect(lines).toEqual(
        expect.arrayContaining([
          { codigo: "4.2.1.08.05.02", debe: "-100.00", haber: "0.00" },
        ]),
      );
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);
});
