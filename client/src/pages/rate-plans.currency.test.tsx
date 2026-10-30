import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ pilot: true, request: vi.fn() }));
vi.mock('@/App', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/use-pilot-environment', () => ({ usePilotEnvironment: () => state.pilot }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', async importOriginal => ({ ...await importOriginal<any>(), apiRequest: state.request }));
import { RatePlanFormDialog } from './rate-plans';
const type = { id: 'premium', name: 'Premium', maxOccupancy: 2 } as any;
let client: QueryClient;
beforeEach(() => { state.pilot = true; state.request.mockReset().mockResolvedValue(new Response('{}')); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); });
function show(plan?: any) { render(<QueryClientProvider client={client}><RatePlanFormDialog ratePlan={plan} roomTypes={[type]} open onOpenChange={vi.fn()} onSuccess={vi.fn()} /></QueryClientProvider>); }
it('creates a USD plan from the ordinary pilot form, keeping the entered amount', async () => {
  show();
  fireEvent.change(screen.getByLabelText('Nombre del Plan'), { target: { value: 'Certificación Twin BAR' } });
  fireEvent.change(screen.getByTestId('input-base-rate'), { target: { value: '100' } });
  fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Moneda' }), { button: 0 });
  fireEvent.click(await screen.findByRole('option', { name: 'USD — Dólar estadounidense' }));
  fireEvent.pointerDown(screen.getByTestId('select-room-type'), { button: 0 });
  fireEvent.click(await screen.findByRole('option', { name: 'Premium' }));
  fireEvent.click(screen.getByRole('button', { name: 'Crear Plan' }));
  await waitFor(() => expect(state.request).toHaveBeenCalledWith('POST', '/api/rate-plans', expect.objectContaining({ currency: 'USD', baseRate: '100', roomTypeId: 'premium' })));
});
it('keeps ARS as the creation default and offers no USD selector outside pilot', () => {
  state.pilot = false; show();
  expect(screen.queryByRole('combobox', { name: 'Moneda' })).toBeNull();
  expect(screen.getByText('ARS')).toBeTruthy();
});
it('displays an existing USD plan accurately without allowing currency reinterpretation', async () => {
  show({ id: 'usd-existing', name: 'USD BAR', roomTypeId: 'premium', baseRate: '100', currency: 'USD' });
  expect(screen.queryByRole('combobox', { name: 'Moneda' })).toBeNull();
  expect(screen.getByText('USD')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
  await waitFor(() => expect(state.request).toHaveBeenCalledWith('PATCH', '/api/rate-plans/usd-existing', expect.objectContaining({ currency: 'USD', baseRate: '100' })));
});
