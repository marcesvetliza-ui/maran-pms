import express from "express";
import * as http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = {
  getRoomTypes: vi.fn(),
  getOrphanedRoomTypeReferences: vi.fn(),
  getRoomTypeReferencePreview: vi.fn(),
  reassignRoomTypeReferences: vi.fn(),
  deleteRoomType: vi.fn(),
};

vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: () => "2026-09-01",
}));
vi.mock("../auth", () => ({
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
  },
}));

async function startApp() {
  const { registerRoomsRoutes } = await import("../routes/rooms");
  const app = express();
  app.use(express.json());
  registerRoomsRoutes(app);

  return await new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
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

describe("room type catalog integrity routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getRoomTypes.mockResolvedValue([]);
    mockStorage.getOrphanedRoomTypeReferences.mockResolvedValue([]);
    mockStorage.getRoomTypeReferencePreview.mockResolvedValue({
      roomTypeId: "deleted-type",
      source: "rooms",
      records: [{ id: "room-1", label: "101" }],
      total: 1,
      limit: 50,
      hasMore: false,
    });
    mockStorage.reassignRoomTypeReferences.mockResolvedValue({
      fromRoomTypeId: "legacy",
      toRoomTypeId: "double",
      updated: [],
    });
    mockStorage.deleteRoomType.mockResolvedValue({ deleted: true, references: [] });
  });

  it("returns the canonical catalog even when a type has no rooms", async () => {
    mockStorage.getRoomTypes.mockResolvedValue([
      { id: "suite", name: "Suite", code: "SUI" },
      { id: "triple", name: "Triple", code: "TRI" },
    ]);
    const app = await startApp();

    try {
      const response = await fetch(`${app.baseUrl}/api/room-types`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        expect.objectContaining({ id: "suite", name: "Suite", code: "SUI" }),
        expect.objectContaining({ id: "triple", name: "Triple", code: "TRI" }),
      ]);
    } finally {
      app.close();
    }
  });

  it("reports orphaned references with their source and count", async () => {
    mockStorage.getOrphanedRoomTypeReferences.mockResolvedValue([
      { roomTypeId: "deleted-type", references: [{ source: "rooms", count: 2 }] },
    ]);
    const app = await startApp();

    try {
      const response = await fetch(`${app.baseUrl}/api/room-types/integrity`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        orphanedReferences: [
          { roomTypeId: "deleted-type", references: [{ source: "rooms", count: 2 }] },
        ],
      });
    } finally {
      app.close();
    }
  });

  it("returns a bounded concrete preview for one orphan source", async () => {
    mockStorage.getRoomTypeReferencePreview.mockResolvedValue({
      roomTypeId: "deleted-type",
      source: "rooms",
      records: [{ id: "room-1", label: "101" }],
      total: 3,
      limit: 2,
      hasMore: true,
    });
    const app = await startApp();

    try {
      const response = await fetch(
        `${app.baseUrl}/api/room-types/integrity/preview?roomTypeId=deleted-type&source=rooms&limit=2`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        roomTypeId: "deleted-type",
        source: "rooms",
        records: [{ id: "room-1", label: "101" }],
        total: 3,
        limit: 2,
        hasMore: true,
      });
      expect(mockStorage.getRoomTypeReferencePreview).toHaveBeenCalledWith("deleted-type", "rooms", 2);
    } finally {
      app.close();
    }
  });

  it("rejects an invalid preview source or unbounded limit", async () => {
    const app = await startApp();

    try {
      const invalidSource = await fetch(
        `${app.baseUrl}/api/room-types/integrity/preview?roomTypeId=deleted-type&source=unknown`,
      );
      expect(invalidSource.status).toBe(400);

      const invalidLimit = await fetch(
        `${app.baseUrl}/api/room-types/integrity/preview?roomTypeId=deleted-type&source=rooms&limit=101`,
      );
      expect(invalidLimit.status).toBe(400);
      expect(mockStorage.getRoomTypeReferencePreview).not.toHaveBeenCalled();
    } finally {
      app.close();
    }
  });

  it("blocks deletion while the type is referenced", async () => {
    mockStorage.deleteRoomType.mockResolvedValue({
      deleted: false,
      references: [
        { source: "rooms", count: 3 },
        { source: "group_room_blocks", count: 1 },
      ],
    });
    const app = await startApp();

    try {
      const response = await fetch(`${app.baseUrl}/api/room-types/in-use`, { method: "DELETE" });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual(expect.objectContaining({
        code: "ROOM_TYPE_IN_USE",
        references: [
          { source: "rooms", count: 3 },
          { source: "group_room_blocks", count: 1 },
        ],
      }));
    } finally {
      app.close();
    }
  });

  it("reassigns legacy references only with an explicit source and target", async () => {
    mockStorage.reassignRoomTypeReferences.mockResolvedValue({
      fromRoomTypeId: "deleted-type",
      toRoomTypeId: "double",
      updated: [{ source: "rooms", count: 2 }],
    });
    const app = await startApp();

    try {
      const response = await fetch(`${app.baseUrl}/api/room-types/reassign-references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRoomTypeId: "deleted-type", toRoomTypeId: "double" }),
      });
      expect(response.status).toBe(200);
      expect(mockStorage.reassignRoomTypeReferences).toHaveBeenCalledWith("deleted-type", "double");
      expect(await response.json()).toEqual({
        fromRoomTypeId: "deleted-type",
        toRoomTypeId: "double",
        updated: [{ source: "rooms", count: 2 }],
      });
    } finally {
      app.close();
    }
  });

  it("reports a stale diagnostic when the source is no longer orphaned", async () => {
    mockStorage.reassignRoomTypeReferences.mockRejectedValue(
      new Error("El tipo de habitación de origen ya existe en el catálogo; actualice el diagnóstico"),
    );
    const app = await startApp();

    try {
      const response = await fetch(`${app.baseUrl}/api/room-types/reassign-references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRoomTypeId: "restored-type", toRoomTypeId: "double" }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "El tipo de habitación de origen ya existe en el catálogo; actualice el diagnóstico",
      });
    } finally {
      app.close();
    }
  });
});