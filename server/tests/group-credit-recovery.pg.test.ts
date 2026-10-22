import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { recoverGroupCreditNote } from "../billing/groupCreditRecovery";
const enabled =
  !!process.env.DATABASE_URL &&
  process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !/test/.test(u.pathname)
  )
    throw Error("Disposable test DB required");
}
const group = "nc-group-" + randomUUID();
let pool: any, original: number, nc: number;
let server: Server,
  base = "",
  actor = "admin";
async function api(method: string, path: string, body?: any) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
const row = async (id: number) =>
  (await pool.query("SELECT * FROM sales_invoices WHERE id=$1", [id])).rows[0];
const authorize = vi.fn(async (input: any) => {
  await pool.query(
    "UPDATE sales_invoices SET estado='emitida',cae='12345678901234' WHERE id=$1",
    [input.recoveryInvoiceId],
  );
  return {} as any;
});
describe.skipIf(!enabled)(
  "Group credit recovery with real PostgreSQL and simulated fiscal provider",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      await pool.query(
        "INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at) VALUES($1::text,$1::text,'Synthetic NC recovery','2095-02-02','2095-02-04','confirmed',NOW())",
        [group],
      );
      for (const [tipo, numero, total, estado] of [
        ["FA", 1, 12154800, "emitida"],
        ["NCA", 2, 12154800, "autorizacion_pendiente"],
      ]) {
        const r = await pool.query(
          "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_cuit,cliente_condicion_iva,monto_neto,monto_total,monto_acreditado,estado,modo_ficticio,group_id,source_charge_ids,source_charge_amounts,items,reconciliation_status) VALUES($1,9876,$2,'2026-10-22','Synthetic Customer','30711184550','Responsable Inscripto',$3,$3,0,$4,true,$5,$6,$7,$8,$9) RETURNING id",
          [
            tipo,
            Math.floor(Math.random() * 100000000),
            total,
            estado,
            group,
            JSON.stringify(["group-charge:a"]),
            JSON.stringify({ "group-charge:a": total }),
            JSON.stringify([
              {
                descripcion: "Servicios",
                cantidad: 1,
                precioUnitario: total,
                subtotal: total,
                alicuotaIva: "21",
                subtotalNeto: total / 1.21,
              },
            ]),
            tipo === "NCA" ? "pendiente" : "conciliada",
          ],
        );
        if (tipo === "FA") original = r.rows[0].id;
        else nc = r.rows[0].id;
      }
      await pool.query(
        "UPDATE sales_invoices SET nota_credito_id=$1 WHERE id=$2",
        [original, nc],
      );
    });
    beforeAll(async () => {
      await (await import("../permissions")).loadRolePermissionsCache();
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.isAuthenticated = () => actor !== "none";
        req.user = { username: "Synthetic", role: actor } as any;
        next();
      });
      (await import("../billing/routes")).registerBillingRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    beforeEach(async () => {
      actor = "admin";
      await pool.query("DELETE FROM group_payments WHERE group_id=$1", [group]);
      await pool.query(
        "INSERT INTO group_payments(id,group_id,amount,method,date,invoice_ref)VALUES($1,$1,12154800,'cash',NOW(),$2)",
        [group, JSON.stringify({ id: original })],
      );
      authorize.mockClear();
      await pool.query("DELETE FROM audit_logs WHERE entity_id=$1", [
        String(nc),
      ]);
      await pool.query(
        "UPDATE sales_invoices SET estado='emitida',monto_acreditado=0,nota_credito_id=NULL WHERE id=$1",
        [original],
      );
      await pool.query(
        "UPDATE sales_invoices SET estado='autorizacion_pendiente',cae=NULL,reconciliation_status='pendiente',reconciliation_error='previous failure',source_charge_amounts=$2,nota_credito_id=$3 WHERE id=$1",
        [nc, JSON.stringify({ "group-charge:a": 12154800 }), original],
      );
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      if (pool) {
        await pool.query("DELETE FROM audit_logs WHERE entity_id=$1", [
          String(nc),
        ]);
        await pool.query("DELETE FROM sales_invoices WHERE group_id=$1", [
          group,
        ]);
        await pool.query("DELETE FROM groups WHERE id=$1", [group]);
        await pool.end();
      }
    });
    it("resumes exact draft and applies credit once without changing the original amount or identity", async () => {
      const paymentBefore = (
        await pool.query("SELECT * FROM group_payments WHERE group_id=$1", [
          group,
        ])
      ).rows[0];
      const before = await row(nc);
      const result = await recoverGroupCreditNote(
        nc,
        { username: "Synthetic" },
        authorize as any,
      );
      expect(result.reconciliationStatus).toBe("conciliada");
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          recoveryInvoiceId: nc,
          groupId: group,
          puntoVentaOverride: 9876,
          facturaOriginalId: original,
          sourceChargeAmounts: { "group-charge:a": 12154800 },
        }),
      );
      const paymentAfter = (
        await pool.query("SELECT * FROM group_payments WHERE group_id=$1", [
          group,
        ])
      ).rows[0];
      expect({ ...paymentAfter, invoice_nc_ref: null }).toEqual({
        ...paymentBefore,
        invoice_nc_ref: null,
      });
      expect(JSON.parse(paymentAfter.invoice_nc_ref).id).toBe(nc);
      expect(await row(original)).toMatchObject({
        monto_total: "12154800.00",
        monto_acreditado: "12154800.00",
        estado: "anulada",
      });
      expect(await row(nc)).toMatchObject({
        numero: before.numero,
        fecha_emision: before.fecha_emision,
        reconciliation_status: "conciliada",
        reconciliation_error: null,
      });
      await recoverGroupCreditNote(
        nc,
        { username: "Synthetic" },
        authorize as any,
      );
      expect(authorize).toHaveBeenCalledTimes(1);
      expect(
        (
          await pool.query("SELECT * FROM audit_logs WHERE entity_id=$1", [
            String(nc),
          ])
        ).rows,
      ).toHaveLength(1);
    });
    it("preserves pending state when provider fails or remains uncertain", async () => {
      const before = await row(original);
      await expect(
        recoverGroupCreditNote(
          nc,
          { username: "Synthetic" },
          vi.fn(async () => {
            throw Error("ARCA unavailable");
          }) as any,
        ),
      ).rejects.toThrow("ARCA unavailable");
      expect(await row(original)).toEqual(before);
      expect((await row(nc)).reconciliation_status).toBe("pendiente");
      await expect(
        recoverGroupCreditNote(nc, {}, vi.fn(async () => ({})) as any),
      ).rejects.toThrow("autorización");
      expect(await row(original)).toEqual(before);
    });
    it("reconciles already authorized attempt without contacting provider", async () => {
      await pool.query(
        "UPDATE sales_invoices SET estado='emitida',cae='12345678901234' WHERE id=$1",
        [nc],
      );
      await recoverGroupCreditNote(nc, {}, authorize as any);
      expect(authorize).not.toHaveBeenCalled();
      expect((await row(original)).monto_acreditado).toBe("12154800.00");
    });
    it("serializes concurrent retries", async () => {
      await Promise.all([
        recoverGroupCreditNote(nc, {}, authorize as any),
        recoverGroupCreditNote(nc, {}, authorize as any),
      ]);
      expect(authorize).toHaveBeenCalledTimes(1);
      expect((await row(original)).monto_acreditado).toBe("12154800.00");
    });
    it("rejects inconsistent maps before contacting provider", async () => {
      await pool.query(
        "UPDATE sales_invoices SET source_charge_amounts=$1 WHERE id=$2",
        [JSON.stringify({ "group-charge:foreign": 12154800 }), nc],
      );
      await expect(
        recoverGroupCreditNote(nc, {}, authorize as any),
      ).rejects.toThrow("cargo");
      expect(authorize).not.toHaveBeenCalled();
    });
    it("retains authorized pending NC if local reconciliation rolls back, then recovers without another authorization", async () => {
      const trigger = "group_nc_failure_" + Math.floor(Math.random() * 1000000);
      await pool.query(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${nc}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
      );
      try {
        await expect(
          recoverGroupCreditNote(nc, {}, authorize as any),
        ).rejects.toThrow("synthetic audit failure");
        expect((await row(original)).monto_acreditado).toBe("0.00");
        expect(await row(nc)).toMatchObject({
          estado: "emitida",
          reconciliation_status: "pendiente",
        });
      } finally {
        await pool.query(
          `DROP TRIGGER ${trigger} ON audit_logs; DROP FUNCTION ${trigger}()`,
        );
      }
      await recoverGroupCreditNote(nc, {}, authorize as any);
      expect(authorize).toHaveBeenCalledTimes(1);
      expect((await row(nc)).reconciliation_status).toBe("conciliada");
    });
    it("lists the group pending NC outside date filters and recovers it through the real endpoint", async () => {
      const queue = await api(
        "GET",
        "/api/billing/credit-note-reconciliations/pending",
      );
      expect(queue.status).toBe(200);
      expect(queue.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: nc, group_id: group }),
        ]),
      );
      await pool.query(
        "UPDATE sales_invoices SET estado='emitida',cae='12345678901234' WHERE id=$1",
        [nc],
      );
      const response = await api(
        "POST",
        `/api/billing/credit-notes/${nc}/reconcile`,
      );
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.reconciliationStatus).toBe("conciliada");
    });
    it("blocks a second NC before authorization and reports the existing pending ID", async () => {
      const response = await api(
        "POST",
        `/api/billing/invoices/${original}/nota-credito`,
        {
          motivo: "Anular factura",
          items: [{ sourceId: "group-charge:a", amount: 12154800 }],
        },
      );
      expect(response.status).toBe(409);
      expect(response.body.pendingCreditNoteId).toBe(nc);
      expect(response.body.error).toContain("Reintentar y conciliar");
      expect(
        (
          await pool.query("SELECT id FROM sales_invoices WHERE group_id=$1", [
            group,
          ])
        ).rows,
      ).toHaveLength(2);
    });
    it("enforces the existing fiscal permission for queue and recovery", async () => {
      actor = "housekeeping";
      expect(
        (await api("GET", "/api/billing/credit-note-reconciliations/pending"))
          .status,
      ).toBe(403);
      expect(
        (await api("POST", `/api/billing/credit-notes/${nc}/reconcile`)).status,
      ).toBe(403);
      actor = "none";
      expect(
        (await api("POST", `/api/billing/credit-notes/${nc}/reconcile`)).status,
      ).toBe(401);
    });
  },
);
