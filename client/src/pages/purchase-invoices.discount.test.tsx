import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import {InvoiceDialog} from './purchase-invoices';
import {applyPurchaseDiscount} from '@shared/purchaseInvoiceDiscount';
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
let writes:any[]=[];
beforeEach(()=>{queryClient.clear();writes=[];vi.stubGlobal('fetch',vi.fn(async(_url:any,options:any={})=>{if(options.method==='POST'||options.method==='PATCH'){writes.push(JSON.parse(options.body));return new Response(JSON.stringify({id:1}),{status:201});}return new Response(JSON.stringify([]),{status:200});}));});
afterEach(()=>vi.unstubAllGlobals());
const supplier={id:1,razonSocial:'Proveedor Descuentos SA',cuit:'30-11111111-1',condicionIva:'Responsable Inscripto'};
function mount(invoice?:any){render(<QueryClientProvider client={queryClient}><InvoiceDialog open onClose={vi.fn()} suppliers={[supplier]} accounts={[]} embedded unifiedLayout editingInvoice={invoice}/></QueryClientProvider>);}
async function fill(type='Factura A'){
 const user=userEvent.setup();mount();
 await user.click(screen.getByTestId('select-supplier'));await user.click(await screen.findByText('Proveedor Descuentos SA'));if(type!=='Factura A'){await user.click(screen.getByTestId('select-tipo-comprobante'));await user.click(await screen.findByRole('option',{name:type}));}await user.type(screen.getByTestId('input-numero-comprobante'),'123');await user.type(screen.getByTestId('input-neto-line-0'),type==='Factura B'?'121':'100');await user.type(screen.getByLabelText('Descripción del descuento'),'Bonificación');return user;
}
it('A calcula IVA reducido y permite reemplazar el porcentaje por un importe',async()=>{
 const user=await fill();await user.selectOptions(screen.getByLabelText('Tipo de descuento'),'porcentaje');await user.type(screen.getByLabelText('Porcentaje de descuento'),'10');expect((await screen.findAllByText('$108,90')).length).toBeGreaterThan(0);expect(screen.getByLabelText('Importe de descuento')).toHaveValue(10);
 await user.clear(screen.getByLabelText('Importe de descuento'));await user.type(screen.getByLabelText('Importe de descuento'),'5');expect(screen.getByLabelText('Tipo de descuento')).toHaveValue('importe');expect(await screen.findByText('$114,95')).toBeInTheDocument();await user.click(screen.getByTestId('btn-submit-invoice'));await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({montoNeto:'100.00',montoIva21:'21.00',descuentoImporte:'5',descuentoTipo:'importe'});
});
it('B muestra solamente el descuento final informado',async()=>{const user=await fill('Factura B');expect(screen.queryByLabelText('Tipo de descuento')).toBeNull();await user.type(screen.getByLabelText('Importe de descuento'),'12.10');expect((await screen.findAllByText('$108,90')).length).toBeGreaterThan(0);});
it('C acepta porcentaje sin IVA',async()=>{const user=await fill('Factura C');await user.selectOptions(screen.getByLabelText('Tipo de descuento'),'porcentaje');await user.type(screen.getByLabelText('Porcentaje de descuento'),'10');expect((await screen.findAllByText('$90,00')).length).toBeGreaterThan(0);});
it('editar recupera el subtotal original y conserva el mismo descuento',async()=>{
 const input={tipoComprobante:'FACT-A',montoNeto:'100',montoIva21:'21',descuentoDescripcion:'Bonificación',descuentoTipo:'porcentaje',descuentoPorcentaje:'10'};const discounted=applyPurchaseDiscount(input);mount({...discounted,id:1,numeroComprobante:'123',fechaEmision:'2026-10-07',supplierId:1,proveedorNombre:'Proveedor',estado:'pendiente'});
 await waitFor(()=>expect(screen.getByTestId('input-neto-line-0')).toHaveValue(100));expect(screen.getByLabelText('Porcentaje de descuento')).toHaveValue(10);expect(screen.getByText('$108,90')).toBeInTheDocument();
});
