import express from "express";
import * as http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cashMovements as cashMovementsTable, groupPayments as groupPaymentsTable } from "@shared/schema";

// Regression test for task #411: registerGroupPaymentCashMovements() links
// each cash_movements row it creates to the group payment via
// payment_id = group_payments.id. Deleting a master-folio group payment
// must anular those linked cash_movements rows in the same transaction, or
// Caja/Reportes keep showing income for a payment that no longer exists.

const GROUP_ID = "group-cash-reversal-001";
const PAYMENT_ID = "group-payment-cash-reversal-001";

type State = {
  groupPayment: Record<string, any> | null;
  cashMovements: Record<string, any>[];
};

const state: State = { groupPayment: null, cashMovements: [] };

function makeTransaction() {
  return {
    execute: async () => ({ rows: [] }), // no current-account cargos locked
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === groupPaymentsTable) {
              return state.groupPayment ? [state.groupPayment] : [];
            }
            return [];
          },
        }),
      }),
    }),
    delete: (_table: unknown) => ({
      where: async () => {
        // Only group_payments deletion matters for this test; payments
        // deletion is a separate no-op call in the handler.
        state.groupPayment = null;
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, any>) => ({
        where: async () => {
          if (table !== cashMovementsTable) return;
          for (const movement of state.cashMovements) {
            if (movement.paymentId === PAYMENT_ID && !movement.anulado) {
              Object.assign(movement, values);
            }
          }
        },
      }),
    }),
  };
}

const fakeDb = {
  transaction: async (callback: (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>) =>
    callback(makeTransaction()),
};

vi.mock("../db", () => ({ db: fakeDb }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "cajera-tester" };
    next();
  },
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../billing/groupInvoiceScope", () => ({
  assertGroupPaymentInvoiceScope: vi.fn(),
  assertMasterFacturaTAllowed: vi.fn(),
  getGroupInvoiceSnapshot: vi.fn(),
}));
vi.mock("../db-storage", () => ({
  storage: {},
  getArgentinaToday: () => "2026-08-27",
}));

async function startApp() {
  const { registerGroupsRoutes } = await import("../routes/groups");
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);
  return new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

describe("deleting a master-folio group payment anulas its linked cash movements", () => {
  beforeEach(() => {
    state.groupPayment = {
      id: PAYMENT_ID,
      groupId: GROUP_ID,
      amount: "500.00",
      method: "efectivo",
      invoiceRef: null,
    };
    state.cashMovements = [
      {
        id: "cash-movement-1",
        area: "reception",
        sourceType: "group_payment",
        sourceId: GROUP_ID,
        paymentMethod: "efectivo",
        amount: "500.00",
        movementType: "income",
        paymentId: PAYMENT_ID,
        anulado: false,
      },
    ];
  });

  it("marks the linked cash_movements row as anulado and preserves its audit trail", async () => {
    const app = await startApp();
    try {
      const response = await fetch(
        `${app.baseUrl}/api/groups/${GROUP_ID}/master-payments/${PAYMENT_ID}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      const movement = state.cashMovements[0];
      expect(movement.anulado).toBe(true);
      expect(movement.anuladoPor).toBe("cajera-tester");
      expect(movement.anuladoAt).toBeInstanceOf(Date);
      expect(typeof movement.motivoAnulacion).toBe("string");
      expect(movement.motivoAnulacion.length).toBeGreaterThan(0);
    } finally {
      app.close();
    }
  });

  it("does not touch cash movements from a different group payment", async () => {
    state.cashMovements.push({
      id: "cash-movement-unrelated",
      paymentId: "some-other-payment",
      anulado: false,
    });

    const app = await startApp();
    try {
      await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/master-payments/${PAYMENT_ID}`, {
        method: "DELETE",
      });
      const unrelated = state.cashMovements.find((m) => m.id === "cash-movement-unrelated");
      expect(unrelated?.anulado).toBe(false);
    } finally {
      app.close();
    }
  });

  it("leaves an already-anulado cash movement untouched", async () => {
    state.cashMovements[0].anulado = true;
    state.cashMovements[0].motivoAnulacion = "Anulación manual previa";

    const app = await startApp();
    try {
      await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/master-payments/${PAYMENT_ID}`, {
        method: "DELETE",
      });
      expect(state.cashMovements[0].motivoAnulacion).toBe("Anulación manual previa");
    } finally {
      app.close();
    }
  });
});
