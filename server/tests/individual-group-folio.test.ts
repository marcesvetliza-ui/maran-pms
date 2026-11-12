import {describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),ledger:vi.fn(),account:vi.fn()}));
vi.mock('../db',()=>({db:{execute:mocks.execute}}));
vi.mock('../db-storage',()=>({storage:{getGroupReservationLedger:mocks.ledger}}));
vi.mock('../billing/groupAccount',()=>({groupAccountSnapshot:mocks.account}));
import {validateIndividualGroupPlan,assertIndividualGroupBalance,assertIndividualGroupInvoice} from '../billing/individualGroupFolio';
import {reservationGroupSources} from '@shared/reservationGroupSources';
const payment=()=>({reservationId:'r',amount:'121.00',method:'transferencia',date:'2026-11-11',paymentRequestId:'9aee7ec1-709e-4a7e-bf0a-520562a86db8'});
describe('individual group folio contracts',()=>{
 it('keeps the original transfer plan unchanged',()=>{const p=payment();expect(validateIndividualGroupPlan('r',{version:2,payments:[p]},121)).toEqual([p]);expect(p.method).toBe('transferencia');});
 it.each([{reservationId:'other'},{amount:'120.99'},{method:'cuenta_corriente'},{paymentRequestId:'new-id'},{date:''},{amount:'NaN'}])('rejects an unverifiable payment before issuing %o',change=>{expect(()=>validateIndividualGroupPlan('r',{version:2,payments:[{...payment(),...change}]},121)).toThrow();});
 it('rejects reused payment identities',()=>{expect(()=>validateIndividualGroupPlan('r',{version:2,payments:[payment(),payment()]},242)).toThrow();});
 it('aggregates nightly and unit coverage into exact group source cents',()=>{expect(reservationGroupSources('r',{'accommodation:2026-11-10':60.5,'accommodation:2026-11-11':60.5,'charge-unit:c:1':1.01,'charge-unit:c:2':1})).toEqual({'reservation:r:accommodation':121,'reservation:r:charge:c':2.01});});
 it('blocks master money without guessing an assignment to the room',async()=>{mocks.account.mockResolvedValueOnce({groupId:'g',status:'confirmed',unassigned:121,reviewReceipts:[],balance:121});await expect(assertIndividualGroupBalance('g','r',121)).rejects.toThrow(/anticipos grupales/);});
 it('allows settlement when every master receipt already has a verified destination, including after departure',async()=>{mocks.account.mockResolvedValueOnce({groupId:'g',status:'checked_out',unassigned:0,reviewReceipts:[],balance:121});await expect(assertIndividualGroupBalance('g','r',121)).resolves.toBeUndefined();});
 it('caps new money at the actual remaining room balance',async()=>{mocks.account.mockResolvedValueOnce({groupId:'g',status:'confirmed',unassigned:0,reviewReceipts:[],balance:100});await expect(assertIndividualGroupBalance('g','r',100.01)).rejects.toThrow(/saldo pendiente/);});

 it.each([null,{unproven:1}])('blocks ambiguous historical group source evidence before invoice emission: %o',async amounts=>{
  mocks.account.mockResolvedValueOnce({groupId:'g',status:'confirmed',unassigned:0,reviewReceipts:[],balance:121,fiscalRequiresReview:true});
  mocks.ledger.mockResolvedValueOnce([{reservationId:'r',accommodationTotal:121,extrasTotal:0,paymentsTotal:0}]);
  await expect(assertIndividualGroupInvoice('g','r',{accommodation:121},121)).rejects.toThrow(/facturación histórica/);
 });

});
