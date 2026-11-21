import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CcInvoiceTrackingSection } from './cc-invoice-tracking-section';
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/App', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
const rows = [{ recordId: 'synthetic', salesInvoiceId: 1, documentStatus: 'facturada', entityType: 'company', entityName: 'Empresa de prueba', fecha: '2026-11-21', monto: 200, importeFacturado: 200, saldoPendiente: 100, estado: 'pendiente', numeroFactura: '00001-00000001', tipoComprobante: 'FA' }];
const summary = { totalFacturado: 200, totalSinFactura: 0, totalSaldoPendiente: 100, totalGestionesManuales: 0, saldosSinVerificar: 0, totalFacturas: 1, porEstado: [], porEmpresa: [] };
let client: QueryClient, files: Array<{ href: string; name: string }>, exportError: boolean, invalidMime: boolean, emptyFile: boolean;
let revokeTimers: Array<ReturnType<typeof setTimeout>>;
const nativeTimeout = globalThis.setTimeout;
const create = vi.fn(() => 'blob:synthetic-cc'), revoke = vi.fn();
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  files = []; exportError = false; invalidMime = false; emptyFile = false; revokeTimers = []; toast.mockReset(); create.mockClear(); revoke.mockClear();
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: any, delay: number, ...args: any[]) => { const timer = nativeTimeout(callback, delay, ...args); if (delay === 60_000) revokeTimers.push(timer); return timer; }) as any);
  URL.createObjectURL = create; URL.revokeObjectURL = revoke;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { files.push({ href: this.href, name: this.download }); });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async ({ queryKey }) => (await fetch(queryKey.join('/'))).json() } } });
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname.endsWith('/export')) {
      if (exportError) return new Response(JSON.stringify({ error: 'No se pudo generar la descarga' }), { status: 503 });
      const pdf = url.searchParams.get('format') === 'pdf';
      return new Response(emptyFile ? '' : pdf ? '%PDF-1.7 synthetic' : 'PK synthetic', { headers: { 'content-type': invalidMime ? 'application/json' : pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    }
    return new Response(JSON.stringify(url.pathname.includes('/month/') ? summary : rows), { headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); client.clear(); revokeTimers.forEach(timer => clearTimeout(timer)); vi.restoreAllMocks(); vi.unstubAllGlobals(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });
async function mount() {
  render(<QueryClientProvider client={client}><CcInvoiceTrackingSection /></QueryClientProvider>);
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Mostrar' }));
  await waitFor(() => expect(screen.getByTestId('button-download-cc-list-pdf')).toBeEnabled()); return user;
}
it.each(['pdf', 'xlsx'])('downloads the %s list using the selected dates, management state, documentary status and search', async format => {
  const user = await mount();
  fireEvent.change(screen.getByTestId('input-cc-tracking-from'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByTestId('input-cc-tracking-to'), { target: { value: '2026-11-30' } });
  await user.click(screen.getByTestId('select-cc-tracking-estado-filter')); await user.click(screen.getByRole('option', { name: 'Reclamada' }));
  await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
  await user.click(screen.getByTestId('select-cc-tracking-document-filter')); await user.click(screen.getByRole('option', { name: 'Sin factura vinculada' }));
  await user.type(screen.getByTestId('input-cc-tracking-search'), 'Prueba & Cía');
  const button = screen.getByTestId(`button-download-cc-list-${format}`); await waitFor(() => expect(button).toBeEnabled()); await user.click(button);
  await waitFor(() => expect(files).toHaveLength(1));
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/export'))!;
  const query = new URL(String(call[0]), window.location.origin).searchParams;
  expect(Object.fromEntries(query)).toEqual({ format, from: '2026-11-01', to: '2026-11-30', estado: 'reclamada', documentStatus: 'sin_factura', search: 'Prueba & Cía' });
  expect(files[0].name).toBe(`seguimiento-cc-2026-11-01-2026-11-30.${format}`);
  expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});
it('downloads the chosen month rather than the current month', async () => {
  const user = await mount(); await user.click(screen.getByRole('tab', { name: 'Informe mensual' }));
  await user.click(screen.getByTestId('select-cc-tracking-month')); await user.click(screen.getByRole('option', { name: 'febrero' }));
  fireEvent.change(screen.getByTestId('input-cc-tracking-year'), { target: { value: '2027' } });
  const button = screen.getByTestId('button-download-cc-month-xlsx'); await waitFor(() => expect(button).toBeEnabled()); await user.click(button);
  await waitFor(() => expect(files).toHaveLength(1));
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === '/api/cc-invoice-tracking/month/2027/2/export?format=xlsx')).toBe(true);
  expect(files[0].name).toBe('seguimiento-cc-mensual-2027-02.xlsx');
});
it.each(['query failure', 'invalid file', 'empty file'])('shows a download error and creates no file on %s', async failure => {
  const user = await mount(); exportError = failure === 'query failure'; invalidMime = failure === 'invalid file'; emptyFile = failure === 'empty file';
  await user.click(screen.getByTestId('button-download-cc-list-pdf'));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo descargar el seguimiento', variant: 'destructive' })));
  expect(create).not.toHaveBeenCalled(); expect(files).toEqual([]);
});
it('disables downloading until the selected filters finish loading', async () => {
  const user = await mount(); let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; }), original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((input: any, options?: RequestInit) => new URL(String(input), window.location.origin).searchParams.get('search') === 'esperar' ? pending : original(input, options));
  await user.type(screen.getByTestId('input-cc-tracking-search'), 'esperar');
  expect(screen.getByTestId('button-download-cc-list-pdf')).toBeDisabled(); expect(screen.getByTestId('button-download-cc-list-xlsx')).toBeDisabled();
  finish(new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } }));
  await waitFor(() => expect(screen.getByTestId('button-download-cc-list-pdf')).toBeEnabled()); expect(files).toEqual([]);
});
