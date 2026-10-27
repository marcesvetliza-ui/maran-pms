import { z } from "zod";
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const spaPlanningMoveSchema = z
  .object({
    cabinId: z.string().min(1),
    startTime: time,
    expected: z
      .object({
        cabinId: z.string().min(1),
        treatmentId: z.string().min(1),
        appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: time,
        endTime: time,
        status: z.string(),
      })
      .strict(),
  })
  .strict();
export type SpaPlanningMove = z.infer<typeof spaPlanningMoveSchema>;
export type MovableSpaAppointment = SpaPlanningMove["expected"] & {
  id: string;
  guestName: string;
  guestLastName?: string | null;
  resourceReservations?: unknown[];
  displayedAsResource?: boolean;
};
export function spaMoveEndTime(
  start: string,
  oldStart: string,
  oldEnd: string,
): string {
  const minutes = (s: string) => {
    if (!time.safeParse(s).success) throw Error("Horario inválido.");
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const duration = minutes(oldEnd) - minutes(oldStart),
    begin = minutes(start),
    end = begin + duration;
  if (duration <= 0 || begin < 8 * 60 || begin % 30 !== 0 || end > 22 * 60)
    throw Error("El turno debe quedar completo entre las 08:00 y las 22:00.");
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}
