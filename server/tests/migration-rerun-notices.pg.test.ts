import pg from "pg";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CASH_REGISTER_CONFIGS_AREA_UNIQUE_MIGRATION_SQL,
  CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL,
  INCREMENTAL_NON_INDEX_DDL,
  INCREMENTAL_INDEX_DEFINITIONS,
  RESERVATION_COMPANIONS_GUEST_FK_MIGRATION_SQL,
  SPA_CIRCUIT_RESOURCE_FOREIGN_KEYS_MIGRATION_SQL,
  incrementalDdlWithoutRerunNotice,
  createIndexWithoutRerunNotice,
  serializeIncrementalDdl,
} from "../migrate";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL })
  : null;

const schemaName = `migration_rerun_${process.pid}_${Date.now()}`;
const migrateSource = readFileSync(new URL("../migrate.ts", import.meta.url), "utf8");
const productionMigrationSource = migrateSource.replace(
  /^\s*fixtureSql:\s*"[^"]*",\s*$/gm,
  "",
);

function declaredIndexName(createSql: string): string | null {
  return createSql.match(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+([^\s]+)\s+ON\b/i,
  )?.[1] ?? null;
}

async function expectSilentSecondRun(client: pg.Client, migrationSql: string) {
  await expect(client.query(migrationSql)).resolves.toBeDefined();

  const secondRunNotices: pg.NoticeMessage[] = [];
  const captureNotice = (notice: pg.NoticeMessage) => secondRunNotices.push(notice);
  client.on("notice", captureNotice);

  try {
    await expect(client.query(migrationSql)).resolves.toBeDefined();
  } finally {
    client.off("notice", captureNotice);
  }

  const misleadingNotices = secondRunNotices.filter(
    (notice) =>
      ["NOTICE", "WARNING"].includes(notice.severity) &&
      /already exists|ya existe|duplicate/i.test(notice.message),
  );

  expect(misleadingNotices).toEqual([]);
}

async function inIsolatedSchema(
  client: pg.Client,
  suffix: string,
  run: () => Promise<void>,
) {
  const isolatedSchema = `${schemaName}_${suffix}`;
  await client.query(`CREATE SCHEMA "${isolatedSchema}"`);
  await client.query(`SET search_path TO "${isolatedSchema}"`);
  try {
    await run();
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA "${isolatedSchema}" CASCADE`);
  }
}

runIfDatabaseIsConfigured("incremental migration reruns", () => {
  it("uses a unique indexName for every incremental index definition", () => {
    const indexNames = Object.values(INCREMENTAL_INDEX_DEFINITIONS).map(
      ({ indexName }) => indexName,
    );
    const duplicateIndexNames = indexNames.filter(
      (indexName, position) => indexNames.indexOf(indexName) !== position,
    );

    expect(
      duplicateIndexNames,
      `INCREMENTAL_INDEX_DEFINITIONS has duplicate indexName values: ${duplicateIndexNames.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps each indexName aligned with the name declared in createSql", () => {
    const mismatches = Object.entries(INCREMENTAL_INDEX_DEFINITIONS).flatMap(
      ([definitionName, { indexName, createSql }]) => {
        const declaredName = declaredIndexName(createSql);
        return declaredName === indexName
          ? []
          : [`${definitionName}: indexName="${indexName}", createSql declares "${declaredName ?? "<missing>"}"`];
      },
    );

    expect(
      mismatches,
      `INCREMENTAL_INDEX_DEFINITIONS has createSql/indexName mismatches:\n${mismatches.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps every incremental index on the silent catalog-guard path", () => {
    expect(migrateSource).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i);
  });

  it("keeps the inventoried non-index DDL on catalog-guard paths", () => {
    expect(INCREMENTAL_NON_INDEX_DDL.chargeTypesTable).toContain("to_regclass");
    expect(INCREMENTAL_NON_INDEX_DDL.cashShiftsTurnoTipoColumn).toContain("pg_attribute");
    expect(INCREMENTAL_NON_INDEX_DDL.groupPaymentsReceiptNumberSequence).toContain("to_regclass");
  });

  it("does not leave notice-producing non-index DDL in production migrations", () => {
    expect(productionMigrationSource).not.toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS|CREATE\s+SEQUENCE\s+IF\s+NOT\s+EXISTS/i,
    );
  });

  beforeAll(async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");

    await client.connect();
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);
    await client.query(`
      CREATE TABLE cash_register_configs (
        id serial PRIMARY KEY,
        area text NOT NULL
      );
      CREATE TABLE migration_fk_parent (id varchar PRIMARY KEY);
      CREATE TABLE migration_fk_child (parent_id varchar);
      CREATE TABLE spa_treatments (id varchar PRIMARY KEY);
      CREATE TABLE spa_cabins (id varchar PRIMARY KEY);
      CREATE TABLE spa_appointments (id varchar PRIMARY KEY);
      CREATE TABLE spa_treatment_resources (
        treatment_id varchar,
        default_cabin_id varchar,
        sort_order integer
      );
      CREATE TABLE spa_appointment_resources (
        appointment_id varchar,
        cabin_id varchar,
        start_time text,
        end_time text
      );
      CREATE TABLE guests (id varchar PRIMARY KEY);
      CREATE TABLE reservation_companions (guest_id varchar);
    `);
  });

  afterAll(async () => {
    if (!client) return;

    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  });

  it("completes twice without duplicate-object notices on the second run", async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");

    await expectSilentSecondRun(client, CASH_REGISTER_CONFIGS_AREA_UNIQUE_MIGRATION_SQL);
  });

  it.each(Object.values(INCREMENTAL_INDEX_DEFINITIONS))(
    "silences existing-object notices for production index $indexName",
    async ({ indexName, createSql, fixtureSql }) => {
    if (!client) throw new Error("DATABASE_URL no está configurado");

      await client.query(fixtureSql);
      await expectSilentSecondRun(client, createIndexWithoutRerunNotice(indexName, createSql));
    },
  );

  it("silences existing-object notices for incremental foreign-key constraints", async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");

    await expectSilentSecondRun(client, `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'migration_fk_child_parent_fk'
            AND conrelid = 'migration_fk_child'::regclass
        ) THEN
          ALTER TABLE migration_fk_child
            ADD CONSTRAINT migration_fk_child_parent_fk
            FOREIGN KEY (parent_id) REFERENCES migration_fk_parent(id);
        END IF;
      END $$
    `);
    await expectSilentSecondRun(client, SPA_CIRCUIT_RESOURCE_FOREIGN_KEYS_MIGRATION_SQL);
    await expectSilentSecondRun(client, RESERVATION_COMPANIONS_GUEST_FK_MIGRATION_SQL);
  });

  it("only creates the cash payment unique index after legacy duplicates are clean", async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");
    await inIsolatedSchema(client, "cash_payment_link", async () => {
      await client.query("CREATE TABLE cash_movements (id varchar PRIMARY KEY, source_type text NOT NULL, payment_id varchar)");
      await client.query(`
        INSERT INTO cash_movements VALUES
          ('r1', 'reservation', 'reservation-payment'),
          ('r2', 'reservation', 'reservation-payment'),
          ('g1', 'group_payment', 'group-payment'),
          ('g2', 'group_payment', 'group-payment')
      `);

      await client.query(CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL);
      expect((await client.query("SELECT to_regclass('cash_movements_reservation_payment_id_unique') AS name")).rows[0].name).toBeNull();

      await client.query("DELETE FROM cash_movements WHERE id = 'r2'");
      await expectSilentSecondRun(client, CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL);
      expect((await client.query("SELECT to_regclass('cash_movements_reservation_payment_id_unique') AS name")).rows[0].name)
        .toBe("cash_movements_reservation_payment_id_unique");

      await expect(client.query(
        "INSERT INTO cash_movements VALUES ('g3', 'group_payment', 'group-payment')",
      )).resolves.toBeDefined();
      await expect(client.query(
        "INSERT INTO cash_movements VALUES ('r3', 'reservation', 'reservation-payment')",
      )).rejects.toMatchObject({ code: "23505" });
    });
  });

  it("silences existing-table notices in an isolated schema", async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");
    await inIsolatedSchema(client, "table", async () => {
      await expectSilentSecondRun(client, INCREMENTAL_NON_INDEX_DDL.chargeTypesTable);
    });
  });

  it("silences existing-column notices in an isolated schema", async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");
    await inIsolatedSchema(client, "column", async () => {
      await client.query("CREATE TABLE cash_shifts (id serial PRIMARY KEY)");
      await expectSilentSecondRun(client, INCREMENTAL_NON_INDEX_DDL.cashShiftsTurnoTipoColumn);
    });
  });

  it("silences multi-column incremental additions without skipping missing columns", async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");
    await inIsolatedSchema(client, "multi_column", async () => {
      await client.query("CREATE TABLE migration_multi_column (id serial PRIMARY KEY, present text)");
      const migrationSql = incrementalDdlWithoutRerunNotice(`
        ALTER TABLE migration_multi_column
          ADD COLUMN present text,
          ADD COLUMN missing_numeric numeric(10,2),
          ADD COLUMN missing_flag boolean DEFAULT false
      `);

      await expectSilentSecondRun(client, migrationSql);
      const { rows } = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'migration_multi_column'
        ORDER BY column_name
      `);
      expect(rows.map((row) => row.column_name)).toEqual([
        "id",
        "missing_flag",
        "missing_numeric",
        "present",
      ]);
    });
  });

  it("silences existing-sequence notices in an isolated schema", async () => {
    if (!client) throw new Error("DATABASE_URL no está configurado");
    await inIsolatedSchema(client, "sequence", async () => {
      await expectSilentSecondRun(client, INCREMENTAL_NON_INDEX_DDL.groupPaymentsReceiptNumberSequence);
    });
  });

  it("serializes concurrent catalog checks and creates the object once without duplicate errors", async () => {
    const firstClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const secondClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const isolatedSchema = `${schemaName}_concurrent`;
    const notices: pg.NoticeMessage[] = [];
    const captureNotice = (notice: pg.NoticeMessage) => notices.push(notice);

    await firstClient.connect();
    await secondClient.connect();

    try {
      await firstClient.query(`CREATE SCHEMA "${isolatedSchema}"`);
      await Promise.all([
        firstClient.query(`SET search_path TO "${isolatedSchema}"`),
        secondClient.query(`SET search_path TO "${isolatedSchema}"`),
      ]);
      firstClient.on("notice", captureNotice);
      secondClient.on("notice", captureNotice);

      const concurrentCreate = serializeIncrementalDdl(`
        DO $$
        BEGIN
          PERFORM pg_sleep(0.15);
          IF to_regclass('concurrent_migration_result') IS NULL THEN
            CREATE TABLE concurrent_migration_result (id integer PRIMARY KEY);
          END IF;
        END $$
      `);

      const results = await Promise.all([
        firstClient.query(concurrentCreate),
        secondClient.query(concurrentCreate),
      ]);
      expect(results).toHaveLength(2);

      const { rows } = await firstClient.query(`
        SELECT COUNT(*)::integer AS count
        FROM pg_class
        WHERE oid = to_regclass('concurrent_migration_result')
      `);
      expect(rows[0]?.count).toBe(1);
      expect(
        notices.filter((notice) =>
          /already exists|ya existe|duplicate/i.test(notice.message)
        ),
      ).toEqual([]);
    } finally {
      firstClient.off("notice", captureNotice);
      secondClient.off("notice", captureNotice);
      await firstClient.query("RESET search_path").catch(() => undefined);
      await secondClient.query("RESET search_path").catch(() => undefined);
      await firstClient.query(`DROP SCHEMA IF EXISTS "${isolatedSchema}" CASCADE`).catch(() => undefined);
      await Promise.all([
        firstClient.end(),
        secondClient.end(),
      ]);
    }
  });
});
