import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { RatePlanFormDialog } from './rate-plans';
import { apiRequest } from '@/lib/queryClient';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: vi.fn() }));
beforeEach(() => vi.mocked(apiRequest).mockReset().mockResolvedValue(new Response('{}')));
function open() {
  const plan = {id:'rack-exec',name:'RACK',roomTypeId:'exec',baseRate:'173000.00',rate1pax:'173000.00',rate2pax:'195000.00',currency:'ARS',validFrom:'2026-11-01',validTo:'2027-02-01',refundable:'true'};
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>
    <RatePlanFormDialog ratePlan={plan as any} roomTypes={[{id:'exec',name:'Ejecutiva',maxOccupancy:2} as any]} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />
  </QueryClientProvider>);
  return plan;
}
it('removes the expiration explicitly and saves null while preserving start date and occupancy prices', async () => {
  const plan = open();
  fireEvent.click(screen.getByRole('button', {name:'Sin vencimiento'}));
  expect(screen.getByTestId('input-valid-to')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', {name:'Guardar Cambios'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH','/api/rate-plans/rack-exec',expect.objectContaining({validTo:null,validFrom:plan.validFrom,baseRate:plan.baseRate,rate1pax:plan.rate1pax,rate2pax:plan.rate2pax})));
});
it('keeps dates unchanged when saving without clearing them', async () => {
  const plan = open();
  fireEvent.click(screen.getByRole('button', {name:'Guardar Cambios'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH','/api/rate-plans/rack-exec',expect.objectContaining({validTo:plan.validTo,validFrom:plan.validFrom})));
});
it('also persists null when an optional date is cleared using the date input', async () => {
  open();
  fireEvent.change(screen.getByTestId('input-valid-to'),{target:{value:''}});
  fireEvent.click(screen.getByRole('button', {name:'Quitar fecha de inicio'}));
  fireEvent.click(screen.getByRole('button', {name:'Guardar Cambios'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH','/api/rate-plans/rack-exec',expect.objectContaining({validTo:null,validFrom:null})));
});
