import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn(),toasts:[],dismiss:vi.fn()})}));
vi.mock('@/components/PrefacturaDialog',()=>({PrefacturaDialog:({open,onClose}:any)=>open?<button onClick={onClose}>Cerrar prefactura de prueba</button>:null}));
import CheckOutPage from './check-out';
let rows:any[];
const base={id:'502',status:'checked_in',checkInDate:'2026-10-31',checkOutDate:'2026-11-02',numberOfGuests:1,totalRoomAmount:'332000',guest:{firstName:'Prueba',lastName:'Huésped'},room:{roomNumber:'502',roomType:{name:'Ejecutiva'}}};
beforeEach(()=>{
 queryClient.clear();rows=[{...base,folioBalance:360500}];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/api/dashboard/departures')?rows:[]),{status:200,headers:{'content-type':'application/json'}})));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
function mount(){render(<QueryClientProvider client={queryClient}><CheckOutPage/></QueryClientProvider>);}
it('shows the full operational folio balance on the card, not accommodation only, without a folio request per card',async()=>{
 mount();expect(await screen.findByTestId('checkout-balance-502')).toHaveTextContent('$360.500,00');
 expect(within(screen.getByTestId('checkout-card-502')).getByText('Saldo cuenta')).toBeInTheDocument();
 expect(screen.queryByText('$332.000,00')).not.toBeInTheDocument();
 expect(vi.mocked(fetch).mock.calls.every(([url])=>!String(url).endsWith('/folio'))).toBe(true);
});
it('preserves zero balances after payments even when the accommodation amount is positive',async()=>{
 rows=[{...base,folioBalance:0}];mount();expect(await screen.findByTestId('checkout-balance-502')).toHaveTextContent('$0,00');
 expect(screen.queryByText('$332.000,00')).not.toBeInTheDocument();
});
it('does not replace an unavailable balance with an accommodation-only or zero debt',async()=>{
 rows=[{...base,folioBalance:null}];mount();expect(await screen.findByTestId('checkout-balance-502')).toHaveTextContent('Consultar folio');
});
it('identifies personal extras for a group without presenting them as the master folio debt',async()=>{
 rows=[{...base,groupId:'group',groupCode:'GR-1',totalRoomAmount:'0',folioBalance:1500}];mount();
 expect(await screen.findByTestId('checkout-balance-502')).toHaveTextContent('$1.500,00');
 expect(within(screen.getByTestId('checkout-card-502')).getByText('Saldo personal')).toBeInTheDocument();
});
it('refreshes the card after closing prefactura even if checkout was not completed',async()=>{
 mount();await screen.findByTestId('checkout-balance-502');fireEvent.click(screen.getByTestId('button-checkout-502'));
 await screen.findByRole('button',{name:'Cerrar prefactura de prueba'});
 rows=[{...base,folioBalance:260500}];fireEvent.click(screen.getByRole('button',{name:'Cerrar prefactura de prueba'}));
 await waitFor(()=>expect(screen.getByTestId('checkout-balance-502')).toHaveTextContent('$260.500,00'));
});
