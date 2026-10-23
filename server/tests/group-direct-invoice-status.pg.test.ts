import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const enabled =
  !!process.env.DATABASE_URL &&
  process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !/test/i.test(u.pathname)
  )
    throw Error("Local disposable test DB required");
}
let pool: pg.Pool, server: Server, base: string, invoiceId: number;
const group = "status-" + randomUUID(),
  other = "status-" + randomUUID();
describe.skipIf(!enabled)(
  "direct group invoice presentation from real persisted links",
  () => {
    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      for (const id of [group, other])
        await pool.query(
          "INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at)VALUES($1::text,$1::text,'Synthetic group',CURRENT_DATE,CURRENT_DATE+1,'confirmed',NOW())",
          [id],
        );
      invoiceId = Number(
        (
          await pool.query(
            "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,group_id,reconciliation_status,cae)VALUES('FA',9998,999998,CURRENT_DATE,$1::text,'Consumidor Final',100,121,'emitida',$1::text,'pendiente','12345678901234') RETURNING id",
            [group],
          )
        ).rows[0].id,
      );
      const { registerBillingRoutes } = await import("../billing/routes");
      const app = express();
      app.use((req, _res, next) => {
        req.user = {
          id: "synthetic",
          username: "synthetic",
          role: "admin",
        } as any;
        req.isAuthenticated = () => true;
        next();
      });
      registerBillingRoutes(app);
      (await import("../routes/groups")).registerGroupsRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      const a = server.address();
      if (!a || typeof a === "string") throw Error("No port");
      base = `http://127.0.0.1:${a.port}`;
    });
    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(() => r()));
      if (pool) {
        if (invoiceId) {
          await pool.query(
            "DELETE FROM group_invoices WHERE sales_invoice_id=$1",
            [invoiceId],
          );
          await pool.query("DELETE FROM sales_invoices WHERE id=$1", [
            invoiceId,
          ]);
        }
        await pool.query("DELETE FROM groups WHERE id=ANY($1::varchar[])", [
          [group, other],
        ]);
        await pool.end();
      }
    });
    async function states() {
      const list = await fetch(
        `${base}/api/billing/invoices?cliente=${encodeURIComponent(group)}`,
      );
      expect(list.status).toBe(200);
      const row = (await list.json()).find((r: any) => r.id === invoiceId);
      const detail = await fetch(`${base}/api/billing/invoices/${invoiceId}`);
      expect(detail.status).toBe(200);
      const groupResult = await fetch(`${base}/api/groups/${group}/invoices`);
      expect(groupResult.status).toBe(200);
      const groupRow = (await groupResult.json()).find(
        (r: any) => r.id === invoiceId,
      );
      return [
        row.reconciliation_status,
        (await detail.json()).reconciliation_status,
        groupRow.reconciliation_status,
      ];
    }
    it("requires a link to the same group; never changes the document or creates a payment", async () => {
      const before = (
        await pool.query("SELECT * FROM sales_invoices WHERE id=$1", [
          invoiceId,
        ])
      ).rows[0];
      expect(await states()).toEqual(["pendiente", "pendiente", "pendiente"]);
      await pool.query(
        "INSERT INTO group_invoices(id,group_id,sales_invoice_id,invoice_ref,created_at)VALUES($1,$2,$3,'{}',NOW())",
        [randomUUID(), other, invoiceId],
      );
      expect(await states()).toEqual(["pendiente", "pendiente", "pendiente"]);
      await pool.query(
        "UPDATE group_invoices SET group_id=$1 WHERE sales_invoice_id=$2",
        [group, invoiceId],
      );
      expect(await states()).toEqual([
        "conciliada",
        "conciliada",
        "conciliada",
      ]);
      expect(
        (
          await pool.query("SELECT * FROM sales_invoices WHERE id=$1", [
            invoiceId,
          ])
        ).rows[0],
      ).toEqual(before);
      expect(
        (
          await pool.query("SELECT id FROM group_payments WHERE group_id=$1", [
            group,
          ])
        ).rows,
      ).toHaveLength(0);
      await pool.query(
        "UPDATE sales_invoices SET tipo_comprobante='NCA' WHERE id=$1",
        [invoiceId],
      );
      expect(await states()).toEqual(["pendiente", "pendiente", "pendiente"]);
    });
  },
);
