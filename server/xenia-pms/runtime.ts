import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import type pg from "pg";
import { z } from "zod";
import type { XeniaPmsConfig } from "./config";
import { assertXeniaPmsBinding } from "./binding";
import {
  xeniaPmsLocalRole,
  type XeniaPmsIdentity,
} from "../../shared/xeniaPms";
import { BUILD_REVISION } from "../buildRevision";
import { qaOperationReadPath, qaOperationWritePath, validateQaOperation } from "./operations";
import type {} from "./request-context";
import { assertQaOperationsSchema } from "./operations-schema";

type PmsSession = {
  identity: XeniaPmsIdentity;
  leaseToken: string;
  expiresAt: string;
  localUserId: string;
};
declare module "express-session" {
  interface SessionData {
    xeniaPms?: PmsSession;
  }
}
const token = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
const identitySchema = z
  .object({
    principalId: z.string().uuid(),
    username: z.string().max(100),
    name: z.string().max(100),
    propertyId: z.string().uuid(),
    propertyName: z.string().max(100),
    clientId: z.string().uuid(),
    role: z.enum(["owner", "customer_admin", "manager", "reception", "viewer"]),
  })
  .strict();
const accessSchema = z.object({
  identity: identitySchema,
  expiresAt: z.string().datetime(),
});
const exchangeSchema = accessSchema.extend({ leaseToken: token });
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
class PmsAccessError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function controlRequest(
  config: XeniaPmsConfig,
  path: string,
  body: unknown,
) {
  let response: globalThis.Response;
  try {
    response = await fetch(new URL(path, config.controlOrigin), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(config.clientId + ":" + config.clientSecret).toString(
            "base64",
          ),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PmsAccessError(
      503,
      "No se pudo verificar el acceso con Xenia. Reintentá cuando vuelva la conexión.",
    );
  }
  if (!response.ok)
    throw new PmsAccessError(
      response.status >= 500 || response.status === 429 ? 503 : 401,
      response.status >= 500 || response.status === 429
        ? "Xenia no pudo verificar el acceso en este momento."
        : "El acceso al establecimiento venció o fue revocado. Ingresá desde Xenia.",
    );
  return response.json();
}
function verifyIdentity(config: XeniaPmsConfig, identity: XeniaPmsIdentity) {
  if (
    identity.propertyId !== config.propertyId ||
    identity.clientId !== config.clientId
  )
    throw new PmsAccessError(401, "El acceso corresponde a otra instalación.");
}
function readFlow(req: Request, name: string) {
  const pair = (req.get("Cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(name + "="));
  return pair?.slice(name.length + 1) ?? "";
}
async function localPrincipal(
  pool: pg.Pool,
  identity: XeniaPmsIdentity,
): Promise<Express.User> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,87934241))",
      [identity.principalId],
    );
    let row = (
      await connection.query(
        "SELECT u.* FROM xenia_pms.principal_links l JOIN system_users u ON u.id=l.user_id WHERE l.principal_id=$1 FOR UPDATE",
        [identity.principalId],
      )
    ).rows[0];
    if (row && (row.is_active !== "true" || row.lock_permanent === "true"))
      throw new PmsAccessError(
        401,
        "La cuenta local de esta instalación está desactivada.",
      );
    if (!row) {
      const id = randomUUID();
      row = (
        await connection.query(
          `INSERT INTO system_users(id,username,email,full_name,role,is_active,created_at,password)
        VALUES($1,$2,$3,$4,$5,'true',now(),NULL) RETURNING *`,
          [
            id,
            "xenia." + identity.principalId,
            identity.principalId + "@users.xenia.invalid",
            identity.name,
            xeniaPmsLocalRole(identity.role),
          ],
        )
      ).rows[0];
      await connection.query(
        "INSERT INTO xenia_pms.principal_links(principal_id,user_id) VALUES($1,$2)",
        [identity.principalId, id],
      );
    } else {
      row = (
        await connection.query(
          "UPDATE system_users SET full_name=$1,role=$2,last_login=now() WHERE id=$3 RETURNING *",
          [identity.name, xeniaPmsLocalRole(identity.role), row.id],
        )
      ).rows[0];
    }
    await connection.query("COMMIT");
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      department: row.department,
      phone: row.phone,
      isActive: row.is_active,
      totpEnabled: "false",
    };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

const readPaths = [
  "/api/auth/me",
  "/api/permissions/mine",
  "/api/reservation-edit-permission",
  "/api/pos-configs",
  "/api/rooms",
  "/api/room-types",
  "/api/rate-plans",
  "/api/rate-calendar",
  "/api/bed-types",
  "/api/guests",
  "/api/companies",
  "/api/agencies",
  "/api/planning",
  "/api/reservations",
  "/api/cancelled-reservations",
  "/api/maintenance-blocks",
  "/api/maintenance/blocks",
  "/api/groups",
  "/api/notifications",
  "/api/dashboard",
  "/api/packages",
  "/api/system-settings",
  "/api/countries",
  "/api/nationalities",
  "/api/pricing",
  "/api/reservation-changelog",
];
const writePath =
  /^(?:\/api\/guests(?:\/[^/]+)?|\/api\/reservations(?:\/[^/]+(?:\/(?:cancel|restore))?)?|\/api\/rooms(?:\/[^/]+)?|\/api\/room-types(?:\/[^/]+)?|\/api\/rate-plans(?:\/[^/]+)?)$/;
const nightlyWritePath =
  /^\/api\/reservations\/[^/]+\/nightly-pricing\/(?:preview|apply)$/;

export function registerXeniaPmsRuntime(
  app: Express,
  pool: pg.Pool,
  config: XeniaPmsConfig,
) {
  const flowCookie = "xenia-pms-flow-" + config.clientId;
  const cookieOptions = {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax" as const,
    path: "/xenia",
    maxAge: 120_000,
  };
  const reject = (error: unknown, res: Response) => {
    const status = error instanceof PmsAccessError ? error.status : 500;
    res
      .status(status)
      .set("Cache-Control", "no-store")
      .json({
        message:
          error instanceof PmsAccessError
            ? error.message
            : "No se pudo completar el acceso a esta instalación. Reintentá desde Xenia.",
      });
  };
  app.get("/healthz", (_req, res) => {
    void assertXeniaPmsBinding(pool, config)
      .then(async () => { if (config.operationsEnabled) await assertQaOperationsSchema(pool); })
      .then(() =>
        res.json({
          status: "ok",
          mode: "qa",
          revision: BUILD_REVISION,
          propertyId: config.propertyId,
          clientId: config.clientId,
          operationsEnabled: config.operationsEnabled,
          template: config.template,
          propertyName: config.propertyName,
        }),
      )
      .catch(() => res.status(503).json({ status: "unavailable" }));
  });
  app.get("/api/xenia/installation", (_req, res) =>
    res.set("Cache-Control", "no-store").json({
      mode: "qa",
      propertyId: config.propertyId,
      name: config.propertyName,
      controlOrigin: config.controlOrigin,
      startPath: "/xenia/start",
      operationsEnabled: config.operationsEnabled,
    }),
  );
  app.get("/descargar-colobig-pdf", (_req, res) =>
    res
      .status(404)
      .json({ message: "Recurso no disponible en esta instalación." }),
  );
  app.get("/xenia/start", (req, res) => {
    void (async () => {
      const previous = readFlow(req, flowCookie);
      const flow = token.safeParse(previous).success ? previous : opaque();
      const state = opaque(),
        verifier = opaque();
      await pool.query(
        "DELETE FROM xenia_pms.login_requests WHERE expires_at<now()",
      );
      await pool.query(
        "INSERT INTO xenia_pms.login_requests(state_hash,flow_hash,verifier,expires_at) VALUES($1,$2,$3,now()+interval '2 minutes')",
        [hash(state), hash(flow), verifier],
      );
      const target = new URL("/pms/authorize", config.controlOrigin);
      target.searchParams.set("client_id", config.clientId);
      target.searchParams.set("state", state);
      target.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      res
        .set("Cache-Control", "no-store")
        .set("Referrer-Policy", "no-referrer")
        .cookie(flowCookie, flow, cookieOptions)
        .redirect(303, target.toString());
    })().catch((error) => reject(error, res));
  });
  app.get("/xenia/callback", (req, res) => {
    void (async () => {
      res
        .set("Cache-Control", "no-store")
        .set("Referrer-Policy", "no-referrer");
      const parsed = z
        .object({ code: token, state: token })
        .strict()
        .safeParse(req.query);
      const flow = readFlow(req, flowCookie);
      if (!parsed.success || !token.safeParse(flow).success)
        throw new PmsAccessError(
          401,
          "La solicitud de ingreso no pudo validarse. Ingresá desde Xenia.",
        );
      const pending = (
        await pool.query(
          "DELETE FROM xenia_pms.login_requests WHERE state_hash=$1 AND flow_hash=$2 AND expires_at>now() RETURNING verifier",
          [hash(parsed.data.state), hash(flow)],
        )
      ).rows[0];
      if (!pending)
        throw new PmsAccessError(
          401,
          "La solicitud de ingreso venció o ya fue utilizada.",
        );
      const exchanged = exchangeSchema.parse(
        await controlRequest(config, "/api/pms/exchange", {
          code: parsed.data.code,
          verifier: pending.verifier,
        }),
      );
      verifyIdentity(config, exchanged.identity);
      const user = await localPrincipal(pool, exchanged.identity);
      await new Promise<void>((resolve, reject) =>
        req.logIn(user, (error) => (error ? reject(error) : resolve())),
      );
      req.session.xeniaPms = { ...exchanged, localUserId: user.id };
      req.session.pending2FA = false;
      await new Promise<void>((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
      const nonce = randomBytes(18).toString("base64");
      res
        .set(
          "Content-Security-Policy",
          `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
        )
        .type("html")
        .send(
          `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ingresando al PMS</title></head><body><p>Ingresando al establecimiento…</p><script nonce="${nonce}">sessionStorage.setItem("maranTabActive","1");try{const c=new BroadcastChannel("maran-auth");c.postMessage({type:"login"});c.close()}catch{}location.replace("/planning");</script></body></html>`,
        );
    })().catch((error) => reject(error, res));
  });
  app.post("/api/auth/logout", (req, res) => {
    void (async () => {
      if (req.get("Origin") !== config.origin)
        throw new PmsAccessError(403, "La solicitud no pudo validarse.");
      const current = req.session.xeniaPms;
      if (current)
        await controlRequest(config, "/api/pms/revoke", {
          leaseToken: current.leaseToken,
        }).catch(() => {});
      const flow = readFlow(req, flowCookie);
      if (token.safeParse(flow).success)
        await pool.query(
          "DELETE FROM xenia_pms.login_requests WHERE flow_hash=$1",
          [hash(flow)],
        );
      await new Promise<void>((resolve, reject) =>
        req.session.destroy((error) => (error ? reject(error) : resolve())),
      );
      res
        .clearCookie(flowCookie, cookieOptions)
        .clearCookie(
          config.production
            ? "__Host-xenia-pms-" + config.clientId
            : "xenia-pms-" + config.clientId,
          {
            path: "/",
            secure: config.production,
            httpOnly: true,
            sameSite: "lax",
          },
        )
        .json({ message: "Sesión cerrada" });
    })().catch((error) => reject(error, res));
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) return next();
    void (async () => {
      res.set("Cache-Control", "no-store");
      if (req.path === "/api/auth/login" || req.path === "/api/auth/setup")
        throw new PmsAccessError(
          403,
          "Ingresá a esta instalación desde el panel de Xenia.",
        );
      const current = req.session.xeniaPms;
      if (
        !current ||
        !req.user ||
        req.user.id !== current.localUserId ||
        req.user.isActive !== "true"
      )
        throw new PmsAccessError(
          401,
          "Ingresá a esta instalación desde Xenia.",
        );
      const checked = accessSchema.parse(
        await controlRequest(config, "/api/pms/introspect", {
          leaseToken: current.leaseToken,
        }),
      );
      verifyIdentity(config, checked.identity);
      if (
        checked.identity.principalId !== current.identity.principalId ||
        checked.identity.role !== current.identity.role ||
        req.user.role !== xeniaPmsLocalRole(checked.identity.role)
      )
        throw new PmsAccessError(
          401,
          "La identidad o los permisos cambiaron. Ingresá desde Xenia.",
        );
      const read = ["GET", "HEAD"].includes(req.method);
      req.xeniaPmsAccess = {
        principalId: checked.identity.principalId,
        propertyId: checked.identity.propertyId,
        role: checked.identity.role,
        operationsEnabled: config.operationsEnabled,
      };
      if (!read) {
        if (req.get("Origin") !== config.origin)
          throw new PmsAccessError(403, "La solicitud no pudo validarse.");
        if (checked.identity.role === "viewer")
          throw new PmsAccessError(
            403,
            "Tu acceso a este establecimiento es de consulta.",
          );
        if (
          !["POST", "PATCH", "DELETE"].includes(req.method) ||
          !(
            writePath.test(req.path) ||
            (req.method === "POST" && nightlyWritePath.test(req.path)) ||
            (config.operationsEnabled && qaOperationWritePath(req.method, req.path))
          )
        )
          throw new PmsAccessError(
            403,
            "Esta operación todavía no está habilitada en la prueba de Alojamiento.",
          );
        if (/^\/api\/reservations(?:\/[^/]+)?$/.test(req.path) &&
            req.body?.status !== undefined && !["confirmed", "pending", "tentative"].includes(req.body.status))
          throw new PmsAccessError(403, "Usá la acción de ingreso, salida o anulación para cambiar el estado de la estadía.");
        if (config.operationsEnabled && qaOperationWritePath(req.method, req.path)) {
          try { await validateQaOperation(req, pool); }
          catch (error: any) {
            if (error instanceof z.ZodError)
              throw new PmsAccessError(400, "Revisá los datos de la operación de prueba. No se aplicó el cambio.");
            if ([403, 404, 409].includes(error?.status)) throw new PmsAccessError(error.status, error.message);
            throw error;
          }
        }
      } else if (
        !readPaths.some(
          (path) => req.path === path || req.path.startsWith(path + "/"),
        ) && !(config.operationsEnabled && qaOperationReadPath(req.path))
      )
        throw new PmsAccessError(
          403,
          "Este módulo todavía no está habilitado en la prueba de Alojamiento.",
        );
      next();
    })().catch((error) => reject(error, res));
  });
}

/** A newly prepared custom PMS confirms its own identity after startup. This
 * authenticated back-channel never accepts a browser's readiness assertion. */
export function announceXeniaPmsReady(pool: pg.Pool, config: XeniaPmsConfig) {
  if (config.template !== "custom") return;
  const attempt = async () => {
    try {
      await assertXeniaPmsBinding(pool, config);
      if (config.operationsEnabled) await assertQaOperationsSchema(pool);
      const instance = (await pool.query("SELECT database_instance_id FROM xenia_pms.installation WHERE singleton=true")).rows[0];
      await controlRequest(config, "/api/pms/ready", { databaseId: instance.database_instance_id, propertyId: config.propertyId, revision: BUILD_REVISION,
        template: "custom", mode: "qa", operationsEnabled: config.operationsEnabled });
    } catch {
      console.warn("[xenia-pms] Falta confirmar la preparación con Xenia; se reintentará sin modificar datos operativos.");
      setTimeout(() => { void attempt(); }, 15000).unref();
    }
  };
  void attempt();
}
