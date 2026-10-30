import { afterEach, expect, it, vi } from "vitest";
import { acknowledgeBookingRevision, ChannexApiError, fetchChannexBookingRevision } from "../channex/client";
afterEach(()=>vi.unstubAllGlobals());
it("uses revision resources and prevents credential-bearing redirects",async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({data:{id:"rev"}}),{status:200}));vi.stubGlobal("fetch",fetch);
 const connection={baseUrl:"https://staging.channex.io/api/v1",apiKey:"synthetic-test-key"};
 expect(await fetchChannexBookingRevision(connection,"revision/1")).toEqual({id:"rev"});await acknowledgeBookingRevision(connection,"revision/1");
 expect(fetch.mock.calls[0][0]).toBe("https://staging.channex.io/api/v1/booking_revisions/revision%2F1");
 expect(fetch.mock.calls[1][0]).toBe("https://staging.channex.io/api/v1/booking_revisions/revision%2F1/ack");
 expect(fetch.mock.calls[0][1]).toMatchObject({redirect:"error"});
});
it("retains Retry-After even when a rate-limit response is not JSON",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response("rate limited",{status:429,headers:{"Retry-After":"120"}})));
 await expect(fetchChannexBookingRevision({baseUrl:"https://staging.channex.io/api/v1",apiKey:"fake"},"rev"))
  .rejects.toMatchObject({status:429,retryAfter:"120"});
});
