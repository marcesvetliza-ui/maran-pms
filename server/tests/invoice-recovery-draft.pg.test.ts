import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

const { emitirFactura } = await import("../billing/invoiceService");

runIfDatabaseIsConfigured("PostgreSQL real: recuperación de notas de crédito ARCA", () => {
  beforeEach(() => {
    mocks.getTokenAuth.mockReset();
    mocks.feCAESolicitar.mockReset();
    mocks.feCompConsultar.mockReset();
    mocks.getTokenAuth.mockResolvedValue({ token: "test-token", sign: "test-sign" });
  });

  it("conserva el borrador fallido y lo encuentra en el reintento", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");

    const suffix = randomUUID();
    const puntoVenta = 9000 + (parseInt(suffix.slice(0, 6), 16) % 1000);
    const originalInvoiceId = 700000 + (parseInt(suffix.slice(6, 12), 16) % 100000);
    const firstError = `ARCA no responde — prueba ${suffix}`;
    const retryError = `ARCA sigue sin responder — prueba ${suffix}`;
    const sourceChargeId = `charge-${suffix}`;

    const input = {
      tipoComprobante: "NCB" as const,
      cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
      items: [{
        descripcion: "Alojamiento",
        cantidad: 1,
        precioUnitario: 100,
        alicuotaIva: "no_gravado" as const,
        subtotalNeto: 0,
        subtotal: 100,
      }],
      reservaId: `reservation-${suffix}`,
      facturaOriginalId: originalInvoiceId,
      sourceChargeIds: [sourceChargeId],
      sourceChargeAmounts: { [sourceChargeId]: 100 },
      puntoVentaOverride: puntoVenta,
      recoverableCreditNote: true,
    };

    global.fetch = vi.fn(async () => new Response(
      "<soap:Envelope><CbteNro>6</CbteNro></soap:Envelope>",
      { status: 200 },
    )) as any;
    mocks.feCAESolicitar.mockRejectedValueOnce(new Error(firstError));

    let draftId: number | null = null;
    try {
      await expect(emitirFactura(input)).rejects.toThrow(firstError);

      const afterAuthorizationFailure = await pool.query(
        `SELECT id, estado, reconciliation_status, reconciliation_error,
                nota_credito_id, punto_venta, source_charge_ids, source_charge_amounts
         FROM sales_invoices
         WHERE reserva_id = $1 AND tipo_comprobante = $2 AND punto_venta = $3`,
        [input.reservaId, input.tipoComprobante, puntoVenta],
      );

      expect(afterAuthorizationFailure.rows).toHaveLength(1);
      const draft = afterAuthorizationFailure.rows[0];
      draftId = Number(draft.id);
      expect(draft).toMatchObject({
        estado: "autorizacion_pendiente",
        reconciliation_status: "pendiente",
        reconciliation_error: firstError,
        nota_credito_id: originalInvoiceId,
        punto_venta: puntoVenta,
      });
      expect(draft.source_charge_ids).toEqual([sourceChargeId]);
      expect(draft.source_charge_amounts).toEqual({ [sourceChargeId]: 100 });

      mocks.feCompConsultar.mockRejectedValueOnce(new Error(retryError));
      await expect(emitirFactura({
        ...input,
        recoverableCreditNote: false,
        recoveryInvoiceId: draftId,
      })).rejects.toThrow(retryError);

      expect(mocks.feCompConsultar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: "NCB",
          puntoVenta,
          numero: 7,
        }),
        "homologacion",
      );

      const afterRetryFailure = await pool.query(
        `SELECT id, estado, reconciliation_status, reconciliation_error
         FROM sales_invoices
         WHERE id = $1`,
        [draftId],
      );
      expect(afterRetryFailure.rows).toEqual([{
        id: draftId,
        estado: "autorizacion_pendiente",
        reconciliation_status: "pendiente",
        reconciliation_error: retryError,
      }]);

      const sameDraftCount = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM sales_invoices
         WHERE reserva_id = $1 AND tipo_comprobante = $2 AND punto_venta = $3`,
        [input.reservaId, input.tipoComprobante, puntoVenta],
      );
      expect(sameDraftCount.rows[0].count).toBe(1);
    } finally {
      if (draftId !== null) {
        await pool.query("DELETE FROM sales_invoices WHERE id = $1", [draftId]);
      }
      await pool.query(
        "DELETE FROM invoice_counters WHERE tipo_comprobante = $1 AND punto_venta = $2",
        [input.tipoComprobante, puntoVenta],
      );
      global.fetch = originalFetch;
    }
  });
});

afterAll(async () => {
  await pool?.end();
});