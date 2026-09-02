import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillGroupPaymentSettlementBreakdowns } from "../migrate";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

type Scenario =
  | "valid"
  | "no-candidate"
  | "multiple-candidates"
  | "missing-intent"
  | "malformed-intent"
  | "different-totals";

type Fixture = {
  groupId: string;
  paymentIds: Record<Scenario, string>;
  invoiceIds: Partial<Record<Scenario, number>>;
  childPaymentIds: string[];
};

type FinancialSnapshot = {
  groupPayment: {
    amount: string;
    method: string;
    payment_method_detail: unknown;
    retention_detail: unknown;
    invoice_ref: string | null;
    invoice_id: number | null;
  };
  childPayment: {
    amount: string;
    method: string;
    notes: string | null;
    invoice_ref: string | null;
    group_payment_id: string | null;
  };
  invoiceGroupPaymentIds: Array<string | null>;
};

const scenarios: Scenario[] = [
  "valid",
  "no-candidate",
  "multiple-candidates",
  "missing-intent",
  "malformed-intent",
  "different-totals",
];

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");

  const suffix = randomUUID();
  const groupId = `pg-settlement-backfill-group-${suffix}`;
  const paymentIds = Object.fromEntries(
    scenarios.map((scenario) => [scenario, `pg-settlement-backfill-${scenario}-${suffix}`]),
  ) as Record<Scenario, string>;
  const childPaymentIds: string[] = [];
  const invoiceIds: Partial<Record<Scenario, number>> = {};

  await testPool.query(
    `INSERT INTO groups
      (id, group_code, name, check_in_date, check_out_date, status, created_at)
     VALUES ($1, $2, 'Backfill fiscal histórico', DATE '2026-08-28',
             DATE '2026-08-29', 'checked_out', NOW())`,
    [groupId, `BF-${suffix}`],
  );

  for (const scenario of scenarios) {
    const paymentId = paymentIds[scenario];
    const amount = scenario === "valid" ? "80.00" : "70.00";
    const paymentRef = `legacy-ref-${scenario}-${suffix}`;
    const paymentMethodDetail = [{ method: "transferencia", amount }];
    const retentionDetail = [{ tipo: "IIBB", monto: "3.50" }];

    await testPool.query(
      `INSERT INTO group_payments
        (id, group_id, amount, method, date, reference, distribution,
         payment_method_detail, retention_detail, invoice_ref, receipt_type)
       VALUES ($1, $2, $3, 'transferencia', DATE '2026-08-28', $4, 'master_folio',
               $5::jsonb, $6::jsonb, $7, 'factura_a')`,
      [
        paymentId,
        groupId,
        amount,
        paymentRef,
        JSON.stringify(paymentMethodDetail),
        JSON.stringify(retentionDetail),
        scenario === "no-candidate" ? JSON.stringify({ id: 2147483647 }) : null,
      ],
    );

    const childPaymentId = `pg-settlement-backfill-child-${scenario}-${suffix}`;
    childPaymentIds.push(childPaymentId);
    await testPool.query(
      `INSERT INTO payments
        (id, reservation_id, amount, method, date, reference, notes, invoice_ref, group_payment_id)
       VALUES ($1, $2, $3, 'transferencia', DATE '2026-08-28', $4, $5, $6, $7)`,
      [
        childPaymentId,
        `legacy-reservation-${scenario}-${suffix}`,
        amount,
        paymentRef,
        JSON.stringify({ retenciones: retentionDetail }),
        JSON.stringify({ id: 800000000 + scenarios.indexOf(scenario) }),
        paymentId,
      ],
    );

    if (scenario === "no-candidate") continue;

    const insertInvoice = async (
      invoiceKey: string,
      intent: unknown,
      total = "100.00",
      linkPaymentId: string | null = paymentId,
    ) => {
      const result = await testPool!.query<{ id: number }>(
        `INSERT INTO sales_invoices
          (tipo_comprobante, punto_venta, numero, fecha_emision,
           cliente_razon_social, cliente_condicion_iva, monto_neto,
           monto_total, estado, group_id, group_payment_id, group_payment_intent)
         VALUES ('FA', 9000, $1, DATE '2026-08-28',
                 'Cliente histórico', 'Consumidor Final', $2, $2, 'emitida',
                 $3, $4, $5::jsonb)
         RETURNING id`,
        [
          100000 + scenarios.indexOf(scenario) * 10 + (invoiceKey === "second" ? 1 : 0),
          total,
          groupId,
          linkPaymentId,
          intent === undefined ? null : JSON.stringify(intent),
        ],
      );
      return result.rows[0].id;
    };

    if (scenario === "valid") {
      const invoiceId = await insertInvoice("first", {
        body: { settlementBreakdown: { documentTotal: 100, appliedAdvances: 20, newCollection: 80 } },
      });
      invoiceIds[scenario] = invoiceId;
      await testPool.query(
        "UPDATE group_payments SET invoice_id = $1, invoice_ref = $2 WHERE id = $3",
        [invoiceId, JSON.stringify({ id: invoiceId, cae: "valid-cae" }), paymentId],
      );
    } else if (scenario === "multiple-candidates") {
      const firstInvoiceId = await insertInvoice("first", {
        body: { settlementBreakdown: { documentTotal: 100, appliedAdvances: 30, newCollection: 70 } },
      });
      const secondInvoiceId = await insertInvoice("second", {
        body: { settlementBreakdown: { documentTotal: 100, appliedAdvances: 30, newCollection: 70 } },
      }, "100.00", paymentId);
      invoiceIds[scenario] = firstInvoiceId;
      await testPool.query(
        `UPDATE group_payments
         SET invoice_id = $1, invoice_ref = $2
         WHERE id = $3`,
        [firstInvoiceId, JSON.stringify({ id: secondInvoiceId, cae: "conflicting-cae" }), paymentId],
      );
    } else {
      const intent = scenario === "missing-intent"
        ? undefined
        : scenario === "malformed-intent"
          ? { body: { settlementBreakdown: { documentTotal: "not-a-number", appliedAdvances: 30, newCollection: 70 } } }
          : { body: { settlementBreakdown: { documentTotal: 90, appliedAdvances: 20, newCollection: 70 } } };
      const invoiceId = await insertInvoice("first", intent);
      invoiceIds[scenario] = invoiceId;
      await testPool.query(
        "UPDATE group_payments SET invoice_id = $1, invoice_ref = $2 WHERE id = $3",
        [invoiceId, JSON.stringify({ id: invoiceId, cae: `${scenario}-cae` }), paymentId],
      );
    }
  }

  return { groupId, paymentIds, invoiceIds, childPaymentIds };
}

async function readFinancialSnapshots(fixture: Fixture): Promise<Record<Scenario, FinancialSnapshot>> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");

  const result = await testPool.query<{
    id: string;
    amount: string;
    method: string;
    payment_method_detail: unknown;
    retention_detail: unknown;
    invoice_ref: string | null;
    invoice_id: number | null;
    child_amount: string;
    child_method: string;
    child_notes: string | null;
    child_invoice_ref: string | null;
    child_group_payment_id: string | null;
    invoice_group_payment_ids: Array<string | null> | null;
  }>(
    `SELECT
       gp.id,
       gp.amount, gp.method, gp.payment_method_detail, gp.retention_detail,
       gp.invoice_ref, gp.invoice_id,
       child.amount AS child_amount, child.method AS child_method,
       child.notes AS child_notes, child.invoice_ref AS child_invoice_ref,
       child.group_payment_id AS child_group_payment_id,
       COALESCE((
         SELECT array_agg(si.group_payment_id ORDER BY si.id)
         FROM sales_invoices si
         WHERE si.group_id = gp.group_id
           AND (
             si.id = gp.invoice_id
             OR si.group_payment_id = gp.id
             OR si.id::text = substring(gp.invoice_ref FROM '"id"\\s*:\\s*([0-9]+)')
           )
       ), ARRAY[]::varchar[]) AS invoice_group_payment_ids
     FROM group_payments gp
     JOIN payments child ON child.group_payment_id = gp.id
     WHERE gp.group_id = $1
     ORDER BY gp.id`,
    [fixture.groupId],
  );

  return Object.fromEntries(result.rows.map((row) => [
    scenarios.find((scenario) => fixture.paymentIds[scenario] === row.id)!,
    {
      groupPayment: {
        amount: row.amount,
        method: row.method,
        payment_method_detail: row.payment_method_detail,
        retention_detail: row.retention_detail,
        invoice_ref: row.invoice_ref,
        invoice_id: row.invoice_id,
      },
      childPayment: {
        amount: row.child_amount,
        method: row.child_method,
        notes: row.child_notes,
        invoice_ref: row.child_invoice_ref,
        group_payment_id: row.child_group_payment_id,
      },
      invoiceGroupPaymentIds: row.invoice_group_payment_ids || [],
    },
  ])) as Record<Scenario, FinancialSnapshot>;
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;
  await testPool.query("DELETE FROM payments WHERE id = ANY($1::varchar[])", [fixture.childPaymentIds]);
  await testPool.query("DELETE FROM sales_invoices WHERE group_id = $1", [fixture.groupId]);
  await testPool.query("DELETE FROM group_payments WHERE group_id = $1", [fixture.groupId]);
  await testPool.query("DELETE FROM groups WHERE id = $1", [fixture.groupId]);
}

runIfDatabaseIsConfigured("PostgreSQL real: backfill de desglose fiscal histórico", () => {
  let fixture: Fixture;
  let before: Record<Scenario, FinancialSnapshot>;
  let afterFirstRun: Record<Scenario, FinancialSnapshot>;

  beforeAll(async () => {
    fixture = await createFixture();
    before = await readFinancialSnapshots(fixture);
  });

  afterAll(async () => {
    if (fixture) await cleanupFixture(fixture);
    await testPool?.end();
  });

  it("reconstruye solo el vínculo único con intención válida y conserva finanzas", async () => {
    await backfillGroupPaymentSettlementBreakdowns();
    afterFirstRun = await readFinancialSnapshots(fixture);

    expect(afterFirstRun).toEqual(before);

    const result = await testPool!.query(
      `SELECT
         gp.id,
         gp.settlement_breakdown, gp.settlement_breakdown_status
       FROM group_payments gp
       WHERE gp.group_id = $1`,
      [fixture.groupId],
    );
    const rows = Object.fromEntries(result.rows.map((row) => [
      scenarios.find((scenario) => fixture.paymentIds[scenario] === row.id)!,
      row,
    ]));

    expect(rows.valid).toMatchObject({
      settlement_breakdown: { documentTotal: 100, appliedAdvances: 20, newCollection: 80 },
      settlement_breakdown_status: "reconstructed_from_fiscal_intent",
    });
    for (const scenario of scenarios.filter((value) => value !== "valid")) {
      expect(rows[scenario]).toMatchObject({
        settlement_breakdown: null,
        settlement_breakdown_status: "not_reconstructible",
      });
    }
  });

  it("es idempotente al ejecutarse por segunda vez", async () => {
    await backfillGroupPaymentSettlementBreakdowns();
    expect(await readFinancialSnapshots(fixture)).toEqual(afterFirstRun);

    const result = await testPool!.query(
      `SELECT settlement_breakdown, settlement_breakdown_status
       FROM group_payments
       WHERE group_id = $1 AND id = $2`,
      [fixture.groupId, fixture.paymentIds.valid],
    );
    expect(result.rows[0]).toEqual({
      settlement_breakdown: { documentTotal: 100, appliedAdvances: 20, newCollection: 80 },
      settlement_breakdown_status: "reconstructed_from_fiscal_intent",
    });
  });
});