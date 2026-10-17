/** Map failures to fixed messages; never expose provider messages or request bodies. */
export function diagnosisFailure(error: unknown) {
  const e =
    error && typeof error === "object"
      ? (error as {
          status?: number;
          code?: string;
          name?: string;
          message?: string;
        })
      : {};
  if (e.status === 401)
    return {
      code: "api_auth",
      message:
        "OpenAI rechazó la clave de API. Revisá OPENAI_API_KEY en el servicio del asistente.",
    };
  if (e.status === 429 && e.code === "insufficient_quota")
    return {
      code: "api_quota",
      message:
        "La API de OpenAI no tiene cuota disponible. Revisá el saldo y la facturación del proyecto de OpenAI.",
    };
  if (e.status === 429)
    return {
      code: "api_rate_limit",
      message:
        "OpenAI alcanzó un límite de solicitudes. Esperá unos minutos antes de reintentar y revisá los límites del proyecto.",
    };
  if (e.status === 403 || e.status === 404)
    return {
      code: "api_model_access",
      message:
        "La API no permite acceder al modelo configurado. Revisá OPENAI_MODEL y los permisos del proyecto de OpenAI.",
    };
  if (e.status === 400)
    return {
      code: "api_request",
      message:
        "OpenAI rechazó el formato de la solicitud. Soporte debe revisar la compatibilidad del modelo; no cambies las claves.",
    };
  if ((e.status || 0) >= 500)
    return {
      code: "api_unavailable",
      message: "OpenAI no está disponible temporalmente. Reintentá más tarde.",
    };
  if (
    ["AbortError", "TimeoutError", "APIConnectionTimeoutError"].includes(
      e.name || "",
    )
  )
    return {
      code: "timeout",
      message:
        "La investigación superó el tiempo disponible. Probá una consulta más acotada.",
    };
  if (e.name === "APIConnectionError")
    return {
      code: "connection",
      message:
        "No se pudo conectar con OpenAI. Revisá la conexión del servicio y reintentá más tarde.",
    };
  if(e.code === "evidence_semantic_rejected")return {
    code:"diagnosis_coherence",
    message:"La revisión detectó contradicciones que el diagnóstico no corrigió. No se publicó una conclusión válida ni se aplicó ningún cambio; soporte debe revisar este resultado.",
  };
  if(e.code === "evidence_audit_invalid")return {
    code:"diagnosis_audit",
    message:"No se pudo completar la revisión independiente del diagnóstico. No se publicó como una propuesta válida; podés reintentar.",
  };
  if (e.name === "ZodError" || e.name === "SyntaxError")
    return {
      code: "report_format",
      message:
        "La respuesta del modelo no cumplió el formato del diagnóstico. No se guardó como una propuesta válida; podés reintentar.",
    };
  if ((e.message || "").includes("límite"))
    return {
      code: ["investigation_tokens", "investigation_rounds", "diagnosis_length"].includes(e.code || "") ? e.code! : "investigation_limit",
      message:
        "La investigación alcanzó su límite antes de completar un diagnóstico válido. Soporte debe revisar el presupuesto del asistente; no hace falta reformular la consulta.",
    };
  if (
    (e.message || "").includes("evidencia") ||
    (e.message || "").includes("leído") ||
    (e.message || "").includes("no fueron consultadas")
  )
    return {
      code: "evidence_validation",
      message:
        "No se pudo verificar la evidencia citada por el modelo. El diagnóstico se descartó; podés solicitar otro intento.",
    };
  return {
    code: "diagnosis_failed",
    message:
      "No se pudo completar el diagnóstico. Soporte debe revisar el fallo registrado en el servicio del asistente.",
  };
}

/** Only bounded counters and known phases may be written to service logs. */
export function investigationMetrics(error: unknown) {
  const data = (error as any)?.investigation;
  if (!data || !["research", "closing", "coverage_review"].includes(data.phase)) return undefined;
  if ([data.rounds, data.calls, data.tokens].some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0)) return undefined;
  return { rounds: data.rounds, calls: data.calls, tokens: data.tokens, phase: data.phase };
}

/** Fixed reason labels only: never log the reviewer text or source payload. */
export function auditFailureReason(error: unknown) {
  const reason = (error as {auditReason?:unknown} | null)?.auditReason;
  return typeof reason === "string" && ["output_limit", "refusal", "invalid_json", "invalid_schema", "inconsistent_verdict", "quote_mismatch"].includes(reason) ? reason : undefined;
}
