import { expect,it } from 'vitest';
import { packageNightlyProposal,packageNotes } from '../reservationPackagePricing';
const nights=['2090-01-01','2090-01-02','2090-01-03'].map(date=>({date,rateCents:100,discountCents:20}));
const stay={roomTypeId:'premium',checkInDate:'2090-01-01'};
const pkg={id:'p',name:'Fin de semana',status:'active',nights:3,basePrice:'100.00',roomPrices:[{roomTypeId:'premium',price:'100.01'}]};
it('uses the stored category price once and distributes the exact package cents over the existing nights',()=>{
 const result=packageNightlyProposal(stay,pkg,nights);
 expect(result.packageTotalCents).toBe(10001);expect(result.after.map(n=>n.rateCents)).toEqual([3334,3334,3333]);expect(result.after.map(n=>n.date)).toEqual(nights.map(n=>n.date));expect(result.after.every(n=>n.discountCents===0)).toBe(true);
});
it.each([{status:'inactive'},{nights:2},{validFrom:'2090-02-01'},{validUntil:'2090-01-02'},{roomTypeId:'other',roomPrices:[]}])('rejects an inapplicable package: %o',patch=>{
 expect(()=>packageNightlyProposal(stay,{...pkg,...patch},nights)).toThrow();
});
it('requires review of an existing voucher instead of silently changing its accounting',()=>{
 expect(()=>packageNightlyProposal({...stay,voucherAppliedAmount:'10'},pkg,nights)).toThrow(/voucher/);
});
it('keeps other notes and replaces a prior package marker',()=>{
 expect(packageNotes('[Paquete: Anterior] Pedido de cama','Nuevo')).toBe('[Paquete: Nuevo] Pedido de cama');
});
it('prices an upgraded stay by the agreed category without changing its physical category or dates',()=>{
 const reservation={...stay,isUpgrade:true,originalRoomTypeId:'executive',roomTypeId:'suite'};
 const gourmet={...pkg,roomTypeId:'executive',roomPrices:[{roomTypeId:'executive',price:'265000.00'},{roomTypeId:'suite',price:'340000.00'}]};
 const result=packageNightlyProposal(reservation,gourmet,nights);
 expect(result.packageTotalCents).toBe(26500000);
 expect(result.after.reduce((sum,n)=>sum+n.rateCents,0)).toBe(26500000);
 expect(reservation.roomTypeId).toBe('suite');expect(result.after.map(n=>n.date)).toEqual(nights.map(n=>n.date));
});
it.each([{isUpgrade:false,originalRoomTypeId:'executive'},{isUpgrade:true,originalRoomTypeId:null}])('uses the assigned category when no original upgrade category applies: %o',upgrade=>{
 const result=packageNightlyProposal({...stay,...upgrade},pkg,nights);
 expect(result.packageTotalCents).toBe(10001);
});
