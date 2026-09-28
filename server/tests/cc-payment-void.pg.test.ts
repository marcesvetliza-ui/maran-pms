import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 })
  : null;

runIfDatabaseIsConfigured("direct current-account receipt voiding", () => {
  let storage: Awaited<typeof import("../db-storage")>["storage"];
  const fixtureIds: string[] = [];

  beforeEach(async () => {
    storage = (await import("../db-storage")).storage;
  });

  afterAll(async () => {
    if (!testPool) return;
    if (fixtureIds.length > 0) {
      await testPool.query("DELETE FROM account_movement_allocations WHERE pago_id = ANY($1::varchar[]) OR cargo_id = ANY($1::varchar[])", [fixtureIds]);
      await testPool.query("DELETE FROM account_movements WHERE id = ANY($1::varchar[]) OR reversal_of_movement_id = ANY($1::varchar[])", [fixtureIds]);
    }
    await testPool.end();
  });

  it("voids one direct receipt atomically and restores its allocation", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const entityId = `cc-void-${randomUUID()}`;
    const cargoId = randomUUID();
    fixtureIds.push(cargoId);
    await testPool.query(
      `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
       VALUES ($1, 'company', $2, CURRENT_DATE, 'cargo', 'Cargo de prueba', 110.00)`,
      [cargoId, entityId],
    );

    const created = await storage.createPaymentWithAllocations("company", entityId, {
      date: "2020-01-01",
      description: "Pago de prueba",
      amount: "-110.00",
      reference: "test",
      paymentMethod: "transferencia",
      retentions: [{ concepto: "IIBB", monto: 10 }],
      createdBy: "pg-test",
    }, [{ cargoId, amount: "110.00" }]);
    const paymentId = created.movement.id;
    fixtureIds.push(paymentId);
    expect(created.movement.receiptNumber).toMatch(/^REC-\d{4}-\d{4,}$/);
    const originalReceiptNumber = created.movement.receiptNumber;
    await expect(testPool.query(
      "UPDATE account_movements SET receipt_number = 'REC-2099-9999' WHERE id = $1",
      [paymentId],
    )).rejects.toThrow(/immutable/i);

    const result = await storage.voidDirectAccountPayment(paymentId, "Error de prueba", "pg-test");
    expect(result.original.voided).toBe(true);
    expect(result.original.receiptNumber).toBe(originalReceiptNumber);
    expect(result.reversal.amount).toBe("110.00");
    expect(result.reversal.retentions).toBeNull();
    expect(result.releasedAllocations).toBe(1);

    const pending = await storage.getPendingCharges("company", entityId);
    expect(pending).toHaveLength(1);
    expect(pending[0].saldoPendiente).toBe(110);

    const duplicate = await storage.voidDirectAccountPayment(paymentId, "Segundo intento", "pg-test");
    expect(duplicate.reversal.id).toBe(result.reversal.id);
    const reversals = await testPool.query(
      "SELECT id FROM account_movements WHERE reversal_of_movement_id = $1",
      [paymentId],
    );
    expect(reversals.rows).toHaveLength(1);
    const allocation = await testPool.query(
      "SELECT voided, voided_by, void_reason FROM account_movement_allocations WHERE pago_id = $1",
      [paymentId],
    );
    expect(allocation.rows).toEqual([{ voided: true, voided_by: "pg-test", void_reason: "Error de prueba" }]);
  });

  it("rejects a payment linked to a reservation", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const id = randomUUID();
    fixtureIds.push(id);
    await testPool.query(
      `INSERT INTO account_movements
       (id, entity_type, entity_id, date, type, description, amount, reservation_id)
       VALUES ($1, 'company', $2, CURRENT_DATE, 'pago', 'Pago vinculado', -10.00, 'reservation-linked')`,
      [id, `cc-linked-${randomUUID()}`],
    );
    await expect(storage.voidDirectAccountPayment(id, "No corresponde", "pg-test"))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("voids overlapping partial allocations concurrently without duplicates or deadlocks", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const entityId = `cc-void-concurrent-${randomUUID()}`;
    const cargoId = randomUUID();
    fixtureIds.push(cargoId);
    await testPool.query(
      `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
       VALUES ($1, 'company', $2, CURRENT_DATE, 'cargo', 'Cargo concurrente', 200.00)`,
      [cargoId, entityId],
    );

    const paymentData = {
      date: "2026-09-23",
      description: "Pago parcial concurrente",
      amount: "-100.00",
      reference: null,
      paymentMethod: "transferencia",
      retentions: null,
      createdBy: "pg-test",
    };
    const first = await storage.createPaymentWithAllocations(
      "company", entityId, paymentData, [{ cargoId, amount: "100.00" }],
    );
    const second = await storage.createPaymentWithAllocations(
      "company", entityId, paymentData, [{ cargoId, amount: "100.00" }],
    );
    fixtureIds.push(first.movement.id, second.movement.id);

    const results = await Promise.all([
      storage.voidDirectAccountPayment(first.movement.id, "Primer pago incorrecto", "pg-test"),
      storage.voidDirectAccountPayment(second.movement.id, "Segundo pago incorrecto", "pg-test"),
    ]);

    expect(new Set(results.map((result) => result.reversal.id)).size).toBe(2);
    const reversals = await testPool.query(
      `SELECT reversal_of_movement_id, COUNT(*)::int AS count
       FROM account_movements
       WHERE reversal_of_movement_id = ANY($1::varchar[])
       GROUP BY reversal_of_movement_id`,
      [[first.movement.id, second.movement.id]],
    );
    expect(reversals.rows).toEqual(expect.arrayContaining([
      { reversal_of_movement_id: first.movement.id, count: 1 },
      { reversal_of_movement_id: second.movement.id, count: 1 },
    ]));
    const pending = await storage.getPendingCharges("company", entityId);
    expect(pending).toHaveLength(1);
    expect(pending[0].saldoPendiente).toBe(200);
  });
});