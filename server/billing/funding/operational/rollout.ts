import type { PaymentFundingService } from "../service";
import { SqlFundingAdapter } from "../adapters";
import { FundingError, identifier, number, stableId, type Actor } from "../contracts";

const migrationActor: Actor = { id: "system:spa-funding-cutover", permissions: ["funding:read", "funding:write", "funding:historical"] };

/** Authorized module cutover. Existing fiscal history is evidence, never free
 * funding for another invoice. No old invoice/payment/Caja/stock row is edited. */
export async function enrollSpaAccount(service: PaymentFundingService, accountId: string, schema = "public") {
  const s = identifier(schema), scope = { kind: "spa" as const, id: accountId };
  return service.store.transaction(scope, null, async c => {
    if ((await c.query("SELECT 1 FROM payment_funding.scopes WHERE kind='spa' AND id=$1", [accountId])).rowCount) return;
    const account = (await c.query(`SELECT * FROM ${s}.spa_accounts WHERE id=$1 FOR UPDATE`, [accountId])).rows[0];
    if (!account) throw new FundingError("NOT_FOUND", "Cuenta SPA inexistente.", 404);
    const items = (await c.query(`SELECT id,description,quantity,round(subtotal*100)::bigint AS cents
      FROM ${s}.spa_account_items WHERE account_id=$1 ORDER BY id FOR SHARE`, [accountId])).rows;
    const payments = (await c.query(`SELECT id,method,status,round(amount*100)::bigint AS cents
      FROM ${s}.spa_payments WHERE account_id=$1 ORDER BY id FOR SHARE`, [accountId])).rows;
    const invoices = (await c.query(`SELECT id,tipo_comprobante,punto_venta,numero,estado,
      round(COALESCE(monto_total,0)*100)::bigint AS cents
      FROM ${s}.sales_invoices WHERE spa_account_id=$1 OR id::text=ANY($2::text[]) OR nota_credito_id::text=ANY($2::text[])
      ORDER BY id FOR SHARE`, [accountId,[account.invoice_id,account.nc_id].filter(v=>v!==null&&v!==undefined).map(String)])).rows;
    const totalCents = items.reduce((n, row) => n + number(row.cents), 0);
    const paidCents = payments.filter(p => p.status === "active").reduce((n, row) => n + number(row.cents), 0);
    let archiveReason = account.invoice_id || invoices.some(i => i.estado !== "descartada") ? "Historia fiscal anterior al cambio de motor" :
      !["open","closed"].includes(account.status) ? "Cuenta anterior cancelada" :
      account.charged_to && account.charged_to !== "direct" ? "Liquidación anterior por habitación u otro circuito" : "";
    if (!archiveReason) {
      // A genuinely unpaid account may not yet have a unified folio. Its
      // source charges determine the initial balance; this is not a collection.
      if (!payments.length && !(await c.query(`SELECT 1 FROM ${s}.folios WHERE entity_type='spa_account' AND entity_id=$1`, [accountId])).rowCount)
        await c.query(`INSERT INTO ${s}.folios(id,entity_type,entity_id,status,total_charges,total_payments,balance)
          VALUES($1,'spa_account',$2,'open',$3,0,$3)`, [stableId(`spa-funding-folio:${accountId}`), accountId, totalCents / 100]);
      const adapter = service.adapter(scope);
      if (!(adapter instanceof SqlFundingAdapter)) throw new Error("Missing SQL SPA adapter");
      await c.query("SAVEPOINT spa_account_adoption");
      try {
        await adapter.adoptScope(c, scope);
        await c.query("RELEASE SAVEPOINT spa_account_adoption");
        await service.store.event(c, null, `adopted:spa:${accountId}`, "spa_module_enrolled", { scopeKey: `spa:${accountId}` }, migrationActor.id);
        return;
      } catch (error) {
        await c.query("ROLLBACK TO SAVEPOINT spa_account_adoption");
        if (!(error instanceof FundingError)) throw error;
        archiveReason = error.message;
      }
    }
    // Unreconciled historical records remain visible, but cannot be turned
    // into spendable credit or authorize an additional invoice by guessing IDs.
    await c.query("INSERT INTO payment_funding.scopes(kind,id) VALUES('spa',$1)", [accountId]);
    await service.store.event(c, null, `adopted:spa:${accountId}`, "spa_rollout_history", {
      scopeKey: `spa:${accountId}`, history: { reason: archiveReason, status: account.status,
        totalCents, paidCents, payments: payments.map(p => ({ id: p.id, method: p.method, status: p.status, amountCents: number(p.cents) })),
        invoices: invoices.map(i => ({ id: String(i.id), type: i.tipo_comprobante ?? "", point: i.punto_venta ?? null,
          number: i.numero ?? null, status: i.estado, amountCents: number(i.cents) })) },
    }, migrationActor.id);
  });
}

export async function enrollAllSpaAccounts(service: PaymentFundingService, schema = "public") {
  const s = identifier(schema);
  const accounts = (await service.store.pool.query(`SELECT a.id FROM ${s}.spa_accounts a
    WHERE NOT EXISTS(SELECT 1 FROM payment_funding.scopes f WHERE f.kind='spa' AND f.id=a.id) ORDER BY a.id`)).rows;
  for (const account of accounts) await enrollSpaAccount(service, account.id, schema);
  return { accounts: accounts.length };
}
