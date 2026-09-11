import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_ENVS,
  InvalidAppEnvError,
  getAppEnv,
  initAppEnv,
  isPilotEnv,
  isProductionDataEnv,
  resetAppEnvForTests,
  resolveAppEnv,
} from "../app-env";

describe("resolveAppEnv", () => {
  describe("valores explícitos válidos", () => {
    it.each(APP_ENVS.filter((v) => v !== "pilot"))(
      "acepta APP_ENV=%s con NODE_ENV=production",
      (value) => {
        const result = resolveAppEnv({ APP_ENV: value, NODE_ENV: "production" });
        expect(result).toEqual({ appEnv: value, explicit: true, warning: null });
      },
    );

    it.each(APP_ENVS)("acepta APP_ENV=%s con NODE_ENV=development", (value) => {
      if (value === "pilot") return; // cubierto en su propio bloque (exige NODE_ENV=production)
      const result = resolveAppEnv({ APP_ENV: value, NODE_ENV: "development" });
      expect(result.appEnv).toBe(value);
      expect(result.explicit).toBe(true);
      expect(result.warning).toBeNull();
    });

    it("normaliza mayúsculas y espacios", () => {
      const result = resolveAppEnv({ APP_ENV: "  PRODUCTION  ", NODE_ENV: "production" });
      expect(result.appEnv).toBe("production");
    });
  });

  describe("APP_ENV=pilot exige NODE_ENV=production", () => {
    it("acepta pilot con NODE_ENV=production", () => {
      const result = resolveAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
      expect(result).toEqual({ appEnv: "pilot", explicit: true, warning: null });
    });

    it("rechaza pilot con NODE_ENV=development", () => {
      expect(() => resolveAppEnv({ APP_ENV: "pilot", NODE_ENV: "development" })).toThrow(
        InvalidAppEnvError,
      );
    });

    it("rechaza pilot con NODE_ENV=test", () => {
      expect(() => resolveAppEnv({ APP_ENV: "pilot", NODE_ENV: "test" })).toThrow(
        InvalidAppEnvError,
      );
    });

    it("rechaza pilot sin NODE_ENV configurado", () => {
      expect(() => resolveAppEnv({ APP_ENV: "pilot" })).toThrow(InvalidAppEnvError);
    });

    it("el mensaje de error explica la causa", () => {
      try {
        resolveAppEnv({ APP_ENV: "pilot", NODE_ENV: "development" });
        expect.unreachable("debía lanzar InvalidAppEnvError");
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidAppEnvError);
        expect((err as Error).message).toMatch(/NODE_ENV=production/);
      }
    });
  });

  describe("valores inválidos — siempre fallan, sin importar NODE_ENV", () => {
    it("rechaza un valor desconocido con NODE_ENV=production", () => {
      expect(() => resolveAppEnv({ APP_ENV: "staging", NODE_ENV: "production" })).toThrow(
        InvalidAppEnvError,
      );
    });

    it("rechaza un valor desconocido con NODE_ENV=development", () => {
      expect(() => resolveAppEnv({ APP_ENV: "prod", NODE_ENV: "development" })).toThrow(
        InvalidAppEnvError,
      );
    });

    it("rechaza un valor desconocido sin NODE_ENV", () => {
      expect(() => resolveAppEnv({ APP_ENV: "piloto" })).toThrow(InvalidAppEnvError);
    });

    it("rechaza string vacío distinto de ausente (solo espacios)", () => {
      // Solo espacios se trata como ausente (ver bloque de compatibilidad transitoria),
      // no como un valor inválido — se documenta explícitamente este caso límite.
      const result = resolveAppEnv({ APP_ENV: "   ", NODE_ENV: "development" });
      expect(result.explicit).toBe(false);
    });
  });

  describe("ausencia de APP_ENV — obligatoria solo en procesos publicados", () => {
    it("falla si falta APP_ENV con NODE_ENV=production", () => {
      expect(() => resolveAppEnv({ NODE_ENV: "production" })).toThrow(InvalidAppEnvError);
    });

    it("el mensaje de error de ausencia menciona NODE_ENV=production", () => {
      try {
        resolveAppEnv({ NODE_ENV: "production" });
        expect.unreachable("debía lanzar InvalidAppEnvError");
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidAppEnvError);
        expect((err as Error).message).toMatch(/obligatoria/);
      }
    });

    it("deriva development con advertencia si falta APP_ENV y NODE_ENV=development", () => {
      const result = resolveAppEnv({ NODE_ENV: "development" });
      expect(result.appEnv).toBe("development");
      expect(result.explicit).toBe(false);
      expect(result.warning).toMatch(/compatibilidad/);
    });

    it("deriva development con advertencia si falta APP_ENV y NODE_ENV=test", () => {
      const result = resolveAppEnv({ NODE_ENV: "test" });
      expect(result.appEnv).toBe("development");
      expect(result.explicit).toBe(false);
      expect(result.warning).not.toBeNull();
    });

    it("deriva development con advertencia si faltan ambas variables", () => {
      const result = resolveAppEnv({});
      expect(result.appEnv).toBe("development");
      expect(result.explicit).toBe(false);
    });
  });
});

describe("initAppEnv / getAppEnv / isPilotEnv / isProductionDataEnv", () => {
  beforeEach(() => {
    resetAppEnvForTests();
  });

  it("getAppEnv lanza si no se llamó initAppEnv antes", () => {
    expect(() => getAppEnv()).toThrow(/initAppEnv/);
  });

  it("initAppEnv fija el estado que luego lee getAppEnv", () => {
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    expect(getAppEnv()).toBe("pilot");
  });

  it("initAppEnv propaga InvalidAppEnvError sin fijar estado", () => {
    expect(() => initAppEnv({ APP_ENV: "bogus", NODE_ENV: "production" })).toThrow(
      InvalidAppEnvError,
    );
    expect(() => getAppEnv()).toThrow(/initAppEnv/);
  });

  it("isPilotEnv distingue pilot de production", () => {
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    expect(isPilotEnv()).toBe(true);
    expect(isProductionDataEnv()).toBe(false);

    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    expect(isPilotEnv()).toBe(false);
    expect(isProductionDataEnv()).toBe(true);
  });
});
