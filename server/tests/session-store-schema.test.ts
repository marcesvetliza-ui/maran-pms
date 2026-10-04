import { describe, expect, it, vi } from "vitest";
import { createSessionStoreReadiness, ensureSessionStoreSchema } from "../sessionStoreSchema";

describe("session store bootstrap", () => {
  it("creates the table and expiry index in one serialized, pooler-safe batch", async () => {
    const query = vi.fn().mockResolvedValue({});
    await ensureSessionStoreSchema({ query });
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sessions");
    expect(sql).toContain("sid varchar PRIMARY KEY NOT NULL");
    expect(sql).toContain("sess json NOT NULL");
    expect(sql).toContain("expire timestamp(6) NOT NULL");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS sessions_expire_idx");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("propagates bootstrap failures rather than pretending sessions are ready", async () => {
    const failure = new Error("test database unavailable");
    await expect(ensureSessionStoreSchema({
      query: vi.fn().mockRejectedValue(failure),
    })).rejects.toBe(failure);
  });

  it("retries a transient failure without a request stampede or repeated successful DDL", async () => {
    let now = 0;
    const query = vi.fn().mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValue({});
    const onFailure = vi.fn();
    const ready = createSessionStoreReadiness({ query }, onFailure, () => now);
    expect(await ready()).toBe(false);
    expect(await Promise.all(Array.from({ length: 10 }, ready))).toEqual(Array(10).fill(false));
    expect(query).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    now = 5_001;
    expect(await Promise.all(Array.from({ length: 10 }, ready))).toEqual(Array(10).fill(true));
    expect(await ready()).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
});