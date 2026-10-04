import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * getNextInvoiceNumberFromAfip always asks AFIP for its own last-authorized
 * number, so a prior attempt that never got a CAE (ARCA rejected it) hands
 * back the exact same "next" number again. If that prior attempt got far
 * enough to insert its own "autorizacion_pendiente" draft, a fresh retry
 * (not using recoveryInvoiceId — the normal case when a browser just
 * resubmits the form) collides with it on sales_invoices' unique
 * (tipo_comprobante, punto_venta, numero) constraint. emitirFactura must
 * self-heal: confirm with ARCA that the blocking draft was never authorized,
 * free it, and retry — without ever touching a row ARCA actually authorized.
 */

const originalFetch = global.fetch;

const mocks = vi.hoisted(() => ({
  getTokenAuth: vi.fn(),
  feCAESolicitar: vi.fn(),
  feCompConsultar: vi.fn(),
}));

vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(async () => ({
    arcaAmbiente: "homologacion",
    puntoVenta: 1,
    puntoVentaHomolog: 99,
    arcaCuit: "30-12345678-9",
  })),
}));

vi.mock("../billing/wsaaClient", () => ({
  getTokenAuth: mocks.getTokenAuth,
}));

vi.mock("../billing/wsfevClient", () => ({
  feCAESolicitar: mocks.feCAESolicitar,
  feCompConsultar: mocks.feCompConsultar,
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

const { emitirFactura } = await import("../billing/invoiceService");

async function insertStaleDraft(puntoVenta: number, numero: number, suffix: string) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");
  const item = [{ descripcion: "Otra reserva", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }];
  const result = await pool.query<{ id: number }>(
    `INSERT INTO sales_invoices
       (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social,
        cliente_condicion_iva, monto_neto, monto_total, estado, reconciliation_status,
        payment_id, items, created_at)
     VALUES ('FB', $1, $2, CURRENT_DATE, 'Consumidor Final', 'Consumidor Final',
             '0.00', '100.00', 'autorizacion_pendiente', 'pendiente', $3, $4::jsonb, NOW())
     RETURNING id`,
    [puntoVenta, numero, `stale-payment-${suffix}`, JSON.stringify(item)],
  );
  return result.rows[0].id;
}

function mockAfipLastAuthorized(numero: number) {
  global.fetch = vi.fn(async () => new Response(
    `<soap:Envelope><CbteNro>${numero}</CbteNro></soap:Envelope>`,
    { status: 200 },
  )) as any;
}

async function insertEmittedInvoice(puntoVenta: number, numero: number, cae: string) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");
  const item = [{ descripcion: "Otra reserva ya facturada", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }];
  const result = await pool.query<{ id: number }>(
    `INSERT INTO sales_invoices
       (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social,
        cliente_condicion_iva, monto_neto, monto_total, estado, reconciliation_status,
        cae, items, created_at)
     VALUES ('FB', $1, $2, CURRENT_DATE, 'Consumidor Final', 'Consumidor Final',
             '0.00', '100.00', 'emitida', 'pendiente', $3, $4::jsonb, NOW())
     RETURNING id`,
    [puntoVenta, numero, cae, JSON.stringify(item)],
  );
  return result.rows[0].id;
}

runIfDatabaseIsConfigured("PostgreSQL real: choque con un borrador rechazado huérfano", () => {
  beforeEach(() => {
    mocks.getTokenAuth.mockReset();
    mocks.feCAESolicitar.mockReset();
    mocks.feCompConsultar.mockReset();
    mocks.getTokenAuth.mockResolvedValue({ token: "test-token", sign: "test-sign" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("libera el borrador huérfano (ARCA confirma que nunca se autorizó) y emite con el mismo número", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const puntoVenta = 9500 + (parseInt(suffix.slice(0, 4), 16) % 300);
    const numero = 1; // "último autorizado" (0) + 1
    let staleDraftId: number | null = null;
    let newInvoiceId: number | null = null;
    try {
      staleDraftId = await insertStaleDraft(puntoVenta, numero, suffix);
      mockAfipLastAuthorized(0);
      mocks.feCompConsultar.mockResolvedValueOnce(null); // ARCA: nunca se autorizó ese número
      mocks.feCAESolicitar.mockResolvedValueOnce({ cae: "71234567890123", caeFechaVto: new Date("2026-09-10T12:00:00Z") });

      const result = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }],
        paymentId: `fresh-payment-${suffix}`,
        puntoVentaOverride: puntoVenta,
      } as any);

      newInvoiceId = Number(result.id);
      expect(newInvoiceId).not.toBe(staleDraftId);
      expect(result).toMatchObject({ estado: "emitida", cae: "71234567890123", numero });

      expect(mocks.feCompConsultar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: "FB", puntoVenta, numero }),
        "homologacion",
      );

      const staleGone = await pool.query("SELECT id FROM sales_invoices WHERE id = $1", [staleDraftId]);
      expect(staleGone.rows).toEqual([]);

      const rowsAtNumber = await pool.query(
        "SELECT id, estado FROM sales_invoices WHERE tipo_comprobante = 'FB' AND punto_venta = $1 AND numero = $2",
        [puntoVenta, numero],
      );
      expect(rowsAtNumber.rows).toEqual([{ id: newInvoiceId, estado: "emitida" }]);
    } finally {
      if (newInvoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [newInvoiceId]);
      if (staleDraftId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [staleDraftId]);
      await pool.query("DELETE FROM invoice_counters WHERE tipo_comprobante = 'FB' AND punto_venta = $1", [puntoVenta]);
    }
  });

  it("no toca el borrador si ARCA confirma que sí fue autorizado", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const puntoVenta = 9800 + (parseInt(suffix.slice(0, 4), 16) % 150);
    const numero = 1;
    let staleDraftId: number | null = null;
    try {
      staleDraftId = await insertStaleDraft(puntoVenta, numero, suffix);
      mockAfipLastAuthorized(0);
      // ARCA dice que ese número sí tiene CAE — no es un huérfano, no se toca.
      mocks.feCompConsultar.mockResolvedValueOnce({ cae: "70000000000001", caeFechaVto: new Date("2026-09-10T12:00:00Z") });

      await expect(emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }],
        paymentId: `fresh-payment-${suffix}`,
        puntoVentaOverride: puntoVenta,
      } as any)).rejects.toThrow();

      expect(mocks.feCAESolicitar).not.toHaveBeenCalled();
      const stillThere = await pool.query("SELECT id, estado FROM sales_invoices WHERE id = $1", [staleDraftId]);
      expect(stillThere.rows).toEqual([{ id: staleDraftId, estado: "autorizacion_pendiente" }]);
    } finally {
      if (staleDraftId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [staleDraftId]);
      await pool.query("DELETE FROM invoice_counters WHERE tipo_comprobante = 'FB' AND punto_venta = $1", [puntoVenta]);
    }
  });
});

/**
 * A plain invoice with no recoverable-before-authorization field (no
 * paymentId/groupId/spaAccountId/etc — e.g. a contado checkout, where the
 * invoice is created before any payment row exists) never pre-inserts a
 * draft: it only writes to sales_invoices once, after ARCA already handed
 * back a real CAE. If that final insert collides, the blocking row can
 * never be "freed" like a rejected draft — it's either this exact same
 * invoice (an earlier response that never reached the caller) or a genuine,
 * unrelated conflict that needs a human, never a guess.
 */
runIfDatabaseIsConfigured("PostgreSQL real: choque en la inserción final (sin borrador previo)", () => {
  beforeEach(() => {
    mocks.getTokenAuth.mockReset();
    mocks.feCAESolicitar.mockReset();
    mocks.feCompConsultar.mockReset();
    mocks.getTokenAuth.mockResolvedValue({ token: "test-token", sign: "test-sign" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("devuelve la factura existente cuando el CAE recién autorizado coincide (misma factura, respuesta perdida)", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const puntoVenta = 9600 + (parseInt(suffix.slice(0, 4), 16) % 300);
    const numero = 1;
    const cae = "71234567890123";
    let existingId: number | null = null;
    try {
      existingId = await insertEmittedInvoice(puntoVenta, numero, cae);
      mockAfipLastAuthorized(0);
      mocks.feCAESolicitar.mockResolvedValueOnce({ cae, caeFechaVto: new Date("2026-09-10T12:00:00Z") });

      const result = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }],
        puntoVentaOverride: puntoVenta,
      } as any);

      expect(Number(result.id)).toBe(existingId);
      expect(result).toMatchObject({ estado: "emitida", cae });

      const rows = await pool.query(
        "SELECT id FROM sales_invoices WHERE tipo_comprobante = 'FB' AND punto_venta = $1 AND numero = $2",
        [puntoVenta, numero],
      );
      expect(rows.rows).toEqual([{ id: existingId }]); // no se insertó una segunda fila
    } finally {
      if (existingId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [existingId]);
      await pool.query("DELETE FROM invoice_counters WHERE tipo_comprobante = 'FB' AND punto_venta = $1", [puntoVenta]);
    }
  });

  it("rechaza con un error claro (sin tocar nada) cuando el número ya pertenece a otro CAE distinto", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const puntoVenta = 9700 + (parseInt(suffix.slice(0, 4), 16) % 300);
    const numero = 1;
    let existingId: number | null = null;
    try {
      existingId = await insertEmittedInvoice(puntoVenta, numero, "70000000000001");
      mockAfipLastAuthorized(0);
      mocks.feCAESolicitar.mockResolvedValueOnce({ cae: "70000000000002", caeFechaVto: new Date("2026-09-10T12:00:00Z") });

      await expect(emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }],
        puntoVentaOverride: puntoVenta,
      } as any)).rejects.toThrow("Requiere revisión manual");

      const rows = await pool.query(
        "SELECT id, cae FROM sales_invoices WHERE tipo_comprobante = 'FB' AND punto_venta = $1 AND numero = $2",
        [puntoVenta, numero],
      );
      expect(rows.rows).toEqual([{ id: existingId, cae: "70000000000001" }]); // intacta
    } finally {
      if (existingId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [existingId]);
      await pool.query("DELETE FROM invoice_counters WHERE tipo_comprobante = 'FB' AND punto_venta = $1", [puntoVenta]);
    }
  });
});

afterAll(async () => {
  await pool?.end();
});
