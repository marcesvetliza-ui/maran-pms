import { calendarNights, nightlyTotal, type PricedNight } from './nightlyPricing';
export const isAccommodationSource = (id: string) => id === 'accommodation' || /^accommodation:\d{4}-\d{2}-\d{2}$/.test(id);
export type AccommodationNight = { id: string; date: string; amount: number; derived: boolean; rateCents: number; discountCents: number };
/** Legacy allocation is explicitly a distribution of the saved total, never historical rates. */
export function accommodationNights(reservation: any): AccommodationNight[] {
  try {
    const dates = calendarNights(reservation.checkInDate, reservation.checkOutDate);
    const total = Math.round(Number(reservation.roomTotal ?? reservation.totalRoomAmount ?? 0) * 100);
    if (!Number.isSafeInteger(total) || total < 0) return [];
    const saved: PricedNight[] | undefined = reservation.nightlyPricing;
    if (reservation.pricingScheme === 'nightly_v1') {
      if (!Array.isArray(saved) || nightlyTotal(saved) !== total || saved.map(n=>n.date).join(',') !== dates.join(',')) return [];
      return saved.map(n=>({...n,id:`accommodation:${n.date}`,amount:(n.rateCents-n.discountCents)/100,derived:false}));
    }
    return dates.map((date,index)=>{const rateCents=Math.floor(total/dates.length)+(index<total%dates.length?1:0);return {id:`accommodation:${date}`,date,amount:rateCents/100,rateCents,discountCents:0,derived:true};});
  } catch { return []; }
}
/** Old grouped coverage consumes capacity conservatively; exact dated coverage takes precedence. */
export function expandAccommodationCoverage(amounts: Record<string,number>, nights: Pick<AccommodationNight,'id'|'amount'>[]): Record<string,number> {
  if (!nights.length) return amounts;
  const result={...amounts};delete result.accommodation;
  let legacy=Math.max(0,Math.round((amounts.accommodation||0)*100));
  for(const night of nights){const direct=Math.max(0,Math.round((result[night.id]||0)*100));const taken=Math.min(legacy,Math.max(0,Math.round(night.amount*100)-direct));legacy-=taken;result[night.id]=(direct+taken)/100;}
  if(legacy)result[nights[0].id]=(result[nights[0].id]||0)+legacy/100;
  return result;
}
export function accommodationCoverageTotal(amounts: Record<string,number>): number {
  return Object.entries(amounts).filter(([id])=>isAccommodationSource(id)).reduce((sum,[,amount])=>sum+amount,0);
}
