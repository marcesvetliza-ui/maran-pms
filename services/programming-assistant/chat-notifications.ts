import type { NotificationConfig } from "./notify";
import { ChatStore } from "./chat-store";

/** Durable bounded outbox. Does not use model tokens or the inference budget. */
export function chatNotifications(
  store: ChatStore,
  config?: NotificationConfig,
  send: typeof fetch = fetch,
) {
  let active = false;
  return async function deliver() {
    if (active) return;
    active = true;
    try {
      const event = await store.transaction(async (db) => {
        await db.query(
          "UPDATE support_alerts SET delivery=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,lease_until=NULL WHERE delivery='sending' AND lease_until<now()",
        );
        const row = await db.query(
          "SELECT * FROM support_alerts WHERE delivery IN ('pending','failed','disabled') AND attempts<3 AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        );
        const value = row.rows[0];
        if (!value) return null;
        if (value.candidate_id) {
          const ticket = await db.query(
            "SELECT data FROM support_cases WHERE id=$1",
            [value.case_id],
          );
          const candidate = ticket.rows[0]?.data.changeCandidate;
          if (
            ticket.rows[0]?.data.status !== "proposal_ready" ||
            candidate?.id !== value.candidate_id ||
            candidate?.status !== "awaiting_review"
          ) {
            await db.query(
              "UPDATE support_alerts SET delivery='obsolete' WHERE id=$1",
              [value.id],
            );
            return null;
          }
        }
        if (!config) {
          await db.query(
            "UPDATE support_alerts SET delivery='disabled',next_attempt_at=now()+interval '1 minute' WHERE id=$1",
            [value.id],
          );
          return null;
        }
        await db.query(
          "UPDATE support_alerts SET delivery='sending',attempts=attempts+1,lease_until=now()+interval '30 seconds' WHERE id=$1",
          [value.id],
        );
        return value;
      });
      if (!event || !config) return;
      const base = "https://demo.maranpms.com.ar/programming-support";
      const url = event.case_id
        ? `${base}?case=${encodeURIComponent(event.case_id)}`
        : base;
      try {
        const response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `xenia-support/${event.id}`,
          },
          body: JSON.stringify({
            from: config.from,
            to: [config.to],
            subject: `Xenia · ${event.title}`,
            text: `${event.body}\n\nAbrí el sistema con tu usuario: ${url}\n\nEste aviso no ejecuta cambios. Las decisiones se registran dentro del PMS.`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw Error("Correo no aceptado");
        await store.pool.query(
          "UPDATE support_alerts SET delivery='sent',lease_until=NULL WHERE id=$1 AND delivery='sending'",
          [event.id],
        );
      } catch {
        await store.pool.query(
          "UPDATE support_alerts SET delivery='failed',lease_until=NULL,next_attempt_at=now()+interval '1 minute' WHERE id=$1 AND delivery='sending'",
          [event.id],
        );
      }
    } finally {
      active = false;
    }
  };
}
