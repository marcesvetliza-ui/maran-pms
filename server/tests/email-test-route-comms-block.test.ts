import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const state = vi.hoisted(() => ({
  emailConfigRow: null as any,
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(state.emailConfigRow ? [state.emailConfigRow] : [])),
      })),
    })),
  },
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../email-service", () => ({ runReminderScheduler: vi.fn() }));

const nodemailerState = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: nodemailerState.sendMail })) },
}));

const { registerEmailRoutes } = await import("../routes/emails");
const nodemailer = (await import("nodemailer")).default;

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerEmailRoutes(app);
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

async function callTestEmail(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/email/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: "destinatario@example.com" }),
  });
  return { status: res.status, body: await res.json() };
}

describe("POST /api/email/test — bloqueo por ambiente antes de SMTP/Resend", () => {
  beforeEach(() => {
    resetAppEnvForTests();
    state.emailConfigRow = {
      fromName: "Maran",
      fromEmail: "reservas@example-piloto.test",
      provider: "smtp",
      smtpHost: "smtp.example.test",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "user",
      smtpPass: "pass",
    };
    nodemailerState.sendMail.mockClear();
    (nodemailer.createTransport as any).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it.each(["pilot", "development", "test"] as const)(
    "APP_ENV=%s responde 503 y no invoca SMTP",
    async (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });

      await withServer(async (baseUrl) => {
        const { status, body } = await callTestEmail(baseUrl);
        expect(status).toBe(503);
        expect(body.error).toMatch(/bloqueado/i);
      });

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    },
  );

  it("APP_ENV=production preserva el comportamiento actual (sí invoca SMTP)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });

    await withServer(async (baseUrl) => {
      const { status, body } = await callTestEmail(baseUrl);
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
    });

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailerState.sendMail).toHaveBeenCalledTimes(1);
  });
});
