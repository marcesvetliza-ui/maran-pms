import { initAppEnv, resetAppEnvForTests } from "../app-env";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  cfg: {} as any,
  send: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [state.cfg] }) }) },
}));
vi.mock("../lib/smtpTransport", () => ({
  createIpv4SmtpTransport: async () => ({
    sendMail: state.send,
    close: state.close,
  }),
}));
import { birthdayEmailReadiness, sendBirthdayEmail } from "../email-service";
const message = {
  to: "guest@example.invalid",
  subject: "Prueba",
  body: "Hola <script>ejemplo</script> & huésped",
  idempotencyKey: "synthetic-key",
};
beforeEach(() => {
  // Exercise the provider boundary with synthetic network/SMTP transports;
  // the pilot guard is tested separately below and remains enabled in Xenia.
  resetAppEnvForTests();
  initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
  state.cfg = {
    globalEnabled: true,
    provider: "resend",
    apiKey: "synthetic-not-a-key",
    fromName: "Hotel",
    fromEmail: "hotel@example.invalid",
  };
  state.send.mockReset();
  state.close.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); resetAppEnvForTests(); });
describe("Birthday provider boundary · simulated network only", () => {
  it("blocks birthday providers in pilot before any simulated network call", async () => {
    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await birthdayEmailReadiness()).ok).toBe(false);
    expect((await sendBirthdayEmail(message)).status).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("sends exactly one personalized recipient and escapes plain text in HTML", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"id":"accepted"}', { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendBirthdayEmail(message)).toEqual({
      status: "sent",
      providerId: "accepted",
    });
    const request = fetcher.mock.calls[0][1],
      body = JSON.parse(request.body);
    expect(body.to).toEqual(["guest@example.invalid"]);
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).not.toContain("<script>");
    expect(request.headers["Idempotency-Key"]).toBe("synthetic-key");
  });
  it.each([
    [400, "failed"],
    [429, "failed"],
    [500, "unknown"],
    [408, "unknown"],
  ])("classifies provider HTTP %s as %s", async (status, expected) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("{}", { status: status as number })),
    );
    expect((await sendBirthdayEmail(message)).status).toBe(expected);
  });
  it("treats an interrupted network request as uncertain rather than a retryable rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("synthetic failure")),
    );
    expect((await sendBirthdayEmail(message)).status).toBe("unknown");
  });
  it("does not call the provider when the global email configuration is disabled", async () => {
    state.cfg.globalEnabled = false;
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await birthdayEmailReadiness()).ok).toBe(false);
    expect((await sendBirthdayEmail(message)).status).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses SMTP acceptance and closes the connection", async () => {
    state.cfg = {
      ...state.cfg,
      provider: "smtp",
      smtpUser: "synthetic",
      smtpPass: "synthetic",
    };
    state.send.mockResolvedValue({
      accepted: ["guest@example.invalid"],
      messageId: "smtp-accepted",
    });
    expect(await sendBirthdayEmail(message)).toEqual({
      status: "sent",
      providerId: "smtp-accepted",
    });
    expect(state.close).toHaveBeenCalledTimes(1);
  });
});
