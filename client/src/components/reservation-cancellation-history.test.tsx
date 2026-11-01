import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ReservationCancellationHistory } from './reservation-cancellation-history';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows the cancellation reason and actor in the cash shift without treating it as a refund', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify([{ id: 'cancel', reservation_code: 'RES-TEST', room_number: '605', guest_name: 'Prueba', reason: 'Check-in cargado por error', cancelled_by: 'Recepción', cancellation_date: '2026-11-01T18:00:00Z' }]), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  render(<QueryClientProvider client={new QueryClient()}><ReservationCancellationHistory shiftId="shift-test" /></QueryClientProvider>);
  expect(await screen.findByText('Motivo: Check-in cargado por error')).toBeInTheDocument();
  expect(screen.getByText(/RES-TEST · Hab. 605/)).toBeInTheDocument();
  expect(screen.getByText(/Recepción ·/)).toBeInTheDocument();
  expect(screen.getByText(/los totales de caja no se modifican/)).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/reservations/cancellations/in-shift?shiftId=shift-test', { credentials: 'include' });
});

it('reports an unavailable history instead of showing an empty successful result', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReservationCancellationHistory today /></QueryClientProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron consultar las reservas anuladas.');
  expect(screen.queryByText('No hay reservas anuladas en este período.')).not.toBeInTheDocument();
});
