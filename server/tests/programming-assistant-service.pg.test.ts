import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, it, expect } from "vitest";
import { createService } from "../../services/programming-assistant/service";

(process.env.DATABASE_URL ? describe : describe.skip)(
  "persistent assistant service",
  () => {
    it("authenticates, isolates owners, keeps retries idempotent and enforces the diagnosis budget", async () => {
      const url = new URL(process.env.DATABASE_URL!);
      const schema = "assistant_test_" + randomUUID().replaceAll("-", "");
      const admin = new pg.Client({
        connectionString: process.env.DATABASE_URL,
      });
      await admin.connect();
      await admin.query(`CREATE SCHEMA "${schema}"`);
      url.searchParams.set("options", `-c search_path=${schema}`);
      const secret = "synthetic-secret-".repeat(3);
      const version = "a".repeat(40);
      const report = {
        summary: "Diagnóstico de prueba",
        certainty: "hipotesis" as const,
        cause: "Simulación",
        proposal: "Revisar",
        proposedTests: [],
        questions: [],
        dataRepair: "",
        limitations: [],
        evidence: [],
      };
      const service = await createService(
        {
          databaseUrl: url.toString(),
          secret,
          version,
          sourceRoot: process.cwd(),
          apiKey: "mock-only",
          model: "mock",
        },
        async () => ({
          report,
          tokens: 0,
          calls: 0,
          readFiles: [],
          searches: [],
        }),
      );
      const server = service.app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.on("listening", resolve));
      const base = `http://127.0.0.1:${(server.address() as any).port}`;
      async function request(
        endpoint: string,
        body?: unknown,
        owner = "owner1",
        overrideVersion = version,
      ) {
        return fetch(base + endpoint, {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
            "X-Support-User": owner,
            "X-Support-Version": overrideVersion,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      }
      try {
        expect((await fetch(base + "/cases")).status).toBe(401);
        const body = {
          requestId: randomUUID(),
          title: "Consulta de prueba",
          module: "inventario",
          actual: "El stock parece incorrecto",
          expected: "Mostrar el saldo correcto",
        };
        const ticket = await (await request("/cases", body)).json();
        const duplicate = await (await request("/cases", body)).json();
        expect(duplicate.id).toBe(ticket.id);
        expect(
          await (await request("/cases", undefined, "owner2")).json(),
        ).toEqual([]);
        expect(
          (
            await request(
              `/cases/${ticket.id}/analyze`,
              { requestId: randomUUID() },
              "owner2",
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await request(
              `/cases/${ticket.id}/analyze`,
              { requestId: randomUUID() },
              "owner1",
              "b".repeat(40),
            )
          ).status,
        ).toBe(409);
        const run = { requestId: randomUUID() };
        expect((await request(`/cases/${ticket.id}/analyze`, run)).status).toBe(
          200,
        );
        expect((await request(`/cases/${ticket.id}/analyze`, run)).status).toBe(
          200,
        );
        await service.tick();
        const updated = await (await request("/cases")).json();
        expect(updated[0].status).toBe("proposal_ready");
        const count = await service.pool.query(
          "SELECT count(*)::int AS count FROM support_runs WHERE kind='analyze'",
        );
        expect(count.rows[0].count).toBe(1);
        await service.pool.query(
          "INSERT INTO support_runs(id,owner,request_id,case_id,kind) SELECT gen_random_uuid(),'owner1',gen_random_uuid(),$1,'analyze' FROM generate_series(1,9)",
          [ticket.id],
        );
        expect(
          (
            await request(`/cases/${ticket.id}/analyze`, {
              requestId: randomUUID(),
            })
          ).status,
        ).toBe(429);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
        await service.stop();
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      }
    });
  },
);
