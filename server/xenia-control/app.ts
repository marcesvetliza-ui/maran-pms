import express, {
  type RequestHandler,
  type ErrorRequestHandler,
} from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z, ZodError } from "zod";
import type { ControlConfig } from "./config";
import { ControlStore, ControlError, type Principal } from "./store";
import { PmsBroker } from "./pms";
import { CustomerManagement } from "./customer-management";
import { assertCustomerSchema } from "./customer-schema";

declare module "express-session" {
  interface SessionData {
    xeniaPrincipalId?: string;
    xeniaSessionVersion?: number;
    xeniaCsrf?: string;
    xeniaPmsResume?: string;
  }
}

const name = z.string().trim().min(2).max(100).refine(value => !/[\r\n\0]/.test(value));
const uuid = z.string().uuid();
const modules = z
  .array(z.enum(["lodging", "restaurant", "spa", "events", "groups"]))
  .min(1)
  .max(5)
  .refine((values) => new Set(values).size === values.length);
const propertyRole = z.enum(["manager", "reception", "viewer"]);
const userInput = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,59}$/),
    name,
    password: z
      .string()
      .min(12)
      .max(72)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
    propertyIds: z
      .array(uuid)
      .min(1)
      .max(50)
      .refine((values) => new Set(values).size === values.length),
    role: propertyRole,
  })
  .strict();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T12:00:00Z");
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Fecha inválida.");
const reservationInput = z
  .object({
    guestName: name,
    room: z.string().trim().min(1).max(40),
    checkIn: day,
    checkOut: day,
  })
  .strict()
  .refine(
    (value) => value.checkOut > value.checkIn,
    "La salida debe ser posterior al ingreso.",
  );
const route =
  (
    handler: (req: express.Request, res: express.Response) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(handler(req, res)).catch(next);
  };
const actor = (res: express.Response): Principal => res.locals.xeniaPrincipal;

export async function createControlApp(config: ControlConfig) {
  const store = new ControlStore(config);
  const pms = new PmsBroker(store);
  const customers = new CustomerManagement(store);
  // Startup checks presence only. All schema/provisioning changes belong to the explicit setup command.
  try {
    await store.central.query(
      "SELECT id FROM xenia_control.principals LIMIT 1",
    );
    await assertCustomerSchema(store.central);
  } catch (error) {
    await store.close();
    throw error;
  }
  const app = express();
  app.disable("x-powered-by");
  if (config.production) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "24kb" }));
  // Back-channel endpoints authenticate the installation, never a browser
  // cookie. Register before browser sessions and their Origin/CSRF middleware.
  const pmsLimit = rateLimit({
    windowMs: 60_000,
    limit: 1200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  const pmsClient: RequestHandler = (req, res, next) => {
    void (async () => {
      res.set("Cache-Control", "no-store");
      const raw = req.get("Authorization") ?? "";
      if (
        !raw.startsWith("Basic ") ||
        raw.length > 512 ||
        !req.is("application/json")
      )
        throw new ControlError(401, "La instalación debe autenticarse.");
      const decoded = Buffer.from(raw.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      const clientId = uuid.parse(decoded.slice(0, separator));
      const secret = decoded.slice(separator + 1);
      if (separator < 0 || !/^[a-zA-Z0-9_-]{43,128}$/.test(secret))
        throw new ControlError(401, "La instalación debe autenticarse.");
      const installation = await pms.authenticate(clientId, secret);
      if (req.get("Origin") && req.get("Origin") !== installation.origin)
        throw new ControlError(403, "Origen del PMS inválido.");
      res.locals.pmsClientId = installation.clientId;
      res.locals.pmsCredentialVersion = installation.credentialVersion;
      next();
    })().catch(next);
  };
  app.post("/api/pms/ready", pmsLimit, pmsClient, route(async (req, res) => {
    const input = z.object({ databaseId: uuid, propertyId: uuid, revision: z.string().regex(/^[a-f0-9]{40}$/),
      template: z.literal("custom"), mode: z.literal("qa"), operationsEnabled: z.boolean() }).strict().parse(req.body);
    res.json(await pms.ready(res.locals.pmsClientId, res.locals.pmsCredentialVersion, input));
  }));
  const opaqueToken = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
  app.post(
    "/api/pms/exchange",
    pmsLimit,
    pmsClient,
    route(async (req, res) => {
      const input = z
        .object({
          code: opaqueToken,
          verifier: z.string().regex(/^[a-zA-Z0-9._~-]{43,128}$/),
        })
        .strict()
        .parse(req.body);
      res.json(
        await pms.exchange(res.locals.pmsClientId, input.code, input.verifier),
      );
    }),
  );
  app.post(
    "/api/pms/introspect",
    pmsLimit,
    pmsClient,
    route(async (req, res) => {
      const input = z
        .object({ leaseToken: opaqueToken })
        .strict()
        .parse(req.body);
      res.json(await pms.introspect(res.locals.pmsClientId, input.leaseToken));
    }),
  );
  app.post(
    "/api/pms/revoke",
    pmsLimit,
    pmsClient,
    route(async (req, res) => {
      const input = z
        .object({ leaseToken: opaqueToken })
        .strict()
        .parse(req.body);
      await pms.revoke(res.locals.pmsClientId, input.leaseToken);
      res.json({ ok: true });
    }),
  );
  app.get("/healthz", (_req, res) => {
    void store.central
      .query("SELECT 1")
      .then(() => res.json({ status: "ok" }))
      .catch(() => res.status(503).json({ status: "unavailable" }));
  });
  const PgSession = connectPgSimple(session);
  const sessionStore = new PgSession({
    pool: store.central,
    schemaName: "xenia_control",
    tableName: "sessions",
    createTableIfMissing: false,
    pruneSessionInterval: config.demo ? false : 900,
  });
  app.use(
    session({
      name: config.production ? "__Host-xenia-control" : "xenia-control",
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: "lax",
        maxAge: 12 * 60 * 60 * 1000,
        path: "/",
      },
      rolling: false,
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    // Login is protected by an exact Origin and JSON-only requests. Anonymous reads
    // must not create competing session cookies in separate browser tabs.
    const signingIn = req.path === "/login" || req.path === "/demo-login";
    if (
      req.get("Origin") !== config.origin ||
      (signingIn && !req.is("application/json"))
    )
      return res.status(403).json({
        message:
          "La solicitud no pudo validarse. Recargá la página antes de reintentar.",
      });
    if (signingIn) return next();
    const supplied = req.get("X-CSRF-Token") ?? "";
    const expected = req.session.xeniaCsrf ?? "";
    if (
      req.get("Origin") !== config.origin ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return res.status(403).json({
        message:
          "La solicitud no pudo validarse. Recargá la página antes de reintentar.",
      });
    }
    next();
  });
  const authorize: RequestHandler = (req, res, next) => {
    void (async () => {
      const principal = req.session.xeniaPrincipalId
        ? await store.principal(req.session.xeniaPrincipalId)
        : undefined;
      if (
        !principal ||
        req.session.xeniaSessionVersion !== principal.sessionVersion
      )
        throw new ControlError(401, "Ingresá nuevamente a Xenia.");
      res.locals.xeniaPrincipal = principal;
      next();
    })().catch(next);
  };
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message:
        "Hubo varios intentos de ingreso. Esperá unos minutos antes de reintentar.",
    },
  });
  const login = async (
    req: express.Request,
    res: express.Response,
    principal: Principal,
  ) => {
    const redirectTo = req.session.xeniaPmsResume;
    const previousPrincipal = req.session.xeniaPrincipalId;
    if (previousPrincipal && previousPrincipal !== principal.id)
      await pms.logoutPrincipal(previousPrincipal);
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    req.session.xeniaPrincipalId = principal.id;
    req.session.xeniaSessionVersion = principal.sessionVersion;
    req.session.xeniaCsrf = randomBytes(32).toString("hex");
    await new Promise<void>((resolve, reject) =>
      req.session.save((error) => (error ? reject(error) : resolve())),
    );
    res.json({
      user: principal,
      csrfToken: req.session.xeniaCsrf,
      demo: config.demo,
      ...(redirectTo ? { redirectTo } : {}),
    });
  };
  app.get(
    "/pms/authorize",
    route(async (req, res) => {
      res
        .set("Cache-Control", "no-store")
        .set("Referrer-Policy", "no-referrer");
      const input = z
        .object({
          client_id: uuid,
          state: opaqueToken,
          code_challenge: opaqueToken,
        })
        .strict()
        .parse(req.query);
      const principal = req.session.xeniaPrincipalId
        ? await store.principal(req.session.xeniaPrincipalId)
        : undefined;
      if (
        !principal ||
        principal.sessionVersion !== req.session.xeniaSessionVersion
      ) {
        req.session.xeniaPmsResume =
          "/pms/authorize?" + new URLSearchParams(input).toString();
        await new Promise<void>((resolve, reject) =>
          req.session.save((error) => (error ? reject(error) : resolve())),
        );
        return res.redirect(303, "/");
      }
      const grant = await pms.grant(
        principal,
        input.client_id,
        input.code_challenge,
      );
      const callback = new URL("/xenia/callback", grant.origin);
      callback.searchParams.set("code", grant.code);
      callback.searchParams.set("state", input.state);
      res.redirect(303, callback.toString());
    }),
  );
  app.get(
    "/api/session",
    route(async (req, res) => {
      const principal = req.session.xeniaPrincipalId
        ? await store.principal(req.session.xeniaPrincipalId)
        : undefined;
      const user =
        principal &&
        principal.sessionVersion === req.session.xeniaSessionVersion
          ? principal
          : null;
      if (!user) {
        delete req.session.xeniaPrincipalId;
        delete req.session.xeniaSessionVersion;
        delete req.session.xeniaCsrf;
      } else req.session.xeniaCsrf ??= randomBytes(32).toString("hex");
      res.json({
        user,
        csrfToken: user ? req.session.xeniaCsrf : null,
        demo: config.demo,
      });
    }),
  );
  // A real password comparison is performed even for unknown usernames.
  const dummyHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  app.post(
    "/api/login",
    loginLimiter,
    route(async (req, res) => {
      const input = z
        .object({
          username: z.string().trim().toLowerCase().max(100),
          password: z
            .string()
            .max(72)
            .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
        })
        .strict()
        .parse(req.body);
      const principal = await store.credentials(input.username);
      const valid = await bcrypt.compare(
        input.password,
        principal?.passwordHash ?? dummyHash,
      );
      if (!principal || !valid)
        throw new ControlError(401, "Usuario o contraseña incorrectos.");
      const { passwordHash: _hash, ...safe } = principal;
      await login(req, res, safe);
    }),
  );
  if (config.demo)
    app.post(
      "/api/demo-login",
      loginLimiter,
      route(async (req, res) => {
        const { persona } = z
          .object({
            persona: z.enum(["owner", "manager", "reception", "viewer"]),
          })
          .strict()
          .parse(req.body);
        const principal = await store.credentials(
          {
            owner: "admin.demo",
            manager: "responsable.demo",
            reception: "recepcion.aurora",
            viewer: "consulta.brisa",
          }[persona],
        );
        if (!principal)
          throw new ControlError(
            409,
            "La demostración todavía no está preparada.",
          );
        const { passwordHash: _hash, ...safe } = principal;
        await login(req, res, safe);
      }),
    );
  app.post(
    "/api/logout",
    route(async (req, res) => {
      if (req.session.xeniaPrincipalId)
        await pms.logoutPrincipal(req.session.xeniaPrincipalId);
      await new Promise<void>((resolve, reject) =>
        req.session.destroy((error) => (error ? reject(error) : resolve())),
      );
      res
        .clearCookie(
          config.production ? "__Host-xenia-control" : "xenia-control",
          {
            path: "/",
            secure: config.production,
            httpOnly: true,
            sameSite: "lax",
          },
        )
        .json({ ok: true });
    }),
  );
  app.get(
    "/api/properties",
    authorize,
    route(async (_req, res) => res.json(await store.properties(actor(res)))),
  );
  app.get(
    "/api/pms/installations",
    authorize,
    route(async (_req, res) => res.json(await pms.links(actor(res)))),
  );
  app.post(
    "/api/admin/properties/:propertyId/pms",
    authorize,
    route(async (req, res) => {
      const input = z
        .object({
          origin: z.string().max(250),
          template: z.enum(["aurora", "brisa", "custom"]).optional(),
        })
        .strict()
        .parse(req.body);
      res
        .status(201)
        .json(
          await pms.configure(
            actor(res),
            uuid.parse(req.params.propertyId),
            input.origin,
            input.template,
          ),
        );
    }),
  );
  const accountInput = userInput.omit({ propertyIds: true, role: true }).extend({ requestId: uuid }).strict();
  const staffInput = userInput.extend({ requestId: uuid }).strict();
  app.get("/api/organizations", authorize, route(async (_req, res) => res.json(await customers.organizations(actor(res)))));
  app.get("/api/admin/organizations/:organizationId/administrators", authorize, route(async (req, res) =>
    res.json(await customers.administrators(actor(res), uuid.parse(req.params.organizationId)))));
  app.post("/api/admin/organizations/:organizationId/administrators", authorize, route(async (req, res) => {
    const result = await customers.createAdministrator(actor(res), uuid.parse(req.params.organizationId), accountInput.parse(req.body));
    res.status(result.replayed ? 200 : 201).json(result);
  }));
  app.delete("/api/admin/organizations/:organizationId/administrators/:principalId", authorize, route(async (req, res) =>
    res.json(await customers.revokeAdministrator(actor(res), uuid.parse(req.params.organizationId), uuid.parse(req.params.principalId)))));
  app.get("/api/organizations/:organizationId/properties", authorize, route(async (req, res) =>
    res.json(await customers.properties(actor(res), uuid.parse(req.params.organizationId)))));
  app.get("/api/organizations/:organizationId/users", authorize, route(async (req, res) =>
    res.json(await customers.users(actor(res), uuid.parse(req.params.organizationId)))));
  app.post("/api/organizations/:organizationId/users", authorize, route(async (req, res) => {
    const result = await customers.createStaff(actor(res), uuid.parse(req.params.organizationId), staffInput.parse(req.body));
    res.status(result.replayed ? 200 : 201).json(result);
  }));
  app.patch("/api/organizations/:organizationId/users/:principalId", authorize, route(async (req, res) =>
    res.json(await customers.setActive(actor(res), uuid.parse(req.params.organizationId), uuid.parse(req.params.principalId),
      z.object({ active: z.boolean() }).strict().parse(req.body).active))));
  app.put("/api/organizations/:organizationId/users/:principalId/properties/:propertyId", authorize, route(async (req, res) =>
    res.json(await customers.assign(actor(res), uuid.parse(req.params.organizationId), uuid.parse(req.params.principalId),
      uuid.parse(req.params.propertyId), z.object({ role: propertyRole }).strict().parse(req.body).role))));
  app.delete("/api/organizations/:organizationId/users/:principalId/properties/:propertyId", authorize, route(async (req, res) =>
    res.json(await customers.revoke(actor(res), uuid.parse(req.params.organizationId), uuid.parse(req.params.principalId), uuid.parse(req.params.propertyId)))));
  app.get(
    "/api/admin/organizations",
    authorize,
    route(async (_req, res) => {
      store.requireAdmin(actor(res));
      res.json(await store.organizations());
    }),
  );
  app.post(
    "/api/admin/organizations",
    authorize,
    route(async (req, res) =>
      res
        .status(201)
        .json(
          await store.createOrganization(
            actor(res),
            z.object({ name }).strict().parse(req.body).name,
          ),
        ),
    ),
  );
  app.post(
    "/api/admin/properties",
    authorize,
    route(async (req, res) => {
      const input = z
        .object({
          name,
          slug: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .max(60),
          organizationId: uuid,
          modules,
          storageKind: z.enum(["demo", "pms"]).optional(),
          requestId: uuid.optional(),
        })
        .strict()
        .refine(value => value.storageKind !== "pms" || (!!value.requestId && value.modules.includes("lodging")), "El PMS requiere Alojamiento y el identificador de alta.")
        .parse(req.body);
      const property = await store.createProperty(actor(res), input);
      res.status("replayed" in property && property.replayed ? 200 : 201).json(property);
    }),
  );
  app.post(
    "/api/admin/properties/:propertyId/activate",
    authorize,
    route(async (req, res) =>
      res.json(
        await store.activateProperty(
          actor(res),
          uuid.parse(req.params.propertyId),
        ),
      ),
    ),
  );
  app.get(
    "/api/admin/users",
    authorize,
    route(async (_req, res) => res.json(await store.users(actor(res)))),
  );
  app.post(
    "/api/admin/users",
    authorize,
    route(async (req, res) =>
      res
        .status(201)
        .json(await store.createUser(actor(res), userInput.parse(req.body))),
    ),
  );
  app.get(
    "/api/properties/:propertyId/memberships",
    authorize,
    route(async (req, res) =>
      res.json(
        await store.memberships(actor(res), uuid.parse(req.params.propertyId)),
      ),
    ),
  );
  app.put(
    "/api/properties/:propertyId/memberships/:principalId",
    authorize,
    route(async (req, res) => {
      await store.assign(
        actor(res),
        uuid.parse(req.params.propertyId),
        uuid.parse(req.params.principalId),
        z.object({ role: propertyRole }).strict().parse(req.body).role,
      );
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/properties/:propertyId/memberships/:principalId",
    authorize,
    route(async (req, res) => {
      await store.revoke(
        actor(res),
        uuid.parse(req.params.propertyId),
        uuid.parse(req.params.principalId),
      );
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/properties/:propertyId/reservations",
    authorize,
    route(async (req, res) =>
      res.json(
        await store.reservations(actor(res), uuid.parse(req.params.propertyId)),
      ),
    ),
  );
  app.get(
    "/api/properties/:propertyId/reservations/:id",
    authorize,
    route(async (req, res) =>
      res.json(
        await store.reservation(
          actor(res),
          uuid.parse(req.params.propertyId),
          uuid.parse(req.params.id),
        ),
      ),
    ),
  );
  app.post(
    "/api/properties/:propertyId/reservations",
    authorize,
    route(async (req, res) =>
      res
        .status(201)
        .json(
          await store.createReservation(
            actor(res),
            uuid.parse(req.params.propertyId),
            reservationInput.parse(req.body),
          ),
        ),
    ),
  );
  app.post(
    "/api/properties/:propertyId/reservations/:id/cancel",
    authorize,
    route(async (req, res) =>
      res.json(
        await store.cancelReservation(
          actor(res),
          uuid.parse(req.params.propertyId),
          uuid.parse(req.params.id),
        ),
      ),
    ),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "Recurso no disponible." }),
  );
  app.use(
    express.static(join(dirname(fileURLToPath(import.meta.url)), "public"), {
      index: "index.html",
      etag: true,
      maxAge: 0,
    }),
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ControlError)
      return void res.status(error.status).json({ message: error.message });
    if (error instanceof ZodError)
      return void res.status(400).json({
        message: "Revisá los datos ingresados.",
        fields: error.issues.map((issue) => issue.path.join(".")),
      });
    if (error?.code === "23505")
      return void res
        .status(409)
        .json({ message: "Ya existe un registro con esos datos." });
    if (error?.type === "entity.parse.failed")
      return void res
        .status(400)
        .json({ message: "Datos de solicitud inválidos." });
    console.error(
      "[xenia-control] Operación interrumpida",
      error?.code ?? "internal",
    );
    res.status(500).json({
      message:
        "No se pudo completar la operación. Tus datos anteriores se conservaron.",
    });
  };
  app.use(errors);
  return {
    app,
    store,
    pms,
    customers,
    close: async () => {
      await sessionStore.close();
      await store.close();
    },
  };
}
