import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ensureChannexAriSchema } from '../channex/ariSchema';
import { BOOKING_ENGINE_SCHEMA_SQL } from '../bookingEngineSchema';
/** Only for the disposable, guarded booking-engine test database. */
export async function seedBookingOtaScope(pool: Pool, roomTypeId: string, planId: string) {
  await ensureChannexAriSchema(pool);
  await pool.query('TRUNCATE channex_connections CASCADE');
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
  await pool.query("UPDATE booking_engine_ota_source SET connection_id=NULL WHERE singleton=true");
  const id=randomUUID();
  await pool.query(`INSERT INTO channex_connections(id,label,environment,channex_property_id,base_url,is_active,created_at)
    VALUES($1,'Synthetic shared source','real','synthetic-property','https://app.channex.io/api/v1',false,now())`,[id]);
  await pool.query(`INSERT INTO channex_ari_settings(connection_id,enabled,floor,currency) VALUES($1,false,1,'ARS')`,[id]);
  await pool.query(`INSERT INTO channex_room_type_mappings(connection_id,channex_room_type_id,channex_room_type_title,room_type_id,created_at)
    VALUES($1,'synthetic-type','Synthetic variant',$2,now())`,[id,roomTypeId]);
  await pool.query(`INSERT INTO channex_rate_plan_mappings(connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,sell_mode,rate_mode,created_at)
    VALUES($1,'synthetic-type','synthetic-plan','Synthetic reference',$2,'per_room','manual',now())`,[id,planId]);
  return id;
}
