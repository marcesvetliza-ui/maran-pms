import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const {apiRequest}=vi.hoisted(()=>({apiRequest:vi.fn()}));
vi.mock('@/lib/queryClient',async()=>({...await vi.importActual('@/lib/queryClient'),apiRequest}));
import {ClosedReservationBilling} from './closed-reservation-billing';
let client:QueryClient,proof:any;
const base=()=>({original:{id:1,tipo_comprobante:'FB',punto_venta:1,numero:10,monto_total:'121',cliente_razon_social:'Original',cliente_condicion_iva:'Consumidor Final'},stage:'credit',sourceIds:['accommodation'],sourceAmounts:{accommodation:121},items:[{sourceId:'accommodation',descripcion:'Estadía original',precioUnitario:121}],blocked:null});
beforeEach(()=>{vi.clearAllMocks();proof=base();client=new QueryClient({defaultOptions:{queries:{retry:false}}});vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({invoices:[proof]}),{status:200})));apiRequest.mockImplementation(async(_method,path)=>{if(path.endsWith('nota-credito'))proof={...proof,stage:'reissue',nc:{id:2,tipo_comprobante:'NCB',punto_venta:1,numero:1}};else proof={...proof,stage:'completed',replacement:{id:3,tipo_comprobante:'FB',punto_venta:1,numero:11,estado:'emitida'}};return new Response(JSON.stringify({id:2}),{status:200});});});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
async function mount(){render(<QueryClientProvider client={client}><ClosedReservationBilling reservationId="closed"/></QueryClientProvider>);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Corregir facturación'}));await user.click(await screen.findByRole('button',{name:'Elegir'}));return user;}
it('requires a total NC before enabling a prefilled replacement and never submits a new payment',async()=>{
 const user=await mount();expect(screen.queryByRole('button',{name:'Confirmar nueva factura'})).not.toBeInTheDocument();await user.type(screen.getByLabelText('Motivo de corrección'),'Razón social incorrecta');await user.click(screen.getByRole('button',{name:'Confirmar NC total'}));
 await screen.findByRole('button',{name:'Confirmar nueva factura'});expect(apiRequest).toHaveBeenLastCalledWith('POST','/api/billing/invoices/1/nota-credito',{closedReservationCorrection:'closed',motivo:'Razón social incorrecta',items:[{sourceId:'accommodation',amount:121}]});
 expect(screen.getByLabelText('Razón social')).toHaveValue('Original');await user.clear(screen.getByLabelText('Razón social'));await user.type(screen.getByLabelText('Razón social'),'Corregida');await user.type(screen.getByLabelText('Motivo de corrección'),'Reemitir a destinatario correcto');await user.click(screen.getByRole('button',{name:'Confirmar nueva factura'}));
 await screen.findByText('Esta factura ya tiene un reemplazo registrado.');const body=apiRequest.mock.calls[1][2];expect(body.cliente.razonSocial).toBe('Corregida');expect(body).not.toHaveProperty('cashArea');expect(body).not.toHaveProperty('paymentId');expect(body).not.toHaveProperty('items');
 expect(screen.getByRole('link',{name:/NC:/})).toHaveAttribute('href','/api/billing/invoices/2/pdf');expect(screen.getByRole('link',{name:/Reemplazo:/})).toHaveAttribute('href','/api/billing/invoices/3/pdf');
});
it('shows a historical proof failure and leaves that invoice disabled',async()=>{
 proof={...base(),blocked:'Sin vínculo seguro por concepto'};render(<QueryClientProvider client={client}><ClosedReservationBilling reservationId="closed"/></QueryClientProvider>);await userEvent.setup().click(screen.getByRole('button',{name:'Corregir facturación'}));expect(await screen.findByText('Sin vínculo seguro por concepto')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Elegir'})).toBeDisabled();expect(apiRequest).not.toHaveBeenCalled();
});
it('cancels without emitting any document',async()=>{const user=await mount();await user.click(screen.getByRole('button',{name:'Cerrar'}));expect(apiRequest).not.toHaveBeenCalled();});
it('shows the CC credit and requires confirmation of the replacement account',async()=>{
 proof={...base(),stage:'reissue',account:{entityType:'company',entityId:'company1',name:'Empresa original',amount:121},nc:{id:2,tipo_comprobante:'NCB',punto_venta:1,numero:1}};
 client.setQueryData(['/api/companies'],[{id:'company1',razonSocial:'Empresa original',cuilCuit:'30700000001'},{id:'company2',razonSocial:'Empresa nueva',cuilCuit:'30700000002'}]);
 client.setQueryData(['/api/agencies'],[]);
 const user=await mount();
 expect(screen.getByText(/La NC acredita/)).toHaveTextContent('Empresa original');
 await user.type(screen.getByLabelText('Motivo de corrección'),'Cambiar razón social');
 const button=screen.getByRole('button',{name:'Confirmar nueva factura'});
 expect(button).toBeDisabled();
 await user.selectOptions(screen.getByLabelText('Cuenta corriente destinataria'),'company2');
 await user.click(screen.getByRole('checkbox'));
 expect(screen.getByRole('checkbox')).toBeChecked();
 expect(screen.getByLabelText('Cuenta corriente destinataria')).toHaveValue('company2');
 expect(screen.getByLabelText('Motivo de corrección')).toHaveValue('Cambiar razón social');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar nueva factura'})).toBeEnabled());await user.click(screen.getByRole('button',{name:'Confirmar nueva factura'}));
 expect(apiRequest).toHaveBeenLastCalledWith('POST','/api/reservations/closed/billing-corrections/1/reissue',expect.objectContaining({accountTarget:{entityType:'company',entityId:'company2'},confirmAccountTarget:true}));
});
