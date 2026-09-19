import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AGENCY_OPENING_BALANCES_2026_09_18,
  assertCurrentAccountReallocationPostcheck,
  COMPANY_OPENING_BALANCES_2026_09_18,
  COMPANY_OPENING_BALANCES_2026_09_18_SQL,
  CURRENT_ACCOUNT_REALLOCATION_2026_09_18_POSTCHECK_SQL,
  CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL,
} from "../migrate";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL })
  : null;
const schemaPrefix = `cc_reallocation_${process.pid}_${Date.now()}`;

async function withFixtureSchema(suffix: string, run: () => Promise<void>) {
  if (!client) throw new Error("DATABASE_URL no está configurado");
  const schema = `${schemaPrefix}_${suffix}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  try {
    await client.query(`
      CREATE TABLE companies (
        id varchar PRIMARY KEY,
        razon_social text NOT NULL
      );
      CREATE TABLE agencies (
        id varchar PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
        razon_social text NOT NULL,
        nombre_fantasia text,
        cuil_cuit text NOT NULL DEFAULT '',
        notes text,
        is_active text,
        created_at timestamp
      );
      CREATE TABLE guests (
        id varchar PRIMARY KEY,
        company_id varchar,
        agency_id varchar
      );
      CREATE TABLE reservations (
        id varchar PRIMARY KEY,
        company_id varchar,
        agency_id varchar
      );
      CREATE TABLE payments (
        id varchar PRIMARY KEY,
        company_id varchar,
        agency_id varchar,
        billing_target text
      );
      CREATE TABLE events (
        id varchar PRIMARY KEY,
        company_id varchar
      );
      CREATE TABLE account_movements (
        id varchar PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
        entity_type text NOT NULL,
        entity_id varchar NOT NULL,
        date date NOT NULL,
        type text NOT NULL,
        description text NOT NULL,
        amount numeric NOT NULL,
        reference text,
        created_by varchar,
        created_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE account_movement_allocations (
        id varchar PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
        pago_id varchar NOT NULL REFERENCES account_movements(id),
        cargo_id varchar NOT NULL REFERENCES account_movements(id),
        amount numeric NOT NULL
      );
      CREATE TABLE audit_logs (
        id varchar PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
        user_name text,
        action text NOT NULL,
        module text NOT NULL,
        entity_type text,
        description text NOT NULL,
        details text,
        "timestamp" timestamp NOT NULL
      );
    `);
    for (const [index, row] of COMPANY_OPENING_BALANCES_2026_09_18.entries()) {
      await client.query(
        "INSERT INTO companies (id, razon_social) VALUES ($1, $2)",
        [`company-${index}`, row.name],
      );
    }
    for (const [index, row] of AGENCY_OPENING_BALANCES_2026_09_18.entries()) {
      await client.query(
        "INSERT INTO agencies (id, razon_social) VALUES ($1, $2)",
        [`agency-${index}`, row.agencyName],
      );
    }
    await run();
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}

runIfDatabaseIsConfigured("current-account opening balance reallocation", () => {
  beforeAll(async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("rebuilds the ledger, transfers references and deletes the five company duplicates", async () => {
    await withFixtureSchema("success", async () => {
      if (!client) throw new Error("DATABASE_URL no está configurado");
      await client.query("DELETE FROM agencies WHERE id = 'agency-3'");
      const gbtCompanyId = `company-${COMPANY_OPENING_BALANCES_2026_09_18.findIndex(
        (row) => row.name === "GBT II ARGENTINA S.R.L",
      )}`;
      await client.query(`
        INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
        VALUES
          ('company-old', 'company', $1, CURRENT_DATE, 'cargo', 'Ficticio', 10),
          ('agency-old', 'agency', 'agency-0', CURRENT_DATE, 'cargo', 'Ficticio', 20),
          ('guest-old', 'guest', 'guest-1', CURRENT_DATE, 'cargo', 'Ficticio', 30),
          ('guest-payment', 'guest', 'guest-1', CURRENT_DATE, 'pago', 'Ficticio', -5)
      `, [gbtCompanyId]);
      await client.query(`
        INSERT INTO account_movement_allocations (pago_id, cargo_id, amount)
        VALUES ('guest-payment', 'guest-old', 5)
      `);
      await client.query(
        "INSERT INTO guests VALUES ('guest-linked', $1, NULL)",
        [gbtCompanyId],
      );
      await client.query(
        "INSERT INTO reservations VALUES ('reservation-linked', $1, NULL)",
        [gbtCompanyId],
      );
      await client.query(
        "INSERT INTO payments VALUES ('payment-linked', $1, NULL, 'company')",
        [gbtCompanyId],
      );
      await client.query(
        "INSERT INTO events VALUES ('event-linked', $1)",
        [gbtCompanyId],
      );
      await client.query(`
        INSERT INTO audit_logs (
          user_name, action, module, entity_type, description, details, "timestamp"
        ) VALUES (
          'system-import',
          'IMPORT_OPENING_BALANCES',
          'cuenta_corriente',
          'company',
          'Carga previa',
          'OPENING-COMPANY-2026-09-18',
          now()
        )
      `);

      await client.query(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL);

      const totals = await client.query(`
        SELECT entity_type, count(*)::int AS count, sum(amount)::numeric(14,2)::text AS total
        FROM account_movements
        GROUP BY entity_type
        ORDER BY entity_type
      `);
      expect(totals.rows).toEqual([
        { entity_type: "agency", count: 5, total: "6590132.60" },
        { entity_type: "company", count: 25, total: "40870177.64" },
      ]);
      expect((await client.query("SELECT count(*)::int AS n FROM account_movement_allocations")).rows[0].n).toBe(0);
      expect((await client.query("SELECT count(*)::int AS n FROM companies")).rows[0].n).toBe(25);
      expect((await client.query(`
        SELECT nombre_fantasia, cuil_cuit
        FROM agencies
        WHERE razon_social = 'ITS INTERNATIONAL SERVICES SA'
      `)).rows[0]).toEqual({
        nombre_fantasia: "PEZZATTI",
        cuil_cuit: "30676757917",
      });
      expect((await client.query(
        "SELECT company_id, agency_id FROM reservations WHERE id='reservation-linked'",
      )).rows[0]).toEqual({ company_id: null, agency_id: "agency-0" });
      expect((await client.query(
        "SELECT company_id, agency_id, billing_target FROM payments WHERE id='payment-linked'",
      )).rows[0]).toEqual({ company_id: null, agency_id: "agency-0", billing_target: "agency" });
      expect((await client.query(
        "SELECT company_id, agency_id FROM guests WHERE id='guest-linked'",
      )).rows[0]).toEqual({ company_id: null, agency_id: "agency-0" });
      expect((await client.query(
        "SELECT company_id FROM events WHERE id='event-linked'",
      )).rows[0].company_id).toBeNull();

      await client.query(COMPANY_OPENING_BALANCES_2026_09_18_SQL);
      await client.query(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL);
      expect((await client.query(
        "SELECT count(*)::int AS n FROM audit_logs WHERE action='REALLOCATE_OPENING_BALANCES'",
      )).rows[0].n).toBe(1);
      expect((await client.query(`
        SELECT entity_type, count(*)::int AS count, sum(amount)::numeric(14,2)::text AS total
        FROM account_movements
        GROUP BY entity_type
        ORDER BY entity_type
      `)).rows).toEqual([
        { entity_type: "agency", count: 5, total: "6590132.60" },
        { entity_type: "company", count: 25, total: "40870177.64" },
      ]);

      await client.query(`
        INSERT INTO account_movements (
          entity_type, entity_id, date, type, description, amount, reference
        ) VALUES
          ('company', 'company-0', CURRENT_DATE, 'cargo', 'Actividad posterior', 10, 'REAL-COMPANY'),
          ('agency', 'agency-0', CURRENT_DATE, 'cargo', 'Actividad posterior', 20, 'REAL-AGENCY'),
          ('guest', 'guest-2', CURRENT_DATE, 'cargo', 'Actividad posterior', 30, 'REAL-GUEST')
      `);
      await client.query(COMPANY_OPENING_BALANCES_2026_09_18_SQL);
      await client.query(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL);
      const postcheck = await client.query(
        CURRENT_ACCOUNT_REALLOCATION_2026_09_18_POSTCHECK_SQL,
      );
      expect(() => assertCurrentAccountReallocationPostcheck(postcheck.rows[0]))
        .not.toThrow();
      expect((await client.query(
        "SELECT count(*)::int AS n FROM account_movements WHERE reference LIKE 'REAL-%'",
      )).rows[0].n).toBe(3);
    });
  });

  it("rolls everything back when an agency match is ambiguous", async () => {
    await withFixtureSchema("ambiguous", async () => {
      if (!client) throw new Error("DATABASE_URL no está configurado");
      await client.query(`
        INSERT INTO agencies (id, razon_social)
        VALUES ('agency-duplicate', 'GBT II ARGENTINA S.R.L');
        INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
        VALUES ('must-survive', 'guest', 'guest-1', CURRENT_DATE, 'cargo', 'Debe sobrevivir', 123);
      `);

      await expect(client.query(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL))
        .rejects.toMatchObject({ code: "P0001" });
      expect((await client.query(
        "SELECT id, amount::text AS amount FROM account_movements",
      )).rows).toEqual([{ id: "must-survive", amount: "123" }]);
      expect((await client.query("SELECT count(*)::int AS n FROM companies")).rows[0].n).toBe(30);
      expect((await client.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n).toBe(0);
    });
  });

  it.each(["guests", "reservations", "payments"])(
    "rolls back when % already points to a different agency",
    async (table) => {
      await withFixtureSchema(`conflict_${table}`, async () => {
        if (!client) throw new Error("DATABASE_URL no está configurado");
        const gbtCompanyId = `company-${COMPANY_OPENING_BALANCES_2026_09_18.findIndex(
          (row) => row.name === "GBT II ARGENTINA S.R.L",
        )}`;
        if (table === "payments") {
          await client.query(
            "INSERT INTO payments VALUES ('conflict', $1, 'agency-1', 'company')",
            [gbtCompanyId],
          );
        } else {
          await client.query(
            `INSERT INTO ${table} VALUES ('conflict', $1, 'agency-1')`,
            [gbtCompanyId],
          );
        }
        await client.query(`
          INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
          VALUES ('must-survive', 'guest', 'guest-1', CURRENT_DATE, 'cargo', 'Debe sobrevivir', 123)
        `);

        await expect(client.query(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL))
          .rejects.toMatchObject({ code: "P0001" });
        expect((await client.query(
          "SELECT id, amount::text AS amount FROM account_movements",
        )).rows).toEqual([{ id: "must-survive", amount: "123" }]);
        expect((await client.query(`SELECT agency_id FROM ${table} WHERE id='conflict'`)).rows[0].agency_id)
          .toBe("agency-1");
      });
    },
  );
});