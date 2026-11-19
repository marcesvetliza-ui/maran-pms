import { publicHotelBaseUrl } from "../lib/webCheckinAccess";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "../db";
import { sendSurveyInvitationEmail } from "../email-service";
import { ReviewError } from "./service";

type DeliveryResult = {
  status: "sent" | "failed" | "unknown";
  error?: string;
  providerId?: string;
};
export type SurveySender = (
  reservationId: string,
  token: string,
  recipient: string,
  key: string,
) => Promise<DeliveryResult>;

export async function runSurveyScheduler(
  sender: SurveySender = sendSurveyInvitationEmail,
) {
  const stats = { sent: 0, failed: 0, unknown: 0 };
  // Never replay an SMTP send after a crash: acceptance may have happened.
  await db.execute(sql`UPDATE survey_dispatches SET status='unknown',last_error='El proceso se interrumpió durante el envío. Revisá antes de reenviar.',updated_at=now()
    WHERE status='sending' AND claimed_at<now()-interval '15 minutes'`);
  await db.execute(sql`UPDATE survey_dispatches d SET status='queued',updated_at=now() FROM reservations r JOIN guests g ON g.id=r.guest_id
    WHERE d.reservation_id=r.id AND d.status='no_email' AND NULLIF(trim(g.email),'') IS NOT NULL`);
  for (let i = 0; i < 25; i++) {
    const job = await withDatabaseTransaction(async () => {
      const [config] = (
        await db.execute(
          sql`SELECT global_enabled,checkout_enabled FROM email_config WHERE id=1 FOR SHARE`,
        )
      ).rows as any[];
      if (!config?.global_enabled || !config.checkout_enabled) return null;
      const [next] = (
        await db.execute(sql`SELECT d.*,g.email,r.status AS reservation_status FROM survey_dispatches d
        JOIN reservations r ON r.id=d.reservation_id LEFT JOIN guests g ON g.id=r.guest_id
        WHERE d.status='queued' AND d.scheduled_for<=now() AND r.status='checked_out'
          AND NOT EXISTS(SELECT 1 FROM reservations other WHERE other.guest_id=r.guest_id AND other.check_in_date=r.check_in_date
            AND other.check_out_date=r.check_out_date AND other.status IN ('checked_in','confirmed','web_checkin','reserved'))
        ORDER BY d.scheduled_for,d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1`)
      ).rows as any[];
      if (!next) return null;
      const completed =
        (
          await db.execute(sql`SELECT 1 FROM survey_tokens WHERE reservation_id=${next.reservation_id} AND completed=true
        UNION ALL SELECT 1 FROM email_logs WHERE reservation_id=${next.reservation_id} AND type='checkout' AND status='sent' AND ${next.attempts === 0} LIMIT 1`)
        ).rows.length > 0;
      if (completed) {
        await db.execute(
          sql`UPDATE survey_dispatches SET status='completed',updated_at=now() WHERE id=${next.id}`,
        );
        return { skip: true };
      }
      if (!next.email?.trim()) {
        await db.execute(
          sql`UPDATE survey_dispatches SET status='no_email',last_error='Huésped sin email',updated_at=now() WHERE id=${next.id}`,
        );
        return { skip: true };
      }
      let [token] = (
        await db.execute(
          sql`SELECT * FROM survey_tokens WHERE reservation_id=${next.reservation_id} ORDER BY created_at DESC,id LIMIT 1`,
        )
      ).rows as any[];
      if (!token) {
        [token] = (
          await db.execute(
            sql`INSERT INTO survey_tokens(id,reservation_id,token,expires_at) VALUES(${randomUUID()},${next.reservation_id},${randomUUID()},(now() AT TIME ZONE 'UTC')+interval '30 days') RETURNING *`,
          )
        ).rows as any[];
      } else
        await db.execute(
          sql`UPDATE survey_tokens SET expires_at=(now() AT TIME ZONE 'UTC')+interval '30 days' WHERE id=${token.id}`,
        );
      const claim = randomUUID(),
        attempt = next.attempts + 1;
      await db.execute(sql`UPDATE survey_dispatches SET status='sending',claim_id=${claim},claimed_at=now(),attempts=${attempt},
        survey_token_id=${token.id},recipient_email=${next.email.trim()},last_error=NULL,updated_at=now() WHERE id=${next.id}`);
      return {
        id: next.id,
        reservationId: next.reservation_id,
        recipient: next.email.trim(),
        token: token.token,
        claim,
        attempt,
      };
    });
    if (!job) break;
    if ("skip" in job) continue;
    let result: DeliveryResult;
    try {
      result = await sender(
        job.reservationId,
        job.token,
        job.recipient,
        `survey/${job.id}/${job.attempt}`,
      );
    } catch {
      result = {
        status: "unknown",
        error: "No se pudo confirmar el envío. Revisá antes de reenviar.",
      };
    }
    await withDatabaseTransaction(async () => {
      const changed = (
        await db.execute(sql`UPDATE survey_dispatches SET status=${result.status},sent_at=CASE WHEN ${result.status}='sent' THEN now() ELSE sent_at END,
        provider_id=${result.providerId || null},last_error=${result.error || null},updated_at=now()
        WHERE id=${job.id} AND claim_id=${job.claim} AND status IN ('sending','unknown') RETURNING id`)
      ).rows;
      if (changed.length)
        await db.execute(sql`INSERT INTO email_logs(reservation_id,type,status,recipient_email,error_message)
        VALUES(${job.reservationId},'checkout',${result.status},${job.recipient},${result.error || null})`);
    });
    stats[result.status]++;
  }
  return stats;
}

export async function surveyDispatchForReservation(
  reservationId: string,
  lock = false,
) {
  const [row] = (
    await db.execute(sql`SELECT d.id,d.reservation_id AS "reservationId",d.status,(SELECT shared_at FROM survey_manual_deliveries m WHERE m.reservation_id=d.reservation_id) AS "sharedAt",d.scheduled_for AS "scheduledFor",d.sent_at AS "sentAt",d.last_error AS "lastError",d.attempts
    FROM reservations r JOIN survey_dispatches d ON (d.reservation_id=r.id OR d.stay_key=COALESCE(r.guest_id,r.id)||':'||r.check_in_date::text||':'||r.check_out_date::text)
    WHERE r.id=${reservationId} ORDER BY (d.reservation_id=r.id) DESC LIMIT 1 ${lock ? sql`FOR UPDATE OF d` : sql``}`)
  ).rows as any[];
  if (row) return row;
  const [legacy] = (
    await db.execute(sql`SELECT
    (SELECT shared_at FROM survey_manual_deliveries WHERE reservation_id=${reservationId}) AS "sharedAt",
    (SELECT max(sent_at) FROM email_logs WHERE reservation_id=${reservationId} AND type='checkout' AND status='sent') AS "sentAt",
    EXISTS(SELECT 1 FROM survey_tokens WHERE reservation_id=${reservationId} AND completed=true) AS completed,
    EXISTS(SELECT 1 FROM survey_tokens WHERE reservation_id=${reservationId}) AS invited`)
  ).rows as any[];
  return legacy?.invited || legacy?.sentAt
    ? {
        id: null,
        status: legacy.completed
          ? "completed"
          : legacy.sentAt
            ? "sent"
            : "unknown",
        sentAt: legacy.sentAt,
        lastError: null,
        attempts: 1,
        sharedAt: legacy.sharedAt,
      }
    : null;
}

/** Explicit staff request. Sent/uncertain sends need acknowledgement; repeat clicks coalesce. */
export async function requestSurveyInvitation(
  reservationId: string,
  acknowledge: boolean,
  actor: string,
) {
  return withDatabaseTransaction(async () => {
    const [r] = (
      await db.execute(
        sql`SELECT r.*,g.email FROM reservations r LEFT JOIN guests g ON g.id=r.guest_id WHERE r.id=${reservationId} FOR UPDATE OF r`,
      )
    ).rows as any[];
    if (!r) throw new ReviewError("Reserva no encontrada", 404);
    if (r.status !== "checked_out")
      throw new ReviewError("La encuesta se envía después de la salida.", 409);
    if (!r.email?.trim())
      throw new ReviewError("El huésped no tiene un email cargado.", 409);
    const [cfg] = (
      await db.execute(
        sql`SELECT global_enabled,checkout_enabled FROM email_config WHERE id=1`,
      )
    ).rows as any[];
    if (!cfg?.global_enabled || !cfg.checkout_enabled)
      throw new ReviewError(
        "El correo posestadía está pausado. Revisá Respuestas automáticas.",
        409,
      );
    const existing = await surveyDispatchForReservation(reservationId, true);
    if (
      existing?.status === "completed" ||
      (
        await db.execute(
          sql`SELECT 1 FROM survey_tokens WHERE reservation_id=${reservationId} AND completed=true LIMIT 1`,
        )
      ).rows.length
    )
      throw new ReviewError("El huésped ya respondió la encuesta.", 409);
    if (existing?.status === "sending") return existing;
    if (["sent", "unknown"].includes(existing?.status) && !acknowledge)
      throw new ReviewError(
        "El correo pudo haber sido enviado. Confirmá que querés reenviar la misma encuesta.",
        409,
      );
    const [queued] = (
      await db.execute(sql`INSERT INTO survey_dispatches(reservation_id,stay_key,checked_out_at,scheduled_for,attempts)
      VALUES(${reservationId},${r.guest_id || r.id}||':'||${r.check_in_date}::text||':'||${r.check_out_date}::text,now(),now(),${existing && !existing.id ? 1 : 0})
      ON CONFLICT(stay_key) DO UPDATE SET status='queued',scheduled_for=now(),claim_id=NULL,last_error=NULL,updated_at=now()
        WHERE survey_dispatches.status NOT IN ('completed','sending') RETURNING id,status`)
    ).rows as any[];
    await db.execute(sql`INSERT INTO audit_logs(action,module,user_name,description,entity_type,entity_id,details,timestamp)
      VALUES('update','reviews',${actor},${"Encuesta solicitada por " + actor},'reservation',${reservationId},${JSON.stringify({ actor, acknowledge, previousStatus: existing?.status || null, dispatchId: queued?.id })},now())`);
    return queued;
  });
}

export function startSurveyScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSurveyScheduler();
    } catch (e: any) {
      console.error("[surveys] No se pudo procesar la cola:", e?.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

/** Prepare a personal invitation without queueing or sending an email.
 * The dispatch lock shares the same token used by the email scheduler.
 * Copying a link is not recorded as a successful WhatsApp delivery.
 */
export async function preparePersonalSurveyLink(
  reservationId: string,
  markSent: boolean,
  actor: string,
) {
  return withDatabaseTransaction(async () => {
    const [r] = (
      await db.execute(
        sql`SELECT * FROM reservations WHERE id=${reservationId} FOR UPDATE`,
      )
    ).rows as any[];
    if (!r) throw new ReviewError("Reserva no encontrada", 404);
    if (r.status !== "checked_out")
      throw new ReviewError(
        "La encuesta está disponible después de la salida.",
        409,
      );
    const activeOther = (
      await db.execute(
        sql`SELECT 1 FROM reservations other WHERE other.id<>${r.id} AND other.guest_id=${r.guest_id} AND other.check_in_date=${r.check_in_date}::date AND other.check_out_date=${r.check_out_date}::date AND other.status IN ('checked_in','confirmed','web_checkin','reserved') LIMIT 1`,
      )
    ).rows.length;
    if (activeOther)
      throw new ReviewError(
        "La estadía todavía tiene un alojamiento activo. La encuesta estará disponible al finalizar la salida.",
        409,
      );
    const dispatch = await surveyDispatchForReservation(reservationId, true);
    const ownerId = dispatch?.reservationId || reservationId;
    let [token] = (
      await db.execute(
        sql`SELECT *,expires_at<(now() AT TIME ZONE 'UTC') AS expired FROM survey_tokens WHERE reservation_id=${ownerId} ORDER BY created_at DESC,id LIMIT 1`,
      )
    ).rows as any[];
    if (
      dispatch?.status === "completed" ||
      token?.completed ||
      (
        await db.execute(
          sql`SELECT 1 FROM survey_tokens WHERE reservation_id=${ownerId} AND completed=true LIMIT 1`,
        )
      ).rows.length
    )
      throw new ReviewError("El huésped ya respondió la encuesta.", 409);
    if (!token) {
      [token] = (
        await db.execute(
          sql`INSERT INTO survey_tokens(id,reservation_id,token,expires_at) VALUES(${randomUUID()},${ownerId},${randomUUID()},(now() AT TIME ZONE 'UTC')+interval '30 days') RETURNING *`,
        )
      ).rows as any[];
    } else if (token.expired) {
      await db.execute(
        sql`UPDATE survey_tokens SET expires_at=(now() AT TIME ZONE 'UTC')+interval '30 days' WHERE id=${token.id}`,
      );
    }
    if (markSent)
      await db.execute(
        sql`INSERT INTO survey_manual_deliveries(reservation_id,survey_token_id,actor) VALUES(${ownerId},${token.id},${actor}) ON CONFLICT(reservation_id) DO NOTHING`,
      );
    await db.execute(sql`INSERT INTO audit_logs(action,module,user_name,description,entity_type,entity_id,details,timestamp)
      VALUES('update','reviews',${actor},${markSent ? "Encuesta registrada como compartida por WhatsApp" : "Enlace personal de encuesta preparado"},'reservation',${ownerId},${JSON.stringify({ requestedReservationId: reservationId, markSent })},now())`);
    return {
      url: `${publicHotelBaseUrl()}/encuesta/${token.token}`,
      markedSent: markSent,
    };
  });
}
