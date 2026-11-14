import { supportInvestigatorMode } from "@shared/support-investigator-mode";
import { hasPermission } from "../permissions";
import { supportDecisionSchema } from "@shared/support-change-workflow";
import {
  supportChatCreateSchema,
  supportChatMessageSchema,
  supportBudgetChangeSchema,
} from "@shared/support-chat";
import { z } from "zod";
import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { isPilotEnv } from "../app-env";
import {
  supportCreateSchema,
  supportFeedbackSchema,
  supportMessageSchema,
  supportRunSchema,
} from "@shared/programming-support";

export function registerProgrammingSupport(app: Express) {
  const investigatorMode = supportInvestigatorMode(process.env);
  app.use(
    "/api/programming-support",
    requireAuth,
    requirePermission("sidebar:/programming-support"),
  );
  app.get("/api/programming-support/config", (_req, res) =>
    res.json({
      enabled: isPilotEnv() && process.env.SUPPORT_ENABLED === "true",
      configured:
        !!process.env.SUPPORT_SERVICE_URL &&
        !!process.env.SUPPORT_SHARED_SECRET,
      userId: String((_req.user as Express.User).id),
      canViewAll:
        (_req.user as Express.User).role === "admin" ||
        hasPermission((_req.user as Express.User).role, "api:support:view-all"),
      canReview:
        (_req.user as Express.User).role === "admin" ||
        hasPermission((_req.user as Express.User).role, "api:support:review"),
      workflowSimulation: investigatorMode === "simulation",
      proposalReview: process.env.SUPPORT_PROPOSAL_REVIEW_ENABLED === "true",
      conversational:
        isPilotEnv() && process.env.SUPPORT_CONVERSATIONAL_ENABLED === "true",
      investigatorMode,
      version:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.ASSISTANT_SOURCE_VERSION ||
        null,
    }),
  );
  app.all(
    [
      "/api/programming-support/chat",
      "/api/programming-support/usage",
      "/api/programming-support/alerts",
      "/api/programming-support/alerts/test",
      "/api/programming-support/budget",
      "/api/programming-support/usage/pending",
      "/api/programming-support/usage/reconcile",
      "/api/programming-support/images/:imageId",
    ],
    async (req, res) => {
      if (
        !isPilotEnv() ||
        process.env.SUPPORT_ENABLED !== "true" ||
        process.env.SUPPORT_CONVERSATIONAL_ENABLED !== "true"
      )
        return res.sendStatus(404);
      const role = (req.user as Express.User).role;
      const viewAll =
        role === "admin" || hasPermission(role, "api:support:view-all");
      const canReview =
        role === "admin" || hasPermission(role, "api:support:review");
      const path = req.path.slice("/api/programming-support".length);
      const isImage = path.startsWith("/images/");
      if (isImage && !z.string().uuid().safeParse(req.params.imageId).success)
        return res.sendStatus(404);
      if (
        [
          "/alerts",
          "/alerts/test",
          "/budget",
          "/usage/pending",
          "/usage/reconcile",
        ].includes(path) &&
        !(viewAll && canReview)
      )
        return res.sendStatus(403);
      const allowedMethod = [
        "/chat",
        "/budget",
        "/usage/reconcile",
        "/alerts/test",
      ].includes(path)
        ? "POST"
        : "GET";
      if (req.method !== allowedMethod) return res.sendStatus(404);
      let body: unknown;
      if (req.method === "POST") {
        const schema =
          path === "/chat"
            ? supportChatCreateSchema
            : path === "/budget"
              ? supportBudgetChangeSchema
              : path === "/alerts/test"
                ? supportRunSchema
                : z
                    .object({
                      requestId: z.string().uuid(),
                      callId: z.string().uuid(),
                      actualUsd: z.number().min(0).max(10),
                      evidence: z.string().trim().min(10).max(500),
                    })
                    .strict();
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({ error: "Revisá los datos enviados" });
        body = parsed.data;
      }
      try {
        if (
          !process.env.SUPPORT_SERVICE_URL ||
          !process.env.SUPPORT_SHARED_SECRET
        )
          throw Error("Not configured");
        const response = await fetch(
          new URL(path, process.env.SUPPORT_SERVICE_URL),
          {
            method: req.method,
            headers: {
              Authorization: `Bearer ${process.env.SUPPORT_SHARED_SECRET}`,
              "Content-Type": "application/json",
              "X-Support-User": String((req.user as Express.User).id),
              "X-Support-Mode": investigatorMode,
              "X-Support-Version":
                process.env.RAILWAY_GIT_COMMIT_SHA ||
                process.env.ASSISTANT_SOURCE_VERSION ||
                "unknown",
              "X-Support-View-All": String(viewAll),
              "X-Support-Reviewer": String(canReview),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          },
        );
        if (response.status === 401)
          return res
            .status(503)
            .json({
              error:
                "No se pudo autenticar el servicio de soporte. El PMS sigue funcionando; Administración debe revisar la conexión del asistente.",
            });
        res.set("Cache-Control", "private, no-store");
        return res.status(response.status).json(await response.json());
      } catch {
        return res.status(503).json({
          error: "El chat no está disponible. El PMS sigue funcionando.",
        });
      }
    },
  );
  app.all("/api/programming-support/cases/:id?/:action?", async (req, res) => {
    if (!isPilotEnv() || process.env.SUPPORT_ENABLED !== "true")
      return res
        .status(404)
        .json({ error: "Asistente disponible solo en el piloto habilitado" });
    const { id, action } = req.params;
    if (
      (req.method === "GET" && (id || action)) ||
      (req.method !== "GET" && req.method !== "POST") ||
      (id && !/^[a-f0-9-]{36}$/.test(id)) ||
      (action &&
        ![
          "messages",
          "analyze",
          "close",
          "feedback",
          "decision",
          "chat",
        ].includes(action)) ||
      !!id !== !!action
    )
      return res.status(404).json({ error: "Operación no disponible" });
    const role = (req.user as Express.User).role;
    const viewAll =
      role === "admin" || hasPermission(role, "api:support:view-all");
    const canReview =
      role === "admin" || hasPermission(role, "api:support:review");
    if (action === "decision" && !canReview)
      return res
        .status(403)
        .json({ error: "Sin permiso para aprobar propuestas" });
    if (
      action === "chat" &&
      process.env.SUPPORT_CONVERSATIONAL_ENABLED !== "true"
    )
      return res.sendStatus(404);
    let body: unknown;
    if (req.method === "POST") {
      const parsed = (
        action === "chat"
          ? supportChatMessageSchema
          : action === "decision"
            ? supportDecisionSchema
            : action === "feedback"
              ? supportFeedbackSchema
              : action === "messages"
                ? supportMessageSchema
                : action
                  ? supportRunSchema
                  : supportCreateSchema
      ).safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Revisá los datos enviados" });
      body = parsed.data;
    }
    try {
      if (
        !process.env.SUPPORT_SERVICE_URL ||
        !process.env.SUPPORT_SHARED_SECRET
      )
        throw new Error("Not configured");
      const base = new URL(process.env.SUPPORT_SERVICE_URL);
      const url = new URL(`/cases${id ? `/${id}/${action}` : ""}`, base);
      const upstream = await fetch(url, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${process.env.SUPPORT_SHARED_SECRET}`,
          "Content-Type": "application/json",
          "X-Support-User": String((req.user as Express.User).id),
          "X-Support-Mode": investigatorMode,
          "X-Support-View-All": viewAll ? "true" : "false",
          "X-Support-Reviewer": canReview ? "true" : "false",
          "X-Support-Version":
            process.env.RAILWAY_GIT_COMMIT_SHA ||
            process.env.ASSISTANT_SOURCE_VERSION ||
            "unknown",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      const payload = await upstream.json();
      if (upstream.status === 401)
        return res
          .status(503)
          .json({
            error:
              "No se pudo autenticar el servicio de soporte. El PMS sigue funcionando; Administración debe revisar la conexión del asistente.",
          });
      res.status(upstream.status).json(payload);
    } catch {
      res.status(503).json({
        error:
          "El servicio de soporte todavía no está disponible. El PMS sigue funcionando.",
      });
    }
  });
}
