import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isProduction: false,
  insertCalls: [] as Array<{ table: any; values: any }>,
}));

vi.mock("../app-env", () => ({
  isProductionDataEnv: () => state.isProduction,
}));

vi.mock("../auth", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
}));

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: () => ({ limit: async () => [] }) }),
    insert: (table: any) => ({
      values: (values: any) => {
        state.insertCalls.push({ table, values: Array.isArray(values) ? values : [values] });
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  },
}));

const { seedDatabase } = await import("../seed");
const { hashPassword } = await import("../auth");

function findPilotoExternoInsert() {
  for (const call of state.insertCalls) {
    const match = call.values.find((v: any) => v?.role === "piloto_externo");
    if (match) return match;
  }
  return undefined;
}

function findStaffInserts() {
  for (const call of state.insertCalls) {
    const matches = call.values.filter((v: any) => ["admin", "gerencia", "recepcion1", "housekeeping1", "restaurante1", "spa1"].includes(v?.username));
    if (matches.length > 0) return matches;
  }
  return [];
}

describe("seedDatabase — usuario de demo piloto_externo (Fase 7)", () => {
  beforeEach(() => {
    state.isProduction = false;
    state.insertCalls = [];
    vi.clearAllMocks();
  });

  it("crea el usuario piloto_externo con password hasheada fuera de producción", async () => {
    await seedDatabase();
    const user = findPilotoExternoInsert();
    expect(user).toBeDefined();
    expect(user.username).toBe("piloto_externo");
    expect(user.role).toBe("piloto_externo");
    expect(user.password).toBe("hashed:PilotoDemo2026!");
    expect(hashPassword).toHaveBeenCalledWith("PilotoDemo2026!");
  });

  it("nunca crea el usuario piloto_externo en producción, aunque la base esté vacía", async () => {
    state.isProduction = true;
    await seedDatabase();
    expect(findPilotoExternoInsert()).toBeUndefined();
    expect(hashPassword).not.toHaveBeenCalledWith("PilotoDemo2026!");
  });

  it("no inserta la contraseña en texto plano", async () => {
    await seedDatabase();
    const user = findPilotoExternoInsert();
    expect(user?.password).not.toBe("PilotoDemo2026!");
  });
});

describe("seedDatabase — contraseña de demo para los 6 usuarios internos (Fase 9, hallazgo post-deployment)", () => {
  beforeEach(() => {
    state.isProduction = false;
    state.insertCalls = [];
    vi.clearAllMocks();
  });

  it("les asigna una contraseña hasheada fuera de producción — antes ninguno tenía password y el bootstrap está deshabilitado en piloto", async () => {
    await seedDatabase();
    const staff = findStaffInserts();
    expect(staff).toHaveLength(6);
    for (const user of staff) {
      expect(user.password).toBe("hashed:PilotoStaff2026!");
    }
    expect(hashPassword).toHaveBeenCalledWith("PilotoStaff2026!");
  });

  it("nunca les asigna contraseña en producción, aunque la base esté vacía", async () => {
    state.isProduction = true;
    await seedDatabase();
    const staff = findStaffInserts();
    expect(staff).toHaveLength(6);
    for (const user of staff) {
      expect(user.password).toBeNull();
    }
    expect(hashPassword).not.toHaveBeenCalledWith("PilotoStaff2026!");
  });

  it("no inserta la contraseña en texto plano", async () => {
    await seedDatabase();
    const staff = findStaffInserts();
    for (const user of staff) {
      expect(user.password).not.toBe("PilotoStaff2026!");
    }
  });
});
