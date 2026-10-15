import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueryFn, queryClient } from '@/lib/queryClient';
import SpaPage from './spa';

vi.mock('@/App', () => ({ useAuth: () => ({ hasPermission: () => true, user: { role: 'admin' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/inventory-pending-consumptions', () => ({ InventoryPendingConsumptions: () => null }));
vi.mock('./billing', () => ({ EmitirFacturaDialog: ({ initialValues, onClose }: any) => <div data-testid="spa-fiscal-dialog"><pre>{JSON.stringify(initialValues)}</pre><button onClick={onClose}>Volver a SPA</button></div> }));

const active = { id: 'active', name: 'Masaje activo', durationMinutes: 60, price: '70000', isActive: 'true', isCircuit: false };
const inactive = { ...active, id: 'inactive', name: 'Masaje inactivo', isActive: 'false' };
let rows: any[];
let hasExistingPayment = false;
const requests: Array<{ method: string; path: string; body: any }> = [];
beforeEach(() => {
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) }, mutations: { retry: false } });
  rows = [active, inactive]; requests.length = 0; hasExistingPayment = false;
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const path = String(input); const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body });
    let data: any = [];
    if (path === '/api/spa/cabins') data = [{ id: 'cabin', name: 'Gabinete', isActive: 'true' }];
    if (path.startsWith('/api/spa/appointments?')) data = [{ id: 'appointment', cabinId: 'cabin', treatmentId: 'active', guestId: 'guest', guestName: 'Ana', appointmentDate: format(new Date(), 'yyyy-MM-dd'), startTime: '10:00', endTime: '11:00', status: 'confirmed' }];
    if (path === '/api/spa/clients') data = [{ id: 'guest', firstName: 'Ana', lastName: 'Pérez', vatCondition: 'Exento', cuilCuit: '27123456780', documentNumber: '12345678' }];
    if (path === '/api/spa/accounts/by-appointment/appointment') data = { id: 'account', guestName: 'Ana', status: 'open', items: [{ id: 'charge', description: 'Masaje', quantity: 1, unitPrice: '70000', subtotal: '70000', itemType: 'treatment' }], payments: hasExistingPayment ? [{ id: 'paid', amount: '70000', method: 'cash', status: 'active' }] : [] };
    if (path.includes('/api/spa/treatments?')) data = rows;
    if (path === '/api/spa/treatments' && method === 'POST') {
      const saved = { ...body, id: 'new-treatment' }; rows = [...rows, saved]; data = saved;
    }
    if (path.endsWith('/supplies')) data = [{ id: 'supply', inventoryItemName: 'Aceite', quantity: '50', unit: 'ml', estimatedCost: 1000 }];
    if (path.startsWith('/api/inventory/items')) data = [
      { id: 'oil', name: 'Aceite', sku: 'SPA-01', currentStock: 10, unit: 'litro', costPrice: '20000' },
      { id: 'cream', name: 'Crema', sku: 'SPA-02', currentStock: 3, unit: 'unidad', costPrice: '5000' },
    ];
    if (method === 'PATCH' && path.includes('/api/spa/treatments/')) {
      rows = rows.map(t => t.id === path.split('/').at(-1) ? { ...t, ...body } : t);
      data = rows.find(t => t.id === path.split('/').at(-1));
    }
    return new Response(JSON.stringify(data), { status: method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
const open = () => render(<QueryClientProvider client={queryClient}><SpaPage /></QueryClientProvider>);

describe('SPA operativo', () => {
  it('permite encontrar un tratamiento inactivo y reactivarlo', async () => {
    const user = userEvent.setup(); open();
    await user.click(await screen.findByTestId('tab-tratamientos'));
    await screen.findByText('Masaje activo');
    expect(screen.queryByText('Masaje inactivo')).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Estado de tratamientos' }));
    await user.click(screen.getByRole('option', { name: 'Inactivos' }));
    await user.click(await screen.findByTestId('button-edit-treatment-inactive'));
    // The existing editor is the recovery path; keep all metadata and only change its state.
    const comboboxes = screen.getAllByRole('combobox');
    const status = comboboxes.find(el => el.textContent === 'Inactivo');
    expect(status).toBeTruthy();
    await user.click(status!);
    await user.click(screen.getByRole('option', { name: /^Activo$/ }));
    fireEvent.submit(screen.getByTestId('button-submit-treatment').closest('form')!);
    await waitFor(() => expect(requests.some(r => r.method === 'PATCH' && r.path.endsWith('/inactive') && r.body.isActive === 'true')).toBe(true));
    expect(requests.some(r => r.method === 'DELETE')).toBe(false);
  });
  it('mantiene abierto el tratamiento recién creado para configurar sus insumos', async () => {
    const user = userEvent.setup(); open();
    await user.click(await screen.findByTestId('tab-tratamientos'));
    await user.click(screen.getByTestId('button-new-treatment'));
    await user.type(screen.getByTestId('input-treatment-name'), 'Nuevo masaje');
    fireEvent.change(screen.getByTestId('input-treatment-price'), { target: { value: '50000' } });
    fireEvent.submit(screen.getByTestId('button-submit-treatment').closest('form')!);
    await screen.findByText('Insumos a descontar del inventario');
    expect(screen.getByTestId('treatment-estimated-cost')).toHaveTextContent('1.000');
    expect(screen.getByTestId('btn-add-supply')).toBeInTheDocument();
  });
  it('filtra insumos por SKU sin modificar existencias', async () => {
    const user = userEvent.setup(); open();
    await user.click(await screen.findByTestId('tab-insumos'));
    await screen.findByText('Aceite');
    await user.type(screen.getByRole('textbox', { name: 'Buscar insumos SPA' }), 'SPA-02');
    expect(screen.queryByText('Aceite')).not.toBeInTheDocument();
    expect(screen.getByText('Crema')).toBeInTheDocument();
    expect(requests.every(r => r.method === 'GET')).toBe(true);
  });
  it('pasa el receptor real al diálogo fiscal y permite volver al folio sin salir de SPA', async () => {
    const user = userEvent.setup(); open();
    await user.click(await screen.findByTestId('appointment-appointment'));
    await user.click(await screen.findByTestId('button-open-folio'));
    await user.click(screen.getByTestId('select-receipt-type'));
    await user.click(screen.getByRole('option', { name: 'Factura electrónica (según receptor)' }));
    await user.click(screen.getByTestId('button-close-folio'));
    const fiscal = await screen.findByTestId('spa-fiscal-dialog');
    expect(fiscal).toHaveTextContent('Exento');
    expect(fiscal).not.toHaveTextContent('Consumidor Final');
    await user.click(screen.getByRole('button', { name: 'Volver a SPA' }));
    expect(await screen.findByTestId('button-close-folio')).toBeInTheDocument();
    expect(requests.every(r => r.method === 'GET')).toBe(true);
  });
  it('explica la protección para cobros existentes y no dispara otra emisión ni otro cobro', async () => {
    hasExistingPayment = true;
    const user = userEvent.setup(); open();
    await user.click(await screen.findByTestId('appointment-appointment'));
    await user.click(await screen.findByTestId('button-open-folio'));
    await user.click(screen.getByTestId('select-receipt-type'));
    await user.click(screen.getByRole('option', { name: 'Factura electrónica (según receptor)' }));
    expect(screen.getByTestId('button-close-folio')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('evitar cobrarlos nuevamente');
    expect(screen.queryByTestId('spa-fiscal-dialog')).not.toBeInTheDocument();
    expect(requests.every(r => r.method === 'GET')).toBe(true);
  });

});
