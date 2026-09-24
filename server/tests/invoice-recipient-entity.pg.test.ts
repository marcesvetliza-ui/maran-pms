import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const runWithPg = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : null;
const { emitirFactura } = await import("../billing/invoiceService");
const MARKER = "invoice-recipient-entity-pg-test";

runWithPg("Emisión con receptor vinculado", () => {
  beforeAll(async () => { await pool!.query("SELECT 1"); });
  afterEach(async () => {
    await pool!.query("DELETE FROM sales_invoices WHERE observaciones = $1", [MARKER]);
    await pool!.query("DELETE FROM guests WHERE first_name = $1", [MARKER]);
  });
  afterAll(async () => {
    await pool!.query("DELETE FROM sales_invoices WHERE observaciones = $1", [MARKER]);
    await pool!.query("DELETE FROM guests WHERE first_name = $1", [MARKER]);
    await pool!.end();
  });

  it("conserva el vínculo a la ficha del huésped junto a la foto fiscal del comprobante", async () => {
    const guest = await pool!.query("INSERT INTO guests (first_name, last_name, document_number, vat_condition) VALUES ($1, 'Prueba', '12345678', 'consumidor_final') RETURNING id", [MARKER]);
    const guestId = guest.rows[0].id as string;
    const invoice = await emitirFactura({
      tipoComprobante: "FB",
      cliente: { razonSocial: `${MARKER} Prueba`, dni: "12345678", condicionIva: "Consumidor Final" },
      recipientEntity: { type: "guest", id: guestId },
      items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000 }],
      observaciones: MARKER,
    });

    expect(invoice.estado).toBe("emitida");
    const persisted = await pool!.query("SELECT recipient_entity_type, recipient_entity_id, cliente_razon_social, cliente_dni FROM sales_invoices WHERE id = $1", [invoice.id]);
    expect(persisted.rows[0]).toMatchObject({
      recipient_entity_type: "guest", recipient_entity_id: guestId,
      cliente_razon_social: `${MARKER} Prueba`, cliente_dni: "12345678",
    });
  });
});
