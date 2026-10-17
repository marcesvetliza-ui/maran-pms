import { describe, expect, it } from "vitest";
import { diagnosisFailure, investigationMetrics } from "../../services/programming-assistant/errors";
describe("safe diagnosis failures", () => {
  it("distinguishes exhausted credit from request rate limits", () => {
    expect(
      diagnosisFailure({ status: 429, code: "insufficient_quota" }).code,
    ).toBe("api_quota");
    expect(
      diagnosisFailure({ status: 429, code: "rate_limit_exceeded" }).code,
    ).toBe("api_rate_limit");
  });
  it("does not expose arbitrary provider messages or secrets", () => {
    for (const status of [400, 401, 403, 404, 500, undefined]) {
      expect(
        JSON.stringify(
          diagnosisFailure({ status, message: "secret-provider-payload" }),
        ),
      ).not.toContain("secret-provider-payload");
    }
  });
  it("distinguishes invalid reports and timeouts", () => {
    expect(diagnosisFailure({ name: "ZodError" }).code).toBe("report_format");
    expect(diagnosisFailure({ name: "TimeoutError" }).code).toBe("timeout");
  });
});

describe("investigation metrics", () => {
  it("distinguishes the exact exhausted resource", () => {
    for (const code of ["investigation_tokens", "investigation_rounds", "diagnosis_length"]) {
      expect(diagnosisFailure({code,message:"Se alcanzó el límite"}).code).toBe(code);
    }
  });
  it("logs counters without arbitrary provider content", () => {
    expect(investigationMetrics({ investigation: { rounds: 12, calls: 20, tokens: 60000, phase: "closing", payload: "secret-provider-payload" } }))
      .toEqual({ rounds: 12, calls: 20, tokens: 60000, phase: "closing" });
    expect(investigationMetrics({investigation:{rounds:1,calls:0,tokens:100,phase:"secret-provider-payload"}})).toBeUndefined();
    expect(investigationMetrics({investigation:{rounds:1,calls:0,tokens:"secret-provider-payload",phase:"research"}})).toBeUndefined();
  });
});

it('explains a failed independent coherence review without exposing model content',()=>{
 expect(diagnosisFailure({code:'evidence_semantic_rejected',message:'private provider output'})).toMatchObject({code:'diagnosis_coherence'});
 expect(diagnosisFailure({code:'evidence_audit_invalid',message:'private provider output'})).toMatchObject({code:'diagnosis_audit'});
 expect(JSON.stringify(diagnosisFailure({code:'evidence_semantic_rejected',message:'private provider output'}))).not.toContain('private provider output');
});
