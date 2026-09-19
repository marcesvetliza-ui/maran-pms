/**
 * Fase 1 de la integración con Channex: bandeja de solo lectura, aislada de
 * la operación real. Estos tests fijan los invariantes que importan más que
 * el detalle de la llamada HTTP (que está mockeada, ver vi.mock abajo):
 *   - una reserva nunca se puede "Importar" sin mapeo completo de
 *     habitación + tarifa;
 *   - "Importar" jamás crea una fila en `reservations` (esa es la garantía
 *     de que el modo de prueba no toca la operación real — ver decisión de
 *     diseño en shared/schema.ts sobre channexBookings);
 *   - resincronizar la misma reserva no la duplica en la bandeja;
 *   - una reserva cancelada en Channex no se puede importar;
 *   - si el ack a Channex falla, la reserva igual queda guardada (no se
 *     pierde el dato por un problema de un endpoint externo).
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "channex-sync-test", username: "channex-sync-test", role: "admin" };
    next();
  },
  requireRole: (_roles: string[]) => (req: any, _res: any, next: () => void) => {
    req.user = { id: "channex-sync-test", username: "channex-sync-test", role: "admin" };
    next();
  },
}));

vi.mock("../channex/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../channex/client")>();
  return {
    ...actual,
    fetchChannexProperties: vi.fn(),
    fetchChannexRoomTypes: vi.fn(),
    fetchChannexRatePlans: vi.fn(),
    fetchPendingBookingRevisions: vi.fn(),
    fetchChannexBooking: vi.fn(),
    acknowledgeBookingRevision: vi.fn(),
  };
});

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startServer() {
  const { registerChannexRoutes } = await import("../routes/channex");
  const app = express();
  app.use(express.json());
  registerChannexRoutes(app);
  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("No se pudo iniciar el servidor de prueba");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => httpServer!.close((error) => (error ? reject(error) : resolve())));
  httpServer = null;
}

async function request(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function revision(overrides: Record<string, any> = {}) {
  return {
    id: overrides.revisionId ?? `rev-${randomUUID()}`,
    type: "booking_revision",
    attributes: {
      booking_id: overrides.bookingId ?? `bk-${randomUUID()}`,
      status: overrides.status ?? "new",
      ota_name: "BookingCom",
      currency: "GBP",
      amount: "100.00",
      arrival_date: "2026-09-20",
      departure_date: "2026-09-24",
      customer: { name: "Jane Doe", email: "jane@example.com" },
      occupancy: { adults: 2, children: 0, infants: 0 },
      rooms: [
        {
          room_type_id: overrides.channexRoomTypeId ?? "channex-room-type",
          rate_plan_id: overrides.channexRatePlanId ?? "channex-rate-plan",
          amount: "100.00",
          is_cancelled: overrides.status === "cancelled",
        },
      ],
    },
  };
}

runIfDatabaseIsConfigured("Channex — sincronización de reservas (fase 1, solo lectura)", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("bloquea importar sin mapeo, importa cuando está mapeado sin crear ninguna reserva real, no duplica en re-sync y respeta cancelaciones", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const roomTypeId = `room-type-${suffix}`;
    const ratePlanId = `rate-plan-${suffix}`;
    const channexRoomTypeId = `channex-rt-${suffix}`;
    const channexRatePlanId = `channex-rp-${suffix}`;
    const channexPropertyId = `channex-prop-${suffix}`;
    const channexBookingId = `channex-bk-${suffix}`;
    let connectionId: string | null = null;

    const client = await import("../channex/client");

    try {
      await pool.query(
        `INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Doble de prueba')`,
        [roomTypeId, `code-${suffix}`],
      );
      await pool.query(
        `INSERT INTO rate_plans (id, name, room_type_id, base_rate) VALUES ($1, 'Tarifa demo', $2, '100.00')`,
        [ratePlanId, roomTypeId],
      );

      (client.fetchChannexProperties as any).mockResolvedValue([
        { id: channexPropertyId, attributes: { title: "Demo Property" } },
      ]);

      const createConnection = await request("POST", "/api/channex/connections", {
        label: "Channex Demo",
        environment: "demo",
        channexPropertyId,
        apiKey: "test-key",
        baseUrl: "https://staging.channex.io/api/v1",
      });
      expect(createConnection.status).toBe(201);
      expect(createConnection.body.apiKey).toBeUndefined(); // nunca se devuelve la key
      connectionId = createConnection.body.id;

      // --- catálogo: sincronizar y mapear ---
      (client.fetchChannexRoomTypes as any).mockResolvedValue([
        { id: channexRoomTypeId, attributes: { title: "Demo Double" } },
      ]);
      (client.fetchChannexRatePlans as any).mockResolvedValue([
        {
          id: channexRatePlanId,
          attributes: { title: "Demo Rate" },
          relationships: { room_type: { data: { id: channexRoomTypeId } } },
        },
      ]);

      const syncCatalog = await request("POST", `/api/channex/connections/${connectionId}/sync-catalog`);
      expect(syncCatalog.status).toBe(200);
      expect(syncCatalog.body).toEqual({ roomTypes: 1, ratePlans: 1 });

      const roomTypeMappingsBefore = await request("GET", `/api/channex/connections/${connectionId}/room-type-mappings`);
      expect(roomTypeMappingsBefore.body).toHaveLength(1);
      const roomTypeMappingId = roomTypeMappingsBefore.body[0].id;
      const ratePlanMappingsBefore = await request("GET", `/api/channex/connections/${connectionId}/rate-plan-mappings`);
      expect(ratePlanMappingsBefore.body).toHaveLength(1);
      const ratePlanMappingId = ratePlanMappingsBefore.body[0].id;

      // --- sync de reservas ANTES de mapear: debe traer la reserva pero sin poder importarla ---
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([
        revision({ bookingId: channexBookingId, channexRoomTypeId, channexRatePlanId }),
      ]);
      (client.acknowledgeBookingRevision as any).mockResolvedValue(undefined);

      const firstSync = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(firstSync.status).toBe(200);
      expect(firstSync.body).toEqual({ fetched: 1, created: 1, updated: 0, ackFailures: 0 });
      expect(client.acknowledgeBookingRevision).toHaveBeenCalledTimes(1);

      const bookingsAfterFirstSync = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterFirstSync.body).toHaveLength(1);
      const bookingRow = bookingsAfterFirstSync.body[0];
      expect(bookingRow.status).toBe("new");
      expect(bookingRow.isMapped).toBe(false);
      expect(bookingRow.guestName).toBe("Jane Doe");

      const importWithoutMapping = await request("POST", `/api/channex/bookings/${bookingRow.id}/import`);
      expect(importWithoutMapping.status).toBe(400);
      expect(importWithoutMapping.body.error).toMatch(/mapeo/i);

      // --- completar el mapeo y reintentar la importación ---
      const mapRoomType = await request("PATCH", `/api/channex/room-type-mappings/${roomTypeMappingId}`, { roomTypeId });
      expect(mapRoomType.status).toBe(200);
      const mapRatePlan = await request("PATCH", `/api/channex/rate-plan-mappings/${ratePlanMappingId}`, { ratePlanId });
      expect(mapRatePlan.status).toBe(200);

      const secondSync = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(secondSync.status).toBe(200);
      // misma reserva otra vez: no se duplica (created sigue en 0, updated sube)
      expect(secondSync.body).toEqual({ fetched: 1, created: 0, updated: 1, ackFailures: 0 });

      const bookingsAfterSecondSync = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterSecondSync.body).toHaveLength(1); // sigue siendo una sola fila
      expect(bookingsAfterSecondSync.body[0].isMapped).toBe(true);

      const reservationsBeforeImport = await pool.query(`SELECT count(*)::int AS count FROM reservations WHERE room_type_id = $1`, [roomTypeId]);
      expect(reservationsBeforeImport.rows[0].count).toBe(0);

      const importResult = await request("POST", `/api/channex/bookings/${bookingRow.id}/import`);
      expect(importResult.status).toBe(200);
      expect(importResult.body.roomTypeName).toBe("Doble de prueba");
      expect(importResult.body.ratePlanName).toBe("Tarifa demo");
      expect(importResult.body.booking.status).toBe("imported");
      expect(importResult.body.booking.importedBy).toBe("channex-sync-test");

      // Garantía central de la fase 1: "Importar" en modo demo no toca la operación real.
      const reservationsAfterImport = await pool.query(`SELECT count(*)::int AS count FROM reservations WHERE room_type_id = $1`, [roomTypeId]);
      expect(reservationsAfterImport.rows[0].count).toBe(0);

      // --- una nueva revisión de la misma reserva ya importada llega como "modificada" ---
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([
        revision({ bookingId: channexBookingId, channexRoomTypeId, channexRatePlanId, revisionId: `rev-mod-${suffix}` }),
      ]);
      const thirdSync = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(thirdSync.status).toBe(200);
      expect(thirdSync.body).toEqual({ fetched: 1, created: 0, updated: 1, ackFailures: 0 });
      const bookingsAfterThirdSync = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterThirdSync.body).toHaveLength(1);
      expect(bookingsAfterThirdSync.body[0].status).toBe("modified");

      // --- Channex cancela la reserva: no se puede importar ---
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([
        revision({ bookingId: channexBookingId, channexRoomTypeId, channexRatePlanId, status: "cancelled", revisionId: `rev-cancel-${suffix}` }),
      ]);
      const cancelSync = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(cancelSync.status).toBe(200);
      const bookingsAfterCancel = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterCancel.body[0].status).toBe("cancelled");

      const importCancelled = await request("POST", `/api/channex/bookings/${bookingRow.id}/import`);
      expect(importCancelled.status).toBe(400);
      expect(importCancelled.body.error).toMatch(/cancelada/i);
    } finally {
      if (connectionId) {
        await pool.query("DELETE FROM channex_connections WHERE id = $1", [connectionId]); // cascadea bookings y mapeos
      }
      await pool.query("DELETE FROM rate_plans WHERE id = $1", [ratePlanId]);
      await pool.query("DELETE FROM room_types WHERE id = $1", [roomTypeId]);
    }
  });

  it("si Channex no confirma el ack, la reserva se guarda igual y queda marcada con el error", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const channexPropertyId = `channex-prop-${suffix}`;
    const channexBookingId = `channex-bk-${suffix}`;
    let connectionId: string | null = null;

    const client = await import("../channex/client");

    try {
      (client.fetchChannexProperties as any).mockResolvedValue([{ id: channexPropertyId, attributes: { title: "Demo Property" } }]);
      const createConnection = await request("POST", "/api/channex/connections", {
        label: "Channex Demo Ack",
        environment: "demo",
        channexPropertyId,
        apiKey: "test-key",
        baseUrl: "https://staging.channex.io/api/v1",
      });
      connectionId = createConnection.body.id;

      (client.fetchPendingBookingRevisions as any).mockResolvedValue([revision({ bookingId: channexBookingId })]);
      (client.acknowledgeBookingRevision as any).mockRejectedValue(new Error("404 not found"));

      const sync = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(sync.status).toBe(200);
      expect(sync.body).toEqual({ fetched: 1, created: 1, updated: 0, ackFailures: 1 });

      const bookings = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookings.body).toHaveLength(1);
      expect(bookings.body[0].errorMessage).toMatch(/ack/i);
      expect(bookings.body[0].guestName).toBe("Jane Doe"); // el dato no se perdió aunque el ack falló
    } finally {
      if (connectionId) await pool.query("DELETE FROM channex_connections WHERE id = $1", [connectionId]);
    }
  });
});
