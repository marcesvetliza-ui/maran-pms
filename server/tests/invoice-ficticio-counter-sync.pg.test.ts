import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Modo ficticio numera con un contador puramente local (invoice_counters) —
 * ni AFIP ni ARCA lo validan. Si sales_invoices ya tiene una fila para ese
 * tipo+punto_venta que el contador nunca llegó a reflejar (un dato que entró
 * por otra vía: una sincronización homologación/producción que insertó la
 * factura pero no alcanzó a actualizar el contador, un dato de prueba, una
 * importación manual), el contador podía devolver un número ya ocupado y
 * chocar contra la restricción única de sales_invoices. getNextInvoiceNumber
 * ahora siempre respeta el número más alto que ya exista en sales_invoices
 * para ese tipo+punto_venta, lo sepa o no el contador.
 */

const mocks = vi.hoisted(() => ({
  getTokenAuth: vi.fn(),
  feCAESolicitar: vi.fn(),
  feCompConsultar: vi.fn(),
}));

vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(async () => ({
    arcaAmbiente: "ficticio",
    puntoVenta: 1,
    arcaCuit: "30-12345678-9",
  })),
}));

vi.mock("../billing/wsaaClient", () => ({ getTokenAuth: mocks.getTokenAuth }));
vi.mock("../billing/wsfevClient", () => ({
  feCAESolicitar: mocks.feCAESolicitar,
  feCompConsultar: mocks.feCompConsultar,
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

const { emitirFactura } = await import("../billing/invoiceService");

async function insertUnsyncedInvoice(puntoVenta: number, numero: number, suffix: string) {
  if (!pool) throw new Error("DATABASE_URL no está configurado");
  const item = [{ descripcion: "Factura previa sin contador sincronizado", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }];
  const result = await pool.query<{ id: number }>(
    `INSERT INTO sales_invoices
       (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social,
        cliente_condicion_iva, monto_neto, monto_total, estado, reconciliation_status,
        payment_id, items, created_at)
     VALUES ('FB', $1, $2, CURRENT_DATE, 'Consumidor Final', 'Consumidor Final',
             '0.00', '100.00', 'emitida', 'pendiente', $3, $4::jsonb, NOW())
     RETURNING id`,
    [puntoVenta, numero, `unsynced-payment-${suffix}`, JSON.stringify(item)],
  );
  return result.rows[0].id;
}

describe("PostgreSQL real: modo ficticio respeta sales_invoices aunque el contador esté atrasado", () => {
  beforeEach(() => {
    mocks.getTokenAuth.mockReset();
    mocks.feCAESolicitar.mockReset();
    mocks.feCompConsultar.mockReset();
  });

  it("no choca contra una factura existente aunque invoice_counters nunca se haya sincronizado", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const puntoVenta = 9400 + (parseInt(suffix.slice(0, 4), 16) % 300);
    let existingId: number | null = null;
    let newId: number | null = null;
    try {
      // invoice_counters queda intacto (nunca se tocó) — simula justo el caso
      // reportado: hay una factura real en sales_invoices para este PV, pero
      // nada actualizó el contador local para que lo supiera.
      existingId = await insertUnsyncedInvoice(puntoVenta, 11, suffix);

      const result = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 100, alicuotaIva: "no_gravado", subtotalNeto: 0, subtotal: 100 }],
        puntoVentaOverride: puntoVenta,
      } as any);

      newId = Number(result.id);
      expect(newId).not.toBe(existingId);
      expect(result).toMatchObject({ estado: "emitida", numero: 12 }); // 11 ya existía: el próximo es 12, no 1.
      expect(mocks.feCAESolicitar).not.toHaveBeenCalled(); // modo ficticio nunca llama a ARCA

      const rows = await pool.query(
        "SELECT numero FROM sales_invoices WHERE tipo_comprobante = 'FB' AND punto_venta = $1 ORDER BY numero",
        [puntoVenta],
      );
      expect(rows.rows.map(r => r.numero)).toEqual([11, 12]);
    } finally {
      if (newId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [newId]);
      if (existingId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [existingId]);
      await pool.query("DELETE FROM invoice_counters WHERE tipo_comprobante = 'FB' AND punto_venta = $1", [puntoVenta]);
    }
  });
});

afterAll(async () => {
  await pool?.end();
});
