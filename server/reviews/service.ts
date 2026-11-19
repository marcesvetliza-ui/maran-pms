import {
  surveySectors,
  surveySectorTargets,
  type SurveySector,
} from "@shared/survey-sectors";
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
export async function reviewAreas(
  activeOnly = false,
  sector?: SurveySector,
): Promise<ReviewArea[]> {
  return (
    await db.execute(
      sql`SELECT key,name,question,active,in_survey AS "inSurvey",sort_order AS "sortOrder",notification_area AS "notificationArea",sectors,question_type AS "questionType" FROM review_areas WHERE (${!activeOnly} OR (active AND in_survey)) AND (${sector || null}::text IS NULL OR ${sector || null}=ANY(sectors)) ORDER BY sort_order,key`,
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

export async function createSurveyReview(
  response: any,
  reservation: any,
  sector: SurveySector = "hotel",
) {
  const areaRatings = { ...legacyAreas(response), ...response.area_ratings };
  const attention = needsReviewFollowup(
    response.rating_overall,
    areaRatings,
    response.contact_requested,
  );
  const [r] = (
    await db.execute(sql`INSERT INTO guest_reviews(id,reservation_id,guest_id,room_id,review_date,source,rating,title,content,
    survey_response_id,area_ratings,area_questions,nps,contact_requested,followup_status,sentiment,survey_sector,generic_response_id,guest_display_name,action_areas)
    VALUES(${"survey-" + response.id},${reservation?.id || null},${reservation?.guest_id || "unlinked"},${reservation?.room_id || null},
      ${response.review_day}::date,
      'survey',${response.rating_overall},${response.is_generic ? "Encuesta " + surveySectors[sector] : "Encuesta posestadía"},${response.comment || ""},${response.is_generic ? null : response.id},${JSON.stringify(areaRatings)}::jsonb,${JSON.stringify(response.area_questions || {})}::jsonb,
      ${response.nps ?? null},${response.contact_requested || false},${attention ? "new" : "resolved"},
      ${response.rating_overall <= 2 ? "negative" : response.rating_overall >= 4 ? "positive" : "neutral"},${sector},${response.is_generic ? response.id : null},${response.guest_name || null},ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(Object.keys(areaRatings).filter((k) => Number(areaRatings[k]) <= 2))}::jsonb)))
    ON CONFLICT(survey_response_id) WHERE survey_response_id IS NOT NULL DO NOTHING RETURNING id`)
  ).rows as any[];
  if (!r) return;
  await db.execute(sql`UPDATE guest_reviews SET area_text_answers=${JSON.stringify(response.area_text_answers || {})}::jsonb,
    not_applicable=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(response.not_applicable || [])}::jsonb)) WHERE id=${r.id}`);
  await db.execute(
    sql`INSERT INTO review_events(review_id,actor,kind,details) VALUES(${r.id},'huésped','received',${JSON.stringify({ origin: "survey", attention })}::jsonb)`,
  );
  if (attention)
    await notifyReviewFollowup(
      r.id,
      areaRatings,
      response.contact_requested,
      sector,
    );
}

export async function notifyReviewFollowup(
  reviewId: string,
  areaRatings: Record<string, number | null>,
  contactRequested: boolean,
  sector: SurveySector = "hotel",
) {
  const areas = await reviewAreas();
  const lowAreas = areas.filter(
    (a) => Number(areaRatings[a.key]) > 0 && Number(areaRatings[a.key]) <= 2,
  );
  const targets = new Set([
    surveySectorTargets[sector],
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
    await db.execute(sql`SELECT s.*,to_char((s.submitted_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS review_day,r.id AS reservation_id,r.guest_id,r.room_id FROM survey_responses s
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
    areas: await reviewAreas(true, "hotel"),
    sector: "hotel",
    kind: "personal",
    googleMapsUrl,
  };
}

export async function validateSurveyAnswers(
  data: ReturnType<typeof surveyAnswerSchema.parse>,
  sector: SurveySector,
) {
  const areaRatings = {
    ...legacyAreas({
      rating_room: data.ratingRoom,
      rating_cleanliness: data.ratingCleanliness,
      rating_service: data.ratingService,
      rating_food: data.ratingFood,
    }),
    ...data.areaRatings,
  };
  const questions = await reviewAreas(true, sector),
    active = new Set(questions.map((a) => a.key));
  const textAnswers = Object.fromEntries(
    Object.entries(data.areaTextAnswers).filter(([, value]) => value.trim()),
  );
  const notApplicable = [
    ...new Set([
      ...data.notApplicable,
      ...Object.keys(areaRatings).filter((key) => areaRatings[key] === null),
    ]),
  ];
  const answeredKeys = [
    ...Object.keys(areaRatings),
    ...Object.keys(textAnswers),
    ...notApplicable,
  ];
  const changed = () =>
    new ReviewError(
      "Las preguntas cambiaron. Actualizá la encuesta antes de enviarla.",
      409,
    );
  if (answeredKeys.some((key) => !active.has(key)))
    throw new ReviewError(
      "Las preguntas cambiaron. Actualizá la encuesta antes de enviarla.",
    );
  if (
    Object.keys(areaRatings).some(
      (key) =>
        areaRatings[key] !== null &&
        questions.find((q) => q.key === key)?.questionType === "text",
    ) ||
    Object.keys(textAnswers).some(
      (key) => questions.find((q) => q.key === key)?.questionType !== "text",
    ) ||
    notApplicable.some(
      (key) => Object.hasOwn(textAnswers, key) || areaRatings[key] != null,
    )
  )
    throw changed();
  const valid = Object.fromEntries(
    Object.entries(areaRatings).filter(([, value]) => value !== null),
  );
  if (
    data.areaQuestions &&
    answeredKeys.some(
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
      .filter((q) => answeredKeys.includes(q.key))
      .map((q) => [q.key, q.question]),
  );
  return { valid, questionSnapshot, textAnswers, notApplicable };
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
    const { valid, questionSnapshot, textAnswers, notApplicable } =
      await validateSurveyAnswers(data, "hotel");
    const [response] = (
      await db.execute(sql`INSERT INTO survey_responses(id,survey_token_id,rating_overall,rating_room,rating_cleanliness,rating_service,rating_food,comment,guest_name,area_ratings,area_questions,nps,contact_requested,submitted_at)
      VALUES(${randomUUID()},${access.id},${data.ratingOverall},${valid.room ?? null},${valid.cleanliness ?? null},${valid.service ?? null},${valid.food ?? null},
        ${data.comment || null},${data.guestName || null},${JSON.stringify(valid)}::jsonb,${JSON.stringify(questionSnapshot)}::jsonb,${data.nps ?? null},${data.contactRequested},now() AT TIME ZONE 'UTC') RETURNING *,to_char((submitted_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS review_day`)
    ).rows as any[];
    await db.execute(sql`UPDATE survey_responses SET area_text_answers=${JSON.stringify(textAnswers)}::jsonb,
      not_applicable=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(notApplicable)}::jsonb)) WHERE id=${response.id}`);
    await createSurveyReview(
      {
        ...response,
        area_text_answers: textAnswers,
        not_applicable: notApplicable,
      },
      reservation,
    );
    await db.execute(
      sql`UPDATE survey_tokens SET completed=true WHERE reservation_id=${reservation.id}`,
    );
    await db.execute(
      sql`UPDATE survey_dispatches SET status='completed',updated_at=now() WHERE reservation_id=${reservation.id}`,
    );
    return { ok: true, alreadyCompleted: false };
  });
}

export function reviewSectorCondition(sector: SurveySector): SQL {
  return sql`(COALESCE(r.survey_sector,CASE WHEN r.source='survey' THEN 'hotel' END)=${sector}
    OR EXISTS(SELECT 1 FROM review_areas a WHERE a.key=ANY(r.action_areas) AND a.notification_area=${surveySectorTargets[sector]}))`;
}
function reviewWhere(f: ReviewFilters, scope?: SurveySector[]): SQL {
  const filters: SQL[] = [sql`true`];
  if (scope)
    filters.push(
      scope.length
        ? sql`(${sql.join(scope.map(reviewSectorCondition), sql` OR `)})`
        : sql`false`,
    );
  if (f.sector) {
    const origin = sql`COALESCE(r.survey_sector,CASE WHEN r.source='survey' THEN 'hotel' END)=${f.sector}`;
    if (f.sectorMode === "origin") filters.push(origin);
    else if (f.sectorMode === "assigned")
      filters.push(
        sql`NOT COALESCE((${origin}),false) AND ${reviewSectorCondition(f.sector)}`,
      );
    else filters.push(reviewSectorCondition(f.sector));
  }
  if (f.surveyKind === "personal")
    filters.push(sql`r.source='survey' AND r.generic_response_id IS NULL`);
  if (f.surveyKind === "generic")
    filters.push(sql`r.generic_response_id IS NOT NULL`);
  if (f.search)
    filters.push(
      sql`concat_ws(' ',g.last_name,g.first_name,r.guest_display_name,r.title,r.content,r.area_text_answers::text,rs.reservation_code,p.event_name,p.contact_email,p.contact_phone) ILIKE ${"%" + f.search + "%"}`,
    );
  const date =
    f.dateField === "stay"
      ? sql`COALESCE(p.visit_date,rs.check_out_date)`
      : sql`r.review_date`;
  if (f.from) filters.push(sql`${date}>=${f.from}::date`);
  if (f.to) filters.push(sql`${date}<=${f.to}::date`);
  if (f.source) filters.push(sql`r.source=${f.source}`);
  if (f.area)
    filters.push(
      sql`(r.area_ratings ? ${f.area} OR r.area_text_answers ? ${f.area} OR ${f.area}=ANY(r.not_applicable))`,
    );
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
const reviewJoins = sql`FROM guest_reviews r LEFT JOIN guests g ON g.id=r.guest_id AND r.generic_response_id IS NULL LEFT JOIN rooms rm ON rm.id=r.room_id
 LEFT JOIN survey_public_responses p ON p.id=r.generic_response_id LEFT JOIN reservations rs ON rs.id=r.reservation_id LEFT JOIN room_types rt ON rt.id=rm.room_type_id`;
export async function listReviews(
  filters: ReviewFilters,
  page = 1,
  id?: string,
  scope?: SurveySector[],
) {
  const where = sql`${reviewWhere(filters, scope)} AND (${id || null}::text IS NULL OR r.id=${id || null})`;
  const [count] = (
    await db.execute(
      sql`SELECT count(*)::int AS count ${reviewJoins} WHERE ${where}`,
    )
  ).rows as any[];
  const rows = (
    await db.execute(sql`SELECT r.id,r.reservation_id AS "reservationId",r.guest_id AS "guestId",r.room_id AS "roomId",
    COALESCE(NULLIF(concat_ws(' ',g.last_name,g.first_name),''),r.guest_display_name,CASE WHEN r.generic_response_id IS NOT NULL THEN 'Anónimo' ELSE 'Huésped' END) AS "guestName",rm.room_number AS "roomNumber",
    rs.check_in_date::text AS "checkIn",rs.check_out_date::text AS "checkOut",rt.name AS "roomType",rs.source AS channel,
    r.review_date::text AS "reviewDate",r.source,r.rating,r.title,r.content,r.area_ratings AS "areaRatings",r.area_questions AS "areaQuestions",r.area_text_answers AS "areaTextAnswers",r.not_applicable AS "notApplicable",r.sentiment,r.nps,
    r.contact_requested AS "contactRequested",r.followup_status AS "followupStatus",r.assigned_to AS "assignedTo",r.action_areas AS "actionAreas",
    r.survey_response_id AS "surveyResponseId",r.staff_response AS "staffResponse",
    COALESCE(r.survey_sector,CASE WHEN r.source='survey' THEN 'hotel' END) AS sector,
    CASE WHEN r.generic_response_id IS NOT NULL THEN 'generic' WHEN r.source='survey' THEN 'personal' END AS "surveyKind",
    p.visit_date::text AS "visitDate",p.event_name AS "eventName",COALESCE(p.contact_email,g.email) AS "contactEmail",COALESCE(p.contact_phone,g.phone) AS "contactPhone"
    ${reviewJoins} WHERE ${where} ORDER BY r.review_date DESC,r.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`)
  ).rows as unknown as ReviewItem[];
  return { items: rows, total: count.count, page, pageSize: 50 };
}
export async function reviewAnalyticsRows(
  filters: ReviewFilters,
  scope?: SurveySector[],
): Promise<ReviewItem[]> {
  return (
    await db.execute(sql`SELECT r.rating,r.review_date::text AS "reviewDate",r.area_ratings AS "areaRatings",r.nps,
    r.followup_status AS "followupStatus",r.contact_requested AS "contactRequested",COALESCE(r.survey_sector,CASE WHEN r.source='survey' THEN 'hotel' END) AS sector,
    CASE WHEN r.generic_response_id IS NOT NULL THEN 'generic' WHEN r.source='survey' THEN 'personal' END AS "surveyKind"
    ${reviewJoins} WHERE ${reviewWhere(filters, scope)}`)
  ).rows as any;
}
