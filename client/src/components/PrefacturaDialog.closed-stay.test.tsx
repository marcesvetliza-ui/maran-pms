import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
import { PrefacturaDialog } from './PrefacturaDialog';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }));
let writes: any[], group: boolean, allCovered: boolean, failInvoice: boolean;
const id = 'closed-stay-401';
beforeEach(() => {
  sessionStorage.clear(); queryClient.clear(); writes = []; group = false; allCovered = false; failInvoice = false;
  vi.stubGlobal('fetch', vi.fn(async (url: any, options?: RequestInit) => {
    const path = String(url);
    if (path.endsWith('/recover')) return Response.json({ error: 'No operation' }, { status: 404 });
    if (options?.method === 'POST') {
      writes.push({ path, body: JSON.parse(String(options.body || '{}')) });
      if (failInvoice && path === '/api/billing/invoices') return Response.json({ error: 'Transitorio' }, { status: 503 });
      return Response.json({ id: 800, tipoComprobante: 'FB', puntoVenta: 5, numero: 800, montoTotal: '154500.00', estado: 'emitida' });
    }
    const coverage = { 'accommodation:2026-11-24': 147000, ...(allCovered ? { 'accommodation:2026-11-25': 147000, 'historical-dinner': 7500 } : {}) };
    if (path.endsWith('/group-account')) return Response.json({ groupId: 'group', balance: 301500, charges: 301500, paid: 0, groupCoverage: coverage, advances: [], reviewReceipts: [], unassigned: 0 });
    if (path.endsWith('/folio')) return Response.json({ ...(group ? { groupId: 'group' } : {}), roomNumber: '401', nights: 2, roomRate: 147000, roomTotal: 294000, balance: 301500, grandTotal: 301500, totalCharges: 7500, totalPayments: 0,
      accommodationNights: [{ id: 'accommodation:2026-11-24', date: '2026-11-24', amount: 147000 }, { id: 'accommodation:2026-11-25', date: '2026-11-25', amount: 147000 }],
      charges: [{ id: 'historical-dinner', description: 'Cena de la estadía', amount: '7500', date: '2026-11-25', category: 'restaurant' }],
      payments: [{ id: 'old-receipt', amount: '100000', status: 'active', method: 'efectivo' }],
    });
    if (path.endsWith('/invoices')) return Response.json(group ? [] : [{ id: 111, estado: 'emitida', tipo_comprobante: 'FB', monto_total: allCovered ? '301500' : '147000', source_charge_ids: Object.keys(coverage), source_charge_amounts: coverage }]);
    if (path === '/api/billing/config') return Response.json({ puntoVenta: 5, arcaAmbiente: 'ficticio' });
    if (path.endsWith('/pending-operation')) return Response.json({ pending: null });
    return Response.json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function tree() {
  return <QueryClientProvider client={queryClient}><PrefacturaDialog open onClose={vi.fn()} reservationId={id}
    reservation={{ id, status: 'checked_out', ...(group ? { groupId: 'group' } : {}), guestId: 'old-guest', guest: { id: 'old-guest', firstName: 'Nicolás', lastName: 'Prueba', nationality: 'Argentina', vatCondition: 'consumidor_final' }, room: { roomNumber: '401', status: 'occupied' } } as any}
    mode="billing" closedStayOnly /></QueryClientProvider>;
}
it.each([false, true])('factura sólo los conceptos pendientes, conserva pagos y no reabre la habitación (grupo=%s)', async isGroup => {
  group = isGroup; render(tree()); const user = userEvent.setup();
  expect(await screen.findByDisplayValue('Solo facturación; conserva los pagos')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Cargos de la habitación/ }));
  expect(screen.queryByRole('button', { name: /Editar importe de la noche/ })).not.toBeInTheDocument();
  expect(screen.queryByTitle('Transferir a otra habitación')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Revertir transferencia')).not.toBeInTheDocument();
  expect(screen.queryByTestId('button-open-add-charge')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Hacer check-out al confirmar')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Qué querés hacer con estos cargos')).not.toBeInTheDocument();
  const button = await screen.findByTestId('button-registrar-emitir');
  await waitFor(() => expect(button).toBeEnabled()); expect(button).toHaveTextContent('Emitir factura sin cobrar');
  await user.click(button);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ path: '/api/billing/invoices', body: { reservaId: id, closedStayDocumentationOnly: true,
    sourceChargeIds: ['accommodation:2026-11-25', 'historical-dinner'], sourceChargeAmounts: { 'accommodation:2026-11-25': 147000, 'historical-dinner': 7500 },
    creditReapplications: [], ordinaryAdvanceApplications: [], prefacturaRecovery: { version: 2, payments: [], checkoutRequested: false },
  } });
  expect(writes[0].body.groupDocumentationOnly).toBe(isGroup ? true : undefined);
  for (const field of ['cashArea', 'cashFormaPago', 'cashFormaPagoDetalle', 'reservationSettlementMethod', 'ccEntityId']) expect(writes[0].body[field]).toBeUndefined();
  expect(writes[0].body.items.reduce((sum: number, item: any) => sum + item.subtotal, 0)).toBe(154500);
});
it('no habilita otro comprobante cuando todo ya está facturado', async () => {
  allCovered = true; render(tree()); await screen.findByDisplayValue('Solo facturación; conserva los pagos');
  await waitFor(() => expect(screen.getByTestId('button-registrar-emitir')).toBeDisabled());
  expect(writes).toEqual([]);
});

it('reintenta la misma factura pendiente sin cambiar fuentes, cobros ni check-out', async () => {
  failInvoice = true; render(tree()); const user = userEvent.setup();
  const button = await screen.findByTestId('button-registrar-emitir'); await waitFor(() => expect(button).toBeEnabled());
  await user.click(button); await screen.findByTestId('billing-original-intent');
  const original = structuredClone(writes[0]); failInvoice = false;
  await user.click(screen.getByRole('button', { name: 'Completar operación pendiente' }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(original);
  expect(writes[1].body).toMatchObject({ closedStayDocumentationOnly: true, prefacturaRecovery: { payments: [], checkoutRequested: false } });
});
