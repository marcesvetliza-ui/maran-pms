type AdvisoryPool = {
  connect(): Promise<{
    query(text: string, values?: unknown[]): Promise<unknown>;
    release(): void;
  }>;
};

/** Cross-instance session lock used for the complete invoice reconciliation. */
export async function withInvoiceAdvisoryLock<T>(
  pool: AdvisoryPool,
  lockKey: string,
  action: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    return await action();
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
    client.release();
  }
}