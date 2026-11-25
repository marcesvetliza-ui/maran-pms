import { legacyEventFields, hasLegacyEventPreload, type LegacyEventTable } from '@shared/restaurant-event-legacy';

export const retiredEventPreloadMessage = 'Las reservas nuevas se crean en Evento restaurant. Los datos y anticipos anteriores se conservan.';
export const retiredEventPreloadError = (message = retiredEventPreloadMessage) => Object.assign(new Error(message), { statusCode: 409 });

export function validatePhysicalTableCreation(input: LegacyEventTable) {
  if (hasLegacyEventPreload(input)) throw retiredEventPreloadError();
}

export function validateLegacyTablePatch(current: LegacyEventTable, input: LegacyEventTable) {
  if (input.status === 'preloaded' && current.status !== 'preloaded') throw retiredEventPreloadError();
  if (current.status === 'preloaded' && input.status !== undefined && input.status !== 'preloaded') {
    throw retiredEventPreloadError('La precarga anterior se conserva. Iniciá su servicio pendiente para continuar; no se libera ni se elimina la seña desde el plano.');
  }
  for (const key of legacyEventFields) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const unchanged = key === 'eventAdvanceAmount' || key === 'eventSeats'
      ? Number(input[key] || 0) === Number(current[key] || 0)
      : String(input[key] ?? '') === String(current[key] ?? '');
    if (!unchanged) throw retiredEventPreloadError();
  }
}
