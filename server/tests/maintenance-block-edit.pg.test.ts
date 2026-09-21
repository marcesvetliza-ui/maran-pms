import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * "Cuando se crea una orden de mantenimiento con bloqueo de hab, no te deja
 * modificar la fecha una vez creada" — una vez que un maintenance_block
 * existía, la única acción disponible era "Eliminar bloqueo"; no había forma
 * de corregir las fechas sin borrar y volver a crear todo. Se agrega
 * PATCH /api/maintenance/blocks/:id para editar blockFrom/blockTo/notes de
 * un bloqueo existente, reutilizado tanto desde Mantenimiento como desde
 * Housekeeping (misma tabla, mismos endpoints).
 */

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "mantenimiento-pg-tester" };
    next();
  },
}));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

type Fixture = {
  roomTypeId: string;
  roomId: string;
  blockId: string;
};

const testPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;

async function startApp() {
  const { registerMaintenanceRoutes } = await import("../routes/maintenance");
  const app = express();
  app.use(express.json());
  registerMaintenanceRoutes(app);

  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto del servidor de prueba");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopApp() {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer!.close((error) => (error ? reject(error) : resolve()));
  });
  httpServer = null;
}

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const suffix = randomUUID();
  const fixture: Fixture = {
    roomTypeId: `pg-blockedit-rt-${suffix}`,
    roomId: `pg-blockedit-room-${suffix}`,
    blockId: "",
  };

  await testPool.query(
    `INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Standard de prueba')`,
    [fixture.roomTypeId, `RT-${suffix}`],
  );
  await testPool.query(
    `INSERT INTO rooms (id, room_number, room_type_id, floor, status) VALUES ($1, $2, $3, 2, 'available')`,
    [fixture.roomId, `202-${suffix.slice(0, 6)}`, fixture.roomTypeId],
  );

  const blockResult = await testPool.query(
    `INSERT INTO maintenance_blocks (id, room_id, block_from, block_to, blocked_by, notes)
     VALUES ($1, $2, '2026-09-21', '2026-09-24', 'mantenimiento-pg-tester', 'Limpieza por mascota')
     RETURNING id`,
    [randomUUID(), fixture.roomId],
  );
  fixture.blockId = blockResult.rows[0].id;

  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;
  await testPool.query(`DELETE FROM maintenance_blocks WHERE room_id = $1`, [fixture.roomId]);
  await testPool.query(`DELETE FROM rooms WHERE id = $1`, [fixture.roomId]);
  await testPool.query(`DELETE FROM room_types WHERE id = $1`, [fixture.roomTypeId]);
}

async function patchBlock(blockId: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/maintenance/blocks/${blockId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

async function readBlock(blockId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT block_from, block_to, notes FROM maintenance_blocks WHERE id = $1`,
    [blockId],
  );
  return result.rows[0] ?? null;
}

runIfDatabaseIsConfigured("PostgreSQL real: PATCH /api/maintenance/blocks/:id edita un bloqueo existente", () => {
  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("actualiza blockFrom/blockTo de un bloqueo existente sin necesidad de borrarlo", async () => {
    const fixture = await createFixture();
    try {
      const result = await patchBlock(fixture.blockId, { blockFrom: "2026-09-21", blockTo: "2026-09-26" });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ blockFrom: "2026-09-21", blockTo: "2026-09-26" });

      const row = await readBlock(fixture.blockId);
      expect(row.block_to).toBe("2026-09-26");
      // Las notas originales no se tocan si no se envían en el PATCH.
      expect(row.notes).toBe("Limpieza por mascota");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("rechaza blockTo anterior a blockFrom con 400", async () => {
    const fixture = await createFixture();
    try {
      const result = await patchBlock(fixture.blockId, { blockFrom: "2026-09-24", blockTo: "2026-09-21" });
      expect(result.status).toBe(400);

      const row = await readBlock(fixture.blockId);
      // No se modificó nada.
      expect(row.block_to).toBe("2026-09-24");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("devuelve 404 para un bloqueo inexistente", async () => {
    const result = await patchBlock(randomUUID(), { blockFrom: "2026-09-21", blockTo: "2026-09-26" });
    expect(result.status).toBe(404);
  }, 15_000);
});
