import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COMPANY_OPENING_BALANCES_2026_09_18_SQL } from "../migrate";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL })
  : null;
const schemaPrefix = `company_opening_${process.pid}_${Date.now()}`;

async function withFixtureSchema(suffix: string, run: () => Promise<void>) {
  if (!client) throw new Error("DATABASE_URL no está configurado");
  const schema = `${schemaPrefix}_${suffix}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  try {
    await client.query(`
      CREATE TABLE companies (
        id varchar PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
        razon_social text NOT NULL,
        nombre_fantasia text,
        cuil_cuit text NOT NULL,
        pais text DEFAULT 'Argentina',
        condicion_iva text DEFAULT 'responsable_inscripto',
        payment_term_days integer DEFAULT 30,
        condicion_venta_predeterminada text DEFAULT 'contado',
        regimen_hospedaje text,
        notes text,
        is_active text DEFAULT 'true',
        created_at timestamp DEFAULT now()
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
    await run();
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}

runIfDatabaseIsConfigured("company opening balances migration", () => {
  beforeAll(async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("replaces only the company ledger and is a no-op on rerun", async () => {
    await withFixtureSchema("success", async () => {
      if (!client) throw new Error("DATABASE_URL no está configurado");
      await client.query(`
        INSERT INTO companies (id, razon_social, nombre_fantasia, cuil_cuit)
        VALUES
          ('mutual', 'Asociacion Mutual Modelo De Entre Rios', 'MUTUAL MODELO', '30700166429'),
          ('osde', 'Osde Organizacion De Servicios Directos Empresarios', 'OSDE', '30546741253');
        INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
        VALUES
          ('old-company-charge', 'company', 'mutual', CURRENT_DATE, 'cargo', 'Ficticio', 10),
          ('old-company-payment', 'company', 'mutual', CURRENT_DATE, 'pago', 'Ficticio', -5),
          ('guest-movement', 'guest', 'guest-1', CURRENT_DATE, 'cargo', 'Conservar', 99);
        INSERT INTO account_movement_allocations (pago_id, cargo_id, amount)
        VALUES ('old-company-payment', 'old-company-charge', 5);
      `);

      await client.query(COMPANY_OPENING_BALANCES_2026_09_18_SQL);

      const first = await client.query(`
        SELECT
          count(*)::int AS movements,
          count(DISTINCT entity_id)::int AS companies,
          sum(amount)::numeric(14,2)::text AS total,
          count(*) FILTER (WHERE reference <> 'OPENING-COMPANY-2026-09-18')::int AS unexpected
        FROM account_movements
        WHERE entity_type = 'company'
      `);
      expect(first.rows[0]).toEqual({
        movements: 30,
        companies: 30,
        total: "47460310.24",
        unexpected: 0,
      });
      expect((await client.query("SELECT count(*)::int AS n FROM account_movement_allocations")).rows[0].n).toBe(0);
      expect((await client.query("SELECT count(*)::int AS n FROM account_movements WHERE entity_type='guest'")).rows[0].n).toBe(1);

      const unknownFiscalData = await client.query(`
        SELECT pais, condicion_iva, payment_term_days, condicion_venta_predeterminada
        FROM companies WHERE razon_social = 'B GAMING S.A.'
      `);
      expect(unknownFiscalData.rows[0]).toEqual({
        pais: null,
        condicion_iva: null,
        payment_term_days: null,
        condicion_venta_predeterminada: null,
      });

      await client.query(COMPANY_OPENING_BALANCES_2026_09_18_SQL);
      expect((await client.query(`
        SELECT count(*)::int AS n
        FROM audit_logs
        WHERE details LIKE '%OPENING-COMPANY-2026-09-18%'
      `)).rows[0].n).toBe(1);
      expect((await client.query(
        "SELECT count(*)::int AS n FROM account_movements WHERE entity_type='company'",
      )).rows[0].n).toBe(30);
    });
  });

  it("rolls back creations and preserves the old ledger when an alias is ambiguous", async () => {
    await withFixtureSchema("ambiguous", async () => {
      if (!client) throw new Error("DATABASE_URL no está configurado");
      await client.query(`
        INSERT INTO companies (id, razon_social, cuil_cuit)
        VALUES
          ('osde-a', 'OSDE ORGANIZACION DE SERVICIOS DIRECTOS', ''),
          ('osde-b', 'OSDE ORGANIZACION DE SERVICIOS DIRECTOS EMPRESARIOS', '');
        INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount)
        VALUES ('old-ledger', 'company', 'osde-a', CURRENT_DATE, 'cargo', 'Debe sobrevivir', 123);
      `);

      await expect(client.query(COMPANY_OPENING_BALANCES_2026_09_18_SQL))
        .rejects.toMatchObject({ code: "P0001" });

      expect((await client.query(
        "SELECT id, amount::text AS amount FROM account_movements WHERE entity_type='company'",
      )).rows).toEqual([{ id: "old-ledger", amount: "123" }]);
      expect((await client.query("SELECT count(*)::int AS n FROM companies")).rows[0].n).toBe(2);
      expect((await client.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n).toBe(0);
    });
  });
});