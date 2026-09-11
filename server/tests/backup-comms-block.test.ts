import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const state = vi.hoisted(() => ({
  emailConfigRow: null as any,
  insertedLogs: [] as any[],
}));

// backup.ts lee la configuración SMTP y, en el camino permitido, recorre
// todas las tablas (information_schema + SELECT *) para armar el dump SQL.
// Mockeamos select/execute/insert lo suficiente para que sendBackupByEmail
// pueda ejecutarse sin una base real; lo que importa es demostrar que, en
// ambientes bloqueados, ni siquiera se llega a leer la configuración SMTP.
vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(state.emailConfigRow ? [state.emailConfigRow] : [])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => {
        state.insertedLogs.push(row);
        return Promise.resolve();
      }),
    })),
    execute: vi.fn(async () => ({ rows: [] })),
  },
}));

const nodemailerState = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: nodemailerState.sendMail })) },
}));

const { sendBackupByEmail } = await import("../backup");
const nodemailer = (await import("nodemailer")).default;
const { db } = await import("../db");

describe("backup.ts — bloqueo por ambiente antes de leer config SMTP o generar el dump", () => {
  beforeEach(() => {
    resetAppEnvForTests();
    state.emailConfigRow = {
      smtpHost: "smtp.example.test",
      smtpUser: "user",
      smtpPass: "pass",
      smtpPort: 587,
      smtpSecure: false,
      fromName: "Maran",
      fromEmail: "backup@example-piloto.test",
    };
    state.insertedLogs = [];
    nodemailerState.sendMail.mockClear();
    (nodemailer.createTransport as any).mockClear();
    (db.select as any).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it.each(["pilot", "development", "test"] as const)(
    "APP_ENV=%s bloquea antes de leer emailConfig y sin invocar SMTP",
    async (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });

      await expect(sendBackupByEmail("destino@example.com", "scheduled")).rejects.toThrow(/bloqueado/i);

      expect(db.select).not.toHaveBeenCalled();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(state.insertedLogs).toHaveLength(1);
      expect(state.insertedLogs[0]).toMatchObject({ status: "error" });
    },
  );

  it("APP_ENV=production preserva el comportamiento actual (sí llega a SMTP)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });

    await sendBackupByEmail("destino@example.com", "manual_email");

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailerState.sendMail).toHaveBeenCalledTimes(1);
  });
});
