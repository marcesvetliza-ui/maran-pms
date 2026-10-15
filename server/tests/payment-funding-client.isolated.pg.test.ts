import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { randomUUID } from "node:crypto";
import { pool } from "./helpers/fundingIsolatedDatabase";
import { createDemoService, demoActor, installSyntheticSchema, seedSyntheticScope } from "../../demo/funding/backend";
import { registerPaymentFundingRoutes } from "../billing/funding/routes";
import { fundingApi } from "../../client/src/lib/paymentFunding";

const { service } = createDemoService(pool);
let server: ReturnType<ReturnType<typeof express>["listen"]>;
const nativeFetch = globalThis.fetch;
beforeAll(async () => {
  await installSyntheticSchema(pool);
  const app = express(); app.use(express.json());
  registerPaymentFundingRoutes(app, service, { authenticate: (_req, _res, next) => next(), actor: () => demoActor });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  vi.stubGlobal("fetch", (path: string, init?: RequestInit) => nativeFetch(base + path, init));
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
});

describe("adaptador cliente contra HTTP y PostgreSQL sintéticos", () => {
  it.each([false, true])("concuerda con el DTO real y no duplica dinero (mixto=%s)", async partial => {
    const scope = await seedSyntheticScope(service, `client-${randomUUID()}`, "spa", { partial });
    const projection = await fundingApi.scope(scope.id);
    const before = await pool.query("SELECT COUNT(*)::int AS n FROM funding_demo.cash_movements WHERE shift_id=$1", [`${scope.id}:shift`]);
    const request = { scope, documentId: projection.documents[0].id,
      applications: projection.receipts.map(row => ({ receiptId: row.id, amountCents: row.freeCents })),
      newCollections: partial ? [{ rowId: "remainder", method: "efectivo" as const, amountCents: 9000000, shiftId: `${scope.id}:shift` }] : [] };
    const preview = await fundingApi.preview(request);
    expect(preview.fundingMode).toBe(partial ? "existing_and_new" : "existing_only");
    const confirmation = { operationId: randomUUID(), previewHash: preview.previewHash, request: preview.request };
    expect((await fundingApi.reserve(confirmation)).status).toBe("reserved");
    expect((await fundingApi.reserve(confirmation)).id).toBe(confirmation.operationId);
    const authorized = await fundingApi.action(confirmation.operationId, "authorize");
    expect(authorized.status).toBe("authorized_pending_link");
    expect(authorized.canFinalize).toBe(true);
    expect((await fundingApi.action(confirmation.operationId, "finalize")).status).toBe("applied");
    expect((await fundingApi.action(confirmation.operationId, "resume")).status).toBe("applied");
    const after = await pool.query("SELECT COUNT(*)::int AS n FROM funding_demo.cash_movements WHERE shift_id=$1", [`${scope.id}:shift`]);
    expect(after.rows[0].n - before.rows[0].n).toBe(partial ? 1 : 0);
    const final = await fundingApi.scope(scope.id);
    expect(final.debtCents).toBe(0);
    expect(final.receipts.reduce((sum, row) => sum + row.heldCents, 0)).toBe(0);
  });
});
