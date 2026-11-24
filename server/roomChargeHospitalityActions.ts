import type { PoolClient } from "pg";
export async function hospitalityChargeFacts(client: PoolClient, id: string) {
  const installed = await client.query(
    "SELECT to_regclass('hospitality_included_sources') IS NOT NULL installed",
  );
  if (!installed.rows[0]?.installed) return null;
  const hasColumn = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='hospitality_included_sources' AND column_name='origin_charge_id'",
  );
  if (!hasColumn.rows.length) return null;
  const result = await client.query(
    `SELECT c.hospitality_units AS units,c.is_recurring AS recurring FROM hospitality_included_sources s JOIN charges c ON c.id=s.origin_charge_id WHERE c.id=$1 AND s.id='room_charge:'||c.id AND s.kind='supplement'`,
    [id],
  );
  return (
    (result.rows[0] as { units: number; recurring: boolean } | undefined) ||
    null
  );
}
export async function hospitalityChargeUnitPrice(
  client: PoolClient,
  id: string,
  amount: bigint,
  actor: { id?: string; name?: string },
) {
  const facts = await hospitalityChargeFacts(client, id);
  if (!facts) return null;
  await client.query(
    "SELECT set_config('hospitality.actor_id',$1,true),set_config('hospitality.actor_name',$2,true)",
    [actor.id || "Sistema", actor.name || actor.id || "Sistema"],
  );
  if (!facts.recurring) return null;
  const units = BigInt(facts.units);
  if (units <= 0n || amount % units !== 0n)
    throw Object.assign(
      new Error(
        "El importe debe corresponder a un precio por noche con dos decimales. Revisá el total del cargo.",
      ),
      { statusCode: 400 },
    );
  const value = amount / units;
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

/** Called under the same invoice scope as the stay update. Only the new,
 * explicitly linked charge origin participates; legacy recurring writers stay intact. */
export async function repriceHospitalityCharge(
  reservationId: string,
  chargeId: string,
  nights: number,
  actor: { id: string; name: string },
): Promise<boolean> {
  const { pool } = await import("./db");
  const { hasFinancialScopeLock, withReservationFinancialLock } = await import(
    "./nightlyPricingGuard"
  );
  if (!hasFinancialScopeLock("folio-invoice:" + reservationId))
    return withReservationFinancialLock(reservationId, () =>
      repriceHospitalityCharge(reservationId, chargeId, nights, actor),
    );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM reservations WHERE id=$1 FOR UPDATE", [
      reservationId,
    ]);
    const charge = (
      await client.query(
        "SELECT * FROM charges WHERE id=$1 AND reservation_id=$2 FOR UPDATE",
        [chargeId, reservationId],
      )
    ).rows[0];
    if (
      !charge?.is_recurring ||
      !charge.unit_amount ||
      !(await hospitalityChargeFacts(client, chargeId))
    ) {
      await client.query("COMMIT");
      return false;
    }
    const group = (
      await client.query(
        "SELECT group_id FROM group_reservation_links WHERE reservation_id=$1",
        [reservationId],
      )
    ).rows[0]?.group_id;
    const { invoiceSourceConflict } = await import(
      "./billing/chargeFiscalHistory"
    );
    const conflict = await invoiceSourceConflict(
      client,
      reservationId,
      chargeId,
      undefined,
      false,
      group,
    );
    const mirrors = await client.query(
      "SELECT fm.id,fm.folio_id,fm.amount,f.status,f.closed_at FROM folio_movements fm JOIN folios f ON f.id=fm.folio_id WHERE fm.type='charge' AND fm.source_type='charge' AND fm.source_id=$1 FOR UPDATE OF fm,f",
      [chargeId],
    );
    const cents = (value: string) => {
      const [whole, fraction = ""] = value.split(".");
      return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    };
    const mirror = mirrors.rows[0];
    if (
      conflict ||
      mirrors.rows.length !== 1 ||
      mirror.status !== "open" ||
      mirror.closed_at ||
      cents(mirror.amount) !== cents(charge.amount)
    ) {
      await client.query(
        "UPDATE hospitality_included_services SET needs_review=true,version=version+1 WHERE source_id='room_charge:'||$1",
        [chargeId],
      );
      await client.query("COMMIT");
      return false;
    }
    const amount = cents(charge.unit_amount) * BigInt(nights),
      amountText = `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
    const description =
      String(charge.description)
        .replace(/\s*\(x\d+\)$/, "")
        .trim() + ` (x${nights})`;
    await client.query(
      "SELECT set_config('hospitality.actor_id',$1,true),set_config('hospitality.actor_name',$2,true)",
      [actor.id, actor.name],
    );
    await client.query(
      "UPDATE charges SET amount=$1,description=$2,hospitality_units=$3 WHERE id=$4",
      [amountText, description, nights, chargeId],
    );
    await client.query(
      "UPDATE folio_movements SET amount=$1,description=$2 WHERE id=$3",
      [amountText, description, mirror.id],
    );
    await client.query(
      "UPDATE folios SET total_charges=total_charges+($1::numeric-$2::numeric),balance=balance+($1::numeric-$2::numeric) WHERE id=$3",
      [amountText, charge.amount, mirror.folio_id],
    );
    await client.query(
      "INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES($1,$2,'update','charges','reservation_room_charge',$3,'Cargo e incluidos actualizados por cambio de noches',$4,now())",
      [
        actor.id,
        actor.name,
        chargeId,
        JSON.stringify({
          before: charge,
          after: { amount: amountText, units: nights },
          reason: "Cambio de noches de la estadía",
        }),
      ],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
