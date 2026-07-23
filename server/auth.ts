import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db, pool } from "./db";
import { systemUsers, failedLoginAttempts } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";

const SALT_ROUNDS = 10;
const TEMP_LOCK_THRESHOLD  = 5;   // intentos → bloqueo 1 hora
const PERM_LOCK_THRESHOLD  = 8;   // intentos → bloqueo permanente
const TEMP_LOCK_MINUTES    = 60;  // duración del bloqueo temporal

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string;
      fullName: string;
      role: string;
      department: string | null;
      phone: string | null;
      isActive: string | null;
    }
  }
}

async function recordLoginAttempt(
  username: string,
  ip: string,
  userAgent: string,
  sessionId: string,
  status: string,
  detail: string
) {
  try {
    await db.insert(failedLoginAttempts).values({
      id: randomUUID(),
      username,
      ipAddress: ip,
      userAgent,
      sessionId,
      status,
      detail,
    } as any);
  } catch (e) {
    console.error("[security] Error registrando intento:", e);
  }
}

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: false,
        ttl: 8 * 60 * 60, // 8 horas en el store (segundos)
      }),
      secret: (() => {
        if (!process.env.SESSION_SECRET) {
          if (process.env.NODE_ENV === "production") {
            throw new Error("SESSION_SECRET es obligatorio en producción");
          }
          console.warn("⚠️  SESSION_SECRET no definido — usando clave de desarrollo. NO usar en producción.");
        }
        return process.env.SESSION_SECRET || "dev-only-maran-secret-do-not-use-in-prod";
      })(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        // Sin maxAge → cookie de sesión → se borra al cerrar el navegador
        // El TTL de 8h se aplica solo en el store del servidor
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({ passReqToCallback: true } as any, async (req: any, username: string, password: string, done: any) => {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
                 || req.ip
                 || req.socket?.remoteAddress
                 || "unknown";
      const userAgent = (req.headers["user-agent"] as string) || "unknown";
      const sessionId = req.session?.id || "no-session";

      try {
        const [user] = await db.select().from(systemUsers).where(eq(systemUsers.username, username));

        if (!user) {
          await recordLoginAttempt(username, ip, userAgent, sessionId, "FAILED", "Usuario inexistente");
          return done(null, false, { message: "Credenciales incorrectas" });
        }

        // ── Bloqueo permanente ───────────────────────────────────────────
        if (user.lockPermanent === "true") {
          await recordLoginAttempt(username, ip, userAgent, sessionId, "BLOCKED", "Cuenta bloqueada permanentemente");
          return done(null, false, { message: "Cuenta bloqueada permanentemente. Contacte al administrador." });
        }

        // ── Bloqueo temporal (verifica expiración) ───────────────────────
        if (user.lockedAt) {
          const lockExpiry = new Date(user.lockedAt.getTime() + TEMP_LOCK_MINUTES * 60 * 1000);
          if (new Date() < lockExpiry) {
            const minutesLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
            await recordLoginAttempt(username, ip, userAgent, sessionId, "BLOCKED", `Cuenta bloqueada (${minutesLeft} min restantes)`);
            return done(null, false, { message: `Cuenta bloqueada. Intentá en ${minutesLeft} minutos.` });
          }
          // Bloqueo temporal expiró → limpia
          await db.update(systemUsers)
            .set({ lockedAt: null, lockReason: null, failedLoginCount: 0 })
            .where(eq(systemUsers.id, user.id));
        }

        if (user.isActive !== "true") {
          await recordLoginAttempt(username, ip, userAgent, sessionId, "FAILED", "Usuario desactivado");
          return done(null, false, { message: "Usuario desactivado" });
        }

        if (!user.password) {
          return done(null, false, { message: "Usuario sin contraseña configurada" });
        }

        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
          const currentCount = (user.failedLoginCount || 0) + 1;
          await recordLoginAttempt(username, ip, userAgent, sessionId, "FAILED", "Contraseña incorrecta");

          if (currentCount >= PERM_LOCK_THRESHOLD) {
            // Bloqueo permanente
            await db.update(systemUsers).set({
              failedLoginCount: currentCount,
              lockedAt: new Date(),
              lockPermanent: "true",
              lockReason: `Bloqueado permanentemente tras ${currentCount} intentos fallidos desde IP ${ip}`,
            }).where(eq(systemUsers.id, user.id));
            console.error(`[SECURITY] 🔴 Cuenta BLOQUEADA PERMANENTEMENTE: ${username} — IP: ${ip} — UA: ${userAgent.slice(0, 80)}`);
            // Registro en audit_logs para que el admin lo vea
            try {
              await db.execute(
                (await import("drizzle-orm")).sql`
                  INSERT INTO audit_logs (id, user_id, action, resource, detail, created_at)
                  VALUES (gen_random_uuid(), null, 'security_permanent_lock', 'auth',
                    ${"CUENTA BLOQUEADA PERMANENTEMENTE: " + username + " — IP: " + ip}, now())
                `
              );
            } catch {}
            return done(null, false, { message: "Cuenta bloqueada permanentemente por múltiples intentos fallidos. Contacte al administrador." });

          } else if (currentCount >= TEMP_LOCK_THRESHOLD) {
            // Bloqueo temporal (1 hora)
            await db.update(systemUsers).set({
              failedLoginCount: currentCount,
              lockedAt: new Date(),
              lockPermanent: "false",
              lockReason: `Bloqueado ${TEMP_LOCK_MINUTES} min tras ${currentCount} intentos fallidos desde IP ${ip}`,
            }).where(eq(systemUsers.id, user.id));
            console.warn(`[SECURITY] 🟡 Cuenta bloqueada 1h: ${username} — IP: ${ip}`);
            return done(null, false, { message: `Cuenta bloqueada por ${TEMP_LOCK_MINUTES} minutos tras múltiples intentos fallidos.` });

          } else {
            // Solo incrementa contador
            await db.update(systemUsers).set({ failedLoginCount: currentCount }).where(eq(systemUsers.id, user.id));
            const remaining = TEMP_LOCK_THRESHOLD - currentCount;
            console.warn(`[SECURITY] ⚠️  Intento fallido ${currentCount}/${TEMP_LOCK_THRESHOLD}: ${username} — IP: ${ip}`);
            return done(null, false, { message: `Contraseña incorrecta. ${remaining} intento${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""} antes del bloqueo.` });
          }
        }

        // ── Login exitoso ───────────────────────────────────────────────
        await db.update(systemUsers).set({
          lastLogin: new Date(),
          failedLoginCount: 0,
          lockedAt: null,
          lockReason: null,
        }).where(eq(systemUsers.id, user.id));

        return done(null, {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          department: user.department,
          phone: user.phone,
          isActive: user.isActive,
        });
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, id));

      if (!user) return done(null, false);

      // Si la cuenta fue bloqueada permanentemente, invalida la sesión activa
      if (user.lockPermanent === "true") return done(null, false);

      done(null, {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        department: user.department,
        phone: user.phone,
        isActive: user.isActive,
      });
    } catch (err) {
      done(err);
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "No autenticado" });
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "No autenticado" });
    }
    const userRole = (req.user as Express.User).role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ message: "No autorizado para esta acción" });
    }
    next();
  };
}
