export const ZERO_RATE_NOTE_PATTERN = /\[Tarifa \$0:[^\]]*\]\s*/g;

export function parseReservationRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isZeroReservationRate(value: unknown): boolean {
  return parseReservationRate(value) === 0;
}

export function getReservationRateValidationError(
  value: unknown,
  specialRateReason: unknown,
): string | null {
  if (value === null || value === undefined || value === "") return null;

  const rate = parseReservationRate(value);
  if (rate === null) return "La tarifa asignada por noche debe ser un número válido.";
  if (rate < 0) return "La tarifa asignada por noche no puede ser negativa.";
  if (rate === 0 && !String(specialRateReason ?? "").trim()) {
    return "Ingresá el motivo de la tarifa $0 para guardar la reserva.";
  }
  return null;
}

export function normalizeZeroRateNotes(
  notes: unknown,
  finalRatePerNight: unknown,
  specialRateReason: unknown,
): string | null {
  const cleanNotes = String(notes ?? "").replace(ZERO_RATE_NOTE_PATTERN, "").trim();
  if (!isZeroReservationRate(finalRatePerNight)) return cleanNotes || null;

  const reason = String(specialRateReason ?? "")
    .trim()
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ");
  if (!reason) return cleanNotes || null;

  return [`[Tarifa $0: ${reason}]`, cleanNotes].filter(Boolean).join(" ");
}