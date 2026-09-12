import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

// Prueba de concurrencia real contra PostgreSQL: el mock de db usado en
// auth-bootstrap.test.ts no puede demostrar que el advisory lock realmente
// serializa dos solicitudes simultáneas — eso solo se puede probar contra
// una base real, con dos conexiones concurrentes de verdad.
//
// A diferencia de los demás *.pg.test.ts de esta suite (que crean/borran
// fixtures con IDs sufijados por randomUUID(), sin riesgo de colisión),
// esta prueba ejercita el endpoint real, que opera siempre sobre el
// username literal "admin" — no es parametrizable. Por eso lleva guardas
// extra, deliberadamente más estrictas que el resto de la suite:
//
// 1. Requiere ALLOW_DESTRUCTIVE_PG_TESTS=true configurado explícitamente
//    (ver .github/workflows/test.yml — solo se setea ahí, contra el
//    Postgres descartable que levanta el propio job de CI; nunca en un
//    entorno real). Sin esa variable, el archivo entero se saltea.
// 2. NUNCA pisa NODE_ENV — si por error corriera con NODE_ENV=production,
//    falla fuerte en vez de forzar el valor para poder continuar.
// 3. Antes de tocar nada, confirma que el username "admin" NO existe
//    todavía en la base — si ya existe (con o sin contraseña), aborta sin
//    tocarlo. Solo borra al final la fila si esa comprobación previa
//    demostró que no preexistía, así que solo puede ser la fila que creó
//    esta misma corrida.
const explicitlyAllowed = process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
const runIfDatabaseIsConfigured = process.env.DATABASE_URL && explicitlyAllowed ? describe : describe.skip;
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
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "auth-bootstrap-concurrency.pg.test.ts se niega a correr con NODE_ENV=production — " +
        "este test ejercita un endpoint destructivo sobre el username 'admin' real.",
      );
    }
    process.env.ADMIN_BOOTSTRAP_ENABLED = "true";
    process.env.ADMIN_BOOTSTRAP_SECRET = BOOTSTRAP_SECRET;
    // isBootstrapEnabled() consulta isProductionDataEnv()/isPilotEnv()
    // (APP_ENV) además de NODE_ENV — hace falta inicializarlo, ya que este
    // test importa routes.ts directamente sin pasar por server/index.ts
    // (que es quien normalmente llama a initAppEnv() al arrancar).
    initAppEnv({ APP_ENV: "development", NODE_ENV: process.env.NODE_ENV ?? "test" });

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
    resetAppEnvForTests();
  });

  it("dos solicitudes de bootstrap simultáneas: solo una resulta exitosa, la contraseña no queda pisada a medias", async () => {
    if (!testPool) throw new Error("DATABASE_URL no configurada");

    // Precondición doble, deliberadamente más estricta que un simple
    // "ningún usuario tiene contraseña": confirma que el propio username
    // "admin" no existe todavía bajo ninguna forma. Si existiera (por
    // ejemplo un admin real preexistente sin contraseña, o cualquier otro
    // estado inesperado), este test no lo toca — aborta con un mensaje
    // claro en vez de mutarlo o, peor, borrarlo al final.
    const existingAdmin = await testPool.query("SELECT 1 FROM system_users WHERE username = 'admin'");
    if (existingAdmin.rows.length > 0) {
      throw new Error(
        "Precondición violada: ya existe un usuario 'admin' en esta base — este test no continúa " +
        "para no arriesgarse a modificarlo o borrarlo. Verificá que DATABASE_URL apunte a una base " +
        "de prueba descartable, no a una base real.",
      );
    }
    const anyPasswordSet = await testPool.query("SELECT username FROM system_users WHERE password IS NOT NULL");
    if (anyPasswordSet.rows.length > 0) {
      throw new Error(
        `Precondición violada: ya hay usuario(s) con contraseña en la base de prueba ` +
        `(${anyPasswordSet.rows.map((r: any) => r.username).join(", ")}) — el endpoint de bootstrap ` +
        `ya se consideraría "de un solo uso" consumido, así que este test no podría probar nada real.`,
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
      // 200 (eso sería la carrera que se quiere evitar) ni las dos en 400.
      expect(statuses).toEqual([200, 400]);

      const row = await testPool.query("SELECT password FROM system_users WHERE username = 'admin'");
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].password).toEqual(expect.any(String));
      expect(row.rows[0].password.length).toBeGreaterThan(0);
    } finally {
      // Seguro: la precondición de arriba ya demostró que "admin" no
      // existía antes de esta corrida, así que la única fila que puede
      // haber con ese username acá es la que creó esta misma prueba.
      await testPool.query("DELETE FROM system_users WHERE username = 'admin'");
    }
  });
});
