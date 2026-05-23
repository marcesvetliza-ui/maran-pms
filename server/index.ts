import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logger } from "./logger";

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
  const { runMigrations } = await import("./migrate");
  await runMigrations();

  const { seedDatabase, refreshRealData } = await import("./seed");
  try {
    await seedDatabase();
  } catch (err) {
    console.error("Seed error:", err);
  }
  try {
    await refreshRealData();
  } catch (err) {
    console.error("Refresh real data error:", err);
  }
  try {
    const { storage } = await import("./db-storage");
    await storage.initCashShifts();
  } catch (err) {
    console.error("Init cash shifts error:", err);
  }

  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo) VALUES
        ('1.1.1.01', 'Caja', 'activo'),
        ('1.1.1.02', 'Banco Macro', 'activo'),
        ('2.1.1.01', 'Proveedores a Pagar', 'pasivo')
      ON CONFLICT (codigo) DO NOTHING
    `);
  } catch (err) {
    console.error("Critical accounts insert error (non-blocking):", err);
  }

  // Migrate: add extra_amount to package_room_prices
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      ALTER TABLE package_room_prices
        ADD COLUMN IF NOT EXISTS extra_amount DECIMAL(12,2) DEFAULT 0
    `);
  } catch (err) {
    console.error("package_room_prices migration error (non-blocking):", err);
  }

  // Migrate: add cuenta_contable_id to accounting_suppliers
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      ALTER TABLE accounting_suppliers
        ADD COLUMN IF NOT EXISTS cuenta_contable_id INTEGER REFERENCES accounting_accounts(id)
    `);
  } catch (err) {
    console.error("accounting_suppliers migration error (non-blocking):", err);
  }

  // Migrate: add SMTP columns to email_config + ensure the single config row exists
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    // Add new columns if missing
    await db.execute(sql`
      ALTER TABLE email_config
        ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT 'smtp.gmail.com',
        ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587,
        ADD COLUMN IF NOT EXISTS smtp_user TEXT,
        ADD COLUMN IF NOT EXISTS smtp_pass TEXT,
        ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT false
    `);
    // Ensure the single config row (id=1) always exists
    await db.execute(sql`
      INSERT INTO email_config (
        id, global_enabled, provider,
        from_email, from_name,
        confirmation_enabled, confirmation_subject, confirmation_body,
        reminder_enabled, reminder_subject, reminder_body,
        checkout_enabled, checkout_subject, checkout_body
      ) VALUES (
        1, false, 'resend',
        'reservas@maransuites.com', 'Maran Suites & Towers',
        true, 'Confirmación de tu reserva — Maran Suites & Towers',
        'Hola {nombre_huesped},\n\nTu reserva ha sido confirmada. Te esperamos el {fecha_checkin} en la habitación {numero_habitacion}.\n\nCheck-in: {fecha_checkin}\nCheck-out: {fecha_checkout}\n\n¡Nos vemos pronto!\nMaran Suites & Towers',
        true, 'Recordatorio de tu llegada — Maran Suites & Towers',
        'Hola {nombre_huesped}, te recordamos que tu check-in es mañana {fecha_checkin}. ¡Te esperamos!',
        true, 'Gracias por tu estadía — Maran Suites & Towers',
        'Hola {nombre_huesped},\n\nGracias por elegirnos. Esperamos que tu estadía haya sido excelente.\n\nNos gustaría conocer tu opinión: {link_encuesta}\n\n¡Hasta pronto!\nMaran Suites & Towers'
      )
      ON CONFLICT (id) DO NOTHING
    `);
  } catch (err) {
    console.error("Email config migration error (non-blocking):", err);
  }

  // Migrate: add master_folio_config to groups
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      ALTER TABLE groups
        ADD COLUMN IF NOT EXISTS master_folio_config TEXT DEFAULT 'accommodation'
    `);
  } catch (err) {
    console.error("groups master_folio_config migration error (non-blocking):", err);
  }

  await registerRoutes(httpServer, app);

  try {
    const { setupNightAuditScheduler } = await import("./night-audit");
    setupNightAuditScheduler();
    log("Night Audit scheduler iniciado");
  } catch (err: any) {
    console.error("Night audit scheduler error (non-blocking):", err.message);
  }

  try {
    const { setupBackupScheduler } = await import("./backup");
    setupBackupScheduler();
    log("Backup scheduler iniciado (03:00 ARG)");
  } catch (err: any) {
    console.error("Backup scheduler error (non-blocking):", err.message);
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (status >= 500) {
      logger.error("Unhandled API error", err, { method: req.method, path: req.path, status });
    }
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
