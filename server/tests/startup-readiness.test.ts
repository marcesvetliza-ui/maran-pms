import express from "express";
import type { Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { installStartupReadiness } from "../startup-readiness";

let server: Server;
afterEach(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
it("keeps the deployment unhealthy and API inaccessible until required initialization is ready", async () => {
  let ready = false;
  let permissionReads = 0;
  const app = express();
  installStartupReadiness(app, () => ready);
  app.get("/api/permissions/mine", (_req, res) => {
    permissionReads++;
    res.json({ role: "reception", resourceKeys: [] });
  });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const health = await fetch(`${url}/health`);
  expect(health.status).toBe(503);
  expect(await health.json()).toEqual({ status: "starting" });
  expect(health.headers.get("cache-control")).toBe("no-store");
  expect(health.headers.get("retry-after")).toBe("3");
  expect((await fetch(`${url}/api/permissions/mine`)).status).toBe(503);
  expect(permissionReads).toBe(0);
  ready = true;
  const healthy = await fetch(`${url}/health`);
  expect(healthy.status).toBe(200);
  expect(await healthy.json()).toEqual({ status: "ready" });
  expect(healthy.headers.has("retry-after")).toBe(false);
  expect((await fetch(`${url}/api/permissions/mine`)).status).toBe(200);
  expect(permissionReads).toBe(1);
});
it("configures Railway to use the readiness endpoint before activating a deployment", () => {
  const config = JSON.parse(
    readFileSync(new URL("../../railway.json", import.meta.url), "utf8"),
  );
  expect(config.deploy.healthcheckPath).toBe("/health");
  expect(config.deploy.healthcheckTimeout).toBe(300);
});
