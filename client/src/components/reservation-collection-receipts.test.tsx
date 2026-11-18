import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ReservationCollectionReceipts} from './reservation-collection-receipts';
const setup=(data:unknown)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(data)));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 return render(<QueryClientProvider client={client}><ReservationCollectionReceipts reservationId="506"/></QueryClientProvider>);
};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Recibo completo desde el folio',()=>{
 it('ofrece el recibo de los $471.600 ya cobrados sin escribir ni cobrar de nuevo',async()=>{
  setup([{operationId:'op-506',total:471600,date:'2026-11-18',paymentIds:['p1','p2']}]);
  const link=await screen.findByRole('link',{name:/Recibo del cobro/});
  expect(link).toHaveTextContent('$471.600,00');expect(link).toHaveAttribute('href','/api/reservations/506/collection-receipts/op-506/pdf');
  expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method || init.method==='GET')).toBe(true);
 });
 it('no muestra recibos que todavía no tienen todos sus pagos guardados',()=>{
  setup([]);expect(screen.queryByRole('link')).not.toBeInTheDocument();
 });
});
