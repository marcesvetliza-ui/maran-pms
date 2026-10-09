export type NotificationConfig = { apiKey: string; from: string; to: string };
// An opt-in notification contains no case text, customer data or diagnosis.
export async function notifyReady(
  config: NotificationConfig,
  caseId: string,
  send: typeof fetch = fetch,
  eventId: string = caseId,
) {
  if (
    !/^[a-f0-9-]{36}$/.test(caseId) ||
    !config.apiKey ||
    !config.from ||
    !config.to
  )
    throw new Error("Notificación no configurada");
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `programming-support/${eventId}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject: "Maran: diagnóstico disponible",
      text: "Hay un diagnóstico disponible en Soporte del sistema. Ingresá con tu usuario en https://demo.maranpms.com.ar/programming-support",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("No se pudo enviar el aviso");
}
