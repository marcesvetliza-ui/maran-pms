import express from "express";
import * as http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MANUAL_TOPICS } from "../../shared/manual-library";

vi.mock("../auth", () => ({ requireAuth: (req: any, res: any, next: any) => req.user ? next() : res.status(401).end() }));
vi.mock("../permissions", () => ({ hasPermission: (role: string, key: string) => role === "admin" && key === "api:manuals:restricted" }));
import { registerManualLibraryRoutes } from "../routes/manual-library";

let server: http.Server;
afterEach(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });
async function start(role?: string) {
  const app = express();
  app.use((req, _res, next) => { if (role) req.user = { role } as any; next(); });
  registerManualLibraryRoutes(app);
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}

describe("manual library authorization and packaging", () => {
  it("contains 18 topics, 36 documents and 405 pages", () => {
    expect(MANUAL_TOPICS).toHaveLength(18);
    expect(MANUAL_TOPICS.flatMap(t => t.documents)).toHaveLength(36);
    expect(MANUAL_TOPICS.flatMap(t => t.documents).reduce((n, d) => n + d.pages, 0)).toBe(405);
  });
  it("requires a session for catalog and direct files", async () => {
    const base = await start();
    expect((await fetch(`${base}/api/manuals`)).status).toBe(401);
    expect((await fetch(`${base}/api/manuals/01-primeros-pasos/manual`)).status).toBe(401);
  });
  it("hides restricted topics and blocks direct reading, download and ranges", async () => {
    const base = await start("reception");
    const catalog = await fetch(`${base}/api/manuals`);
    expect(catalog.headers.get("cache-control")).toBe("private, no-store");
    expect(await catalog.json()).toHaveLength(16);
    for (const topic of ["17-configuracion", "18-tecnica"]) {
      for (const suffix of ["", "?download=1"]) {
        expect((await fetch(`${base}/api/manuals/${topic}/manual${suffix}`, { headers: { Range: "bytes=0-9" } })).status).toBe(403);
      }
    }
  });
  it("serves all authorized PDFs, supporting downloads and byte ranges", async () => {
    const base = await start("admin");
    expect(await (await fetch(`${base}/api/manuals`)).json()).toHaveLength(18);
    for (const topic of MANUAL_TOPICS) for (const doc of topic.documents) {
      const response = await fetch(`${base}/api/manuals/${topic.id}/${doc.kind}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect((await response.text()).startsWith("%PDF-")).toBe(true);
    }
    const download = await fetch(`${base}/api/manuals/18-tecnica/manual?download=1`);
    expect(download.headers.get("content-disposition")).toContain("attachment;");
    await download.arrayBuffer();
    const range = await fetch(`${base}/api/manuals/18-tecnica/manual`, { headers: { Range: "bytes=0-4" } });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe("%PDF-");
  });
  it("rejects unlisted documents and paths", async () => {
    const base = await start("admin");
    for (const route of ["01-primeros-pasos/other", "unknown/manual", "%2e%2e/manual"]) {
      expect((await fetch(`${base}/api/manuals/${route}`)).status).toBe(404);
    }
  });
});
