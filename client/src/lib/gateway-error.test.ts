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
  it("retains the original invoice and payment intent and does not submit payment after a 504",async()=>{
    const fetch=vi.fn(async()=>new Response(html,{status:504,headers:{"content-type":"text/html"}}));
    vi.stubGlobal("fetch",fetch);
    const submission=createPrefacturaSubmission(sessionStorage);
    const original=submission.prepare("synthetic",{creditOperationId:crypto.randomUUID(),tipoComprobante:"FA"},[{amount:"260000.00",method:"efectivo"}]);
    let failure:Error;
    try{await submission.run("synthetic",async(url,body)=>(await apiRequest("POST",url,body)).json());}catch(error){failure=error as Error;}
    expect(fetch).toHaveBeenCalledTimes(1);
    const reopened=createPrefacturaSubmission(sessionStorage);
    expect(await reopened.discardRejectedInvoice("synthetic",failure!,async()=>false)).toBe(false);
    expect(reopened.pending("synthetic")).toEqual(original);
  });
});
