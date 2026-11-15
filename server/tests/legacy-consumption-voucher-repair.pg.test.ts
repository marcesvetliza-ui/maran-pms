import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { repairLegacyConsumptionVoucher } from "../billing/legacyConsumptionVoucherRepair";

const url = process.env.DATABASE_URL;
const available = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (available) {
  const target = new URL(url!);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || !/test/i.test(target.pathname)) {
    throw new Error("Voucher repair tests require a disposable local test database.");
  }
}
const reservationId = "d8b09f1c-3b0b-4f2e-bbfb-e3b1691fb6ab";
const chargeId = "d44d7e28-13a5-4769-a47c-7868eff04d38";
const description = "Restaurante - Pedido ORD-20260328-7534";
const schema = `voucher_repair_${randomUUID().replaceAll("-", "")}`;
let root: pg.Pool, pool: pg.Pool;
let fiscalStatus: typeof import("../nightlyPricingGuard").accommodationFiscalStatus;
let pricingGuard: typeof import("../nightlyPricingGuard").guardPricingUpdate;
const tables = ["reservations", "charges", "sales_invoices", "payments", "cash_movements", "audit_logs", "reservation_changelog", "group_reservation_links"];

describe.skipIf(!available)("authorized historical consumption voucher attribution repair", () => {
  beforeAll(async () => {
    root = new pg.Pool({ connectionString: url });
    await root.query(`CREATE SCHEMA ${schema}`);
    for (const table of tables) await root.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` });
    vi.doMock("../db", () => ({ db: drizzle(pool), pool }));
    const guard = await import("../nightlyPricingGuard");
    fiscalStatus = guard.accommodationFiscalStatus;
    pricingGuard = guard.guardPricingUpdate;
  });
  beforeEach(async () => {
    for (const table of tables) await pool.query(`DELETE FROM ${table}`);
    await pool.query(`INSERT INTO reservations(id,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,pricing_scheme,reservation_code,created_at)
      VALUES($1,'synthetic-guest','synthetic-room','synthetic-type','2026-03-20','2027-03-21',366,'checked_in','legacy','RES-1774007027320-402',now())`, [reservationId]);
    await pool.query(`INSERT INTO charges(id,reservation_id,description,amount,date,category,status)
      VALUES($1,$2,$3,10000,'2026-03-28','restaurant','active')`, [chargeId, reservationId, description]);
    await pool.query(`INSERT INTO sales_invoices(id,tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,
      cliente_condicion_iva,monto_neto,monto_total,monto_acreditado,estado,modo_ficticio,reserva_id,source_charge_ids,items)
      VALUES(194,'cierre_habitacion',1,19,'2026-08-21','Synthetic guest','Consumidor Final',10000,10000,0,'emitida',false,$1,$2::jsonb,$3::jsonb)`,
      [reservationId, JSON.stringify(JSON.stringify(["accommodation", chargeId])), JSON.stringify([{cantidad:1,subtotal:10000,alicuotaIva:"no_gravado",descripcion:description,subtotalNeto:10000,precioUnitario:10000}])]);
    await pool.query(`INSERT INTO payments(id,reservation_id,amount,method,date,status,invoice_ref)
      VALUES('synthetic-payment',$1,10000,'efectivo','2026-08-21','active','{"id":194,"numero":19,"cae":null}')`, [reservationId]);
  });
  afterAll(async () => {
    vi.doUnmock("../db");
    if (pool) await pool.end();
    if (root) { await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); }
  });
  const saved = async () => Object.fromEntries(await Promise.all(tables.filter(t => !["audit_logs", "reservation_changelog"].includes(t))
    .map(async table => [table, (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows.map(r => r.row)])));

  it.each(["legacy string", "JSON array"])("unblocks the actual stay guard and preserves all financial rows (%s)", async encoding => {
    if (encoding === "JSON array") await pool.query("UPDATE sales_invoices SET source_charge_ids=$1::jsonb WHERE id=194", [JSON.stringify(["accommodation", chargeId])]);
    const before = await saved();
    expect((await fiscalStatus(reservationId)).state).toBe("revisar");
    await expect(pricingGuard({id:reservationId,pricingScheme:"legacy",checkOutDate:"2027-03-21"},{checkOutDate:"2026-11-15"}))
      .rejects.toMatchObject({statusCode:409});
    expect(await repairLegacyConsumptionVoucher(pool)).toBe("applied");
    expect((await fiscalStatus(reservationId)).blocked).toBeNull();
    await expect(pricingGuard({id:reservationId,pricingScheme:"legacy",checkOutDate:"2027-03-21"},{checkOutDate:"2026-11-15"})).resolves.toBeUndefined();
    const after = await saved();
    before.sales_invoices[0].source_charge_ids = [chargeId];
    before.sales_invoices[0].source_charge_amounts = {[chargeId]:10000};
    expect(after).toEqual(before);
    const audit = (await pool.query("SELECT details FROM audit_logs")).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].details).after.sourceChargeAmounts).toEqual({[chargeId]:10000});
    expect((await pool.query("SELECT * FROM reservation_changelog")).rows).toHaveLength(1);
    expect(await repairLegacyConsumptionVoucher(pool)).toBe("already_applied");
    expect((await pool.query("SELECT * FROM audit_logs")).rows).toHaveLength(1);
  });

  it.each([
    ["a fiscal invoice", "UPDATE sales_invoices SET tipo_comprobante='FB'"],
    ["an ARCA authorization", "UPDATE sales_invoices SET cae='12345678901234'"],
    ["a different total", "UPDATE sales_invoices SET monto_total=10001"],
    ["existing source attribution", "UPDATE sales_invoices SET source_charge_amounts='{\"accommodation\":10000}'"],
    ["credited amounts", "UPDATE sales_invoices SET monto_acreditado=10000"],
    ["a lodging item", "UPDATE sales_invoices SET items='[{\"descripcion\":\"Alojamiento\",\"subtotal\":10000}]'"],
    ["a different reservation", "UPDATE sales_invoices SET reserva_id='another-reservation'"],
    ["a different charge amount", "UPDATE charges SET amount=9999"],
    ["a group-owned voucher", "UPDATE sales_invoices SET group_id='synthetic-group'"],
  ])("leaves %s untouched", async (_label, sql) => {
    await pool.query(sql);
    const before = await saved();
    expect(await repairLegacyConsumptionVoucher(pool)).toBe("not_applicable");
    expect(await saved()).toEqual(before);
    expect((await pool.query("SELECT * FROM audit_logs")).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM reservation_changelog")).rows).toHaveLength(0);
  });

  it("rolls back the attribution if the audit cannot be persisted", async () => {
    const before = await saved();
    await pool.query(`CREATE FUNCTION ${schema}.reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
    await pool.query(`CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_audit()`);
    try {
      await expect(repairLegacyConsumptionVoucher(pool)).rejects.toThrow("synthetic audit failure");
      expect(await saved()).toEqual(before);
      expect((await fiscalStatus(reservationId)).state).toBe("revisar");
    } finally { await pool.query("DROP TRIGGER reject_audit ON audit_logs"); }
  });

  it("continues blocking later lodging invoices after the repair", async () => {
    expect(await repairLegacyConsumptionVoucher(pool)).toBe("applied");
    await pool.query(`INSERT INTO sales_invoices(id,tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,
      cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,source_charge_amounts)
      VALUES(195,'FB',1,1,'2026-11-14','Synthetic guest','Consumidor Final',100,100,'emitida',$1,'{"accommodation":100}')`, [reservationId]);
    expect((await fiscalStatus(reservationId)).blocked).toBeTruthy();
  });
});
