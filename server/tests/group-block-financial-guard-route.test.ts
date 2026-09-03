import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hasFinancialActivity: false,
  updateReservation: vi.fn(),
  deleteGroupBlock: vi.fn(),
  getGroup: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  txUpdate: vi.fn(),
  txDelete: vi.fn(),
  routeExecuteResults: [] as Array<{ rows: any[] }>,
}));

const block = {
  id: "block-financial-guard",
  groupId: "group-financial-guard",
  roomTypeId: "room-type-1",
  quantity: 1,
};

vi.mock("../db-storage", () => ({
  storage: {
    getGroup: state.getGroup,
    updateReservation: state.updateReservation,
    deleteGroupBlock: state.deleteGroupBlock,
  },
  getArgentinaToday: () => "2026-08-31",
}));
vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () =>
      state.routeExecuteResults.shift()
      ?? { rows: [{ has_financial_activity: state.hasFinancialActivity }] }
    ),
    select: vi.fn(() => ({
      from: () => ({ where: async () => [block] }),
    })),
    update: state.update,
    delete: state.delete,
    insert: vi.fn(),
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => {
      let executeCount = 0;
      const tx = {
        execute: vi.fn(async () => {
          executeCount += 1;
          return executeCount === 1
            ? { rows: [{ id: block.groupId }] }
            : { rows: [{ has_financial_activity: true }] };
        }),
        update: state.txUpdate,
        delete: state.txDelete,
        select: vi.fn(),
      };
      return callback(tx);
    }),
  },
}));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
vi.mock("../auth", () => ({ requireAuth: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../billing/groupInvoiceScope", () => ({
  assertGroupPaymentInvoiceScope: vi.fn(),
  assertMasterFacturaTAllowed: vi.fn(),
  getGroupInvoiceSnapshot: vi.fn(),
}));

const { registerGroupsRoutes } = await import("../routes/groups");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
  } finally {
    server.close();
  }
}

describe("DELETE /api/group-blocks/:id financial activity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.hasFinancialActivity = true;
    state.routeExecuteResults = [];
  });

  afterEach(() => {
    state.hasFinancialActivity = false;
  });

  it.each(["a parent group payment", "a sales invoice"])(
    "returns 409 without mutating reservations, rooms, or the block when activity is %s",
    async () => {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/group-blocks/${block.id}`, { method: "DELETE" });

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          error: "No se puede modificar el bloqueo ni desasignar habitaciones: el grupo ya tiene cobros o comprobantes fiscales registrados.",
        });
      });

      expect(state.updateReservation).not.toHaveBeenCalled();
      expect(state.update).not.toHaveBeenCalled();
      expect(state.deleteGroupBlock).not.toHaveBeenCalled();
      expect(state.delete).not.toHaveBeenCalled();
    },
  );
});

describe("DELETE /api/groups/:groupId/reservations/:reservationId transactional guard", () => {
  it("propagates the transaction's 409 and performs no reservation, room, block, or link mutation", async () => {
    state.hasFinancialActivity = false;
    state.routeExecuteResults = [
      { rows: [{ has_financial_activity: false }] },
      { rows: [{ cnt: 0 }] },
    ];
    state.getGroup.mockResolvedValue({
      id: block.groupId,
      name: "Grupo protegido",
      reservations: [{
        id: "reservation-protected",
        reservationCode: "RES-PROTECTED",
        roomId: "room-protected",
        roomTypeId: block.roomTypeId,
        status: "confirmed",
      }],
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/groups/${block.groupId}/reservations/reservation-protected`,
        { method: "DELETE" },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "No se puede modificar el bloqueo ni desasignar habitaciones: el grupo ya tiene cobros o comprobantes fiscales registrados.",
      });
    });

    expect(state.updateReservation).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.delete).not.toHaveBeenCalled();
    expect(state.txUpdate).not.toHaveBeenCalled();
    expect(state.txDelete).not.toHaveBeenCalled();
    expect(state.deleteGroupBlock).not.toHaveBeenCalled();
  });
});