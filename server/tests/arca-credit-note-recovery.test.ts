import { afterEach, describe, expect, it, vi } from "vitest";
import { feCompConsultar } from "../billing/wsfevClient";
import { consultationFixture, consultationEnvelope, authorizationFixture } from "./helpers/wsfeConsultationFixture";
import { parseAuthorizationResult } from "../billing/consultationResult";
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });
const request = {tipo:"FB",puntoVenta:99,numero:1,cuitEmisor:"20111111112",token:"synthetic",sign:"synthetic"};
const expected = {total:100,fecha:"20260801",docTipo:96,docNro:"30111222"};
const respond = (xml:string) => { global.fetch = vi.fn(async () => new Response(xml)) as any; };

describe("ARCA FECompConsultar — faithful ResultGet evidence", () => {
  it.each(["", "ar"])("emission parses its own structure with namespace prefix '%s'", prefix=>{
    expect(parseAuthorizationResult(authorizationFixture(99,1,prefix), request as any,6).cae).toBe("12345678901234");
  });
  it.each(["", "20260230", "invalid"])("emission refuses to invent expiry '%s'", expiry=>{
    expect(()=>parseAuthorizationResult(authorizationFixture(99,1,"",expiry),request as any,6)).toThrow();
  });
  it.each(["", "ar"])("R3: reads the standard ResultGet with namespace prefix '%s'", async prefix => {
    respond(consultationFixture({},[],prefix));
    await expect(feCompConsultar(request,"homologacion",expected)).resolves.toMatchObject({cae:"12345678901234"});
  });
  it("recovers a credit note by the exact type/PV/number", async () => {
    respond(consultationFixture({CbteTipo:"8",PtoVta:"1",CbteDesde:"15",CbteHasta:"15"},[], "ar"));
    const result = await feCompConsultar({...request,tipo:"NCB",puntoVenta:1,numero:15},"homologacion");
    expect(result?.caeFechaVto.toISOString()).toContain("2026-08-31");
    const [, options] = (global.fetch as any).mock.calls[0];
    for(const tag of ["<ar:CbteTipo>8</ar:CbteTipo>","<ar:PtoVta>1</ar:PtoVta>","<ar:CbteNro>15</ar:CbteNro>"])
      expect(options.body).toContain(tag);
  });
  it("returns null only for the explicit missing-voucher error", async () => {
    respond(consultationEnvelope("<Errors><Err><Code>602</Code><Msg>Comprobante inexistente</Msg></Err></Errors>"));
    await expect(feCompConsultar(request,"homologacion",expected)).resolves.toBeNull();
  });
  it.each(["999","10016"])("keeps an ambiguous/rejected response %s unknown", async code => {
    respond(consultationEnvelope(`<Errors><Err><Code>${code}</Code><Msg>Error</Msg></Err></Errors>`));
    await expect(feCompConsultar(request,"homologacion",expected)).rejects.toThrow(/estado verificable/);
  });
  it.each(["CodAutorizacion","FchVto","EmisionTipo","PtoVta","CbteTipo","CbteDesde","CbteHasta",
    "ImpTotal","CbteFch","DocTipo","DocNro","MonId","MonCotiz"])("R3: refuses missing evidence %s", async missing => {
    respond(consultationFixture({},[missing]));
    await expect(feCompConsultar(request,"homologacion",expected)).rejects.toThrow();
  });
  it.each([
    {FchVto:"20260230"},{FchVto:"invalid"},{CodAutorizacion:"123"},{EmisionTipo:"CAEA"},
    {PtoVta:"98"},{CbteTipo:"1"},{CbteDesde:"2"},{CbteHasta:"2"},
    {ImpTotal:"99.99"},{CbteFch:"20260802"},{DocTipo:"80"},{DocNro:"30111223"},
    {MonId:"DOL"},{MonCotiz:"2"},{Resultado:"R"},
  ])("R3: refuses discrepant/invalid ResultGet %j", async wrong => {
    respond(consultationFixture(wrong));
    await expect(feCompConsultar(request,"homologacion",expected)).rejects.toThrow();
  });
  it.each([
    consultationEnvelope("<Errors><Err><Code>602</Code></Err><Err><Code>999</Code></Err></Errors>"),
    consultationEnvelope("<Events><Evt><Code>602</Code></Evt></Events>"),
    consultationFixture().replace("</FECompConsultarResult>","<Errors><Err><Code>602</Code></Err></Errors></FECompConsultarResult>"),
    consultationFixture().replace("</ResultGet>", "</ResultGet><ResultGet><CodAutorizacion>12345678901234</CodAutorizacion></ResultGet>"),
    consultationFixture().replace("http://ar.gov.afip.dif.FEV1/","urn:wrong"),
    "<Envelope><CAE>12345678901234</CAE><CAEFchVto>20260831</CAEFchVto></Envelope>",
    consultationFixture().replace("</DocNro>","</DocTipo>"),
  ])("R3: treats contradictory, malformed or unrelated XML as unknown", async xml => {
    respond(xml);
    await expect(feCompConsultar(request,"homologacion",expected)).rejects.toThrow();
  });
});

it("retains ARCA rejection observations without treating them as an authorization",()=>{
 const rejected=authorizationFixture(99,1).replaceAll("<Resultado>A</Resultado>","<Resultado>R</Resultado>").replace("</FECAEDetResponse>","<Observaciones><Obs><Code>10197</Code><Msg>Falta comprobante asociado</Msg></Obs></Observaciones></FECAEDetResponse>");
 expect(()=>parseAuthorizationResult(rejected,request as any,6)).toThrow('10197: Falta comprobante asociado');
});
