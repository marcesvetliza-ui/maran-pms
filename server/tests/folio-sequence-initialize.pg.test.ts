import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../db";
import { ensureFolioCodigoSequences } from "../migrate";

const suite = process.env.DATABASE_URL ? describe : describe.skip;

suite("folio sequence initialization with legacy codes", () => {
  it("ignores unrelated digits, creates every sequence and remains ahead on rerun", async () => {
    const schema = `folio_seq_test_${randomUUID().replace(/-/g, "")}`;
    await db.execute(sql.raw(`CREATE SCHEMA "${schema}"`));
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL search_path TO "${schema}"`));
        await tx.execute(sql`CREATE TABLE folios (entity_type text NOT NULL, codigo text NOT NULL)`);
        await tx.execute(sql`
          INSERT INTO folios (entity_type, codigo) VALUES
            ('reservation', 'RS-5200895694881374744'),
            ('reservation', 'RS-000009'),
            ('event', 'EVT-2026-3061'),
            ('event', 'EV-000042')
        `);

        const execute = async (query: Parameters<typeof tx.execute>[0]) => {
          await tx.execute(query);
        };
        await ensureFolioCodigoSequences(execute);
        const sequences = await tx.execute(sql`
          SELECT count(*)::int AS count FROM pg_sequences WHERE schemaname = current_schema()
        `);
        expect(sequences.rows[0].count).toBe(7);

        const numbers = await tx.execute(sql`
          SELECT nextval('folio_seq_reservation') AS reservation,
                 nextval('folio_seq_event') AS event
        `);
        expect(Number(numbers.rows[0].reservation)).toBe(10);
        expect(Number(numbers.rows[0].event)).toBe(43);

        await ensureFolioCodigoSequences(execute);
        const rerun = await tx.execute(sql`SELECT nextval('folio_seq_event') AS event`);
        expect(Number(rerun.rows[0].event)).toBe(44);
      });
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
    }
  });
});