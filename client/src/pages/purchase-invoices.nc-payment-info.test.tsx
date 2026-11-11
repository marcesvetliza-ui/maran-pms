import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn(),toasts:[],dismiss:vi.fn()})}));
const {InvoiceDialog}=await import('./purchase-invoices');
let captured:any;
beforeEach(()=>{queryClient.clear();captured=undefined;vi.stubGlobal('fetch',vi.fn(async(url:any,options?:RequestInit)=>{
 if((options?.method==='POST'||options?.method==='PATCH')&&String(url).includes('/api/purchase-invoices')){captured=JSON.parse(String(options.body));return new Response(JSON.stringify({id:99}),{status:201});}
 return new Response('[]',{status:200});
}));});
afterEach(()=>{queryClient.clear();vi.unstubAllGlobals();});
it('lets administration choose an informational method on an embedded NC without a payment amount',async()=>{
 const user=userEvent.setup();render(<QueryClientProvider client={queryClient}><InvoiceDialog open embedded unifiedLayout initialTipo="NC-A" onClose={vi.fn()} suppliers={[{id:1,razonSocial:'Proveedor prueba',condicionIva:'responsable_inscripto'}] as any} accounts={[]}/></QueryClientProvider>);
 await user.click(screen.getByTestId('select-supplier'));await user.click(await screen.findByText('Proveedor prueba'));
 await user.type(screen.getByTestId('input-numero-comprobante'),'12345');await user.type(screen.getByTestId('input-neto-line-0'),'100');
 await user.click(screen.getByTestId('select-forma-pago-informativa'));await user.click(await screen.findByRole('option',{name:'Transferencia'}));
 expect(screen.queryByTestId('input-monto-pagado-ahora')).not.toBeInTheDocument();
 expect(screen.getByText(/Dato informativo. No registra pagos/)).toBeInTheDocument();
 await user.click(screen.getByTestId('btn-submit-invoice'));await waitFor(()=>expect(captured).toBeTruthy());
 expect(captured).toMatchObject({tipoComprobante:'NC-A',formaPagoInformativa:'transferencia',condicionPago:'cuenta_corriente',formasPago:[]});
});

it('loads an existing NC informational method and submits its correction without payment fields',async()=>{
 const user=userEvent.setup();render(<QueryClientProvider client={queryClient}><InvoiceDialog open embedded unifiedLayout onClose={vi.fn()} editingInvoice={{id:99,tipoComprobante:'NC-A',supplierId:1,numeroComprobante:'12345',fechaEmision:'2026-11-11',montoNeto:'100',montoIva21:'21',montoIva105:'0',montoIva27:'0',condicionPago:'cuenta_corriente',estado:'pendiente',formaPagoInformativa:'efectivo'} as any} suppliers={[{id:1,razonSocial:'Proveedor prueba',condicionIva:'responsable_inscripto'}] as any} accounts={[]}/></QueryClientProvider>);
 expect(screen.getByTestId('select-forma-pago-informativa')).toHaveTextContent('Efectivo');
 await user.click(screen.getByTestId('select-forma-pago-informativa'));await user.click(await screen.findByRole('option',{name:'Cheque'}));
 await user.click(screen.getByTestId('btn-submit-invoice'));await waitFor(()=>expect(captured).toBeTruthy());
 expect(captured.formaPagoInformativa).toBe('cheque');expect(captured.montoPagadoAhora).toBe('');
});
