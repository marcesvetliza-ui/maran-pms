/**
 * 2FA (TOTP) self-service: setup → confirm → verify-login, con backup codes
 * y desactivación. Verifica también que requireAuth bloquea una sesión con
 * pending2FA=true (el segundo factor todavía no se completó).
 */
import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generate as generateOtp } from "otplib";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

const originalKey = process.env.TOTP_ENCRYPTION_KEY;
process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 21).toString("base64");

let userId: string;
let username: string;
let plainPassword: string;

function startApp() {
  const app = express();
  app.use(express.json());
  const session: any = {};
  app.use((req: any, _res: any, next: () => void) => {
    req.user = { id: userId, username, fullName: "Prueba 2FA", role: "admin" };
    req.isAuthenticated = () => true;
    req.session = session;
    next();
  });
  return { app, session };
}

async function withApp(run: (baseUrl: string, session: any) => Promise<void>) {
  const { registerTwoFactorRoutes } = await import("../routes/twoFactor");
  const { app, session } = startApp();
  registerTwoFactorRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
  try {
    await run(`http://127.0.0.1:${address.port}`, session);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

suite("PostgreSQL real: rutas de verificación en dos pasos (2FA)", () => {
  beforeAll(async () => {
    if (!pool) return;
    const { hashPassword } = await import("../auth");
    const suffix = randomUUID().slice(0, 8);
    userId = `2fa-user-${suffix}`;
    username = `2fa.test.${suffix}`;
    plainPassword = "ClaveDePrueba123!";
    const passwordHash = await hashPassword(plainPassword);
    await pool.query(
      `INSERT INTO system_users (id, username, password, email, full_name, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, 'admin', 'true', now())`,
      [userId, username, passwordHash, `${username}@example.com`, "Prueba 2FA"],
    );
  });

  beforeEach(async () => {
    if (!pool) return;
    // Cada test parte de 2FA desactivada — evita que el estado de un test
    // (que la activa) contamine los que corren después sobre el mismo usuario.
    await pool.query(
      `UPDATE system_users SET totp_enabled = 'false', totp_secret_encrypted = NULL, totp_backup_codes = NULL WHERE id = $1`,
      [userId],
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM system_users WHERE id = $1`, [userId]);
      await pool.end();
    }
    if (originalKey === undefined) {
      delete process.env.TOTP_ENCRYPTION_KEY;
    } else {
      process.env.TOTP_ENCRYPTION_KEY = originalKey;
    }
  });

  it("status arranca desactivado", async () => {
    if (!pool) return;
    await withApp(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/2fa/status`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ enabled: false });
    });
  });

  it("setup + confirm activan 2FA y devuelven 10 códigos de respaldo", async () => {
    if (!pool) return;
    await withApp(async (baseUrl, session) => {
      const setupRes = await fetch(`${baseUrl}/api/auth/2fa/setup`, { method: "POST" });
      expect(setupRes.status).toBe(200);
      const setupBody = await setupRes.json();
      expect(setupBody.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(session.pendingTotpSecret).toBeTruthy();

      const token = await generateOtp({ secret: setupBody.secret });
      const confirmRes = await fetch(`${baseUrl}/api/auth/2fa/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const confirmBody = await confirmRes.json();
      expect(confirmRes.status, JSON.stringify(confirmBody)).toBe(200);
      expect(confirmBody.backupCodes).toHaveLength(10);

      const statusRes = await fetch(`${baseUrl}/api/auth/2fa/status`);
      expect(await statusRes.json()).toEqual({ enabled: true });

      const [row] = (await pool!.query(`SELECT totp_enabled FROM system_users WHERE id = $1`, [userId])).rows;
      expect(row.totp_enabled).toBe("true");
    });
  });

  it("confirm rechaza un código incorrecto y no activa nada", async () => {
    if (!pool) return;
    await withApp(async (baseUrl) => {
      await fetch(`${baseUrl}/api/auth/2fa/setup`, { method: "POST" });
      const confirmRes = await fetch(`${baseUrl}/api/auth/2fa/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "000000" }),
      });
      expect(confirmRes.status).toBe(400);

      const statusRes = await fetch(`${baseUrl}/api/auth/2fa/status`);
      expect(await statusRes.json()).toEqual({ enabled: false });
    });
  });

  it("verify-login acepta el TOTP correcto y bloquea uno incorrecto", async () => {
    if (!pool) return;
    await withApp(async (baseUrl, session) => {
      const setupRes = await fetch(`${baseUrl}/api/auth/2fa/setup`, { method: "POST" });
      const { secret } = await setupRes.json();
      const token = await generateOtp({ secret });
      await fetch(`${baseUrl}/api/auth/2fa/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      session.pending2FA = true;

      const badRes = await fetch(`${baseUrl}/api/auth/2fa/verify-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "111111" }),
      });
      expect(badRes.status).toBe(401);
      expect(session.pending2FA).toBe(true);

      const freshToken = await generateOtp({ secret });
      const okRes = await fetch(`${baseUrl}/api/auth/2fa/verify-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: freshToken }),
      });
      const okBody = await okRes.json();
      expect(okRes.status, JSON.stringify(okBody)).toBe(200);
      expect(okBody.username).toBe(username);
      expect(session.pending2FA).toBe(false);
    });
  });

  it("una sesión con pending2FA=true no puede usar el resto de las rutas de 2FA (requireAuth)", async () => {
    if (!pool) return;
    await withApp(async (baseUrl, session) => {
      session.pending2FA = true;
      const res = await fetch(`${baseUrl}/api/auth/2fa/status`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.pending2FA).toBe(true);
    });
  });

  it("backup code: sirve una sola vez para verify-login y después queda inválido", async () => {
    if (!pool) return;
    await withApp(async (baseUrl, session) => {
      const setupRes = await fetch(`${baseUrl}/api/auth/2fa/setup`, { method: "POST" });
      const { secret } = await setupRes.json();
      const token = await generateOtp({ secret });
      const confirmRes = await fetch(`${baseUrl}/api/auth/2fa/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const { backupCodes } = await confirmRes.json();
      const [code] = backupCodes;

      session.pending2FA = true;
      const firstUse = await fetch(`${baseUrl}/api/auth/2fa/verify-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      expect(firstUse.status).toBe(200);

      session.pending2FA = true;
      const secondUse = await fetch(`${baseUrl}/api/auth/2fa/verify-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      expect(secondUse.status).toBe(401);
    });
  });

  it("disable exige la contraseña correcta y limpia los campos en la base", async () => {
    if (!pool) return;
    await withApp(async (baseUrl) => {
      const setupRes = await fetch(`${baseUrl}/api/auth/2fa/setup`, { method: "POST" });
      const { secret } = await setupRes.json();
      const token = await generateOtp({ secret });
      await fetch(`${baseUrl}/api/auth/2fa/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const wrongPassRes = await fetch(`${baseUrl}/api/auth/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "incorrecta" }),
      });
      expect(wrongPassRes.status).toBe(401);

      const okRes = await fetch(`${baseUrl}/api/auth/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: plainPassword }),
      });
      expect(okRes.status).toBe(200);

      const [row] = (await pool!.query(
        `SELECT totp_enabled, totp_secret_encrypted, totp_backup_codes FROM system_users WHERE id = $1`,
        [userId],
      )).rows;
      expect(row.totp_enabled).toBe("false");
      expect(row.totp_secret_encrypted).toBeNull();
      expect(row.totp_backup_codes).toBeNull();
    });
  });
});
