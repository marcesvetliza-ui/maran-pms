import { describe, expect, it } from "vitest";
import { FiscalNumberLookupError, readLastAuthorizedNumber } from "../billing/lastAuthorizedNumber";
import { lastAuthorizedFixture } from "./helpers/wsfeLastAuthorizedFixture";
const expected={pointOfSale:5,documentType:1};
const read=(body:string,status=200)=>readLastAuthorizedNumber(new Response(body,{status}),expected);
describe("ARCA last-authorized number",()=>{
  it.each([0,37,100000])("accepts an explicit valid last number, including a new series: %s",async number=>{
    expect(await read(lastAuthorizedFixture(number,5,1))).toBe(number);
  });
  it("accepts namespaced SOAP result elements",async()=>{
    const xml=lastAuthorizedFixture(37,5,1).replaceAll("<FECompUltimoAutorizadoResult>","<ar:FECompUltimoAutorizadoResult>").replaceAll("</FECompUltimoAutorizadoResult>","</ar:FECompUltimoAutorizadoResult>").replaceAll("<CbteNro>","<ar:CbteNro>").replaceAll("</CbteNro>","</ar:CbteNro>");
    expect(await read(xml)).toBe(37);
  });
  it.each([
    "", "<html>Servicio no disponible</html>",
    "<Envelope><FECompUltimoAutorizadoResult/></Envelope>",
    lastAuthorizedFixture(37,5,1).replace("<CbteNro>37</CbteNro>",""),
    lastAuthorizedFixture(37,5,1).replace("<CbteNro>37</CbteNro>","<CbteNro>0</CbteNro><CbteNro>37</CbteNro>"),
    lastAuthorizedFixture(37,5,1).replace("<CbteNro>37</CbteNro>","<CbteNro>-1</CbteNro>"),
    lastAuthorizedFixture(37,5,1).replace("<CbteNro>37</CbteNro>","<CbteNro>1.5</CbteNro>"),
    lastAuthorizedFixture(37,5,1).replace("<CbteNro>37</CbteNro>","<CbteNro> </CbteNro>"),
    lastAuthorizedFixture(37,5,1).replace("<CbteNro>37</CbteNro>","<CbteNro>9007199254740992</CbteNro>"),
    lastAuthorizedFixture(99999999,5,1),
    lastAuthorizedFixture(37,99,1),lastAuthorizedFixture(37,5,6),
    "<soap:Envelope><soap:Fault><faultstring>Authentication</faultstring></soap:Fault></soap:Envelope>",
    lastAuthorizedFixture(0,5,1).replace("</FECompUltimoAutorizadoResult>","<Errors><Err><Code>600</Code></Err></Errors></FECompUltimoAutorizadoResult>"),
  ])("never assumes zero for an erroneous or incomplete response (%#)",async xml=>{
    await expect(read(xml)).rejects.toBeInstanceOf(FiscalNumberLookupError);
    await expect(read(xml)).rejects.toMatchObject({statusCode:502,code:"FISCAL_NUMBER_LOOKUP_FAILED"});
  });
  it("does not accept a valid-looking number from an HTTP error",async()=>{
    await expect(read(lastAuthorizedFixture(0,5,1),503)).rejects.toMatchObject({statusCode:502});
  });
});
