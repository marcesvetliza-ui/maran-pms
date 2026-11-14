import { describe, it, expect, vi } from "vitest";
import {
  supportChatCreateSchema,
  supportChatMessageSchema,
} from "../../shared/support-chat";
import {
  hotelDay,
  pricedUsage,
  SupportPaused,
} from "../../services/programming-assistant/chat-store";
import { validateSupportImage } from "../../services/programming-assistant/chat-images";
import { meteredResponses } from "../../services/programming-assistant/metered-responses";

const image = {
  name: "captura.png",
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
};
describe("conversational support boundaries", () => {
  it("pins standard pricing and quarantines a provider response charged under another tier", async () => {
    const store = {
      reserve: vi.fn(async () => "call-id"),
      settle: vi.fn(),
      uncertain: vi.fn(),
    };
    const response = {
      id: "response-test",
      model: "gpt-5.3-codex",
      service_tier: "default",
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
      },
    };
    const provider = {
      responses: {
        inputTokens: { count: vi.fn(async () => ({ input_tokens: 100 })) },
        create: vi
          .fn()
          .mockResolvedValueOnce(response)
          .mockResolvedValueOnce({ ...response, service_tier: "priority" }),
      },
    };
    const client = meteredResponses(
      store as any,
      provider as any,
      "case",
      "alice",
      "gpt-5.3-codex",
    );
    const request = {
      model: "gpt-5.3-codex",
      store: false as const,
      stream: false as const,
      tools: [],
      tool_choice: "none" as const,
      max_output_tokens: 100,
      input: "consulta",
    };
    await client.responses.create(request, {
      signal: new AbortController().signal,
    });
    expect(provider.responses.create.mock.calls[0][0].service_tier).toBe(
      "default",
    );
    await expect(
      client.responses.create(request, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Consumo sin verificar");
    expect(store.settle).toHaveBeenCalledTimes(1);
    expect(store.uncertain).toHaveBeenCalledWith("call-id");
  });
  it("accepts natural text or an image without requiring a technical form and rejects claimed authority", () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    expect(
      supportChatCreateSchema.parse({
        requestId,
        text: "Me apareció este mensaje",
        page: "/planning",
      }).text,
    ).toContain("mensaje");
    expect(
      supportChatMessageSchema.parse({ requestId, images: [image] }).images,
    ).toHaveLength(1);
    expect(
      supportChatCreateSchema.safeParse({
        requestId,
        text: "Ayuda",
        canReview: true,
      }).success,
    ).toBe(false);
    expect(
      supportChatMessageSchema.safeParse({ requestId, text: "", images: [] })
        .success,
    ).toBe(false);
  });
  it("only accepts bounded image data and rejects external URLs, SVG and spoofed signatures", () => {
    expect(validateSupportImage(image).name).toBe("captura.png");
    for (const dataUrl of [
      "https://example.test/image.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/jpeg;base64," + Buffer.alloc(30).toString("base64"),
    ])
      expect(() => validateSupportImage({ ...image, dataUrl })).toThrow();
    const large = Buffer.from(image.dataUrl.split(",")[1], "base64");
    large.writeUInt32BE(50000, 16);
    expect(() =>
      validateSupportImage({
        ...image,
        dataUrl: "data:image/png;base64," + large.toString("base64"),
      }),
    ).toThrow("1600");
  });
  it("renews at Argentina midnight across month/year boundaries", () => {
    expect(hotelDay(new Date("2027-01-01T02:59:59Z")).day).toBe("2026-12-31");
    expect(hotelDay(new Date("2027-01-01T03:00:00Z")).day).toBe("2027-01-01");
    expect(hotelDay(new Date("2026-11-14T19:00:00Z")).end.toISOString()).toBe(
      "2026-11-15T03:00:00.000Z",
    );
  });
  it("charges cached input separately and rejects impossible usage", () => {
    expect(pricedUsage(1000, 100, 500)).toBe(2363);
    expect(() => pricedUsage(100, 10, 101)).toThrow();
    expect(() => pricedUsage(NaN, 0)).toThrow();
  });
  it("counts before reserving and never generates when the budget rejects admission", async () => {
    const order: string[] = [];
    const store = {
      reserve: vi.fn(async () => {
        order.push("reserve");
        throw new SupportPaused("daily_budget", "Sin saldo");
      }),
      settle: vi.fn(),
      uncertain: vi.fn(),
    };
    const provider = {
      responses: {
        inputTokens: {
          count: vi.fn(async () => {
            order.push("count");
            return { input_tokens: 200 };
          }),
        },
        create: vi.fn(),
      },
    };
    const client = meteredResponses(
      store as any,
      provider as any,
      "case",
      "alice",
      "gpt-5.3-codex",
    );
    await expect(
      client.responses.create(
        {
          model: "gpt-5.3-codex",
          store: false,
          stream: false,
          tools: [],
          tool_choice: "none",
          max_output_tokens: 100,
          input: "consulta",
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow("Sin saldo");
    expect(order).toEqual(["count", "reserve"]);
    expect(provider.responses.create).not.toHaveBeenCalled();
    expect(store.uncertain).not.toHaveBeenCalled();
  });
  it("keeps uncertain provider consumption reserved and disables automatic provider retries", async () => {
    const store = {
      reserve: vi.fn(async () => "call-id"),
      settle: vi.fn(),
      uncertain: vi.fn(),
    };
    const provider = {
      responses: {
        inputTokens: { count: vi.fn(async () => ({ input_tokens: 100 })) },
        create: vi.fn(async () => {
          throw Error("Connection lost after send");
        }),
      },
    };
    const client = meteredResponses(
      store as any,
      provider as any,
      "case",
      "alice",
      "gpt-5.3-codex",
    );
    await expect(
      client.responses.create(
        {
          model: "gpt-5.3-codex",
          store: false,
          stream: false,
          tools: [],
          tool_choice: "none",
          max_output_tokens: 100,
          input: "consulta",
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow("Connection lost");
    expect(provider.responses.create).toHaveBeenCalledTimes(1);
    expect(store.uncertain).toHaveBeenCalledWith("call-id");
    expect(store.settle).not.toHaveBeenCalled();
  });
  it("refuses models without the configured price and any native tool request", async () => {
    const provider = {
      responses: { inputTokens: { count: vi.fn() }, create: vi.fn() },
    };
    expect(() =>
      meteredResponses(
        {} as any,
        provider as any,
        "case",
        "alice",
        "arbitrary-model",
      ),
    ).toThrow("tarifa");
    const client = meteredResponses(
      {} as any,
      provider as any,
      "case",
      "alice",
      "gpt-5.3-codex",
    );
    await expect(
      client.responses.create(
        {
          model: "gpt-5.3-codex",
          store: false,
          stream: false,
          tools: [{ type: "web_search_preview" }],
          tool_choice: "auto",
          max_output_tokens: 100,
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow("no permitida");
    expect(provider.responses.inputTokens.count).not.toHaveBeenCalled();
    expect(provider.responses.create).not.toHaveBeenCalled();
  });
});
