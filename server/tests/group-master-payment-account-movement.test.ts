import express from "express";
import * as http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountMovementAllocations,
  accountMovements,
  groupPayments,
  payments,
} from "@shared/schema";

const GROUP_ID = "group-master-account-001";
const COMPANY_ID = "company-master-account-001";

type LedgerState = {
  groupPayment: Record<string, any> | null;
  accountMovements: Record<string, any>[];
  accountMovementAllocations: Record<string, any>[];
  payments: Record<string, any>[];
  nextId: number;
};

const state: LedgerState = {
  groupPayment: null,
  accountMovements: [],
  accountMovementAllocations: [],
  payments: [],
  nextId: 0,
};

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

function nextId(prefix: string) {
  state.nextId += 1;
  return `${prefix}-${state.nextId}`;
}

function queryResult(rows: any[]) {
  return {
    then: (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    limit: async () => rows,
  };
}

function makeTransaction() {
  let transactionExecuteCount = 0;
  const recordingPayment = !state.groupPayment;
  let ownsCargoLock = false;
  let deleteCount = 0;

  return {
    execute: async () => {
      transactionExecuteCount += 1;

      if (recordingPayment) {
        if (transactionExecuteCount === 1) return { rows: [{ id: GROUP_ID }] };
        if (transactionExecuteCount === 2) {
          return {
            rows: [{
              accommodation: "0",
              group_charges: "10.01",
              extras: "0",
              master_parent_paid: "0",
              direct_all_paid: "0",
              direct_accommodation_paid: "0",
              config: "accommodation",
            }],
          };
        }
        // Atomic cash movement: recordGroupPayment requires an open reception
        // shift before it can commit the parent receipt.
        return { rows: [{ id: "reception-shift-open" }] };
      }

      if (transactionExecuteCount === 1) return { rows: [{ id: GROUP_ID }] };
      if (transactionExecuteCount === 2 || transactionExecuteCount === 3) return { rows: [] };
      if (transactionExecuteCount === 4) {
        // The reversal locks its CC cargos after group/advisory/fiscal locks.
        await acquireCargoLock();
        ownsCargoLock = true;
        return {
          rows: state.accountMovements
            .filter((movement) => movement.type === "cargo")
            .map(({ id, amount }) => ({ id, amount })),
        };
      }

      return {
        rows: state.accountMovementAllocations.length > 0
          ? [{
              cargo_id: state.accountMovementAllocations[0].cargoId,
              allocated: state.accountMovementAllocations
                .reduce((sum, allocation) => sum + Number(allocation.amount), 0)
                .toFixed(2),
            }]
          : [],
      };
    },
    insert: (_table: unknown) => ({
      values: (value: Record<string, any>) => {
        // Current-account cargos are inserted without `.returning()` in the
        // production path, so this write must happen before returning a builder.
        if (value.entityType && value.type === "cargo") {
          const movement = { id: nextId("account-movement"), ...value };
          state.accountMovements.push(movement);
          return { returning: async () => [movement] };
        }

        return {
          returning: async () => {
          if ("groupId" in value && "destination" in value) {
            state.groupPayment = { id: nextId("group-payment"), ...value };
            return [state.groupPayment];
          }

          if ("reservationId" in value && "method" in value) {
            const payment = { id: nextId("payment"), ...value };
            state.payments.push(payment);
            return [payment];
          }

          if ("pagoId" in value && "cargoId" in value) {
            const allocation = { id: nextId("allocation"), ...value };
            state.accountMovementAllocations.push(allocation);
            return [allocation];
          }

          return [{ id: nextId("row"), ...value }];
        },
        };
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === groupPayments) {
            return queryResult(state.groupPayment ? [state.groupPayment] : []);
          }
          if (table === accountMovements) {
            return queryResult(state.accountMovements.filter((movement) => movement.groupPaymentId));
          }
          if (table === accountMovementAllocations) {
            return queryResult(state.accountMovementAllocations);
          }
          return queryResult([]);
        },
      }),
    }),
    delete: (_table: unknown) => ({
      where: async () => {
        deleteCount += 1;
        if (deleteCount === 1) {
          state.accountMovements = [];
        } else if (deleteCount === 2) {
          state.payments = [];
        } else if (deleteCount === 3) {
          state.groupPayment = null;
        }
      },
    }),
    // The reversal also anulas any cash_movements row tied to the deleted
    // group payment. This suite records payments directly via
    // storage.recordGroupPayment (bypassing the POST routes that call
    // registerGroupPaymentCashMovements), so no cash_movements rows ever
    // exist here — this stub only needs to satisfy the call, not track state.
    update: (_table: unknown) => ({
      set: (_values: Record<string, any>) => ({
        where: async () => {},
      }),
    }),
    ownsCargoLock: () => ownsCargoLock,
  };
}

const fakeDb = {
  transaction: async (callback: (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>) => {
    const transaction = makeTransaction();
    try {
      return await callback(transaction);
    } finally {
      if (transaction.ownsCargoLock()) releaseLock();
    }
  },
};

vi.mock("../db", () => ({
  db: fakeDb,
  pool: { query: vi.fn() },
}));

vi.mock("../db-storage", async () => {
  const actual = await vi.importActual<typeof import("../db-storage")>("../db-storage");
  return {
    ...actual,
    storage: new actual.DatabaseStorage(),
  };
});

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../audit", () => ({ audit: vi.fn() }));

async function startApp() {
  const { registerGroupsRoutes } = await import("../routes/groups");
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);

  return new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

async function deleteMasterPayment(baseUrl: string, paymentId: string) {
  const response = await fetch(
    `${baseUrl}/api/groups/${GROUP_ID}/master-payments/${paymentId}`,
    { method: "DELETE" },
  );
  return { status: response.status, body: await response.json() as any };
}

async function recordMixedMasterPayment() {
  const { storage } = await import("../db-storage");
  const recorded = await storage.recordGroupPayment({
    groupId: GROUP_ID,
    destination: "master_folio",
    paymentRows: [
      { method: "cuenta_corriente", amount: "4.01", reference: "CC-001" },
      { method: "efectivo", amount: "6.00", reference: "cash-001" },
    ],
    date: "2026-08-26",
    reference: "Cobro maestro con centavos",
    distribution: "master_folio",
    distributionDetail: { __master_balance__: 10.01 },
    billingEntityType: "company",
    billingEntityId: COMPANY_ID,
  });
  return recorded.groupPayment;
}

describe("group master payment and current-account reversal", () => {
  beforeEach(() => {
    state.groupPayment = null;
    state.accountMovements = [];
    state.accountMovementAllocations = [];
    state.payments = [];
    state.nextId = 0;
    cargoLocked = false;
    releaseCargoLock = null;
  });

  it("persists a retención withheld on the Folio Maestro (non-room) portion of a payment instead of dropping it", async () => {
    const { storage } = await import("../db-storage");
    const recorded = await storage.recordGroupPayment({
      groupId: GROUP_ID,
      destination: "master_folio",
      paymentRows: [
        { method: "efectivo", amount: "6.00", reference: "cash-retencion", retention: { tipo: "iibb", monto: 4.01 } },
      ],
      date: "2026-08-26",
      reference: "Pago Folio Maestro con retención",
      distribution: "master_folio",
      distributionDetail: { __master_balance__: 10.01 },
    });

    // Nothing here allocates to a real room, so there is no payments.notes
    // row to carry the retención — it must instead land on the parent
    // group_payments row's retentionDetail column, not vanish.
    expect(recorded.groupPayment.amount).toBe("10.01");
    expect(recorded.reservationPayments).toHaveLength(0);
    expect(recorded.groupPayment.retentionDetail).toEqual([{ tipo: "iibb", monto: 4.01 }]);
  });

  it("keeps mixed master receipts and current-account cargos in sync when reversing", async () => {
    const groupPayment = await recordMixedMasterPayment();

    expect(groupPayment.amount).toBe("10.01");
    expect(groupPayment.method).toBe("varios");
    expect(groupPayment.paymentMethodDetail).toEqual([
      { method: "cuenta_corriente", amount: "4.01", reference: "CC-001" },
      { method: "efectivo", amount: "6.00", reference: "cash-001" },
    ]);
    expect(state.accountMovements).toHaveLength(1);
    expect(state.accountMovements[0]).toMatchObject({
      entityType: "company",
      entityId: COMPANY_ID,
      type: "cargo",
      amount: "4.01",
      paymentMethod: "cuenta_corriente",
      groupPaymentId: groupPayment.id,
    });

    const app = await startApp();
    try {
      const result = await deleteMasterPayment(app.baseUrl, groupPayment.id);

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(state.groupPayment).toBeNull();
      expect(state.accountMovements).toEqual([]);
    } finally {
      app.close();
    }

    const recreatedPayment = await recordMixedMasterPayment();
    const cargo = state.accountMovements[0];
    state.accountMovementAllocations.push({
      id: "allocation-existing",
      pagoId: "payment-existing",
      cargoId: cargo.id,
      amount: cargo.amount,
    });

    const appWithAppliedCargo = await startApp();
    try {
      const result = await deleteMasterPayment(appWithAppliedCargo.baseUrl, recreatedPayment.id);

      expect(result.status).toBe(409);
      expect(result.body.error).toMatch(/ya fue aplicado/i);
      expect(state.groupPayment).toMatchObject({ id: recreatedPayment.id, amount: "10.01" });
      expect(state.accountMovements).toEqual([cargo]);
    } finally {
      appWithAppliedCargo.close();
    }
  });

  it("serializes a concurrent current-account allocation and reversal", async () => {
    const groupPayment = await recordMixedMasterPayment();
    const cargo = state.accountMovements[0];
    const app = await startApp();

    try {
      const { storage } = await import("../db-storage");
      const allocationResult = storage.createPaymentWithAllocations(
        "company",
        COMPANY_ID,
        {
          date: "2026-08-26",
          description: "Imputación concurrente",
          amount: "-4.01",
          reference: null,
          paymentMethod: "transferencia",
          retentions: null,
          createdBy: null,
        },
        [{ cargoId: cargo.id, amount: "4.01" }],
      );
      const reversalResult = deleteMasterPayment(app.baseUrl, groupPayment.id);
      const [allocation, reversal] = await Promise.allSettled([allocationResult, reversalResult]);

      const allocationSucceeded = allocation.status === "fulfilled";
      const reversalSucceeded =
        reversal.status === "fulfilled" && reversal.value.status === 200;
      expect(Number(allocationSucceeded) + Number(reversalSucceeded)).toBe(1);

      if (reversalSucceeded) {
        expect(allocation.status).toBe("rejected");
        expect(state.groupPayment).toBeNull();
        expect(state.accountMovements).toEqual([]);
        expect(state.accountMovementAllocations).toEqual([]);
      } else {
        expect(allocation.status).toBe("fulfilled");
        expect(reversal).toMatchObject({
          status: "fulfilled",
          value: { status: 409 },
        });
        expect(state.groupPayment).toMatchObject({ id: groupPayment.id });
        expect(state.accountMovements).toEqual([cargo]);
        expect(state.accountMovementAllocations).toHaveLength(1);
      }
    } finally {
      app.close();
    }
  });
});
