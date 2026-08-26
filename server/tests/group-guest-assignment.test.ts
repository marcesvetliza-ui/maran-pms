/**
 * Regression coverage for assigning guests to group reservations.
 *
 * The rooming-list dialog has two distinct server paths:
 *  - PATCH a pre-created placeholder reservation.
 *  - POST a new reservation for a row that had no reservation yet.
 *
 * Selecting an existing guest must preserve that guest record in both paths.
 */

import express from "express";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as http from "node:http";

let mockDbSelectRows: any[][] = [];
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockDbSelectRows.shift() || []),
        }),
      }),
    }),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
  pool: { query: vi.fn() },
}));

const mockStorage = {
  getGroup: vi.fn(),
  assignRoomToGroup: vi.fn(),
  checkOverbooking: vi.fn(),
};

vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: () => "2026-08-25",
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("pdfkit", () => ({
  default: class PDFDocument {
    pipe() { return this; }
    end() {}
    on() { return this; }
    text() { return this; }
    moveDown() { return this; }
    fontSize() { return this; }
    font() { return this; }
    fillColor() { return this; }
    image() { return this; }
    rect() { return this; }
    stroke() { return this; }
    save() { return this; }
    restore() { return this; }
    addPage() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    fillAndStroke() { return this; }
    translate() { return this; }
    dash() { return this; }
    undash() { return this; }
    lineWidth() { return this; }
    lineCap() { return this; }
  },
}));

const EXISTING_GUEST_ID = "guest-existing-001";
const GROUP_ID = "group-assignment-001";
const PLACEHOLDER_RESERVATION_ID = "reservation-placeholder-001";

async function startApp() {
  const { registerGroupsRoutes } = await import("../routes/groups");
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);

  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve, reject) => {
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve());
        }),
      });
    });
  });
}

describe("group guest assignment", () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbSelectRows = [];
    mockStorage.getGroup.mockResolvedValue({
      id: GROUP_ID,
      totalRooms: 2,
      reservations: [],
    });
    mockStorage.assignRoomToGroup.mockResolvedValue({
      id: "reservation-new-001",
      guestId: EXISTING_GUEST_ID,
      roomId: "room-101",
      status: "confirmed",
    });

    const app = await startApp();
    baseUrl = app.baseUrl;
    close = app.close;
  });

  afterEach(async () => {
    await close();
  });

  it("keeps the selected guest on a placeholder reservation without inserting a guest", async () => {
    const selectedGuest = {
      id: EXISTING_GUEST_ID,
      firstName: "Ana",
      lastName: "Pérez",
      codigo: "GUEST-001",
    };
    const updatedReservation = {
      id: PLACEHOLDER_RESERVATION_ID,
      guestId: EXISTING_GUEST_ID,
      guestName: "Pérez Ana",
      status: "confirmed",
    };

    mockDbSelectRows = [
      [{ groupId: GROUP_ID, reservationId: PLACEHOLDER_RESERVATION_ID }],
      [{
        id: PLACEHOLDER_RESERVATION_ID,
        roomId: "room-101",
        checkInDate: "2026-09-01",
        checkOutDate: "2026-09-03",
      }],
      [selectedGuest],
    ];
    mockDbInsert.mockImplementation(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error("an existing guest must not be inserted")),
      }),
    }));
    mockDbUpdate.mockImplementation(() => ({
      set: (updates: any) => ({
        where: () => ({
          returning: () => {
            expect(updates).toMatchObject({
              guestId: EXISTING_GUEST_ID,
              guestName: "Pérez Ana",
            });
            return Promise.resolve([updatedReservation]);
          },
        }),
      }),
    }));

    const response = await fetch(
      `${baseUrl}/api/groups/${GROUP_ID}/placeholder-reservations/${PLACEHOLDER_RESERVATION_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          guestId: EXISTING_GUEST_ID,
          guestFirstName: "Ana",
          guestLastName: "Pérez",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: PLACEHOLDER_RESERVATION_ID,
      guestId: EXISTING_GUEST_ID,
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("passes the selected guest through when assigning a new rooming-list row", async () => {
    const response = await fetch(`${baseUrl}/api/groups/${GROUP_ID}/assign-room`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomId: "room-101",
        guestId: EXISTING_GUEST_ID,
        guestFirstName: "Ana",
        guestLastName: "Pérez",
        checkInDate: "2026-09-01",
        checkOutDate: "2026-09-03",
        agreedRate: "100",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "reservation-new-001",
      guestId: EXISTING_GUEST_ID,
    });
    expect(mockStorage.assignRoomToGroup).toHaveBeenCalledWith(
      GROUP_ID,
      "room-101",
      "Ana",
      "Pérez",
      expect.objectContaining({ guestId: EXISTING_GUEST_ID }),
    );
  });
});