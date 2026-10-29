import type { Pool } from 'pg';
import { ARI_CALL_INTERVAL_MS, STAGING_URL, buildAriValues, retryDelay, addDays, daysBetween, compressValues, AriConfigurationError, type AriEvent, type AriValue } from './ari';
import { decryptChannexApiKey } from './credentials';

export class AriTransportError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null = null) { super(`Channex HTTP ${status}`); }
}
export type AriTransport = (connection: any, kind: string, values: AriValue[]) => Promise<string[]>;
export const sendAri: AriTransport = async (connection, kind, values) => {
  if (!['availability', 'restrictions'].includes(kind)) throw new AriConfigurationError('Operación ARI inválida');
  // Certification is staged only. A future production release must introduce an explicit production gate.
  if (connection.environment !== 'demo' || connection.base_url.replace(/\/$/, '') !== STAGING_URL) throw new AriConfigurationError('Los envíos ARI de esta etapa solo admiten Channex staging');
  let key: string; try { key = decryptChannexApiKey(connection.api_key_encrypted); } catch { throw new AriConfigurationError('La credencial de Channex debe configurarse nuevamente'); }
  const response = await fetch(`${STAGING_URL}/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-api-key': key }, body: JSON.stringify({ values }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new AriTransportError(response.status, response.headers.get('retry-after'));
  let body: any; try { body = await response.json(); } catch { throw new AriTransportError(502); }
  const tasks = Array.isArray(body?.data) ? body.data : [];
  if (!tasks.length || tasks.some((t: any) => t.type !== 'task' || typeof t.id !== 'string' || !/^[a-f\d-]{36}$/i.test(t.id))) throw new AriTransportError(502);
  return tasks.map((t: any) => t.id);
};

/** Drains committed outbox entries. The timer never polls reservations or detects DB changes. */
export async function dispatchChannexAri(pool: Pool, transport: AriTransport = sendAri, enabled = process.env.CHANNEX_ARI_STAGING_ENABLED === 'true') {
  if (!enabled) return { state: 'disabled' };
  const c = await pool.connect(); let locked = false;
  try {
    locked = (await c.query('SELECT pg_try_advisory_lock(1296126535,903) AS locked')).rows[0].locked;
    if (!locked) return { state: 'busy' };
    const clock = (await c.query(`SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS today, next_call_at>now() AS cooling FROM channex_ari_dispatch WHERE id=1`)).rows[0];
    if (clock.cooling) return { state: 'cooldown' };
    // Advance only the newly opened edge of the 500-day window, never a timer-based full sync.
    await c.query(`WITH advancing AS MATERIALIZED (
    SELECT s.connection_id,s.last_horizon_date FROM channex_ari_settings s JOIN channex_connections c ON c.id=s.connection_id
    WHERE s.enabled AND c.is_active AND c.environment='demo' AND s.last_horizon_date<$1::date FOR UPDATE OF s
   ), updated AS (
    UPDATE channex_ari_settings s SET last_horizon_date=$1 FROM advancing a WHERE s.connection_id=a.connection_id RETURNING s.connection_id
   ) INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,reason)
   SELECT a.connection_id,kind,GREATEST(a.last_horizon_date+500,$1::date),$2::date,'horizon_advance'
   FROM advancing a JOIN updated u USING(connection_id) CROSS JOIN (VALUES('availability'),('restrictions')) k(kind)`, [clock.today, addDays(clock.today, 499)]);
    const job = (await c.query(`SELECT o.connection_id,o.kind FROM channex_ari_outbox o
   JOIN channex_ari_settings s ON s.connection_id=o.connection_id JOIN channex_connections c ON c.id=o.connection_id
   WHERE o.status='pending' AND s.enabled AND c.is_active AND o.run_after<=now() AND c.environment='demo'
   ORDER BY o.run_after,o.id LIMIT 1`)).rows[0];
    if (!job) return { state: 'idle' };
    const connection = (await c.query(`SELECT c.id,c.environment,c.base_url,c.channex_property_id,c.api_key_encrypted,s.floor,s.currency
    FROM channex_connections c JOIN channex_ari_settings s ON s.connection_id=c.id WHERE c.id=$1 AND s.enabled AND c.is_active`, [job.connection_id])).rows[0];
    const events: AriEvent[] = (await c.query(`SELECT id::text,kind,date_from::text,date_to::text,room_type_id,rate_plan_id,attempts,reason
    FROM channex_ari_outbox WHERE connection_id=$1 AND kind=$2 AND status='pending' AND run_after<=now() ORDER BY id LIMIT 1000`, [job.connection_id, job.kind])).rows;
    if (!connection || !events.length) return { state: 'idle' };
    const ids = events.map(e => e.id);
    try {
      if (connection.environment !== 'demo' || connection.base_url.replace(/\/$/, '') !== STAGING_URL) throw new AriConfigurationError('Los envíos ARI de esta etapa solo admiten Channex staging');
      const current = await buildAriValues(c, connection, events, clock.today);
      const daily: AriValue[] = current.flatMap(v => daysBetween(v.date_from, v.date_to).map(day => ({ ...v, date_from: day, date_to: day })));
      const published = (await c.query('SELECT target_id,day::text,value FROM channex_ari_published WHERE connection_id=$1 AND kind=$2', [connection.id, job.kind])).rows;
      const canonical = (value: any) => JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => !['date_from', 'date_to'].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
      const previous = new Map(published.map(p => [`${p.target_id}:${p.day}`, canonical(p.value)]));
      const full = events.some((e: any) => e.reason === 'full_sync');
      const changed = daily.filter(v => full || previous.get(`${v.room_type_id ?? v.rate_plan_id}:${v.date_from}`) !== canonical(v));
      const values = compressValues(changed);
      let taskIds: string[] = [];
      if (values.length) {
        // Reserve a global slot BEFORE every request, including retries, across replicas and connections.
        await c.query(`UPDATE channex_ari_dispatch SET next_call_at=now()+($1*interval '1 millisecond') WHERE id=1`, [ARI_CALL_INTERVAL_MS]);
        taskIds = await transport(connection, job.kind, values);
      }
      await c.query('BEGIN');
      try {
        if (changed.length) await c.query(`INSERT INTO channex_ari_published(connection_id,kind,target_id,day,value)
     SELECT $1,$2,v.target,v.day::date,v.value FROM jsonb_to_recordset($3::jsonb) AS v(target text,day text,value jsonb)
     ON CONFLICT(connection_id,kind,target_id,day) DO UPDATE SET value=EXCLUDED.value`, [connection.id, job.kind, JSON.stringify(changed.map(v => ({ target: v.room_type_id ?? v.rate_plan_id, day: v.date_from, value: v })))]);
        await c.query(`UPDATE channex_ari_outbox SET status='delivered',attempts=attempts+1,task_ids=$2,delivered_at=now(),last_error=NULL WHERE id=ANY($1::bigint[])`, [ids, JSON.stringify(taskIds)]);
        await c.query('COMMIT');
      } catch (error) { await c.query('ROLLBACK'); throw error; }
      return { state: 'delivered', events: ids.length, taskIds };
    } catch (error: any) {
      const transient = error instanceof AriTransportError ? (error.status === 429 || error.status >= 500) : ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name);
      if (!transient && !(error instanceof AriConfigurationError) && !(error instanceof AriTransportError)) throw error;
      const delay = retryDelay(Math.max(...events.map(e => e.attempts)), error instanceof AriTransportError ? error.retryAfter : null);
      const safeMessage = error instanceof AriTransportError || error instanceof AriConfigurationError ? error.message : transient ? 'No se pudo conectar con Channex; se reintentará' : 'Revisá el alcance, el mapeo, la moneda y la vigencia de las tarifas antes de reintentar';
      await c.query(`UPDATE channex_ari_outbox SET status=$2,attempts=attempts+1,run_after=now()+($3*interval '1 millisecond'),last_error=$4 WHERE id=ANY($1::bigint[])`, [ids, transient ? 'pending' : 'blocked', delay, safeMessage]);
      if (error instanceof AriTransportError && error.status === 429) await c.query(`UPDATE channex_ari_dispatch SET next_call_at=GREATEST(next_call_at,now()+($1*interval '1 millisecond')) WHERE id=1`, [delay]);
      return { state: transient ? 'retry' : 'blocked' };
    }
  } finally { try { if (locked) await c.query('SELECT pg_advisory_unlock(1296126535,903)'); } finally { c.release(); } }
}
export function startChannexAriWorker(pool: Pool) {
  if (process.env.CHANNEX_ARI_STAGING_ENABLED !== 'true') return () => { };
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await dispatchChannexAri(pool); } catch { console.error('[channex-ari] No se pudo procesar la cola; los cambios permanecen guardados'); } finally { running = false; } };
  const timer = setInterval(tick, 1000); timer.unref();
  return () => clearInterval(timer);
}
