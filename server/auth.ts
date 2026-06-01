import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";
import { db } from "./db";
import { systemUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";

const SALT_ROUNDS = 10;

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

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        tableName: "sessions",
        createTableIfMissing: true,
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
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(systemUsers)
          .where(eq(systemUsers.username, username));

        if (!user) {
          return done(null, false, { message: "Usuario no encontrado" });
        }

        if (user.isActive !== "true") {
          return done(null, false, { message: "Usuario desactivado" });
        }

        if (!user.password) {
          return done(null, false, { message: "Usuario sin contraseña configurada" });
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Contraseña incorrecta" });
        }

        await db
          .update(systemUsers)
          .set({ lastLogin: new Date() })
          .where(eq(systemUsers.id, user.id));

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
      const [user] = await db
        .select()
        .from(systemUsers)
        .where(eq(systemUsers.id, id));

      if (!user) {
        return done(null, false);
      }

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
