import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db, withDatabaseTransaction } from "../db";
import {
  needsReviewFollowup,
  surveyAnswerSchema,
  type ReviewArea,
  type ReviewFilters,
  type ReviewItem,
} from "@shared/reviews";

export class ReviewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function reviewAreas(activeOnly = false): Promise<ReviewArea[]> {
  return (
    await db.execute(
      sql`SELECT key,name,question,active,in_survey AS "inSurvey",sort_order AS "sortOrder",notification_area AS "notificationArea" FROM review_areas WHERE (${!activeOnly} OR (active AND in_survey)) ORDER BY sort_order,key`,
    )
  ).rows as any;
}
const legacyAreas = (r: any) =>
  Object.fromEntries(
    [
      ["room", r.rating_room],
      ["cleanliness", r.rating_cleanliness],
      ["service", r.rating_service],
      ["food", r.rating_food],
    ].filter(
      ([, n]) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 5,
    ),
  );

async function createSurveyReview(response: any, reservation: any) {
  const areaRatings = { ...legacyAreas(response), ...response.area_ratings };
  const attention = needsReviewFollowup(
    response.rating_overall,
    areaRatings,
    response.contact_requested,
  );
  const [r] = (
    await db.execute(sql`INSERT INTO guest_reviews(id,reservation_id,guest_id,room_id,review_date,source,rating,title,content,
    survey_response_id,area_ratings,area_questions,nps,contact_requested,followup_status,sentiment)
    VALUES(${"survey-" + response.id},${reservation.id},${reservation.guest_id || "unknown"},${reservation.room_id},
      ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(response.submitted_at))}::date,
      'survey',${response.rating_overall},'Encuesta posestadía',${response.comment || ""},${response.id},${JSON.stringify(areaRatings)}::jsonb,${JSON.stringify(response.area_questions || {})}::jsonb,
      ${response.nps ?? null},${response.contact_requested || false},${attention ? "new" : "resolved"},
      ${response.rating_overall <= 2 ? "negative" : response.rating_overall >= 4 ? "positive" : "neutral"})
    ON CONFLICT(survey_response_id) WHERE survey_response_id IS NOT NULL DO NOTHING RETURNING id`)
  ).rows as any[];
  if (!r) return;
  await db.execute(
    sql`INSERT INTO review_events(review_id,actor,kind,details) VALUES(${r.id},'huésped','received',${JSON.stringify({ origin: "survey", attention })}::jsonb)`,
  );
  if (attention)
    await notifyReviewFollowup(r.id, areaRatings, response.contact_requested);
}

export async function notifyReviewFollowup(
  reviewId: string,
  areaRatings: Record<string, number | null>,
  contactRequested: boolean,
) {
  const areas = await reviewAreas();
  const lowAreas = areas.filter(
    (a) => Number(areaRatings[a.key]) > 0 && Number(areaRatings[a.key]) <= 2,
  );
  const targets = new Set([
    "reception",
    ...lowAreas.map((a) => a.notificationArea),
  ]);
  for (const target of targets) {
    await db.execute(sql`INSERT INTO system_notifications(id,type,title,message,target_area,related_entity_type,related_entity_id,priority)
        VALUES(${"review-" + reviewId + "-" + target},'review_followup','Opinión que requiere seguimiento',
          ${contactRequested ? "El huésped pidió que lo contacten. Revisá su opinión en Reseñas." : "Se recibió una calificación de 2 estrellas o menos. Revisá la opinión en Reseñas."},
          ${target},'review',${reviewId},'high') ON CONFLICT(id) DO NOTHING`);
  }
}

/** Old responses retain their IDs, tokens and original answers. No invitation is sent. */
export async function backfillSurveyReviews() {
  const rows = (
    await db.execute(sql`SELECT s.*,r.id AS reservation_id,r.guest_id,r.room_id FROM survey_responses s
    JOIN survey_tokens t ON t.id=s.survey_token_id JOIN reservations r ON r.id=t.reservation_id
    WHERE NOT EXISTS(SELECT 1 FROM guest_reviews g WHERE g.survey_response_id=s.id) ORDER BY s.submitted_at,s.id`)
  ).rows as any[];
  for (const row of rows)
    await withDatabaseTransaction(() =>
      createSurveyReview(row, {
        id: row.reservation_id,
        guest_id: row.guest_id,
        room_id: row.room_id,
      }),
    );
}

export async function publicSurvey(token: string) {
  const [row] = (
    await db.execute(sql`SELECT t.completed,t.expires_at,r.status,r.check_in_date::text AS "checkIn",r.check_out_date::text AS "checkOut",
    concat_ws(' ',g.first_name,g.last_name) AS "guestName",rm.room_number AS "roomNumber",
    t.expires_at IS NOT NULL AND t.expires_at<(now() AT TIME ZONE 'UTC') AS expired
    FROM survey_tokens t JOIN reservations r ON r.id=t.reservation_id LEFT JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms rm ON rm.id=r.room_id WHERE t.token=${token}`)
  ).rows as any[];
  if (!row) throw new ReviewError("Encuesta no encontrada", 404);
  if (row.completed)
    throw new ReviewError("Esta encuesta ya fue completada. ¡Gracias!", 410);
  if (row.expired)
    throw new ReviewError("El enlace de la encuesta venció.", 410);
  if (row.status !== "checked_out")
    throw new ReviewError(
      "La encuesta estará disponible después de tu salida.",
      409,
    );
  const [cfg] = (
    await db.execute(sql`SELECT google_maps_url FROM email_config WHERE id=1`)
  ).rows as any[];
  const googleMapsUrl =
    typeof cfg?.google_maps_url === "string" &&
    /^https?:\/\//.test(cfg.google_maps_url)
      ? cfg.google_maps_url
      : null;
  return {
    guestName: row.guestName,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    roomNumber: row.roomNumber,
    areas: await reviewAreas(true),
    googleMapsUrl,
  };
}

export async function submitSurvey(token: string, input: unknown) {
  const parsed = surveyAnswerSchema.safeParse(input);
  if (!parsed.success)
    throw new ReviewError(
      "Revisá las calificaciones: deben ser números enteros de 1 a 5; recomendación de 0 a 10.",
    );
  return withDatabaseTransaction(async () => {
    const [owner] = (
      await db.execute(
        sql`SELECT reservation_id FROM survey_tokens WHERE token=${token}`,
      )
    ).rows as any[];
    if (!owner) throw new ReviewError("Encuesta no encontrada", 404);
    const [reservation] = (
      await db.execute(
        sql`SELECT id,guest_id,room_id,status FROM reservations WHERE id=${owner.reservation_id} FOR UPDATE`,
      )
    ).rows as any[];
    await db.execute(
      sql`SELECT id FROM survey_dispatches WHERE reservation_id=${owner.reservation_id} FOR UPDATE`,
    );
    const [access] = (
      await db.execute(
        sql`SELECT *,expires_at IS NOT NULL AND expires_at<(now() AT TIME ZONE 'UTC') AS expired FROM survey_tokens WHERE token=${token} FOR UPDATE`,
      )
    ).rows as any[];
    const prior = (
      await db.execute(
        sql`SELECT s.id FROM survey_responses s JOIN survey_tokens t ON t.id=s.survey_token_id WHERE t.reservation_id=${owner.reservation_id} LIMIT 1`,
      )
    ).rows;
    if (access.completed || prior.length)
      return { ok: true, alreadyCompleted: true };
    if (access.expired)
      throw new ReviewError("El enlace de la encuesta venció.", 410);
    if (!reservation || reservation.status !== "checked_out")
      throw new ReviewError(
        "La encuesta estará disponible después de tu salida.",
        409,
      );
    const data = parsed.data;
    const areaRatings = {
      ...legacyAreas({
        rating_room: data.ratingRoom,
        rating_cleanliness: data.ratingCleanliness,
        rating_service: data.ratingService,
        rating_food: data.ratingFood,
      }),
      ...data.areaRatings,
    };
    const questions = await reviewAreas(true),
      active = new Set(questions.map((a) => a.key));
    if (Object.keys(areaRatings).some((key) => !active.has(key)))
      throw new ReviewError(
        "Las preguntas cambiaron. Actualizá la encuesta antes de enviarla.",
      );
    const valid = Object.fromEntries(
      Object.entries(areaRatings).filter(([, value]) => value !== null),
    );
    if (
      data.areaQuestions &&
      Object.keys(valid).some(
        (key) =>
          data.areaQuestions![key] !==
          questions.find((a) => a.key === key)?.question,
      )
    )
      throw new ReviewError(
        "Las preguntas cambiaron. Actualizá la encuesta antes de enviarla.",
        409,
      );
    const questionSnapshot = Object.fromEntries(
      questions
        .filter((q) => Object.hasOwn(valid, q.key))
        .map((q) => [q.key, q.question]),
    );
    const [response] = (
      await db.execute(sql`INSERT INTO survey_responses(id,survey_token_id,rating_overall,rating_room,rating_cleanliness,rating_service,rating_food,comment,guest_name,area_ratings,area_questions,nps,contact_requested)
      VALUES(${randomUUID()},${access.id},${data.ratingOverall},${valid.room ?? null},${valid.cleanliness ?? null},${valid.service ?? null},${valid.food ?? null},
        ${data.comment || null},${data.guestName || null},${JSON.stringify(valid)}::jsonb,${JSON.stringify(questionSnapshot)}::jsonb,${data.nps ?? null},${data.contactRequested}) RETURNING *`)
    ).rows as any[];
    await createSurveyReview(response, reservation);
    await db.execute(
      sql`UPDATE survey_tokens SET completed=true WHERE reservation_id=${reservation.id}`,
    );
    await db.execute(
      sql`UPDATE survey_dispatches SET status='completed',updated_at=now() WHERE reservation_id=${reservation.id}`,
    );
    return { ok: true, alreadyCompleted: false };
  });
}

function reviewWhere(f: ReviewFilters): SQL {
  const filters: SQL[] = [sql`true`];
  if (f.search)
    filters.push(
      sql`concat_ws(' ',g.last_name,g.first_name,r.guest_display_name,r.title,r.content,rs.reservation_code) ILIKE ${"%" + f.search + "%"}`,
    );
  const date =
    f.dateField === "stay" ? sql`rs.check_out_date` : sql`r.review_date`;
  if (f.from) filters.push(sql`${date}>=${f.from}::date`);
  if (f.to) filters.push(sql`${date}<=${f.to}::date`);
  if (f.source) filters.push(sql`r.source=${f.source}`);
  if (f.area) filters.push(sql`r.area_ratings ? ${f.area}`);
  if (f.actionArea)
    filters.push(sql`r.action_areas @> ARRAY[${f.actionArea}]::text[]`);
  if (f.rating) filters.push(sql`r.rating=${f.rating}`);
  if (f.sentiment) filters.push(sql`r.sentiment=${f.sentiment}`);
  if (f.status) filters.push(sql`r.followup_status=${f.status}`);
  if (f.room) filters.push(sql`rm.room_number=${f.room}`);
  if (f.roomType) filters.push(sql`rt.id=${f.roomType}`);
  if (f.channel) filters.push(sql`rs.source=${f.channel}`);
  return sql.join(filters, sql` AND `);
}
const reviewJoins = sql`FROM guest_reviews r LEFT JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms rm ON rm.id=r.room_id
 LEFT JOIN reservations rs ON rs.id=r.reservation_id LEFT JOIN room_types rt ON rt.id=rm.room_type_id`;
export async function listReviews(
  filters: ReviewFilters,
  page = 1,
  id?: string,
) {
  const where = sql`${reviewWhere(filters)} AND (${id || null}::text IS NULL OR r.id=${id || null})`;
  const [count] = (
    await db.execute(
      sql`SELECT count(*)::int AS count ${reviewJoins} WHERE ${where}`,
    )
  ).rows as any[];
  const rows = (
    await db.execute(sql`SELECT r.id,r.reservation_id AS "reservationId",r.guest_id AS "guestId",r.room_id AS "roomId",
    COALESCE(NULLIF(concat_ws(' ',g.last_name,g.first_name),''),r.guest_display_name,'Huésped') AS "guestName",rm.room_number AS "roomNumber",
    rs.check_in_date::text AS "checkIn",rs.check_out_date::text AS "checkOut",rt.name AS "roomType",rs.source AS channel,
    r.review_date::text AS "reviewDate",r.source,r.rating,r.title,r.content,r.area_ratings AS "areaRatings",r.area_questions AS "areaQuestions",r.sentiment,r.nps,
    r.contact_requested AS "contactRequested",r.followup_status AS "followupStatus",r.assigned_to AS "assignedTo",r.action_areas AS "actionAreas",
    r.survey_response_id AS "surveyResponseId",r.staff_response AS "staffResponse"
    ${reviewJoins} WHERE ${where} ORDER BY r.review_date DESC,r.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`)
  ).rows as unknown as ReviewItem[];
  return { items: rows, total: count.count, page, pageSize: 50 };
}
export async function reviewAnalyticsRows(
  filters: ReviewFilters,
): Promise<ReviewItem[]> {
  return (
    await db.execute(sql`SELECT r.rating,r.review_date::text AS "reviewDate",r.area_ratings AS "areaRatings",r.nps,
    r.followup_status AS "followupStatus",r.contact_requested AS "contactRequested"
    ${reviewJoins} WHERE ${reviewWhere(filters)}`)
  ).rows as any;
}
