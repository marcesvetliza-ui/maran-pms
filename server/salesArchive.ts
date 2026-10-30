import { sql, type SQLWrapper } from "drizzle-orm";

// Membership is populated only by an audited, one-off maintenance transaction.
// Keeping the original rows preserves fiscal numbering, idempotency and the
// references owned by gift vouchers, folios, groups and prepaid SPA treatments.
export const SALES_ARCHIVE_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS sales_control_archive (
  kind text NOT NULL CHECK (kind IN ('invoice','account_movement','cash_movement','cash_closing','admin_cash','cc_manual')),
  record_id text NOT NULL,
  batch_id text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kind,record_id)
)`;

export function activeSalesRecord(kind: "invoice" | "account_movement" | "cash_movement" | "cash_closing" | "admin_cash" | "cc_manual", id: SQLWrapper) {
  return sql`NOT EXISTS (SELECT 1 FROM sales_control_archive sca WHERE sca.kind=${kind} AND sca.record_id=(${id})::text)`;
}
