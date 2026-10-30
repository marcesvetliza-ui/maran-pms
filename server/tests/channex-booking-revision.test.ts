import { describe, expect, it, vi } from "vitest";
import { parseBookingRevision, redactBooking, revisionHash } from "../channex/bookingRevision";
import { runInboundOnce, startInboundWorker } from "../channex/inboundWorker";
const revision = () => ({ id:"r1", attributes:{ booking_id:"b1",property_id:"p1",inserted_at:"2026-10-29T23:00:00Z",status:"new",
 arrival_date:"2026-11-01",departure_date:"2026-11-03",currency:"ARS",amount:"250.00",customer:{name:"Prueba",surname:"Canal"},
 rooms:[{id:"room1",room_type_id:"type1",rate_plan_id:"plan1",occupancy:{adults:2},days:{"2026-11-01":"100.00","2026-11-02":"150.00"}}] }});
describe("Channex revision contract boundary",()=>{
 it("preserves exact nightly prices and stable room identities",()=>{
  const b=parseBookingRevision(revision(),"p1");expect(b.rooms[0]).toMatchObject({key:"room1",totalCents:25000,occupancy:2,nights:[{date:"2026-11-01",rateCents:10000},{date:"2026-11-02",rateCents:15000}]});
 });
 it("accepts a cancellation without requiring stale guest or rate details",()=>{
  expect(parseBookingRevision({id:"r2",attributes:{booking_id:"b1",property_id:"p1",inserted_at:"2026-10-30T00:00:00Z",status:"cancelled"}},"p1").status).toBe("cancelled");
 });
 it.each(["2026-10-30T21:04:48.787899", "2026-10-30T21:04:48"])("accepts Channex UTC timestamp %s without changing money",stamp=>{
  const r:any=revision();r.attributes.inserted_at=stamp;
  r.attributes.rooms[0].booking_room_id="stable-room";delete r.attributes.rooms[0].id;
  const parsed=parseBookingRevision(r,"p1");
  expect(parsed.insertedAt).toBe(`${stamp}Z`);
  expect(parsed.rooms[0]).toMatchObject({key:"stable-room",totalCents:25000});
 });
 it("keeps booking_room_id stable when room order changes",()=>{
  const r:any=revision();r.attributes.amount="500.00";
  r.attributes.rooms=[{...r.attributes.rooms[0],id:undefined,booking_room_id:"a"},{...r.attributes.rooms[0],id:undefined,booking_room_id:"b"}];
  expect(parseBookingRevision(r,"p1").rooms.map(r=>r.key)).toEqual(["a","b"]);
  r.attributes.rooms.reverse();expect(parseBookingRevision(r,"p1").rooms.map(r=>r.key)).toEqual(["b","a"]);
 });
 it.each(["wrong-property","unknown-status","missing-day","total-mismatch","ambiguous-multiroom","invalid-timestamp"])("fails closed on %s",problem=>{
  const r:any=revision();
  if(problem==="wrong-property")r.attributes.property_id="other";
  if(problem==="unknown-status")r.attributes.status="approved";
  if(problem==="missing-day")delete r.attributes.rooms[0].days["2026-11-02"];
  if(problem==="total-mismatch")r.attributes.amount="251";
  if(problem==="ambiguous-multiroom"){delete r.attributes.rooms[0].id;r.attributes.rooms.push({...r.attributes.rooms[0]});r.attributes.amount="500";}
  if(problem==="invalid-timestamp")r.attributes.inserted_at="2026-10-29T25:00:00";
  expect(()=>parseBookingRevision(r,"p1")).toThrow();
 });
 it("redacts nested card, guarantee, notes and credential fields",()=>{
  const safe=redactBooking({customer:{name:"Prueba",card_number:"secret",guarantee:{cvv:"123"}},notes:"sensitive",password:"secret"});
  expect(JSON.stringify(safe)).not.toContain("secret");expect(safe.customer.name).toBe("Prueba");
  expect(revisionHash({b:2,a:1})).toBe(revisionHash({a:1,b:2}));
 });
 it("does not query a database or network with the staging flag disabled",async()=>{
  vi.stubEnv("CHANNEX_INBOUND_STAGING_ENABLED","");const connect=vi.fn();
  expect(await runInboundOnce({connect} as any)).toBe("disabled");startInboundWorker({connect} as any)();expect(connect).not.toHaveBeenCalled();vi.unstubAllEnvs();
 });
});
