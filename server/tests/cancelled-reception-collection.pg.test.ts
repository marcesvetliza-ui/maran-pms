import { randomUUID } from "node:crypto";
import express from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { BILLING_OPERATION_SCHEMA_SQL } from "../billing/operationJournal";
import { getReservationFinancialSummary } from "@shared/reservationFolio";
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { role: auth.role, username: "Synthetic Supervisor" };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
const suite = process.env.DATABASE_URL ? describe : describe.skip;
let pool: any, server: any, base: string;
const fixtures: any[] = [];
async function request(path: string, body?: any) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
async function fixture(closed = false) {
  const id = "cancelled-collection-" + randomUUID(),
    op = randomUUID(),
    p = randomUUID(),
    fm = randomUUID(),
    folio = randomUUID(),
    shift = randomUUID(),
    cash = randomUUID();
  const invoice = (
    await pool.query(
      "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,monto_acreditado,estado,reserva_id,reconciliation_status) VALUES('FA',99003,nextval('sales_invoices_id_seq'),CURRENT_DATE,'Synthetic 406','Responsable Inscripto',399000,399000,399000,'anulada',$1,'conciliada') RETURNING id",
      [id],
    )
  ).rows[0].id;
  const nc = (
    await pool.query(
      "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,nota_credito_id,reconciliation_status) VALUES('NCA',99003,nextval('sales_invoices_id_seq'),CURRENT_DATE,'Synthetic NC','Responsable Inscripto',399000,399000,'emitida',$1,$2,'conciliada') RETURNING id",
      [id, invoice],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,total_room_amount,base_rate_per_night,final_rate_per_night,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-11-16','2026-11-19',3,399000,133000,133000,'checked_in',now())",
    [id, id + "g", id + "t", id + "r"],
  );
  await pool.query(
    "INSERT INTO cash_shifts(id,area,shift_number,status) VALUES($1,'recepcion',99003,$2)",
    [shift, closed ? "closed" : "open"],
  );
  await pool.query(
    "INSERT INTO folios(id,codigo,entity_type,entity_id,total_charges,total_payments,balance) VALUES($1::text,$1::text,'reservation',$2,399000,399000,0)",
    [folio, id],
  );
  const key = randomUUID(),
    snapshot = {
      cashFormaPago: "efectivo",
      prefacturaRecovery: {
        version: 2,
        payments: [
          {
            reservationId: id,
            paymentRequestId: key,
            amount: "399000.00",
            method: "efectivo",
            date: "2026-11-19",
            reference: null,
            notes: null,
          },
        ],
        checkoutRequested: false,
      },
    };
  await pool.query(
    "INSERT INTO payments(id,reservation_id,amount,method,date,payment_request_id,invoice_ref) VALUES($1,$2,399000,'efectivo','2026-11-19',$3,$4)",
    [
      p,
      id,
      key,
      JSON.stringify({
        id: invoice,
        tipoComprobante: "FA",
        puntoVenta: 99003,
        numero: invoice,
        fundingReleases: { [invoice]: 39900000 },
      }),
    ],
  );
  await pool.query(
    "INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_id,payment_method,amount,movement_type) VALUES($1,$2,'recepcion','reservation',$3,$4,'cash',399000,'income')",
    [cash, shift, id, p],
  );
  await pool.query(
    "INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$2,'payment',399000,'Synthetic original cash','payment',$3),($4,$2,'charge',399000,'Synthetic accommodation','room',$5)",
    [fm, folio, p, randomUUID(), id],
  );
  await pool.query(
    "INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage,invoice_id) VALUES($1,'reservation',$2,'immutable-original',$3,$4,'authorized',$5)",
    [
      op,
      id,
      JSON.stringify(snapshot),
      JSON.stringify({
        type: "FA",
        issuer: "30717698130",
        environment: "homologacion",
        pointOfSale: 99003,
      }),
      invoice,
    ],
  );
  const f = {
    id,
    op,
    p,
    folio,
    shift,
    cash,
    invoice,
    nc,
    snapshot,
    path: `/api/billing/reservations/${id}/operations/${op}`,
  };
  fixtures.push(f);
  return f;
}
async function plan(f: any) {
  return (await request(f.path + "/reception-status")).body.cancelledCollection;
}
const reason =
  "Forma de pago cargada por error; refacturar en cuenta corriente.";
suite(
  "Cancelled reception invoice · exact cash reversal and fresh billing",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      await pool.query(BILLING_OPERATION_SCHEMA_SQL);
      const app = express();
      app.use(express.json());
      (
        await import("../billing/receptionOperations")
      ).registerReceptionOperationRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    beforeEach(() => {
      auth.role = "admin";
    });
    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(() => r()));
      for (const f of fixtures) {
        await pool.query(
          "DELETE FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=$1",
          [f.op],
        );
        await pool.query(
          "DELETE FROM reservation_changelog WHERE reservation_id=$1",
          [f.id],
        );
        await pool.query("DELETE FROM cash_movements WHERE payment_id=$1", [
          f.p,
        ]);
        await pool.query("DELETE FROM folio_movements WHERE folio_id=$1", [
          f.folio,
        ]);
        await pool.query("DELETE FROM folios WHERE id=$1", [f.folio]);
        await pool.query("DELETE FROM payments WHERE id=$1", [f.p]);
        await pool.query(
          "DELETE FROM billing_operations WHERE operation_id=$1",
          [f.op],
        );
        await pool.query("DELETE FROM sales_invoices WHERE reserva_id=$1", [
          f.id,
        ]);
        await pool.query("DELETE FROM reservations WHERE id=$1", [f.id]);
        await pool.query("DELETE FROM cash_shifts WHERE id=$1", [f.shift]);
      }
      await pool?.end();
    });
    it.each([false, true])(
      "reverses the exact cash once, keeps fiscal/room/shift history and allows fresh billing (closed shift: %s)",
      async (closed) => {
        const f = await fixture(closed),
          before = (
            await pool.query(
              "SELECT * FROM sales_invoices WHERE reserva_id=$1 ORDER BY id",
              [f.id],
            )
          ).rows,
          shift = (
            await pool.query("SELECT * FROM cash_shifts WHERE id=$1", [f.shift])
          ).rows[0],
          reservation = (
            await pool.query("SELECT * FROM reservations WHERE id=$1", [f.id])
          ).rows[0];
        const preview = await plan(f);
        expect(preview).toMatchObject({
          total: 399000,
          payments: [{ id: f.p, method: "efectivo", shiftClosed: closed }],
        });
        expect(
          (await pool.query("SELECT status FROM payments WHERE id=$1", [f.p]))
            .rows[0].status,
        ).toBe("active");
        const body = {
          fingerprint: preview.fingerprint,
          acknowledge: true,
          reason,
        };
        const responses = await Promise.all([
          request(f.path + "/cancel-collection", body),
          request(f.path + "/cancel-collection", body),
        ]);
        for (const r of responses) {
          expect(r.status, JSON.stringify(r.body)).toBe(200);
          expect(r.body).toMatchObject({
            collectionReversed: true,
            closedCancelled: true,
            amount: 399000,
          });
        }
        expect(
          (await pool.query("SELECT status FROM payments WHERE id=$1", [f.p]))
            .rows[0].status,
        ).toBe("anulado");
        expect(
          (
            await pool.query(
              "SELECT amount FROM cash_movements WHERE payment_id=$1 AND movement_type='expense'",
              [f.p],
            )
          ).rows,
        ).toEqual([{ amount: "399000.00" }]);
        expect(
          (
            await pool.query(
              "SELECT amount FROM folio_movements WHERE folio_id=$1 AND type='void'",
              [f.folio],
            )
          ).rows,
        ).toEqual([{ amount: "-399000.00" }]);
        expect(
          (
            await pool.query(
              "SELECT total_payments,balance FROM folios WHERE id=$1",
              [f.folio],
            )
          ).rows[0],
        ).toEqual({ total_payments: "0.00", balance: "399000.00" });
        expect(
          (await request(`/api/billing/reservations/${f.id}/pending-operation`))
            .body.pending,
        ).toBeNull();
        expect(
          (await request(f.path + "/reception-status")).body,
        ).toMatchObject({
          collectionCorrectionCompleted: true,
          cancelledCollection: null,
        });
        expect(
          (
            await pool.query(
              "SELECT * FROM sales_invoices WHERE reserva_id=$1 ORDER BY id",
              [f.id],
            )
          ).rows,
        ).toEqual(before);
        expect(
          (await pool.query("SELECT * FROM cash_shifts WHERE id=$1", [f.shift]))
            .rows[0],
        ).toEqual(shift);
        expect(
          (await pool.query("SELECT * FROM reservations WHERE id=$1", [f.id]))
            .rows[0],
        ).toEqual(reservation);
        expect(
          (
            await pool.query(
              "SELECT request_snapshot,payload_hash FROM billing_operations WHERE operation_id=$1",
              [f.op],
            )
          ).rows[0],
        ).toEqual({
          request_snapshot: f.snapshot,
          payload_hash: "immutable-original",
        });
        expect(
          (
            await pool.query(
              "SELECT id FROM audit_logs WHERE entity_type='billing_operation' AND entity_id=$1",
              [f.op],
            )
          ).rows,
        ).toHaveLength(1);
        const payments = (
          await pool.query("SELECT * FROM payments WHERE reservation_id=$1", [
            f.id,
          ])
        ).rows;
        expect(
          getReservationFinancialSummary(399000, [], payments, before),
        ).toMatchObject({
          availableReleasedCredit: 0,
          pendingInvoicing: 399000,
          newCollectionNeeded: 399000,
        });
        const { beginBillingOperation } = await import(
            "../billing/operationJournal"
          ),
          { db } = await import("../db");
        const nextId = randomUUID();
        const next = await beginBillingOperation(
          db,
          {
            reservaId: f.id,
            operationId: nextId,
            requestSnapshot: {
              cashFormaPago: "cuenta_corriente",
              prefacturaRecovery: { version: 2, payments: [] },
            },
          },
          {
            type: "FA",
            issuer: "30717698130",
            environment: "homologacion",
            pointOfSale: 99003,
          },
        );
        expect(next.stage).toBe("prepared");
        await pool.query(
          "DELETE FROM billing_operations WHERE operation_id=$1",
          [nextId],
        );
      },
    );
    it("requires a supervisor and explicit confirmation, with no writes on refusal", async () => {
      const f = await fixture(),
        preview = await plan(f);
      auth.role = "reception";
      expect(
        (
          await request(f.path + "/cancel-collection", {
            fingerprint: preview.fingerprint,
            acknowledge: true,
            reason,
          })
        ).status,
      ).toBe(403);
      auth.role = "admin";
      expect(
        (
          await request(f.path + "/cancel-collection", {
            fingerprint: preview.fingerprint,
            reason,
          })
        ).status,
      ).toBe(400);
      expect(
        (await pool.query("SELECT status FROM payments WHERE id=$1", [f.p]))
          .rows[0].status,
      ).toBe("active");
    });
    it("rejects a changed plan before reversing cash", async () => {
      const f = await fixture(),
        preview = await plan(f);
      await pool.query(
        "UPDATE payments SET method='transferencia' WHERE id=$1",
        [f.p],
      );
      expect(
        (
          await request(f.path + "/cancel-collection", {
            fingerprint: preview.fingerprint,
            acknowledge: true,
            reason,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await pool.query(
            "SELECT id FROM cash_movements WHERE payment_id=$1 AND movement_type='expense'",
            [f.p],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it.each([
      "partial_nc",
      "unreconciled_nc",
      "reapplied",
      "wrong_invoice",
      "wrong_reservation",
      "excess_collection",
      "missing_ledger",
    ])("does not offer reversal for %s", async (condition) => {
      const f = await fixture();
      if (condition === "partial_nc")
        await pool.query(
          "UPDATE sales_invoices SET monto_total=100 WHERE id=$1",
          [f.nc],
        );
      if (condition === "unreconciled_nc")
        await pool.query(
          "UPDATE sales_invoices SET reconciliation_status='pendiente' WHERE id=$1",
          [f.nc],
        );
      if (condition === "reapplied")
        await pool.query(
          "UPDATE payments SET invoice_ref=jsonb_set(invoice_ref::jsonb,'{reapplications}',$2::jsonb)::text WHERE id=$1",
          [f.p, JSON.stringify([{ invoiceId: 999999, amount: 1 }])],
        );
      if (condition === "wrong_invoice")
        await pool.query(
          "UPDATE payments SET invoice_ref='{\"id\":999999}' WHERE id=$1",
          [f.p],
        );
      if (condition === "wrong_reservation")
        await pool.query(
          "UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{prefacturaRecovery,payments,0,reservationId}','\"another-room\"') WHERE operation_id=$1",
          [f.op],
        );
      if (condition === "excess_collection")
        await pool.query(
          "UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{prefacturaRecovery,payments,0,amount}','\"471600.00\"') WHERE operation_id=$1",
          [f.op],
        );
      if (condition === "missing_ledger")
        await pool.query(
          "DELETE FROM folio_movements WHERE folio_id=$1 AND type='payment'",
          [f.folio],
        );
      expect(await plan(f)).toBeNull();
      expect(
        (await pool.query("SELECT status FROM payments WHERE id=$1", [f.p]))
          .rows[0].status,
      ).toBe("active");
    });
    it("rolls back the payment, cash, folio and journal if final audit fails", async () => {
      const f = await fixture(),
        preview = await plan(f);
      await pool.query(
        `CREATE OR REPLACE FUNCTION cancelled_collection_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.op}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`,
      );
      await pool.query(
        "CREATE TRIGGER cancelled_collection_test_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION cancelled_collection_test_failure()",
      );
      try {
        expect(
          (
            await request(f.path + "/cancel-collection", {
              fingerprint: preview.fingerprint,
              acknowledge: true,
              reason,
            })
          ).status,
        ).toBe(409);
        expect(
          (await pool.query("SELECT status FROM payments WHERE id=$1", [f.p]))
            .rows[0].status,
        ).toBe("active");
        expect(
          (
            await pool.query(
              "SELECT id FROM cash_movements WHERE payment_id=$1 AND movement_type='expense'",
              [f.p],
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await pool.query(
              "SELECT stage FROM billing_operations WHERE operation_id=$1",
              [f.op],
            )
          ).rows[0].stage,
        ).toBe("authorized");
      } finally {
        await pool.query(
          "DROP TRIGGER cancelled_collection_test_failure ON audit_logs",
        );
        await pool.query("DROP FUNCTION cancelled_collection_test_failure()");
      }
    });
  },
);
