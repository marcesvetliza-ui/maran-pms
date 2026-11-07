import {it,expect,vi,afterEach} from 'vitest';
import {feCompConsultar} from '../billing/wsfevClient';
import {wsfeFaultReason} from '../billing/wsfeTransportError';
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});
const SOAP='http://schemas.xmlsoap.org/soap/envelope/';
const req={tipo:'NCB',puntoVenta:5,numero:3,cuitEmisor:'30123456789',token:'SENSITIVE_TOKEN_VALUE',sign:'SENSITIVE_SIGN_VALUE'};
const fault=(message:string)=>`<s:Envelope xmlns:s="${SOAP}"><s:Header>${'metadata '.repeat(100)}</s:Header><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring><![CDATA[${message}]]></faultstring></s:Fault></s:Body></s:Envelope>`;
it.each([200,500])('reports the actual SOAP fault on HTTP %s and never treats it as a missing voucher',async status=>{
 global.fetch=vi.fn(async()=>new Response(fault('No se puede interpretar el tipo asociado. SENSITIVE_TOKEN_VALUE SENSITIVE_SIGN_VALUE'),{status}));
 const error=await feCompConsultar(req,'homologacion').catch(error=>error);
 expect(error).toMatchObject({code:'WSFE_RESPONSE_UNVERIFIED'});expect(error.message).toContain('No se puede interpretar el tipo asociado');expect(error.message).not.toMatch(/SENSITIVE_|Envelope|metadata/);expect(global.fetch).toHaveBeenCalledTimes(1);
});
it('does not expose HTML or truncated raw bodies for an unverifiable HTTP failure',async()=>{
 global.fetch=vi.fn(async()=>new Response('<html>PRIVATE_ERROR_PAGE</html>',{status:500}));
 await expect(feCompConsultar(req,'homologacion')).rejects.toThrow(/sin detalle SOAP verificable/);
});
it('ignores unrelated fault strings and rejects DTDs and malformed XML',()=>{
 expect(wsfeFaultReason('<root><faultstring>Unrelated</faultstring></root>')).toBeUndefined();
 expect(wsfeFaultReason('<!DOCTYPE root [<!ENTITY x "secret">]>'+fault('&x;'))).toBeUndefined();
 expect(wsfeFaultReason(fault('error').slice(0,-10))).toBeUndefined();
});
