import { randomUUID } from "node:crypto";
import type { SupportTicket } from "../../shared/programming-support";
import { converse } from "./chat-conversation";
import { chatPrices, pricedUsage, SupportPaused } from "./chat-store";
import { meteredResponses, type MeteredProvider } from "./metered-responses";
import { chatSmokeInputs, chatSmokeRubric } from "./chat-evaluation-cases";
import { evaluationRevisionSelection } from "./evaluation-profile";

export const chatSmokeLimits = { maxInputTokens: 10000, maxOutputTokens: 2000, maxGenerations: 3, maximumApprovedUsd: 0.15 };
const maximumCallMicros = () => pricedUsage(Math.ceil(chatSmokeLimits.maxInputTokens * 1.1) + 1024, chatSmokeLimits.maxOutputTokens);

export function chatEvaluationPlan(env: Record<string, string | undefined>) {
  const revisionCheck = evaluationRevisionSelection(env);
  const approved = Number(env.SUPPORT_CHAT_EVALUATION_APPROVED_USD);
  const budgetValid = !!env.SUPPORT_CHAT_EVALUATION_APPROVED_USD && Number.isFinite(approved) && approved > 0 && approved <= chatSmokeLimits.maximumApprovedUsd;
  const missing = [
    ...(revisionCheck.reason !== "selected" ? ["matching SUPPORT_EVALUATION_RUN_REVISION and actual RAILWAY_GIT_COMMIT_SHA"] : []),
    ...(!env.OPENAI_API_KEY?.trim() ? ["OPENAI_API_KEY"] : []),
    ...(env.SUPPORT_CODEX_MODEL !== chatPrices.model ? ["SUPPORT_CODEX_MODEL with the verified chat pricing profile"] : []),
    ...(env.SUPPORT_CODEX_PAID_ENABLED !== "true" ? ["SUPPORT_CODEX_PAID_ENABLED=true"] : []),
    ...(!budgetValid ? ["fresh SUPPORT_CHAT_EVALUATION_APPROVED_USD (0 < USD <= 0.15)"] : []),
  ];
  const maximumReservationUsd = maximumCallMicros() * chatSmokeInputs.length / 1e6;
  if (budgetValid && approved < maximumReservationUsd) missing.push("budget sufficient for the three bounded maximum reservations");
  return {
    kind: "chat-entry-smoke-evaluation", scope: "conversation and routing only; no technical investigation or hotel operations",
    revisionCheck, requestedModel: env.SUPPORT_CODEX_MODEL || null, reportedModel: null,
    executed: false, providerTurns: 0, maximumReservationUsd,
    approvedUsd: budgetValid ? approved : null, limits: chatSmokeLimits,
    historicalProfileIgnored: !!env.SUPPORT_EVALUATION_PROFILE,
    missingConfiguration: missing, configurationReady: missing.length === 0,
    sharedDailyBudgetReservation: "operator must verify and allocate within the pilot daily balance before execution",
    inputs: chatSmokeInputs, rubric: chatSmokeRubric,
    humanTechnicalReview: "pending", humanUsefulnessReview: "pending",
  };
}

/** Reuses the normal chat meter with an isolated per-run ledger; no database access. */
export async function runChatSmokeEvaluation(
  config: { revision: string; model: string; approvedUsd: number },
  provider: MeteredProvider,
) {
  if (!/^[a-f0-9]{40}$/.test(config.revision) || config.model !== chatPrices.model ||
      !Number.isFinite(config.approvedUsd) || config.approvedUsd <= 0 || config.approvedUsd > chatSmokeLimits.maximumApprovedUsd)
    throw Error("invalid_chat_evaluation_configuration");
  const approvedMicros = Math.floor(config.approvedUsd * 1e6);
  if (approvedMicros < maximumCallMicros() * chatSmokeInputs.length)
    throw new SupportPaused("evaluation_budget", "Budget does not cover the bounded run");
  let spent = 0, reserved = 0, uncertain = false;
  const calls = new Map<string, { amount: number; settled: boolean }>();
  const ledger = {
    async reserve(_case: string, _owner: string, input: number, output: number) {
      if (!Number.isSafeInteger(input) || input < 1 || input > chatSmokeLimits.maxInputTokens || output !== chatSmokeLimits.maxOutputTokens)
        throw new SupportPaused("input_limit", "Evaluation input is not bounded");
      const amount = pricedUsage(Math.ceil(input * 1.1) + 1024, output);
      if (uncertain || spent + reserved + amount > approvedMicros) throw new SupportPaused("evaluation_budget", "Evaluation budget unavailable");
      const id = randomUUID(); calls.set(id, { amount, settled: false }); reserved += amount; return id;
    },
    async settle(id: string, input: number, output: number, cached: number, _providerId: string) {
      const call = calls.get(id); if (!call || call.settled) throw Error("invalid_evaluation_reservation");
      const actual = pricedUsage(input, output, cached);
      if (actual > call.amount) { uncertain = true; throw Error("unverified_evaluation_usage"); }
      call.settled = true; reserved -= call.amount; spent += actual;
    },
    async uncertain(_id: string) { uncertain = true; },
  };
  const started = performance.now();
  const results: Array<Record<string, unknown>> = [];
  let providerTurns = 0, countRequests = 0;
  for (const item of chatSmokeInputs) {
    const startedCase = performance.now(), reportedModels: string[] = [];
    let caseTurns = 0;
    const tokenUsage: Array<{ input: number; output: number; cached: number }> = [];
    const observed: MeteredProvider = { responses: {
      inputTokens: { async count(body, options) { countRequests++; return provider.responses.inputTokens.count(body, options); } },
      async create(body, options) {
        providerTurns++; caseTurns++;
        const response = await provider.responses.create(body, options);
        if (typeof response.model === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(response.model)) reportedModels.push(response.model);
        const usage = response.usage;
        if (usage && [usage.input_tokens, usage.output_tokens, usage.input_tokens_details?.cached_tokens].every(n => Number.isSafeInteger(n) && n >= 0))
          tokenUsage.push({ input: usage.input_tokens, output: usage.output_tokens, cached: usage.input_tokens_details.cached_tokens });
        return response;
      },
    } };
    const ticket = {
      id: item.id, title: "Consulta de soporte", module: "otro", actual: item.text,
      expected: "Recibir asistencia sobre el problema informado", steps: "", reference: "", page: "",
      version: config.revision, environment: "pilot", status: "received", createdBy: "synthetic-evaluator",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), report: null, lastError: null,
      messages: [{ id: randomUUID(), author: "user", text: item.text, createdAt: new Date().toISOString() }],
    } as SupportTicket;
    try {
      const reply = await converse(ticket, [], meteredResponses(ledger, observed, item.id, "synthetic-evaluator", config.model), config.model);
      results.push({ id: item.id, control: chatSmokeRubric[item.id].control, status: "completed", requestedModel: config.model, reportedModels,
        reply, actionCheck: { expected: chatSmokeRubric[item.id].action, observed: reply.action, passed: reply.action === chatSmokeRubric[item.id].action },
        providerTurns: caseTurns, tokenUsage, elapsedMs: Math.round(performance.now() - startedCase), technicalInvestigationExecuted: false,
        technicalReview: { reviewer: null, verdict: null }, usefulnessReview: { reviewer: null, verdict: null } });
      if (reply.action !== chatSmokeRubric[item.id].action) break;
    } catch (error) {
      const reason = error instanceof SupportPaused ? error.reason : "provider_or_response_failure";
      results.push({ id: item.id, control: chatSmokeRubric[item.id].control, status: "failed", failureCode: reason,
        requestedModel: config.model, reportedModels, providerTurns: caseTurns, tokenUsage, elapsedMs: Math.round(performance.now() - startedCase),
        technicalReview: { reviewer: null, verdict: null }, usefulnessReview: { reviewer: null, verdict: null } });
      break; // No retries or another paid case after a failure.
    }
  }
  return { kind: "chat-entry-smoke-evaluation", revision: config.revision, requestedModel: config.model,
    executed: true, approvedUsd: config.approvedUsd, calculatedUsd: spent / 1e6, reservedUsd: reserved / 1e6,
    usageIncomplete: uncertain, providerTurns, tokenCountRequests: countRequests, elapsedMs: Math.round(performance.now() - started),
    plannedCases: chatSmokeInputs.map(item => item.id),
    notExecutedCases: chatSmokeInputs.slice(results.length).map(item => item.id),
    results, stopped: results.length !== chatSmokeInputs.length || results.some(r => r.status === "failed" || !(r.actionCheck as { passed?: boolean } | undefined)?.passed),
    routingChecksPassed: results.length === chatSmokeInputs.length && results.every(r => r.status === "completed" && (r.actionCheck as { passed: boolean }).passed),
    qualityAccepted: false, humanReviewRequired: true, technicalInvestigationExecuted: false, hotelOperationsExecuted: false };
}
