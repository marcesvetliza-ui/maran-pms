import { createHash } from "node:crypto";
import type pg from "pg";
import { SALES_ARCHIVE_SCHEMA_SQL } from "../salesArchive";

// Runtime dependencies of the common folio/Caja code which Drizzle's export
// does not include. No operational seeds or historical repairs are run here.
export const QA_OPERATIONS_SCHEMA_SQL = `
  ${SALES_ARCHIVE_SCHEMA_SQL};
  CREATE UNIQUE INDEX IF NOT EXISTS folios_entity_type_entity_id_unique ON folios(entity_type,entity_id);
  CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_reservation_payment_id_unique ON cash_movements(payment_id)
    WHERE source_type='reservation' AND payment_id IS NOT NULL;
  DO $$ DECLARE first_value bigint; BEGIN
    IF to_regclass('public.folio_seq_reservation') IS NULL THEN
      CREATE SEQUENCE public.folio_seq_reservation;
      SELECT COALESCE(MAX(SUBSTRING(codigo FROM '^RS-([0-9]{1,18})$')::bigint),0)+1 INTO first_value
        FROM public.folios WHERE entity_type='reservation';
      PERFORM setval('public.folio_seq_reservation',first_value,false);
    END IF;
  END $$;
`;
export const QA_OPERATIONS_SCHEMA_DIGEST = createHash("sha256").update(QA_OPERATIONS_SCHEMA_SQL).digest("hex");
type Executor = Pick<pg.PoolClient, "query">;

/** Caller must have verified the binding and hold setup's transaction lock. */
export async function prepareQaOperationsSchema(connection: Executor) {
  await connection.query(`CREATE TABLE IF NOT EXISTS xenia_pms.operations_schema(
    version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
  const previous = (await connection.query("SELECT digest FROM xenia_pms.operations_schema WHERE version=1")).rows[0];
  if (previous) {
    if (previous.digest !== QA_OPERATIONS_SCHEMA_DIGEST)
      throw Error("La preparación financiera QA cambió; requiere una migración explícita.");
    return;
  }
  // Duplicates fail the unique-index creation and roll back this setup. They
  // are not merged, deleted or archived automatically.
  await connection.query(QA_OPERATIONS_SCHEMA_SQL);
  await connection.query("INSERT INTO xenia_pms.operations_schema(version,digest) VALUES(1,$1)", [QA_OPERATIONS_SCHEMA_DIGEST]);
}

export async function assertQaOperationsSchema(connection: Executor) {
  const row = (await connection.query(`SELECT digest,
    to_regclass('public.folio_seq_reservation') IS NOT NULL AND
    to_regclass('public.folios_entity_type_entity_id_unique') IS NOT NULL AND
    to_regclass('public.cash_movements_reservation_payment_id_unique') IS NOT NULL AND
    to_regclass('public.sales_control_archive') IS NOT NULL AS ready
    FROM xenia_pms.operations_schema WHERE version=1`)).rows[0];
  if (!row?.ready || row.digest !== QA_OPERATIONS_SCHEMA_DIGEST)
    throw Error("Falta completar la preparación de estadías y Caja de esta instalación QA.");
}
