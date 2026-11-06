export type SplitRevenueDay={actualRoomsSold:number;forecastRoomsSold:number;actualRatedRoomNights:number;forecastRatedRoomNights:number;actualRoomRevenue:number;forecastRoomRevenue:number;actualCapacityNights:number;forecastCapacityNights:number;roomsWithMissingRate:number;estimatedRoomNights:number};
export function revenuePhaseSummary(days:SplitRevenueDay[],phase:'actual'|'forecast'){
 const sold=days.reduce((s,d)=>s+d[phase==='actual'?'actualRoomsSold':'forecastRoomsSold'],0);
 const rated=days.reduce((s,d)=>s+d[phase==='actual'?'actualRatedRoomNights':'forecastRatedRoomNights'],0);
 const capacity=days.reduce((s,d)=>s+d[phase==='actual'?'actualCapacityNights':'forecastCapacityNights'],0);
 const revenue=days.reduce((s,d)=>s+Math.round(d[phase==='actual'?'actualRoomRevenue':'forecastRoomRevenue']*100),0)/100;
 return {sold,rated,capacity,revenue,occupancy:capacity?sold/capacity*100:0,adr:rated?revenue/rated:0,revpar:capacity?revenue/capacity:0,missing:sold-rated};
}
