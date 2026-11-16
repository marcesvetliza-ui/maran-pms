import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast, toasts: [], dismiss: vi.fn() }) }));
const { default: BillingPage } = await import("./billing");
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const note = { id: 42, tipo_comprobante: "NDB", punto_venta: 5, numero: 1, monto_total: "10000.00", monto_acreditado: "0.00", estado: "emitida", reconciliation_status: "conciliada", cliente_razon_social: "Synthetic receiver", cash_forma_pago: "tarjeta_debito" };

function setup(options: { type?: string; state?: string; editFailure?: boolean; lostResponse?: boolean; unauthorized?: boolean; recoveryOperationId?: string } = {}) {
  let annulled = false, attempts = 0;
  const current = { ...note, tipo_comprobante: options.type || note.tipo_comprobante, estado: options.state || note.estado };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/billing/invoices?')) return response([{ ...current, ...(annulled ? { estado: 'anulada' } : {}) }]);
    if (url === '/api/billing/config') return response({ arcaAmbiente: 'homologacion' });
    if (url.startsWith('/api/billing/debit-notes/42/actions')) return options.unauthorized ? response({ error: 'No autorizado para corregir esta nota.' }, 403) : response({ invoice: current, expectedFingerprint: 'original-snapshot', canEdit: true, canAnnul: true, creditType: current.tipo_comprobante.replace('ND', 'NC'), ...(options.recoveryOperationId ? { recoveryOperationId: options.recoveryOperationId, correction: { id: 43, estado: 'emitida', reconciliationStatus: 'pendiente' } } : {}) });
    if (url === '/api/billing/debit-notes/42' && init?.method === 'PATCH') return options.editFailure ? response({ error: 'La nota cambió desde que se abrió.' }, 409) : response({ ...current, cash_forma_pago: 'transferencia' });
    if (url === '/api/billing/debit-notes/42/annul' && init?.method === 'POST') {
      attempts++;
      if (options.lostResponse && attempts === 1) throw new TypeError('Response lost');
      annulled = true;
      return response({ id: 43, tipo_comprobante: 'NCB', monto_total: '10000.00', reconciliation_status: 'conciliada' });
    }
    return response([]);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<QueryClientProvider client={queryClient}><BillingPage /></QueryClientProvider>);
  return fetcher;
}
beforeEach(() => { queryClient.clear(); toast.mockReset(); window.sessionStorage.clear(); vi.stubGlobal('open', vi.fn()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['NDA', 'NDB', 'NDC', 'NDT', 'NDM', 'NDMB'])('ofrece lápiz y anulación de %s sin usar la baja de documentos no fiscales', async type => {
  setup({ type });
  expect(await screen.findByTestId('btn-editar-42')).toHaveAttribute('aria-label', 'Editar Nota de Débito');
  expect(screen.getByTestId('btn-annul-debit-42')).toHaveAttribute('aria-label', 'Anular Nota de Débito');
  expect(screen.queryByTestId('btn-annul-non-fiscal-42')).not.toBeInTheDocument();
  expect(screen.queryByTestId('btn-nc-42')).not.toBeInTheDocument();
});
it.each(['anulada', 'autorizacion_pendiente'])('conserva lectura de la nota %s sin habilitar otra corrección', async state => {
  setup({ state }); await screen.findByTestId('invoice-actions-42');
  expect(screen.queryByTestId('btn-editar-42')).not.toBeInTheDocument();
  expect(screen.queryByTestId('btn-annul-debit-42')).not.toBeInTheDocument();
});
it('el lápiz exige motivo y guarda solamente el dato informativo elegido', async () => {
  const fetcher = setup(), user = userEvent.setup();
  await user.click(await screen.findByTestId('btn-editar-42'));
  const method = await screen.findByTestId('debit-note-method');
  expect(method).toHaveTextContent('Tarjeta Débito');
  expect(screen.getByTestId('confirm-debit-note-action')).toBeDisabled();
  await user.click(method); await user.click(screen.getByRole('option', { name: 'Transferencia' }));
  await user.type(screen.getByTestId('debit-note-reason'), 'Corregir el dato impreso');
  await user.click(screen.getByTestId('confirm-debit-note-action'));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nota de Débito actualizada' })));
  const writes = fetcher.mock.calls.filter(([, init]) => ['POST', 'PATCH', 'DELETE'].includes(init?.method || ''));
  expect(writes).toHaveLength(1); expect(writes[0][0]).toBe('/api/billing/debit-notes/42');
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ reason: 'Corregir el dato impreso', expectedFingerprint: 'original-snapshot', cashFormaPago: 'transferencia' });
});
it('muestra el rechazo de edición dentro del diálogo y conserva el motivo', async () => {
  setup({ editFailure: true }); const user = userEvent.setup();
  await user.click(await screen.findByTestId('btn-editar-42')); await screen.findByTestId('debit-note-method');
  await user.type(screen.getByTestId('debit-note-reason'), 'Dato equivocado'); await user.click(screen.getByTestId('confirm-debit-note-action'));
  expect(await screen.findByTestId('debit-note-action-error')).toHaveTextContent('La nota cambió desde que se abrió.');
  expect(screen.getByTestId('debit-note-reason')).toHaveValue('Dato equivocado');
});
it('la anulación confirma la NC y conserva su identidad tras una respuesta perdida', async () => {
  const fetcher = setup({ lostResponse: true }), user = userEvent.setup();
  await user.click(await screen.findByTestId('btn-annul-debit-42'));
  expect(await screen.findByText(/Se emitirá:/)).toHaveTextContent('NCB por $10.000,00');
  await user.type(screen.getByTestId('debit-note-reason'), 'Nota duplicada'); await user.click(screen.getByTestId('confirm-debit-note-action'));
  expect(await screen.findByTestId('debit-note-action-error')).toHaveTextContent('Response lost');
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  await user.click(screen.getByTestId('btn-annul-debit-42')); await screen.findByText(/Se emitirá:/);
  await user.type(screen.getByTestId('debit-note-reason'), 'Nota duplicada'); await user.click(screen.getByTestId('confirm-debit-note-action'));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nota de Débito anulada' })));
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'); expect(posts).toHaveLength(2);
  const first = JSON.parse(String(posts[0][1]?.body)), second = JSON.parse(String(posts[1][1]?.body));
  expect(first.operationId).toMatch(/^[a-f0-9-]{36}$/); expect(second).toEqual(first);
  expect(posts.every(([url]) => String(url) === '/api/billing/debit-notes/42/annul')).toBe(true);
  expect(await screen.findByTestId('invoice-actions-42')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByTestId('btn-annul-debit-42')).not.toBeInTheDocument());
});
it('informa falta de permiso sin preparar una escritura', async () => {
  const fetcher = setup({ unauthorized: true }), user = userEvent.setup();
  await user.click(await screen.findByTestId('btn-editar-42'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No autorizado');
  expect(screen.getByTestId('confirm-debit-note-action')).toBeDisabled();
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
});
it('recupera la identidad de una NC pendiente descubierta desde otro navegador', async () => {
  const operationId = crypto.randomUUID(), fetcher = setup({ recoveryOperationId: operationId }), user = userEvent.setup();
  await user.click(await screen.findByTestId('btn-annul-debit-42'));
  expect(await screen.findByText(/Ya existe una Nota de Crédito para este intento/)).toBeInTheDocument();
  await user.type(screen.getByTestId('debit-note-reason'), 'Completar conciliación pendiente');
  await user.click(screen.getByTestId('confirm-debit-note-action'));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nota de Débito anulada' })));
  const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(writes).toHaveLength(1); expect(JSON.parse(String(writes[0][1]?.body)).operationId).toBe(operationId);
});
