import pg from "pg";
import { randomUUID } from "node:crypto";
import type { SupportUsage, SupportAlert } from "../../shared/support-chat";

export const CHAT_LOCK = 78349216;
export const MICRO_USD = 1000000;
export class SupportPaused extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}
export function hotelDay(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 3600000);
  const day = local.toISOString().slice(0, 10);
  return {
    day,
    start: new Date(`${day}T03:00:00.000Z`),
    end: new Date(new Date(`${day}T03:00:00.000Z`).getTime() + 86400000),
  };
}
export const chatPrices = {
  model: "gpt-5.3-codex",
  input: 1.75,
  cachedInput: 0.175,
  output: 14,
};
export function pricedUsage(input: number, output: number, cached = 0) {
  if (
    [input, output, cached].some((n) => !Number.isSafeInteger(n) || n < 0) ||
    cached > input
  )
    throw Error("Consumo inválido");
  return Math.ceil(
    (input - cached) * chatPrices.input +
      cached * chatPrices.cachedInput +
      output * chatPrices.output,
  );
}
type Queryable = Pick<pg.PoolClient, "query">;

export class ChatStore {
  constructor(
    readonly pool: pg.Pool,
    readonly investigationLimit = 10,
    readonly responseLimit = 20,
  ) {}
  async initialize() {
    await this.transaction(async (db) => {
      await db.query(`
      CREATE TABLE IF NOT EXISTS support_chat_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),daily_micros bigint NOT NULL CHECK(daily_micros BETWEEN 100000 AND 10000000));
      INSERT INTO support_chat_settings(id,daily_micros) VALUES(true,1000000) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS support_usage_days(day date PRIMARY KEY,spent_micros bigint NOT NULL DEFAULT 0,reserved_micros bigint NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS support_provider_calls(id uuid PRIMARY KEY,day date NOT NULL,case_id uuid REFERENCES support_cases(id),owner text NOT NULL,reserved_micros bigint NOT NULL,actual_micros bigint,status text NOT NULL DEFAULT 'reserved',provider_id text,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS support_budget_changes(request_id uuid PRIMARY KEY,actor text NOT NULL,daily_micros bigint NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS support_usage_reconciliations(request_id uuid PRIMARY KEY,call_id uuid NOT NULL REFERENCES support_provider_calls(id),actor text NOT NULL,actual_micros bigint NOT NULL,evidence text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS support_alerts(id uuid PRIMARY KEY,event_key text UNIQUE NOT NULL,kind text NOT NULL,title text NOT NULL,body text NOT NULL,case_id uuid REFERENCES support_cases(id),candidate_id uuid,delivery text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS support_chat_images(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES support_cases(id),owner text NOT NULL,name text NOT NULL,data_url text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS support_runs_daily_kind ON support_runs(kind,created_at);
      ALTER TABLE support_runs ADD COLUMN IF NOT EXISTS payload_digest text;
      CREATE INDEX IF NOT EXISTS support_provider_calls_unsettled ON support_provider_calls(status,created_at);
    `);
    });
  }
  async transaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [CHAT_LOCK]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async alert(
    db: Queryable,
    key: string,
    kind: string,
    title: string,
    text: string,
    caseId: string | null = null,
    candidateId: string | null = null,
  ) {
    await db.query(
      "INSERT INTO support_alerts(id,event_key,kind,title,body,case_id,candidate_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_key) DO NOTHING",
      [randomUUID(), key, kind, title, text, caseId, candidateId],
    );
  }
  async usage(owner: string, db: Queryable = this.pool): Promise<SupportUsage> {
    const { day, start, end } = hotelDay();
    const row = await db.query(
      `SELECT s.daily_micros,coalesce(d.spent_micros,0) AS spent,coalesce(d.reserved_micros,0) AS reserved,
      EXISTS(SELECT 1 FROM support_provider_calls WHERE status='unknown' OR (status='reserved' AND created_at<now()-interval '6 minutes')) AS uncertain,
      (SELECT count(*) FROM support_runs WHERE owner=$1 AND kind IN ('chat','analyze') AND created_at >=$2 AND created_at<$3)::int AS responses,
      (SELECT count(*) FROM support_runs WHERE kind IN ('research','analyze') AND created_at >=$2 AND created_at<$3)::int AS investigations
      FROM support_chat_settings s LEFT JOIN support_usage_days d ON d.day=$4 WHERE s.id=true`,
      [owner, start, end, day],
    );
    const v = row.rows[0],
      daily = Number(v.daily_micros),
      spent = Number(v.spent),
      reserved = Number(v.reserved);
    const reason = v.uncertain
      ? "unreconciled"
      : spent + reserved >= daily
        ? "daily_budget"
        : v.responses >= this.responseLimit
          ? "responses"
          : null;
    return {
      day,
      renewsAt: end.toISOString(),
      dailyUsd: daily / MICRO_USD,
      spentUsd: spent / MICRO_USD,
      reservedUsd: reserved / MICRO_USD,
      remainingUsd: Math.max(0, daily - spent - reserved) / MICRO_USD,
      responsesUsed: v.responses,
      responsesLimit: this.responseLimit,
      investigationsUsed: v.investigations,
      investigationsLimit: this.investigationLimit,
      paused: !!reason,
      reason,
    };
  }
  async budgetNotice(
    db: Queryable,
    kind: "warning" | "paused",
    reason = "daily_budget",
  ) {
    const { day } = hotelDay();
    const usage = await this.usage("", db);
    const message =
      kind === "warning"
        ? `El asistente alcanzó el 80% del presupuesto diario de US$${usage.dailyUsd.toFixed(2)}.`
        : reason === "unreconciled"
          ? "El asistente se pausó porque hay consumo pendiente de verificar. Se conserva el historial."
          : `El presupuesto disponible no permite continuar. Límite diario: US$${usage.dailyUsd.toFixed(2)}. El cupo se renueva a las 00:00 de Argentina. El PMS sigue funcionando.`;
    await this.alert(
      db,
      `budget/${day}/${kind}/${reason}`,
      `budget_${kind}`,
      kind === "warning"
        ? "Asistente: presupuesto al 80%"
        : "Asistente: consumo pausado",
      message,
    );
  }
  async admitReply(db: Queryable, owner: string) {
    const usage = await this.usage(owner, db);
    if (usage.paused) {
      if (usage.reason !== "responses")
        await this.budgetNotice(db, "paused", usage.reason!);
      return usage.reason === "responses"
        ? "Alcanzaste las 20 respuestas diarias. Tu mensaje quedó guardado; el cupo se renueva a las 00:00 de Argentina."
        : usage.reason === "unreconciled"
          ? "Tu mensaje quedó guardado. El asistente está pausado hasta verificar el consumo pendiente."
          : "Tu mensaje quedó guardado. El presupuesto del asistente está agotado o reservado en trabajos en curso. El PMS sigue funcionando.";
    }
    return null;
  }
  async admitResearch(caseId: string, owner: string) {
    return this.transaction(async (db) => {
      const usage = await this.usage(owner, db);
      if (usage.investigationsUsed >= this.investigationLimit) return false;
      await db.query(
        "INSERT INTO support_runs(id,owner,request_id,case_id,kind) VALUES($1,$2,$3,$4,'research')",
        [randomUUID(), owner, randomUUID(), caseId],
      );
      return true;
    });
  }
  async reserve(
    caseId: string,
    owner: string,
    inputTokens: number,
    maxOutput: number,
  ) {
    // Count endpoint includes text format, tools and images; reserve uncached input
    // with extra headroom. Output cap includes billed reasoning tokens.
    if (
      !Number.isSafeInteger(inputTokens) ||
      inputTokens < 1 ||
      inputTokens > 400000 ||
      !Number.isSafeInteger(maxOutput) ||
      maxOutput < 1 ||
      maxOutput > 4200
    )
      throw new SupportPaused(
        "configuration",
        "No se pudo acotar el consumo de la respuesta.",
      );
    const amount = pricedUsage(Math.ceil(inputTokens * 1.1) + 1024, maxOutput);
    const result = await this.transaction(async (db) => {
      const usage = await this.usage(owner, db);
      if (
        usage.reason === "unreconciled" ||
        Math.round(usage.remainingUsd * MICRO_USD) < amount
      ) {
        await this.budgetNotice(
          db,
          "paused",
          usage.reason === "unreconciled" ? "unreconciled" : "daily_budget",
        );
        return null;
      }
      const id = randomUUID(),
        { day } = hotelDay();
      await db.query(
        "INSERT INTO support_usage_days(day,reserved_micros) VALUES($1,$2) ON CONFLICT(day) DO UPDATE SET reserved_micros=support_usage_days.reserved_micros+EXCLUDED.reserved_micros",
        [day, amount],
      );
      await db.query(
        "INSERT INTO support_provider_calls(id,day,case_id,owner,reserved_micros) VALUES($1,$2,$3,$4,$5)",
        [id, day, caseId, owner, amount],
      );
      return id;
    });
    if (!result)
      throw new SupportPaused(
        "daily_budget",
        "Guardé tu consulta. No queda presupuesto suficiente para otra respuesta, o hay consumo pendiente de verificar.",
      );
    return result;
  }
  async settle(
    id: string,
    input: number,
    output: number,
    cached: number,
    providerId: string,
  ) {
    const actual = pricedUsage(input, output, cached);
    await this.transaction(async (db) => {
      const row = await db.query(
        "SELECT * FROM support_provider_calls WHERE id=$1 AND status='reserved' FOR UPDATE",
        [id],
      );
      if (!row.rows[0]) throw Error("Reserva de consumo inválida");
      const call = row.rows[0];
      await db.query(
        "UPDATE support_provider_calls SET status='settled',actual_micros=$2,provider_id=$3 WHERE id=$1",
        [id, actual, providerId],
      );
      await db.query(
        "UPDATE support_usage_days SET reserved_micros=reserved_micros-$2,spent_micros=spent_micros+$3 WHERE day=$1",
        [call.day, call.reserved_micros, actual],
      );
      const usage = await this.usage(call.owner, db);
      if (usage.spentUsd >= usage.dailyUsd * 0.8)
        await this.budgetNotice(db, "warning");
      if (actual > Number(call.reserved_micros)) {
        await db.query(
          "UPDATE support_provider_calls SET status='unknown' WHERE id=$1",
          [id],
        );
        await this.budgetNotice(db, "paused", "unreconciled");
      } else if (usage.spentUsd >= usage.dailyUsd)
        await this.budgetNotice(db, "paused");
    });
  }
  async uncertain(id: string) {
    await this.transaction(async (db) => {
      await db.query(
        "UPDATE support_provider_calls SET status='unknown' WHERE id=$1 AND status='reserved'",
        [id],
      );
      await this.budgetNotice(db, "paused", "unreconciled");
    });
  }
  async alerts(): Promise<SupportAlert[]> {
    const rows = await this.pool.query(
      "SELECT id,kind,title,body,case_id,created_at,delivery,attempts FROM support_alerts ORDER BY created_at DESC LIMIT 100",
    );
    return rows.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      text: r.body,
      caseId: r.case_id,
      createdAt: r.created_at.toISOString(),
      delivery: r.delivery === "sending" ? "pending" : r.delivery,
      attempts: r.attempts,
    }));
  }
}
