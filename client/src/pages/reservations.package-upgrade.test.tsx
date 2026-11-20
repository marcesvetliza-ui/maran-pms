import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReservationFormDialog } from './reservations';

vi.mock('@/App', () => ({ useAuth: () => ({ user: { id: 'test', role: 'admin' }, hasPermission: () => true, permissionsReady: true }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), toasts: [] }) }));
const types = [{ id: 'executive', name: 'Ejecutiva' }, { id: 'premium', name: 'Premium' }, { id: 'suite', name: 'Suite' }];
const rooms = types.map((t, i) => ({ id: `room-${t.id}`, roomNumber: String(201 + i), roomTypeId: t.id, roomType: t, isActive: true, status: 'available' }));
const gourmet = { id: 'gourmet', name: 'Escapada Gourmet', status: 'active', nights: 1, basePrice: '265000.00',
  roomPrices: [{ roomTypeId: 'executive', price: '265000.00' }, { roomTypeId: 'premium', price: '304000.00' }, { roomTypeId: 'suite', price: '340000.00' }] };
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } } });
  vi.stubGlobal('fetch', vi.fn(async (url: any) => new Response(JSON.stringify(String(url) === '/api/packages/active' ? [gourmet]
    : String(url) === '/api/reservation-edit-permission' ? { canEdit: true } : []), { status: 200, headers: { 'content-type': 'application/json' } })));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
function mount(reservation?: any) {
  render(<QueryClientProvider client={client}><ReservationFormDialog open reservation={reservation} onOpenChange={vi.fn()} onSuccess={vi.fn()}
    guests={[]} rooms={rooms as any} roomTypes={types as any} defaultValues={{ roomTypeId: 'premium', roomId: 'room-premium', checkInDate: '2026-12-01', checkOutDate: '2026-12-02' }} /></QueryClientProvider>);
  return userEvent.setup();
}
async function choose(user: ReturnType<typeof userEvent.setup>, testId: string, option: RegExp) {
  await user.click(screen.getByTestId(testId));
  await user.click(await screen.findByRole('option', { name: option }));
}
it('reprices a selected package by the charged category while keeping the upgraded physical room', async () => {
  const user = mount();
  await choose(user, 'select-package', /Escapada Gourmet/);
  expect(screen.getByTestId('input-base-rate')).toHaveValue(304000);
  await user.click(screen.getByTestId('button-toggle-upgrade'));
  await choose(user, 'select-room-type', /^Ejecutiva$/);
  expect(screen.getByTestId('input-base-rate')).toHaveValue(265000);
  await choose(user, 'select-room', /Hab\. 203 — Suite/);
  expect(screen.getByTestId('input-base-rate')).toHaveValue(265000);
  expect(screen.getByTestId('select-room')).toHaveTextContent('203');
  expect(screen.getByTestId('select-package')).toHaveTextContent('Escapada Gourmet');
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
it('uses the original charged category when selecting a package on an existing upgrade', async () => {
  const user = mount({ id: 'existing', guestId: 'guest', guest: { id: 'guest', firstName: 'Prueba', lastName: 'Paquete' }, roomId: 'room-suite', roomTypeId: 'suite', room: rooms[2],
    checkInDate: '2026-12-01', checkOutDate: '2026-12-02', nights: 1, status: 'confirmed',
    isUpgrade: true, originalRoomTypeId: 'executive', baseRatePerNight: '265000.00', finalRatePerNight: '265000.00', totalRoomAmount: '265000.00' });
  await waitFor(() => expect(screen.getByTestId('select-package')).toBeEnabled());
  await choose(user, 'select-package', /Escapada Gourmet/);
  expect(screen.getByTestId('input-base-rate')).toHaveValue(265000);
  expect(screen.getByTestId('select-room')).toHaveTextContent('203');
  const form = (screen.getByRole('button', { name: 'Guardar Cambios' }) as HTMLButtonElement).form;
  fireEvent.submit(form!);
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
  const [, request] = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')!;
  expect(JSON.parse(String(request?.body))).toMatchObject({
    roomId: 'room-suite', roomTypeId: 'suite', isUpgrade: true,
    originalRoomTypeId: 'executive', totalRoomAmount: '265000.00',
  });
});
it('preserves the agreed rate when changing the upgrade reference without an active package', async () => {
  const user = mount({ id: 'ordinary', guestId: 'guest', roomId: 'room-premium', roomTypeId: 'premium', room: rooms[1],
    checkInDate: '2026-12-01', checkOutDate: '2026-12-02', nights: 1, status: 'confirmed',
    baseRatePerNight: '123000.00', finalRatePerNight: '123000.00', totalRoomAmount: '123000.00' });
  await user.click(screen.getByTestId('button-toggle-upgrade'));
  await choose(user, 'select-room-type', /^Ejecutiva$/);
  expect(screen.getByTestId('input-base-rate')).toHaveValue(123000);
});
it('keeps the executive package price when the premium upgrade is chosen before the package or a new arrival date', async () => {
  const user = mount();
  await choose(user, 'select-room-type', /^Ejecutiva$/);
  await user.click(screen.getByTestId('button-toggle-upgrade'));
  await choose(user, 'select-room', /Hab\. 202 — Premium/);
  await choose(user, 'select-package', /Escapada Gourmet/);
  expect(screen.getByTestId('input-base-rate')).toHaveValue(265000);
  const arrival = screen.getByTestId('input-check-in');
  await user.clear(arrival);await user.type(arrival, '2026-12-04');
  expect(screen.getByTestId('input-base-rate')).toHaveValue(265000);
  expect(screen.getByTestId('select-room')).toHaveTextContent('202');
});
