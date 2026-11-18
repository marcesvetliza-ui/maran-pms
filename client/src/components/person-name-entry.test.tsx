import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuestSelector } from './entity-selector';
import { GuestSearchCombobox } from './guest-search-combobox';
import { GuestFormDialog } from '@/pages/guests';
import { ReservationWaitlistDialog } from './ReservationWaitlistDialog';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/App', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<any>(), apiRequest: mocks.api }));
let clients: QueryClient[];
beforeEach(() => {
  clients = []; mocks.api.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); vi.unstubAllGlobals(); });
function wrap(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

it('alta desde una reserva: TAB pasa de apellido a nombre y conserva el destino de ambos valores', async () => {
  const user = userEvent.setup(), create = vi.fn();
  wrap(<GuestSelector onSelect={vi.fn()} onCreateNew={create} />);
  await user.click(screen.getByTestId('tab-create-guest'));
  const surname = await screen.findByTestId('input-guest-lastname');
  await waitFor(() => expect(surname).toHaveFocus());
  await user.type(surname, 'De la Cruz'); await user.tab();
  expect(screen.getByTestId('input-guest-firstname')).toHaveFocus();
  await user.keyboard('María José');
  await user.click(screen.getByTestId('button-create-guest'));
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ lastName: 'De la Cruz', firstName: 'María José' }));
  expect(mocks.api).not.toHaveBeenCalled();
});

it.each([false, true])('ficha de clientes: carga por apellido sin invertir identidad al guardar, edición=%s', async editing => {
  const user = userEvent.setup(), save = vi.fn(async data => ({ ...data, id: 'fixture-person' }));
  wrap(<GuestFormDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} saveGuest={save}
    guest={editing ? { id: 'fixture-person', firstName: 'Nicolás', lastName: 'Palermo', tipoPersona: 'fisica' } as any : undefined} />);
  const surname = screen.getByTestId('input-last-name'), first = screen.getByTestId('input-first-name');
  await waitFor(() => expect(surname).toHaveFocus());
  if (editing) { expect(surname).toHaveValue('Palermo'); expect(first).toHaveValue('Nicolás'); }
  await user.clear(surname); await user.type(surname, 'De la Cruz'); await user.tab();
  expect(first).toHaveFocus(); await user.clear(first); await user.type(first, 'María José');
  fireEvent.submit(screen.getByTestId('button-submit-guest').closest('form')!);
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ lastName: 'De la Cruz', firstName: 'María José' })));
});

it('alta rápida de cliente envía nombre y apellido con sus claves originales', async () => {
  const user = userEvent.setup();
  mocks.api.mockImplementation(async (_method, _path, data) => Response.json({ id: 'fixture-quick-person', ...data }));
  const selected = vi.fn();
  wrap(<GuestSearchCombobox onGuestSelect={selected} data-testid="fixture-search" />);
  await user.click(screen.getByTestId('fixture-search-new-btn'));
  const surname = await screen.findByTestId('new-guest-lastname');
  await waitFor(() => expect(surname).toHaveFocus());
  await user.type(surname, 'Palermo'); await user.tab();
  expect(screen.getByTestId('new-guest-firstname')).toHaveFocus(); await user.keyboard('Nicolás');
  await user.click(screen.getByRole('button', { name: /Guardar cliente/ }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/api/guests', expect.objectContaining({ lastName: 'Palermo', firstName: 'Nicolás' })));
  await waitFor(() => expect(selected).toHaveBeenCalledWith(expect.objectContaining({ lastName: 'Palermo', firstName: 'Nicolás' })));
});

it('lista de espera: empieza por apellido y guarda la identidad correcta con la estadía', async () => {
  const user = userEvent.setup();
  mocks.api.mockImplementation(async (_method, _path, data) => Response.json({ id: 'fixture-waitlist', ...data }));
  wrap(<ReservationWaitlistDialog open onOpenChange={vi.fn()} onConvert={vi.fn()} />);
  await user.click(screen.getByTestId('button-new-waitlist-entry'));
  const surname = screen.getByTestId('input-waitlist-last-name');
  await waitFor(() => expect(surname).toHaveFocus());
  await user.type(surname, 'Palermo'); await user.tab();
  expect(screen.getByTestId('input-waitlist-first-name')).toHaveFocus(); await user.keyboard('Nicolás');
  fireEvent.change(screen.getByTestId('input-waitlist-check-in'), { target: { value: '2026-12-10' } });
  fireEvent.change(screen.getByTestId('input-waitlist-check-out'), { target: { value: '2026-12-12' } });
  fireEvent.submit(screen.getByTestId('button-save-waitlist-entry').closest('form')!);
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/api/reservation-waitlist', expect.objectContaining({ firstName: 'Nicolás', lastName: 'Palermo', checkInDate: '2026-12-10', checkOutDate: '2026-12-12' })));
});
