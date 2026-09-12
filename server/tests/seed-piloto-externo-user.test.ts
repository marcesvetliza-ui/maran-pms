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
