import { getReservationRateValidationError, parseReservationRate } from "./reservationRate";

export function isNightAuditReportingOnly(
  options: { forceDate?: string; isManual?: boolean },
  existingAudit: boolean,
): boolean {
  return Boolean(options.forceDate) || (Boolean(options.isManual) && existingAudit);
}

export function isActiveNightAuditPayment(status: string | null | undefined): boolean {
  return status == null || status === "active";
}

export type NightAuditScope = "inHouse" | "arrival";
export type NightAuditDetail = {
  version: number;
  auditDate?: string;
  nextDate?: string;
  generatedAt?: string;
  inHouse: any[];
  arrivals: any[];
  snapshot?: Record<string, any>;
  indicators?: Record<string, any>;
};

/** Accepts both legacy JSON and the versioned snapshot contract. */
export function parseNightAuditDetail(value: unknown): NightAuditDetail {
  let parsed: any = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = {}; }
  }
  if (!parsed || typeof parsed !== "object") parsed = {};
  const snapshot = parsed.snapshot && typeof parsed.snapshot === "object" ? parsed.snapshot : undefined;
  return {
    version: Number(parsed.version ?? (snapshot ? 1 : 0)),
    auditDate: parsed.auditDate,
    nextDate: parsed.nextDate,
    generatedAt: parsed.generatedAt,
    inHouse: Array.isArray(parsed.inHouse) ? parsed.inHouse : (Array.isArray(snapshot?.inHouse) ? snapshot.inHouse : []),
    arrivals: Array.isArray(parsed.arrivals) ? parsed.arrivals : (Array.isArray(snapshot?.arrivals) ? snapshot.arrivals : []),
    snapshot,
    indicators: parsed.indicators ?? snapshot?.indicators,
  };
}

export function classifyReservationRate(rate: unknown, reason: unknown) {
  const normalized = typeof rate === "string" && !rate.trim() ? null : rate;
  const parsed = parseReservationRate(normalized);
  const validation = getReservationRateValidationError(normalized, reason);
  if (parsed === 0 && !String(reason ?? "").trim()) return "missingOrZeroWithoutReason";
  if (parsed === 0 && !validation) return "zeroWithReason";
  if (parsed === null || validation) return "missingOrZeroWithoutReason";
  return null;
}