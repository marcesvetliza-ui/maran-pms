import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db, withDatabaseTransaction } from '../db';
import { parseBookingRevision, revisionHash } from './bookingRevision';
import { settleBooking } from './settlement';
import { operationAllowed } from './connectionPolicy';
import { amountString } from '@shared/nightlyPricing';
import type { InboundAssignmentOptions, InboundAssignmentRequest, InboundAssignmentRoom } from '@shared/channexAssignment';

export const assignmentRequestSchema = z.object({
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedConfigurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  assignments: z.record(z.string().min(1).max(160), z.string().min(1).max(160)).refine(v => Object.keys(v).length > 0 && Object.keys(v).length <= 20),
  reason: z.string().trim().min(3).max(500),
  confirmCategoryChange: z.boolean(), confirmScopeChange: z.boolean(),
  overrideTentativeGroupWarning: z.boolean().optional(),
}).strict();
export type ManualAssignment = InboundAssignmentRequest & {
  actor: { id: string; name: string; ip?: string }; canOverrideScope: boolean;
};
export const assignmentFailure = (message: string, code = 'ASSIGNMENT_REQUIRES_REVIEW', statusCode = 409) =>
  Object.assign(new Error(message), { code, statusCode });

export async function assertLatestAssignableRevision(connectionId: string, source: any) {
  if (!source?.booking_id || !['pending', 'review', 'applied'].includes(source.status)
    || ['WRONG_PROPERTY', 'INVALID_REVISION', 'REVISION_ID_COLLISION', 'MASKED_GUEST_DATA'].includes(source.review_code)) {
    throw assignmentFailure('Esta revisión necesita resolver sus datos de origen antes de asignarse.');
  }
  const latest = (await db.execute(sql`SELECT revision_id FROM channex_inbound_revisions
    WHERE connection_id=${connectionId} AND booking_id=${source.booking_id}
    ORDER BY (status='stale'),COALESCE(inserted_at,created_at) DESC,created_at DESC,revision_id DESC LIMIT 1`)).rows[0] as any;
  const ambiguous = await db.execute(sql`SELECT 1 FROM channex_inbound_revisions
    WHERE connection_id=${connectionId} AND booking_id=${source.booking_id} AND revision_id<>${source.revision_id}
      AND inserted_at=${source.inserted_at}::timestamptz AND status<>'stale' LIMIT 1`);
  if (ambiguous.rows.length) throw assignmentFailure('Hay revisiones del canal con el mismo horario. Revisá su orden antes de asignar.', 'ASSIGNMENT_REVISION_AMBIGUOUS');
  if (latest?.revision_id !== source.revision_id) {
    throw assignmentFailure('Llegó una revisión más reciente. Actualizá la bandeja antes de asignar.', 'ASSIGNMENT_REVISION_CHANGED');
  }
}

/** Read-only proposal. The writer calls this again inside its inventory transaction. */
export async function assignmentContext(connectionId: string, revisionId: string, canOverrideScope: boolean) {
  const source = (await db.execute(sql`SELECT * FROM channex_inbound_revisions
    WHERE connection_id=${connectionId} AND revision_id=${revisionId}`)).rows[0] as any;
  if (!source) throw assignmentFailure('Reserva recibida no encontrada.', 'NOT_FOUND', 404);
  await assertLatestAssignableRevision(connectionId, source);
  const config = (await db.execute(sql`SELECT c.*,s.floor,s.currency,s.room_ids,s.enabled AS ari_enabled,
    i.enabled AS inbound_enabled,i.settlement_exchange_rate FROM channex_connections c
    JOIN channex_ari_settings s ON s.connection_id=c.id JOIN channex_inbound_settings i ON i.connection_id=c.id
    WHERE c.id=${connectionId} FOR SHARE OF c,s,i`)).rows[0] as any;
  if (!config?.is_active || !config.ari_enabled || !config.inbound_enabled || !operationAllowed(config, 'inbound')) {
    throw assignmentFailure('La conexión y la recepción deben estar habilitadas antes de asignar.');
  }
  const booking = parseBookingRevision(source.payload, config.channex_property_id);
  if (booking.status === 'cancelled') throw assignmentFailure('La reserva del canal está cancelada.');
  if (!['ARS', 'USD'].includes(booking.currency!) || booking.currency !== config.currency) {
    throw assignmentFailure('Revisá la moneda del canal y la configurada para esta conexión.');
  }
  const cursor = (await db.execute(sql`SELECT * FROM channex_inbound_bookings
    WHERE connection_id=${connectionId} AND booking_id=${booking.bookingId}`)).rows[0] as any;
  const rate = booking.currency === 'USD' ? String(cursor?.settlement_exchange_rate || config.settlement_exchange_rate || '') : '1.000000';
  const settled = settleBooking(booking, rate);
  // Hold mapping and tariff definitions until the proposal/application transaction
  // ends. Availability is checked again under the canonical inventory mutex.
  await db.execute(sql`SELECT id FROM channex_room_type_mappings WHERE connection_id=${connectionId} FOR SHARE`);
  await db.execute(sql`SELECT id FROM channex_rate_plan_mappings WHERE connection_id=${connectionId} FOR SHARE`);
  await db.execute(sql`SELECT p.id FROM rate_plans p WHERE p.id IN(SELECT rate_plan_id FROM channex_rate_plan_mappings WHERE connection_id=${connectionId}) FOR SHARE OF p`);
  const maps = (await db.execute(sql`SELECT rm.channex_room_type_id,rm.channex_room_type_title,
    rm.room_type_id,rm.room_ids,rt.name AS category,rp.channex_rate_plan_id,rp.rate_plan_id,
    p.room_type_id AS plan_room_type,p.currency AS plan_currency,rp.remote_present
    FROM channex_room_type_mappings rm LEFT JOIN room_types rt ON rt.id=rm.room_type_id
    LEFT JOIN channex_rate_plan_mappings rp ON rp.connection_id=rm.connection_id AND rp.channex_room_type_id=rm.channex_room_type_id
    LEFT JOIN rate_plans p ON p.id=rp.rate_plan_id WHERE rm.connection_id=${connectionId}
    ORDER BY rm.channex_room_type_id,rp.channex_rate_plan_id`)).rows as any[];
  const physicalRooms = (await db.execute(sql`SELECT r.id,r.room_number,r.room_type_id,r.floor,
    COALESCE(r.max_occupancy,rt.max_occupancy) AS capacity,rt.name AS category
    FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id
    WHERE r.is_active AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB' AND r.floor IS DISTINCT FROM 99
      AND r.status NOT IN ('maintenance','oos')
      AND NOT EXISTS(SELECT 1 FROM maintenance_blocks m WHERE m.room_id=r.id
        AND m.block_from<${booking.departure}::date AND m.block_to>=${booking.arrival}::date)
      AND NOT EXISTS(SELECT 1 FROM reservations x WHERE x.room_id=r.id
        AND x.status NOT IN ('cancelled','checked_out','no_show')
        AND x.check_in_date<${booking.departure}::date AND x.check_out_date>${booking.arrival}::date)
    ORDER BY rt.name,r.room_number`)).rows as any[];
  const configurationHash = revisionHash({ floor: config.floor, roomIds: config.room_ids,
    currency: config.currency, rate, maps });
  const options: InboundAssignmentOptions = {
    revisionId, payloadHash: source.payload_hash, configurationHash,
    reviewCode: source.review_code, arrival: booking.arrival!, departure: booking.departure!,
    currency: booking.currency!, amount: amountString(booking.rooms.reduce((sum, r) => sum + r.totalCents, 0)),
    exchangeRate: rate, settlementTotal: amountString(settled.reduce((sum, r) => sum + r.totalCents, 0)),
    canOverrideScope,
    rooms: booking.rooms.map(remote => {
      const typeMap = maps.find(m => m.channex_room_type_id === remote.remoteType);
      const planMaps = maps.filter(m => m.channex_room_type_id === remote.remoteType && m.channex_rate_plan_id === remote.remotePlan);
      const map = planMaps.length === 1 ? planMaps[0] : undefined;
      const validMap = !!map?.room_type_id && !!map.rate_plan_id && map.remote_present
        && map.room_type_id === map.plan_room_type && map.plan_currency === booking.currency;
      const choices: InboundAssignmentRoom[] = physicalRooms.filter(r => Number(r.capacity) >= remote.occupancy).map(r => {
        const categoryChanged = !typeMap?.room_type_id || r.room_type_id !== typeMap.room_type_id;
        const scopeOverride = !validMap || r.room_type_id !== map!.room_type_id
          || (config.floor != null && r.floor !== config.floor)
          || (config.room_ids != null && !config.room_ids.includes(r.id))
          || (map!.room_ids != null && !map!.room_ids.includes(r.id));
        return { id: r.id, number: r.room_number, categoryId: r.room_type_id, category: r.category,
          capacity: Number(r.capacity), floor: r.floor, categoryChanged, scopeOverride };
      }).filter(r => canOverrideScope || !r.scopeOverride);
      return { key: remote.key, category: typeMap?.channex_room_type_title || 'Categoría del canal sin identificar',
        mappedCategory: typeMap?.category || null, occupancy: remote.occupancy,
        sourceTotal: amountString(remote.totalCents),
        ...(remote.sourceVatCents > 0 ? { sourceNetAmount: amountString(remote.sourceNetCents), sourceVatAmount: amountString(remote.sourceVatCents) } : {}),
        ...(remote.remotePlan === null ? { ratePlanMissing: true } : {}), choices };
    }),
  };
  return { source, config, booking, options };
}

export function validateManualSelection(options: InboundAssignmentOptions, manual: ManualAssignment) {
  if (manual.expectedPayloadHash !== options.payloadHash || manual.expectedConfigurationHash !== options.configurationHash) {
    throw assignmentFailure('Cambió la reserva, el mapeo o la cotización. Volvé a revisar la asignación.', 'ASSIGNMENT_PREVIEW_CHANGED');
  }
  const keys = Object.keys(manual.assignments);
  if (keys.length !== options.rooms.length || options.rooms.some(r => !keys.includes(r.key))
    || new Set(Object.values(manual.assignments)).size !== keys.length) {
    throw assignmentFailure('Elegí una habitación diferente para cada unidad de la reserva.');
  }
  const selected = new Map<string, InboundAssignmentRoom>();
  for (const remote of options.rooms) {
    const room = remote.choices.find(r => r.id === manual.assignments[remote.key]);
    if (!room) throw assignmentFailure('Una habitación ya no está disponible o no admite la ocupación. Actualizá las opciones.', 'ASSIGNMENT_ROOM_UNAVAILABLE');
    if (room.categoryChanged && !manual.confirmCategoryChange) {
      throw assignmentFailure('Confirmá expresamente el cambio de categoría antes de asignar.', 'CATEGORY_CHANGE_CONFIRMATION_REQUIRED', 400);
    }
    if (room.scopeOverride && (!manual.canOverrideScope || !manual.confirmScopeChange)) {
      throw assignmentFailure('La selección requiere permiso de configuración y confirmación del alcance manual.', 'MANUAL_SCOPE_CONFIRMATION_REQUIRED', manual.canOverrideScope ? 400 : 403);
    }
    selected.set(remote.key, room);
  }
  return selected;
}

export async function getInboundAssignmentOptions(connectionId: string, revisionId: string, canOverrideScope: boolean) {
  return withDatabaseTransaction(async () => {
    const context = await assignmentContext(connectionId, revisionId, canOverrideScope);
    const links = await db.execute(sql`SELECT 1 FROM channex_inbound_rooms WHERE connection_id=${connectionId} AND booking_id=${context.booking.bookingId} LIMIT 1`);
    if (links.rows.length || context.source.status === 'applied') throw assignmentFailure('La reserva ya está vinculada al PMS. Actualizá la bandeja para abrirla.');
    return context.options;
  });
}
