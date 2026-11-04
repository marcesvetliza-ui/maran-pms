import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, getQueryFn, parseApiError, parseApiErrorPayload } from "./queryClient";
import { createPrefacturaSubmission } from "./prefactura-submission";
const html='<!DOCTYPE html><html><head><title>504: Gateway time-out</title></head><body>Cloudflare Ray ID: synthetic</body></html>';
afterEach(()=>{vi.unstubAllGlobals();sessionStorage.clear();});
describe("gateway errors preserve uncertain operations without showing HTML",()=>{
  it.each([502,503,504,524])("keeps HTTP %s and replaces an HTML response with a readable message",async status=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(html,{status,headers:{"content-type":"text/html"}})));
    let failure:unknown;
    try {await apiRequest("POST","/api/billing/invoices",{creditOperationId:"original"});} catch(error){failure=error;}
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(new RegExp(`^${status}:`));
    const message=parseApiError(failure);
    expect(message).toContain(`HTTP ${status}`);
    expect(message).toContain("No se pudo confirmar");
    expect(message).not.toMatch(/<!DOCTYPE|<html|Cloudflare Ray/);
  });
  it("also sanitizes query errors and older raw HTML error objects",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(html,{status:504})));
    await expect(getQueryFn({on401:"throw"})({queryKey:["/api/test"]} as any)).rejects.toThrow("HTTP 504");
    expect(parseApiError(new Error(`504: ${html}`))).toContain("no respondió a tiempo");
    expect(parseApiError(new Error(html))).not.toContain("<html");
    expect(parseApiError(new Error(`504: ${JSON.stringify({error:html})}`))).not.toContain("<html");
  });
  it("keeps structured validation payloads intact",async()=>{
    const payload={error:"Revisar disponibilidad",code:"GROUP_BLOCK_WARNING",canOverride:true,warning:{date:"2026-10-29"}};
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(payload),{status:409,headers:{"content-type":"application/json"}})));
    const error=await apiRequest("POST","/api/test",{}).catch(error=>error);
    expect(parseApiErrorPayload(error)).toEqual(payload);
  });
  it.each([502,503,504,524])("retains and replays the original intent after HTTP %s without paying before the invoice is confirmed",async status=>{
    const fetch=vi.fn(async(_url:any,_options?:RequestInit)=>new Response(html,{status,headers:{"content-type":"text/html"}}));
    vi.stubGlobal("fetch",fetch);
    const submission=createPrefacturaSubmission(sessionStorage);
    const original=submission.prepare("synthetic",{creditOperationId:crypto.randomUUID(),tipoComprobante:"FA"},[{amount:"260000.00",method:"efectivo"}]);
    await expect(submission.run("synthetic",async(url,body)=>(await apiRequest("POST",url,body)).json())).rejects.toThrow(`HTTP ${status}`);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/billing/invoices");
    const reopened=createPrefacturaSubmission(sessionStorage);
    expect(reopened.pending("synthetic")).toEqual(original);
    // A changed folio must not replace the uncertain invoice/payment intent.
    expect(reopened.prepare("synthetic",{creditOperationId:"different"},[{amount:"1.00",method:"transferencia"}])).toEqual(original);
    const replay=vi.fn(async(url:string,_body:Record<string,any>)=>url==="/api/billing/invoices"?{id:77,montoTotal:"260000.00"}:{id:"payment"});
    await expect(reopened.run("synthetic",replay)).resolves.toMatchObject({invoice:{id:77},paymentCount:1});
    expect(replay).toHaveBeenNthCalledWith(1,"/api/billing/invoices",original.invoiceRequest);
    expect(replay).toHaveBeenNthCalledWith(2,"/api/payments",expect.objectContaining({...original.payments[0],invoiceData:expect.objectContaining({id:77,total:"260000.00"})}));
    expect(reopened.pending("synthetic")?.invoice?.id).toBe(77);
  });
});
