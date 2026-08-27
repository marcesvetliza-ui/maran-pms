import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Guards the Reportes › Grupos "Pagos de Grupos" group/status filters
 * (client/src/pages/reports.tsx groupPaymentsGroupFilter/groupPaymentsStatusFilter)
 * against a regression in their real SQL implementation:
 * DatabaseStorage.groupPaymentStatusCondition / getReportGroupPayments in
 * server/db-storage.ts. That logic mirrors the client's getGroupPaymentStatus
 * (covered by a separate pure unit test) — "anulado" wins whenever
 * invoice_nc_ref is set, "facturado" requires invoice_ref with no NC, and
 * everything else is "pendiente". This suite seeds real group_payments rows
 * in each status across two groups and proves the group/status filters (and
 * the status-independent group-options endpoint) narrow correctly against
 * PostgreSQL.
 *
 * It also seeds rows with an empty string ('') rather than NULL in
 * invoice_ref/invoice_nc_ref. No write path in the app produces an empty
 * string today (invoice_ref/invoice_nc_ref are always NULL or a
 * JSON.stringify(...) payload), but the text columns permit it, and an empty
 * string is NOT NULL in SQL — so the SQL predicate must treat '' the same as
 * NULL (absent) to keep matching the client's getGroupPaymentStatus, which
 * already treats '' as falsy via a plain `if (gp.invoiceRef)` check.
 */

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

const testPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

type Fixture = {
  groupAId: string;
  groupBId: string;
  pendienteId: string;
  facturadoAId: string;
  anuladoId: string;
  facturadoBId: string;
  emptyInvoiceRefId: string;
  emptyNcRefId: string;
};

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const suffix = randomUUID();

  const fixture: Fixture = {
    groupAId: `pg-report-filter-group-a-${suffix}`,
    groupBId: `pg-report-filter-group-b-${suffix}`,
    pendienteId: randomUUID(),
    facturadoAId: randomUUID(),
    anuladoId: randomUUID(),
    facturadoBId: randomUUID(),
    emptyInvoiceRefId: randomUUID(),
    emptyNcRefId: randomUUID(),
  };

  await testPool.query(
    `INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, master_folio_config, created_at)
     VALUES
       ($1, $2, 'Grupo A — filtro reportes', DATE '2026-08-20', DATE '2026-08-22', 'confirmed', 'accommodation', NOW()),
       ($3, $4, 'Grupo B — filtro reportes', DATE '2026-08-20', DATE '2026-08-22', 'confirmed', 'accommodation', NOW())`,
    [fixture.groupAId, `PGRFA-${suffix}`, fixture.groupBId, `PGRFB-${suffix}`],
  );

  // Group A: one payment in each of the three derived statuses.
  await testPool.query(
    `INSERT INTO group_payments (id, group_id, amount, method, date, invoice_ref, invoice_nc_ref)
     VALUES ($1, $2, '100.00', 'efectivo', DATE '2026-08-21', NULL, NULL)`,
    [fixture.pendienteId, fixture.groupAId],
  );
  await testPool.query(
    `INSERT INTO group_payments (id, group_id, amount, method, date, invoice_ref, invoice_nc_ref)
     VALUES ($1, $2, '200.00', 'transferencia', DATE '2026-08-21', $3, NULL)`,
    [fixture.facturadoAId, fixture.groupAId, JSON.stringify({ cae: "fake-cae-1" })],
  );
  await testPool.query(
    `INSERT INTO group_payments (id, group_id, amount, method, date, invoice_ref, invoice_nc_ref)
     VALUES ($1, $2, '300.00', 'transferencia', DATE '2026-08-21', $3, $4)`,
    [fixture.anuladoId, fixture.groupAId, JSON.stringify({ cae: "fake-cae-2" }), JSON.stringify({ cae: "fake-nc-cae" })],
  );

  // Group B: a facturado payment, used to prove groupId scoping and that
  // the group-options endpoint stays independent of the status filter.
  await testPool.query(
    `INSERT INTO group_payments (id, group_id, amount, method, date, invoice_ref, invoice_nc_ref)
     VALUES ($1, $2, '400.00', 'efectivo', DATE '2026-08-21', $3, NULL)`,
    [fixture.facturadoBId, fixture.groupBId, JSON.stringify({ cae: "fake-cae-3" })],
  );

  // Defensive edge cases: an empty string ('') in either reference column
  // must be treated as absent, exactly like NULL — never as its own status.
  await testPool.query(
    `INSERT INTO group_payments (id, group_id, amount, method, date, invoice_ref, invoice_nc_ref)
     VALUES ($1, $2, '50.00', 'efectivo', DATE '2026-08-21', '', NULL)`,
    [fixture.emptyInvoiceRefId, fixture.groupAId],
  );
  await testPool.query(
    `INSERT INTO group_payments (id, group_id, amount, method, date, invoice_ref, invoice_nc_ref)
     VALUES ($1, $2, '60.00', 'efectivo', DATE '2026-08-21', $3, '')`,
    [fixture.emptyNcRefId, fixture.groupAId, JSON.stringify({ cae: "fake-cae-4" })],
  );

  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;
  await testPool.query("DELETE FROM group_payments WHERE group_id IN ($1, $2)", [fixture.groupAId, fixture.groupBId]);
  await testPool.query("DELETE FROM groups WHERE id IN ($1, $2)", [fixture.groupAId, fixture.groupBId]);
}

runIfDatabaseIsConfigured("PostgreSQL real: Reportes › Grupos group/status filters", () => {
  let storage: Awaited<typeof import("../db-storage")>["storage"];
  let fixture: Fixture;

  beforeAll(async () => {
    if (!testPool) return;
    ({ storage } = await import("../db-storage"));
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (!fixture) return;
    await cleanupFixture(fixture);
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  // Every assertion below filters the raw query result down to this
  // fixture's own rows before asserting, so pre-existing unrelated
  // group_payments in the same date window can never make the test flaky.
  function ours(rows: any[]): any[] {
    const ownIds = new Set([
      fixture.pendienteId, fixture.facturadoAId, fixture.anuladoId, fixture.facturadoBId,
      fixture.emptyInvoiceRefId, fixture.emptyNcRefId,
    ]);
    return rows.filter((r) => ownIds.has(r.id));
  }

  it("returns every fixture payment when no group/status filter is applied", async () => {
    const rows = await storage.getReportGroupPayments("2026-08-20", "2026-08-22");
    const found = ours(rows);
    expect(found.map((r) => r.id).sort()).toEqual(
      [
        fixture.pendienteId, fixture.facturadoAId, fixture.anuladoId, fixture.facturadoBId,
        fixture.emptyInvoiceRefId, fixture.emptyNcRefId,
      ].sort(),
    );
  });

  it("status=pendiente narrows to payments with neither invoiceRef nor invoiceNcRef, including an empty-string invoiceRef", async () => {
    const rows = await storage.getReportGroupPayments("2026-08-20", "2026-08-22", undefined, "pendiente");
    // emptyInvoiceRefId has invoice_ref = '' (not NULL) — it must still read
    // as pendiente, matching the client's `if (gp.invoiceRef)` falsy check.
    expect(ours(rows).map((r) => r.id).sort()).toEqual([fixture.pendienteId, fixture.emptyInvoiceRefId].sort());
  });

  it("status=facturado narrows to payments with invoiceRef and no invoiceNcRef, including an empty-string invoiceNcRef, across groups", async () => {
    const rows = await storage.getReportGroupPayments("2026-08-20", "2026-08-22", undefined, "facturado");
    // emptyNcRefId has invoice_nc_ref = '' (not NULL) — it must still read as
    // facturado, not anulado, matching the client's falsy check on invoiceNcRef.
    expect(ours(rows).map((r) => r.id).sort()).toEqual(
      [fixture.facturadoAId, fixture.facturadoBId, fixture.emptyNcRefId].sort(),
    );
  });

  it("status=anulado narrows to payments with invoiceNcRef set, even though invoiceRef is also set", async () => {
    const rows = await storage.getReportGroupPayments("2026-08-20", "2026-08-22", undefined, "anulado");
    expect(ours(rows).map((r) => r.id)).toEqual([fixture.anuladoId]);
  });

  it("groupId scopes to a single group's payments regardless of status", async () => {
    const rows = await storage.getReportGroupPayments("2026-08-20", "2026-08-22", fixture.groupAId);
    expect(ours(rows).map((r) => r.id).sort()).toEqual(
      [
        fixture.pendienteId, fixture.facturadoAId, fixture.anuladoId,
        fixture.emptyInvoiceRefId, fixture.emptyNcRefId,
      ].sort(),
    );
  });

  it("combines groupId and status filters", async () => {
    const rows = await storage.getReportGroupPayments("2026-08-20", "2026-08-22", fixture.groupAId, "facturado");
    expect(ours(rows).map((r) => r.id).sort()).toEqual([fixture.facturadoAId, fixture.emptyNcRefId].sort());
  });

  it("the group-options dropdown lists both groups independent of any status filter", async () => {
    const options = await storage.getReportGroupPaymentsGroupOptions("2026-08-20", "2026-08-22");
    const ids = options.map((o) => o.id);
    expect(ids).toContain(fixture.groupAId);
    expect(ids).toContain(fixture.groupBId);
  });
}, 30_000);
