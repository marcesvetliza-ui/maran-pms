import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hasFinancialActivity: false,
  canEdit: true,
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
vi.mock("../auth", () => ({
  requirePermission: (_key: string) => (_req: any, _res: any, next: () => void) => next(),
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../accommodationPermissions", () => ({ canEditAccommodation: async () => state.canEdit }));
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

describe("Group rate errors and permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.updateReservation.mockReset();
    state.canEdit = true;
    state.getGroup.mockResolvedValue({ id: "g", name: "Grupo", reservations: [{
      id: "r", checkInDate: "2026-10-28", checkOutDate: "2026-10-31",
    }] });
  });
  const change = (base: string, body: object) => fetch(`${base}/api/groups/g/reservations/r/rate`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  it.each([
    "Esta reserva usa precios por noche. Usá Editar tarifas o Modificar estadía desde el Folio.",
    "La reserva pertenece a un grupo con facturación. Resolvé el ajuste en el Folio Maestro antes de modificar alojamiento.",
  ])("preserves the actual pricing conflict: %s", async (message) => {
    state.updateReservation.mockRejectedValue(Object.assign(new Error(message), { statusCode: 409 }));
    await withServer(async (base) => {
      const response = await change(base, { finalRatePerNight: "144000" });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: message });
    });
  });
  it("rejects unauthorized price writes before storage", async () => {
    state.canEdit = false;
    await withServer(async (base) => expect((await change(base, { finalRatePerNight: "144000" })).status).toBe(403));
    expect(state.updateReservation).not.toHaveBeenCalled();
  });
  it.each(["144000oops", "Infinity", "-1", "10.999"])("rejects invalid amount %s", async (value) => {
    await withServer(async (base) => expect((await change(base, { finalRatePerNight: value })).status).toBe(400));
    expect(state.updateReservation).not.toHaveBeenCalled();
  });
  it("saves legacy rate and keeps operational-only updates separate", async () => {
    state.updateReservation.mockResolvedValue({ id: "r" });
    await withServer(async (base) => {
      expect((await change(base, { finalRatePerNight: "144000" })).status).toBe(200);
      expect(state.updateReservation).toHaveBeenLastCalledWith("r", { finalRatePerNight: "144000.00", totalRoomAmount: "432000.00" });
      state.canEdit = false;
      expect((await change(base, { finalRatePerNight: "", lateCheckOut: true, lateCheckOutTime: "16:00" })).status).toBe(200);
      expect(state.updateReservation).toHaveBeenLastCalledWith("r", { lateCheckOut: true, lateCheckOutTime: "16:00" });
    });
  });
  it("hides unexpected internal errors", async () => {
    state.updateReservation.mockRejectedValue(new Error("database details"));
    await withServer(async (base) => {
      const response = await change(base, { finalRatePerNight: "144000" });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Error al actualizar tarifa" });
    });
  });
});

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
  it("preserva la reserva y el bloque cuando el folio tiene cargos extra", async () => {
    vi.clearAllMocks();
    state.routeExecuteResults = [
      { rows: [{ has_financial_activity: false }] },
      { rows: [{ cnt: "1" }] },
    ];
    state.getGroup.mockResolvedValue({
      id: block.groupId,
      name: "Grupo con cargo",
      reservations: [{
        id: "reservation-protected",
        reservationCode: "RES-PROTECTED",
        roomId: "room-protected",
        roomTypeId: block.roomTypeId,
        status: "confirmed",
      }],
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${block.groupId}/reservations/reservation-protected`, { method: "DELETE" });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("1 cargo(s) extra");
    });

    expect(state.txUpdate).not.toHaveBeenCalled();
    expect(state.txDelete).not.toHaveBeenCalled();
    expect(state.deleteGroupBlock).not.toHaveBeenCalled();
  });

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
