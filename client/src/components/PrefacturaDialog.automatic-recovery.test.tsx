import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const { PrefacturaDialog } = await import('./PrefacturaDialog');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

function setup({ local = true, cc = true, stage = 'prepared', invoice = null as any, acknowledged = false,
  failure = false, blocked = false, changed = false, losePaymentOnce = false,
  preflight = false, method = 'transferencia', invoiceResponse = undefined as Promise<Response> | undefined } = {}) {
  const id = 'fixture-room-a', operationId = 'original-fixture-room-a-operation';
  const payment = { reservationId: id, amount: '12100.00', method, date: '2026-01-02',
    reference: 'original-reference', notes: null, paymentRequestId: 'original-payment-id' };
  const payments = cc ? [] : [payment];
  const invoiceRequest = { reservaId: id, creditOperationId: operationId, tipoComprobante: 'FA', puntoVentaOverride: 5,
    cliente: { razonSocial: 'Empresa de prueba', cuit: '00000000000', condicionIva: 'Responsable Inscripto' },
    items: [{ descripcion: 'Alojamiento', precioUnitario: 10000 }, { descripcion: 'Cochera', precioUnitario: 2100 }],
    sourceChargeIds: ['accommodation', 'parking'], sourceChargeAmounts: { accommodation: 10000, parking: 2100 },
    ...(cc ? { cashFormaPago: 'cuenta_corriente', reservationSettlementMethod: 'cuenta_corriente', ccEntityType: 'company', ccEntityId: 'fixture-company' } : {}),
    prefacturaRecovery: { version: 2, payments, checkoutRequested: true } };
  const attempt = { invoiceRequest, invoice, payments, checkoutRequested: true, acknowledgedPaymentIds: acknowledged ? [payment.paymentRequestId] : [] };
  if (local) window.sessionStorage.setItem(`prefactura-pending:${id}`, JSON.stringify(attempt));
  let statusReads = 0, closed = false, corrected = false, invoiceIssued = false, paymentCommitted = false;
  const fetcher = vi.fn(async (url: any, options?: RequestInit) => {
    const path = String(url);
    if (path.endsWith('/reception-status')) {
      statusReads++;
      return Response.json({ operationId, stage: blocked ? 'blocked' : invoiceIssued ? 'authorized' : stage, safeToCorrect: stage === 'prepared' || blocked,
        ...(preflight ? {preflightCorrection:{code:'GROUP_ADVANCE_CHOICE_REQUIRED',message:'Confirmá que este pago se recibió por separado del grupo.'}} : {}),
        attempt: losePaymentOnce && invoiceIssued ? { ...attempt, invoice: { id:9001,reservaId:id }, acknowledgedPaymentIds: paymentCommitted ? [payment.paymentRequestId] : [] } : attempt,
        ...(changed && statusReads > 1 ? { paymentConflicts: [payment.paymentRequestId], paymentConflictMessage: 'El pago requiere conciliación.' } : {}) });
    }
    if (options?.method === 'POST') {
      if (path.endsWith('/correct-reception')) { corrected = true; return Response.json({ corrected: true, request: invoiceRequest }); }
      if (failure) return Response.json({ error: 'ARCA no disponible' }, { status: 503 });
      if (path === '/api/billing/invoices') { invoiceIssued=true; return invoiceResponse || Response.json({ id: 9001, tipoComprobante: 'FA', puntoVenta: 5, numero: 9001, montoTotal: '12100.00', reservaId: id }); }
      if (path === '/api/payments') {
        if (losePaymentOnce && !paymentCommitted) { paymentCommitted=true; return Response.json({error:'Response lost after commit'},{status:503}); }
        return Response.json({ id: 'saved-payment' });
      }
      if (path.endsWith('/check-out')) { closed = true; return Response.json({ status: 'checked_out' }); }
      throw Error(`Unexpected POST ${path}`);
    }
    if (path.endsWith('/pending-operation')) return Response.json({ pending: closed || corrected ? null : { operationId, attempt } });
    if (path.endsWith('/group-account')) return Response.json({groupId:'synthetic-group',unassigned:preflight?30000:0,reviewReceipts:[],groupCoverage:{},advances:[]});
    if (path === `/api/reservations/${id}`) return Response.json({ id, status: closed ? 'checked_out' : 'checked_in' });
    if (path.endsWith('/folio')) return Response.json({ groupId: 'synthetic-group', reservationCode: 'RES204', guestName: 'Persona Fixture', roomNumber: '9001', nights: 1,
      roomRate: '10000', roomTotal: 10000, charges: [{ id: 'parking', description: 'Cochera', amount: 2100 }],
      payments: [], grandTotal: 12100, totalCharges: 2100, totalPayments: closed ? 12100 : 0, balance: closed ? 0 : 12100 });
    if (path === '/api/billing/config') return Response.json({ puntoVenta: 5, arcaAmbiente: 'ficticio' });
    return Response.json([]);
  });
  vi.stubGlobal('fetch', fetcher);
  const close = vi.fn();
  const props = { open: true, onClose: close, reservationId: id, reservation: { id, groupId: 'synthetic-group', guestId: 'guest', status: 'checked_in',
    guest: { firstName: 'Persona', lastName: 'Fixture' }, room: { roomNumber: '9001' } } as any, mode: 'checkout' as const };
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PrefacturaDialog {...props} /></QueryClientProvider>);
  return { fetcher, close, attempt, props, view, writes: () => fetcher.mock.calls.filter(([, options]) => options?.method === 'POST') };
}

it.each([true, false])('resumes the exact original CC plan automatically (local storage: %s)', async local => {
  const f = setup({ local });
  await waitFor(() => expect(f.close).toHaveBeenCalledOnce());
  expect(f.writes().map(([url]) => String(url))).toEqual(['/api/billing/invoices', '/api/reservations/fixture-room-a/check-out']);
  expect(JSON.parse(String(f.writes()[0][1]?.body))).toEqual(f.attempt.invoiceRequest);
  expect(window.sessionStorage.getItem('prefactura-pending:fixture-room-a')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Completar operación pendiente' })).not.toBeInTheDocument();
});

it('uses the acknowledged invoice/payment instead of issuing or collecting again', async () => {
  const f = setup({ cc: false, stage: 'authorized', acknowledged: true, invoice: { id: 9001, reservaId: 'fixture-room-a' } });
  await waitFor(() => expect(f.close).toHaveBeenCalledOnce());
  expect(f.writes().map(([url]) => String(url))).toEqual(['/api/reservations/fixture-room-a/check-out']);
});

it('rechecks cached evidence and stops if the original payment now conflicts', async () => {
  const f = setup({ cc: false, changed: true });
  expect(await screen.findByText('El pago requiere conciliación.')).toBeInTheDocument();
  expect(f.writes()).toHaveLength(0);
  expect(window.sessionStorage.getItem('prefactura-pending:fixture-room-a')).not.toBeNull();
});

it('retires a blocked unsent draft under the correction guard, preserving CC for editing', async () => {
  const f = setup({ blocked: true });
  await waitFor(() => expect(f.writes()).toHaveLength(1));
  await waitFor(() => expect(window.sessionStorage.getItem('prefactura-pending:fixture-room-a')).toBeNull());
  expect(String(f.writes()[0][0])).toContain('/correct-reception');
  expect(f.writes().some(([url]) => String(url) === '/api/billing/invoices')).toBe(false);
  await waitFor(()=>expect(screen.getByTestId('select-sale-condition')).toHaveTextContent(/Cuenta corriente/i));
  expect(screen.getByDisplayValue('Empresa de prueba')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Completar operación pendiente' })).not.toBeInTheDocument();
});

it.each([true,false])('unblocks an unsent group collection while preserving the card and amount (local: %s)',async local=>{
  const f=setup({local,cc:false,preflight:true,method:'tarjeta_credito'});
  await screen.findByText('Confirmá que este pago se recibió por separado del grupo.');
  await waitFor(()=>expect(window.sessionStorage.getItem('prefactura-pending:fixture-room-a')).toBeNull());
  expect(f.writes().map(([url])=>String(url))).toEqual(['/api/billing/reservations/fixture-room-a/operations/original-fixture-room-a-operation/correct-reception']);
  expect(screen.getByDisplayValue('12100.00')).toBeInTheDocument();
  expect(screen.getByTestId('select-payment-method-0')).toHaveTextContent('Tarjeta Crédito');
  expect(screen.getByLabelText(/Este pago individual se recibió por separado/)).not.toBeChecked();
  expect(screen.queryByRole('button',{name:'Completar operación pendiente'})).not.toBeInTheDocument();
  expect(f.close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('button-registrar-emitir'));
  expect(f.writes()).toHaveLength(1);
  fireEvent.click(screen.getByLabelText(/Este pago individual se recibió por separado/));
  fireEvent.click(screen.getByTestId('button-registrar-emitir'));
  await waitFor(()=>expect(f.close).toHaveBeenCalledOnce());
  const invoiceBody=JSON.parse(String(f.writes().find(([url])=>String(url)==='/api/billing/invoices')![1]?.body));
  expect(invoiceBody).toMatchObject({acknowledgeUnassignedAdvance:true,cashFormaPago:'tarjeta_credito',prefacturaRecovery:{payments:[{amount:'12100.00',method:'tarjeta_credito',date:'2026-01-02'}]}});
  expect(f.writes().filter(([url])=>String(url)==='/api/billing/invoices')).toHaveLength(1);
  expect(f.writes().filter(([url])=>String(url)==='/api/payments')).toHaveLength(1);
});

it('retains original intent after a failed automatic request without an unbounded render retry loop', async () => {
  const f = setup({ failure: true });
  expect(await screen.findByText(/ARCA no disponible/)).toBeInTheDocument();
  expect(f.writes()).toHaveLength(1);
  expect(JSON.parse(window.sessionStorage.getItem('prefactura-pending:fixture-room-a')!)).toMatchObject({ invoiceRequest: f.attempt.invoiceRequest });
  expect(f.close).not.toHaveBeenCalled();
});

it('automatically recovers a committed payment with a lost response without reposting the invoice or payment', async () => {
  const f=setup({cc:false,losePaymentOnce:true});
  await waitFor(()=>expect(f.close).toHaveBeenCalledOnce(),{timeout:4500});
  expect(f.writes().map(([url])=>String(url))).toEqual(['/api/billing/invoices','/api/payments','/api/reservations/fixture-room-a/check-out']);
  expect(JSON.parse(String(f.writes()[1][1]?.body))).toMatchObject({paymentRequestId:'original-payment-id',method:'transferencia',date:'2026-01-02'});
});

it('stops later writes when the dialog closes while an invoice response is in flight', async () => {
  let resolve!: (response:Response)=>void;
  const response=new Promise<Response>(done=>{resolve=done;});
  const f=setup({cc:false,invoiceResponse:response});
  await waitFor(()=>expect(f.writes()).toHaveLength(1));
  f.view.unmount();
  resolve(Response.json({id:9001,reservaId:'fixture-room-a'}));
  await waitFor(()=>expect(JSON.parse(window.sessionStorage.getItem('prefactura-pending:fixture-room-a')!).invoice?.id).toBe(9001));
  expect(f.writes()).toHaveLength(1);
  expect(f.close).not.toHaveBeenCalled();
});
