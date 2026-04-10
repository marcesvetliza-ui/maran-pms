import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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

  // Migrate: add SMTP columns to email_config if they don't exist
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      ALTER TABLE email_config
        ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT 'smtp.gmail.com',
        ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587,
        ADD COLUMN IF NOT EXISTS smtp_user TEXT,
        ADD COLUMN IF NOT EXISTS smtp_pass TEXT,
        ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT false
    `);
  } catch (err) {
    console.error("SMTP columns migration error (non-blocking):", err);
  }

  await registerRoutes(httpServer, app);

  try {
    const { setupNightAuditScheduler } = await import("./night-audit");
    setupNightAuditScheduler();
    log("Night Audit scheduler iniciado");
  } catch (err: any) {
    console.error("Night audit scheduler error (non-blocking):", err.message);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
