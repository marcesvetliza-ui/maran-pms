/**
 * Integración con el chatbot externo "MARA" — entrante (webhook que recibe
 * mensajes del bot) y saliente (confirmación de estado enviada al bot).
 *
 * Extraído de server/routes.ts a un módulo propio para poder testear estos
 * dos handlers de forma aislada, sin tener que registrar el archivo
 * `registerRoutes` completo (con su enorme grafo de dependencias) en un
 * test. La lógica es exactamente la misma que estaba inline — este archivo
 * no cambia ningún comportamiento salvo el orden ya corregido del bloqueo
 * por ambiente en el webhook entrante (ver `registerMaraRoutes`).
 */
import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { db } from "./db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./auth";
import { storage, getArgentinaToday } from "./db-storage";
import { shouldBlockExternalComm } from "./external-comms-policy";

// ─────────────────────────────────────────────────────────────────────────────
// Webhook entrante — POST /api/webhook/chatbot
// ─────────────────────────────────────────────────────────────────────────────

/** Helper: get or auto-generate the chatbot webhook secret */
export async function getChatbotWebhookSecret(): Promise<string> {
  try {
    // 1. Prefer env var if set
    const envSecret = process.env.CHATBOT_WEBHOOK_SECRET;
    if (envSecret && envSecret.trim()) return envSecret.trim();
    // 2. Try DB
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, "chatbot_webhook_secret"));
    if (row?.value) return row.value;
    // 3. Auto-generate and persist
    const generated = randomUUID();
    await db.insert(systemSettings).values({
      id: randomUUID(),
      key: "chatbot_webhook_secret",
      value: generated,
      category: "integrations",
      description: "Auto-generated MARA webhook secret",
      updatedAt: new Date(),
      updatedBy: null,
    } as any);
    console.log("[webhook/chatbot] Secreto auto-generado y guardado en DB:", generated.slice(-4));
    return generated;
  } catch (err) {
    console.error("[webhook/chatbot] Error en getChatbotWebhookSecret:", err);
    return "";
  }
}

export function registerMaraRoutes(app: Express): void {
  // Deliberadamente NO gateado por shouldBlockExternalComm: no es el webhook
  // entrante (no lo llama un tercero externo), no hace ninguna comunicación
  // de red, y ya exige sesión de admin. Su efecto es local — leer o
  // autogenerar el secreto propio de ESTE ambiente en system_settings — y
  // es exactamente lo que un admin necesita para configurar el secreto del
  // piloto (que debe ser distinto del de producción, ver
  // docs/pilot-environment-plan.md). Bloquearlo dificultaría la
  // configuración del piloto sin ganancia de seguridad real.
  app.get("/api/webhook/chatbot/secret", requireAuth, async (req, res) => {
    if ((req.user as any)?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    const secret = await getChatbotWebhookSecret();
    res.json({ secret });
  });

  app.post("/api/webhook/chatbot", async (req: Request, res: Response) => {
    try {
      // Bloqueo por ambiente PRIMERO — antes de leer/generar el secreto
      // (getChatbotWebhookSecret puede escribir en system_settings), antes
      // de validar el secreto recibido y antes de tocar el body. En
      // pilot/development/test no debe haber ningún efecto lateral, ni
      // siquiera una escritura de auto-generación de secreto.
      if (shouldBlockExternalComm({ integration: "mara-inbound", action: "process-notification" })) {
        return res.status(503).json({ error: "Webhook deshabilitado en este ambiente (piloto/desarrollo/test)." });
      }

      const secret = req.headers["x-chatbot-secret"] as string;
      const expectedSecret = await getChatbotWebhookSecret();
      if (!secret || secret !== expectedSecret) {
        const receivedHint = secret ? `"...${secret.slice(-4)}" (${secret.length} chars)` : "ninguno";
        const expectedHint = `"...${expectedSecret.slice(-4)}" (${expectedSecret.length} chars)`;
        console.warn(`[webhook/chatbot] 401 — recibido: ${receivedHint} | esperado: ${expectedHint}`);
        return res.status(401).json({ error: "Invalid or missing webhook secret" });
      }

      const { eventType, priority, guestName, roomNumber, reservationId, message, timestamp, sessionId } = req.body;
      let { area } = req.body;

      const validAreas = ["housekeeping", "maintenance", "restaurant", "spa", "reception", "all"];
      const validPriorities = ["normal", "high", "urgent"];

      if (!message) {
        return res.status(400).json({ error: "message is required" });
      }
      if (!area || !validAreas.includes(area)) {
        area = "all";
      }
      if (priority && !validPriorities.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` });
      }

      const areaLabels: Record<string, string> = {
        housekeeping: "Housekeeping",
        maintenance: "Mantenimiento",
        restaurant: "Restaurante",
        spa: "SPA",
        reception: "Recepción",
        all: "General",
      };

      const typeMap: Record<string, string> = {
        housekeeping: "chatbot_housekeeping",
        maintenance: "chatbot_maintenance",
        restaurant: "chatbot_restaurant",
        spa: "chatbot_spa",
        reception: "chatbot_request",
        all: "chatbot_request",
      };

      const notification = await storage.createNotification({
        type: (typeMap[area] || "chatbot_request") as any,
        title: `Solicitud de ${guestName || "Huésped"} - Hab. ${roomNumber || "N/A"}`,
        message,
        targetArea: area,
        relatedEntityType: reservationId ? "reservation" : "room",
        relatedEntityId: reservationId ? String(reservationId) : roomNumber,
        priority: priority || "normal",
        sessionId: sessionId || null,
        guestName: guestName || null,
      } as any);

      if (area === "housekeeping" && roomNumber) {
        const rooms = await storage.getRooms();
        const room = rooms.find((r) => r.roomNumber === roomNumber);
        if (room) {
          try {
            await storage.createHousekeepingTask({
              roomId: room.id,
              taskType: "guest_request",
              status: "pending",
              priority: priority === "urgent" ? "urgent" : "normal",
              notes: `Chatbot: ${message} (${guestName || "Huésped"})`,
              scheduledDate: getArgentinaToday(),
              createdAt: new Date(),
            });
          } catch {}
        }
      }

      res.json({ success: true, notificationId: notification.id });
    } catch (error) {
      res.status(500).json({ error: "Error processing webhook" });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmación saliente hacia MARA — usada desde
// PATCH /api/notifications/:id/status
// ─────────────────────────────────────────────────────────────────────────────

const MARA_STATUS_MESSAGES: Record<string, (guestName: string) => string> = {
  en_proceso: (guestName) =>
    `¡Hola ${guestName}! 👋 Tu solicitud fue recibida por nuestro equipo y ya está siendo atendida. Te avisamos en cuanto esté lista.`,
  completado: (guestName) =>
    `¡Hola ${guestName}! ✅ Tu solicitud fue completada. Si necesitás algo más, escribinos cuando quieras.`,
  rechazado: (guestName) =>
    `Hola ${guestName}, lamentablemente no podemos atender tu solicitud en este momento. Por favor acercate a recepción y con gusto te ayudamos. 🙏`,
};

export interface MaraStatusUpdateInput {
  maraBaseUrl: string | undefined;
  maraSecret: string | undefined;
  sessionId: string | undefined;
  guestName: string;
  status: string;
}

/**
 * Envía (fire-and-forget, igual que el comportamiento original) la
 * confirmación de estado a MARA. No hace nada si falta configuración, si no
 * hay sessionId, si el status no tiene mensaje mapeado, o si el ambiente
 * bloquea comunicaciones externas — chequeado ANTES de construir el mensaje
 * (que incluye el nombre del huésped) y antes de cualquier fetch.
 */
export function sendMaraStatusUpdate(input: MaraStatusUpdateInput): void {
  if (!input.maraBaseUrl || !input.maraSecret || !input.sessionId) return;
  if (shouldBlockExternalComm({ integration: "mara-outbound", action: "status-update" })) return;

  const buildMessage = MARA_STATUS_MESSAGES[input.status];
  if (!buildMessage) return;
  const message = buildMessage(input.guestName);

  fetch(`${input.maraBaseUrl}/api/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Chatbot-Secret": input.maraSecret },
    body: JSON.stringify({ sessionId: input.sessionId, message }),
  }).catch((err) => console.error("[MARA] Error sending confirmation:", err));
}
