import {it,expect,vi} from 'vitest';
vi.mock('../db',()=>({db:{},withDatabaseTransaction:(fn:any)=>fn()}));
import {resolveNightlyRate} from '../revenue/metrics';
import {calculateLodging} from '../reports/lodging';
import {revenuePhaseSummary} from '@shared/revenueReportSummary';
const dates=['2026-10-30','2026-10-31','2026-11-01'];
const r:any={id:'s',roomId:'room',roomTypeId:'type',source:'directo',status:'checked_out',numberOfGuests:1,checkInDate:dates[0],checkOutDate:'2026-11-02',totalRoomAmount:'540',finalRatePerNight:'99999',nights:99,pricingScheme:'nightly_v1',nightlyPricing:dates.map((date,i)=>({date,rateCents:(i+1)*10000,discountCents:(i+1)*1000}))};
const rate=(row:any,date:string=dates[1],links=new Map<string,string>(),blocks:any[]=[])=>resolveNightlyRate(row,date,links,blocks,'2026-11-06');
it('shares actual net nightly prices with lodging reports, ignoring conflicting flat rates',()=>{
 const report=calculateLodging(dates[0],dates[2],'2026-11-06',[{id:'room',roomNumber:'101',roomTypeId:'type',isActive:true,isVirtual:false}],[r],[]);
 expect(report.summary.revenue).toBe(540);for(const night of report.nights)expect(rate(r,night.date)).toMatchObject({rate:night.amount,source:'nightly_pricing',estimated:false,countsForAdr:true});
});
it('uses exact legacy cent allocation and date duration instead of stale nights count',()=>{const row={...r,pricingScheme:'legacy',nightlyPricing:null,totalRoomAmount:'100.01'};expect(dates.map(date=>rate(row,date).rate)).toEqual([33.34,33.34,33.33]);});
it('does not hide an invalid saved contract with either flat or group prices',()=>{const row={...r,totalRoomAmount:'541',status:'confirmed'};expect(rate(row,dates[1],new Map([['s','g']]),[{groupId:'g',roomTypeId:'type',agreedRate:'1000',blockCheckInDate:'2026-10-01',blockCheckOutDate:'2026-12-01'}])).toMatchObject({countsForAdr:false,source:'missing_rate'});});
it('permits a group-rate estimate only for forecast, never as confirmed actual revenue',()=>{
 const blocks=[{groupId:'g',roomTypeId:'type',agreedRate:'1000',blockCheckInDate:'2026-10-01',blockCheckOutDate:'2026-12-01'}],links=new Map([['s','g']]);const row={...r,pricingScheme:'legacy',nightlyPricing:null,totalRoomAmount:'0'};
 expect(rate(row,dates[1],links,blocks).source).toBe('missing_rate');expect(rate({...row,status:'confirmed',checkInDate:'2026-11-10',checkOutDate:'2026-11-11'},'2026-11-10',links,blocks)).toMatchObject({rate:1000,estimated:true,source:'group_block_agreed_rate'});
});
it('counts explicit free nights while keeping unknown prices distinct',()=>{expect(rate({...r,totalRoomAmount:'0',nightlyPricing:r.nightlyPricing.map((n:any)=>({...n,discountCents:n.rateCents}))})).toMatchObject({rate:0,countsForAdr:true,source:'nightly_pricing'});expect(rate({...r,totalRoomAmount:null})).toMatchObject({rate:0,countsForAdr:false});});
it('separates weighted actual and forecast indicators and preserves cents in period totals',()=>{
 const days=[{actualRoomsSold:2,forecastRoomsSold:1,actualRatedRoomNights:1,forecastRatedRoomNights:1,actualRoomRevenue:100.01,forecastRoomRevenue:200.02,actualCapacityNights:4,forecastCapacityNights:4,roomsWithMissingRate:1,estimatedRoomNights:0},{actualRoomsSold:0,forecastRoomsSold:2,actualRatedRoomNights:0,forecastRatedRoomNights:2,actualRoomRevenue:0,forecastRoomRevenue:300.03,actualCapacityNights:0,forecastCapacityNights:6,roomsWithMissingRate:0,estimatedRoomNights:2}];
 expect(revenuePhaseSummary(days,'actual')).toMatchObject({sold:2,revenue:100.01,occupancy:50,adr:100.01,missing:1});expect(revenuePhaseSummary(days,'forecast')).toMatchObject({sold:3,revenue:500.05,occupancy:30,missing:0});
});
