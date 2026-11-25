import { randomUUID } from "node:crypto";
import express from "express";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const fiscalFailure = vi.hoisted(() => ({ reservationId: "" }));
vi.mock("../billing/invoiceService", async (original) => {
  const actual = await original<any>();
  return {
    ...actual,
    emitirFactura: async (data: any) => {
      if (data.reservaId === fiscalFailure.reservationId) {
        fiscalFailure.reservationId = "";
        throw Object.assign(new Error("Synthetic temporary fiscal failure"), {
          statusCode: 503,
        });
      }
      return actual.emitirFactura(data);
    },
  };
});
vi.mock("../billing/billingConfig", async (original) => {
  const actual = await original<any>();
  return {
    ...actual,
    getBillingConfig: async () => ({
      ...(await actual.getBillingConfig()),
      modoArca: false,
      arcaAmbiente: "ficticio",
    }),
  };
});
const suite =
  process.env.CI === "true" &&
  /(127\.0\.0\.1|localhost):5432\/maran_test$/.test(
    process.env.DATABASE_URL || "",
  )
    ? describe
    : describe.skip;
let pool: any, server: any, url: string;
let originalBillingConfig: any;
let testBillingId = 1;
const fixtures: any[] = [];
const shift = "batch-fixture-shift-" + randomUUID();
async function request(path: string, body?: any) {
  const res = await fetch(url + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}
async function fixture(paid = false) {
  const group = "room-batch-fixture-" + randomUUID(),
    ids = [group + "a", group + "b"];
  fixtures.push({ group, ids });
  await pool.query(
    "INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,master_folio_config,created_at) VALUES($1::text,$1::text,'Synthetic Batch Group','2026-01-01','2026-01-02','confirmed','accommodation',now())",
    [group],
  );
  for (const id of ids) {
    await pool.query(
      "INSERT INTO guests(id,first_name,last_name,document_number,vat_condition) VALUES($1,'Synthetic','Batch Guest','00000000','consumidor_final')",
      [id + "guest"],
    );
    await pool.query(
      "INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,total_room_amount,base_rate_per_night,final_rate_per_night,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-01-01','2026-01-02',1,121,121,121,'confirmed',now())",
      [id, id + "guest", id + "type", id + "room"],
    );
    await pool.query(
      "INSERT INTO group_reservation_links(group_id,reservation_id) VALUES($1,$2)",
      [group, id],
    );
    if (paid)
      await pool.query(
        "INSERT INTO payments(id,reservation_id,amount,method,date,status) VALUES($1,$2,121,'efectivo','2026-01-01','active')",
        [id + "paid", id],
      );
  }
  return {
    group,
    ids,
    path: `/api/groups/${group}/room-invoice-batches`,
    draft: {
      selection: ids.map((reservationId) => ({
        reservationId,
        recipient: "guest",
      })),
      closeRooms: true,
    },
  };
}
async function prepare(f: any) {
  const view = await request(f.path + "/preview", f.draft);
  expect(view.status, JSON.stringify(view.body)).toBe(200);
  expect(view.body.blockers).toEqual([]);
  const body = {
    ...f.draft,
    operationId: randomUUID(),
    fingerprint: view.body.fingerprint,
    paymentRows: view.body.total
      ? [
          {
            method: "efectivo",
            amount: String(view.body.total),
            reference: "Synthetic receipt",
          },
        ]
      : [],
    receiverDetails: view.body.payer,
  };
  const made = await request(f.path, body);
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  return { ...made.body, prepareBody: body };
}
suite("one group receipt and independently recoverable room invoices", () => {
  beforeAll(async () => {
    ({ pool } = await import("../db"));
    await pool.query(
      (await import("../groupRoomInvoiceBatchSchema"))
        .GROUP_ROOM_INVOICE_BATCH_SCHEMA_SQL,
    );
    await pool.query(
      "INSERT INTO cash_shifts(id,area,opened_by,status,shift_number,opened_at) VALUES($1,'reception','synthetic-batch','open',999996,now())",
      [shift],
    );
    originalBillingConfig = (
      await pool.query(
        "SELECT id,arca_ambiente,modo_arca,punto_venta,cuit,arca_cuit FROM billing_config ORDER BY id LIMIT 1",
      )
    ).rows[0];
    testBillingId = originalBillingConfig?.id || 1;
    await pool.query(
      "INSERT INTO billing_config(id,arca_ambiente,modo_arca,punto_venta,cuit,arca_cuit) VALUES($1,'ficticio',false,1,'00000000000','00000000000') ON CONFLICT(id) DO UPDATE SET arca_ambiente='ficticio',modo_arca=false,punto_venta=1,cuit='00000000000',arca_cuit='00000000000'",
      [testBillingId],
    );
    await (await import("../permissions")).loadRolePermissionsCache();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: "synthetic-batch-actor",
        username: "Synthetic Batch Actor",
        role: "admin",
      } as any;
      req.isAuthenticated = () => true;
      next();
    });
    (await import("../routes/groups")).registerGroupsRoutes(app);
    (await import("../billing/routes")).registerBillingRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    url = `http://127.0.0.1:${server.address().port}`;
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    for (const { group, ids } of fixtures) {
      await pool.query(
        "DELETE FROM cash_movements WHERE payment_id IN(SELECT id FROM group_payments WHERE group_id=$1) OR source_id=ANY($2::text[])",
        [group, ids],
      );
      await pool.query(
        "DELETE FROM payments WHERE reservation_id=ANY($1::text[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM charges WHERE reservation_id=ANY($1::text[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM billing_operations WHERE owner_id=ANY($1::text[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM sales_invoices WHERE reserva_id=ANY($1::text[]) OR group_id=$2",
        [ids, group],
      );
      await pool.query(
        "DELETE FROM group_account_operations WHERE group_id=$1",
        [group],
      );
      await pool.query("DELETE FROM group_payments WHERE group_id=$1", [group]);
      await pool.query(
        "DELETE FROM group_room_invoice_batches WHERE group_id=$1",
        [group],
      );
      await pool.query(
        "DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=ANY($1::text[]))",
        [ids],
      );
      await pool.query("DELETE FROM folios WHERE entity_id=ANY($1::text[])", [
        ids,
      ]);
      await pool.query(
        "DELETE FROM group_reservation_links WHERE group_id=$1",
        [group],
      );
      await pool.query(
        "DELETE FROM reservation_changelog WHERE reservation_id=ANY($1::text[])",
        [ids],
      );
      await pool.query("DELETE FROM reservations WHERE id=ANY($1::text[])", [
        ids,
      ]);
      await pool.query("DELETE FROM groups WHERE id=$1", [group]);
      await pool.query("DELETE FROM account_movements WHERE entity_id=$1", [
        group + "company",
      ]);
      await pool.query("DELETE FROM companies WHERE id=$1", [
        group + "company",
      ]);
      await pool.query("DELETE FROM guests WHERE id=ANY($1::text[])", [
        ids.map((id: string) => id + "guest"),
      ]);
    }
    await pool.query("DELETE FROM cash_movements WHERE shift_id=$1", [shift]);
    await pool.query("DELETE FROM cash_shifts WHERE id=$1", [shift]);
    if (originalBillingConfig)
      await pool.query(
        "UPDATE billing_config SET arca_ambiente=$2,modo_arca=$3,punto_venta=$4,cuit=$5,arca_cuit=$6 WHERE id=$1",
        [
          originalBillingConfig.id,
          originalBillingConfig.arca_ambiente,
          originalBillingConfig.modo_arca,
          originalBillingConfig.punto_venta,
          originalBillingConfig.cuit,
          originalBillingConfig.arca_cuit,
        ],
      );
    else
      await pool.query("DELETE FROM billing_config WHERE id=$1", [
        testBillingId,
      ]);
  });
  it("collects once, closes rooms, issues two separate invoices and replays every lost response without a second Caja movement", async () => {
    const f = await fixture(),
      batch = await prepare(f);
    expect(
      (await request("/api/billing/invoices", batch.invoices[0].body)).status,
    ).toBe(409);
    const attempts = await Promise.all([
      request(`/api/groups/${f.group}/payment`, batch.paymentBody),
      request(`/api/groups/${f.group}/payment`, batch.paymentBody),
    ]);
    const collection = attempts[0];
    expect(attempts[1].status, JSON.stringify(attempts[1].body)).toBe(200);
    expect(attempts[1].body.groupPaymentId).toBe(
      collection.body.groupPaymentId,
    );
    expect(collection.status, JSON.stringify(collection.body)).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT status FROM reservations WHERE id=ANY($1::text[])",
          [f.ids],
        )
      ).rows.every((r: any) => r.status === "checked_out"),
    ).toBe(true);
    for (const invoice of batch.invoices) {
      const emitted = await request("/api/billing/invoices", invoice.body);
      expect(emitted.status, JSON.stringify(emitted.body)).toBe(201);
      expect(
        (await request("/api/billing/invoices", invoice.body)).body.id,
      ).toBe(emitted.body.id);
    }
    const replay = await request(
      `/api/groups/${f.group}/payment`,
      batch.paymentBody,
    );
    expect(replay.status).toBe(200);
    expect(replay.body.groupPaymentId).toBe(collection.body.groupPaymentId);
    const end = await request(`${f.path}/${batch.id}`);
    expect(end.body.status, JSON.stringify(end.body)).toBe("completed");
    expect(end.body.invoices.every((i: any) => i.done)).toBe(true);
    const account = await (
      await import("../billing/groupAccount")
    ).groupAccountSnapshot(f.ids[0]);
    expect(account.collectibleInvoices).toEqual([]);
    expect(account.balance).toBe(0);
    const financial = await (
      await import("../billing/groupInvoiceScope")
    ).getGroupInvoiceSnapshot(f.group);
    expect(financial.financial.nonFiscalAdvances).toBe(0);
    expect(
      (
        await pool.query("SELECT id FROM group_payments WHERE group_id=$1", [
          f.group,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT id FROM sales_invoices WHERE reserva_id=ANY($1::text[])",
          [f.ids],
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await pool.query("SELECT id FROM cash_movements WHERE payment_id=$1", [
          collection.body.groupPaymentId,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("retains the successful room and original collection when another room request fails", async () => {
    const f = await fixture(),
      batch = await prepare(f);
    expect(
      (await request(`/api/groups/${f.group}/payment`, batch.paymentBody))
        .status,
    ).toBe(200);
    const [first, second] = batch.invoices;
    fiscalFailure.reservationId = first.reservationId;
    expect((await request("/api/billing/invoices", first.body)).status).toBe(
      503,
    );
    const emitted = await request("/api/billing/invoices", second.body);
    expect(emitted.status, JSON.stringify(emitted.body)).toBe(201);
    const partial = await request(`${f.path}/${batch.id}`);
    expect(partial.body.invoices.map((i: any) => i.done)).toEqual([
      false,
      true,
    ]);
    const recovery = await request("/api/billing/invoices", first.body);
    expect(recovery.status, JSON.stringify(recovery.body)).toBe(201);
    expect((await request(`${f.path}/${batch.id}`)).body.status).toBe(
      "completed",
    );
    expect(
      (
        await pool.query(
          "SELECT status FROM reservations WHERE id=ANY($1::text[])",
          [f.ids],
        )
      ).rows.every((r: any) => r.status === "checked_out"),
    ).toBe(true);
  });
  it("closes already paid rooms without a new receipt and never repeats a reversed departure", async () => {
    const f = await fixture(true),
      batch = await prepare(f);
    expect(batch.paymentBody).toBeNull();
    const closed = await request(`${f.path}/${batch.id}/collection`, {});
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    await pool.query("UPDATE reservations SET status='confirmed' WHERE id=$1", [
      f.ids[0],
    ]);
    expect((await request(`${f.path}/${batch.id}/collection`, {})).status).toBe(
      200,
    );
    expect(
      (
        await pool.query("SELECT status FROM reservations WHERE id=$1", [
          f.ids[0],
        ])
      ).rows[0].status,
    ).toBe("confirmed");
    expect(
      (
        await pool.query("SELECT id FROM group_payments WHERE group_id=$1", [
          f.group,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("reuses preparation identity and rejects overlapping closures and stale previews", async () => {
    const f = await fixture(),
      batch = await prepare(f);
    const replay = await request(f.path, batch.prepareBody);
    expect(replay.body.id).toBe(batch.id);
    const other = await request(f.path, {
      ...batch.prepareBody,
      operationId: randomUUID(),
    });
    expect(other.status).toBe(409);
    const g = await fixture(),
      view = await request(g.path + "/preview", g.draft);
    await pool.query(
      "UPDATE reservations SET total_room_amount=122 WHERE id=$1",
      [g.ids[0]],
    );
    const stale = await request(g.path, {
      ...g.draft,
      operationId: randomUUID(),
      fingerprint: view.body.fingerprint,
      paymentRows: [
        { method: "efectivo", amount: "242", reference: "Synthetic" },
      ],
      receiverDetails: view.body.payer,
    });
    expect(stale.status).toBe(409);
    expect(
      (
        await pool.query(
          "SELECT operation_id FROM group_room_invoice_batches WHERE group_id=$1",
          [g.group],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("preserves the original CC room allocations and creates no extra debt or Caja movement while issuing individual documents", async () => {
    const f = await fixture();
    await pool.query(
      "INSERT INTO companies(id,razon_social,cuil_cuit,condicion_iva) VALUES($1,'Synthetic Batch Company','00000000000','consumidor_final')",
      [f.group + "company"],
    );
    await pool.query(
      "UPDATE groups SET billing_entity_type='company',billing_entity_id=$2 WHERE id=$1",
      [f.group, f.group + "company"],
    );
    const view = await request(f.path + "/preview", f.draft);
    expect(view.body.blockers).toEqual([]);
    const made = await request(f.path, {
      ...f.draft,
      operationId: randomUUID(),
      fingerprint: view.body.fingerprint,
      paymentRows: [
        {
          method: "cuenta_corriente",
          amount: "242",
          reference: "Synthetic CC",
        },
      ],
      receiverDetails: view.body.payer,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const batch = made.body;
    const collected = await request(
      `/api/groups/${f.group}/payment`,
      batch.paymentBody,
    );
    expect(collected.status, JSON.stringify(collected.body)).toBe(200);
    const before = (
      await pool.query("SELECT * FROM account_movements WHERE entity_id=$1", [
        f.group + "company",
      ])
    ).rows;
    expect(before).toHaveLength(2);
    expect(before.reduce((n: number, r: any) => n + Number(r.amount), 0)).toBe(
      242,
    );
    for (const invoice of batch.invoices) {
      const issued = await request("/api/billing/invoices", invoice.body);
      expect(issued.status, JSON.stringify(issued.body)).toBe(201);
    }
    expect(
      (
        await pool.query("SELECT * FROM account_movements WHERE entity_id=$1", [
          f.group + "company",
        ])
      ).rows,
    ).toEqual(before);
    expect(
      (
        await pool.query("SELECT id FROM cash_movements WHERE payment_id=$1", [
          collected.body.groupPaymentId,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("preserves split tenders and retentions while fiscal documentation creates no additional collection", async () => {
    const f = await fixture(),
      view = await request(f.path + "/preview", f.draft);
    const made = await request(f.path, {
      ...f.draft,
      operationId: randomUUID(),
      fingerprint: view.body.fingerprint,
      receiverDetails: view.body.payer,
      paymentRows: [
        { method: "efectivo", amount: "100", reference: "Synthetic cash" },
        {
          method: "transferencia",
          amount: "132",
          reference: "Synthetic transfer",
          retention: { tipo: "iibb", monto: 10 },
        },
      ],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const batch = made.body;
    const received = await request(
      `/api/groups/${f.group}/payment`,
      batch.paymentBody,
    );
    expect(received.status, JSON.stringify(received.body)).toBe(200);
    for (const invoice of batch.invoices)
      expect(
        (await request("/api/billing/invoices", invoice.body)).status,
      ).toBe(201);
    const cash = (
      await pool.query(
        "SELECT amount,payment_method FROM cash_movements WHERE payment_id=$1",
        [received.body.groupPaymentId],
      )
    ).rows;
    expect(cash).toHaveLength(2);
    expect(cash.reduce((n: number, r: any) => n + Number(r.amount), 0)).toBe(
      232,
    );
    const paid = (
      await pool.query(
        "SELECT amount,notes FROM payments WHERE reservation_id=ANY($1::text[])",
        [f.ids],
      )
    ).rows;
    expect(paid.reduce((n: number, r: any) => n + Number(r.amount), 0)).toBe(
      242,
    );
    expect(
      paid.reduce(
        (n: number, r: any) =>
          n + (r.notes ? Number(JSON.parse(r.notes).retencion?.monto || 0) : 0),
        0,
      ),
    ).toBe(10);
  });
  it("keeps the original fiscal identity when configuration changes after collection", async () => {
    const f = await fixture(),
      batch = await prepare(f);
    expect(
      (await request(`/api/groups/${f.group}/payment`, batch.paymentBody))
        .status,
    ).toBe(200);
    const config = (
      await pool.query(
        "SELECT id,cuit,arca_cuit FROM billing_config ORDER BY id LIMIT 1",
      )
    ).rows[0];
    try {
      await pool.query(
        "UPDATE billing_config SET cuit='11111111111',arca_cuit='11111111111' WHERE id=$1",
        [config.id],
      );
      expect(
        (await request("/api/billing/invoices", batch.invoices[0].body)).status,
      ).toBe(409);
      expect(
        (
          await pool.query(
            "SELECT id FROM sales_invoices WHERE reserva_id=ANY($1::text[])",
            [f.ids],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await pool.query(
        "UPDATE billing_config SET cuit=$2,arca_cuit=$3 WHERE id=$1",
        [config.id, config.cuit, config.arca_cuit],
      );
    }
  });
  it("retires only an unstarted plan and rejects delayed original collection and invoice requests afterwards", async () => {
    const f = await fixture(),
      batch = await prepare(f);
    expect((await request(`${f.path}/${batch.id}/retire`, {})).status).toBe(
      200,
    );
    expect(
      (await request(`/api/groups/${f.group}/payment`, batch.paymentBody))
        .status,
    ).toBe(409);
    expect(
      (await request("/api/billing/invoices", batch.invoices[0].body)).status,
    ).toBe(409);
    expect(
      (
        await pool.query("SELECT id FROM group_payments WHERE group_id=$1", [
          f.group,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("refuses to retire a collected plan and preserves the receipt if it is subsequently reversed", async () => {
    const f = await fixture(),
      batch = await prepare(f);
    const collected = await request(
      `/api/groups/${f.group}/payment`,
      batch.paymentBody,
    );
    expect(collected.status).toBe(200);
    expect((await request(`${f.path}/${batch.id}/retire`, {})).status).toBe(
      409,
    );
    await pool.query("DELETE FROM group_payments WHERE id=$1", [
      collected.body.groupPaymentId,
    ]);
    expect(
      (await request(`/api/groups/${f.group}/payment`, batch.paymentBody))
        .status,
    ).toBe(409);
    expect(
      (await request(`${f.path}/${batch.id}`)).body.collection.review,
    ).toBe(true);
  });
});
