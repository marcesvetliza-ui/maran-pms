import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { isPilotEnv } from "../app-env";
import {
  supportCreateSchema,
  supportMessageSchema,
  supportRunSchema,
} from "@shared/programming-support";

export function registerProgrammingSupport(app: Express) {
  app.use(
    "/api/programming-support",
    requireAuth,
    requirePermission("sidebar:/seguridad"),
  );
  app.get("/api/programming-support/config", (_req, res) =>
    res.json({
      enabled: isPilotEnv() && process.env.SUPPORT_ENABLED === "true",
      configured:
        !!process.env.SUPPORT_SERVICE_URL &&
        !!process.env.SUPPORT_SHARED_SECRET,
      version:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.ASSISTANT_SOURCE_VERSION ||
        null,
    }),
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
      (action && !["messages", "analyze", "close"].includes(action)) ||
      !!id !== !!action
    )
      return res.status(404).json({ error: "Operación no disponible" });
    let body: unknown;
    if (req.method === "POST") {
      const parsed = (
        action === "messages"
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
      res.status(upstream.status).json(payload);
    } catch {
      res
        .status(503)
        .json({
          error:
            "El servicio de soporte todavía no está disponible. El PMS sigue funcionando.",
        });
    }
  });
}
