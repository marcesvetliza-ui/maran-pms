import type { Express, Request, Response } from "express";
import type pg from "pg";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  supportChatCreateSchema,
  supportChatMessageSchema,
  supportBudgetChangeSchema,
} from "../../shared/support-chat";
import type { SupportTicket } from "../../shared/programming-support";
import { diagnosisState } from "../../shared/programming-support";
import { supportReportText } from "../../shared/support-report-presentation";
import { permitsCodeProposal } from "../../shared/support-recommendation";
import { ChatStore, MICRO_USD, SupportPaused, chatPrices } from "./chat-store";
import { validateSupportImage } from "./chat-images";
import {
  chatProvider,
  meteredResponses,
  type MeteredProvider,
} from "./metered-responses";
import { chatNotifications } from "./chat-notifications";
import type { NotificationConfig } from "./notify";
import { converse } from "./chat-conversation";
import { CodeSource } from "./source";
import { investigateWithCodex } from "./codex-investigator";
import { responsesTransport } from "./responses-transport";
import {
  invalidateChange,
  prepareReviewedProposal,
  appendWorkflowEvent,
} from "./change-workflow";

export type ChatConfig = {
  version: string;
  sourceRoot: string;
  apiKey?: string;
  model: string;
  paidEnabled: boolean;
  engine?: string;
  transport?: string;
  investigationLimit: number;
  proposalReview?: boolean;
  notification?: NotificationConfig;
  provider?: MeteredProvider;
  sendNotification?: typeof fetch;
};
const reconcileSchema = z
  .object({
    requestId: z.string().uuid(),
    callId: z.string().uuid(),
    actualUsd: z.number().min(0).max(10),
    evidence: z.string().trim().min(10).max(500),
  })
  .strict();
const reviewer = (req: Request) =>
  req.get("X-Support-Reviewer") === "true" &&
  req.get("X-Support-View-All") === "true";
const httpError = (status: number, message: string) =>
  Object.assign(Error(message), { status });

export async function registerSupportChat(
  app: Express,
  pool: pg.Pool,
  config: ChatConfig,
) {
  const store = new ChatStore(pool, config.investigationLimit);
  await store.initialize();
  const deliver = chatNotifications(
    store,
    config.notification,
    config.sendNotification,
  );
  const safe =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response) => {
      void handler(req, res).catch((error) =>
        res.status((error as { status?: number }).status || 503).json({
          error: (error as { status?: number }).status
            ? (error as Error).message
            : "El chat no está disponible. Tu historial se conserva y el PMS sigue funcionando.",
        }),
      );
    };
  app.get(
    "/usage",
    safe(async (req, res) =>
      res.json({
        ...(await store.usage(res.locals.owner)),
        chatEnabled: true,
        notificationConfigured: reviewer(req)
          ? !!config.notification
          : undefined,
      }),
    ),
  );
  app.get(
    "/alerts",
    safe(async (req, res) =>
      reviewer(req)
        ? res.json(await store.alerts())
        : res.status(403).json({
            error: "Sin permiso para ver los avisos de administración",
          }),
    ),
  );
  app.post(
    "/alerts/test",
    safe(async (req, res) => {
      if (!reviewer(req)) return res.sendStatus(403);
      const parsed = z
        .object({ requestId: z.string().uuid() })
        .strict()
        .safeParse(req.body);
      if (!parsed.success) return res.sendStatus(400);
      if (!config.notification)
        return res.status(409).json({
          error: "Falta configurar el destinatario y el servicio de correo.",
        });
      await store.transaction((db) =>
        store.alert(
          db,
          `test/${res.locals.owner}/${parsed.data.requestId}`,
          "test",
          "Prueba de avisos del asistente",
          "Este mensaje comprueba el canal de avisos de Xenia. No se llamó al modelo ni se modificaron operaciones del hotel.",
        ),
      );
      return res.json({ queued: true });
    }),
  );
  app.get(
    "/usage/pending",
    safe(async (req, res) => {
      if (!reviewer(req)) return res.sendStatus(403);
      const rows = await pool.query(
        "SELECT id,day::text,reserved_micros,actual_micros,created_at FROM support_provider_calls WHERE status='unknown' OR (status='reserved' AND created_at<now()-interval '6 minutes') ORDER BY created_at LIMIT 100",
      );
      return res.json(
        rows.rows.map((r) => ({
          id: r.id,
          day: r.day,
          reservedUsd: Number(r.reserved_micros) / MICRO_USD,
          actualUsd:
            r.actual_micros === null
              ? null
              : Number(r.actual_micros) / MICRO_USD,
          createdAt: r.created_at,
        })),
      );
    }),
  );
  app.post(
    "/budget",
    safe(async (req, res) => {
      if (!reviewer(req)) return res.sendStatus(403);
      const parsed = supportBudgetChangeSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          error: "Indicá un límite entre US$0,10 y US$10 y el motivo.",
        });
      const { requestId, dailyUsd, reason } = parsed.data,
        amount = Math.round(dailyUsd * MICRO_USD);
      await store.transaction(async (db) => {
        const prior = await db.query(
          "SELECT * FROM support_budget_changes WHERE request_id=$1",
          [requestId],
        );
        if (prior.rows[0]) {
          if (
            prior.rows[0].actor !== res.locals.owner ||
            Number(prior.rows[0].daily_micros) !== amount ||
            prior.rows[0].reason !== reason
          )
            throw httpError(409, "Identificador ya utilizado");
          return;
        }
        await db.query(
          "INSERT INTO support_budget_changes(request_id,actor,daily_micros,reason) VALUES($1,$2,$3,$4)",
          [requestId, res.locals.owner, amount, reason],
        );
        await db.query(
          "UPDATE support_chat_settings SET daily_micros=$1 WHERE id=true",
          [amount],
        );
        await store.alert(
          db,
          `budget-change/${requestId}`,
          "budget_changed",
          "Cambio del límite diario",
          `Un revisor autorizado cambió el presupuesto diario a US$${dailyUsd.toFixed(2)}. Motivo: ${reason}`,
        );
      });
      return res.json(await store.usage(res.locals.owner));
    }),
  );
  app.post(
    "/usage/reconcile",
    safe(async (req, res) => {
      if (!reviewer(req)) return res.sendStatus(403);
      const parsed = reconcileSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          error:
            "Indicá el consumo verificado en el proveedor y la referencia de esa comprobación.",
        });
      const { requestId, callId, actualUsd, evidence } = parsed.data,
        amount = Math.ceil(actualUsd * MICRO_USD);
      await store.transaction(async (db) => {
        const prior = await db.query(
          "SELECT * FROM support_usage_reconciliations WHERE request_id=$1",
          [requestId],
        );
        if (prior.rows[0]) {
          if (
            prior.rows[0].actor !== res.locals.owner ||
            prior.rows[0].call_id !== callId ||
            Number(prior.rows[0].actual_micros) !== amount ||
            prior.rows[0].evidence !== evidence
          )
            throw httpError(409, "Identificador ya utilizado");
          return;
        }
        const row = await db.query(
          "SELECT * FROM support_provider_calls WHERE id=$1 AND (status='unknown' OR (status='reserved' AND created_at<now()-interval '6 minutes')) FOR UPDATE",
          [callId],
        );
        const call = row.rows[0];
        if (!call)
          throw httpError(
            409,
            "El consumo ya fue conciliado o sigue en curso.",
          );
        await db.query(
          "INSERT INTO support_usage_reconciliations(request_id,call_id,actor,actual_micros,evidence) VALUES($1,$2,$3,$4,$5)",
          [requestId, callId, res.locals.owner, amount, evidence],
        );
        await db.query(
          "UPDATE support_usage_days SET spent_micros=spent_micros+$2,reserved_micros=reserved_micros-$3 WHERE day=$1",
          [
            call.day,
            amount - Number(call.actual_micros || 0),
            call.actual_micros === null ? call.reserved_micros : 0,
          ],
        );
        await db.query(
          "UPDATE support_provider_calls SET status='settled',actual_micros=$2 WHERE id=$1",
          [callId, amount],
        );
        await store.alert(
          db,
          `reconciliation/${requestId}`,
          "usage_verified",
          "Consumo verificado",
          "Se registró una conciliación manual del consumo del proveedor. Quedaron guardados el responsable y la referencia de comprobación.",
        );
      });
      return res.json(await store.usage(res.locals.owner));
    }),
  );
  app.get(
    "/images/:id",
    safe(async (req, res) => {
      if (!z.string().uuid().safeParse(req.params.id).success)
        return res.sendStatus(404);
      const rows = await pool.query(
        "SELECT i.data_url FROM support_chat_images i JOIN support_cases c ON c.id=i.case_id WHERE i.id=$1 AND (c.owner=$2 OR $3::boolean)",
        [
          req.params.id,
          res.locals.owner,
          req.get("X-Support-View-All") === "true",
        ],
      );
      res.set("Cache-Control", "private, no-store");
      return rows.rows[0]
        ? res.json({ dataUrl: rows.rows[0].data_url })
        : res.sendStatus(404);
    }),
  );

  async function saveChat(req: Request, res: Response, isNew: boolean) {
    const parsed = (
      isNew ? supportChatCreateSchema : supportChatMessageSchema
    ).safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error:
          "Escribí tu consulta o adjuntá una captura PNG/JPEG de hasta 500 KB.",
      });
    const payload = parsed.data;
    const digest = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    try {
      payload.images.forEach(validateSupportImage);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    const ticket = await store.transaction(async (db) => {
      const previous = await db.query(
        "SELECT case_id,kind,payload_digest FROM support_runs WHERE owner=$1 AND request_id=$2",
        [res.locals.owner, payload.requestId],
      );
      if (previous.rows[0]) {
        if (
          !["chat", "chat_saved"].includes(previous.rows[0].kind) ||
          previous.rows[0].payload_digest !== digest ||
          (!isNew && previous.rows[0].case_id !== req.params.id)
        )
          throw httpError(409, "Identificador ya utilizado");
        const saved = await db.query(
          "SELECT data FROM support_cases WHERE id=$1 AND owner=$2",
          [previous.rows[0].case_id, res.locals.owner],
        );
        return saved.rows[0].data as SupportTicket;
      }
      const now = new Date().toISOString();
      let ticket: SupportTicket;
      if (isNew) {
        ticket = {
          id: randomUUID(),
          title: payload.text.slice(0, 100) || "Consulta con captura",
          module: "otro",
          actual: payload.text || "Consulta con captura",
          expected: "Recibir asistencia sobre el problema informado",
          steps: "",
          reference: "",
          page: "page" in payload ? String(payload.page || "") : "",
          environment: "pilot",
          version: config.version,
          createdBy: res.locals.owner,
          createdAt: now,
          updatedAt: now,
          status: "received",
          lastError: null,
          report: null,
          messages: [],
          conversational: true,
        };
        await db.query(
          "INSERT INTO support_cases(id,owner,request_id,data) VALUES($1,$2,$3,$4)",
          [ticket.id, res.locals.owner, payload.requestId, ticket],
        );
      } else {
        if (!z.string().uuid().safeParse(req.params.id).success)
          throw httpError(404, "Caso no encontrado");
        const rows = await db.query(
          "SELECT data FROM support_cases WHERE id=$1 AND owner=$2 FOR UPDATE",
          [req.params.id, res.locals.owner],
        );
        if (!rows.rows[0]) throw httpError(404, "Caso no encontrado");
        ticket = rows.rows[0].data;
        if (["queued", "investigating", "closed"].includes(ticket.status))
          throw httpError(
            409,
            "Esperá la respuesta en curso o abrí una consulta nueva si el caso está cerrado.",
          );
        if ((ticket.messages?.length || 0) >= 200)
          throw httpError(
            409,
            "Esta conversación llegó a su límite. Abrí una nueva consulta con el problema actual.",
          );
      }
      invalidateChange(ticket, res.locals.owner);
      if (ticket.report) ticket.reportStale = true;
      const images = [];
      for (const image of payload.images) {
        const id = randomUUID();
        await db.query(
          "INSERT INTO support_chat_images(id,case_id,owner,name,data_url) VALUES($1,$2,$3,$4,$5)",
          [id, ticket.id, res.locals.owner, image.name, image.dataUrl],
        );
        images.push({ id, name: image.name });
      }
      ticket.messages = [
        ...(ticket.messages || []),
        {
          id: randomUUID(),
          author: "user",
          text: payload.text || "Adjunté una captura.",
          createdAt: now,
          ...(images.length ? { images } : {}),
        },
      ];
      ticket.conversational = true;
      ticket.version = config.version;
      ticket.updatedAt = now;
      ticket.lastError = null;
      const blocked = await store.admitReply(db, res.locals.owner);
      const configured =
        config.paidEnabled &&
        config.apiKey &&
        config.engine === "codex" &&
        config.transport === "responses" &&
        config.model === chatPrices.model &&
        req.get("X-Support-Mode") === "codex" &&
        req.get("X-Support-Version") === config.version;
      const message =
        blocked ||
        (!configured
          ? "Tu mensaje quedó guardado. Falta habilitar el chat y comprobar que el PMS y el asistente tengan la misma versión y el modelo configurado."
          : null);
      if (message) {
        ticket.status = "received";
        ticket.lastError = message;
        delete ticket.queuedTask;
      } else {
        ticket.status = "queued";
        ticket.queuedTask = "chat";
        ticket.queuedRunId = randomUUID();
        ticket.queuedRequestedModel = config.model;
        ticket.queuedInvestigatorMode = "codex";
        ticket.queuedCodexTransport = "responses";
      }
      await db.query(
        "INSERT INTO support_runs(id,owner,request_id,case_id,kind,payload_digest) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          res.locals.owner,
          payload.requestId,
          ticket.id,
          message ? "chat_saved" : "chat",
          digest,
        ],
      );
      await db.query("UPDATE support_cases SET data=$2 WHERE id=$1", [
        ticket.id,
        ticket,
      ]);
      return ticket;
    });
    return res.status(isNew ? 201 : 200).json(ticket);
  }
  app.post(
    "/chat",
    safe((req, res) => saveChat(req, res, true)),
  );
  app.post(
    "/cases/:id/chat",
    safe((req, res) => saveChat(req, res, false)),
  );

  let active = false;
  async function tick() {
    if (active) return;
    active = true;
    try {
      const ticket = await store.transaction(async (db) => {
        const stale = await db.query(
          "UPDATE support_provider_calls SET status='unknown' WHERE status='reserved' AND created_at<now()-interval '6 minutes'",
        );
        if (stale.rowCount)
          await store.budgetNotice(db, "paused", "unreconciled");
        await db.query(
          `UPDATE support_cases SET data=(data-'queuedTask')||'{"status":"failed","lastError":"La respuesta se interrumpió. Tu consulta quedó guardada; podés continuar en el chat."}'::jsonb WHERE data->>'queuedTask'='chat' AND data->>'status'='investigating' AND (data->>'updatedAt')::timestamptz<now()-interval '7 minutes'`,
        );
        const row = await db.query(
          "SELECT data FROM support_cases WHERE data->>'queuedTask'='chat' AND data->>'status'='queued' ORDER BY data->>'updatedAt' FOR UPDATE SKIP LOCKED LIMIT 1",
        );
        const value: SupportTicket | undefined = row.rows[0]?.data;
        if (!value) return undefined;
        value.status = "investigating";
        value.updatedAt = new Date().toISOString();
        await db.query("UPDATE support_cases SET data=$2 WHERE id=$1", [
          value.id,
          value,
        ]);
        return value;
      });
      if (!ticket) return;
      try {
        if (
          !config.apiKey ||
          !config.paidEnabled ||
          ticket.version !== config.version ||
          ticket.queuedRequestedModel !== config.model ||
          config.engine !== "codex" ||
          config.transport !== "responses"
        )
          throw new SupportPaused(
            "configuration",
            "La configuración del asistente cambió. Tu consulta quedó guardada.",
          );
        const client = meteredResponses(
          store,
          config.provider || chatProvider(config.apiKey),
          ticket.id,
          ticket.createdBy,
          config.model,
        );
        const imageIds =
          ticket.messages
            ?.flatMap((m) => m.images || [])
            .slice(-3)
            .map((i) => i.id) || [];
        const rows = imageIds.length
          ? await pool.query(
              "SELECT data_url FROM support_chat_images WHERE case_id=$1 AND id=ANY($2::uuid[]) ORDER BY created_at",
              [ticket.id, imageIds],
            )
          : { rows: [] };
        const response = await converse(
          ticket,
          rows.rows.map((r) => r.data_url),
          client,
          config.model,
        );
        ticket.visualContext = response.observations || ticket.visualContext;
        let answer = response.reply;
        if (response.action === "investigate") {
          if (!(await store.admitResearch(ticket.id, ticket.createdBy))) {
            answer =
              "Guardé el caso. Ya se alcanzó el cupo diario de investigaciones técnicas del hotel. Podemos continuarlo al renovarse a las 00:00 de Argentina o pedir revisión humana.";
            ticket.status = "received";
          } else {
            const result = await investigateWithCodex(
              ticket,
              new CodeSource(config.sourceRoot, config.version),
              {
                apiKey: config.apiKey,
                model: config.model,
                transport: "responses",
                groundScreen: true,
                conversational: true,
                maxTurns: 16,
                maxTokens: 100000,
                maxContextChars: 120000,
                maxResearchTools: 10,
                timeoutMs: 240000,
              },
              async () =>
                responsesTransport(client, config.model, undefined, 125000),
            );
            ticket.investigator = result.investigator;
            if (result.clarification) {
              ticket.clarification = {
                ...result.clarification,
                requestedAfterMessageCount: (ticket.messages || []).filter(
                  (m) => m.author === "user",
                ).length,
              };
              ticket.report = null;
              delete ticket.reportId;
              ticket.status = "needs_info";
              answer = result.clarification.questions.join("\n\n");
            } else {
              ticket.report = result.report;
              ticket.reportStale = false;
              ticket.reportId = randomUUID();
              delete ticket.clarification;
              ticket.status = diagnosisState(result.report);
              answer = [
                supportReportText(result.report.summary),
                supportReportText(result.report.proposal),
                ...(result.report.certainty === "hipotesis"
                  ? [
                      "Es una hipótesis; todavía no pude confirmar la causa del incidente.",
                    ]
                  : []),
                ...result.report.limitations.slice(0, 2).map(supportReportText),
              ]
                .filter(Boolean)
                .join("\n\n");
              if (
                config.proposalReview &&
                result.report.validationStatus === "complete" &&
                result.report.certainty === "sustentado_en_codigo" &&
                permitsCodeProposal(result.report)
              ) {
                ticket.changeCandidate = prepareReviewedProposal(ticket);
                appendWorkflowEvent(
                  ticket,
                  "prepared",
                  "investigator",
                  "Propuesta lista para revisar. La aprobación permite preparar un cambio; no publica código.",
                );
              }
            }
          }
        } else ticket.status = "needs_info";
        ticket.messages = [
          ...(ticket.messages || []),
          {
            id: randomUUID(),
            author: "assistant",
            text: answer,
            createdAt: new Date().toISOString(),
          },
        ];
        ticket.lastError = null;
      } catch (error) {
        ticket.status = "failed";
        ticket.lastError =
          error instanceof SupportPaused
            ? error.message
            : "No pude completar la respuesta. Tu consulta y las capturas quedaron guardadas. Si hubo consumo sin confirmar, el asistente se pausa para verificarlo.";
      }
      ticket.updatedAt = new Date().toISOString();
      delete ticket.queuedTask;
      await store.transaction(async (db) => {
        const saved = await db.query(
          "UPDATE support_cases SET data=$2 WHERE id=$1 AND data->>'status'='investigating' AND data->>'queuedRunId'=$3",
          [ticket.id, ticket, ticket.queuedRunId],
        );
        if (
          saved.rowCount &&
          ticket.changeCandidate?.status === "awaiting_review"
        ) {
          const summary =
            config.notification?.includeSummary && ticket.report
              ? `Problema: ${supportReportText(ticket.report.summary).slice(0, 600)}\nPropuesta: ${supportReportText(ticket.report.proposal).slice(0, 600)}\n\n`
              : "";
          await store.alert(
            db,
            `proposal/${ticket.id}/${ticket.changeCandidate.id}`,
            "approval",
            "Propuesta de soporte pendiente de tu revisión",
            summary +
              "Hay una propuesta respaldada en código para revisar. La decisión permite preparar una corrección concreta; todavía no hay un cambio aplicado ni pruebas ejecutadas. Entrá al caso para ver el problema, la evidencia y decidir.",
            ticket.id,
            ticket.changeCandidate.id,
          );
        }
        if (saved.rowCount && ticket.status === "failed")
          await store.alert(
            db,
            `help/${ticket.id}/${ticket.queuedRunId}`,
            "human_review",
            "Consulta de soporte que necesita revisión humana",
            "El asistente no pudo completar la respuesta. El caso conserva la conversación y las capturas para revisión; no se aplicaron cambios.",
            ticket.id,
          );
      });
    } finally {
      active = false;
    }
  }
  const timer = setInterval(() => {
    void deliver().catch(() => {});
  }, 5000);
  timer.unref();
  return {
    store,
    tick,
    deliver,
    stop() {
      clearInterval(timer);
    },
  };
}
