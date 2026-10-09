import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests, type AppEnv } from "../app-env";
import {
  ExternalCommsBlockedError,
  assertExternalCommAllowed,
  isProductionCommsEnv,
  shouldBlockExternalComm,
} from "../external-comms-policy";
import { logger } from "../logger";

describe("external-comms-policy", () => {
  afterEach(() => {
    resetAppEnvForTests();
  });

  describe("isProductionCommsEnv / shouldBlockExternalComm — una fila por ambiente", () => {
    const CASES: Array<{ appEnv: AppEnv; nodeEnv: string; blocked: boolean }> = [
      { appEnv: "pilot", nodeEnv: "production", blocked: true },
      { appEnv: "development", nodeEnv: "development", blocked: true },
      { appEnv: "test", nodeEnv: "development", blocked: true },
      { appEnv: "production", nodeEnv: "production", blocked: false },
    ];

    it.each(CASES)("APP_ENV=$appEnv → bloqueado=$blocked", ({ appEnv, nodeEnv, blocked }) => {
      resetAppEnvForTests();
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: nodeEnv });

      expect(isProductionCommsEnv()).toBe(!blocked);
      expect(shouldBlockExternalComm({ integration: "email", action: "confirmation" })).toBe(blocked);
    });
  });

  describe("logging del bloqueo — sin datos personales", () => {
    it("loguea con logger.warn solo etiquetas fijas cuando bloquea (pilot)", () => {
      resetAppEnvForTests();
      initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      const blocked = shouldBlockExternalComm({ integration: "arca", action: "fecae-solicitar-homologacion" });

      expect(blocked).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain("external-comms-blocked");
      expect(context).toEqual({ integration: "arca", action: "fecae-solicitar-homologacion", appEnv: "pilot" });
      // Ningún valor del log es un email, nombre, documento, token o URL —
      // solo las tres claves fijas de arriba.
      expect(Object.keys(context ?? {}).sort()).toEqual(["action", "appEnv", "integration"]);

      warnSpy.mockRestore();
    });

    it("no loguea nada cuando la operación está permitida (production)", () => {
      resetAppEnvForTests();
      initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      const blocked = shouldBlockExternalComm({ integration: "email", action: "confirmation" });

      expect(blocked).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe("assertExternalCommAllowed", () => {
    beforeEach(() => {
      resetAppEnvForTests();
    });

    it("lanza ExternalCommsBlockedError con integration/action cuando está bloqueado", () => {
      initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
      vi.spyOn(logger, "warn").mockImplementation(() => {});

      try {
        assertExternalCommAllowed({ integration: "arca", action: "wsaa-login-homologacion" });
        expect.unreachable("debía lanzar ExternalCommsBlockedError");
      } catch (err) {
        expect(err).toBeInstanceOf(ExternalCommsBlockedError);
        expect((err as ExternalCommsBlockedError).integration).toBe("arca");
        expect((err as ExternalCommsBlockedError).action).toBe("wsaa-login-homologacion");
        expect((err as Error).message).not.toMatch(/@|https?:\/\//); // sin email/URL en el mensaje
      }

      vi.restoreAllMocks();
    });

    it("no lanza nada cuando está permitido (production)", () => {
      initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
      expect(() => assertExternalCommAllowed({ integration: "arca", action: "wsaa-login-produccion" })).not.toThrow();
    });
  });
});
