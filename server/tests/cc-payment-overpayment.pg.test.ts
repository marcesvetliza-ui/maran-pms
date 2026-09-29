import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Una empresa/agencia/huésped puede pagar más de lo que debe hoy —p. ej.
// para dejar cargado por adelantado el próximo alojamiento— y ese
// excedente debe quedar como saldo a favor, sin bloquear el pago ni exigir
// una segunda operación separada.
const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 })
  : null;

runIfDatabaseIsConfigured("current-account payments that exceed the selected allocations", () => {
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

  it("pays off the full cargo and leaves the surplus as an unallocated credit (saldo a favor)", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const entityId = `cc-overpay-${randomUUID()}`;
    const cargoId = randomUUID();
    fixtureIds.push(cargoId);
    await testPool.query(
      `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
       VALUES ($1, 'company', $2, CURRENT_DATE, 'cargo', 'Cargo de prueba', 100.00)`,
      [cargoId, entityId],
    );

    const created = await storage.createPaymentWithAllocations("company", entityId, {
      date: "2026-09-29",
      description: "Pago adelantado",
      amount: "-150.00",
      reference: "test",
      paymentMethod: "transferencia",
      retentions: null,
      createdBy: "pg-test",
    }, [{ cargoId, amount: "100.00" }]);
    fixtureIds.push(created.movement.id);

    expect(created.allocations).toEqual([
      expect.objectContaining({ cargoId, amount: "100.00" }),
    ]);

    const pending = await storage.getPendingCharges("company", entityId);
    expect(pending).toHaveLength(0);

    const balance = await storage.getAccountBalance("company", entityId);
    expect(balance).toBeCloseTo(-50, 2);
  });

  it("still rejects allocating more than what was actually paid", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const entityId = `cc-overpay-reject-${randomUUID()}`;
    const cargoId = randomUUID();
    fixtureIds.push(cargoId);
    await testPool.query(
      `INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
       VALUES ($1, 'company', $2, CURRENT_DATE, 'cargo', 'Cargo de prueba', 100.00)`,
      [cargoId, entityId],
    );

    await expect(storage.createPaymentWithAllocations("company", entityId, {
      date: "2026-09-29",
      description: "Pago insuficiente",
      amount: "-50.00",
      reference: "test",
      paymentMethod: "transferencia",
      retentions: null,
      createdBy: "pg-test",
    }, [{ cargoId, amount: "100.00" }])).rejects.toMatchObject({ statusCode: 400 });

    const pending = await storage.getPendingCharges("company", entityId);
    expect(pending).toHaveLength(1);
    expect(pending[0].saldoPendiente).toBe(100);
  });
});
