import express from "express";
import { describe, expect, it, vi } from "vitest";
import { checkSpaHomologation } from "../billing/funding/operational/homologation";
import { mountSpaFundingFromEnvironment } from "../billing/funding/operational/activation";

describe("habilitación explícita SPA en homologación", () => {
  it.each([undefined, "false", "TRUE", "1"])("no importa conexiones ni activa por flag %s", async flag => {
    await expect(mountSpaFundingFromEnvironment(express(), { SPA_FUNDING_HOMOLOGATION_ENABLED: flag,
      VITE_SPA_FUNDING_UI: "true", NODE_ENV: "production" })).resolves.toBeNull();
  });
  const config = { environment: "homologacion", issuer_ready: true, point_ready: true, certificate_ready: true, key_ready: true };
  function database(changes: object = {}, points = 1) {
    return { query: vi.fn().mockResolvedValueOnce({ rows: [{ ...config, ...changes }] }).mockResolvedValueOnce({ rows: [{ n: points }] }) };
  }
  it.each(["produccion", "ficticio", null])("rechaza ambiente %s sin consultar WSAA", async environment => {
    const c = database({ environment });
    await expect(checkSpaHomologation(c as any)).rejects.toMatchObject({ code: "FISCAL_ENVIRONMENT_BLOCKED" });
    expect(c.query).toHaveBeenCalledTimes(1);
  });
  it.each(["issuer_ready", "point_ready", "certificate_ready", "key_ready"])("rechaza configuración incompleta: %s", async key => {
    await expect(checkSpaHomologation(database({ [key]: false }) as any)).rejects.toMatchObject({ code: "FISCAL_PREPARATION_REQUIRED" });
  });
  it.each([0, 2])("rechaza %s puntos SPA online", async points => {
    await expect(checkSpaHomologation(database({}, points) as any)).rejects.toMatchObject({ code: "FISCAL_PREPARATION_REQUIRED" });
  });
  it("devuelve sólo disponibilidad, sin certificados, clave ni CUIT", async () => {
    await expect(checkSpaHomologation(database() as any)).resolves.toEqual({ environment: "homologacion", credentialsPresent: true, spaPointReady: true });
  });
});
