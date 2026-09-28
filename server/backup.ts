import { db } from "./db";
import { sql } from "drizzle-orm";
import { sendEmailWithPdfAttachment } from "./email-service";
import { backupLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { systemSettings } from "@shared/schema";
import { shouldBlockExternalComm } from "./external-comms-policy";

async function logBackup(entry: {
  type: string; status: string; destination?: string;
  fileSizeBytes?: number; durationMs?: number; errorMessage?: string;
}) {
  try {
    await db.insert(backupLogs).values({
      type: entry.type,
      status: entry.status,
      destination: entry.destination ?? null,
      fileSizeBytes: entry.fileSizeBytes ?? null,
      durationMs: entry.durationMs ?? null,
      errorMessage: entry.errorMessage ?? null,
    });
    // Auto-purge entries older than 90 days
    await db.execute(sql`DELETE FROM backup_logs WHERE created_at < NOW() - INTERVAL '90 days'`);
  } catch (_) {}
}

function backupLog(msg: string) {
  const t = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${t} [backup] ${msg}`);
}

// ─── Generate SQL dump using pg queries ──────────────────────────────────────
export async function generateBackupSql(): Promise<Buffer> {
  const lines: string[] = [];
  const now = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  lines.push(`-- Maran Suite System — Backup automático`);
  lines.push(`-- Fecha: ${now}`);
  lines.push(`-- Generado por el sistema interno\n`);
  lines.push(`SET client_encoding = 'UTF8';`);
  lines.push(`SET standard_conforming_strings = on;\n`);

  // Get all user tables
  const tablesResult = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const tables = (tablesResult.rows as any[]).map((r: any) => r.table_name as string);

  for (const table of tables) {
    lines.push(`-- ─── ${table} ───`);

    // Get rows
    const rowsResult = await db.execute(sql.raw(`SELECT * FROM "${table}"`));
    const rows = rowsResult.rows as Record<string, any>[];

    if (rows.length === 0) {
      lines.push(`-- (sin datos)\n`);
      continue;
    }

    // Get column names from first row
    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(", ");

    lines.push(`DELETE FROM "${table}";`);

    for (const row of rows) {
      const vals = cols.map(col => {
        const v = row[col];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
        if (typeof v === "number") return String(v);
        if (v instanceof Date) return `'${v.toISOString()}'`;
        if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      lines.push(`INSERT INTO "${table}" (${colList}) VALUES (${vals.join(", ")});`);
    }
    lines.push("");
  }

  lines.push(`-- Fin del backup`);
  return Buffer.from(lines.join("\n"), "utf-8");
}

// ─── Restore test ─────────────────────────────────────────────────────────────
export interface RestoreTestResult {
  success: boolean;
  duration_ms: number;
  tables_tested: number;
  tables_ok: number;
  tables_failed: number;
  details: Array<{ table: string; original_rows: number; restored_rows: number; ok: boolean }>;
  error?: string;
}

export async function runRestoreTest(): Promise<RestoreTestResult> {
  const start = Date.now();
  const schema = `restore_test_${Date.now()}`;
  const details: RestoreTestResult["details"] = [];

  try {
    // 1. List all public tables
    const tablesResult = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = (tablesResult.rows as any[]).map((r: any) => r.table_name as string);

    // 2. Count rows in each original table
    const originalCounts: Record<string, number> = {};
    for (const table of tables) {
      const r = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM "${table}"`));
      originalCounts[table] = parseInt((r.rows[0] as any).cnt, 10);
    }

    // 3. Generate backup SQL (same SQL that would be emailed/downloaded)
    const backupBuf = await generateBackupSql();
    const backupSql = backupBuf.toString("utf-8");

    // 4. Create isolated test schema
    await db.execute(sql.raw(`CREATE SCHEMA "${schema}"`));

    // 5. Replicate table structures (without FK constraints so INSERTs work in any order)
    for (const table of tables) {
      await db.execute(sql.raw(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}")`));
    }

    // 6. Replay only INSERT statements redirected to the test schema
    const lines = backupSql.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("INSERT INTO")) continue;
      const redirected = trimmed.replace(/^INSERT INTO "([^"]+)"/, `INSERT INTO "${schema}"."$1"`);
      await db.execute(sql.raw(redirected));
    }

    // 7. Compare counts
    let tablesOk = 0;
    let tablesFailed = 0;
    for (const table of tables) {
      const r = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM "${schema}"."${table}"`));
      const restoredCount = parseInt((r.rows[0] as any).cnt, 10);
      const originalCount = originalCounts[table];
      const ok = restoredCount === originalCount;
      if (ok) tablesOk++; else tablesFailed++;
      details.push({ table, original_rows: originalCount, restored_rows: restoredCount, ok });
    }

    return {
      success: tablesFailed === 0,
      duration_ms: Date.now() - start,
      tables_tested: tables.length,
      tables_ok: tablesOk,
      tables_failed: tablesFailed,
      details,
    };
  } catch (err: any) {
    return {
      success: false,
      duration_ms: Date.now() - start,
      tables_tested: 0,
      tables_ok: 0,
      tables_failed: 0,
      details,
      error: err.message,
    };
  } finally {
    try { await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)); } catch (_) {}
  }
}

// ─── Send backup by email ─────────────────────────────────────────────────────
// Reutiliza el mismo mecanismo de envío que el resto del sistema (SMTP o
// Resend, lo que esté configurado en Configuración > Emails) en vez de
// requerir SMTP siempre — muchos hosts (ej. Railway fuera del plan Pro)
// bloquean las conexiones SMTP salientes, mientras que Resend (HTTPS) sí
// funciona ahí.
export async function sendBackupByEmail(targetEmail: string, type: string = "manual_email"): Promise<void> {
  const start = Date.now();

  if (shouldBlockExternalComm({ integration: "email-backup", action: type })) {
    await logBackup({
      type,
      status: "error",
      destination: targetEmail,
      durationMs: Date.now() - start,
      errorMessage: "Bloqueado por ambiente (APP_ENV≠production)",
    });
    throw new Error("El envío de backups por email está bloqueado en este ambiente (piloto/desarrollo/test).");
  }


  const sqlBuffer = await generateBackupSql();
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    .replace(/\//g, "-");
  const timeStr = now.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
  const filename = `maran-backup-${dateStr}-${timeStr.replace(":", "")}hs.sql`;

  const result = await sendEmailWithPdfAttachment({
    to: targetEmail,
    subject: `[Maran] Backup automático de base de datos — ${dateStr} ${timeStr} hs`,
    body: `Adjunto encontrás el backup completo de la base de datos del sistema Maran Suite System generado el ${dateStr} a las ${timeStr} hs.\n\nEste email es automático, no respondas.`,
    attachmentFilename: filename,
    attachmentBuffer: sqlBuffer,
    attachmentContentType: "application/sql",
  });

  if (!result.ok) {
    await logBackup({ type, status: "error", destination: targetEmail, durationMs: Date.now() - start, errorMessage: result.error });
    throw new Error(result.error || "Error enviando el backup por email");
  }
  await logBackup({ type, status: "success", destination: targetEmail, fileSizeBytes: sqlBuffer.length, durationMs: Date.now() - start });
}

// ─── Log manual download ───────────────────────────────────────────────────────
export async function logManualDownload(fileSizeBytes: number): Promise<void> {
  await logBackup({ type: "manual_download", status: "success", fileSizeBytes });
}

// ─── Scheduler — corre a las 03:00 y 15:00 hora Argentina (cada 12hs) ────────
export const BACKUP_HOURS = [3, 15];

export function isBackupTime(date: Date): boolean {
  const argTime = new Date(
    date.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }),
  );
  return BACKUP_HOURS.includes(argTime.getHours()) && argTime.getMinutes() === 0;
}

let backupSchedulerStarted = false;

export function setupBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;

  setInterval(async () => {
    try {
      const now = new Date();
      const argTime = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }),
      );
      const hour = argTime.getHours();

      if (isBackupTime(now)) {
        backupLog(`Hora de backup alcanzada (${String(hour).padStart(2, "0")}:00 ARG) — iniciando...`);

        // Read config from system_settings
        const enabledRow = await db.select().from(systemSettings)
          .where(eq(systemSettings.key, "backup_auto_enabled")).limit(1);
        const emailRow = await db.select().from(systemSettings)
          .where(eq(systemSettings.key, "backup_email")).limit(1);

        const enabled = enabledRow[0]?.value === "true";
        const targetEmail = emailRow[0]?.value;

        if (!enabled) {
          backupLog("Backup automático deshabilitado, saltando.");
          return;
        }
        if (!targetEmail) {
          backupLog("No hay email de destino configurado para el backup.");
          return;
        }

        await sendBackupByEmail(targetEmail, "scheduled");
        backupLog(`Backup enviado exitosamente a ${targetEmail}`);
      }
    } catch (err: any) {
      backupLog(`Error en backup automático: ${err.message}`);
      await logBackup({ type: "scheduled", status: "error", errorMessage: err.message });
    }
  }, 60_000);

  backupLog("Backup scheduler iniciado (verifica a las 03:00 y 15:00 ARG)");
}
