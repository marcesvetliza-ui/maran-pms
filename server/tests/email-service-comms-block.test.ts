import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const state = vi.hoisted(() => ({
  emailConfigRow: null as any,
  insertedLogs: [] as any[],
}));

// email-service.ts lee la configuración de email desde la tabla emailConfig
// vía Drizzle. No hay una base real en este entorno de test, así que se
// mockea el chain select().from().where() y insert().values() usado por
// getConfig()/logEmail(). El valor de emailConfigRow se ajusta por test.
vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(state.emailConfigRow ? [state.emailConfigRow] : [])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => {
        state.insertedLogs.push(row);
        return Promise.resolve();
      }),
    })),
  },
}));

const nodemailerState = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({})) }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: nodemailerState.sendMail })),
  },
}));

const { sendEmail, sendEmailWithPdfAttachment } = await import("../email-service");
const nodemailer = (await import("nodemailer")).default;

const originalFetch = global.fetch;

function smtpConfig(overrides: Record<string, unknown> = {}) {
  return {
    globalEnabled: true,
    provider: "smtp",
    fromName: "Maran",
    fromEmail: "reservas@example-piloto.test",
    smtpHost: "smtp.example.test",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "user",
    smtpPass: "pass",
    ...overrides,
  };
}

function resendConfig(overrides: Record<string, unknown> = {}) {
  return {
    globalEnabled: true,
    provider: "resend",
    fromName: "Maran",
    fromEmail: "reservas@example-piloto.test",
    apiKey: "re_test_key",
    ...overrides,
  };
}

describe("email-service — bloqueo por ambiente antes de SMTP/Resend", () => {
  beforeEach(() => {
    resetAppEnvForTests();
    state.emailConfigRow = smtpConfig();
    state.insertedLogs = [];
    nodemailerState.sendMail.mockClear();
    (nodemailer.createTransport as any).mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it.each(["pilot", "development", "test"] as const)(
    "sendEmail: APP_ENV=%s no invoca SMTP y registra el bloqueo en email_logs",
    async (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      await sendEmail({
        reservationId: "res-1",
        type: "confirmation",
        to: "huesped@example.com",
        subject: "Confirmación",
        body: "Hola",
      });

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(state.insertedLogs).toHaveLength(1);
      expect(state.insertedLogs[0]).toMatchObject({ status: "skipped", type: "confirmation" });
    },
  );

  it("sendEmail: APP_ENV=production preserva el comportamiento actual (sí invoca SMTP)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });

    await sendEmail({
      reservationId: "res-1",
      type: "confirmation",
      to: "huesped@example.com",
      subject: "Confirmación",
      body: "Hola",
    });

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailerState.sendMail).toHaveBeenCalledTimes(1);
    expect(state.insertedLogs.at(-1)).toMatchObject({ status: "sent" });
  });

  it.each(["pilot", "development", "test"] as const)(
    "sendEmailWithPdfAttachment: APP_ENV=%s no invoca Resend",
    async (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });
      state.emailConfigRow = resendConfig();
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      const result = await sendEmailWithPdfAttachment({
        to: "huesped@example.com",
        subject: "Comprobante",
        body: "Adjunto",
        attachmentFilename: "comprobante.pdf",
        attachmentBuffer: Buffer.from("pdf"),
      });

      expect(result.ok).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    },
  );

  it("sendEmailWithPdfAttachment: APP_ENV=production preserva el comportamiento actual (sí invoca Resend)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    state.emailConfigRow = resendConfig();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as any;

    const result = await sendEmailWithPdfAttachment({
      to: "huesped@example.com",
      subject: "Comprobante",
      body: "Adjunto",
      attachmentFilename: "comprobante.pdf",
      attachmentBuffer: Buffer.from("pdf"),
    });

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
