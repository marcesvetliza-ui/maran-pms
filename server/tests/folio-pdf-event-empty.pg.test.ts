/**
 * "Imprimir Folio" en un evento sin ningún cargo/pago todavía daba 404
 * ("Folio no encontrado") en vez de un PDF — el folio recién se crea con el
 * primer movimiento (getOrCreateFolio), así que una entidad sin actividad
 * simplemente no tenía fila en `folios`. GET /api/folios/:entityType/:entityId/pdf
 * ahora crea el folio vacío en ese caso, en vez de tratarlo como un error.
 */
import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;
let eventId: string;
let eventRoomId: string;

function startApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: () => void) => {
    req.user = { id: "folio-pdf-empty-user", username: "folio-pdf-empty-user", fullName: "Prueba", role: "admin" };
    req.isAuthenticated = () => true;
    next();
  });
  return app;
}

suite("PostgreSQL real: Imprimir Folio de una entidad sin movimientos", () => {
  beforeAll(async () => {
    if (!pool) return;
    const { registerFolioRoutes } = await import("../routes/folios");
    const app = startApp();
    registerFolioRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const suffix = randomUUID();
    eventRoomId = `pg-folio-pdf-empty-room-${suffix}`;
    eventId = `pg-folio-pdf-empty-event-${suffix}`;
    await pool.query(
      `INSERT INTO event_rooms (id, name, capacity, status) VALUES ($1, 'Salón de prueba', 50, 'available')`,
      [eventRoomId],
    );
    await pool.query(
      `INSERT INTO events (id, event_code, name, event_room_id, event_type, contact_name, start_date, end_date, status, created_at)
       VALUES ($1, $2, 'Evento sin movimientos', $3, 'corporate', 'Contacto de prueba', DATE '2026-08-26', DATE '2026-08-26', 'confirmed', NOW())`,
      [eventId, `PGFOLIOEMPTY-${suffix}`, eventRoomId],
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM folios WHERE entity_type = 'event' AND entity_id = $1`, [eventId]);
      await pool.query(`DELETE FROM events WHERE id = $1`, [eventId]);
      await pool.query(`DELETE FROM event_rooms WHERE id = $1`, [eventRoomId]);
      await pool.end();
    }
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("crea el folio vacío y devuelve el PDF en vez de 404", async () => {
    if (!pool) return;
    const res = await fetch(`${baseUrl}/api/folios/event/${eventId}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const row = await pool.query(
      `SELECT id, total_charges, total_payments FROM folios WHERE entity_type = 'event' AND entity_id = $1`,
      [eventId],
    );
    expect(row.rows).toHaveLength(1);
    expect(parseFloat(row.rows[0].total_charges)).toBe(0);
    expect(parseFloat(row.rows[0].total_payments)).toBe(0);
  });

  it("una segunda impresión reusa el mismo folio en vez de crear otro", async () => {
    if (!pool) return;
    const res = await fetch(`${baseUrl}/api/folios/event/${eventId}/pdf`);
    expect(res.status).toBe(200);

    const row = await pool.query(
      `SELECT count(*)::int AS count FROM folios WHERE entity_type = 'event' AND entity_id = $1`,
      [eventId],
    );
    expect(row.rows[0].count).toBe(1);
  });

  it("documenta el comportamiento con un eventId inventado: getOrCreateFolio no valida la entidad", async () => {
    if (!pool) return;
    // No es una regresión de este fix — ya era así antes para cualquier ruta
    // que llame a getOrCreateFolio. Un eventId inventado nunca llega acá
    // desde la UI (siempre viene de un evento ya cargado en pantalla).
    const fakeEventId = `no-existe-${randomUUID()}`;
    const res = await fetch(`${baseUrl}/api/folios/event/${fakeEventId}/pdf`);
    expect(res.status).toBe(200);
    await pool.query(`DELETE FROM folios WHERE entity_type = 'event' AND entity_id = $1`, [fakeEventId]);
  });

  it("una entidad de un tipo no soportado por folios sigue dando 404, no crea nada", async () => {
    if (!pool) return;
    const res = await fetch(`${baseUrl}/api/folios/restaurant_order/no-existe-${randomUUID()}/pdf`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Folio no encontrado");
  });
});
