/**
 * El backup por email quedaba forzado a SMTP sin importar qué proveedor de
 * envío tuviera configurado el hotel — y en hosts que bloquean SMTP
 * saliente (ej. Railway fuera del plan Pro), eso lo dejaba permanentemente
 * roto aunque el resto del sistema mandara mails sin problema por Resend.
 * Ahora sendBackupByEmail reusa el mismo despacho por proveedor que ya usa
 * el resto del sistema (sendEmailWithPdfAttachment).
 */
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

async function setEmailConfig(overrides: Record<string, unknown>) {
  const cols = Object.keys(overrides);
  const values = Object.values(overrides);
  const setClause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  await pool!.query(`UPDATE email_config SET ${setClause} WHERE id = 1`, values);
}

suite("PostgreSQL real: backup por email respeta el proveedor configurado (Resend/SMTP)", () => {
  beforeAll(async () => {
    if (!pool) return;
    await pool.query(`INSERT INTO email_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    if (pool) await pool.query(`DELETE FROM backup_logs`);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("con Resend configurado, manda el backup por la API de Resend (sin tocar SMTP)", async () => {
    if (!pool) return;
    await setEmailConfig({
      global_enabled: true,
      provider: "resend",
      api_key: "re_test_key",
      from_email: "reservas@maransuites.com",
      from_name: "Maran Suites",
    });

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.resend.com/emails");
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { sendBackupByEmail } = await import("../backup");
    await expect(sendBackupByEmail("gerencia@maran.com.ar", "manual_email")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const logRow = await pool.query(`SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 1`);
    expect(logRow.rows[0].status).toBe("success");
    expect(logRow.rows[0].destination).toBe("gerencia@maran.com.ar");
  });

  it("con SMTP elegido pero sin usuario/contraseña, falla con un mensaje claro (no ENETUNREACH genérico)", async () => {
    if (!pool) return;
    await setEmailConfig({
      global_enabled: true,
      provider: "smtp",
      smtp_user: null,
      smtp_pass: null,
    });

    const { sendBackupByEmail } = await import("../backup");
    await expect(sendBackupByEmail("gerencia@maran.com.ar", "manual_email")).rejects.toThrow(
      /usuario o contraseña/i,
    );

    const logRow = await pool.query(`SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 1`);
    expect(logRow.rows[0].status).toBe("error");
  });
});
