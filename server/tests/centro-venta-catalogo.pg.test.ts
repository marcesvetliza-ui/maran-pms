import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../billing/billingConfig", async (importOriginal) => {
  const original = await importOriginal<typeof import("../billing/billingConfig")>();
  return { ...original, getBillingConfig: async () => ({ ...(await original.getBillingConfig()), arcaAmbiente: "ficticio" }) };
});

const runWithPg = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : null;
let server: Server;
let url: string;

runWithPg("Centro de Comprobantes: revisión y emisión con PostgreSQL", () => {
  beforeAll(async () => {
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: "centro-catalogo-pg", username: "centro-catalogo-pg", fullName: "Prueba Centro", role: "admin" } as any;
      req.isAuthenticated = () => true;
      next();
    });
    registerBillingRoutes(app);
    server = await new Promise<Server>(resolve => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor de prueba no disponible");
    url = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end();
  });

  it("rechaza una descripción suelta y emite el alojamiento elegido del catálogo", async () => {
    const name = `Catalogo ${randomUUID()}`;
    const guest = await pool!.query("INSERT INTO guests (first_name, last_name, vat_condition) VALUES ($1, 'Prueba', 'consumidor_final') RETURNING id", [name]);
    const guestId: string = guest.rows[0].id;
    let invoiceId: number | undefined;
    const body = {
      tipoComprobante: "FB", recipientMode: "centro_comprobantes",
      recipientEntity: { type: "guest", id: guestId },
      cliente: { razonSocial: `${name} Prueba`, condicionIva: "Consumidor Final" },
      items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000 }],
    };
    const post = async (payload: unknown) => {
      const response = await fetch(`${url}/api/billing/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const rejected = await post(body);
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toMatch(/catálogo/);

      const emitted = await post({ ...body, items: [{ ...body.items[0], catalogItem: { source: "accommodation", id: "alojamiento" } }] });
      expect(emitted.status).toBe(201);
      invoiceId = emitted.body.id ?? emitted.body.invoice?.id;
      expect(invoiceId).toBeTruthy();
      const saved = await pool!.query("SELECT recipient_entity_id, items FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(saved.rows[0]?.recipient_entity_id).toBe(guestId);
      expect(saved.rows[0]?.items[0]?.catalogItem).toEqual({ source: "accommodation", id: "alojamiento" });
    } finally {
      if (invoiceId) await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool!.query("DELETE FROM guests WHERE id = $1", [guestId]);
    }
  });
});
