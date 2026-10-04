// connect-pg-simple owns this table; it is not part of the business schema.
// Keep bootstrap available independently of the development-only baseline.
export const SESSION_STORE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    sid varchar PRIMARY KEY NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) NOT NULL
  )
`;

export const SESSION_STORE_EXPIRY_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire)";

export async function ensureSessionStoreSchema(
  connection: { query: (text: string) => Promise<unknown> },
): Promise<void> {
  // One implicit transaction, also safe behind transaction-pooling proxies.
  // Serialize concurrent startup/bootstrap attempts before catalog-changing DDL.
  await connection.query(`
    SELECT pg_advisory_xact_lock(1296126535, 2);
    ${SESSION_STORE_TABLE_SQL};
    ${SESSION_STORE_EXPIRY_INDEX_SQL};
  `);
}

export function createSessionStoreReadiness(
  connection: { query: (text: string) => Promise<unknown> },
  onFailure: () => void,
  now: () => number = Date.now,
) {
  let preparation: Promise<boolean> | null = null;
  let retryAfter = 0;
  return function ready(): Promise<boolean> {
    if (preparation) return preparation;
    if (now() < retryAfter) return Promise.resolve(false);
    preparation = ensureSessionStoreSchema(connection).then(
      () => true,
      () => {
        retryAfter = now() + 5_000;
        preparation = null;
        onFailure();
        return false;
      },
    );
    return preparation;
  };
}