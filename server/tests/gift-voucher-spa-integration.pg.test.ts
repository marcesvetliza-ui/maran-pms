import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

async function makeVoucher(valueAmount = "1000.00") {
  const code = await storage.generateVoucherCode();
  return storage.createGiftVoucher({
    voucherCode: code, area: "spa", description: "Voucher de prueba", valueType: "monetario",
    valueAmount, buyerName: "Comprador Test", status: "activo",
  } as any);
}

async function cleanupVoucher(voucherId: string) {
  await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucherId]);
  await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucherId]);
  await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucherId]);
}

suite("PostgreSQL: voucher de regalo aplicado a una cuenta de SPA", () => {
  afterAll(async () => { await pool?.end(); });

  it("pagar con voucher lo reserva; cerrar la cuenta lo consume", async () => {
    const voucher = await makeVoucher();
    const accountId = randomUUID();
    try {
      await storage.createSpaAccount({
        id: accountId, appointmentId: `appt-${randomUUID()}`, guestName: "Huésped Test",
        status: "open", openedAt: new Date(),
      } as any);
      await pool!.query(
        `INSERT INTO spa_account_items (id, account_id, description, quantity, unit_price, subtotal, item_type, created_at)
         VALUES ($1, $2, 'Masaje', 1, '1000.00', '1000.00', 'treatment', NOW())`,
        [randomUUID(), accountId],
      );

      const app = (await import("express")).default();
      app.use((await import("express")).default.json());
      app.use((req: any, _res: any, next: any) => {
        req.user = { username: "spa-voucher-pg", fullName: "SPA Voucher PG", role: "admin" };
        req.isAuthenticated = () => true;
        next();
      });
      const { registerSpaRoutes } = await import("../routes/spa");
      registerSpaRoutes(app);
      const http = await import("node:http");
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as any;
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const payRes = await fetch(`${baseUrl}/api/spa/accounts/${accountId}/payments`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: "1000.00", method: "gift_voucher", voucherId: voucher.id }),
        });
        expect(payRes.status).toBe(201);

        const afterPay = await storage.getGiftVoucher(voucher.id);
        expect(afterPay?.status).toBe("reservado");

        const closeRes = await fetch(`${baseUrl}/api/spa/accounts/${accountId}/close`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chargedTo: "direct", receiptType: "cierre_spa" }),
        });
        expect(closeRes.status).toBe(200);

        const afterClose = await storage.getGiftVoucher(voucher.id);
        expect(afterClose?.status).toBe("utilizado");
      } finally {
        await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
      }
    } finally {
      await pool?.query("DELETE FROM spa_payments WHERE account_id = $1", [accountId]);
      await pool?.query("DELETE FROM spa_account_items WHERE account_id = $1", [accountId]);
      await pool?.query("DELETE FROM spa_accounts WHERE id = $1", [accountId]);
      await cleanupVoucher(voucher.id);
    }
  });

  it("anular el pago con voucher lo libera", async () => {
    const voucher = await makeVoucher();
    const accountId = randomUUID();
    try {
      await storage.createSpaAccount({
        id: accountId, appointmentId: `appt-${randomUUID()}`, guestName: "Huésped Test",
        status: "open", openedAt: new Date(),
      } as any);

      const { application } = await storage.applyGiftVoucher(voucher.id, "spa_account", accountId, 1000, "tester");
      const payment = await storage.createSpaPayment({
        accountId, amount: "1000.00", method: "gift_voucher" as any, voucherId: voucher.id,
        createdAt: new Date(),
      } as any);

      const app = (await import("express")).default();
      app.use((await import("express")).default.json());
      app.use((req: any, _res: any, next: any) => {
        req.user = { username: "spa-voucher-pg", role: "admin" };
        req.isAuthenticated = () => true;
        next();
      });
      const { registerSpaRoutes } = await import("../routes/spa");
      registerSpaRoutes(app);
      const http = await import("node:http");
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as any;
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const res = await fetch(`${baseUrl}/api/spa/payments/${payment.id}/anular`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivoAnulacion: "prueba" }),
        });
        expect(res.status).toBe(200);

        const releasedApp = await pool!.query("SELECT status FROM gift_voucher_applications WHERE id = $1", [application.id]);
        expect(releasedApp.rows[0].status).toBe("liberado");

        const afterVoid = await storage.getGiftVoucher(voucher.id);
        expect(afterVoid?.status).toBe("activo");
      } finally {
        await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
      }
    } finally {
      await pool?.query("DELETE FROM spa_payments WHERE account_id = $1", [accountId]);
      await pool?.query("DELETE FROM spa_accounts WHERE id = $1", [accountId]);
      await cleanupVoucher(voucher.id);
    }
  });
});
