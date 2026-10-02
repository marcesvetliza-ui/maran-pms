import type { Express } from "express";
import { billingConfig } from "@shared/schema";
import { db } from "../db";
import { requireAuth, requireRole } from "../auth";
import { diagnoseArcaCredentials } from "./credentialDiagnostic";

export function registerArcaCredentialDiagnosticRoutes(app: Express) {
  app.get("/api/billing/credential-diagnostic",
    (_req, res, next) => {
      res.setHeader("Cache-Control", "private, no-store");
      next();
    },
    requireAuth, requireRole(["admin"]),
    async (_req, res) => {
      try {
        // Read only the inputs needed. In particular, never load ticket fields.
        // Do not use getBillingConfig(): it inserts defaults if no row exists.
        const [config] = await db.select({
          arcaCert: billingConfig.arcaCert,
          arcaKey: billingConfig.arcaKey,
          arcaAmbiente: billingConfig.arcaAmbiente,
          puntoVenta: billingConfig.puntoVenta,
          puntoVentaHomolog: billingConfig.puntoVentaHomolog,
        }).from(billingConfig).limit(1);
        res.json(diagnoseArcaCredentials(config));
      } catch {
        // Neither API responses nor logs should contain parser/DB exceptions.
        res.status(500).json({ error: "No se pudo completar la comprobación interna de credenciales." });
      }
    },
  );
}