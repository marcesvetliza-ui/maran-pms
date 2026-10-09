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
  if (e.name === "ZodError" || e.name === "SyntaxError")
    return {
      code: "report_format",
      message:
        "La respuesta del modelo no cumplió el formato del diagnóstico. No se guardó como una propuesta válida; podés reintentar.",
    };
  if ((e.message || "").includes("límite"))
    return {
      code: "investigation_limit",
      message:
        "La investigación alcanzó su límite antes de completar el diagnóstico. Acotá la consulta y solicitá otro intento.",
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
