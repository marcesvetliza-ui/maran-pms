import { sql, eq } from 'drizzle-orm';
import { z } from 'zod';
import { agencies } from '@shared/schema';
import { calculateAgencyProduction, type AgencyProductionFilters, type AgencyProductionStay } from '@shared/agencyProduction';
import { db, withReadOnlyDatabaseTransaction } from './db';
import { getArgentinaOperationalDate } from './utils/argentinaDateTime';

const filtersSchema = z.object({ from: z.string().date().optional(), to: z.string().date().optional(), agencyId: z.string().min(1).max(200).optional() }).strict();
export function validateAgencyProductionFilters(input: unknown): AgencyProductionFilters {
  const parsed = filtersSchema.safeParse(input);
  if (!parsed.success || parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) throw Object.assign(new Error('Revisá las fechas y el alcance del reporte de agencias.'), { statusCode: 400 });
  return parsed.data;
}
export async function getAgencyProductionReport(input: AgencyProductionFilters = {}) {
  const filters = validateAgencyProductionFilters(input);
  return withReadOnlyDatabaseTransaction(async () => {
    const asOf = getArgentinaOperationalDate();
    const agencyRows = await db.select().from(agencies).where(filters.agencyId ? eq(agencies.id, filters.agencyId) : undefined);
    const stays = await db.execute(sql`SELECT r.id,r.agency_id AS "agencyId",r.status,r.check_in_date::text AS "checkInDate",r.check_out_date::text AS "checkOutDate",
      r.total_room_amount AS "totalRoomAmount",r.pricing_scheme AS "pricingScheme",r.nightly_pricing AS "nightlyPricing",r.special_rate_reason AS "specialRateReason",
      rm.is_virtual AS "roomIsVirtual",rm.room_number AS "roomNumber",rm.floor
      FROM reservations r LEFT JOIN rooms rm ON rm.id=r.room_id
      WHERE r.agency_id IS NOT NULL AND r.agency_id<>'' AND r.status IN ('checked_in','checked_out') AND r.check_in_date<${asOf}::date
      AND (${filters.agencyId ? sql`r.agency_id=${filters.agencyId}` : sql`TRUE`})
      AND (${filters.from ? sql`r.check_out_date>${filters.from}::date` : sql`TRUE`})
      AND (${filters.to ? sql`r.check_in_date<=${filters.to}::date` : sql`TRUE`})`);
    return calculateAgencyProduction(agencyRows, stays.rows as AgencyProductionStay[], filters, asOf);
  });
}
