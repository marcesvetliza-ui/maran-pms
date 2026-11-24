import {describe,expect,it,vi} from 'vitest';
import {probeHomologation} from '../billing/homologationProbe';
import {lastAuthorizedFixture} from './helpers/wsfeLastAuthorizedFixture';
const config={arcaAmbiente:'homologacion',arcaCert:'private-cert',arcaKey:'private-key',arcaCuit:'30717698130',puntoVentaHomolog:5};
const authorized={cae:'71234567890123',caeFechaVto:new Date('2026-11-23T15:00:00Z')};
function fixture(){
  const auth=vi.fn().mockResolvedValue({token:'private-token',sign:'private-sign'});
  const fetch=vi.fn().mockImplementation(async()=>new Response(lastAuthorizedFixture(492,5,6)));
  const consult=vi.fn().mockImplementation(async(request:any)=>request.numero===492?authorized:null);
  return {auth,remote:{fetch,consult}};
}
describe('Read-only homologation probe',()=>{
  it.each(['produccion','ficticio',null])('rejects %s before using credentials or calling ARCA',async environment=>{
    const f=fixture();await expect(probeHomologation({...config,arcaAmbiente:environment},f.auth,f.remote)).rejects.toMatchObject({code:'HOMOLOGATION_REQUIRED'});
    expect(f.auth).not.toHaveBeenCalled();expect(f.remote.fetch).not.toHaveBeenCalled();expect(f.remote.consult).not.toHaveBeenCalled();
  });
  it.each([{puntoVentaHomolog:0},{puntoVentaHomolog:null},{arcaCert:null},{arcaCuit:'bad'}])('rejects incomplete homologation configuration (%j)',async patch=>{
    const f=fixture();await expect(probeHomologation({...config,...patch},f.auth,f.remote)).rejects.toMatchObject({code:'HOMOLOGATION_CONFIG_INVALID'});
    expect(f.auth).not.toHaveBeenCalled();
  });
  it('uses the homologation point and returns only safe evidence',async()=>{
    const f=fixture();const result=await probeHomologation({...config,puntoVenta:21} as any,f.auth,f.remote);
    expect(result).toMatchObject({ok:true,ambiente:'homologacion',pointOfSale:5,checks:{authorizedLookup:'ok',missingLookup:'ok'}});
    expect(f.auth).toHaveBeenCalledWith('private-cert','private-key','homologacion');
    const [url,request]=f.remote.fetch.mock.calls[0];
    expect(url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');
    expect(request.body).toContain('<ar:PtoVta>5</ar:PtoVta>');expect(request.body).not.toContain('FECAESolicitar');
    expect(f.remote.consult).toHaveBeenNthCalledWith(1,expect.objectContaining({numero:492,puntoVenta:5}),'homologacion');
    expect(f.remote.consult).toHaveBeenNthCalledWith(2,expect.objectContaining({numero:493,puntoVenta:5}),'homologacion');
    for(const secret of ['private-cert','private-key','private-token','private-sign',authorized.cae])expect(JSON.stringify(result)).not.toContain(secret);
  });
  it('does not interpret a failed query as a missing voucher and sanitizes its error',async()=>{
    const f=fixture();f.remote.consult.mockRejectedValue(new Error('secret raw XML private-token'));
    await expect(probeHomologation(config,f.auth,f.remote)).rejects.toMatchObject({code:'HOMOLOGATION_LOOKUP_FAILED'});
    await expect(probeHomologation(config,f.auth,f.remote)).rejects.not.toThrow('private-token');
  });
  it('rejects a last-number response for another point of sale',async()=>{
    const f=fixture();f.remote.fetch.mockResolvedValue(new Response(lastAuthorizedFixture(492,21,6)));
    await expect(probeHomologation(config,f.auth,f.remote)).rejects.toMatchObject({code:'HOMOLOGATION_LOOKUP_FAILED'});
    expect(f.remote.consult).not.toHaveBeenCalled();
  });
  it('rejects a contradictory existing-voucher lookup',async()=>{
    const f=fixture();f.remote.consult.mockResolvedValue(null);
    await expect(probeHomologation(config,f.auth,f.remote)).rejects.toMatchObject({code:'HOMOLOGATION_INCONSISTENT_RESULT'});
  });
  it('rechecks a series that changes while the probe runs',async()=>{
    const f=fixture();f.remote.consult.mockResolvedValueOnce(authorized).mockResolvedValueOnce(authorized).mockResolvedValueOnce(authorized).mockResolvedValueOnce(null);
    f.remote.fetch.mockResolvedValueOnce(new Response(lastAuthorizedFixture(492,5,6))).mockResolvedValueOnce(new Response(lastAuthorizedFixture(493,5,6)));
    expect((await probeHomologation(config,f.auth,f.remote)).ok).toBe(true);expect(f.remote.fetch).toHaveBeenCalledTimes(2);
  });
  it('does not approve a series with no authorized history',async()=>{
    const f=fixture();f.remote.fetch.mockResolvedValue(new Response(lastAuthorizedFixture(0,5,6)));
    await expect(probeHomologation(config,f.auth,f.remote)).rejects.toMatchObject({code:'HOMOLOGATION_NO_HISTORY'});
  });
});
