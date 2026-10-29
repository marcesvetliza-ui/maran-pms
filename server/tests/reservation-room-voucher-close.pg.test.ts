import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Explicit disposable local database only. Never read operational credentials.
const allowed = process.env.DATABASE_URL === "postgresql://postgres@127.0.0.1:55448/rate_calendar_boot_20261029" ||
  (process.env.CI === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):5432\/maran_test$/.test(process.env.DATABASE_URL || ""));
const suite = allowed ? describe : describe.skip;
let server: Server;
let base: string;
let pool: import("pg").Pool;
suite("room voucher final closure — real persisted source guards", () => {
  beforeAll(async () => {
    pool = (await import("../db")).pool;
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: "voucher-test", username: "voucher-test", fullName: "Prueba", role: "admin" } as any; req.isAuthenticated = () => true; next(); });
    registerBillingRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await pool?.end(); });
  it("blocks another voucher and fiscal invoice for a charge already closed, without writing cash or payments", async () => {
    const id = `voucher-close-${randomUUID()}`;
    let invoiceId: number | undefined;
    try {
      await pool.query(`INSERT INTO reservations (id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,total_room_amount,status,created_at) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,CURRENT_DATE+1,'144000','confirmed',NOW())`, [id,id,id,id,id]);
      const inserted = await pool.query(`INSERT INTO sales_invoices (tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,monto_acreditado,estado,reserva_id,source_charge_ids,source_charge_amounts) VALUES ('cierre_habitacion',9921,1,CURRENT_DATE,'Prueba','Consumidor Final',144000,144000,0,'emitida',$1,'["accommodation"]','{"accommodation":144000}') RETURNING id`, [id]);
      invoiceId = inserted.rows[0].id;
      for (const type of ["cierre_habitacion", "FB"]) {
        const res = await fetch(`${base}/api/billing/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          tipoComprobante: type, cliente: { razonSocial: "Prueba", condicionIva: "Consumidor Final" },
          items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 144000, alicuotaIva: "no_gravado", subtotalNeto: 144000, subtotal: 144000 }],
          reservaId: id, cashFormaPago: "efectivo", cashFormaPagoDetalle: [{ method: "efectivo", amount: 144000 }], sourceChargeIds: ["accommodation"], sourceChargeAmounts: { accommodation: 144000 },
        }) });
        const body = await res.json();
        expect(res.status, JSON.stringify(body)).toBe(409);
        expect(body.error).toMatch(/ya está facturado|documentado|saldo suficiente/);
      }
      expect((await pool.query("SELECT id FROM sales_invoices WHERE reserva_id=$1",[id])).rows).toHaveLength(1);
      expect((await pool.query("SELECT id FROM payments WHERE reservation_id=$1",[id])).rows).toHaveLength(0);
      expect((await pool.query("SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=$1",[String(invoiceId)])).rows).toHaveLength(0);
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id=$1", [invoiceId]);
      await pool.query("DELETE FROM reservations WHERE id=$1", [id]);
    }
  });
});
