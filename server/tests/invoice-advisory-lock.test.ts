import { describe, expect, it } from "vitest";
import { withInvoiceAdvisoryLock } from "../billing/invoiceAdvisoryLock";

describe("invoice advisory reconciliation lock", () => {
  it("serializes concurrent resumptions and always releases the session lock", async () => {
    let held = false;
    const waiters: Array<() => void> = [];
    const events: string[] = [];
    const pool = {
      async connect() {
        return {
          async query(text: string, values?: unknown[]) {
            const key = String(values?.[0]);
            if (text.includes("pg_advisory_lock")) {
              if (held) await new Promise<void>((resolve) => waiters.push(resolve));
              held = true;
              events.push(`lock:${key}`);
            } else {
              held = false;
              events.push(`unlock:${key}`);
              waiters.shift()?.();
            }
          },
          release() {
            events.push("release");
          },
        };
      },
    };
    let authorizations = 0;
    let finalized = false;
    const resume = () => withInvoiceAdvisoryLock(pool, "group-invoice:g-1", async () => {
      if (finalized) return "existing";
      authorizations += 1;
      await Promise.resolve();
      finalized = true;
      return "authorized";
    });

    await expect(Promise.all([resume(), resume()])).resolves.toEqual(["authorized", "existing"]);
    expect(authorizations).toBe(1);
    expect(events.filter((event) => event === "lock:group-invoice:g-1")).toHaveLength(2);
    expect(events.filter((event) => event === "unlock:group-invoice:g-1")).toHaveLength(2);
    expect(events.filter((event) => event === "release")).toHaveLength(2);
  });

  it("uses the folio lock domain and unlocks after a failed resume", async () => {
    const queries: Array<{ text: string; key: unknown }> = [];
    const pool = {
      async connect() {
        return {
          async query(text: string, values?: unknown[]) {
            queries.push({ text, key: values?.[0] });
          },
          release() {},
        };
      },
    };
    await expect(withInvoiceAdvisoryLock(pool, "folio-invoice:r-9", async () => {
      throw new Error("ARCA unavailable");
    })).rejects.toThrow("ARCA unavailable");
    expect(queries.map((query) => query.key)).toEqual(["folio-invoice:r-9", "folio-invoice:r-9"]);
    expect(queries[1].text).toContain("pg_advisory_unlock");
  });
});