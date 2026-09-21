/**
 * getOrCreateFolio() was a plain check-then-insert: two near-simultaneous
 * charges to the same entity (SPA/restaurant/events post their folio charge
 * fire-and-forget, so this is a real production timing, not a theoretical
 * one) could both miss the other's not-yet-committed folio and each create
 * their own — splitting that entity's balance across two rows. Fixed with
 * an ON CONFLICT DO NOTHING upsert plus a unique index (migrate.ts).
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

suite("getOrCreateFolio — una sola cuenta por entidad bajo concurrencia", () => {
  afterAll(async () => { await pool?.end(); });

  it("dos cargos disparados a la vez a la misma entidad terminan en un único folio", async () => {
    if (!pool) return;
    const entityId = `spa_account-${randomUUID()}`;
    try {
      const [a, b] = await Promise.all([
        storage.addFolioCharge("spa_account", entityId, 5000, "Crema hidratante", "spa_item", `item-${randomUUID()}`),
        storage.addFolioCharge("spa_account", entityId, 3000, "Cochera", "spa_item", `item-${randomUUID()}`),
      ]);

      expect(a.folioId).toBe(b.folioId);

      const folios = await pool.query(
        "SELECT id, total_charges, balance FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1",
        [entityId],
      );
      expect(folios.rows).toHaveLength(1);
      expect(folios.rows[0].total_charges).toBe("8000.00");
      expect(folios.rows[0].balance).toBe("8000.00");

      const movements = await pool.query(
        "SELECT folio_id FROM folio_movements WHERE folio_id = $1",
        [folios.rows[0].id],
      );
      expect(movements.rows).toHaveLength(2);
    } finally {
      await pool.query(
        `DELETE FROM folio_movements WHERE folio_id IN (
           SELECT id FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1
         )`,
        [entityId],
      );
      await pool.query("DELETE FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1", [entityId]);
    }
  });
});
