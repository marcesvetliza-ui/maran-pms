import { expect, it, vi } from "vitest";
import { chatEvaluationPlan, runChatSmokeEvaluation } from "../../services/programming-assistant/chat-evaluation";
import { chatSmokeRubric } from "../../services/programming-assistant/chat-evaluation-cases";
import { pricedUsage } from "../../services/programming-assistant/chat-store";
import type { MeteredProvider } from "../../services/programming-assistant/metered-responses";

const revision = "b".repeat(40), model = "gpt-5.3-codex";
const config = { revision, model, approvedUsd: 0.15 };
const ready = { RAILWAY_GIT_COMMIT_SHA: revision, SUPPORT_EVALUATION_RUN_REVISION: revision,
  SUPPORT_CODEX_MODEL: model, SUPPORT_CODEX_PAID_ENABLED: "true", OPENAI_API_KEY: "synthetic-not-a-key",
  SUPPORT_CHAT_EVALUATION_APPROVED_USD: "0.15" };
function response(action: string) {
  return { id: "response-synthetic", model: model + "-2026-10-01", service_tier: "default", status: "completed", output: [],
    output_text: JSON.stringify({ action, reply: "Respuesta simulada; no es evidencia de calidad del modelo.", observations: "" }),
    usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 100 } } };
}
function fake() {
  return { responses: { inputTokens: { count: vi.fn(async () => ({ input_tokens: 1000 })) },
    create: vi.fn().mockResolvedValueOnce(response("reply")).mockResolvedValueOnce(response("reply")).mockResolvedValueOnce(response("investigate")) } };
}

it("prepares a zero-call plan and never accepts a historical USD 10 approval as the new run budget", () => {
  const plan = chatEvaluationPlan({ ...ready, SUPPORT_CHAT_EVALUATION_APPROVED_USD: undefined,
    SUPPORT_EVALUATION_PROFILE: "gpt53codex-2026-11-09", SUPPORT_EVALUATION_APPROVED_USD: "10" });
  expect(plan).toMatchObject({ executed: false, providerTurns: 0, configurationReady: false, historicalProfileIgnored: true, approvedUsd: null });
  expect(plan.missingConfiguration).toContain("fresh SUPPORT_CHAT_EVALUATION_APPROVED_USD (0 < USD <= 0.15)");
});
it("requires the actual revision, project credential and verified model even for the prepared plan", () => {
  const plan = chatEvaluationPlan({ ...ready, RAILWAY_GIT_COMMIT_SHA: undefined, OPENAI_API_KEY: undefined, SUPPORT_CODEX_MODEL: "unverified-model" });
  expect(plan.configurationReady).toBe(false);
  expect(plan.revisionCheck.reason).toBe("running_revision_missing_or_invalid");
  expect(plan.missingConfiguration).toContain("OPENAI_API_KEY");
  expect(plan.missingConfiguration).toContain("SUPPORT_CODEX_MODEL with the verified chat pricing profile");
});
it("bounds the three maximum reservations and rejects insufficient or enlarged budgets before counting tokens", async () => {
  expect(chatEvaluationPlan(ready)).toMatchObject({ configurationReady: true, maximumReservationUsd: 0.147126 });
  expect(chatEvaluationPlan({ ...ready, SUPPORT_CHAT_EVALUATION_APPROVED_USD: "0.10" }).configurationReady).toBe(false);
  expect(chatEvaluationPlan({ ...ready, SUPPORT_CHAT_EVALUATION_APPROVED_USD: "10" }).configurationReady).toBe(false);
  const provider = fake();
  await expect(runChatSmokeEvaluation({ ...config, approvedUsd: 0.10 }, provider as MeteredProvider)).rejects.toMatchObject({ reason: "evaluation_budget" });
  expect(provider.responses.inputTokens.count).not.toHaveBeenCalled();
  expect(provider.responses.create).not.toHaveBeenCalled();
});
it("records requested/reported models, usage, cost and separate reviews without sending the rubric to the candidate", async () => {
  const provider = fake();
  const result = await runChatSmokeEvaluation(config, provider as MeteredProvider);
  expect(result).toMatchObject({ executed: true, stopped: false, providerTurns: 3, tokenCountRequests: 3,
    requestedModel: model, calculatedUsd: 3 * pricedUsage(1000, 50, 100) / 1e6, reservedUsd: 0, usageIncomplete: false,
    routingChecksPassed: true, qualityAccepted: false, humanReviewRequired: true, hotelOperationsExecuted: false,
    technicalInvestigationExecuted: false, notExecutedCases: [] });
  for (const row of result.results) {
    expect(row).toMatchObject({ reportedModels: [model + "-2026-10-01"], providerTurns: 1,
      tokenUsage: [{ input: 1000, output: 50, cached: 100 }], technicalReview: { reviewer: null, verdict: null }, usefulnessReview: { reviewer: null, verdict: null } });
    expect(Number(row.elapsedMs)).toBeGreaterThanOrEqual(0);
  }
  for (const [body] of provider.responses.create.mock.calls) {
    expect(body).toMatchObject({ model, store: false, stream: false, tool_choice: "none", tools: [], service_tier: "default", max_output_tokens: 2000 });
    const wire = JSON.stringify(body);
    for (const rubric of Object.values(chatSmokeRubric)) expect(wire).not.toContain(rubric.review);
    expect(wire).not.toContain('"actionCheck"');
    expect(wire).not.toContain('"control"');
  }
});
it("includes an automatic-check failure and the unexecuted cases without promoting the verdict to quality acceptance", async () => {
  const provider = fake(); provider.responses.create.mockReset().mockResolvedValue(response("investigate"));
  const result = await runChatSmokeEvaluation(config, provider as MeteredProvider);
  expect(result).toMatchObject({ stopped: true, routingChecksPassed: false, qualityAccepted: false, providerTurns: 1,
    notExecutedCases: ["operational-authority", "screen-guidance"] });
  expect(result.results[0]).toMatchObject({ status: "completed", actionCheck: { passed: false } });
});
it("keeps uncertain consumption reserved after a connection failure and never retries or continues", async () => {
  const provider = fake(); provider.responses.create.mockReset().mockRejectedValue(Error("private provider body"));
  const result = await runChatSmokeEvaluation(config, provider as MeteredProvider);
  expect(result).toMatchObject({ stopped: true, providerTurns: 1, tokenCountRequests: 1, usageIncomplete: true, calculatedUsd: 0 });
  expect(result.reservedUsd).toBeGreaterThan(0);
  expect(result.results[0]).toMatchObject({ status: "failed", failureCode: "provider_or_response_failure" });
  expect(JSON.stringify(result)).not.toContain("private provider body");
  expect(provider.responses.create).toHaveBeenCalledTimes(1);
});
it.each([
  { change: { model: "another-model" }, uncertain: true },
  { change: { service_tier: "priority" }, uncertain: true },
  { change: { usage: undefined }, uncertain: true },
  { change: { output_text: "invalid JSON" }, uncertain: false },
])("retains failed and partial results for unverified usage or invalid output: $change", async ({ change, uncertain }) => {
  const provider = fake(); provider.responses.create.mockReset().mockResolvedValue({ ...response("reply"), ...change });
  const result = await runChatSmokeEvaluation(config, provider as MeteredProvider);
  expect(result).toMatchObject({ stopped: true, qualityAccepted: false, providerTurns: 1, usageIncomplete: uncertain });
  expect(result.results[0]).toMatchObject({ status: "failed" });
  expect(result.notExecutedCases).toHaveLength(2);
  if (uncertain) expect(result.reservedUsd).toBeGreaterThan(0);
  else expect(result.calculatedUsd).toBeGreaterThan(0);
});
it("stops on token-count failure before generation with zero spent and zero reservations", async () => {
  const provider = fake(); provider.responses.inputTokens.count.mockRejectedValue(Error("offline"));
  const result = await runChatSmokeEvaluation(config, provider as MeteredProvider);
  expect(result).toMatchObject({ stopped: true, providerTurns: 0, tokenCountRequests: 1, calculatedUsd: 0, reservedUsd: 0, usageIncomplete: false });
  expect(provider.responses.create).not.toHaveBeenCalled();
});
