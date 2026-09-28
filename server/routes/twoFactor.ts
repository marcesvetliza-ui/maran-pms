import type { Express } from "express";
import { db } from "../db";
import { systemUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth, verifyPassword } from "../auth";
import { audit } from "../audit";
import {
  createTotpEnrollment,
  verifyTotpToken,
  generateBackupCodes,
  consumeBackupCode,
} from "../totp";

/**
 * Rutas de verificación en dos pasos (TOTP), self-service para el usuario
 * autenticado — no impone 2FA a nadie, cada quien la activa desde "Seguridad".
 */
export function registerTwoFactorRoutes(app: Express) {
  app.get("/api/auth/2fa/status", requireAuth, async (req, res) => {
    const userId = (req.user as Express.User).id;
    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, userId));
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ enabled: user.totpEnabled === "true" });
  });

  app.post("/api/auth/2fa/setup", requireAuth, async (req, res) => {
    const user = req.user as Express.User;
    try {
      const enrollment = await createTotpEnrollment(user.username);
      // Se guarda temporalmente en la sesión — recién se persiste en la base
      // si el usuario confirma con un código válido (si abandona, no queda nada).
      req.session.pendingTotpSecret = enrollment.secretEncrypted;
      res.json({ qrCodeDataUrl: enrollment.qrCodeDataUrl, secret: enrollment.secret });
    } catch (error: any) {
      console.error("[2fa] Error generando enrolamiento:", error);
      res.status(500).json({ error: error?.message || "No se pudo iniciar la configuración de 2FA" });
    }
  });

  app.post("/api/auth/2fa/confirm", requireAuth, async (req, res) => {
    const user = req.user as Express.User;
    const { token } = req.body || {};
    const pendingSecret = req.session.pendingTotpSecret;

    if (!pendingSecret) {
      return res.status(400).json({ message: "No hay una configuración de 2FA pendiente. Volvé a empezar." });
    }
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Ingresá el código de 6 dígitos" });
    }

    try {
      const valid = await verifyTotpToken(pendingSecret, token);
      if (!valid) {
        return res.status(400).json({ message: "Código incorrecto. Verificá la hora del dispositivo e intentá de nuevo." });
      }

      const backupCodes = await generateBackupCodes();
      await db.update(systemUsers).set({
        totpEnabled: "true",
        totpSecretEncrypted: pendingSecret,
        totpBackupCodes: backupCodes.hashesJson,
      }).where(eq(systemUsers.id, user.id));

      delete req.session.pendingTotpSecret;
      await audit(req, "update", "auth", `Verificación en dos pasos activada: ${user.username}`);

      res.json({ backupCodes: backupCodes.plaintext });
    } catch (error: any) {
      console.error("[2fa] Error confirmando enrolamiento:", error);
      res.status(500).json({ error: error?.message || "No se pudo activar la verificación en dos pasos" });
    }
  });

  app.post("/api/auth/2fa/disable", requireAuth, async (req, res) => {
    const user = req.user as Express.User;
    const { password } = req.body || {};

    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Ingresá tu contraseña para desactivar la verificación en dos pasos" });
    }

    try {
      const [dbUser] = await db.select().from(systemUsers).where(eq(systemUsers.id, user.id));
      if (!dbUser || !dbUser.password || !(await verifyPassword(password, dbUser.password))) {
        return res.status(401).json({ message: "Contraseña incorrecta" });
      }

      await db.update(systemUsers).set({
        totpEnabled: "false",
        totpSecretEncrypted: null,
        totpBackupCodes: null,
      }).where(eq(systemUsers.id, user.id));

      await audit(req, "update", "auth", `Verificación en dos pasos desactivada: ${user.username}`);
      res.json({ message: "Verificación en dos pasos desactivada" });
    } catch (error: any) {
      console.error("[2fa] Error desactivando 2FA:", error);
      res.status(500).json({ error: error?.message || "No se pudo desactivar la verificación en dos pasos" });
    }
  });

  app.post("/api/auth/2fa/verify-login", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "No autenticado" });
    }
    const user = req.user as Express.User;
    const { token } = req.body || {};

    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Ingresá el código" });
    }

    try {
      const [dbUser] = await db.select().from(systemUsers).where(eq(systemUsers.id, user.id));
      if (!dbUser || dbUser.totpEnabled !== "true" || !dbUser.totpSecretEncrypted) {
        return res.status(400).json({ message: "La verificación en dos pasos no está activa para este usuario" });
      }

      const cleanToken = token.replace(/\s+/g, "");
      let ok = false;

      if (/^\d{6}$/.test(cleanToken)) {
        ok = await verifyTotpToken(dbUser.totpSecretEncrypted, cleanToken);
      } else {
        const consumed = await consumeBackupCode(dbUser.totpBackupCodes, cleanToken);
        if (consumed) {
          ok = true;
          await db.update(systemUsers)
            .set({ totpBackupCodes: consumed.remainingHashesJson })
            .where(eq(systemUsers.id, user.id));
        }
      }

      if (!ok) {
        return res.status(401).json({ message: "Código incorrecto" });
      }

      req.session.pending2FA = false;
      await audit(req, "login", "auth", `Inicio de sesión (2FA): ${user.username}`);
      res.json(user);
    } catch (error: any) {
      console.error("[2fa] Error verificando login:", error);
      res.status(500).json({ error: error?.message || "No se pudo verificar el código" });
    }
  });
}
