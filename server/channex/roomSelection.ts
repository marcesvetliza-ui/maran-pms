import type { Pool, PoolClient } from 'pg';

type Queryable = Pick<PoolClient, 'query'>;
export class RoomSelectionError extends Error {}

/** null keeps the legacy whole-category mapping; [] never means all rooms. */
export async function validateRoomSelections(c: Queryable, connectionId: string, floor: number | null, complete = true, scopeRoomIds: string[] | null = null) {
  const mappings = (await c.query(`SELECT channex_room_type_id,room_type_id,room_ids
    FROM channex_room_type_mappings WHERE connection_id=$1`, [connectionId])).rows;
  const rooms = (await c.query(`SELECT id,room_type_id,floor FROM rooms
    WHERE is_active AND NOT COALESCE(is_virtual,false) AND room_number<>'REUB'
      AND (($1::int IS NULL AND floor IS DISTINCT FROM 99) OR floor=$1)`, [floor])).rows;
  if (scopeRoomIds !== null && (!scopeRoomIds.length || new Set(scopeRoomIds).size !== scopeRoomIds.length || scopeRoomIds.some(id => !rooms.some(r => r.id === id)))) {
    throw new RoomSelectionError('Elegí habitaciones físicas activas del piso configurado, sin repetirlas');
  }
  const scopedRooms = scopeRoomIds === null ? rooms : rooms.filter(r => scopeRoomIds.includes(r.id));
  const relevant = scopeRoomIds === null ? mappings : mappings.filter(map => scopedRooms.some(r => r.room_type_id === map.room_type_id && (map.room_ids === null || map.room_ids.includes(r.id))));
  const owners = new Map<string, string>();
  for (const map of relevant) {
    if (!map.room_type_id) {
      if (complete) throw new RoomSelectionError('Completá un mapeo único para cada categoría antes de sincronizar');
      continue;
    }
    if (map.room_ids !== null && (!map.room_ids.length || new Set(map.room_ids).size !== map.room_ids.length)) {
      throw new RoomSelectionError('Seleccioná al menos una habitación sin repetirla, o usá toda la categoría');
    }
    const selected = rooms.filter(r => r.room_type_id === map.room_type_id && (map.room_ids === null || map.room_ids.includes(r.id)));
    if (map.room_ids !== null && selected.length !== map.room_ids.length) {
      throw new RoomSelectionError('Las habitaciones deben estar activas, ser físicas y pertenecer a la categoría y al piso configurados');
    }
    for (const room of selected.filter(r => scopeRoomIds === null || scopeRoomIds.includes(r.id))) {
      if (owners.has(room.id)) throw new RoomSelectionError('Una habitación no puede pertenecer a dos categorías de Channex en la misma conexión');
      owners.set(room.id, map.channex_room_type_id);
    }
    // Whole-category mappings still overlap even when there are no rooms yet.
    if (scopeRoomIds === null && mappings.some(other => other !== map && other.room_type_id === map.room_type_id && (other.room_ids === null || map.room_ids === null))) {
      throw new RoomSelectionError('Completá un mapeo único: para dividir una categoría elegí habitaciones específicas en ambos mapeos');
    }
  }
  if (complete && scopeRoomIds !== null && scopedRooms.some(r => !owners.has(r.id))) {
    throw new RoomSelectionError('Mapeá todas las habitaciones seleccionadas antes de activar el envío');
  }
  return relevant;
}

export async function updateRoomSelection(pool: Pool, id: string, input: { roomTypeId: string | null; roomIds?: string[] | null }) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const current = (await c.query('SELECT connection_id FROM channex_room_type_mappings WHERE id=$1', [id])).rows[0];
    if (!current) { await c.query('ROLLBACK'); return null; }
    // Serializes all mapping edits for this property, including simultaneous requests.
    await c.query('SELECT id FROM channex_connections WHERE id=$1 FOR UPDATE', [current.connection_id]);
    const settings = (await c.query('SELECT floor,enabled FROM channex_ari_settings WHERE connection_id=$1', [current.connection_id])).rows[0];
    const inbound = (await c.query('SELECT enabled FROM channex_inbound_settings WHERE connection_id=$1', [current.connection_id])).rows[0];
    if (settings?.enabled || inbound?.enabled) throw new RoomSelectionError('Pausá la captura y la recepción de reservas antes de modificar las habitaciones');
    const roomIds = input.roomTypeId === null ? null : input.roomIds ?? null;
    await c.query('UPDATE channex_room_type_mappings SET room_type_id=$2,room_ids=$3::text[] WHERE id=$1', [id, input.roomTypeId, roomIds]);
    await validateRoomSelections(c, current.connection_id, settings?.floor ?? null, false);
    const updated = (await c.query(`SELECT id,connection_id AS "connectionId",channex_room_type_id AS "channexRoomTypeId",
      channex_room_type_title AS "channexRoomTypeTitle",room_type_id AS "roomTypeId",room_ids AS "roomIds",created_at AS "createdAt"
      FROM channex_room_type_mappings WHERE id=$1`, [id])).rows[0];
    await c.query('COMMIT');
    return updated;
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}
