import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as any[],
  executeError: null as Error | null,
}));

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => {
      if (state.executeError) throw state.executeError;
      return { rows: state.rows };
    }),
  },
}));

const {
  DATABASE_IDENTITY_ENVIRONMENTS,
  isValidDatabaseIdentityEnvironment,
  parseDatabaseIdentityRow,
  parseMarkDatabaseIdentityArgs,
  getDatabaseIdentity,
  warnIfDatabaseIdentityMissing,
} = await import("../database-identity");
const { logger } = await import("../logger");

describe("parseMarkDatabaseIdentityArgs — script/mark-database-identity.ts", () => {
  it("sin argumentos: todo por defecto (dry-run implícito)", () => {
    expect(parseMarkDatabaseIdentityArgs([])).toEqual({ confirm: false, force: false });
  });

  it("parsea --environment, --confirm, --force y --locked-by juntos", () => {
    expect(
      parseMarkDatabaseIdentityArgs(["--environment=pilot", "--confirm", "--force", "--locked-by=maria"]),
    ).toEqual({ environment: "pilot", confirm: true, force: true, lockedBy: "maria" });
  });

  it("ignora flags desconocidos sin lanzar", () => {
    expect(parseMarkDatabaseIdentityArgs(["--unknown-flag", "--environment=test"])).toEqual({
      environment: "test",
      confirm: false,
      force: false,
    });
  });
});

describe("isValidDatabaseIdentityEnvironment", () => {
  it.each(DATABASE_IDENTITY_ENVIRONMENTS)("acepta %s", (value) => {
    expect(isValidDatabaseIdentityEnvironment(value)).toBe(true);
  });

  it("rechaza un valor desconocido", () => {
    expect(isValidDatabaseIdentityEnvironment("staging")).toBe(false);
  });
});

describe("parseDatabaseIdentityRow", () => {
  it("devuelve null si no hay fila (tabla vacía — Etapa A)", () => {
    expect(parseDatabaseIdentityRow(undefined)).toBeNull();
  });

  it("parsea una fila válida", () => {
    const parsed = parseDatabaseIdentityRow({
      environment: "pilot",
      created_at: "2026-09-12T00:00:00.000Z",
      locked_by: "admin",
    });
    expect(parsed).toEqual({
      environment: "pilot",
      createdAt: new Date("2026-09-12T00:00:00.000Z"),
      lockedBy: "admin",
    });
  });

  it("locked_by null se mantiene null", () => {
    const parsed = parseDatabaseIdentityRow({
      environment: "production",
      created_at: "2026-09-12T00:00:00.000Z",
      locked_by: null,
    });
    expect(parsed?.lockedBy).toBeNull();
  });

  it("lanza si environment tiene un valor fuera del enum (fila editada a mano)", () => {
    expect(() =>
      parseDatabaseIdentityRow({ environment: "staging", created_at: "2026-09-12T00:00:00.000Z", locked_by: null }),
    ).toThrow(/valor inválido/);
  });
});

describe("getDatabaseIdentity", () => {
  beforeEach(() => {
    state.rows = [];
    state.executeError = null;
  });

  it("devuelve null cuando la tabla está vacía", async () => {
    await expect(getDatabaseIdentity()).resolves.toBeNull();
  });

  it("devuelve la identidad cuando hay una fila", async () => {
    state.rows = [{ environment: "development", created_at: "2026-01-01T00:00:00.000Z", locked_by: null }];
    await expect(getDatabaseIdentity()).resolves.toEqual({
      environment: "development",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lockedBy: null,
    });
  });
});

describe("warnIfDatabaseIdentityMissing — Etapa A: nunca bloquea", () => {
  beforeEach(() => {
    state.rows = [];
    state.executeError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("advierte (no lanza) cuando la base no está marcada", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    await expect(warnIfDatabaseIdentityMissing()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/no tiene identidad registrada/);
  });

  it("informa (no advierte) cuando la base ya está marcada", async () => {
    state.rows = [{ environment: "pilot", created_at: "2026-09-12T00:00:00.000Z", locked_by: "admin" }];
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    await warnIfDatabaseIdentityMissing();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"pilot"'));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("degrada a warning (no lanza) si la lectura de la base falla", async () => {
    state.executeError = new Error("relation \"database_identity\" does not exist");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    await expect(warnIfDatabaseIdentityMissing()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/No se pudo verificar/);
  });
});
