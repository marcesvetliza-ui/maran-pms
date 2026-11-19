import { surveySectorSchema, type SurveySector } from "./survey-sectors";
import { z } from "zod";

export const reviewStates = {
  new: "Nuevo",
  in_progress: "En seguimiento",
  resolved: "Resuelto",
} as const;
export const reviewSources = {
  survey: "Encuesta interna",
  direct: "Carga manual",
  google: "Google (carga manual)",
  booking: "Booking (carga manual)",
  other: "Otro",
} as const;
export const rating = z.number().int().min(1).max(5);
export const reviewDateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
    );
  });
export const surveyAnswerSchema = z.object({
  ratingOverall: rating,
  areaRatings: z.record(rating.nullable()).default({}),
  areaQuestions: z.record(z.string().max(250)).optional(),
  areaTextAnswers: z.record(z.string().trim().max(2000)).default({}),
  notApplicable: z.array(z.string().max(60)).max(100).default([]),
  ratingRoom: rating.nullable().optional(),
  ratingCleanliness: rating.nullable().optional(),
  ratingService: rating.nullable().optional(),
  ratingFood: rating.nullable().optional(),
  nps: z.number().int().min(0).max(10).nullable().optional(),
  contactRequested: z.boolean().default(false),
  comment: z.string().trim().max(5000).nullable().optional(),
  guestName: z.string().trim().max(160).nullable().optional(),
});
export const reviewFiltersSchema = z.object({
  search: z.string().trim().max(200).default(""),
  from: reviewDateKey.optional(),
  to: reviewDateKey.optional(),
  dateField: z.enum(["response", "stay"]).default("response"),
  source: z.enum(["survey", "direct", "google", "booking", "other"]).optional(),
  sector: surveySectorSchema.optional(),
  sectorMode: z.enum(["all", "origin", "assigned"]).default("all"),
  surveyKind: z.enum(["personal", "generic"]).optional(),
  area: z.string().max(60).optional(),
  actionArea: z.string().max(60).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  status: z.enum(["new", "in_progress", "resolved"]).optional(),
  room: z.string().max(30).optional(),
  roomType: z.string().max(80).optional(),
  channel: z.string().max(80).optional(),
});
export type ReviewFilters = z.infer<typeof reviewFiltersSchema>;
export interface ReviewArea {
  questionType?: "rating" | "text";
  sectors?: SurveySector[];
  key: string;
  name: string;
  question: string;
  active: boolean;
  inSurvey: boolean;
  sortOrder: number;
  notificationArea: string;
}
export interface ReviewItem {
  sector?: SurveySector | null;
  surveyKind?: "personal" | "generic" | null;
  visitDate?: string | null;
  eventName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  id: string;
  reservationId: string | null;
  guestId: string;
  roomId: string | null;
  guestName: string;
  roomNumber: string | null;
  checkIn: string | null;
  checkOut: string | null;
  roomType: string | null;
  channel: string | null;
  reviewDate: string;
  source: string;
  rating: number;
  title: string | null;
  content: string;
  areaRatings: Record<string, number>;
  areaQuestions: Record<string, string>;
  areaTextAnswers?: Record<string, string>;
  notApplicable?: string[];
  sentiment: string | null;
  nps: number | null;
  contactRequested: boolean;
  followupStatus: keyof typeof reviewStates;
  assignedTo: string | null;
  actionAreas: string[];
  surveyResponseId: string | null;
  staffResponse: string | null;
}
export function needsReviewFollowup(
  overall: number,
  areas: Record<string, number | null>,
  contact: boolean,
) {
  return (
    contact ||
    overall <= 2 ||
    Object.values(areas).some((value) => value !== null && value <= 2)
  );
}
/** N/A never enters a denominator. NPS includes an explicit zero. */
export function summarizeReviews(reviews: ReviewItem[]) {
  const mean = (values: number[]) =>
    values.length
      ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
      : null;
  const areas: Record<string, { average: number | null; count: number }> = {};
  for (const key of new Set(
    reviews.flatMap((r) => Object.keys(r.areaRatings)),
  )) {
    const values = reviews
      .map((r) => r.areaRatings[key])
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
    areas[key] = { average: mean(values), count: values.length };
  }
  const npsValues = reviews
    .map((r) => r.nps)
    .filter(
      (n): n is number =>
        n !== null && Number.isInteger(n) && n >= 0 && n <= 10,
    );
  const months: Record<string, { average: number | null; count: number }> = {};
  for (const month of new Set(reviews.map((r) => r.reviewDate.slice(0, 7)))) {
    const values = reviews
      .filter((r) => r.reviewDate.startsWith(month))
      .map((r) => r.rating);
    months[month] = { average: mean(values), count: values.length };
  }
  return {
    sectors: Object.fromEntries(
      ["hotel", "spa", "events", "restaurant"].map((sector) => {
        const own = reviews.filter((r) => r.sector === sector);
        return [
          sector,
          { count: own.length, average: mean(own.map((r) => r.rating)) },
        ];
      }),
    ),
    personal: reviews.filter((r) => r.surveyKind === "personal").length,
    generic: reviews.filter((r) => r.surveyKind === "generic").length,
    count: reviews.length,
    average: mean(reviews.map((r) => r.rating)),
    pending: reviews.filter((r) => r.followupStatus !== "resolved").length,
    areas,
    months,
    nps: npsValues.length
      ? Math.round(
          (100 *
            (npsValues.filter((n) => n >= 9).length -
              npsValues.filter((n) => n <= 6).length)) /
            npsValues.length,
        )
      : null,
    npsCount: npsValues.length,
  };
}
