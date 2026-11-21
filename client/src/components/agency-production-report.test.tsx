import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AgencyProductionReport } from './agency-production-report';

let client: QueryClient, fail: boolean;
const rows = [
  { agency: { id: 'net', razonSocial: 'Agencia neta' }, totalReservations: 2, totalNights: 6, totalRevenue: 600, commissionRate: 0, totalCommission: 0, nightShare: 75, unpricedNights: 1, estimatedNights: 0, invalidReservations: 0 },
  { agency: { id: 'other', razonSocial: 'Otra agencia' }, totalReservations: 1, totalNights: 2, totalRevenue: 200, commissionRate: 10, totalCommission: 20, nightShare: 25, unpricedNights: 0, estimatedNights: 0, invalidReservations: 0 },
  { agency: { id: 'empty', razonSocial: 'Sin movimiento' }, totalReservations: 0, totalNights: 0, totalRevenue: 0, commissionRate: 0, totalCommission: 0, nightShare: 0, unpricedNights: 0, estimatedNights: 0, invalidReservations: 0 },
];
beforeEach(() => {
  fail = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fail ? { error: 'Unavailable' } : rows), { status: fail ? 503 : 200, headers: { 'content-type': 'application/json' } })));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
async function mount() {
  render(<QueryClientProvider client={client}><AgencyProductionReport /></QueryClientProvider>);
  await screen.findByTestId('row-report-net');
  return userEvent.setup();
}
it('shows historical night production for net agencies, ranking, share and totals without commission columns', async () => {
  await mount();
  expect(screen.getByTestId('agency-production-total-2')).toHaveTextContent('8');
  const net = within(screen.getByTestId('row-report-net'));
  expect(net.getAllByRole('cell').map(el => el.textContent)).toEqual(['1', 'Agencia neta', '2', '6', '75%', expect.stringContaining('600')]);
  expect(screen.queryByRole('columnheader', { name: 'Comisión %' })).not.toBeInTheDocument();
  expect(screen.queryByTestId('row-report-empty')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Las noches sí se cuentan');
  expect(screen.getByText(/no representan facturas emitidas ni cobros/)).toBeInTheDocument();
});
it('can reveal empty agencies and optional commissions without changing night totals', async () => {
  const user = await mount();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar agencias sin movimiento' }));
  expect(await screen.findByTestId('row-report-empty')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ver comisiones estimadas' }));
  expect(await screen.findByRole('columnheader', { name: 'Comisión %' })).toBeInTheDocument();
  expect(within(screen.getByTestId('row-report-net')).getByText('0%')).toBeInTheDocument();
  expect(screen.getByTestId('agency-production-total-2')).toHaveTextContent('8');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
});
it('requests selected stay dates and refuses reversed ranges without a new request', async () => {
  await mount();
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-20' } });
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(args => String(args[0]) === '/api/agencies/report?from=2026-11-01&to=2026-11-20')).toBe(true));
  const before = vi.mocked(fetch).mock.calls.length;
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-12-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent('no puede ser posterior');
  expect(screen.queryByTestId('agency-production-total-2')).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls).toHaveLength(before);
});
it('shows a query failure instead of reporting zero nights and allows retrying', async () => {
  fail = true;
  render(<QueryClientProvider client={client}><AgencyProductionReport /></QueryClientProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar');
  expect(screen.queryByTestId('agency-production-total-2')).not.toBeInTheDocument();
  fail = false;
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByTestId('agency-production-total-2')).toHaveTextContent('8');
});
