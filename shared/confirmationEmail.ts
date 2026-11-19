export const DEFAULT_CONFIRMATION_BODY =
  "Hola {nombre_huesped},\n\nTu reserva está confirmada.\n\nCódigo de reserva: {codigo_reserva}\nCheck-in: {fecha_checkin}\nCheck-out: {fecha_checkout}\n\nAdjuntamos la confirmación de tu reserva en PDF con el detalle de tu estadía.\n\n¡Nos vemos pronto!\nMaran Suites & Towers";

/** Existing saved templates must never promise a mutable physical room. */
export function withoutAssignedRoom(template: string): string {
  return template
    .replace(/\s+en\s+la\s+habitaci[oó]n\s*\{numero_habitacion\}/giu, "")
    .replace(
      /^[\t ]*habitaci[oó]n(?:es)?[\t ]*:[\t ]*\{numero_habitacion\}[\t ]*\r?\n?/gimu,
      "",
    )
    .replaceAll("{numero_habitacion}", "{tipo_habitacion}")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function confirmationBodyTemplate(template: string): string {
  let body = withoutAssignedRoom(template);
  const previousDefault =
    "Hola {nombre_huesped},\n\nTu reserva ha sido confirmada. Te esperamos el {fecha_checkin}.\n\nCheck-in: {fecha_checkin}\nCheck-out: {fecha_checkout}\n\n¡Nos vemos pronto!\nMaran Suites & Towers";
  if (body === previousDefault) return DEFAULT_CONFIRMATION_BODY;
  if (!body.includes("{codigo_reserva}"))
    body += "\n\nCódigo de reserva: {codigo_reserva}";
  if (!/adjunt/i.test(body))
    body +=
      "\n\nAdjuntamos la confirmación de tu reserva en PDF con el detalle de tu estadía.";
  return body;
}
