import { z } from "zod";
export const surveySectorSchema = z.enum([
  "hotel",
  "spa",
  "events",
  "restaurant",
]);
export type SurveySector = z.infer<typeof surveySectorSchema>;
export const surveySectors: Record<SurveySector, string> = {
  hotel: "Hotel",
  spa: "SPA",
  events: "Eventos",
  restaurant: "Restaurant",
};
export const surveySectorTargets: Record<SurveySector, string> = {
  hotel: "reception",
  spa: "spa",
  events: "events",
  restaurant: "restaurant",
};
export const sectorReviewPermission = (sector: SurveySector) =>
  `api:reviews:sector:${sector}`;
export function permittedReviewSectors(
  hasPermission: (key: string) => boolean,
): SurveySector[] {
  return (Object.keys(surveySectors) as SurveySector[]).filter((s) =>
    hasPermission(sectorReviewPermission(s)),
  );
}
export function canReadReviews(
  _role: string | undefined,
  hasPermission: (key: string) => boolean,
): boolean {
  return (
    hasPermission("sidebar:/reviews") ||
    permittedReviewSectors(hasPermission).length > 0
  );
}
