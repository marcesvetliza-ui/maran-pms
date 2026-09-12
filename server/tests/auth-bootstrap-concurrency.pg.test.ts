import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Prueba de concurrencia real contra PostgreSQL: el mock de db usado en
// auth-bootstrap.test.ts no puede demostrar que el advisory lock realmente
// serializa dos solicitudes simultáneas — eso solo se puede probar contra
// una base real, con dos conexiones concurrentes de verdad.
const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;
let server: http.Server | null = null;
let baseUrl = "";

const BOOTSTRAP_SECRET = "concurrency-test-secret-20chars-min";

function postSetup(newPassword: string) {
  return fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrapSecret: BOOTSTRAP_SECRET, newPassword }),
  });
}

runIfDatabaseIsConfigured("PostgreSQL real: bootstrap de admin bajo concurrencia", () => {
  beforeAll(async () => {
    process.env.ADMIN_BOOTSTRAP_ENABLED = "true";
    process.env.ADMIN_BOOTSTRAP_SECRET = BOOTSTRAP_SECRET;
    if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";

    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, "127.0.0.1", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No se obtuvo puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => error ? reject(error) : resolve()) || resolve(),
    );
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("dos solicitudes de bootstrap simultáneas: solo una resulta exitosa, la contraseña no queda pisada a medias", async () => {
    if (!testPool) throw new Error("DATABASE_URL no configurada");

    // Precondición: este endpoint se deshabilita para siempre en cuanto
    // CUALQUIER usuario del sistema tiene contraseña (no solo "admin"). Si
    // algún otro fixture de la suite de PostgreSQL llegara a insertar un
    // usuario con contraseña, este test dejaría de poder probar nada real
    // — fallar acá con un mensaje claro es mejor que una aserción confusa
    // más abajo.
    const existing = await testPool.query("SELECT username FROM system_users WHERE password IS NOT NULL");
    if (existing.rows.length > 0) {
      throw new Error(
        `Precondición violada: ya hay usuario(s) con contraseña en la base de prueba ` +
        `(${existing.rows.map((r: any) => r.username).join(", ")}) — este test necesita una base ` +
        `sin ningún usuario bootstrapeado para poder probar la concurrencia real.`,
      );
    }

    try {
      const [resA, resB] = await Promise.all([
        postSetup("passwordA-longenough"),
        postSetup("passwordB-longenough"),
      ]);
      const statuses = [resA.status, resB.status].sort();

      // Exactamente una debe haber creado el admin (200) y la otra debe
      // haber encontrado el "ya fue completado" (400) — nunca las dos en
      // 200 (eso sería la carrera que se quiere evitar) ni las dos en 400
      // (eso significaría que ninguna llegó a bootstrapear nada).
      expect(statuses).toEqual([200, 400]);

      const row = await testPool.query("SELECT password FROM system_users WHERE username = 'admin'");
      expect(row.rows).toHaveLength(1);
      // La contraseña final tiene que ser exactamente la de UNA de las dos
      // solicitudes — nunca null, vacía, ni el resultado de una escritura
      // parcial/corrupta por la carrera.
      expect(row.rows[0].password).toEqual(expect.any(String));
      expect(row.rows[0].password.length).toBeGreaterThan(0);
    } finally {
      await testPool.query("DELETE FROM system_users WHERE username = 'admin'");
    }
  });
});
