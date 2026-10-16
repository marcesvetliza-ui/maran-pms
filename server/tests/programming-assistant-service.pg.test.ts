import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, it, expect } from "vitest";
import { createService } from "../../services/programming-assistant/service";
import type {SupportDiagnosis} from "../../shared/programming-support";

(process.env.DATABASE_URL ? describe : describe.skip)(
  "persistent assistant service",
  () => {
    it.each([2,10,20])("authenticates, isolates owners, keeps retries idempotent and enforces daily budget %i", async (dailyLimit) => {
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
      const report: SupportDiagnosis = {
        summary: "Diagnóstico de prueba",
        certainty: "hipotesis" as const,
        cause: "Simulación",
        proposal: "Revisar",
        proposedTests: [],
        questions: ["¿Querés revisar otro circuito?"],
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
          dailyLimit,
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
        // Cases created before a deployment can be retried against the current revision.
        await service.pool.query("UPDATE support_cases SET data=jsonb_set(data, '{version}', to_jsonb($2::text)) WHERE id=$1", [ticket.id, "c".repeat(40)]);
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
        expect(updated[0].version).toBe(version);
        const feedback={requestId:randomUUID(),reportId:updated[0].reportId,outcome:"unresolved"};
        expect((await request(`/cases/${ticket.id}/feedback`,feedback,"owner2")).status).toBe(404);
        const evaluations=await Promise.all([request(`/cases/${ticket.id}/feedback`,feedback),request(`/cases/${ticket.id}/feedback`,feedback)]);
        expect(evaluations.map(response=>response.status)).toEqual([200,200]);
        const evaluated=await (await request("/cases")).json();
        expect(evaluated[0].status).toBe("proposal_ready");
        expect(evaluated[0].feedback).toHaveLength(1);
        expect(evaluated[0].feedback[0]).toMatchObject(feedback);
        expect(evaluated[0].messages.filter((message:any)=>message.text.includes("sigue el problema"))).toHaveLength(1);
        expect((await request(`/cases/${ticket.id}/feedback`,{...feedback,outcome:"resolved"})).status).toBe(409);
        report.certainty = "falta_informacion";
        expect((await request(`/cases/${ticket.id}/analyze`, {requestId:randomUUID()})).status).toBe(200);
        await service.tick();
        expect((await (await request("/cases")).json())[0].status).toBe("needs_info");
        expect((await request(`/cases/${ticket.id}/feedback`,{...feedback,requestId:randomUUID()})).status).toBe(409);
        const current=await (await request("/cases")).json();
        expect(current[0].reportId).not.toBe(feedback.reportId);
        expect(current[0].feedback).toHaveLength(1);
        const count = await service.pool.query(
          "SELECT count(*)::int AS count FROM support_runs WHERE kind='analyze'",
        );
        expect(count.rows[0].count).toBe(2);
        await service.pool.query(
          "INSERT INTO support_runs(id,owner,request_id,case_id,kind) SELECT gen_random_uuid(),'owner1',gen_random_uuid(),$1,'analyze' FROM generate_series(1,$2::int)",
          [ticket.id,dailyLimit-2],
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
