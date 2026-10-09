import { it, expect, vi } from "vitest";
import { notifyReady } from "../../services/programming-assistant/notify";
it("sends only a generic opt-in notification with no diagnosis content", async () => {
  const send = vi.fn(async () => new Response("{}", { status: 200 }));
  await notifyReady(
    {
      apiKey: "mock-key",
      from: "sender@example.test",
      to: "owner@example.test",
    },
    "11111111-1111-1111-1111-111111111111",
    send as typeof fetch,
  );
  const body = JSON.parse(
    (send.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(body.text).toContain("demo.maranpms.com.ar/programming-support");
  expect(Object.keys(body).sort()).toEqual(["from", "subject", "text", "to"]);
});
