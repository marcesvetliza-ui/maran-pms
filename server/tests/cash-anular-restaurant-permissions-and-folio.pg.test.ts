/**
 * Regresión de 2 defectos reportados en un análisis externo sobre anulación
 * de movimientos de Caja y permisos, verificados contra el código real:
 *
 * 1. PATCH /api/cash/movements/:id/anular solo exigía estar autenticado
 *    (requireAuth) para anular un movimiento que NO es "manual" (p.ej. un
 *    cobro de Restaurant). La UI (cash-register.tsx) solo muestra el botón
 *    de anular para movimientos "manual" o para roles con
 *    api:cash:area-admin — el servidor no replicaba esa misma regla, así
 *    que cualquier sesión autenticada (mozo, reception) podía anular por API
 *    un cobro que la UI le ocultaba.
 * 2. Anular el cobro de un pedido de Restaurant marcaba el movimiento de
 *    caja como anulado, pero nunca revertía el folio del pedido
 *    (entity_type='restaurant_order'): total_payments y balance quedaban
 *    exactamente igual que antes de anular.
 */

import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../auth")>();
  return {
    ...original,
    // El rol de la sesión se controla por request vía el header
    // x-test-role, para poder probar mozo/reception/admin sin pasar por un
    // login real — el resto de la autorización (hasPermission,
    // api:cash:area-admin) corre tal cual está en producción.
    requireAuth: (req: any, _res: any, next: () => void) => {
      const role = (req.headers["x-test-role"] as string) || "admin";
      req.user = { id: `test-${role}`, username: `test-${role}`, role };
      req.isAuthenticated = () => true;
      next();
    },
  };
});

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;

async function request(method: string, path: string, body?: unknown, role?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}

async function createOpenOrder(total: string): Promise<string> {
  const orderId = randomUUID();
  await pool!.query(
    `INSERT INTO restaurant_orders (id, order_number, order_type, status, total, opened_at)
     VALUES ($1, $2, 'dine_in', 'open', $3, NOW())`,
    [orderId, `ORD-TEST-${orderId.slice(-8)}`, total],
  );
  return orderId;
}

async function waitForOrderFolioSettled(orderId: string, expectedTotal: number) {
  for (let i = 0; i < 40; i++) {
    const row = await pool!.query(
      "SELECT total_payments FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1",
      [orderId],
    );
    const paid = parseFloat(row.rows[0]?.total_payments ?? "0");
    if (paid >= expectedTotal - 0.01) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Folio del pedido ${orderId} nunca reflejó el pago (fire-and-forget no completó a tiempo)`);
}

async function cleanupOrder(orderId: string) {
  await pool!.query("DELETE FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1", [orderId]);
  await pool!.query(`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1)`, [orderId]);
  await pool!.query("DELETE FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1", [orderId]);
  await pool!.query("DELETE FROM restaurant_orders WHERE id = $1", [orderId]);
}

suite("PostgreSQL real: permisos y folio al anular un cobro de Restaurant en Caja", () => {
  beforeAll(async () => {
    const { registerRoutes } = await import("../routes");
    const { loadRolePermissionsCache } = await import("../permissions");
    await loadRolePermissionsCache();
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve())) || resolve(),
    );
    await pool?.end();
  });

  it("mozo y reception no pueden anular un cobro de Restaurant por API; admin sí, y el folio del pedido se revierte", async () => {
    if (!pool) return;
    const orderId = await createOpenOrder("10000.00");
    try {
      const closed = await request("POST", `/api/restaurant/orders/${orderId}/close`, { paymentMethod: "efectivo" });
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      await waitForOrderFolioSettled(orderId, 10000);

      const movRow = await pool.query(
        "SELECT id FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1 AND anulado = false",
        [orderId],
      );
      expect(movRow.rows).toHaveLength(1);
      const movementId = movRow.rows[0].id;

      const folioBefore = await pool.query(`
        SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1
      `, [orderId]);
      expect(folioBefore.rows[0]).toMatchObject({ total_charges: "10000.00", total_payments: "10000.00", balance: "0.00" });

      // Un mozo no ve el botón en la UI para un cobro que no es "manual" — el
      // servidor debe rechazarlo igual si llega directo por API.
      const asMozo = await request("PATCH", `/api/cash/movements/${movementId}/anular`, { motivoAnulacion: "Prueba mozo" }, "restaurant");
      expect(asMozo.status, JSON.stringify(asMozo.body)).toBe(403);

      const asReception = await request("PATCH", `/api/cash/movements/${movementId}/anular`, { motivoAnulacion: "Prueba reception" }, "reception");
      expect(asReception.status, JSON.stringify(asReception.body)).toBe(403);

      const movAfterRejections = await pool.query("SELECT anulado FROM cash_movements WHERE id = $1", [movementId]);
      expect(movAfterRejections.rows[0].anulado).toBe(false);

      const asAdmin = await request("PATCH", `/api/cash/movements/${movementId}/anular`, { motivoAnulacion: "Prueba admin" }, "admin");
      expect(asAdmin.status, JSON.stringify(asAdmin.body)).toBe(200);

      const movAfter = await pool.query("SELECT anulado, motivo_anulacion FROM cash_movements WHERE id = $1", [movementId]);
      expect(movAfter.rows[0]).toMatchObject({ anulado: true, motivo_anulacion: "Prueba admin" });

      // Antes del fix: el folio seguía en total_payments=10000, balance=0 —
      // caja decía "anulado" pero el folio del pedido no se enteraba.
      const folioAfter = await pool.query(`
        SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1
      `, [orderId]);
      expect(folioAfter.rows[0]).toMatchObject({ total_charges: "10000.00", total_payments: "0.00", balance: "10000.00" });
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("un movimiento manual sigue pudiendo anularse por cualquier sesión autenticada (sin romper el caso existente)", async () => {
    if (!pool) return;
    const movementId = randomUUID();
    try {
      await pool.query(
        `INSERT INTO cash_movements (id, area, source_type, source_label, payment_method, amount, movement_type)
         VALUES ($1, 'restaurant', 'manual', 'Ajuste manual de prueba', 'efectivo', '500.00', 'income')`,
        [movementId],
      );

      const asMozo = await request("PATCH", `/api/cash/movements/${movementId}/anular`, { motivoAnulacion: "Ajuste" }, "restaurant");
      expect(asMozo.status, JSON.stringify(asMozo.body)).toBe(200);

      const movAfter = await pool.query("SELECT anulado FROM cash_movements WHERE id = $1", [movementId]);
      expect(movAfter.rows[0].anulado).toBe(true);
    } finally {
      await pool.query("DELETE FROM cash_movements WHERE id = $1", [movementId]);
    }
  });
});
