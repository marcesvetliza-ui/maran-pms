import { db } from "./db";
import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { emailConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { systemSettings } from "@shared/schema";

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

// ─── Send backup by email ─────────────────────────────────────────────────────
export async function sendBackupByEmail(targetEmail: string): Promise<void> {
  const cfgRows = await db.select().from(emailConfig).limit(1);
  const cfg = cfgRows[0];
  if (!cfg || !cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) {
    throw new Error("SMTP no configurado. Configurá el servidor de correo en Configuración > Emails.");
  }

  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort ?? 587,
    secure: cfg.smtpSecure ?? false,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });

  const sqlBuffer = await generateBackupSql();
  const dateStr = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    .replace(/\//g, "-");
  const filename = `maran-backup-${dateStr}.sql`;

  await transport.sendMail({
    from: `"${cfg.fromName || "Maran Suite System"}" <${cfg.fromEmail || cfg.smtpUser}>`,
    to: targetEmail,
    subject: `[Maran] Backup automático de base de datos — ${dateStr}`,
    text: `Adjunto encontrás el backup completo de la base de datos del sistema Maran Suite System generado el ${dateStr} a las 03:00 hs.\n\nEste email es automático, no respondas.`,
    attachments: [
      {
        filename,
        content: sqlBuffer,
        contentType: "application/sql",
      },
    ],
  });
}

// ─── Scheduler — corre a las 03:00 hora Argentina ────────────────────────────
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
      const minute = argTime.getMinutes();

      if (hour === 3 && minute === 0) {
        backupLog("Hora de backup alcanzada (03:00 ARG) — iniciando...");

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

        await sendBackupByEmail(targetEmail);
        backupLog(`Backup enviado exitosamente a ${targetEmail}`);
      }
    } catch (err: any) {
      backupLog(`Error en backup automático: ${err.message}`);
    }
  }, 60_000);

  backupLog("Backup scheduler iniciado (verifica a las 03:00 ARG)");
}
