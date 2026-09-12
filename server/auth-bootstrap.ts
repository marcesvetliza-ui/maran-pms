import { randomUUID, createHash, timingSafeEqual } from "crypto";
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { systemUsers } from "@shared/schema";
import { hashPassword } from "./auth";
import { isPilotEnv, isProductionDataEnv } from "./app-env";

/**
 * Fase 9 del ambiente piloto — reemplaza el bootstrap anterior de
 * `POST /api/auth/setup`, que fijaba una contraseña de admin hardcodeada
 * ("maran2026") y se gateaba comparando `NODE_ENV` directamente (hallazgo
 * de la auditoría Fase 8).
 *
 * Cambios:
 * - Ya no hay ninguna contraseña fija en el código: quien hace el bootstrap
 *   debe proveer tanto el secreto de bootstrap (`ADMIN_BOOTSTRAP_SECRET`,
 *   configurado por variable de entorno, nunca en código) como la
 *   contraseña real que va a tener el admin.
 * - Gateado por `isProductionDataEnv()`/`isPilotEnv()` (Fase 2), no por
 *   `NODE_ENV` — deshabilitado explícitamente tanto en producción como en
 *   el ambiente piloto (este último por ser el que se expone a un tercero
 *   externo; el bootstrap de sus cuentas se hace vía `seedDatabase()`,
 *   Fase 7). Solo queda disponible en development/test.
 * - Sigue siendo de un solo uso: se niega si ya existe algún usuario con
 *   contraseña seteada (igual que antes).
 * - Nunca loguea ni devuelve el secreto ni la contraseña en la respuesta.
 */

function isBootstrapEnabled(): boolean {
  return !isProductionDataEnv() && !isPilotEnv();
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
    if (!configuredSecret) {
      return res.status(503).json({ message: "Bootstrap no configurado" });
    }

    const providedSecret = typeof req.body?.bootstrapSecret === "string" ? req.body.bootstrapSecret : "";
    if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
      return res.status(401).json({ message: "Secreto de bootstrap inválido" });
    }

    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "newPassword debe tener al menos 8 caracteres" });
    }

    try {
      const allUsers = await db.select().from(systemUsers);
      const anyUserWithPassword = allUsers.some((u) => u.password !== null);
      if (anyUserWithPassword) {
        return res.status(400).json({ message: "Setup ya fue completado. Este endpoint está deshabilitado." });
      }

      const hashedPassword = await hashPassword(newPassword);

      const adminUser = allUsers.find((u) => u.username === "admin");
      if (adminUser) {
        await db
          .update(systemUsers)
          .set({ password: hashedPassword })
          .where(eq(systemUsers.id, adminUser.id));
      } else {
        await db.insert(systemUsers).values({
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

      res.json({ message: "Usuario admin configurado" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
