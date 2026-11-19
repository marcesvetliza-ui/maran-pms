import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "../db";
import { publicHotelBaseUrl } from "../lib/webCheckinAccess";
import { surveyAnswerSchema, reviewDateKey } from "@shared/reviews";
import {
  surveySectorSchema,
  surveySectors,
  type SurveySector,
} from "@shared/survey-sectors";
import {
  ReviewError,
  reviewAreas,
  validateSurveyAnswers,
  createSurveyReview,
} from "./service";

const challengeSecret =
  process.env.SESSION_SECRET || randomBytes(32).toString("hex");
function sign(payload: string) {
  return createHmac("sha256", challengeSecret)
    .update("sector-survey:" + payload)
    .digest();
}
function issueChallenge(sector: SurveySector) {
  const payload = Buffer.from(
    JSON.stringify({ sector, id: randomUUID(), at: Date.now() }),
  ).toString("base64url");
  return payload + "." + sign(payload).toString("base64url");
}
function checkChallenge(challenge: string, sector: SurveySector): string {
  try {
    const [payload, signature, ...rest] = challenge.split(".");
    const actual = Buffer.from(signature || "", "base64url"),
      expected = sign(payload || "");
    if (
      rest.length ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw Error();
    const data = z
      .object({
        sector: surveySectorSchema,
        id: z.string().uuid(),
        at: z.number().int(),
      })
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (
      data.sector !== sector ||
      Date.now() - data.at > 2 * 60 * 60 * 1000 ||
      data.at > Date.now() + 60000
    )
      throw Error();
    return data.id;
  } catch {
    throw new ReviewError("Actualizá la encuesta antes de enviarla.", 409);
  }
}
const optionalEmail = z
  .union([z.string().trim().email().max(254), z.literal("")])
  .nullable()
  .optional();
const genericAnswerSchema = surveyAnswerSchema
  .extend({
    challenge: z.string().min(1).max(1500),
    website: z.string().max(250).optional(),
    visitDate: z
      .union([reviewDateKey, z.literal("")])
      .nullable()
      .optional(),
    eventName: z.string().trim().max(160).nullable().optional(),
    contactEmail: optionalEmail,
    contactPhone: z.string().trim().max(50).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const digits = data.contactPhone?.replace(/\D/g, "") || "";
    if (data.contactPhone && digits.length < 6)
      ctx.addIssue({
        code: "custom",
        path: ["contactPhone"],
        message: "Revisá el teléfono.",
      });
    if (data.contactRequested && !data.contactEmail && !digits)
      ctx.addIssue({
        code: "custom",
        path: ["contactEmail"],
        message: "Indicá un correo o teléfono para que podamos contactarte.",
      });
  });
async function requireActiveSector(sector: SurveySector, lock = false) {
  const [link] = (
    await db.execute(
      sql`SELECT active FROM review_sector_links WHERE sector=${sector} ${lock ? sql`FOR SHARE` : sql``}`,
    )
  ).rows as any[];
  if (!link?.active)
    throw new ReviewError(
      "Esta encuesta no está disponible en este momento.",
      404,
    );
}
export async function publicSectorSurvey(rawSector: string) {
  const sector = surveySectorSchema.parse(rawSector);
  await requireActiveSector(sector);
  const [cfg] = (
    await db.execute(sql`SELECT google_maps_url FROM email_config WHERE id=1`)
  ).rows as any[];
  return {
    kind: "generic",
    sector,
    sectorName: surveySectors[sector],
    areas: await reviewAreas(true, sector),
    challenge: issueChallenge(sector),
    googleMapsUrl:
      typeof cfg?.google_maps_url === "string" &&
      /^https?:\/\//.test(cfg.google_maps_url)
        ? cfg.google_maps_url
        : null,
  };
}
export async function submitSectorSurvey(rawSector: string, input: unknown) {
  const sector = surveySectorSchema.parse(rawSector),
    parsed = genericAnswerSchema.safeParse(input);
  if (!parsed.success)
    throw new ReviewError(
      parsed.error.issues[0]?.message.includes("contact")
        ? "Indicá un correo o teléfono para que podamos contactarte."
        : "Revisá las calificaciones, la fecha y los datos de contacto.",
    );
  const data = parsed.data;
  if (data.website?.trim())
    throw new ReviewError("No se pudo enviar la encuesta.");
  const submissionKey = checkChallenge(data.challenge, sector);
  return withDatabaseTransaction(async () => {
    await requireActiveSector(sector, true);
    const { valid, questionSnapshot, textAnswers, notApplicable } =
      await validateSurveyAnswers(data, sector);
    const [response] = (
      await db.execute(sql`INSERT INTO survey_public_responses(id,submission_key,sector,guest_name,visit_date,event_name,contact_email,contact_phone,
      rating_overall,area_ratings,area_questions,comment,nps,contact_requested)
      VALUES(${randomUUID()},${submissionKey}::uuid,${sector},${data.guestName || null},${data.visitDate || null}::date,${sector === "events" ? data.eventName || null : null},${data.contactEmail || null},${data.contactPhone || null},
      ${data.ratingOverall},${JSON.stringify(valid)}::jsonb,${JSON.stringify(questionSnapshot)}::jsonb,${data.comment || null},${data.nps ?? null},${data.contactRequested})
      ON CONFLICT(submission_key) DO NOTHING RETURNING *,to_char((submitted_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS review_day`)
    ).rows as any[];
    if (!response) return { ok: true, alreadyCompleted: true };
    await db.execute(sql`UPDATE survey_public_responses SET area_text_answers=${JSON.stringify(textAnswers)}::jsonb,
      not_applicable=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(notApplicable)}::jsonb)) WHERE id=${response.id}`);
    await createSurveyReview(
      {
        ...response,
        area_text_answers: textAnswers,
        not_applicable: notApplicable,
        is_generic: true,
      },
      null,
      sector,
    );
    return { ok: true, alreadyCompleted: false };
  });
}
export async function sectorSharingLinks(scope?: SurveySector[]) {
  const rows = (
    await db.execute(
      sql`SELECT sector,active FROM review_sector_links WHERE (${!scope} OR sector IN(SELECT jsonb_array_elements_text(${JSON.stringify(scope || [])}::jsonb))) ORDER BY sector`,
    )
  ).rows as any[];
  return rows
    .sort(
      (a, b) =>
        Object.keys(surveySectors).indexOf(a.sector) -
        Object.keys(surveySectors).indexOf(b.sector),
    )
    .map((r) => ({
      ...r,
      name: surveySectors[r.sector as SurveySector],
      url: `${publicHotelBaseUrl()}/encuesta/general/${r.sector}`,
    }));
}
