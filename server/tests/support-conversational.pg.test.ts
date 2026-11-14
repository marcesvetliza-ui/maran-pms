import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createService } from "../../services/programming-assistant/service";
import { hotelDay } from "../../services/programming-assistant/chat-store";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const image = {
  name: "captura.png",
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
};
suite("conversational support on its own PostgreSQL schema", () => {
  let root: pg.Client,
    schema: string,
    service: Awaited<ReturnType<typeof createService>>,
    server: ReturnType<typeof service.app.listen>,
    base: string;
  let config: any,
    provider: any,
    steps: unknown[],
    mail: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !/test/.test(url.pathname)
    )
      throw Error("Local disposable test DB required");
    root = new pg.Client({ connectionString: url.toString() });
    await root.connect();
    schema = "support_converse_" + randomUUID().replaceAll("-", "");
    await root.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set("options", `-c search_path=${schema}`);
    steps = [];
    provider = {
      responses: {
        inputTokens: { count: vi.fn(async () => ({ input_tokens: 1000 })) },
        create: vi.fn(async () => ({
          id: "resp_" + randomUUID(),
          model: "gpt-5.3-codex",
          status: "completed",
          output: [{ type: "message" }],
          output_text: JSON.stringify(
            steps.shift() || {
              action: "reply",
              reply: "Contame en qué pantalla ocurrió y qué mensaje apareció.",
              observations: "",
            },
          ),
          usage: {
            input_tokens: 100,
            output_tokens: 40,
            input_tokens_details: { cached_tokens: 0 },
          },
        })),
      },
    };
    mail = vi.fn(async () => new Response("{}", { status: 200 }));
    config = {
      databaseUrl: url.toString(),
      secret: "synthetic-support-secret-".repeat(3),
      version: "a".repeat(40),
      sourceRoot: process.cwd(),
      model: "gpt-5.3-codex",
      apiKey: "synthetic-key",
      engine: "codex",
      codexTransport: "responses",
      codexPaidEnabled: true,
      proposalReview: true,
      conversational: true,
      chatProvider: provider,
      chatSendNotification: mail,
    };
    service = await createService(config);
    server = service.app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (service) await service.stop();
    if (root) {
      await root.query(`DROP SCHEMA ${schema} CASCADE`);
      await root.end();
    }
  });
  async function req(
    path: string,
    body?: unknown,
    owner = "alice",
    admin = false,
  ) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${config.secret}`,
        "X-Support-User": owner,
        "X-Support-Version": config.version,
        "X-Support-Mode": "codex",
        "X-Support-Reviewer": String(admin),
        "X-Support-View-All": String(admin),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null),
    };
  }
  const create = (extra: Record<string, unknown> = {}) =>
    req("/chat", {
      requestId: randomUUID(),
      text: "Tengo una duda con una reserva",
      ...extra,
    });
  it("automatically answers in the same case, preserves follow-up context and charges all generation", async () => {
    const first = await create();
    expect(first.status).toBe(201);
    expect(first.data.status).toBe("queued");
    await service.tick();
    let ticket = (await req("/cases")).data[0];
    expect(ticket.messages.map((m: any) => m.author)).toEqual([
      "user",
      "assistant",
    ]);
    expect(provider.responses.create).toHaveBeenCalledTimes(1);
    await req(`/cases/${ticket.id}/chat`, {
      requestId: randomUUID(),
      text: "Fue en planning, me pidió volver a ingresar",
    });
    await service.tick();
    expect(
      JSON.stringify(provider.responses.create.mock.calls[1][0].input),
    ).toContain("Fue en planning");
    expect(
      JSON.stringify(provider.responses.create.mock.calls[1][0].input),
    ).toContain("Tengo una duda con una reserva");
    const usage = (await req("/usage")).data;
    expect(usage.responsesUsed).toBe(2);
    expect(usage.spentUsd).toBeGreaterThan(0);
    expect(usage.reservedUsd).toBe(0);
    expect(
      (
        await service.pool.query(
          "SELECT count(*)::int AS n FROM support_provider_calls WHERE status='settled'",
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("deduplicates lost responses and rejects reuse for a different message", async () => {
    const payload = {
      requestId: randomUUID(),
      text: "La misma consulta enviada una vez",
    };
    const [a, b] = await Promise.all([
      req("/chat", payload),
      req("/chat", payload),
    ]);
    expect(a.data.id).toBe(b.data.id);
    expect(
      (await req("/chat", { ...payload, text: "Otra consulta" })).status,
    ).toBe(409);
    await service.tick();
    expect(provider.responses.create).toHaveBeenCalledTimes(1);
    expect((await req("/usage")).data.responsesUsed).toBe(1);
  });
  it("keeps screenshots private, accepts staff follow-up only for the owner and never accepts caller privileges", async () => {
    const first = await create({ images: [image] });
    const imageId = first.data.messages[0].images[0].id;
    expect(JSON.stringify((await req("/cases")).data)).not.toContain("base64");
    expect((await req(`/images/${imageId}`)).data.dataUrl).toBe(image.dataUrl);
    expect((await req(`/images/${imageId}`, undefined, "bob")).status).toBe(
      404,
    );
    expect(
      (await req(`/images/${imageId}`, undefined, "marcelo", true)).status,
    ).toBe(200);
    expect(
      (
        await req(
          `/cases/${first.data.id}/chat`,
          { requestId: randomUUID(), text: "No es mi caso" },
          "bob",
        )
      ).status,
    ).toBe(404);
    expect((await req("/alerts", undefined, "bob")).status).toBe(403);
    expect((await create({ canReview: true })).status).toBe(400);
    await service.tick();
    expect(
      provider.responses.create.mock.calls[0][0].input[0].content.some(
        (c: any) => c.type === "input_image",
      ),
    ).toBe(true);
  });
  it("stores messages after exhaustion without generating, and emits one budget alert per day", async () => {
    const { day } = hotelDay();
    await service.pool.query(
      "INSERT INTO support_usage_days(day,spent_micros) VALUES($1,1000000)",
      [day],
    );
    const first = await create(),
      second = await create();
    expect(first.data.status).toBe("received");
    expect(first.data.messages[0].text).toContain("reserva");
    expect(second.status).toBe(201);
    await service.tick();
    expect(provider.responses.create).not.toHaveBeenCalled();
    expect((await req("/usage")).data.responsesUsed).toBe(0);
    const alerts = (await req("/alerts", undefined, "marcelo", true)).data;
    expect(alerts.filter((a: any) => a.kind === "budget_paused")).toHaveLength(
      1,
    );
  });
  it("enforces the per-user cap while other users can still ask for help", async () => {
    const owner = "alice";
    for (let i = 0; i < 20; i++)
      await service.pool.query(
        "INSERT INTO support_runs(id,owner,request_id,kind) VALUES($1,$2,$3,'chat')",
        [randomUUID(), owner, randomUUID()],
      );
    const first = await create();
    expect(first.data.status).toBe("received");
    expect(first.data.lastError).toContain("20");
    const other = await req(
      "/chat",
      { requestId: randomUUID(), text: "Otra persona necesita ayuda" },
      "bob",
    );
    expect(other.data.status).toBe("queued");
    await service.tick();
    expect(provider.responses.create).toHaveBeenCalledTimes(1);
  });
  it("reserves concurrent calls atomically and refunds unused capacity after measured usage", async () => {
    const first = await create();
    const store = service.chat!.store;
    const results = await Promise.allSettled([
      store.reserve(first.data.id, "alice", 300000, 4200),
      store.reserve(first.data.id, "alice", 300000, 4200),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const id = (
      results.find(
        (r) => r.status === "fulfilled",
      ) as PromiseFulfilledResult<string>
    ).value;
    expect((await store.usage("alice")).reservedUsd).toBeLessThanOrEqual(1);
    await store.settle(id, 100, 40, 0, "response-known");
    expect((await store.usage("alice")).reservedUsd).toBe(0);
    expect((await store.usage("alice")).remainingUsd).toBeGreaterThan(0.99);
  });
  it("retains unknown consumption through a service restart and allows only audited human reconciliation", async () => {
    provider.responses.create.mockRejectedValueOnce(Error("Connection lost"));
    const first = await create();
    await service.tick();
    expect((await req("/usage")).data.reason).toBe("unreconciled");
    await new Promise<void>((r) => server.close(() => r()));
    await service.stop();
    service = await createService(config);
    server = service.app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    expect((await req("/usage")).data.reason).toBe("unreconciled");
    const pending = (await req("/usage/pending", undefined, "marcelo", true))
      .data;
    expect(pending).toHaveLength(1);
    const body = {
      requestId: randomUUID(),
      callId: pending[0].id,
      actualUsd: 0.000735,
      evidence: "Comprobado en el proveedor: referencia sintética de prueba",
    };
    expect((await req("/usage/reconcile", body)).status).toBe(403);
    expect((await req("/usage/reconcile", body, "marcelo", true)).status).toBe(
      200,
    );
    expect((await req("/usage/reconcile", body, "marcelo", true)).status).toBe(
      200,
    );
    expect((await req("/usage")).data.reason).toBeNull();
    expect((await req("/usage")).data.reservedUsd).toBe(0);
    expect((await req("/cases")).data[0].id).toBe(first.data.id);
  });
  it("prevents budget changes by staff and records idempotent reviewer changes", async () => {
    const body = {
      requestId: randomUUID(),
      dailyUsd: 2,
      reason: "Prueba explícita del cambio autorizado",
    };
    expect((await req("/budget", body)).status).toBe(403);
    expect((await req("/budget", body, "marcelo", true)).status).toBe(200);
    expect((await req("/budget", body, "marcelo", true)).status).toBe(200);
    expect(
      (await req("/budget", { ...body, dailyUsd: 3 }, "marcelo", true)).status,
    ).toBe(409);
    expect((await req("/usage")).data.dailyUsd).toBe(2);
    expect(
      (
        await service.pool.query(
          "SELECT count(*)::int AS n FROM support_budget_changes",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("warns at 80 percent and sends budget alerts without any model calls, preserving failures for retry", async () => {
    await service.chat!.store.transaction((db) =>
      service.chat!.store.alert(
        db,
        "synthetic-warning",
        "budget_warning",
        "Presupuesto al 80%",
        "Prueba sin inferencia.",
      ),
    );
    await service.chat!.deliver();
    expect(
      (await req("/alerts", undefined, "marcelo", true)).data[0].delivery,
    ).toBe("disabled");
    expect(mail).not.toHaveBeenCalled();
    // A second instance with configured synthetic mail shares the same durable outbox.
    const sender = await createService({
      ...config,
      notification: {
        apiKey: "mock-mail",
        from: "sender@example.test",
        to: "owner@example.test",
      },
    });
    try {
      await service.pool.query(
        "UPDATE support_alerts SET next_attempt_at=now()",
      );
      mail.mockResolvedValueOnce(new Response("{}", { status: 503 }));
      await sender.chat!.deliver();
      expect(
        (await req("/alerts", undefined, "marcelo", true)).data[0].delivery,
      ).toBe("failed");
      await service.pool.query(
        "UPDATE support_alerts SET next_attempt_at=now()",
      );
      await sender.chat!.deliver();
      await sender.chat!.deliver();
      expect(mail).toHaveBeenCalledTimes(2);
      expect(mail.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
        mail.mock.calls[1][1].headers["Idempotency-Key"],
      );
      expect(provider.responses.create).not.toHaveBeenCalled();
    } finally {
      await sender.stop();
    }
    const created = await create();
    const id = await service.chat!.store.reserve(
      created.data.id,
      "alice",
      100,
      100,
    );
    await service.chat!.store.settle(id, 100, 40, 0, "known");
    await service.pool.query(
      "UPDATE support_usage_days SET spent_micros=800000",
    );
    const next = await service.chat!.store.reserve(
      created.data.id,
      "alice",
      100,
      100,
    );
    await service.chat!.store.settle(next, 100, 40, 0, "known2");
    expect(
      (await req("/alerts", undefined, "marcelo", true)).data.some(
        (a: any) => a.kind === "budget_warning",
      ),
    ).toBe(true);
  });
  it("runs research and its independent review through the same monetary ledger and creates a review notice", async () => {
    const report = {
      summary: "Resultado sintético para validar el circuito",
      recommendedAction: "code_change",
      certainty: "sustentado_en_codigo",
      cause: "Causa sintética respaldada por lectura",
      proposal: "Preparar una corrección de prueba",
      proposedTests: [
        "Entrada sintética: mostrar el resultado conservando los datos",
      ],
      questions: [],
      dataRepair: "",
      limitations: [
        "Proveedor simulado; no demuestra calidad real del diagnóstico",
      ],
      evidence: [
        {
          path: "shared/support-recommendation.ts",
          start: 1,
          end: 3,
          explanation: "Lectura sintética para validar procedencia",
        },
      ],
    };
    const step = (action: string, extra: Record<string, unknown> = {}) => ({
      action,
      path: null,
      term: null,
      prefix: null,
      start: null,
      end: null,
      missing: null,
      question: null,
      report: null,
      ...extra,
    });
    steps.push(
      {
        action: "investigate",
        reply: "Voy a revisar el código.",
        observations: "",
      },
      step("read_code", {
        path: "shared/support-recommendation.ts",
        start: 1,
        end: 15,
      }),
      step("report", { report }),
      { approved: true, issues: [] },
    );
    const created = await create();
    await service.tick();
    const ticket = (await req("/cases")).data[0];
    expect(ticket.id).toBe(created.data.id);
    expect(ticket.changeCandidate?.status).toBe("awaiting_review");
    expect(provider.responses.create).toHaveBeenCalledTimes(4);
    const usage = (await req("/usage")).data;
    expect(usage.investigationsUsed).toBe(1);
    expect(
      (
        await service.pool.query(
          "SELECT count(*)::int AS n FROM support_provider_calls",
        )
      ).rows[0].n,
    ).toBe(4);
    const alerts = (await req("/alerts", undefined, "marcelo", true)).data;
    expect(alerts.some((a: any) => a.kind === "approval")).toBe(true);
    await req(`/cases/${ticket.id}/chat`, {
      requestId: randomUUID(),
      text: "La propuesta no responde a mi consulta",
    });
    expect((await req("/cases")).data[0].changeCandidate.status).toBe(
      "invalidated",
    );
    expect(
      (await req(`/cases/${ticket.id}/analyze`, { requestId: randomUUID() }))
        .status,
    ).toBe(409);
  });
  it("honors the shared research cap and does not consume the research model when it is full", async () => {
    for (let i = 0; i < 10; i++)
      await service.pool.query(
        "INSERT INTO support_runs(id,owner,request_id,kind) VALUES($1,'other',$2,'research')",
        [randomUUID(), randomUUID()],
      );
    steps.push({
      action: "investigate",
      reply: "Necesito comprobarlo en código.",
      observations: "",
    });
    const first = await create();
    await service.tick();
    const ticket = (await req("/cases")).data[0];
    expect(ticket.id).toBe(first.data.id);
    expect(ticket.messages.at(-1).text).toContain("cupo diario");
    expect(provider.responses.create).toHaveBeenCalledTimes(1);
  });
  it("rejects a model attempt to change permissions or budget and preserves the case for human review", async () => {
    steps.push({ action: "change_budget", dailyUsd: 100, grantAdmin: true });
    const first = await create();
    await service.tick();
    const ticket = (await req("/cases")).data[0];
    expect(ticket.id).toBe(first.data.id);
    expect(ticket.status).toBe("failed");
    expect((await req("/usage")).data.dailyUsd).toBe(1);
    expect(
      (await req("/alerts", undefined, "marcelo", true)).data.some(
        (a: any) => a.kind === "human_review",
      ),
    ).toBe(true);
  });
  it("detects a crashed provider call and alerts without waiting for another user message", async () => {
    const first = await create();
    const call = await service.chat!.store.reserve(
      first.data.id,
      "alice",
      100,
      100,
    );
    await service.pool.query(
      "UPDATE support_provider_calls SET created_at=now()-interval '8 minutes' WHERE id=$1",
      [call],
    );
    await service.pool.query(
      "UPDATE support_cases SET data=jsonb_set(data,'{status}','\"received\"') WHERE id=$1",
      [first.data.id],
    );
    await service.chat!.tick();
    expect((await req("/usage")).data.reason).toBe("unreconciled");
    expect(
      (await req("/alerts", undefined, "marcelo", true)).data.some(
        (a: any) => a.kind === "budget_paused",
      ),
    ).toBe(true);
    expect(provider.responses.create).not.toHaveBeenCalled();
  });
  it("does not email an approval request after the case was closed or the proposal invalidated", async () => {
    const first = await create();
    const candidateId = randomUUID();
    await service.pool.query("UPDATE support_cases SET data=$2 WHERE id=$1", [
      first.data.id,
      {
        ...first.data,
        status: "closed",
        changeCandidate: { id: candidateId, status: "awaiting_review" },
      },
    ]);
    await service.chat!.store.transaction((db) =>
      service.chat!.store.alert(
        db,
        "obsolete-fixture",
        "approval",
        "Revisión",
        "Caso cerrado",
        first.data.id,
        candidateId,
      ),
    );
    const sender = await createService({
      ...config,
      notification: {
        apiKey: "mock-mail",
        from: "sender@example.test",
        to: "owner@example.test",
      },
    });
    try {
      await sender.chat!.deliver();
      expect(mail).not.toHaveBeenCalled();
      expect(
        (await req("/alerts", undefined, "marcelo", true)).data[0].delivery,
      ).toBe("obsolete");
    } finally {
      await sender.stop();
    }
  });
});
