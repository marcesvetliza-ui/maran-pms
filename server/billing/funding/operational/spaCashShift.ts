import type { PoolClient } from "pg";
import { FundingError, identifier } from "../contracts";

type Connection = Pick<PoolClient, "query">;
/** SPA uses one operational cash shift per area. opened_by is a display name,
 * not an authenticated user ID or a permission grant. Callers check funding
 * permissions; cash/folio movements retain the authenticated collector's ID. */
export async function assertOpenSpaCashShift(
  c: Connection,
  shiftId: string,
  schema = "public",
  lock = true,
) {
  const s = identifier(schema);
  const shift = await c.query(
    `SELECT id FROM ${s}.cash_shifts WHERE id=$1 AND area='spa' AND status='open'${lock ? " FOR UPDATE" : ""}`,
    [shiftId],
  );
  if (!shift.rowCount)
    throw new FundingError(
      "SHIFT_CLOSED",
      "La caja SPA no tiene ese turno abierto. Volvé a consultar Caja antes de registrar el cobro.",
    );
}

export async function listOpenSpaCashShifts(c: Connection, schema = "public") {
  const s = identifier(schema);
  const result =
    await c.query(`SELECT id,opened_at,opened_by FROM ${s}.cash_shifts
    WHERE area='spa' AND status='open' ORDER BY opened_at DESC,id`);
  return result.rows.map((row) => ({
    id: row.id,
    label: `Caja SPA${row.opened_by ? ` — ${row.opened_by}` : ""} · ${row.id}`,
  }));
}
