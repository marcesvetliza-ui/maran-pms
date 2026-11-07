import {describe,it,expect} from 'vitest';
import {calendarEffective,applyCalendarValues,calendarIntents,calendarRequestSchema} from '@shared/rate-calendar';
import {occupancyPriceRows,ariDelta,compressValues} from '../channex/ari';
const plan={id:'exec',rate_plan_id:'exec',base_rate:'190000.00',currency:'ARS',rate_1pax:'169000.00',rate_2pax:'190000.00',rate_mode:'manual',occupancies:[1,2]};
describe('Channex multi-occupancy prices',()=>{
 it('uses distinct total ARS amounts as decimal strings without multiplying by guests or 100',()=>{
  expect(occupancyPriceRows(plan,calendarEffective(plan,'2026-11-10'))).toEqual([{occupancy:1,rate:'169000.00'},{occupancy:2,rate:'190000.00'}]);
 });
 it('includes all four configured occupancies only when every total is explicit',()=>{
  const four={...plan,occupancies:[4,2,1,3],rate_3pax:'210000.00',rate_4pax:'240000.00'};
  expect(occupancyPriceRows(four,calendarEffective(four,'2026-11-10'))).toEqual([{occupancy:1,rate:'169000.00'},{occupancy:2,rate:'190000.00'},{occupancy:3,rate:'210000.00'},{occupancy:4,rate:'240000.00'}]);
 });
 it('overrides only the chosen occupancy, resets it to the plan and preserves restrictions',()=>{
  const before=calendarEffective(plan,'2026-11-10',{occupancy_rates:{'1':'175000.00'},stop_sell:true});
  const after=applyCalendarValues(before,{occupancyRates:{'2':'205000'}},plan.base_rate);
  expect(occupancyPriceRows(plan,after)).toEqual([{occupancy:1,rate:'175000.00'},{occupancy:2,rate:'205000.00'}]);
  const reset=applyCalendarValues(after,{occupancyRates:{'1':null}},plan.base_rate);
  expect(occupancyPriceRows(plan,reset)[0].rate).toBe('169000.00');expect(reset.stopSell).toBe(true);
 });
 it('rejects missing prices, unknown options, derived plans and ambiguous scalar overrides',()=>{
  const cell=calendarEffective(plan,'2026-11-10');
  expect(()=>occupancyPriceRows({...plan,occupancies:[1,2,3]},cell)).toThrow(/3 persona/);
  expect(()=>occupancyPriceRows({...plan,occupancies:null},cell)).toThrow(/catálogo/);
  expect(()=>occupancyPriceRows({...plan,occupancies:[1,1]},cell)).toThrow(/ocupaciones/);
  expect(()=>occupancyPriceRows({...plan,rate_mode:'derived'},cell)).toThrow(/Manual/);
  expect(()=>occupancyPriceRows(plan,{...cell,rateOverride:'180000'})).toThrow(/precio único/);
 });
 it('sends plural rates only for a price delta and compares equal arrays by value',()=>{
  const before={property_id:'p',rate_plan_id:'exec',date_from:'2026-11-10',date_to:'2026-11-10',rates:[{occupancy:1,rate:'169000.00'},{occupancy:2,rate:'190000.00'}],stop_sell:false};
  expect(ariDelta({...before,rates:before.rates.map(r=>({...r}))},before,['rate'])).toBeNull();
  const after={...before,rates:[{occupancy:1,rate:'170000.00'},{occupancy:2,rate:'190000.00'}],stop_sell:true};
  expect(ariDelta(after,before,['occupancy_rates'])).toEqual({property_id:'p',rate_plan_id:'exec',date_from:'2026-11-10',date_to:'2026-11-10',rates:after.rates});
  expect(ariDelta(after,before,['stop_sell'])).not.toHaveProperty('rates');
  expect(compressValues([before,{...before,date_from:'2026-11-11',date_to:'2026-11-11',rates:before.rates.map(r=>({...r}))}])).toHaveLength(1);
 });
 it('merges disjoint occupancy edits and rejects conflicting or invalid amounts',()=>{
  const change={ratePlanIds:['exec'],dateFrom:'2026-11-10',dateTo:'2026-11-10',values:{occupancyRates:{'1':'169000'}}};
  expect(calendarIntents({changes:[change,{...change,values:{occupancyRates:{'2':'190000'}}}]})).toMatchObject([{values:{occupancyRates:{'1':'169000.00','2':'190000.00'}}}]);
  expect(()=>calendarIntents({changes:[change,{...change,values:{occupancyRates:{'1':'170000'}}}]})).toThrow(/incompatibles/);
  for(const occupancyRates of [{'1':'0'},{'1':'1.234'},{'5':'100'},{}])expect(calendarRequestSchema.safeParse({changes:[{...change,values:{occupancyRates}}]}).success).toBe(false);
 });
});
