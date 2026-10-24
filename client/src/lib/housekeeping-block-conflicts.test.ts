import {afterEach,describe,it,expect,vi} from "vitest";
import {loadHousekeepingBlockConflicts} from "./housekeeping-block-conflicts";
afterEach(()=>vi.unstubAllGlobals());
describe("Housekeeping block availability check",()=>{
 it("keeps the reservation conflicts for explicit confirmation",async()=>{
  const conflicts=[{id:"reservation",guestName:"Ejemplo",checkInDate:"2095-02-02",checkOutDate:"2095-02-03",status:"confirmed"}];
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(conflicts)));
  vi.stubGlobal("fetch",fetcher);
  expect(await loadHousekeepingBlockConflicts("room with space","2095-02-02","2095-02-03")).toEqual(conflicts);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("roomId=room%20with%20space"),{credentials:"include"});
 });
 it("accepts a verified empty result",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("[]")));
  expect(await loadHousekeepingBlockConflicts("room","2095-02-02","2095-02-03")).toEqual([]);
 });
 it.each([new Response("[]",{status:500}),new Response('{}'),new Response('[{"id":"missing-fields"}]')])("rejects failed or incomplete responses instead of treating them as no conflicts",async response=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));
  await expect(loadHousekeepingBlockConflicts("room","2095-02-02","2095-02-03")).rejects.toThrow();
 });
});
