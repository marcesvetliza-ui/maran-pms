import { describe,it,expect } from 'vitest';
import { pendingInventoryDemand as calculatePendingInventory,inboundInventoryRange } from '../channex/inboundInventory';
const targets=[{room_type_id:'local-executive',channex_room_type_id:'channel-executive',rooms:['one','two']}];
const pendingInventoryDemand=(rows:any[],dates:readonly string[])=>calculatePendingInventory(rows,dates,targets);
const days=['2027-03-13','2027-03-14','2027-03-15'];
const row=(extra:any={})=>({property_id:'hotel',mappings:{executive:'local-executive'},links:{},payload:{attributes:{property_id:'hotel',status:'new',arrival_date:'2027-03-13',departure_date:'2027-03-15',rooms:[{id:'one',room_type_id:'executive'}]}},...extra});
describe('channel inventory before manual room assignment',()=>{
 it('does not consume a disjoint Twin pool sharing the same PMS category',()=>{
  const source=row({mappings:{executive:{type:'local-executive',rooms:['double-1']}}});
  const result=calculatePendingInventory([source],days,[{room_type_id:'local-executive',channex_room_type_id:'double',rooms:['double-1']},{room_type_id:'local-executive',channex_room_type_id:'twin',rooms:['twin-1']}]);
  expect(result).toHaveLength(2);expect(result.every(r=>r.channex_room_type_id==='double')).toBe(true);
 });
 it('holds each booked night without choosing a physical room or counting checkout night',()=>{
  expect(pendingInventoryDemand([row()],days)).toEqual([{room_type_id:'local-executive',channex_room_type_id:'channel-executive',day:days[0],quantity:1},{room_type_id:'local-executive',channex_room_type_id:'channel-executive',day:days[1],quantity:1}]);
 });
 it('counts multiple units and retains a hold even while prices need review',()=>{
  const source=row();source.payload.attributes.amount='bad price';source.payload.attributes.rooms.push({id:'two',room_type_id:'executive'});
  expect(pendingInventoryDemand([source],days).map(r=>r.quantity)).toEqual([2,2]);
 });
 it('does not double-count nights already held by the assigned PMS room',()=>{
  const source=row({links:{one:{physical:true,type:'local-executive',from:'2027-03-13',to:'2027-03-14',status:'confirmed'}}});
  expect(pendingInventoryDemand([source],days)).toEqual([{room_type_id:'local-executive',channex_room_type_id:'channel-executive',day:days[1],quantity:1}]);
 });
 it('holds a replacement night when the assigned room became blocked',()=>{
  const source=row({links:{one:{physical:true,type:'local-executive',from:'2027-03-13',to:'2027-03-15',status:'confirmed',blocks:[{from:'2027-03-14',to:'2027-03-14'}]}}});
  expect(pendingInventoryDemand([source],days)).toEqual([{room_type_id:'local-executive',channex_room_type_id:'channel-executive',day:days[1],quantity:1}]);
 });
 it('still holds an added unit while the original room remains assigned',()=>{
  const source=row({links:{one:{physical:true,type:'local-executive',from:'2027-03-13',to:'2027-03-15',status:'confirmed'}}});source.payload.attributes.rooms.push({id:'two',room_type_id:'executive'});
  expect(pendingInventoryDemand([source],days).map(r=>r.quantity)).toEqual([1,1]);
 });
 it('ignores another property and a cancelled booking',()=>{
  const cancelled=row();cancelled.payload.attributes.status='cancelled';expect(pendingInventoryDemand([cancelled,row({property_id:'other'})],days)).toEqual([]);
 });
 it('does not publish guessed availability for missing dates or categories',()=>{
  const missing=row();missing.payload.attributes.departure_date='invalid';expect(()=>pendingInventoryDemand([missing],days)).toThrow('fechas');expect(()=>pendingInventoryDemand([row({mappings:{}})],days)).toThrow('categoría');
 });
 it('refreshes old and new dates and uses the former dates for a minimal cancellation',()=>{
  const previous=row().payload,next=structuredClone(previous);next.attributes.arrival_date='2027-03-16';next.attributes.departure_date='2027-03-17';
  expect(inboundInventoryRange(next,previous,'2027-03-01')).toEqual({from:'2027-03-13',to:'2027-03-16'});
  expect(inboundInventoryRange({attributes:{status:'cancelled'}},previous,'2027-03-01')).toEqual({from:'2027-03-13',to:'2027-03-14'});
 });
});
