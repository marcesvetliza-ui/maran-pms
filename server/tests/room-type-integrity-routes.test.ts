import express from "express";
import * as http from "node:http";
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import archiver from "archiver";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = {
  getRoomTypes: vi.fn(),
  getOrphanedRoomTypeReferences: vi.fn(),
  getRoomTypeReferencePreview: vi.fn(),
  getRoomTypeReferenceExportPage: vi.fn(),
  reassignRoomTypeReferences: vi.fn(),
  deleteRoomType: vi.fn(),
};

vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: () => "2026-09-01",
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
  },
}));

async function startApp(options: {
  onRequest?: (request: http.IncomingMessage) => void;
} = {}) {
  const { registerRoomsRoutes } = await import("../routes/rooms");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "manager-room-type-integrity",
      username: "manager-integrity",
      email: "manager-integrity@example.test",
      fullName: "Manager Integridad",
      role: "manager",
      department: "recepcion",
      phone: null,
      isActive: "true",
    };
    req.isAuthenticated = () => true;
    options.onRequest?.(req);
    next();
  });
  registerRoomsRoutes(app);

  return await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((resolveClose, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClose());
        }),
      });
    });
  });
}

async function roomTypeExportTempDirs() {
  return (await readdir(tmpdir()))
    .filter((entry) => entry.startsWith("room-type-integrity-"))
    .sort();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function waitForTempDirRemoval(directoryName: string) {
  return new Promise<void>((resolve, reject) => {
    const watcher = watch(tmpdir(), (_eventType, filename) => {
      if (String(filename ?? "") !== directoryName) return;
      watcher.close();
      resolve();
    });
    watcher.once("error", (error) => {
      watcher.close();
      reject(error);
    });
  });
}

const archiveAbort = vi.spyOn(Object.getPrototypeOf(archiver("zip")), "abort");

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
    mockStorage.getRoomTypeReferenceExportPage.mockResolvedValue({
      records: [],
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

  it("streams the complete evidence in pages as escaped CSV when explicitly requested", async () => {
    mockStorage.getRoomTypeReferenceExportPage
      .mockResolvedValueOnce({
        records: [
          { id: "room-1", label: "101, Ala \"Norte\"" },
          { id: "room-2", label: "102" },
        ],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        records: [
          { id: "room-3", label: "=HYPERLINK(\"https://example.test\")" },
          { id: "+room-4", label: "\t@SUM(1+1)" },
          { id: "room-5", label: "-1+2" },
        ],
        hasMore: false,
      });
    const app = await startApp();

    try {
      const response = await fetch(
        `${app.baseUrl}/api/room-types/integrity/export?roomTypeId=deleted-type&source=rooms&format=csv`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain(
        "evidencia_tipo_habitacion_deleted-type_rooms.csv",
      );
      expect(await response.text()).toBe(
        "Identificador técnico,Etiqueta legible\n" +
        '"room-1","101, Ala ""Norte"""\n' +
        '"room-2","102"\n' +
        "\"room-3\",\"'=HYPERLINK(\"\"https://example.test\"\")\"\n" +
        "\"'+room-4\",\"'\t@SUM(1+1)\"\n" +
        "\"room-5\",\"'-1+2\"\n",
      );
      expect(mockStorage.getRoomTypeReferenceExportPage).toHaveBeenNthCalledWith(
        1,
        "deleted-type",
        "rooms",
        0,
        250,
      );
      expect(mockStorage.getRoomTypeReferenceExportPage).toHaveBeenNthCalledWith(
        2,
        "deleted-type",
        "rooms",
        2,
        250,
      );
    } finally {
      app.close();
    }
  });

  it("downloads a certified ZIP with the CSV, manifest and verifiable SHA-256 hash", async () => {
    mockStorage.getRoomTypeReferenceExportPage.mockResolvedValue({
      records: [
        { id: "room-1", label: "101" },
        { id: "room-2", label: "102" },
      ],
      hasMore: false,
    });
    const app = await startApp();

    try {
      const response = await fetch(
        `${app.baseUrl}/api/room-types/integrity/export?roomTypeId=deleted-type&source=rooms`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/zip");
      expect(response.headers.get("content-disposition")).toContain(
        "evidencia_tipo_habitacion_deleted-type_rooms_certificada.zip",
      );

      const zip = await JSZip.loadAsync(await response.arrayBuffer());
      const csvFilename = "evidencia_tipo_habitacion_deleted-type_rooms.csv";
      const csvBuffer = Buffer.from(await zip.file(csvFilename)!.async("nodebuffer"));
      const manifest = JSON.parse(await zip.file("manifiesto.json")!.async("string"));
      const guide = await zip.file("COMO_VERIFICAR.txt")!.async("string");

      expect(manifest).toEqual(expect.objectContaining({
        manifestVersion: 1,
        roomTypeId: "deleted-type",
        source: "rooms",
        recordCount: 2,
        csvFile: csvFilename,
        hash: {
          algorithm: "SHA-256",
          value: expect.any(String),
          verifiedBytes: expect.stringContaining("CSV"),
        },
        verificationInstructions: expect.arrayContaining([
          expect.stringContaining("sha256sum"),
        ]),
      }));
      expect(manifest.generatedAt).toEqual(expect.any(String));
      expect(manifest.hash.value).toBe(createHash("sha256").update(csvBuffer).digest("hex"));
      expect(guide).toContain(manifest.hash.value);
      expect(guide).toContain("Cómo verificar:");
      expect(await zip.file(csvFilename)!.async("string")).toContain("room-1");
      expect(mockStorage.getRoomTypeReferenceExportPage).toHaveBeenCalledWith(
        "deleted-type",
        "rooms",
        0,
        250,
      );
    } finally {
      app.close();
    }
  });

  it("removes the temporary CSV when certified evidence generation fails", async () => {
    const tempDirsBefore = await roomTypeExportTempDirs();
    mockStorage.getRoomTypeReferenceExportPage
      .mockResolvedValueOnce({
        records: [{ id: "room-1", label: "101" }],
        hasMore: true,
      })
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const app = await startApp();

    try {
      const response = await fetch(
        `${app.baseUrl}/api/room-types/integrity/export?roomTypeId=deleted-type&source=rooms`,
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Error exportando las referencias" });
      expect(await roomTypeExportTempDirs()).toEqual(tempDirsBefore);
    } finally {
      app.close();
    }
  });

  it("stops requesting pages and removes the temporary directory when the client cancels", async () => {
    const tempDirsBefore = await roomTypeExportTempDirs();
    const secondPageRequested = deferred<void>();
    const secondPage = deferred<{
      records: Array<{ id: string; label: string }>;
      hasMore: boolean;
    }>();
    const serverRequestAborted = deferred<void>();
    mockStorage.getRoomTypeReferenceExportPage
      .mockResolvedValueOnce({
        records: [{ id: "room-1", label: "101" }],
        hasMore: true,
      })
      .mockImplementationOnce(() => {
        secondPageRequested.resolve(undefined);
        return secondPage.promise;
      });

    const app = await startApp({
      onRequest: (request) => {
        request.once("aborted", () => serverRequestAborted.resolve(undefined));
      },
    });
    let clientRequest: http.ClientRequest | undefined;
    let clientClosed: Promise<void> | undefined;

    try {
      clientRequest = http.request(
        `${app.baseUrl}/api/room-types/integrity/export?roomTypeId=deleted-type&source=rooms`,
        { method: "GET" },
      );
      clientClosed = new Promise<void>((resolve, reject) => {
        clientRequest!.once("close", () => resolve());
        clientRequest!.once("error", (error) => {
          if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
        });
      });
      clientRequest.end();

      await secondPageRequested.promise;
      const tempDirsDuringExport = await roomTypeExportTempDirs();
      const createdTempDirs = tempDirsDuringExport.filter((entry) => !tempDirsBefore.includes(entry));
      expect(createdTempDirs).toHaveLength(1);
      const tempDirRemoval = waitForTempDirRemoval(createdTempDirs[0]);

      clientRequest.destroy();
      await serverRequestAborted.promise;
      secondPage.resolve({
        records: [{ id: "room-2", label: "102" }],
        hasMore: true,
      });
      await clientClosed;
      await tempDirRemoval;

      expect(mockStorage.getRoomTypeReferenceExportPage).toHaveBeenCalledTimes(2);
      expect(await roomTypeExportTempDirs()).toEqual(tempDirsBefore);
    } finally {
      clientRequest?.destroy();
      secondPage.resolve({ records: [], hasMore: false });
      await clientClosed?.catch(() => undefined);
      await app.close();
    }
  });

  it("aborts ZIP transmission and removes the temporary directory after the first bytes", async () => {
    const tempDirsBefore = await roomTypeExportTempDirs();
    const serverRequestAborted = deferred<void>();
    const responseFirstBytes = deferred<Buffer>();
    const responseClosed = deferred<void>();
    const incompressibleLabel = (recordNumber: number) => {
      const bytes = Buffer.alloc(8192);
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = (recordNumber * 31 + index * 17) % 256;
      }
      return `${recordNumber}-${bytes.toString("base64")}`;
    };
    mockStorage.getRoomTypeReferenceExportPage.mockResolvedValue({
      records: Array.from({ length: 250 }, (_, recordNumber) => ({
        id: `room-${recordNumber}`,
        label: incompressibleLabel(recordNumber),
      })),
      hasMore: false,
    });

    const app = await startApp({
      onRequest: (request) => {
        request.once("aborted", () => serverRequestAborted.resolve(undefined));
      },
    });
    let clientRequest: http.ClientRequest | undefined;
    let clientResponse: http.IncomingMessage | undefined;

    try {
      clientRequest = http.request(
        `${app.baseUrl}/api/room-types/integrity/export?roomTypeId=deleted-type&source=rooms`,
        { method: "GET" },
      );
      clientRequest.once("response", (response) => {
        clientResponse = response;
        response.once("data", (chunk) => responseFirstBytes.resolve(Buffer.from(chunk)));
        response.once("close", () => responseClosed.resolve(undefined));
        response.once("error", (error) => {
          if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") {
            responseFirstBytes.reject(error);
          }
        });
      });
      clientRequest.once("error", (error) => {
        if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") {
          responseFirstBytes.reject(error);
        }
      });
      clientRequest.end();

      const firstChunk = await responseFirstBytes.promise;
      expect(firstChunk.length).toBeGreaterThan(0);

      const tempDirsDuringExport = await roomTypeExportTempDirs();
      const createdTempDirs = tempDirsDuringExport.filter((entry) => !tempDirsBefore.includes(entry));
      expect(createdTempDirs).toHaveLength(1);
      const tempDirRemoval = waitForTempDirRemoval(createdTempDirs[0]);

      clientResponse!.destroy();
      await serverRequestAborted.promise;
      await responseClosed.promise;
      await tempDirRemoval;

      expect(archiveAbort).toHaveBeenCalled();
      expect(await roomTypeExportTempDirs()).toEqual(tempDirsBefore);
    } finally {
      clientResponse?.destroy();
      clientRequest?.destroy();
      await app.close();
    }
  });

  it("rejects an invalid evidence source before accessing storage", async () => {
    const app = await startApp();

    try {
      const response = await fetch(
        `${app.baseUrl}/api/room-types/integrity/export?roomTypeId=deleted-type&source=unknown`,
      );
      expect(response.status).toBe(400);
      expect(mockStorage.getRoomTypeReferenceExportPage).not.toHaveBeenCalled();
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

  it("allows an authenticated manager to diagnose and repair orphaned references", async () => {
    mockStorage.getOrphanedRoomTypeReferences.mockResolvedValue([
      { roomTypeId: "deleted-type", references: [{ source: "rooms", count: 2 }] },
    ]);
    mockStorage.reassignRoomTypeReferences.mockResolvedValue({
      fromRoomTypeId: "deleted-type",
      toRoomTypeId: "double",
      updated: [{ source: "rooms", count: 2 }],
    });
    const app = await startApp();

    try {
      const diagnosticResponse = await fetch(`${app.baseUrl}/api/room-types/integrity`);
      expect(diagnosticResponse.status).toBe(200);
      expect(await diagnosticResponse.json()).toEqual({
        orphanedReferences: [
          { roomTypeId: "deleted-type", references: [{ source: "rooms", count: 2 }] },
        ],
      });

      const repairResponse = await fetch(`${app.baseUrl}/api/room-types/reassign-references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRoomTypeId: "deleted-type", toRoomTypeId: "double" }),
      });

      expect(repairResponse.status).toBe(200);
      expect(await repairResponse.json()).toEqual({
        fromRoomTypeId: "deleted-type",
        toRoomTypeId: "double",
        updated: [{ source: "rooms", count: 2 }],
      });
      expect(mockStorage.reassignRoomTypeReferences).toHaveBeenCalledWith("deleted-type", "double");
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