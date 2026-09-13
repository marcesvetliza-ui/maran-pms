import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  },
}));

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "user-1", username: "admin", role: "admin" };
    next();
  },
}));

const storage = {
  createNotification: vi.fn(async (data: any) => ({ id: "notif-1", ...data })),
  getRooms: vi.fn(async () => [{ id: "room-1", roomNumber: "101" }]),
  createHousekeepingTask: vi.fn(async () => ({ id: "task-1" })),
};
vi.mock("../db-storage", () => ({
  storage,
  getArgentinaToday: () => "2026-09-10",
}));

const { registerMaraRoutes, sendMaraStatusUpdate } = await import("../mara");
const { db } = await import("../db");

const originalChatbotSecret = process.env.CHATBOT_WEBHOOK_SECRET;
const originalFetch = global.fetch;

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerMaraRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function postChatbotWebhook(baseUrl: string, secret: string | undefined) {
  return fetch(`${baseUrl}/api/webhook/chatbot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Chatbot-Secret": secret } : {}),
    },
    body: JSON.stringify({ area: "housekeeping", roomNumber: "101", message: "Necesito toallas", guestName: "Juan", sessionId: "sess-1" }),
  });
}

describe("MARA entrante — POST /api/webhook/chatbot", () => {
  beforeEach(() => {
    resetAppEnvForTests();
    storage.createNotification.mockClear();
    storage.getRooms.mockClear();
    storage.createHousekeepingTask.mockClear();
    (db.select as any).mockClear();
    (db.insert as any).mockClear();
  });

  afterEach(() => {
    if (originalChatbotSecret === undefined) delete process.env.CHATBOT_WEBHOOK_SECRET;
    else process.env.CHATBOT_WEBHOOK_SECRET = originalChatbotSecret;
    resetAppEnvForTests();
  });

  it.each(["pilot", "development", "test"] as const)(
    "APP_ENV=%s responde 503 sin leer/generar el secreto ni escribir nada",
    async (appEnv) => {
      delete process.env.CHATBOT_WEBHOOK_SECRET; // fuerza el camino de auto-generación si no se bloquea antes
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });

      await withServer(async (baseUrl) => {
        const res = await postChatbotWebhook(baseUrl, "cualquier-secreto");
        expect(res.status).toBe(503);
      });

      // Ni siquiera se llegó a consultar/generar el secreto en system_settings
      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(storage.createNotification).not.toHaveBeenCalled();
      expect(storage.getRooms).not.toHaveBeenCalled();
      expect(storage.createHousekeepingTask).not.toHaveBeenCalled();
    },
  );

  it("APP_ENV=production preserva el comportamiento actual (secreto validado, notificación creada)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    process.env.CHATBOT_WEBHOOK_SECRET = "test-secret";

    await withServer(async (baseUrl) => {
      const unauthorized = await postChatbotWebhook(baseUrl, "secreto-incorrecto");
      expect(unauthorized.status).toBe(401);

      const ok = await postChatbotWebhook(baseUrl, "test-secret");
      expect(ok.status).toBe(200);
    });

    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    expect(storage.createHousekeepingTask).toHaveBeenCalledTimes(1);
  });
});

describe("MARA saliente — sendMaraStatusUpdate", () => {
  beforeEach(() => {
    resetAppEnvForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it.each(["pilot", "development", "test"] as const)(
    "APP_ENV=%s no invoca fetch ni filtra el nombre del huésped a la red",
    (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      sendMaraStatusUpdate({
        maraBaseUrl: "https://mara.example.test",
        maraSecret: "secret",
        sessionId: "sess-1",
        guestName: "Juan Pérez",
        status: "completado",
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("APP_ENV=production preserva el comportamiento actual (sí invoca fetch)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as any;

    sendMaraStatusUpdate({
      maraBaseUrl: "https://mara.example.test",
      maraSecret: "secret",
      sessionId: "sess-1",
      guestName: "Juan Pérez",
      status: "completado",
    });

    // fire-and-forget: esperar el próximo microtask a que se dispare el fetch
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://mara.example.test/api/send-message");
    expect(JSON.parse((init as any).body).message).toContain("Juan Pérez");
  });

  it("no hace nada si falta configuración (sin fetch), independientemente del ambiente", () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    sendMaraStatusUpdate({
      maraBaseUrl: undefined,
      maraSecret: "secret",
      sessionId: "sess-1",
      guestName: "Juan",
      status: "completado",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
