import { describe, expect, it, vi } from "vitest";

let allocationTotal = 0;
let nextPaymentId = 0;
let cargoLocked = false;
let releaseCargoLock: (() => void) | null = null;

async function acquireCargoLock() {
  while (cargoLocked) {
    await new Promise<void>((resolve) => {
      releaseCargoLock = resolve;
    });
  }
  cargoLocked = true;
}

function releaseLock() {
  cargoLocked = false;
  releaseCargoLock?.();
  releaseCargoLock = null;
}

const fakeDb = {
  transaction: async (callback: (tx: any) => Promise<unknown>) => {
    let executeCount = 0;
    const tx = {
      execute: async () => {
        executeCount += 1;
        if (executeCount === 1) {
          await acquireCargoLock();
          return { rows: [{ id: "cargo-1", amount: "100.00" }] };
        }
        return { rows: allocationTotal > 0 ? [{ cargo_id: "cargo-1", allocated: allocationTotal.toFixed(2) }] : [] };
      },
      insert: () => ({
        values: (value: any) => ({
          returning: async () => {
            if ("pagoId" in value) {
              allocationTotal += Number(value.amount);
              return [{ id: `allocation-${nextPaymentId}`, ...value }];
            }
            nextPaymentId += 1;
            return [{ id: `payment-${nextPaymentId}`, ...value }];
          },
        }),
      }),
    };

    try {
      return await callback(tx);
    } finally {
      if (cargoLocked) releaseLock();
    }
  },
};

vi.mock("../db", () => ({ db: fakeDb, pool: { query: vi.fn() } }));

describe("Cuenta Corriente concurrent allocation guard", () => {
  it("allows only one of two simultaneous payments to allocate the same full cargo", async () => {
    allocationTotal = 0;
    nextPaymentId = 0;
    cargoLocked = false;
    releaseCargoLock = null;

    const { DatabaseStorage } = await import("../db-storage");
    const storage = new DatabaseStorage();
    const data = {
      date: "2026-08-23",
      description: "Pago simultáneo de prueba",
      amount: "-100.00",
      reference: null,
      paymentMethod: "transferencia",
      retentions: null,
      createdBy: null,
    };
    const allocations = [{ cargoId: "cargo-1", amount: "100.00" }];

    const results = await Promise.allSettled([
      storage.createPaymentWithAllocations("company", "entity-1", data, allocations),
      storage.createPaymentWithAllocations("company", "entity-1", data, allocations),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(allocationTotal).toBe(100);
  });
});