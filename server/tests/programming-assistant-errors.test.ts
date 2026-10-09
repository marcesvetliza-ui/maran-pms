import { describe, expect, it } from "vitest";
import { diagnosisFailure } from "../../services/programming-assistant/errors";
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
