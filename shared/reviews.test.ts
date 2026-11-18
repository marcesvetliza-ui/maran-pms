import { describe, it, expect } from "vitest";
import {
  surveyAnswerSchema,
  summarizeReviews,
  needsReviewFollowup,
  reviewFiltersSchema,
  type ReviewItem,
} from "./reviews";
describe("Encuestas: puntajes reales y una respuesta por estadía", () => {
  it.each([0, 6, 2.5, "5", null])(
    "rechaza una calificación general inválida: %s",
    (value) => {
      expect(
        surveyAnswerSchema.safeParse({ ratingOverall: value }).success,
      ).toBe(false);
    },
  );
  it("admite solo la nota general y conserva el cero de NPS sin inventar notas de áreas", () => {
    expect(
      surveyAnswerSchema.parse({ ratingOverall: 4, nps: 0 }),
    ).toMatchObject({ areaRatings: {}, nps: 0 });
    expect(
      surveyAnswerSchema.safeParse({
        ratingOverall: 4,
        areaRatings: { spa: 0 },
      }).success,
    ).toBe(false);
    expect(
      surveyAnswerSchema.safeParse({ ratingOverall: 4, nps: 11 }).success,
    ).toBe(false);
  });
  it("usa denominadores por área y cuenta cada encuesta una sola vez", () => {
    const rows = [
      {
        rating: 4,
        areaRatings: { room: 4 },
        reviewDate: "2026-11-18",
        nps: 0,
        followupStatus: "resolved",
      },
      {
        rating: 5,
        areaRatings: { room: 2, spa: 5 },
        reviewDate: "2026-11-19",
        nps: 10,
        followupStatus: "new",
      },
    ] as ReviewItem[];
    expect(summarizeReviews(rows)).toMatchObject({
      count: 2,
      average: 4.5,
      areas: { room: { average: 3, count: 2 }, spa: { average: 5, count: 1 } },
      nps: 0,
      npsCount: 2,
    });
  });
  it("avisa por nota baja de un área o por pedido de contacto aunque la general sea buena", () => {
    expect(needsReviewFollowup(5, { room: 2, spa: null }, false)).toBe(true);
    expect(needsReviewFollowup(5, {}, true)).toBe(true);
    expect(needsReviewFollowup(4, { room: 4, spa: null }, false)).toBe(false);
  });
  it("rechaza fechas inexistentes en los filtros", () =>
    expect(reviewFiltersSchema.safeParse({ from: "2026-02-30" }).success).toBe(
      false,
    ));
});
