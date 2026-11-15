import {beforeEach,describe,it,expect,vi} from 'vitest';
const {execute}=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../db',()=>({db:{execute},pool:{}}));
vi.mock('../billing/invoiceAdvisoryLock',()=>({withInvoiceAdvisoryLock:vi.fn()}));
import {guardPricingUpdate,withNightlyWriter,withStayExtensionWriter} from '../nightlyPricingGuard';

const old={id:'extension-synthetic',status:'checked_in',pricingScheme:'nightly_v1',pricingRevision:0,checkInDate:'2090-01-01',checkOutDate:'2090-01-02',nights:1,totalRoomAmount:'100.00',baseRatePerNight:'100.00',finalRatePerNight:'100.00',discountType:'none',discountValue:'0',nightlyPricing:[{date:'2090-01-01',rateCents:10000,discountCents:0}]};
const patch=()=>({checkInDate:old.checkInDate,checkOutDate:'2090-01-03',nights:2,totalRoomAmount:'200.00',baseRatePerNight:'100.00',finalRatePerNight:'100.00',discountType:'none',discountValue:'0',pricingRevision:1,nightlyPricing:[...old.nightlyPricing,{date:'2090-01-02',rateCents:10000,discountCents:0}]});
function invoice(extra:Record<string,unknown>={},group=false){execute.mockResolvedValueOnce({rows:[{estado:'emitida',source_charge_amounts:{accommodation:100},monto_acreditado:0,...extra}]}).mockResolvedValueOnce({rows:group?[{id:'group-invoice'}]:[]});}
beforeEach(()=>execute.mockReset());
describe('protección fiscal de la extensión',()=>{
  it('permite agregar noches por el escritor específico de extensión',async()=>{invoice();await expect(withStayExtensionWriter(0,()=>guardPricingUpdate(old,patch()))).resolves.toBeUndefined();});
  it('mantiene el bloqueo para el escritor general y el PATCH genérico',async()=>{
    invoice();await expect(withNightlyWriter(0,()=>guardPricingUpdate(old,patch()))).rejects.toMatchObject({statusCode:409});
    await expect(guardPricingUpdate(old,patch())).rejects.toMatchObject({statusCode:409});
  });
  it.each(['rate','discount','arrival','shorter','extra','total','revision'] as const)('no acepta modificar %s aprovechando la extensión',async kind=>{
    invoice();const next:any=patch();next.nightlyPricing=next.nightlyPricing.map((n:any)=>({...n}));
    if(kind==='rate')next.nightlyPricing[0].rateCents++;
    if(kind==='discount')next.nightlyPricing[0].discountCents++;
    if(kind==='arrival')next.checkInDate='2089-12-31';
    if(kind==='shorter'){next.checkOutDate=old.checkOutDate;next.nightlyPricing.pop();}
    if(kind==='extra')next.lateCheckOutCharge='50.00';
    if(kind==='total')next.totalRoomAmount='300.00';
    if(kind==='revision')next.pricingRevision=99;
    await expect(withStayExtensionWriter(0,()=>guardPricingUpdate(old,next))).rejects.toMatchObject({statusCode:409});
  });
  it.each(['pending','unmapped','credited','overcovered','group'] as const)('conserva el bloqueo fiscal %s',async kind=>{
    invoice(kind==='pending'?{estado:'autorizacion_pendiente'}:kind==='unmapped'?{source_charge_amounts:null}:kind==='credited'?{monto_acreditado:10}:kind==='overcovered'?{source_charge_amounts:{accommodation:200}}:{},kind==='group');
    await expect(withStayExtensionWriter(0,()=>guardPricingUpdate(old,patch()))).rejects.toMatchObject({statusCode:409});
  });
  it('no permite extender una reserva cerrada ni sobrescribir otra revisión',async()=>{
    await expect(withStayExtensionWriter(0,()=>guardPricingUpdate({...old,status:'checked_out'},patch()))).rejects.toMatchObject({statusCode:409});
    await expect(withStayExtensionWriter(0,()=>guardPricingUpdate({...old,pricingRevision:1},patch()))).rejects.toMatchObject({statusCode:409});expect(execute).not.toHaveBeenCalled();
  });
});
