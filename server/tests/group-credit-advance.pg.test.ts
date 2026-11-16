import express from "express";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GROUP_CREDIT_ADVANCE_PERMISSION } from "@shared/groupCreditAdvance";
import { groupAdvanceReceipt } from "../billing/groupAdvanceReceipt";

const enabled = !!process.env.DATABASE_URL;
if (enabled) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/test/.test(url.pathname)) {
    throw new Error("This financial suite requires a local disposable test database.");
  }
}
const prefix = `credit-advance-${randomUUID()}`;
const actorId = `${prefix}-actor`, deniedActorId = `${prefix}-denied`, shiftId = `${prefix}-shift`;
let actor = actorId, pool: any, server: any, base: string;
let storage: typeof import("../db-storage")["storage"];
const groups: string[] = [];

async function fixture(debt = 8796280) {
  const groupId = `${prefix}-${groups.length}`, roomId = `${groupId}-room`;
  groups.push(groupId);
  await pool.query(`INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at)
    VALUES($1::text,$1,'Synthetic group credit','2026-11-20','2026-11-21','confirmed',now())`, [groupId]);
  await pool.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,total_room_amount,status,created_at)
    VALUES($1::text,$1,$1,$1,$1,'2026-11-20','2026-11-21',1,$2,'confirmed',now())`, [roomId, debt]);
  await pool.query("INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES($1,$2,$3)", [groupId, groupId, roomId]);
  return { groupId, roomId };
}
function draft(amount = 12509100, balance = 8796280): any {
  return {
    paymentRequestId: randomUUID(), receiptType: "none", leaveUnassigned: true,
    paymentRows: [{ method: "transfer", amount: amount.toFixed(2), reference: "Synthetic bank advance" }],
    receiverDetails: { razonSocial: "Synthetic organizer", dni: "30123456" },
    concepts: [{ description: "Anticipo a cuenta del grupo", amount }],
    creditAdvance: { confirmed: true, expectedBalanceCents: Math.round(balance * 100), reason: "Adelanto para consumos posteriores" },
  };
}
async function post(path: string, body: any) {
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function noMoney(groupId: string) {
  expect((await pool.query("SELECT id FROM group_payments WHERE group_id=$1", [groupId])).rows).toHaveLength(0);
  expect((await pool.query("SELECT id FROM cash_movements WHERE source_id=$1", [groupId])).rows).toHaveLength(0);
}

describe.skipIf(!enabled)("authorized group advances beyond Master Folio debt (real PostgreSQL)", () => {
  beforeAll(async () => {
    ({ pool } = await import("../db"));
    ({ storage } = await import("../db-storage"));
    for (const [id, role] of [[actorId, "admin"], [deniedActorId, "housekeeping"]]) {
      await pool.query("INSERT INTO system_users(id,username,email,full_name,role,is_active,created_at) VALUES($1::text,$1,$1,'Synthetic credit operator',$2,'true',now())", [id, role]);
    }
    await pool.query("INSERT INTO role_permissions(role,resource_key) VALUES('admin',$1) ON CONFLICT DO NOTHING", [GROUP_CREDIT_ADVANCE_PERMISSION]);
    await (await import("../permissions")).loadRolePermissionsCache();
    await pool.query("INSERT INTO cash_shifts(id,area,shift_number,status,opened_at) VALUES($1,'reception',999999,'open',now())", [shiftId]);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: actor, username: actor, role: actor === actorId ? "admin" : "housekeeping" } as any;
      req.isAuthenticated = (() => true) as any;
      next();
    });
    (await import("../routes/groups")).registerGroupsRoutes(app);
    (await import("../billing/groupAccount")).registerGroupAccountRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (!pool) return;
    for (const group of groups) {
      await pool.query("DELETE FROM cash_movements WHERE source_id=$1", [group]);
      await pool.query("DELETE FROM payments WHERE reservation_id IN(SELECT reservation_id FROM group_reservation_links WHERE group_id=$1)", [group]);
      await pool.query("DELETE FROM group_account_operations WHERE group_id=$1", [group]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id=$1 OR details LIKE $2", [group, `%${group}%`]);
      await pool.query("DELETE FROM group_payments WHERE group_id=$1", [group]);
      await pool.query("DELETE FROM group_reservation_links WHERE group_id=$1", [group]);
      await pool.query("DELETE FROM reservations WHERE id=$1", [`${group}-room`]);
      await pool.query("DELETE FROM groups WHERE id=$1", [group]);
    }
    await pool.query("DELETE FROM cash_shifts WHERE id=$1", [shiftId]);
    await pool.query("DELETE FROM system_users WHERE id=ANY($1::text[])", [[actorId, deniedActorId]]);
  });

  it("collects the example once, audits credit and explicitly applies only room debt without a second Caja entry", async () => {
    const f = await fixture(), body = draft();
    const path = `/api/groups/${f.groupId}/master-payment`;
    const results = await Promise.all([post(path, body), post(path, body)]);
    expect(results.map(r => r.status), JSON.stringify(results)).toEqual([200, 200]);
    expect(results[0].body.groupPaymentId).toBe(results[1].body.groupPaymentId);
    const parent = (await pool.query("SELECT * FROM group_payments WHERE group_id=$1", [f.groupId])).rows;
    expect(parent).toHaveLength(1);
    expect(parent[0].distribution_detail).toEqual({ __unassigned__: 12509100 });
    expect(groupAdvanceReceipt(parent[0], [])).toMatchObject({ requiresReview: false, available: 12509100 });
    const cash = (await pool.query("SELECT amount FROM cash_movements WHERE payment_id=$1", [parent[0].id])).rows;
    expect(cash).toEqual([{ amount: "12509100.00" }]);
    const audits = (await pool.query("SELECT user_id,details FROM audit_logs WHERE entity_id=$1", [parent[0].id])).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0].user_id).toBe(actorId);
    expect(JSON.parse(audits[0].details)).toMatchObject({ balanceBeforeCents: 879628000, receivedCents: 1250910000, creditCents: 371282000, reason: body.creditAdvance.reason });
    const master = await fetch(base + `/api/groups/${f.groupId}/master-folio`).then(r => r.json());
    expect(master.masterBalance).toBe(-3712820);
    const allocation = { operationId: randomUUID(), receiptId: parent[0].id, allocations: { [f.roomId]: 8796280 } };
    const applied = await post(`/api/groups/${f.groupId}/allocate-advance`, allocation);
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect((await post(`/api/groups/${f.groupId}/allocate-advance`, allocation)).status).toBe(200);
    const after = (await pool.query("SELECT * FROM group_payments WHERE id=$1", [parent[0].id])).rows[0];
    const children = (await pool.query("SELECT * FROM payments WHERE group_payment_id=$1", [parent[0].id])).rows;
    expect(groupAdvanceReceipt(after, children)).toMatchObject({ requiresReview: false, available: 3712820 });
    expect(children.map((p: any) => p.amount)).toEqual(["8796280.00"]);
    expect((await pool.query("SELECT amount FROM cash_movements WHERE payment_id=$1", [parent[0].id])).rows).toEqual(cash);
    expect((await fetch(base + `/api/groups/${f.groupId}/master-folio`).then(r => r.json())).masterBalance).toBe(-3712820);
  });

  it("keeps the ordinary cap and rejects forged, missing, inactive or revoked authorization with no money recorded", async () => {
    const f = await fixture(), path = `/api/groups/${f.groupId}/master-payment`;
    const missing = draft(); delete missing.creditAdvance;
    expect((await post(path, missing)).status).toBe(400);
    actor = deniedActorId;
    try { expect((await post(path, { ...draft(), creditAdvance: { ...draft().creditAdvance, userId: actorId } })).status).toBe(403); }
    finally { actor = actorId; }
    await pool.query("UPDATE system_users SET is_active='false' WHERE id=$1", [actorId]);
    try { expect((await post(path, draft())).status).toBe(403); }
    finally { await pool.query("UPDATE system_users SET is_active='true' WHERE id=$1", [actorId]); }
    await pool.query("DELETE FROM role_permissions WHERE role='admin' AND resource_key=$1", [GROUP_CREDIT_ADVANCE_PERMISSION]);
    try { expect((await post(path, draft())).status).toBe(403); }
    finally { await pool.query("INSERT INTO role_permissions(role,resource_key) VALUES('admin',$1)", [GROUP_CREDIT_ADVANCE_PERMISSION]); }
    await noMoney(f.groupId);
  });

  it("rejects changed balances and serializes distinct concurrent confirmations of the same debt", async () => {
    const f = await fixture(), path = `/api/groups/${f.groupId}/master-payment`;
    expect((await post(path, draft(12509100, 8796280.01))).status).toBe(409);
    await noMoney(f.groupId);
    const results = await Promise.all([post(path, draft()), post(path, draft())]);
    expect(results.map(r => r.status).sort(), JSON.stringify(results)).toEqual([200, 409]);
    expect((await pool.query("SELECT id FROM cash_movements WHERE source_id=$1", [f.groupId])).rows).toHaveLength(1);
  });

  it("rejects absent confirmation, invalid reason, retentions, CC, fiscal documents and room allocations", async () => {
    const f = await fixture(), path = `/api/groups/${f.groupId}/master-payment`;
    for (const creditAdvance of [{ confirmed: false, expectedBalanceCents: 879628000, reason: "Valid reason" }, { confirmed: true, expectedBalanceCents: 879628000, reason: " " }]) {
      expect((await post(path, { ...draft(), creditAdvance })).status).toBe(400);
    }
    expect((await post(path, { ...draft(), paymentRows: [{ method: "transfer", amount: "12509099", reference: "bank", retention: { tipo: "iibb", monto: 1 } }] })).status).toBe(400);
    expect((await post(path, { ...draft(), receiptType: "factura_b" })).status).toBe(409);
    const authorization = { ...draft().creditAdvance, userId: actorId };
    await expect(storage.recordGroupPayment({ groupId: f.groupId, destination: "master_folio", paymentRows: [{ method: "cuenta_corriente", amount: "12509100" }], date: "2026-11-16", distribution: "master_folio", distributionDetail: { __unassigned__: 12509100 }, receiptType: "none", creditAdvanceAuthorization: authorization })).rejects.toMatchObject({ statusCode: 400 });
    await expect(storage.recordGroupPayment({ groupId: f.groupId, destination: "master_folio", paymentRows: [{ method: "transfer", amount: "12509100" }], date: "2026-11-16", distribution: "master_folio", distributionDetail: { [f.roomId]: 8796280, __unassigned__: 3712820 }, receiptType: "none", creditAdvanceAuthorization: authorization })).rejects.toMatchObject({ statusCode: 400 });
    await noMoney(f.groupId);
  });

  it("uses net debt after prior Master receipts, without counting their room allocations twice", async () => {
    const f = await fixture(30731280), previousId = randomUUID();
    await pool.query(`INSERT INTO group_payments(id,group_id,amount,method,date,distribution,destination,distribution_detail)
      VALUES($1,$2,'21935000','transferencia','2026-11-15','master_folio','master_folio',$3)`,
      [previousId, f.groupId, JSON.stringify({ [f.roomId]: 21935000 })]);
    await pool.query(`INSERT INTO payments(id,reservation_id,amount,method,date,status,group_payment_id)
      VALUES($1,$2,'21935000','transferencia','2026-11-15','active',$3)`, [randomUUID(), f.roomId, previousId]);
    const response = await post(`/api/groups/${f.groupId}/master-payment`, draft());
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const master = await fetch(base + `/api/groups/${f.groupId}/master-folio`).then(r => r.json());
    expect(master.masterBalance).toBe(-3712820);
    expect(master.masterPaid).toBe(34444100);
    const cash = (await pool.query("SELECT amount FROM cash_movements WHERE source_id=$1", [f.groupId])).rows;
    expect(cash).toEqual([{ amount: "12509100.00" }]);
  });

  it("accepts further credit at zero and negative balance without losing decimal cents", async () => {
    const f = await fixture(0), path = `/api/groups/${f.groupId}/master-payment`;
    expect((await post(path, draft(0.1, 0))).status).toBe(200);
    expect((await post(path, draft(0.2, -0.1))).status).toBe(200);
    expect((await fetch(base + `/api/groups/${f.groupId}/master-folio`).then(r => r.json())).masterBalance).toBeCloseTo(-0.3);
    const parents = (await pool.query("SELECT id FROM group_payments WHERE group_id=$1 ORDER BY amount DESC", [f.groupId])).rows;
    const reversal = await fetch(base + `/api/groups/${f.groupId}/master-payments/${parents[0].id}`, { method: "DELETE" });
    expect(reversal.status, await reversal.text()).toBe(200);
    expect((await fetch(base + `/api/groups/${f.groupId}/master-folio`).then(r => r.json())).masterBalance).toBeCloseTo(-0.1);
    const cash = (await pool.query("SELECT SUM(amount::numeric) AS amount FROM cash_movements WHERE source_id=$1 AND anulado=false", [f.groupId])).rows[0];
    expect(Number(cash.amount)).toBeCloseTo(0.1);
  });

  it("retains an ordinary unassigned advance without requiring the new permission", async () => {
    const f = await fixture(100), body = draft(60, 100); delete body.creditAdvance;
    actor = deniedActorId;
    try { expect((await post(`/api/groups/${f.groupId}/master-payment`, body)).status).toBe(200); }
    finally { actor = actorId; }
  });

  it("rolls back receipt, idempotency and Caja if the mandatory audit fails", async () => {
    const f = await fixture();
    await pool.query(`CREATE FUNCTION test_credit_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.description='Anticipo de grupo con saldo a favor autorizado' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_credit_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_credit_audit_failure()`);
    try {
      expect((await post(`/api/groups/${f.groupId}/master-payment`, draft())).status).toBe(500);
      await noMoney(f.groupId);
      expect((await pool.query("SELECT id FROM group_account_operations WHERE group_id=$1", [f.groupId])).rows).toHaveLength(0);
    } finally { await pool.query("DROP TRIGGER test_credit_audit_failure ON audit_logs; DROP FUNCTION test_credit_audit_failure()"); }
  });
});
