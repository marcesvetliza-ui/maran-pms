import express from "express";
import pg from "pg";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  supportCreateSchema,
  supportMessageSchema,
  supportRunSchema,
  type SupportTicket,
} from "../../shared/programming-support";
import { CodeSource } from "./source";
import { diagnose } from "./diagnose";
import { notifyReady, type NotificationConfig } from "./notify";

export function validBearer(value: string | undefined, secret: string) {
  const supplied = Buffer.from(value || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    secret.length >= 32 &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}
export async function createService(
  config: {
    databaseUrl: string;
    secret: string;
    version: string;
    sourceRoot: string;
    apiKey?: string;
    model: string;
    notification?: NotificationConfig;
  },
  investigator = diagnose,
) {
  if (config.secret.length < 32 || !/^[a-f0-9]{40}$/.test(config.version))
    throw new Error("Configurar secreto y revisión de código completos.");
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
  try {
    const operational = await pool.query(
      "SELECT to_regclass('reservations') IS NOT NULL OR to_regclass('system_users') IS NOT NULL OR to_regclass('inventory_items') IS NOT NULL AS present",
    );
    if (operational.rows[0].present)
      throw new Error(
        "La base del asistente debe ser propia: se detectaron tablas del PMS.",
      );
  } catch (error) {
    await pool.end();
    throw error;
  }
  // This is a dedicated assistant database. No PMS imports, migrations or data tools.
  await pool.query(`CREATE TABLE IF NOT EXISTS support_cases(id uuid PRIMARY KEY, owner text NOT NULL, request_id uuid NOT NULL, data jsonb NOT NULL, UNIQUE(owner,request_id));
    CREATE TABLE IF NOT EXISTS support_runs(id uuid PRIMARY KEY, owner text NOT NULL, request_id uuid NOT NULL, case_id uuid REFERENCES support_cases(id), kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner,request_id));`);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({
        status: "ok",
        mode: "pilot",
        configured: !!config.apiKey,
        version: config.version,
      });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use((req, res, next) => {
    if (!validBearer(req.headers.authorization, config.secret))
      return res.status(401).json({ error: "No autorizado" });
    if (
      typeof req.headers["x-support-user"] !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(req.headers["x-support-user"])
    )
      return res.status(400).json({ error: "Usuario inválido" });
    res.locals.owner = req.headers["x-support-user"];
    next();
  });
  app.get("/cases", async (_req, res) => {
    try {
      const rows = await pool.query(
        "SELECT data FROM support_cases WHERE owner=$1 ORDER BY data->>'updatedAt' DESC LIMIT 100",
        [res.locals.owner],
      );
      res.json(rows.rows.map((row) => row.data));
    } catch {
      res.status(503).json({ error: "No se pudo consultar soporte" });
    }
  });
  app.post("/cases", async (req, res) => {
    const parsed = supportCreateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Revisá los datos del caso" });
    const { requestId, ...fields } = parsed.data;
    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      ...fields,
      id: randomUUID(),
      createdBy: res.locals.owner,
      createdAt: now,
      updatedAt: now,
      status: "received",
      environment: "pilot",
      version: config.version,
      report: null,
      lastError: null,
      messages: [],
    };
    try {
      await pool.query(
        "INSERT INTO support_cases(id,owner,request_id,data) VALUES($1,$2,$3,$4) ON CONFLICT(owner,request_id) DO NOTHING",
        [ticket.id, res.locals.owner, requestId, ticket],
      );
      const row = await pool.query(
        "SELECT data FROM support_cases WHERE owner=$1 AND request_id=$2",
        [res.locals.owner, requestId],
      );
      res.status(201).json(row.rows[0].data);
    } catch {
      res.status(503).json({ error: "No se pudo guardar el caso" });
    }
  });
  app.post("/cases/:id/:action", async (req, res) => {
    const { action, id } = req.params;
    if (
      !["messages", "analyze", "close"].includes(action) ||
      !/^[a-f0-9-]{36}$/.test(id)
    )
      return res.status(404).json({ error: "Caso no encontrado" });
    const parsed = (
      action === "messages" ? supportMessageSchema : supportRunSchema
    ).safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Datos inválidos" });
    const client = await pool.connect().catch(() => null);
    if (!client)
      return res.status(503).json({ error: "Soporte no disponible" });
    try {
      await client.query("BEGIN");
      // Serializes daily reservations across all service replicas.
      await client.query("SELECT pg_advisory_xact_lock(78349215)");
      const row = await client.query(
        "SELECT data FROM support_cases WHERE id=$1 AND owner=$2 FOR UPDATE",
        [id, res.locals.owner],
      );
      if (!row.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Caso no encontrado" });
      }
      const ticket: SupportTicket = row.rows[0].data;
      const previous = await client.query(
        "SELECT case_id,kind FROM support_runs WHERE owner=$1 AND request_id=$2",
        [res.locals.owner, parsed.data.requestId],
      );
      if (previous.rows.length) {
        await client.query("ROLLBACK");
        return previous.rows[0].case_id === id &&
          previous.rows[0].kind === action
          ? res.json(ticket)
          : res.status(409).json({ error: "Identificador ya utilizado" });
      }
      if ((ticket.status === "closed" && action !== "close") || ((ticket.messages?.length || 0) >= 30 && action !== "close")) {
        await client.query("ROLLBACK");
        return res.status(409).json({error:"Caso cerrado o límite de seguimiento alcanzado"});
      }
      if (ticket.status === "queued" || ticket.status === "investigating") {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({ error: "La investigación está en curso" });
      }
      if (action === "analyze") {
        if (
          !config.apiKey ||
          ticket.version !== config.version ||
          req.headers["x-support-version"] !== config.version
        ) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error:
              "Configurar el modelo y desplegar PMS y asistente desde la misma revisión antes de investigar",
          });
        }
        const budget = await client.query(
          "SELECT count(*)::int AS count FROM support_runs WHERE created_at >= now()-interval '24 hours' AND kind='analyze'",
        );
        if (budget.rows[0].count >= 10) {
          await client.query("ROLLBACK");
          return res.status(429).json({
            error: "Límite del piloto: diez investigaciones en 24 horas",
          });
        }
        ticket.version = config.version;
        ticket.status = "queued";
        ticket.lastError = null;
      } else if (action === "close") ticket.status = "closed";
      else {
        if ((ticket.messages?.length || 0) >= 30) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ error: "El caso alcanzó el límite de mensajes" });
        }
        ticket.messages!.push({
          id: randomUUID(),
          author: "user",
          text: supportMessageSchema.parse(req.body).text,
          createdAt: new Date().toISOString(),
        });
      }
      const runId = randomUUID();
      if (action === "analyze")
        ticket.messages!.push({
          id: randomUUID(),
          author: "system",
          text: "Investigación solicitada",
          createdAt: new Date().toISOString(),
        });
      ticket.updatedAt = new Date().toISOString();
      await client.query(
        "INSERT INTO support_runs(id,owner,request_id,case_id,kind) VALUES($1,$2,$3,$4,$5)",
        [runId, res.locals.owner, parsed.data.requestId, id, action],
      );
      await client.query("UPDATE support_cases SET data=$2 WHERE id=$1", [
        id,
        ticket,
      ]);
      await client.query("COMMIT");
      res.json(ticket);
    } catch {
      await client.query("ROLLBACK");
      res.status(503).json({ error: "No se pudo guardar la operación" });
    } finally {
      client.release();
    }
  });
  let active = false;
  async function tick() {
    if (active) return;
    active = true;
    const client = await pool.connect();
    let ticket: SupportTicket | undefined;
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE support_cases SET data=jsonb_set(jsonb_set(data,'{status}','"failed"'),'{lastError}','"Investigación interrumpida. Podés solicitarla otra vez."') WHERE data->>'status'='investigating' AND (data->>'updatedAt')::timestamptz < now()-interval '5 minutes'`,
      );
      const row = await client.query(
        "SELECT data FROM support_cases WHERE data->>'status'='queued' ORDER BY data->>'updatedAt' FOR UPDATE SKIP LOCKED LIMIT 1",
      );
      ticket = row.rows[0]?.data;
      if (ticket) {
        ticket.status = "investigating";
        ticket.updatedAt = new Date().toISOString();
        await client.query("UPDATE support_cases SET data=$2 WHERE id=$1", [
          ticket.id,
          ticket,
        ]);
      }
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    try {
      if (ticket) {
        const lease = ticket.updatedAt;
        try {
          const result = await investigator(
            ticket,
            new CodeSource(config.sourceRoot, config.version),
            { apiKey: config.apiKey!, model: config.model },
          );
          ticket.report = result.report;
          ticket.status = result.report.questions.length
            ? "needs_info"
            : "proposal_ready";
          ticket.lastError = null;
        } catch {
          ticket.status = "failed";
          ticket.lastError =
            "No se pudo completar el diagnóstico. Revisá la configuración o solicitá otro intento.";
        }
        ticket.updatedAt = new Date().toISOString();
        const saved = await pool.query(
          "UPDATE support_cases SET data=$2 WHERE id=$1 AND data->>'status'='investigating' AND data->>'updatedAt'=$3",
          [ticket.id, ticket, lease],
        );
        if (
          saved.rowCount &&
          ticket.report &&
          ticket.status !== "failed" &&
          config.notification
        )
          await notifyReady(
            config.notification,
            ticket.id,
            fetch,
            `${ticket.id}/${lease}`,
          ).catch(() =>
            console.warn(
              "Diagnóstico guardado; no se pudo enviar el aviso por correo.",
            ),
          );
      }
    } finally {
      active = false;
    }
  }
  const timer = setInterval(() => {
    void tick().catch(() => {
      active = false;
    });
  }, 2000);
  timer.unref();
  return {
    app,
    pool,
    tick,
    stop: async () => {
      clearInterval(timer);
      await pool.end();
    },
  };
}
