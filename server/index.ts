import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logger } from "./logger";
import { initSentry, Sentry } from "./sentry";

initSentry();

const REQUIRED_ENV_VARS = ["DATABASE_URL", "SESSION_SECRET"];
const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(
    `[ERROR DE INICIO] Variables de entorno requeridas no configuradas: ${missingVars.join(", ")}\n` +
    `El servidor no puede iniciar sin estas variables. Configurelas en el panel de Secretos de Replit.`
  );
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);

// Allow embedding /reservar in an iframe from the hotel website
app.use((req, res, next) => {
  const isPublic = req.path === "/reservar" || req.path.startsWith("/api/public/booking");
  if (isPublic) {
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false, // Managed per-route above
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intente en unos minutos" },
  skip: (req) => req.path.startsWith("/api/public/"),
});
app.use("/api", apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos de inicio de sesión" },
});
app.use("/api/auth/login", loginLimiter);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use("/api/public/web-checkin", express.json({ limit: "5mb" }));
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

setupAuth(app);

// Diagnóstico temporal de assets (público, sin auth)
import { assetPathDiagnostic } from "./utils/assetPath";
app.get("/descargar-colobig-pdf", (_req, res) => {
  const filePath = path.join(process.cwd(), "attached_assets", "Respuesta_Colobig_ImplementacionGastronomica_Julio2026.pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="Respuesta_Colobig_ImplementacionGastronomica_Julio2026.pdf"');
  res.setHeader("Content-Type", "application/pdf");
  res.sendFile(filePath, (err) => { if (err) res.status(404).json({ error: "Archivo no encontrado" }); });
});

app.get("/api/debug/assets", (_req, res) => {
  res.json(assetPathDiagnostic());
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── 1. Register routes (synchronous, no DB needed) ──────────────────────
  await registerRoutes(httpServer, app);

  // ── 2. Global error handler ──────────────────────────────────────────────
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (status >= 500) {
      logger.error("Unhandled API error", err, { method: req.method, path: req.path, status });
      if (process.env.SENTRY_DSN) {
        Sentry.withScope((scope) => {
          scope.setExtras({ method: req.method, path: req.path, status });
          const user = req.user as any;
          if (user) scope.setUser({ id: user.id, username: user.username, role: user.role });
          Sentry.captureException(err);
        });
      }
    }
    res.status(status).json({ message });
  });

  // ── 3. Static serving / Vite dev ────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ── 4. OPEN PORT FIRST — Railway health check depends on this ───────────
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });

  // ── 5. Background startup tasks (DB migrations, seed, schedulers) ────────
  //    These run AFTER the port is open so Railway never times out.
  (async () => {
    // helper: per-step timeout so a hung DDL lock never blocks forever
    async function mig(label: string, fn: () => Promise<unknown>) {
      try {
        await Promise.race([
          fn(),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("TIMEOUT 10s")), 10_000)
          ),
        ]);
      } catch (err: any) {
        logger.warn(`[startup] ${label}: ${err?.message}`);
      }
    }

    const { runMigrations } = await import("./migrate");
    await runMigrations();

    const { seedDatabase, refreshRealData } = await import("./seed");
    await mig("seedDatabase", seedDatabase);
    await mig("refreshRealData", refreshRealData);

    try {
      const { storage } = await import("./db-storage");
      await mig("initCashShifts", () => storage.initCashShifts());
    } catch (err) {
      logger.warn("[startup] initCashShifts: " + String(err));
    }

    const { db: iDb } = await import("./db");
    const { sql: iSql } = await import("drizzle-orm");

    await mig("accounting_accounts seed", () => iDb.execute(iSql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo) VALUES
        ('1.1.1.01', 'Caja', 'activo'),
        ('1.1.1.02', 'Banco Macro', 'activo'),
        ('2.1.1.01', 'Proveedores a Pagar', 'pasivo')
      ON CONFLICT (codigo) DO NOTHING
    `));
    await mig("package_room_prices.extra_amount", () => iDb.execute(iSql`
      ALTER TABLE package_room_prices ADD COLUMN IF NOT EXISTS extra_amount DECIMAL(12,2) DEFAULT 0
    `));
    await mig("accounting_suppliers.cuenta_contable_id", () => iDb.execute(iSql`
      ALTER TABLE accounting_suppliers
        ADD COLUMN IF NOT EXISTS cuenta_contable_id INTEGER REFERENCES accounting_accounts(id)
    `));
    await mig("email_config SMTP columns", () => iDb.execute(iSql`
      ALTER TABLE email_config
        ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT 'smtp.gmail.com',
        ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587,
        ADD COLUMN IF NOT EXISTS smtp_user TEXT,
        ADD COLUMN IF NOT EXISTS smtp_pass TEXT,
        ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT false
    `));
    await mig("email_config row seed", () => iDb.execute(iSql`
      INSERT INTO email_config (
        id, global_enabled, provider, from_email, from_name,
        confirmation_enabled, confirmation_subject, confirmation_body,
        reminder_enabled, reminder_subject, reminder_body,
        checkout_enabled, checkout_subject, checkout_body
      ) VALUES (
        1, false, 'resend', 'reservas@maransuites.com', 'Maran Suites & Towers',
        true, 'Confirmación de tu reserva — Maran Suites & Towers',
        'Hola {nombre_huesped},\n\nTu reserva ha sido confirmada.',
        true, 'Recordatorio de tu llegada — Maran Suites & Towers',
        'Hola {nombre_huesped}, te recordamos que tu check-in es mañana {fecha_checkin}.',
        true, 'Gracias por tu estadía — Maran Suites & Towers',
        'Hola {nombre_huesped},\n\nGracias por elegirnos.'
      ) ON CONFLICT (id) DO NOTHING
    `));
    await mig("groups.master_folio_config", () => iDb.execute(iSql`
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS master_folio_config TEXT DEFAULT 'accommodation'
    `));
    await mig("backup_logs create", () => iDb.execute(iSql`
      CREATE TABLE IF NOT EXISTS backup_logs (
        id SERIAL PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL,
        destination TEXT, file_size_bytes INTEGER, duration_ms INTEGER,
        error_message TEXT, created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `));

    // Sincronizar secuencias serial — siempre, para evitar duplicate key errors
    await mig("sync sequences", () => iDb.execute(iSql`
      SELECT
        setval('admin_cash_movements_id_seq', COALESCE((SELECT MAX(id) FROM admin_cash_movements), 0) + 1, false),
        setval('admin_cash_arqueos_id_seq', COALESCE((SELECT MAX(id) FROM admin_cash_arqueos), 0) + 1, false),
        setval('payment_orders_id_seq', COALESCE((SELECT MAX(id) FROM payment_orders), 0) + 1, false),
        setval('purchase_invoices_id_seq', COALESCE((SELECT MAX(id) FROM purchase_invoices), 0) + 1, false),
        setval('iibb_retentions_id_seq', COALESCE((SELECT MAX(id) FROM iibb_retentions), 0) + 1, false)
    `));

    // Liberar mesas "occupied" sin pedido activo que hayan quedado de sesiones anteriores.
    // Corre después de las migraciones para garantizar que las columnas existen.
    try {
      const { storage: st } = await import("./db-storage");
      const freed = await st.closeStaleOrders();
      if (freed > 0) log(`[startup] closeStaleOrders: ${freed} órdenes antiguas cerradas y mesas liberadas`);
    } catch (err: any) {
      logger.warn("[startup] closeStaleOrders: " + err?.message);
    }

    try {
      const { setupNightAuditScheduler } = await import("./night-audit");
      setupNightAuditScheduler();
      log("Night Audit scheduler iniciado");
    } catch (err: any) {
      logger.warn("[startup] Night Audit scheduler: " + err.message);
    }
    try {
      const { setupBackupScheduler } = await import("./backup");
      setupBackupScheduler();
      log("Backup scheduler iniciado (03:00 ARG)");
    } catch (err: any) {
      logger.warn("[startup] Backup scheduler: " + err.message);
    }
  })().catch((err) => logger.error("Background startup error", err));
})();
