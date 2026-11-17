import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivedRetentionsReport } from './received-retentions-report';
import { receivedRetentionRow, matchesRetentionFilters, retentionTotals } from '@shared/received-retention-report';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const certificate = { id: 1, tipo_comprobante: 'RETENCION', proveedor_nombre: 'José Prueba', proveedor_cuit: '30-01234567-8', fecha_emision: '2026-11-01', created_at: '2026-11-02T12:00:00Z', numero_comprobante: '000123', monto_total: '120.30', estado: 'registrado', subtipo_retencion: 'iibb' };
let rows = [receivedRetentionRow(certificate)!];
let downloads: string[];
let reads: string[];
let fail = false;
let clients: QueryClient[];
beforeEach(() => {
  rows = [receivedRetentionRow(certificate)!]; downloads = []; reads = []; clients = []; fail = false;
  vi.stubGlobal('fetch', vi.fn(async (input: any, options: any) => {
    expect(options?.method || 'GET').toBe('GET');
    const url = new URL(String(input), 'http://localhost');
    if (url.searchParams.get('format') !== 'json') { downloads.push(String(input)); return new Response('fixture file'); }
    reads.push(String(input));
    if (fail) return new Response('error', { status: 500 });
    const filtered = rows.filter(row => matchesRetentionFilters(row, Object.fromEntries(url.searchParams)));
    const page = Number(url.searchParams.get('page') || 1);
    return new Response(JSON.stringify({ rows: filtered.slice((page - 1) * 50, page * 50), count: filtered.length, page, pageSize: 50, totals: retentionTotals(filtered) }));
  }));
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:fixture'); static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client); render(<QueryClientProvider client={client}><ReceivedRetentionsReport /></QueryClientProvider>); }

it('aplica filtros juntos y descarga/imprime ese resultado sin paginación en los archivos', async () => {
  const user = userEvent.setup(); mount(); await screen.findByText('José Prueba');
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-01' } });
  await user.type(screen.getByLabelText('Proveedor / agente'), 'jose'); await user.type(screen.getByLabelText('CUIT'), '30012345678');
  await user.selectOptions(screen.getByLabelText('Impuesto'), 'iibb');
  expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('button', { name: 'Aplicar filtros' }).closest('form')!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled());
  expect(screen.getByText('Total vigente: $ 120,30')).toBeInTheDocument();
  for (const name of ['Descargar Excel', 'Descargar PDF']) {
    await user.click(screen.getByRole('button', { name }));
    await waitFor(() => expect(screen.getByRole('button', { name })).toBeEnabled());
  }
  await user.click(screen.getByRole('button', { name: 'Imprimir' }));
  expect(downloads).toHaveLength(2);
  for (const path of [...downloads, vi.mocked(window.open).mock.calls[0][0] as string]) {
    const params = new URL(path, 'http://localhost').searchParams;
    expect(params.get('desde')).toBe('2026-11-01'); expect(params.get('hasta')).toBe('2026-11-01');
    expect(params.get('agente')).toBe('jose'); expect(params.get('cuit')).toBe('30012345678'); expect(params.get('impuesto')).toBe('iibb');
    expect(params.has('page')).toBe(false);
  }
  expect(vi.mocked(window.open).mock.calls[0][0]).toContain('inline=true');
});

it('no exporta filtros inválidos ni presenta errores de consulta como resultados vacíos', async () => {
  const user = userEvent.setup(); mount(); await screen.findByText('José Prueba');
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-03' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent('anterior o igual');
  expect(screen.getByRole('button', { name: 'Aplicar filtros' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  fail = true; await user.click(screen.getByRole('button', { name: 'Actualizar' }));
  await screen.findByText('No se pudieron consultar las retenciones. Intentá nuevamente.');
  expect(screen.queryByText('No hay retenciones para los filtros elegidos.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descargar Excel' })).not.toBeInTheDocument();
  fail = false; await user.click(screen.getByRole('button', { name: 'Reintentar consulta' })); await screen.findByText('José Prueba');
});

it('pagina sin perder totales, reinicia la página al filtrar y distingue anuladas', async () => {
  rows = Array.from({ length: 52 }, (_, i) => receivedRetentionRow({ ...certificate, id: i + 1, proveedor_nombre: `Agente ${i + 1}`, monto_total: '1.00', estado: i === 51 ? 'anulado' : 'registrado' })!);
  const user = userEvent.setup(); mount(); await screen.findByText('Agente 1');
  expect(screen.getByText('Total vigente: $ 51,00')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Siguiente' })); await screen.findByText('Agente 51');
  expect(screen.queryByText('Agente 1')).not.toBeInTheDocument(); expect(screen.getByText('Total vigente: $ 51,00')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Estado'), 'todas'); fireEvent.submit(screen.getByRole('button', { name: 'Aplicar filtros' }).closest('form')!);
  await screen.findByText('Agente 1'); expect(reads.at(-1)).toContain('page=1');
  expect(screen.getByText('1 anuladas · $ 1,00 excluidos del total vigente')).toBeInTheDocument();
});
