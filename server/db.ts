import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "@shared/schema";

// PostgreSQL OID 1082 = date type.
// By default node-postgres returns date columns as JavaScript Date objects
// (midnight UTC). In Argentina (UTC-3) that shifts to the previous day,
// making isSameDay() comparisons on the client return false — appointments
// become invisible on the grid even though they exist in the DB.
// Returning dates as plain "YYYY-MM-DD" strings avoids the timezone offset.
pg.types.setTypeParser(1082, (val: string) => val);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 10,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error (connection will be replaced):", err.message);
});
const rootDb = drizzle(pool, { schema });
type Transaction = Parameters<Parameters<typeof rootDb.transaction>[0]>[0];
const transactionContext = new AsyncLocalStorage<Transaction>();

// Storage helpers share the caller's transaction only when explicitly scoped.
// Other requests and background jobs continue to use the ordinary pool.
export const db: typeof rootDb = new Proxy(rootDb, {
  get(_target, property) {
    const executor = transactionContext.getStore() ?? rootDb;
    const value = Reflect.get(executor, property, executor);
    return typeof value === "function" ? value.bind(executor) : value;
  },
});

export function withDatabaseTransaction<T>(action: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) return action();
  return rootDb.transaction((tx) => transactionContext.run(tx, action));
}
export { pool };
