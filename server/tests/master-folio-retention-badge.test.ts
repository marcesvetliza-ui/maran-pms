/**
 * Regression test for the Folio Maestro retention badge (Task #396 / #399).
 *
 * When an organizer's payment is withheld with a retención (IIBB/Ganancias)
 * and the gross amount is applied entirely to the master balance / group
 * charges — i.e. no real room ever sees a payments row — the retención used
 * to be silently dropped. It now lives on `group_payments.retention_detail`
 * and must survive the full HTTP round trip:
 *
 *   POST /api/groups/:groupId/master-payment  (real route allocation logic)
 *     -> storage.recordGroupPayment            (persists retentionDetail)
 *     -> GET  /api/groups/:groupId/master-folio (what the UI reads to render
 *        the "Ret. IIBB/Ganancias" badge in "Pagos recibidos del organizador"
 *        and what the master-folio PDF route reads for its own retention line)
 *
 * This exercises the real route's own allocation computation (not just
 * storage.recordGroupPayment called directly with a hand-crafted
 * distributionDetail, which group-master-payment-account-movement.test.ts
 * already covers), and confirms the GET endpoint still surfaces the field
 * unchanged plus correct totals — so a future refactor of either route or
 * of getGroupReservationLedger can't quietly stop the badge from appearing.
 */

import express from "express";
import * as http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "group-retention-badge-001";

const state = {
  groupPayment: null as Record<string, any> | null,
  cashMovements: [] as Record<string, any>[],
  nextId: 0,
};

function nextId(prefix: string) {
  state.nextId += 1;
  return `${prefix}-${state.nextId}`;
}

// A single group charge (an event/salón, not a room) is the entire master
// balance. This keeps the whole payment routed to the "__group_charges__"
// synthetic target inside the route's own allocation logic — i.e. no real
// room ever receives a payments row — exactly the "Folio Maestro, no real
// room" scenario described in the task.
const GROUP_CHARGE = {
  id: "group-charge-001",
  groupId: GROUP_ID,
  description: "Salón de eventos",
  amount: "10.01",
  date: "2026-08-26",
  category: "eventos",
};

function makeTransaction() {
  let executeCount = 0;
  return {
    execute: async () => {
      executeCount += 1;
      if (executeCount === 1) {
        // Group row lock.
        return { rows: [{ id: GROUP_ID }] };
      }
      if (executeCount === 2) {
        // Master-folio totals recomputed under the lock, inside
        // recordGroupPayment's own destination === "master_folio" branch.
        return {
          rows: [{
            accommodation: "0",
            group_charges: GROUP_CHARGE.amount,
            extras: "0",
            master_parent_paid: "0",
            direct_all_paid: "0",
            direct_accommodation_paid: "0",
            config: "accommodation",
          }],
        };
      }
      // Atomic Caja persistence requires a currently open reception shift.
      return { rows: [{ id: "reception-shift-open" }] };
    },
    insert: (_table: unknown) => ({
      values: (value: Record<string, any>) => ({
        returning: async () => {
          if ("groupId" in value && "destination" in value) {
            const groupPayment = { id: nextId("group-payment"), ...value };
            state.groupPayment = groupPayment;
            return [groupPayment];
          }
          if ("shiftId" in value && "paymentId" in value) {
            const movement = { id: nextId("cash-movement"), ...value };
            state.cashMovements.push(movement);
            return [movement];
          }
          return [{ id: nextId("row"), ...value }];
        },
      }),
    }),
  };
}

const fakeDb = {
  transaction: async (callback: (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>) => {
    return callback(makeTransaction());
  },
};

vi.mock("../db", () => ({
  db: fakeDb,
  pool: { query: vi.fn() },
}));

vi.mock("../db-storage", async () => {
  const actual = await vi.importActual<typeof import("../db-storage")>("../db-storage");
  const storage = new actual.DatabaseStorage();
  (storage as any).getGroup = vi.fn().mockResolvedValue({
    id: GROUP_ID,
    name: "Grupo Retención Badge",
    masterFolioConfig: "accommodation",
    billingEntityType: null,
    billingEntityId: null,
    reservations: [], // No active rooms — everything must route to group charges / master balance.
  });
  (storage as any).getGroupCharges = vi.fn().mockResolvedValue([GROUP_CHARGE]);
  (storage as any).getGroupReservationLedger = vi.fn().mockResolvedValue([]);
  (storage as any).getGroupPayments = vi.fn().mockImplementation(async () =>
    state.groupPayment ? [state.groupPayment] : []
  );
  return {
    ...actual,
    storage,
  };
});

vi.mock("../billing/groupInvoiceScope", () => ({
  assertGroupPaymentInvoiceScope: vi.fn(),
  assertMasterFacturaTAllowed: vi.fn(),
  getGroupInvoiceSnapshot: vi.fn().mockResolvedValue({
    sources: [],
    totals: { eligible: 0, invoiced: 0, available: 0 },
    paymentDestinations: [],
  }),
}));

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

describe("Folio Maestro retention badge keeps surfacing through the real HTTP routes", () => {
  beforeEach(() => {
    state.groupPayment = null;
    state.cashMovements = [];
    state.nextId = 0;
  });

  it("persists a retención with no real room and returns it from GET master-folio for the UI badge", async () => {
    const app = await startApp();
    try {
      // 1) Register the payment through the real POST route (not by calling
      // storage.recordGroupPayment directly) so the route's own allocation
      // computation — which decides there's no real room to apply this to —
      // is exercised end to end.
      const postResponse = await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/master-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "none",
          receiverDetails: { razonSocial: "Empresa Receptora SA", cuit: "30712345678" },
          concepts: [{ description: "Anticipo grupo de prueba", amount: 10.01 }],
          paymentRows: [
            { method: "efectivo", amount: "6.00", reference: "cash-retencion", retention: { tipo: "iibb", monto: 4.01 } },
          ],
        }),
      });
      expect(postResponse.status).toBe(200);
      const postBody = await postResponse.json() as any;
      expect(postBody.success).toBe(true);
      expect(postBody.distributed).toBe(0); // No room payment was created.

      // The retención landed on the group_payments row itself.
      expect(state.groupPayment?.amount).toBe("10.01");
      expect(state.groupPayment?.retentionDetail).toEqual([{ tipo: "iibb", monto: 4.01 }]);
      expect(state.cashMovements).toEqual([expect.objectContaining({
        shiftId: "reception-shift-open",
        paymentId: state.groupPayment?.id,
        amount: "6.00",
        paymentMethod: "efectivo",
      })]);

      // 2) Read it back exactly the way client/src/pages/group-detail.tsx
      // does (masterFolio.groupPayments[].retentionDetail) and the way the
      // master-folio PDF route does (parseGroupPaymentRetentions).
      const getResponse = await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/master-folio`);
      expect(getResponse.status).toBe(200);
      const masterFolio = await getResponse.json() as any;

      expect(masterFolio.groupPayments).toHaveLength(1);
      const [gp] = masterFolio.groupPayments;
      expect(gp.retentionDetail).toEqual([{ tipo: "iibb", monto: 4.01 }]);
      expect(parseFloat(gp.amount)).toBeCloseTo(10.01, 2);

      // The retención is part of the gross amount already settled, so the
      // master balance must be fully closed out (not still short by the
      // retained $4.01) — otherwise the badge would show up next to a
      // total that looks wrong to staff.
      expect(masterFolio.masterTotal).toBeCloseTo(10.01, 2);
      expect(masterFolio.masterPaid).toBeCloseTo(10.01, 2);
      expect(masterFolio.masterBalance).toBeCloseTo(0, 2);
    } finally {
      app.close();
    }
  });

  it("rejects a retención that would push the total past the available master balance", async () => {
    const app = await startApp();
    try {
      const response = await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/master-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "none",
          receiverDetails: { razonSocial: "Empresa Receptora SA", cuit: "30712345678" },
          concepts: [{ description: "Anticipo grupo de prueba", amount: 12 }],
          // Gross (cash + retención) = 12.00, but the master balance is only 10.01.
          paymentRows: [
            { method: "efectivo", amount: "6.00", reference: "cash-overflow", retention: { tipo: "iibb", monto: 6.00 } },
          ],
        }),
      });
      expect(response.status).toBe(400);
      const body = await response.json() as any;
      expect(body.error).toMatch(/supera el saldo/i);
      expect(state.groupPayment).toBeNull();
    } finally {
      app.close();
    }
  });
});
