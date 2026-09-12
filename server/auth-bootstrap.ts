import { randomUUID, createHash, timingSafeEqual } from "crypto";
import type { Express } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { systemUsers } from "@shared/schema";
import { hashPassword } from "./auth";
import { logger } from "./logger";
import { isPilotEnv, isProductionDataEnv } from "./app-env";

/**
 * Reemplaza el bootstrap anterior de `POST /api/auth/setup`, que fijaba una
 * contraseña de admin hardcodeada en el código.
 *
 * - Ya no hay ninguna contraseña fija en el código: quien hace el bootstrap
 *   debe proveer tanto el secreto de bootstrap (`ADMIN_BOOTSTRAP_SECRET`,
 *   configurado por variable de entorno, nunca en código) como la
 *   contraseña real que va a tener el admin.
 * - Habilitación explícita, no por exclusión: veto absoluto si
 *   `NODE_ENV === "production"` o si `isProductionDataEnv()`/`isPilotEnv()`
 *   (Fase 2) indican un ambiente de datos reales — este último por ser el
 *   que se expone a un tercero externo; el bootstrap de sus cuentas se hace
 *   vía `seedDatabase()` (Fase 7). Fuera de esos vetos, además hace falta
 *   `ADMIN_BOOTSTRAP_ENABLED=true` configurado aparte: un NODE_ENV vacío,
 *   mal escrito o inesperado (staging, preview, etc.) no deja el endpoint
 *   habilitado por accidente.
 * - ADMIN_BOOTSTRAP_SECRET también debe tener una longitud mínima razonable;
 *   si no está configurada o es demasiado corta, se trata como "bootstrap no
 *   configurado" (503), no como "secreto inválido".
 * - Serializado dentro de una transacción con un advisory lock (mismo patrón
 *   que ya usa el resto del código para evitar carreras — ver
 *   server/db-storage.ts, server/billing/routes.ts): dos solicitudes
 *   concurrentes ya no pueden pasar ambas la verificación de "un solo uso"
 *   antes de que la primera escriba.
 * - Sigue siendo de un solo uso: se niega si ya existe algún usuario con
 *   contraseña seteada (igual que antes).
 * - Nunca loguea ni devuelve el secreto ni la contraseña. Los errores
 *   internos se registran sin detalle en el logger del servidor, pero la
 *   respuesta al cliente es siempre un mensaje fijo — nunca el error crudo
 *   de la base de datos.
 */

const MIN_SECRET_LENGTH = 20;
const MIN_PASSWORD_LENGTH = 8;

function isBootstrapEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (isProductionDataEnv() || isPilotEnv()) return false;
  return process.env.ADMIN_BOOTSTRAP_ENABLED === "true";
}

function safeEqual(a: string, b: string): boolean {
  const bufA = createHash("sha256").update(a).digest();
  const bufB = createHash("sha256").update(b).digest();
  return timingSafeEqual(bufA, bufB);
}

export function registerAuthBootstrapRoute(app: Express): void {
  app.post("/api/auth/setup", async (req, res) => {
    if (!isBootstrapEnabled()) {
      return res.status(404).json({ message: "Not found" });
    }

    const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!configuredSecret || configuredSecret.length < MIN_SECRET_LENGTH) {
      return res.status(503).json({ message: "Bootstrap no configurado" });
    }

    const providedSecret = typeof req.body?.bootstrapSecret === "string" ? req.body.bootstrapSecret : "";
    if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
      return res.status(401).json({ message: "Secreto de bootstrap inválido" });
    }

    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `newPassword debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
    }

    try {
      // Hashear antes de entrar a la transacción: bcrypt es intencionalmente
      // lento, y no hace falta tener la transacción/el advisory lock
      // abiertos mientras corre.
      const hashedPassword = await hashPassword(newPassword);

      const bootstrapped = await db.transaction(async (tx) => {
        // Advisory lock con alcance de transacción: serializa cualquier
        // solicitud de bootstrap concurrente. Se libera solo al terminar la
        // transacción (commit o rollback), así que la verificación de abajo
        // y la escritura quedan atómicas entre sí para todas las
        // solicitudes que compitan.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('admin-bootstrap'))`);

        const allUsers = await tx.select().from(systemUsers);
        const anyUserWithPassword = allUsers.some((u) => u.password !== null);
        if (anyUserWithPassword) {
          return false;
        }

        const adminUser = allUsers.find((u) => u.username === "admin");
        if (adminUser) {
          await tx
            .update(systemUsers)
            .set({ password: hashedPassword })
            .where(and(eq(systemUsers.id, adminUser.id), isNull(systemUsers.password)));
        } else {
          await tx.insert(systemUsers).values({
            id: randomUUID(),
            username: "admin",
            password: hashedPassword,
            email: "admin@maransuites.com",
            fullName: "Administrador Sistema",
            role: "admin",
            department: "Sistemas",
            phone: "+54 343 400-0001",
            isActive: "true",
            createdAt: new Date(),
          });
        }
        return true;
      });

      if (!bootstrapped) {
        return res.status(400).json({ message: "Setup ya fue completado. Este endpoint está deshabilitado." });
      }

      res.json({ message: "Usuario admin configurado" });
    } catch {
      // Deliberadamente no se loguea el error crudo: un fallo acá viene de
      // la escritura sobre systemUsers, y su mensaje/stack podría incluir
      // texto de la consulta, nombres de columnas/constraints o el hash
      // recién calculado. Se registra solo un evento fijo, sin detalle.
      logger.error("Error en bootstrap de administrador — ver logs de la base para diagnóstico manual si hace falta");
      res.status(500).json({ message: "Error interno al configurar el administrador" });
    }
  });
}
