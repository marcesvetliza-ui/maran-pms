import { describe, expect, it } from "vitest";
import { evaluateGroupInventory } from "./group-inventory";

const base = {
  roomTypeId: "std", checkIn: "2026-10-10", checkOut: "2026-10-12",
  operationalInventory: 3,
  groups: [{ id: "g", status: "confirmed", checkInDate: "2026-10-10", checkOutDate: "2026-10-12" }],
  blocks: [{ groupId: "g", roomTypeId: "std", quantity: 2 }],
  reservations: [],
};

describe("group inventory accounting", () => {
  it("commits confirmed blocks per night", () => {
    expect(evaluateGroupInventory({ ...base, operationalInventory: 3 })).toBeNull();
    expect(evaluateGroupInventory({ ...base, operationalInventory: 2 })).toMatchObject({ code: "GROUP_BLOCK_SHORTAGE", canOverride: false });
  });
  it("does not double count linked reservations", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 2, contextGroupId: "g",
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed" }],
    })).toBeNull();
  });
  it("adds overlapping blocks of one group without multiplying linked reservations", () => {
    const input = {
      ...base,
      blocks: [
        { ...base.blocks[0], quantity: 25 },
        { ...base.blocks[0], quantity: 3 },
      ],
      reservations: Array.from({ length: 25 }, (_, i) => ({
        id: `linked-${i}`, groupId: "g", roomTypeId: "std",
        checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed",
      })),
      candidateUnits: 0,
    };
    expect(evaluateGroupInventory({ ...input, operationalInventory: 28 })).toBeNull();
    expect(evaluateGroupInventory({ ...input, operationalInventory: 27 })).toMatchObject({
      code: "GROUP_BLOCK_SHORTAGE", hardDemand: 28,
    });
    const soft = { ...input, groups: [{ ...base.groups[0], status: "blocked" }] };
    expect(evaluateGroupInventory({ ...soft, operationalInventory: 28 })).toBeNull();
    const warning = evaluateGroupInventory({ ...soft, operationalInventory: 27 });
    expect(warning).toMatchObject({ code: "GROUP_BLOCK_WARNING" });
    expect(warning?.warnings).toHaveLength(2);
    expect(warning?.warnings[0]).toMatchObject({ blockQuantity: 28, requested: 3 });
  });
  it("counts a new linked reservation only once across blocks", () => {
    const input = {
      ...base,
      blocks: [{ ...base.blocks[0], quantity: 1 }, { ...base.blocks[0], quantity: 1 }],
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed" }],
      contextGroupId: "g",
    };
    expect(evaluateGroupInventory({ ...input, operationalInventory: 2 })).toBeNull();
    expect(evaluateGroupInventory({ ...input, operationalInventory: 1 })).toMatchObject({
      code: "GROUP_BLOCK_SHORTAGE", hardDemand: 2,
    });
  });
  it("applies each block only on its own nights", () => {
    const input = {
      ...base, checkOut: "2026-10-13", candidateUnits: 0,
      blocks: [
        { ...base.blocks[0], quantity: 2, blockCheckInDate: "2026-10-10", blockCheckOutDate: "2026-10-11" },
        { ...base.blocks[0], quantity: 1, blockCheckInDate: "2026-10-11", blockCheckOutDate: "2026-10-13" },
      ],
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-11", status: "confirmed" }],
    };
    expect(evaluateGroupInventory({ ...input, operationalInventory: 2 })).toBeNull();
    expect(evaluateGroupInventory({ ...input, operationalInventory: 1 })).toMatchObject({
      code: "GROUP_BLOCK_SHORTAGE", date: "2026-10-10", hardDemand: 2,
    });
  });
  it("returns an overridable warning for a soft block invaded by demand", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 2,
      groups: [{ ...base.groups[0], status: "tentative" }],
      blocks: [{ ...base.blocks[0], quantity: 2 }],
      reservations: [{ id: "r", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed" }],
    })).toMatchObject({ code: "GROUP_BLOCK_WARNING", canOverride: true });
  });
  it("accumulates multiple tentative blocks before warning", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 4,
      groups: [
        { ...base.groups[0], id: "g1", status: "tentative" },
        { ...base.groups[0], id: "g2", status: "blocked" },
      ],
      blocks: [
        { ...base.blocks[0], groupId: "g1", quantity: 2 },
        { ...base.blocks[0], groupId: "g2", quantity: 2 },
      ],
    })).toMatchObject({ code: "GROUP_BLOCK_WARNING", canOverride: true });
  });
  it("counts linked reservations outside block dates as normal demand", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 3,
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-09", checkOutDate: "2026-10-10", status: "confirmed" }],
    })).toBeNull();
  });
});
describe("physical room confirmation policy", () => {
  const input = { ...base, operationalInventory: 1, groups: [], blocks: [],
    reservations: [{id:"existing",roomTypeId:"std",checkInDate:"2026-10-10",checkOutDate:"2026-10-12",status:"confirmed"}] };
  it("requires an explicit confirmation for a free physical room with an aggregate deficit", () => {
    expect(evaluateGroupInventory({...input,hasSpecificRoom:true})).toMatchObject({code:"GROUP_BLOCK_WARNING",canOverride:true,hardDemand:2,operationalInventory:1,warnings:[]});
    expect(evaluateGroupInventory({...input,hasSpecificRoom:true,override:true})).toBeNull();
  });
  it("does not override a deficit without a concrete free operational room", () => {
    expect(evaluateGroupInventory({...input,override:true})).toMatchObject({code:"GROUP_BLOCK_SHORTAGE",canOverride:false});
  });
  it("preserves unassigned confirmed group commitments even after acceptance", () => {
    expect(evaluateGroupInventory({...input,groups:base.groups,blocks:base.blocks,hasSpecificRoom:true,override:true})).toMatchObject({code:"GROUP_BLOCK_SHORTAGE",canOverride:false});
  });
  it("checks later nights before offering confirmation", () => {
    const groups=[{...base.groups[0],checkInDate:"2026-10-11"}];
    expect(evaluateGroupInventory({...input,groups,blocks:base.blocks,hasSpecificRoom:true})).toMatchObject({code:"GROUP_BLOCK_SHORTAGE",date:"2026-10-11",canOverride:false});
    expect(evaluateGroupInventory({...input,groups,blocks:base.blocks,hasSpecificRoom:true,override:true})).toMatchObject({code:"GROUP_BLOCK_SHORTAGE",date:"2026-10-11"});
  });
});

describe('completed group assignments release their occupied units',()=>{
 const from='2026-11-10',day='2026-11-12',to='2026-11-13';
 const departed=Array.from({length:3},(_,i)=>({id:`departed-${i}`,roomId:`room-${i}`,groupId:'face',roomTypeId:'suite',checkInDate:from,checkOutDate:i===2?to:day,status:'checked_out',checkedOutAt:day+'T15:00:00Z'}));
 const current=Array.from({length:12},(_,i)=>({id:`current-${i}`,roomId:`current-room-${i}`,groupId:'face',roomTypeId:'suite',checkInDate:from,checkOutDate:to,status:'checked_in'}));
 const individual=Array.from({length:2},(_,i)=>({id:`other-${i}`,roomTypeId:'suite',checkInDate:from,checkOutDate:to,status:'confirmed'}));
 const input={roomTypeId:'suite',checkIn:day,checkOut:to,operationalInventory:17,groups:[{id:'face',status:'inhouse',checkInDate:from,checkOutDate:to}],blocks:[{groupId:'face',roomTypeId:'suite',quantity:15}],reservations:[...current,...individual,...departed]};
 it('releases all three completed units, including departures outside the requested interval and an early departure',()=>{
  const before=structuredClone(input);
  expect(evaluateGroupInventory(input)).toBeNull();
  expect(evaluateGroupInventory({...input,candidateUnits:3})).toBeNull();
  expect(evaluateGroupInventory({...input,candidateUnits:4})).toMatchObject({code:'GROUP_BLOCK_SHORTAGE',hardDemand:18,unassignedConfirmedGroupUnits:0});
  expect(input).toEqual(before);
 });
 it('still protects an actually unassigned confirmed unit even with an override',()=>{
  expect(evaluateGroupInventory({...input,blocks:[{...input.blocks[0],quantity:16}],candidateUnits:3,hasSpecificRoom:true,override:true})).toMatchObject({code:'GROUP_BLOCK_SHORTAGE',canOverride:false,unassignedConfirmedGroupUnits:1});
 });
 it.each(['cancelled','no_show'])('does not turn %s into a group release',status=>{
  expect(evaluateGroupInventory({...input,reservations:[...current,...individual,...departed.map(r=>({...r,status}))]})).toMatchObject({code:'GROUP_BLOCK_SHORTAGE',unassignedConfirmedGroupUnits:3});
 });
 it('does not free a unit before the actual Argentine departure day',()=>{
  expect(evaluateGroupInventory({...input,reservations:[...current,...individual,...departed.map(r=>({...r,checkedOutAt:to+'T15:00:00Z'}))]})).toMatchObject({code:'GROUP_BLOCK_SHORTAGE',unassignedConfirmedGroupUnits:3});
  expect(evaluateGroupInventory({...input,reservations:[...current,...individual,...departed.map(r=>({...r,checkedOutAt:'2026-11-13T02:30:00'}))]})).toBeNull();
 });
 it('conservatively uses the scheduled departure for legacy checkouts without a timestamp',()=>{
  expect(evaluateGroupInventory({...input,reservations:[...current,...individual,...departed.map(r=>({...r,checkedOutAt:null}))],candidateUnits:3})).toMatchObject({unassignedConfirmedGroupUnits:1});
 });
 it('does not release the same physical room twice across sequential stays',()=>{
  const small={...input,operationalInventory:1,blocks:[{...input.blocks[0],quantity:2}],reservations:departed.slice(0,2).map(r=>({...r,roomId:'one-room'}))};
  expect(evaluateGroupInventory(small)).toMatchObject({code:'GROUP_BLOCK_SHORTAGE',unassignedConfirmedGroupUnits:1});
 });
 it('does not call a room released if another active assignment of that group is using it',()=>{
  const reused={...input,operationalInventory:2,blocks:[{...input.blocks[0],quantity:2}],reservations:[departed[0],{...current[0],roomId:departed[0].roomId}]};
  expect(evaluateGroupInventory(reused)).toMatchObject({unassignedConfirmedGroupUnits:1});
 });
 it('preserves a later separate block and caps credits by the matching original block',()=>{
  const old={...input.blocks[0],quantity:1};
  const later={...old,blockCheckInDate:day,blockCheckOutDate:to};
  const ended=departed.slice(0,2).map(r=>({...r,checkOutDate:day}));
  expect(evaluateGroupInventory({...input,operationalInventory:1,blocks:[later],reservations:ended})).toMatchObject({unassignedConfirmedGroupUnits:1});
  expect(evaluateGroupInventory({...input,operationalInventory:1,blocks:[old,later],reservations:ended})).toMatchObject({unassignedConfirmedGroupUnits:1});
 });
 it('does not use the excluded completed assignment to subsidize its own reactivation',()=>{
  const single={...input,operationalInventory:1,blocks:[{...input.blocks[0],quantity:1}],reservations:[departed[0]],excludeReservationId:departed[0].id};
  expect(evaluateGroupInventory(single)).toMatchObject({unassignedConfirmedGroupUnits:1});
 });
});
