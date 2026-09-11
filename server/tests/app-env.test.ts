import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_ENVS,
  type AppEnv,
  InvalidAppEnvError,
  getAppEnv,
  initAppEnv,
  isPilotEnv,
  isProductionDataEnv,
  resetAppEnvForTests,
  resolveAppEnv,
} from "../app-env";

describe("resolveAppEnv — matriz completa APP_ENV × NODE_ENV", () => {
  // "pilot" y "production" son los dos "modos productivos": exigen
  // NODE_ENV=production. "development" y "test" son los dos modos no
  // publicados: rechazan NODE_ENV=production (configuración contradictoria).
  // Se cubren las 4 combinaciones de NODE_ENV (production/development/test/
  // ausente) para cada uno de los 4 valores de APP_ENV — 16 casos en total.
  const MATRIX: Array<{ appEnv: AppEnv; nodeEnv: string | undefined; expected: "accept" | "reject" }> = [
    { appEnv: "development", nodeEnv: "production", expected: "reject" },
    { appEnv: "development", nodeEnv: "development", expected: "accept" },
    { appEnv: "development", nodeEnv: "test", expected: "accept" },
    { appEnv: "development", nodeEnv: undefined, expected: "accept" },

    { appEnv: "test", nodeEnv: "production", expected: "reject" },
    { appEnv: "test", nodeEnv: "development", expected: "accept" },
    { appEnv: "test", nodeEnv: "test", expected: "accept" },
    { appEnv: "test", nodeEnv: undefined, expected: "accept" },

    { appEnv: "pilot", nodeEnv: "production", expected: "accept" },
    { appEnv: "pilot", nodeEnv: "development", expected: "reject" },
    { appEnv: "pilot", nodeEnv: "test", expected: "reject" },
    { appEnv: "pilot", nodeEnv: undefined, expected: "reject" },

    { appEnv: "production", nodeEnv: "production", expected: "accept" },
    { appEnv: "production", nodeEnv: "development", expected: "reject" },
    { appEnv: "production", nodeEnv: "test", expected: "reject" },
    { appEnv: "production", nodeEnv: undefined, expected: "reject" },
  ];

  it.each(MATRIX)(
    "APP_ENV=$appEnv, NODE_ENV=$nodeEnv → $expected",
    ({ appEnv, nodeEnv, expected }) => {
      const call = () => resolveAppEnv({ APP_ENV: appEnv, NODE_ENV: nodeEnv });
      if (expected === "accept") {
        expect(call()).toEqual({ appEnv, explicit: true, warning: null });
      } else {
        expect(call).toThrow(InvalidAppEnvError);
      }
    },
  );

  it("el mensaje de rechazo de pilot/production menciona NODE_ENV=production", () => {
    for (const appEnv of ["pilot", "production"] as const) {
      try {
        resolveAppEnv({ APP_ENV: appEnv, NODE_ENV: "development" });
        expect.unreachable(`debía lanzar InvalidAppEnvError para APP_ENV=${appEnv}`);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidAppEnvError);
        expect((err as Error).message).toMatch(/NODE_ENV=production/);
      }
    }
  });

  it("el mensaje de rechazo de development/test en NODE_ENV=production menciona la contradicción", () => {
    for (const appEnv of ["development", "test"] as const) {
      try {
        resolveAppEnv({ APP_ENV: appEnv, NODE_ENV: "production" });
        expect.unreachable(`debía lanzar InvalidAppEnvError para APP_ENV=${appEnv}`);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidAppEnvError);
        expect((err as Error).message).toMatch(/contradictoria/);
      }
    }
  });
});

describe("resolveAppEnv — normalización de formato", () => {
  it("normaliza mayúsculas y espacios", () => {
    const result = resolveAppEnv({ APP_ENV: "  PRODUCTION  ", NODE_ENV: "production" });
    expect(result.appEnv).toBe("production");
  });

  it("trata un valor de solo espacios como ausente (compatibilidad transitoria), no como inválido", () => {
    const result = resolveAppEnv({ APP_ENV: "   ", NODE_ENV: "development" });
    expect(result.explicit).toBe(false);
    expect(result.appEnv).toBe("development");
  });
});

describe("resolveAppEnv — valores inválidos, siempre fallan sin importar NODE_ENV", () => {
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
});

describe("resolveAppEnv — ausencia de APP_ENV (obligatoria solo en procesos publicados)", () => {
  it("falla si falta APP_ENV con NODE_ENV=production", () => {
    expect(() => resolveAppEnv({ NODE_ENV: "production" })).toThrow(InvalidAppEnvError);
  });

  it("el mensaje de error de ausencia menciona que es obligatoria", () => {
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
