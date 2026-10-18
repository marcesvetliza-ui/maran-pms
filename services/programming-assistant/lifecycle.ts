/** One case ceiling, including rejected drafts and both independent audits.
 * Estimates include the serialized request (schemas too), not just its messages.
 * Actual provider usage remains authoritative and is checked after every call.
 */
export const CASE_TOKENS = 100000;
export const AUTHOR_OUTPUT = 4200;
export const AUDIT_OUTPUT = 3200;
export type DiagnosisStage = "orientation" | "research" | "draft" | "validation" | "audit" | "correction" | "reaudit" | "finalize";
export type StageEvent = {
  stage: DiagnosisStage;
  outcome: "completed" | "approved" | "rejected" | "invalid" | "blocked" | "failed";
  tokens: number;
  totalTokens: number;
  elapsedMs: number;
  estimatedTokens?: number;
  reservedTokens?: number;
  availableTokens?: number;
  issueCount?: number;
  issueStatements?: string[];
  reason?: "schema" | "provenance" | "claim" | "attribution" | "consistency" | "budget";
};

export function requestCost(request: unknown, outputTokens: number) {
  // Spanish prose and source code; intentionally more conservative than /3.
  // The protocol overhead is reserved separately, even for a tiny mocked prompt.
  return Math.ceil(JSON.stringify(request).length / 2) + 512 + outputTokens;
}

/** Per-case calibration from provider prompt usage, never completion usage.
 * Source/Spanish JSON was overestimated by >2x in the real evaluation. Retain
 * a /3 floor, 25% margin over the largest measured density, and fixed overhead.
 * This remains an estimate: actual usage checks and fail-closed caps still apply.
 */
export class RequestBudget {
  private largestDensity=0;
  observe(request:unknown,promptTokens:unknown) {
    if(typeof promptTokens!=="number" || !Number.isFinite(promptTokens) || promptTokens<=0)return;
    this.largestDensity=Math.max(this.largestDensity,promptTokens/JSON.stringify(request).length);
  }
  estimate(request:unknown,outputTokens:number) {
    const density=this.largestDensity ? Math.max(1/3,this.largestDensity*1.25) : 1/2;
    return Math.ceil(JSON.stringify(request).length*density)+512+outputTokens;
  }
}

export function fits(tokens: number, ...costs: number[]) {
  return tokens + costs.reduce((sum, cost) => sum + cost, 0) <= CASE_TOKENS;
}

/** A correction can change its length; keep output-sized headroom for re-audit.
 * This is a reservation, never authorization to skip the second audit.
 */
export function correctionCycleCost(correctionRequest: unknown, auditCost: number,estimate=requestCost) {
  return estimate(correctionRequest, AUTHOR_OUTPUT) + auditCost + AUTHOR_OUTPUT;
}

export class StageTelemetry {
  readonly events: StageEvent[] = [];
  constructor(private readonly now = () => Date.now()) {}
  start() { return this.now(); }
  record(stage: DiagnosisStage, outcome: StageEvent["outcome"], started: number,
    tokens: number, totalTokens: number, extra: Pick<StageEvent, "estimatedTokens" | "reservedTokens" | "availableTokens" | "issueCount" | "issueStatements" | "reason"> = {}) {
    // Only enums and bounded numeric counters; never report/case/provider text.
    if (this.events.length < 100) this.events.push({
      stage, outcome, tokens, totalTokens, elapsedMs: Math.max(0, this.now() - started), ...extra,
    });
  }
}

export function safeStageEvents(input: unknown): StageEvent[] {
  if(!Array.isArray(input))return [];
  const stages=["orientation","research","draft","validation","audit","correction","reaudit","finalize"];
  const outcomes=["completed","approved","rejected","invalid","blocked","failed"];
  const reasons=["schema","provenance","claim","attribution","consistency","budget"];
  const numeric=(n:unknown)=>typeof n==="number" && Number.isFinite(n) && n>=0;
  return input.slice(0,100).filter(e=>e && stages.includes(e.stage) && outcomes.includes(e.outcome)
    && numeric(e.tokens) && numeric(e.totalTokens) && numeric(e.elapsedMs)).map(e=>({
    stage:e.stage,outcome:e.outcome,tokens:e.tokens,totalTokens:e.totalTokens,elapsedMs:e.elapsedMs,
    ...(numeric(e.estimatedTokens)?{estimatedTokens:e.estimatedTokens}:{}),
     ...(numeric(e.reservedTokens)?{reservedTokens:e.reservedTokens}:{}),
     ...(numeric(e.availableTokens)?{availableTokens:e.availableTokens}:{}),
    ...(numeric(e.issueCount)?{issueCount:e.issueCount}:{}),
    ...(Array.isArray(e.issueStatements)?{issueStatements:e.issueStatements.slice(0,4).filter((id:unknown)=>typeof id==="string" && /^(summary|cause|proposal|certainty|limitations|proposedTests|questions|dataRepair|evidence)_[1-9]\d{0,2}_[1-9]\d{0,2}$/.test(id))}:{}),
    ...(reasons.includes(e.reason)?{reason:e.reason}:{}),
  }));
}
