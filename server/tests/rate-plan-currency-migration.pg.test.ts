import pg from "pg";
import { describe, it, expect } from "vitest";
import { RATE_PLAN_MISSING_CURRENCY_SQL } from "../ratePlanCurrencyMigration";

(process.env.DATABASE_URL ? describe : describe.skip)("rate plan currency at startup", () => {
  it("preserves USD plans, amounts and mappings across repeated startups", async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE rate_plans (id text, currency text, amount numeric) ON COMMIT DROP");
      await client.query("CREATE TEMP TABLE currency_test_mappings (plan_id text) ON COMMIT DROP");
      await client.query("INSERT INTO rate_plans VALUES ('usd','USD',119.09),('ars','ARS',184000),('eur','EUR',100),('legacy',NULL,50),('blank',' ',60)");
      await client.query("INSERT INTO currency_test_mappings VALUES ('usd')");
      await client.query(RATE_PLAN_MISSING_CURRENCY_SQL);
      await client.query(RATE_PLAN_MISSING_CURRENCY_SQL);
      expect((await client.query("SELECT * FROM rate_plans ORDER BY id")).rows).toEqual([
        { id: "ars", currency: "ARS", amount: "184000" },
        { id: "blank", currency: "ARS", amount: "60" },
        { id: "eur", currency: "EUR", amount: "100" },
        { id: "legacy", currency: "ARS", amount: "50" },
        { id: "usd", currency: "USD", amount: "119.09" },
      ]);
      expect((await client.query("SELECT p.id, p.amount FROM rate_plans p JOIN currency_test_mappings m ON m.plan_id=p.id WHERE p.currency='USD'")).rows).toEqual([{ id: "usd", amount: "119.09" }]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
