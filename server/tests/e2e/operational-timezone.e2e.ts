import { expect, test, type APIRequestContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

const HOTEL_TIME_ZONE = "America/Argentina/Buenos_Aires";
const BROWSER_TIME_ZONE = "America/Los_Angeles";

const ids = {
  user: randomUUID(),
  nightAudit: randomUUID(),
  auditLog: randomUUID(),
  entity: randomUUID(),
  folio: randomUUID(),
  movement: randomUUID(),
};

const suffix = ids.folio.slice(0, 8);
const username = `e2e-tz-${suffix}`;
const password = `E2e-Tz-${suffix}!`;
const folioCode = `TEST-TZ-${suffix.toUpperCase()}`;
const auditDate = "2035-04-05";
const nightAuditMarker = `fixture-night-${suffix}`;
const auditMarker = `Fixture timezone ${suffix}`;

type TimestampOptions = {
  includeSeconds?: boolean;
  twoDigitYear?: boolean;
};

function formatInHotelTimeZone(value: string, options: TimestampOptions = {}) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: HOTEL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: options.twoDigitYear ? "2-digit" : "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(options.includeSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const seconds = options.includeSeconds ? `:${part("second")}` : "";
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}${seconds}`;
}

async function jsonById<T extends { id: string }>(
  request: APIRequestContext,
  url: string,
  id: string,
): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), `${url} debe responder correctamente`).toBeTruthy();
  const rows = (await response.json()) as T[];
  const row = rows.find((candidate) => candidate.id === id);
  expect(row, `No se encontró el fixture ${id} en ${url}`).toBeDefined();
  return row!;
}

test.describe("horas operativas en zona del hotel", () => {
  let pool: pg.Pool;
  let tempDirectory: string | undefined;

  test.beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL es obligatoria para crear fixtures E2E aislados");
    }

    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const passwordHash = await bcrypt.hash(password, 4);

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO system_users
          (id, username, password, email, full_name, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, 'admin', 'true', NOW())`,
        [ids.user, username, passwordHash, `${username}@example.invalid`, "E2E Timezone"],
      );
      await pool.query(
        `INSERT INTO night_audit_logs
          (id, audit_date, executed_at, executed_by, is_manual, status)
         VALUES ($1, $2, $3::timestamptz, $4, true, 'success')`,
        [ids.nightAudit, auditDate, "2035-04-06T02:15:16.000Z", nightAuditMarker],
      );
      await pool.query(
        `INSERT INTO audit_logs
          (id, user_id, user_name, action, module, entity_type, entity_id, description, timestamp)
         VALUES ($1, $2, 'E2E Timezone', 'view', 'fixture_timezone', 'company', $3, $4, $5::timestamptz)`,
        [ids.auditLog, ids.user, ids.entity, auditMarker, "2035-04-06T03:25:26.000Z"],
      );
      await pool.query(
        `INSERT INTO folios
          (id, codigo, entity_type, entity_id, status, total_charges, total_payments, balance,
           opened_at, closed_at, closed_by, notes, created_at)
         VALUES ($1, $2, 'company', $3, 'closed', 25, 0, 25,
                 $4::timestamptz, $5::timestamptz, 'E2E Timezone', $6, NOW())`,
        [
          ids.folio,
          folioCode,
          ids.entity,
          "2035-04-06T04:30:00.000Z",
          "2035-04-06T05:45:00.000Z",
          auditMarker,
        ],
      );
      await pool.query(
        `INSERT INTO folio_movements
          (id, folio_id, type, amount, description, registered_by, created_at)
         VALUES ($1, $2, 'charge', 25, $3, 'E2E Timezone', $4::timestamptz)`,
        [ids.movement, ids.folio, auditMarker, "2035-04-06T05:00:00.000Z"],
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  });

  test.afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query("DELETE FROM folio_movements WHERE id = $1 OR folio_id = $2", [
        ids.movement,
        ids.folio,
      ]);
      await pool.query("DELETE FROM folios WHERE id = $1", [ids.folio]);
      await pool.query("DELETE FROM night_audit_logs WHERE id = $1", [ids.nightAudit]);
      await pool.query("DELETE FROM audit_logs WHERE id = $1 OR user_id = $2", [
        ids.auditLog,
        ids.user,
      ]);
      await pool.query("DELETE FROM failed_login_attempts WHERE username = $1", [username]);
      await pool.query("DELETE FROM sessions WHERE sess::text LIKE $1", [`%${ids.user}%`]);
      await pool.query("DELETE FROM system_users WHERE id = $1", [ids.user]);
    } finally {
      await pool.end();
      if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  test("historial, auditoría, folio cerrado y PDF ignoran la zona local del navegador", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByTestId("input-username").fill(username);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("button-login").click();
    await expect(page).not.toHaveURL(/\/login$/);
    const posSelector = page.getByTestId("button-select-pos-1");
    await expect(posSelector).toBeVisible();
    await posSelector.click();
    await expect(page.getByTestId("button-change-pos")).toBeVisible();

    expect(
      await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    ).toBe(BROWSER_TIME_ZONE);

    const nightAudit = await jsonById<{ id: string; executedAt: string }>(
      page.request,
      "/api/night-audit/history",
      ids.nightAudit,
    );
    const expectedNightAudit = formatInHotelTimeZone(nightAudit.executedAt);

    await page.evaluate(() => sessionStorage.setItem("caja_parte_activo", "reception"));
    await page.goto("/cash-register");
    await page.getByTestId("tab-night-audit").click();
    await expect(page.getByTestId(`row-night-audit-${ids.nightAudit}`)).toContainText(
      expectedNightAudit,
    );

    const auditLog = await jsonById<{ id: string; timestamp: string }>(
      page.request,
      "/api/admin/audit-logs",
      ids.auditLog,
    );
    const expectedAudit = formatInHotelTimeZone(auditLog.timestamp, { includeSeconds: true });

    await page.goto("/administration");
    await page.getByTestId("tab-admin-audit").click();
    await expect(page.getByTestId(`row-audit-${ids.auditLog}`)).toContainText(expectedAudit);

    const folioResponse = await page.request.get(`/api/folios/company/${ids.entity}`);
    expect(folioResponse.ok()).toBeTruthy();
    const folio = (await folioResponse.json()) as {
      openedAt: string;
      closedAt: string;
      movements: Array<{ id: string; createdAt: string }>;
    };
    const movement = folio.movements.find((candidate) => candidate.id === ids.movement);
    expect(movement).toBeDefined();

    const expectedOpened = formatInHotelTimeZone(folio.openedAt, { twoDigitYear: true });
    const expectedClosed = formatInHotelTimeZone(folio.closedAt, { twoDigitYear: true });
    const expectedMovement = formatInHotelTimeZone(movement!.createdAt, { twoDigitYear: true });

    await page.goto("/admin/folios");
    await page.getByTestId("tab-folios").click();
    await page.getByTestId("input-search-folios").fill(folioCode);
    await page.getByTestId(`row-folio-${ids.folio}`).click();
    await expect(page.getByText(`Abierto ${expectedOpened}`, { exact: true })).toBeVisible();
    await expect(page.getByText(expectedMovement, { exact: true })).toBeVisible();
    await expect(page.getByText(`Cerrado ${expectedClosed}`, { exact: true })).toBeVisible();

    const pdfResponse = await page.request.get(`/api/folios/company/${ids.entity}/pdf`);
    expect(pdfResponse.ok()).toBeTruthy();
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
    tempDirectory = mkdtempSync(path.join(tmpdir(), "maran-tz-e2e-"));
    const pdfPath = path.join(tempDirectory, `${folioCode}.pdf`);
    writeFileSync(pdfPath, await pdfResponse.body());
    const pdfText = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
      encoding: "utf8",
    });
    const expectedPdfMovement = formatInHotelTimeZone(movement!.createdAt);
    expect(pdfText).toContain(expectedPdfMovement);
  });
});