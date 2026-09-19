/**
 * Fase 1 de la integración con Channex: bandeja aislada de la operación
 * real (no es "solo lectura" en sentido estricto — confirmar el feed sí es
 * una escritura hacia Channex). Estos tests fijan los invariantes que
 * importan más que el detalle de la llamada HTTP (que está mockeada, ver
 * vi.mock abajo):
 *   - una reserva nunca se puede "Aceptar" (endpoint /import, por motivos
 *     históricos — ver comentario en sync.ts) sin mapeo completo de
 *     habitación + tarifa;
 *   - "Aceptar" jamás crea una fila en `reservations` (esa es la garantía
 *     de que el modo de prueba no toca la operación real — ver decisión de
 *     diseño en shared/schema.ts sobre channexBookings);
 *   - Previsualizar (sync-bookings) guarda igual pero NUNCA confirma nada a
 *     Channex — se puede repetir sin gastar el feed demo;
 *   - Confirmar (confirm-bookings, #542) opera solo sobre lo que un preview
 *     previo ya dejó guardado — una revisión que aparece en Channex después
 *     del último preview no puede confirmarse sin haberla visto primero;
 *   - confirmar con `revisionIds` explícitos rechaza cualquier id que no
 *     esté pendiente en esa conexión, sin confirmar nada;
 *   - resincronizar la misma reserva no la duplica en la bandeja;
 *   - una reserva cancelada en Channex no se puede aceptar;
 *   - si el ack a Channex falla, la reserva igual queda guardada (no se
 *     pierde el dato por un problema de un endpoint externo);
 *   - la API key se guarda cifrada (AES-256-GCM, ver channex/credentials.ts),
 *     nunca en texto plano ni expuesta en ninguna respuesta.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// La suite usa una clave propia y determinística: no debe depender del
// secreto real del entorno ni intentar descifrar credenciales externas.
process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

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

async function createConnection(suffix: string, client: typeof import("../channex/client")) {
  const channexPropertyId = `channex-prop-${suffix}`;
  (client.fetchChannexProperties as any).mockResolvedValue([{ id: channexPropertyId, attributes: { title: "Demo Property" } }]);
  const created = await request("POST", "/api/channex/connections", {
    label: `Channex Demo ${suffix}`,
    environment: "demo",
    channexPropertyId,
    apiKey: "test-key",
    baseUrl: "https://staging.channex.io/api/v1",
  });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

runIfDatabaseIsConfigured("Channex — sincronización de reservas (fase 1)", () => {
  beforeAll(async () => {
    if (pool) await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool?.end();
  });

  it("bloquea aceptar sin mapeo, acepta cuando está mapeado sin crear ninguna reserva real, previsualizar no confirma nada, no duplica en re-sync y respeta cancelaciones", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const roomTypeId = `room-type-${suffix}`;
    const ratePlanId = `rate-plan-${suffix}`;
    const channexRoomTypeId = `channex-rt-${suffix}`;
    const channexRatePlanId = `channex-rp-${suffix}`;
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

      connectionId = await createConnection(suffix, client);

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
      const roomTypeMappingId = roomTypeMappingsBefore.body[0].id;
      const ratePlanMappingsBefore = await request("GET", `/api/channex/connections/${connectionId}/rate-plan-mappings`);
      const ratePlanMappingId = ratePlanMappingsBefore.body[0].id;

      // --- Previsualizar (sync-bookings) ANTES de mapear: trae y guarda la
      // reserva, pero NUNCA confirma nada a Channex ---
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([
        revision({ bookingId: channexBookingId, channexRoomTypeId, channexRatePlanId }),
      ]);
      (client.acknowledgeBookingRevision as any).mockResolvedValue(undefined);

      const firstPreview = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(firstPreview.status).toBe(200);
      expect(firstPreview.body).toEqual({ fetched: 1, created: 1, updated: 0 });
      expect(client.acknowledgeBookingRevision).not.toHaveBeenCalled();

      // Previsualizar de nuevo (todavía sin mapear) no duplica y sigue sin confirmar:
      // el feed demo no se gasta por mirar.
      const secondPreview = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(secondPreview.status).toBe(200);
      expect(secondPreview.body).toEqual({ fetched: 1, created: 0, updated: 1 });
      expect(client.acknowledgeBookingRevision).not.toHaveBeenCalled();

      const bookingsAfterFirstSync = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterFirstSync.body).toHaveLength(1);
      const bookingRow = bookingsAfterFirstSync.body[0];
      expect(bookingRow.status).toBe("new");
      expect(bookingRow.isMapped).toBe(false);
      expect(bookingRow.guestName).toBe("Jane Doe");
      expect(bookingRow.acknowledgedRevisionId).toBeNull();

      const importWithoutMapping = await request("POST", `/api/channex/bookings/${bookingRow.id}/import`);
      expect(importWithoutMapping.status).toBe(400);
      expect(importWithoutMapping.body.error).toMatch(/mapeo/i);

      // --- completar el mapeo ---
      await request("PATCH", `/api/channex/room-type-mappings/${roomTypeMappingId}`, { roomTypeId });
      await request("PATCH", `/api/channex/rate-plan-mappings/${ratePlanMappingId}`, { ratePlanId });

      // Confirmar de verdad (confirm-bookings) — la única llamada que consume el feed.
      const confirm = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`);
      expect(confirm.status).toBe(200);
      expect(confirm.body).toEqual({ pending: 1, selected: 1, confirmed: 1, failed: 0 });
      expect(client.acknowledgeBookingRevision).toHaveBeenCalledTimes(1);

      // Confirmar de nuevo sin nada pendiente no llama a Channex otra vez.
      const confirmAgain = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`);
      expect(confirmAgain.status).toBe(200);
      expect(confirmAgain.body).toEqual({ pending: 0, selected: 0, confirmed: 0, failed: 0 });
      expect(client.acknowledgeBookingRevision).toHaveBeenCalledTimes(1);

      const bookingsAfterConfirm = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterConfirm.body).toHaveLength(1); // sigue siendo una sola fila
      expect(bookingsAfterConfirm.body[0].isMapped).toBe(true);
      expect(bookingsAfterConfirm.body[0].acknowledgedRevisionId).toBe(bookingsAfterConfirm.body[0].channexRevisionId);

      const reservationsBeforeImport = await pool.query(`SELECT count(*)::int AS count FROM reservations WHERE room_type_id = $1`, [roomTypeId]);
      expect(reservationsBeforeImport.rows[0].count).toBe(0);

      // "Aceptar" en la UI, endpoint /import por motivos históricos (ver comentario en sync.ts).
      const importResult = await request("POST", `/api/channex/bookings/${bookingRow.id}/import`);
      expect(importResult.status).toBe(200);
      expect(importResult.body.roomTypeName).toBe("Doble de prueba");
      expect(importResult.body.ratePlanName).toBe("Tarifa demo");
      expect(importResult.body.booking.status).toBe("imported");
      expect(importResult.body.booking.importedBy).toBe("channex-sync-test");

      // Garantía central de la fase 1: "Aceptar" en modo demo no toca la operación real.
      const reservationsAfterImport = await pool.query(`SELECT count(*)::int AS count FROM reservations WHERE room_type_id = $1`, [roomTypeId]);
      expect(reservationsAfterImport.rows[0].count).toBe(0);

      // --- una nueva revisión de la misma reserva ya aceptada llega como "modificada" ---
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([
        revision({ bookingId: channexBookingId, channexRoomTypeId, channexRatePlanId, revisionId: `rev-mod-${suffix}` }),
      ]);
      await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      const confirmModified = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`);
      expect(confirmModified.body).toEqual({ pending: 1, selected: 1, confirmed: 1, failed: 0 });
      expect(client.acknowledgeBookingRevision).toHaveBeenCalledTimes(2);
      const bookingsAfterThirdSync = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterThirdSync.body).toHaveLength(1);
      expect(bookingsAfterThirdSync.body[0].status).toBe("modified");

      // --- Channex cancela la reserva: no se puede aceptar ---
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([
        revision({ bookingId: channexBookingId, channexRoomTypeId, channexRatePlanId, status: "cancelled", revisionId: `rev-cancel-${suffix}` }),
      ]);
      await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
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

  it("confirmar (#542) es selectivo: no confirma una revisión nueva aparecida después del preview, y rechaza ids ajenos a la conexión", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    let connectionId: string | null = null;
    let otherConnectionId: string | null = null;

    const client = await import("../channex/client");

    try {
      connectionId = await createConnection(suffix, client);
      otherConnectionId = await createConnection(`${suffix}-other`, client);

      const bookingIdA = `channex-bk-a-${suffix}`;
      const bookingIdB = `channex-bk-b-${suffix}`;
      const revisionA = revision({ bookingId: bookingIdA, revisionId: `rev-a-${suffix}` });

      // Preview 1: solo aparece la reserva A en el feed de Channex.
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([revisionA]);
      const preview1 = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(preview1.body).toEqual({ fetched: 1, created: 1, updated: 0 });

      // El usuario decide confirmar SOLO lo que vio (A), explícitamente por revisionId.
      (client.acknowledgeBookingRevision as any).mockResolvedValue(undefined);
      const confirmOnlyA = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`, {
        revisionIds: [revisionA.id],
      });
      expect(confirmOnlyA.status).toBe(200);
      expect(confirmOnlyA.body).toEqual({ pending: 1, selected: 1, confirmed: 1, failed: 0 });
      expect(client.acknowledgeBookingRevision).toHaveBeenCalledWith(expect.anything(), revisionA.id);

      // Entre el preview y la confirmación (simulado: recién ahora) aparece una
      // reserva B nueva en Channex. Como nadie la previsualizó todavía, no
      // existe como fila local — confirmar el "lote completo" en este momento
      // no puede tocarla aunque ya esté en el feed remoto de Channex.
      const revisionB = revision({ bookingId: bookingIdB, revisionId: `rev-b-${suffix}` });
      const confirmFullBatchBeforeSeeingB = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`);
      expect(confirmFullBatchBeforeSeeingB.body).toEqual({ pending: 0, selected: 0, confirmed: 0, failed: 0 });

      // Recién cuando se previsualiza de nuevo, B entra a la bandeja.
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([revisionB]);
      const preview2 = await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);
      expect(preview2.body).toEqual({ fetched: 1, created: 1, updated: 0 });

      const bookingsAfterPreview2 = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookingsAfterPreview2.body).toHaveLength(2);
      const rowA = bookingsAfterPreview2.body.find((b: any) => b.channexBookingId === bookingIdA);
      const rowB = bookingsAfterPreview2.body.find((b: any) => b.channexBookingId === bookingIdB);
      expect(rowA.acknowledgedRevisionId).toBe(revisionA.id); // A ya estaba confirmada, no se tocó
      expect(rowB.acknowledgedRevisionId).toBeNull(); // B es nueva, todavía sin confirmar

      // Ahora sí, confirmar el lote completo solo trae B (A ya no figura como pendiente).
      const confirmFullBatch = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`);
      expect(confirmFullBatch.body).toEqual({ pending: 1, selected: 1, confirmed: 1, failed: 0 });
      expect(client.acknowledgeBookingRevision).toHaveBeenCalledWith(expect.anything(), revisionB.id);

      // --- servidor rechaza ids que no correspondan a la conexión ---
      (client.fetchPendingBookingRevisions as any).mockResolvedValue([
        revision({ bookingId: `channex-bk-c-${suffix}`, revisionId: `rev-c-${suffix}` }),
      ]);
      await request("POST", `/api/channex/connections/${otherConnectionId}/sync-bookings`); // pendiente en OTRA conexión

      const ackCallsBeforeRejected = (client.acknowledgeBookingRevision as any).mock.calls.length;
      const rejected = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`, {
        revisionIds: [`rev-c-${suffix}`, "revision-inexistente"],
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.invalidRevisionIds).toEqual(expect.arrayContaining([`rev-c-${suffix}`, "revision-inexistente"]));
      // Rechazada la llamada entera: no confirmó nada, ni siquiera un id parcialmente válido.
      expect((client.acknowledgeBookingRevision as any).mock.calls.length).toBe(ackCallsBeforeRejected);
    } finally {
      if (connectionId) await pool.query("DELETE FROM channex_connections WHERE id = $1", [connectionId]);
      if (otherConnectionId) await pool.query("DELETE FROM channex_connections WHERE id = $1", [otherConnectionId]);
    }
  });

  it("si Channex no confirma el ack, la reserva se guarda igual y queda marcada con el error", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const channexBookingId = `channex-bk-${suffix}`;
    let connectionId: string | null = null;

    const client = await import("../channex/client");

    try {
      connectionId = await createConnection(suffix, client);

      (client.fetchPendingBookingRevisions as any).mockResolvedValue([revision({ bookingId: channexBookingId })]);
      await request("POST", `/api/channex/connections/${connectionId}/sync-bookings`);

      (client.acknowledgeBookingRevision as any).mockRejectedValue(new Error("404 not found"));
      const confirm = await request("POST", `/api/channex/connections/${connectionId}/confirm-bookings`);
      expect(confirm.status).toBe(200);
      expect(confirm.body).toEqual({ pending: 1, selected: 1, confirmed: 0, failed: 1 });

      const bookings = await request("GET", `/api/channex/bookings?connectionId=${connectionId}`);
      expect(bookings.body).toHaveLength(1);
      expect(bookings.body[0].errorMessage).toMatch(/ack/i);
      expect(bookings.body[0].guestName).toBe("Jane Doe"); // el dato no se perdió aunque el ack falló
      expect(bookings.body[0].acknowledgedRevisionId).toBeNull(); // sigue pendiente, se puede reintentar
    } finally {
      if (connectionId) await pool.query("DELETE FROM channex_connections WHERE id = $1", [connectionId]);
    }
  });

  it("guarda la API key cifrada (AES-256-GCM) y nunca la expone en texto plano", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const suffix = randomUUID();
    const channexPropertyId = `channex-prop-${suffix}`;
    let connectionId: string | null = null;

    const client = await import("../channex/client");

    try {
      (client.fetchChannexProperties as any).mockResolvedValue([{ id: channexPropertyId, attributes: { title: "Demo Property" } }]);
      const created = await request("POST", "/api/channex/connections", {
        label: `Channex Demo ${suffix}`,
        environment: "demo",
        channexPropertyId,
        apiKey: "test-key-en-texto-plano",
        baseUrl: "https://staging.channex.io/api/v1",
      });
      expect(created.status).toBe(201);
      expect(created.body.apiKey).toBeUndefined();
      expect(created.body.apiKeyEncrypted).toBeUndefined();
      connectionId = created.body.id;

      const stored = await pool.query(
        `SELECT api_key, api_key_encrypted FROM channex_connections WHERE id = $1`,
        [connectionId],
      );
      expect(stored.rows[0].api_key).toBeNull();
      expect(stored.rows[0].api_key_encrypted).not.toBeNull();
      expect(stored.rows[0].api_key_encrypted).not.toContain("test-key-en-texto-plano");

      const list = await request("GET", "/api/channex/connections");
      const listed = list.body.find((c: any) => c.id === connectionId);
      expect(listed.apiKey).toBeUndefined();
      expect(listed.apiKeyEncrypted).toBeUndefined();
    } finally {
      if (connectionId) await pool.query("DELETE FROM channex_connections WHERE id = $1", [connectionId]);
    }
  });
});
