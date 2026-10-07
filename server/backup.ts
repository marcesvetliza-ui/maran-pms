import { randomUUID } from "node:crypto";
import { backupTableOrder, readBackupSnapshot, renderBackupSql, quoteBackupIdentifier } from "./backupSql";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { sendEmailWithPdfAttachment } from "./email-service";
import { backupLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { systemSettings } from "@shared/schema";

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
  const client=await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot=await readBackupSnapshot(client);
    const result=Buffer.from(renderBackupSql(snapshot),'utf8');
    await client.query("COMMIT");
    return result;
  }catch(error){await client.query("ROLLBACK");throw error;}
  finally{client.release();}
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
  const start=Date.now(),schema='restore_test_'+randomUUID().replace(/-/g,'');
  const details:RestoreTestResult['details']=[];
  const client=await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot=await readBackupSnapshot(client);
    backupTableOrder(snapshot);
    await client.query("COMMIT");
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${quoteBackupIdentifier(schema)}`);
    for(const table of snapshot.tables)await client.query(`CREATE TABLE ${quoteBackupIdentifier(schema)}.${quoteBackupIdentifier(table.name)} (LIKE public.${quoteBackupIdentifier(table.name)} INCLUDING ALL)`);
    // Unlike the old test, retain actual FK constraints pointing only to the isolated schema.
    for(const fk of snapshot.foreignKeys){
      const definition=fk.definition.replace(/REFERENCES\s+(?:(?:"[^"]+"|[A-Za-z_][\w$]*)\.)?(?:"[^"]+"|[A-Za-z_][\w$]*)/,`REFERENCES ${quoteBackupIdentifier(schema)}.${quoteBackupIdentifier(fk.parent)}`);
      await client.query(`ALTER TABLE ${quoteBackupIdentifier(schema)}.${quoteBackupIdentifier(fk.table)} ADD CONSTRAINT ${quoteBackupIdentifier(fk.name)} ${definition}`);
    }
    await client.query(renderBackupSql(snapshot,schema,false,false));
    for(const table of snapshot.tables){
      const rows=(await client.query(`SELECT ${table.columns.map(c=>`${quoteBackupIdentifier(c)}::text AS ${quoteBackupIdentifier(c)}`).join(',')} FROM ${quoteBackupIdentifier(schema)}.${quoteBackupIdentifier(table.name)}`)).rows;
      const normalized=(data:Record<string,string|null>[])=>JSON.stringify(data.map(r=>JSON.stringify(table.columns.map(c=>r[c]))).sort());
      details.push({table:table.name,original_rows:table.rows.length,restored_rows:rows.length,ok:normalized(rows)===normalized(table.rows)});
    }
    await client.query(`DROP SCHEMA ${quoteBackupIdentifier(schema)} CASCADE`);
    await client.query("COMMIT");
    const failed=details.filter(d=>!d.ok).length;
    return {success:failed===0,duration_ms:Date.now()-start,tables_tested:details.length,tables_ok:details.length-failed,tables_failed:failed,details};
  }catch(err:any){
    await client.query("ROLLBACK");
    return {success:false,duration_ms:Date.now()-start,tables_tested:details.length,tables_ok:details.filter(d=>d.ok).length,tables_failed:details.filter(d=>!d.ok).length,details,error:err.message};
  }finally{client.release();}
}

// ─── Send backup by email ─────────────────────────────────────────────────────
// Reutiliza el mismo mecanismo de envío que el resto del sistema (SMTP o
// Resend, lo que esté configurado en Configuración > Emails) en vez de
// requerir SMTP siempre — muchos hosts (ej. Railway fuera del plan Pro)
// bloquean las conexiones SMTP salientes, mientras que Resend (HTTPS) sí
// funciona ahí.
export async function sendBackupByEmail(targetEmail: string, type: string = "manual_email"): Promise<void> {
  const start = Date.now();
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
