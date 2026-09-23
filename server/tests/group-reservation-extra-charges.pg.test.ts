import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : null;
const suite = process.env.DATABASE_URL ? describe : describe.skip;

suite("cargos del folio antes de desasignar una reserva grupal (PostgreSQL)", () => {
  const reservationId = `group-unassign-${randomUUID()}`;
  const otherReservationId = `group-unassign-${randomUUID()}`;
  const folioId = randomUUID();
  const otherFolioId = randomUUID();

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM folio_movements WHERE folio_id = ANY($1::varchar[])", [[folioId, otherFolioId]]);
    await pool.query("DELETE FROM folios WHERE id = ANY($1::varchar[])", [[folioId, otherFolioId]]);
    await pool.end();
    const { pool: appPool } = await import("../db");
    await appPool.end();
  });

  it("solo cuenta cargos extra de esa reserva, incluidos los de origen vacío", async () => {
    if (!pool) throw new Error("DATABASE_URL requerida");
    const { countReservationExtraFolioCharges } = await import("../groupReservationExtraCharges");
    expect(await countReservationExtraFolioCharges(reservationId)).toBe(0);

    await pool.query(`
      INSERT INTO folios (id, codigo, entity_type, entity_id) VALUES
      ($1, $3, 'reservation', $5), ($2, $4, 'reservation', $6)
    `, [folioId, otherFolioId, `FO-${randomUUID()}`, `FO-${randomUUID()}`, reservationId, otherReservationId]);
    const insertMovement = async (folio: string, type: string, sourceType: string | null) => pool.query(`
      INSERT INTO folio_movements (id, folio_id, type, amount, description, source_type)
      VALUES ($1, $2, $3, '100.00', 'Cargo de prueba', $4)
    `, [randomUUID(), folio, type, sourceType]);

    await insertMovement(folioId, "charge", "accommodation");
    await insertMovement(folioId, "charge", "transfer");
    await insertMovement(folioId, "payment", "minibar");
    await insertMovement(otherFolioId, "charge", "minibar");
    expect(await countReservationExtraFolioCharges(reservationId)).toBe(0);

    await insertMovement(folioId, "charge", "minibar");
    await insertMovement(folioId, "charge", null);
    expect(await countReservationExtraFolioCharges(reservationId)).toBe(2);
    expect(await countReservationExtraFolioCharges(otherReservationId)).toBe(1);
  });
});
