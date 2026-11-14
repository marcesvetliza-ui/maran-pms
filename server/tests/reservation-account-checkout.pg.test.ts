import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { storage } from "../db-storage";
import { checkoutReservationToAccount } from "../billing/reservationAccountCheckout";
import { verifyFinancialSchema } from "../migrate";

vi.mock("../auth", () => ({ requireAuth: (_req: any, _res: any, next: () => void) => next(), requireRole: () => (_req: any, _res: any, next: () => void) => next(), requirePermission: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../email-service", () => ({ sendCheckoutEmail: vi.fn().mockResolvedValue(undefined), sendConfirmationEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const url = process.env.DATABASE_URL;
const enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled && (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname) || !/test/i.test(new URL(url!).pathname))) throw new Error("Disposable local test database required");
const pool = enabled ? new pg.Pool({ connectionString: url }) : null;
const actor = { id: "account-checkout-test", username: "account-checkout-test" };
let server: Server, base: string;
type Fixture = { id: string; guest: string; company: string; linkedCompany: string; room: string; type: string; shift: string };

async function fixture(): Promise<Fixture> {
  const id = `checkout-cc-${randomUUID()}`;
  const f = { id, guest: `${id}-guest`, company: `${id}-company`, linkedCompany: `${id}-linked`, room: `${id}-room`, type: `${id}-type`, shift: `${id}-shift` };
  await pool!.query("INSERT INTO room_types(id,code,name) VALUES($1,$2,'CC test')", [f.type, f.type]);
  await pool!.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1,$2,$3,'occupied')", [f.room, f.room, f.type]);
  await pool!.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Guest')", [f.guest]);
  await pool!.query("INSERT INTO companies(id,razon_social,cuil_cuit) VALUES($1,'Selected account',$2),($3,'Linked company',$4)", [f.company, f.company, f.linkedCompany, f.linkedCompany]);
  await pool!.query(`INSERT INTO reservations(id,reservation_code,guest_id,company_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,total_room_amount,created_at)
    VALUES($1,$6,$2,$3,$4,$5,CURRENT_DATE-2,CURRENT_DATE,2,'checked_in',0,NOW())`, [f.id, f.guest, f.linkedCompany, f.type, f.room, f.id]);
  await pool!.query(`INSERT INTO charges(id,reservation_id,description,amount,date,category)
    VALUES($1,$3,'Restaurant',97500,CURRENT_DATE,'restaurant'),($2,$3,'Transferencia entrada SPA',70000,CURRENT_DATE,'transfer_in')`, [`${id}-restaurant`, `${id}-spa`, id]);
  await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date,status) VALUES($1,$2,97500,'efectivo',CURRENT_DATE,'active')", [`${id}-paid`, id]);
  await pool!.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,items)
    VALUES('cierre_habitacion',999,floor(random()*100000000)::int,CURRENT_DATE,'Synthetic','Consumidor Final',97500,97500,'emitida',$1,'[]')`, [id]);
  await pool!.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'reception',floor(random()*1000000)::int,NOW(),'open')", [f.shift]);
  return f;
}
const payload = (f: Fixture, entityType = "guest") => ({ operationId: randomUUID(), entityType, entityId: entityType === "guest" ? f.guest : f.company, expectedBalance: "70000.00" });
async function post(f: Fixture, body: Record<string, unknown>) {
  const r = await fetch(`${base}/api/reservations/${f.id}/check-out-to-account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
}
async function facts(f: Fixture) {
  return { reservation: (await pool!.query("SELECT status FROM reservations WHERE id=$1", [f.id])).rows[0].status,
    room: (await pool!.query("SELECT status FROM rooms WHERE id=$1", [f.room])).rows[0].status,
    payments: (await pool!.query("SELECT * FROM payments WHERE reservation_id=$1 ORDER BY id", [f.id])).rows,
    accounts: (await pool!.query("SELECT * FROM account_movements WHERE reservation_id=$1", [f.id])).rows,
    cash: (await pool!.query("SELECT payment_method,movement_type,amount FROM cash_movements WHERE source_id=$1", [f.id])).rows,
    invoices: (await pool!.query("SELECT to_jsonb(si) AS data FROM sales_invoices si WHERE reserva_id=$1", [f.id])).rows,
    audit: (await pool!.query("SELECT id FROM audit_logs WHERE entity_id=$1", [f.id])).rows };
}
async function clean(f: Fixture) {
  for (const [table, key] of [["audit_logs", "entity_id"], ["reservation_changelog", "reservation_id"], ["account_movements", "reservation_id"], ["cash_movements", "source_id"], ["sales_invoices", "reserva_id"], ["charges", "reservation_id"], ["payments", "reservation_id"]]) await pool!.query(`DELETE FROM ${table} WHERE ${key}=$1`, [f.id]);
  await pool!.query("DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_id=$1)", [f.id]);
  await pool!.query("DELETE FROM folios WHERE entity_id=$1", [f.id]);
  await pool!.query("DELETE FROM reservations WHERE id=$1", [f.id]);
  await pool!.query("DELETE FROM rooms WHERE id=$1", [f.room]);
  await pool!.query("DELETE FROM room_types WHERE id=$1", [f.type]);
  await pool!.query("DELETE FROM guests WHERE id=$1", [f.guest]);
  await pool!.query("DELETE FROM companies WHERE id IN($1,$2)", [f.company, f.linkedCompany]);
  await pool!.query("DELETE FROM cash_shifts WHERE id=$1", [f.shift]);
}

describe.skipIf(!enabled)("atomic checkout with the operational balance transferred to Cuenta Corriente", () => {
  beforeAll(async () => {
    expect((await verifyFinancialSchema()).ready).toBe(true);
    vi.spyOn(storage, "createCheckoutCleaningTask").mockResolvedValue(undefined as any);
    const { registerReservationsRoutes } = await import("../routes/reservations");
    const app = express(); app.use(express.json());
    app.use((req: any, _res, next) => { req.isAuthenticated = () => true; req.user = actor; next(); });
    registerReservationsRoutes(app); server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await pool?.end(); const { pool: applicationPool } = await import("../db"); await applicationPool.end(); vi.restoreAllMocks(); });

  it.each(["guest", "company"])("closes the room and transfers exactly $70,000 to the selected %s once", async entityType => {
    const f = await fixture();
    try {
      const before = await facts(f); const body = payload(f, entityType);
      expect((await Promise.all([post(f, body), post(f, body)])).map(r => r.status)).toEqual([200, 200]);
      expect((await post(f, body)).status).toBe(200);
      const after = await facts(f);
      expect(after.reservation).toBe("checked_out"); expect(after.room).toBe("dirty");
      expect(after.invoices).toEqual(before.invoices);
      expect(after.payments).toHaveLength(2);
      expect(after.accounts).toHaveLength(1);
      expect(after.accounts[0]).toMatchObject({entity_type: entityType, entity_id: body.entityId, amount: "70000.00", type: "cargo"});
      expect(after.cash).toEqual([{payment_method:"current_account",movement_type:"informational",amount:"70000.00"}]);
      expect(after.audit).toHaveLength(1);
      expect((await post(f, {...body,operationId:randomUUID()})).status).toBe(409);
    } finally { await clean(f); }
  });

  it("rejects a changed balance without closing or transferring money", async () => {
    const f = await fixture();
    try { await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date) VALUES($1,$2,5000,'efectivo',CURRENT_DATE)", [`${f.id}-new`,f.id]);
      const before = await facts(f); const result = await post(f,payload(f));
      expect(result).toMatchObject({status:409,body:{notApplied:true}}); expect(await facts(f)).toEqual(before);
    } finally { await clean(f); }
  });

  it.each(["guest", "company"])("rejects an invalid %s account without closing", async entityType => {
    const f=await fixture();try {const before=await facts(f);expect((await post(f,{...payload(f,entityType),entityId:'nonexistent'})).status).toBe(400);expect(await facts(f)).toEqual(before);}finally{await clean(f);}
  });

  it("preserves a pending fiscal authorization", async () => {
    const f=await fixture();try{await pool!.query("UPDATE sales_invoices SET estado='autorizacion_pendiente' WHERE reserva_id=$1",[f.id]);const before=await facts(f);expect((await post(f,payload(f))).status).toBe(409);expect(await facts(f)).toEqual(before);}finally{await clean(f);}
  });

  it("preserves a group balance for the Folio Maestro", async () => {
    const f=await fixture();const group=`${f.id}-group`;
    try {
      await pool!.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at) VALUES($1,$2,'Synthetic CC group',CURRENT_DATE,CURRENT_DATE+1,'confirmed',NOW())",[group,group]);
      await pool!.query("INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES($1,$2,$3)",[randomUUID(),group,f.id]);
      const before=await facts(f);expect((await post(f,payload(f))).status).toBe(409);expect(await facts(f)).toEqual(before);
    }finally{await pool!.query("DELETE FROM group_reservation_links WHERE group_id=$1",[group]);await pool!.query("DELETE FROM groups WHERE id=$1",[group]);await clean(f);}
  });

  it("does not duplicate an old account cargo lacking its settlement", async () => {
    const f=await fixture();try{await pool!.query("INSERT INTO account_movements(entity_type,entity_id,date,type,description,amount,reservation_id) VALUES('guest',$1,CURRENT_DATE,'cargo','Old debt',70000,$2)",[f.guest,f.id]);const before=await facts(f);expect((await post(f,payload(f))).status).toBe(409);expect(await facts(f)).toEqual(before);}finally{await clean(f);}
  });

  it("rolls back the account, payment, room and cash information when auditing fails", async () => {
    const f=await fixture();const trigger=`cc_fail_${randomUUID().replaceAll('-','')}`;
    try {
      await pool!.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.id}' THEN RAISE EXCEPTION 'synthetic checkout audit failure'; END IF; RETURN NEW; END $$`);
      await pool!.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
      const before=await facts(f);expect((await post(f,payload(f))).status).toBe(500);expect(await facts(f)).toEqual(before);
    }finally{await pool!.query(`DROP TRIGGER IF EXISTS ${trigger} ON audit_logs`);await pool!.query(`DROP FUNCTION IF EXISTS ${trigger}()`);await clean(f);}
  });

  it("rejects a payment prepared while active if the room closed concurrently", async () => {
    const f=await fixture();try{
      expect((await post(f,payload(f))).status).toBe(200);
      const before=await facts(f);
      await expect(storage.createReservationPaymentWithLedger({expectedReservationStatus:'checked_in',payment:{reservationId:f.id,amount:'5000.00',method:'efectivo',date:'2026-11-14'},sourceLabel:'Stale payment'})).rejects.toMatchObject({statusCode:409});
      expect(await facts(f)).toEqual(before);
    }finally{await clean(f);}
  });
  it("waits for an ordinary checkout without holding the inventory mutex", async () => {
    const f=await fixture();const client=await pool!.connect();let pending:ReturnType<typeof checkoutReservationToAccount>|undefined;
    const finance=`reservation-finance:${f.id}`,inventory='lodging-inventory-mutations';
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))',[finance]);
      pending=checkoutReservationToAccount(f.id,payload(f),actor);
      let waiting=false;
      for(let attempt=0;attempt<100&&!waiting;attempt++){
        const locks=await pool!.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=(hashtext($1)::bigint & 4294967295)::oid AND NOT granted",[finance]);
        waiting=locks.rows.length>0;if(!waiting)await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(waiting).toBe(true);
      const result=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[inventory]);
      expect(result.rows[0].acquired).toBe(true);
    }finally{
      await client.query('SELECT pg_advisory_unlock(hashtext($1))',[inventory]);
      await client.query('SELECT pg_advisory_unlock(hashtext($1))',[finance]);
      client.release();try{if(pending)await pending;}finally{await clean(f);}
    }
  });
});
