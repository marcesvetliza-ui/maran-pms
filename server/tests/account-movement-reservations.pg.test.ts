import express from "express";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
vi.mock("../auth", () => ({ requireAuth: (_req: any, _res: any, next: any) => next(), requirePermission: () => (_req: any, _res: any, next: any) => next(), requireRole: () => (_req: any, _res: any, next: any) => next() }));
const enabled = !!process.env.DATABASE_URL;
if (enabled) { const url = new URL(process.env.DATABASE_URL!); if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.includes("test")) throw Error("Reference tests require a local disposable database."); }
let db: typeof import("../db").db, pool: typeof import("../db").pool;
let enrich: typeof import("../accountMovementReservations").enrichAccountMovementReservations;
let server: any, base: string;
const id = Object.fromEntries(["company", "agency", "guestA", "guestB", "roomType", "room", "stayA", "stayB", "payment", "otherPayment", "cargoA", "cargoB", "manual", "legacy", "orphan", "agencyCargo", "guestCargo"].map(key => [key, randomUUID()]));
const canonical = "credit-operation:" + randomUUID();
async function get(path: string) { const response = await fetch(base + path); expect(response.status).toBe(200); return response.json(); }
async function stored() { return {
  movements: (await pool.query("SELECT * FROM account_movements WHERE id=ANY($1::varchar[]) ORDER BY id", [[id.cargoA, id.cargoB, id.manual, id.legacy, id.orphan, id.agencyCargo, id.guestCargo]])).rows,
  payments: (await pool.query("SELECT * FROM payments WHERE id=ANY($1::varchar[]) ORDER BY id", [[id.payment, id.otherPayment]])).rows,
}; }

describe.skipIf(!enabled)("Referencias legibles de reservas en cuenta corriente", () => {
  beforeAll(async () => {
    ({ db, pool } = await import("../db")); ({ enrichAccountMovementReservations: enrich } = await import("../accountMovementReservations"));
    await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO companies(id,razon_social,cuil_cuit) VALUES(${id.company},'Empresa sintética','30111111111')`);
      await tx.execute(sql`INSERT INTO agencies(id,razon_social,cuil_cuit) VALUES(${id.agency},'Agencia sintética','30222222222')`);
      await tx.execute(sql`INSERT INTO guests(id,first_name,last_name) VALUES(${id.guestA},'Ana','Pérez'),(${id.guestB},'Bruno','Gómez')`);
      await tx.execute(sql`INSERT INTO room_types(id,code,name,max_occupancy) VALUES(${id.roomType},${id.roomType},'Tipo sintético',2)`);
      await tx.execute(sql`INSERT INTO rooms(id,room_number,room_type_id,status) VALUES(${id.room},${id.room},${id.roomType},'available')`);
      await tx.execute(sql`INSERT INTO reservations(id,reservation_code,guest_id,company_id,room_type_id,room_id,check_in_date,check_out_date,status,created_at)
        VALUES(${id.stayA},'RES-1788973054690-614',${id.guestA},${id.company},${id.roomType},${id.room},'2026-11-20','2026-11-22','confirmed',now()),
        (${id.stayB},'RS-001304',${id.guestB},${id.company},${id.roomType},${id.room},'2026-11-10','2026-11-12','checked_out',now())`);
      await tx.execute(sql`INSERT INTO payments(id,reservation_id,amount,method,date) VALUES(${id.payment},${id.stayA},294000,'cuenta_corriente','2026-11-17'),(${id.otherPayment},${id.stayB},294000,'cuenta_corriente','2026-11-17')`);
      for (const [movementId, entityType, entityId, reservationId, reference, paymentId] of [
        [id.cargoA, "company", id.company, id.stayA, canonical, null],
        [id.cargoB, "company", id.company, id.stayB, "credit-operation:" + randomUUID(), null],
        [id.manual, "company", id.company, null, "FA-0005-00001234", null],
        [id.legacy, "company", id.company, null, "credit-operation:" + randomUUID(), id.payment],
        [id.orphan, "company", id.company, "deleted-reservation", "credit-operation:" + randomUUID(), id.otherPayment],
        [id.agencyCargo, "agency", id.agency, id.stayB, "RS-001304", null],
        [id.guestCargo, "guest", id.guestA, id.stayA, "Anticipo", null],
      ]) await tx.execute(sql`INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount,reservation_id,reference,payment_id)
        VALUES(${movementId},${entityType},${entityId},'2026-11-17','cargo','Anticipo FB — Entidad',294000,${reservationId},${reference},${paymentId})`);
    });
    const app = express(); app.use(express.json()); (await import("../routes/guests")).registerGuestsRoutes(app);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (!pool) return;
    await pool.query("DELETE FROM account_movements WHERE entity_id=ANY($1::varchar[])", [[id.company, id.agency, id.guestA]]);
    await pool.query("DELETE FROM payments WHERE id=ANY($1::varchar[])", [[id.payment, id.otherPayment]]);
    await pool.query("DELETE FROM reservations WHERE id=ANY($1::varchar[])", [[id.stayA, id.stayB]]);
    await pool.query("DELETE FROM rooms WHERE id=$1", [id.room]); await pool.query("DELETE FROM room_types WHERE id=$1", [id.roomType]);
    await pool.query("DELETE FROM guests WHERE id=ANY($1::varchar[])", [[id.guestA, id.guestB]]);
    await pool.query("DELETE FROM companies WHERE id=$1", [id.company]); await pool.query("DELETE FROM agencies WHERE id=$1", [id.agency]);
  }, 30000);

  it("distingue anticipos del mismo importe por huésped y estadía y conserva sus referencias y saldos", async () => {
    const before = await stored(), account = await get(`/api/companies/${id.company}/account`);
    const a = account.movements.find((row: any) => row.id === id.cargoA), b = account.movements.find((row: any) => row.id === id.cargoB);
    expect(a).toMatchObject({ amount: "294000.00", reference: canonical, guestName: null, saldoPendiente: 294000,
      reservationDisplay: { guestName: "Pérez, Ana", checkInDate: "2026-11-20", checkOutDate: "2026-11-22" } });
    expect(b).toMatchObject({ amount: "294000.00", reservationDisplay: { guestName: "Gómez, Bruno", checkInDate: "2026-11-10", checkOutDate: "2026-11-12" } });
    expect(account.balance).toBe(294000 * 5); expect(await stored()).toEqual(before);
  });
  it("usa el vínculo del pago cuando falta el de reserva y no sustituye una reserva explícita huérfana por otra", async () => {
    const account = await get(`/api/companies/${id.company}/account`);
    expect(account.movements.find((row: any) => row.id === id.legacy).reservationDisplay).toMatchObject({ guestName: "Pérez, Ana", checkInDate: "2026-11-20" });
    expect(account.movements.find((row: any) => row.id === id.orphan).reservationDisplay).toBeUndefined();
    const manual = account.movements.find((row: any) => row.id === id.manual);
    expect(manual.reference).toBe("FA-0005-00001234"); expect(manual.reservationDisplay).toBeUndefined();
  });
  it("incluye el mismo contexto en agencias, huéspedes y consulta genérica de movimientos", async () => {
    const agency = await get(`/api/agencies/${id.agency}/account`), guest = await get(`/api/guests/${id.guestA}/account`);
    expect(agency.movements[0].reservationDisplay.guestName).toBe("Gómez, Bruno"); expect(agency.balance).toBe(294000);
    expect(guest.movements[0].reservationDisplay.guestName).toBe("Pérez, Ana"); expect(guest.balance).toBe(294000);
    const generic = await get(`/api/account-movements/company/${id.company}`);
    expect(generic.find((row: any) => row.id === id.cargoA).reservationDisplay.guestName).toBe("Pérez, Ana");
  });
  it("enriquece en lote sin modificar los objetos originales", async () => {
    const { storage } = await import("../db-storage"); const movements = await storage.getAccountMovements("company", id.company), before = structuredClone(movements);
    const execute = vi.fn((query: any) => db.execute(query)); const result = await enrich({ execute }, movements);
    expect(execute).toHaveBeenCalledTimes(1); expect(movements).toEqual(before);
    expect(result.find(row => row.id === id.cargoA)?.reservationDisplay?.guestName).toBe("Pérez, Ana");
  });
  it("omite consultas adicionales para listas vacías o movimientos manuales sin vínculo", async () => {
    const execute = vi.fn(); expect(await enrich({ execute }, [])).toEqual([]);
    const rows = [{ id: "manual", reference: canonical }]; expect(await enrich({ execute }, rows)).toEqual(rows); expect(execute).not.toHaveBeenCalled();
  });
});
