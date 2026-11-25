import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { GROUP_BLOCK_ASSIGNMENT_SCHEMA_SQL } from "./groupBlockSchema";
import { GROUP_ROOM_INVOICE_BATCH_SCHEMA_SQL } from "./groupRoomInvoiceBatchSchema";

const columns: Record<string, string[]> = {
  group_reservation_links: ["id", "group_id", "reservation_id", "block_id"],
  group_reservation_imports: [
    "operation_id",
    "fingerprint",
    "group_id",
    "reservation_id",
    "result",
    "created_at",
  ],
  group_room_invoice_batches: [
    "operation_id",
    "group_id",
    "actor_id",
    "fingerprint",
    "reservation_ids",
    "plan",
    "status",
    "collection_finished",
    "created_at",
  ],
};
const indexes = [
  "group_reservation_links_block_idx",
  "group_reservation_imports_pkey",
  "group_reservation_imports_reservation_id_key",
  "group_room_invoice_batches_pkey",
  "group_room_invoice_batches_group_idx",
];

/** Additive startup migration, shared by the application and CI. No historical
 * allocation, reservation, receipt or invoice is rewritten here. */
export async function ensureGroupReservationsSchema() {
  await withDatabaseTransaction(async () => {
    await db.execute(sql`SET LOCAL lock_timeout='5s'`);
    await db.execute(sql`SET LOCAL statement_timeout='15s'`);
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('group-reservations-schema-v1'))`,
    );
    await db.execute(
      sql.raw(
        GROUP_BLOCK_ASSIGNMENT_SCHEMA_SQL + GROUP_ROOM_INVOICE_BATCH_SCHEMA_SQL,
      ),
    );
    const present = (
      await db.execute(
        sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY(${sql.param(Object.keys(columns))}::text[])`,
      )
    ).rows;
    const missing = Object.entries(columns).flatMap(([table, fields]) =>
      fields
        .filter(
          (field) =>
            !present.some(
              (row) => row.table_name === table && row.column_name === field,
            ),
        )
        .map((field) => `${table}.${field}`),
    );
    const found = (
      await db.execute(
        sql`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname=ANY(${sql.param(indexes)}::text[])`,
      )
    ).rows;
    missing.push(
      ...indexes.filter(
        (index) => !found.some((row) => row.indexname === index),
      ),
    );
    if (missing.length)
      throw new Error(
        `El esquema de grupos está incompleto: ${missing.join(", ")}`,
      );
  });
}
