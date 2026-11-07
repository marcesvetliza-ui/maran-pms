import {nightlyTotal,type PricedNight} from './nightlyPricing';
export type ReportPricedStay={totalRoomAmount:unknown;pricingScheme?:string|null;nightlyPricing?:PricedNight[]|null;specialRateReason?:string|null};
/** Shared, read-only report valuation: unknown is never silently a free stay. */
export function nightlyReportPrices(stay:ReportPricedStay,dates:readonly string[]){
 const prices=new Map<string,{amount:number;estimated:boolean}>();
 if(!dates.length||stay.totalRoomAmount===null||stay.totalRoomAmount===undefined||String(stay.totalRoomAmount).trim()==='')return prices;
 const total=Number(stay.totalRoomAmount),cents=Math.round(total*100);
 if(!Number.isFinite(total)||total<0||!Number.isSafeInteger(cents))return prices;
 try{
  const saved=stay.nightlyPricing;
  if(stay.pricingScheme==='nightly_v1'){
   if(!Array.isArray(saved)||saved.length!==dates.length||!saved.every((n,i)=>n.date===dates[i])||nightlyTotal(saved)!==cents)return prices;
   for(const night of saved)prices.set(night.date,{amount:(night.rateCents-night.discountCents)/100,estimated:false});
  }else if(total>0||String(stay.specialRateReason??'').trim()){
   dates.forEach((date,i)=>prices.set(date,{amount:(Math.floor(cents/dates.length)+(i<cents%dates.length?1:0))/100,estimated:true}));
  }
 }catch{/* Invalid saved prices remain unknown; never substitute a flat rate. */}
 return prices;
}
