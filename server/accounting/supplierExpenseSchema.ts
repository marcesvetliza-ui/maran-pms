import { sql } from "drizzle-orm";
import { db } from "../db";

/** The supplier ABM's suggested expense account must also exist on fresh databases. */
export async function ensureSupplierExpenseSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE accounting_suppliers
    ADD COLUMN IF NOT EXISTS cuenta_contable_id integer REFERENCES accounting_accounts(id)
  `);
  const result = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounting_suppliers'
      AND column_name = 'cuenta_contable_id'
  `);
  if (!result.rows.length) throw new Error("Falta la cuenta de gasto del proveedor");
}
