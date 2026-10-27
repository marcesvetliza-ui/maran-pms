import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { SpaFundingConnectedPanel } from './spa-funding-connected-panel';
const scope={kind:'spa',id:'spa-connected'};
let calls:Array<{url:string;body:any}>,document:any,operation:any,covered:boolean,deny:boolean,noShift:boolean,unpaid:boolean,missingVat:boolean,emptyShifts:boolean;
let allowCash = true;
vi.mock("@/App", () => ({ useAuth: () => ({ hasPermission: (key:string) => allowCash && key === "sidebar:/cash-register" }) }));
const ok=(data:unknown,status=200)=>new Response(JSON.stringify({ok:true,data}),{status});
function mount(canWrite=true,onCompleted=vi.fn(),onRoomTransfer=vi.fn()) {
 return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><SpaFundingConnectedPanel accountId={scope.id} userId='u1' canWrite={canWrite} onCompleted={onCompleted} onRoomTransfer={onRoomTransfer}/></QueryClientProvider>);
}
function op(status:string){return {id:operation?.id,scope,status,canAuthorize:status==='reserved',canFinalize:status==='authorized_pending_link',canResume:status==='fiscal_unknown',fundsRetained:status!=='applied',invoice:null,result:null,lastError:null};}
beforeEach(()=>{
 sessionStorage.clear();calls=[];document=null;operation=null;covered=false;deny=false;noShift=false;unpaid=false;missingVat=false;emptyShifts=false;allowCash=true;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body});
  if(url.endsWith('/account'))return ok({id:scope.id,chargeVersion:'a'.repeat(64),preferences:null,guestName:'Cliente SPA',status:'open',totalCents:9500000,paidCents:unpaid?0:covered?9500000:500000,balanceCents:unpaid?9500000:covered?0:9000000,readOnly:false,canInvoice:true,transferred:null,
   items:[{id:'item',description:'Masaje SPA',quantity:1,unitPrice:95000,subtotal:95000,itemType:'treatment',inventoryItemId:null}],payments:[],movements:[],events:[],operations:[],invoices:[]});
  if(url.endsWith('/prefactura-context'))return ok({environment:'homologacion',point:5,voucherPoint:23,companies:[{id:'company',name:'Empresa RI',cuit:'20301234567',vatCondition:'responsable_inscripto',address:'Domicilio empresa'}]});
  if(url.endsWith('/recipient'))return ok({guestId:'customer',kind:'guest',firstName:'Cliente',lastName:'SPA',documentType:'DNI',documentNumber:'30111222',vatCondition:missingVat?null:'consumidor_final',cuit:'',address:'Domicilio',editable:true});
  if(url.endsWith('/collection-shifts'))return noShift?new Response('Unavailable',{status:503}):ok(emptyShifts?[]:[{id:'shift',label:'Mi caja SPA'}]);
  if(url.includes('/scopes/'))return ok({scope,debtCents:unpaid?9500000:covered?0:9000000,receipts:unpaid?[]:[{id:'r1',sourcePaymentId:'p1',method:'tarjeta_debito',amountCents:covered?9500000:500000,appliedCents:0,heldCents:0,freeCents:covered?9500000:500000,version:1}],documents:document?[document]:[],operations:operation?[operation]:[],rectifications:[]});
  if(url.endsWith('/voucher'))return ok({invoiceId:'voucher-1',totalCents:9500000});
  if(url.endsWith('/prefactura-options'))return ok({saved:true});
  if(url.endsWith('/prepare-document')){
   if(deny)return new Response(JSON.stringify({ok:false,error:{code:'FISCAL_PREPARATION_REQUIRED',message:'Falta CUIT en la empresa.'}}),{status:409});
   const total=body.settings.discount?8550000:9500000;
   document={id:'server-doc',status:'draft',totalCents:total,snapshot:{recipient:{razonSocial:body.settings.recipientKind==='company'?'Empresa RI':'Cliente SPA'},tipo:body.settings.recipientKind==='company'?'FA':'FB'}};
   return ok({documentId:document.id,totalCents:total});
  }
  if(url.endsWith('/previews'))return ok({scope,documentId:'server-doc',previewHash:'b'.repeat(64),totalCents:document.totalCents,request:body,fundingMode:body.newCollections.length?'existing_and_new':'existing_only',paymentMethods:[...body.applications.map((a:any)=>({method:'tarjeta_debito',amountCents:a.amountCents})),...body.newCollections]});
  if(url.endsWith('/operations')){operation={id:body.operationId};operation=op('reserved');return ok(operation);}
  if(url.endsWith('/authorize')){operation=op('authorized_pending_link');return ok(operation,202);}
  if(url.endsWith('/finalize')){operation=op('applied');return ok(operation);}
  if(url.includes('/operations/'))return ok(operation);
  throw new Error('Unexpected '+url);
 }));
});
afterEach(()=>vi.unstubAllGlobals());
it('opens a source-filled prefactura without preparing, collecting or issuing automatically',async()=>{
 mount();expect(await screen.findByText(/Prefactura SPA/)).toBeInTheDocument();
 await waitFor(()=>expect(screen.getByLabelText('Razón social / Nombre')).toHaveValue('Cliente SPA'));
 expect(await screen.findByLabelText('Monto del cobro 1')).toHaveValue('90000.00');
 expect(screen.getByLabelText('Punto de venta')).toHaveValue('PV 0005 — Homologación');
 expect(calls.filter(c=>c.body)).toHaveLength(0);
 expect(screen.queryByText('Actualizar financiación')).not.toBeInTheDocument();
});
it('company, discount, two payment methods and an advance are sent in exact cents then emitted through the existing finalizer',async()=>{
 const done=vi.fn();mount(true,done);await screen.findByLabelText('Monto del cobro 1');
 await userEvent.selectOptions(screen.getByLabelText('Facturar a'),'company');await userEvent.selectOptions(screen.getByLabelText('Empresa a facturar'),'company');
 expect(screen.getByLabelText('Tipo de comprobante')).toHaveValue('FA');
 await userEvent.click(screen.getByRole('button',{name:'Agregar descuento'}));await userEvent.type(screen.getByLabelText('Motivo del descuento'),'Beneficio');
 await waitFor(()=>expect(screen.getByLabelText('Monto del cobro 1')).toHaveValue('80500.00'));
 await userEvent.clear(screen.getByLabelText('Monto del cobro 1'));await userEvent.type(screen.getByLabelText('Monto del cobro 1'),'50000');
 await userEvent.click(screen.getByRole('button',{name:'Agregar forma de pago'}));await userEvent.type(screen.getByLabelText('Monto del cobro 2'),'30500');await userEvent.selectOptions(screen.getByLabelText('Método del cobro 2'),'tarjeta_debito');
 await userEvent.type(screen.getByLabelText('Referencia / Observaciones del comprobante'),'Referencia 201');
 await userEvent.click(screen.getByRole('button',{name:'Revisar factura'}));
 expect(await screen.findByRole('button',{name:'Registrar y emitir'})).toBeEnabled();
 const prepared=calls.find(c=>c.url.endsWith('/prepare-document'))!.body;
 expect(prepared).toMatchObject({requestId:expect.any(String),expectedVersion:'a'.repeat(64),settings:{recipientKind:'company',recipientId:'company',discount:{type:'percent',value:10,reason:'Beneficio'},notes:'Referencia 201'}});
 const plan=calls.find(c=>c.url.endsWith('/previews'))!.body;
 expect(plan.applications).toEqual([{receiptId:'r1',amountCents:500000}]);expect(plan.newCollections.map((r:any)=>r.amountCents)).toEqual([5000000,3050000]);
 expect(calls.some(c=>c.url.endsWith('/operations'))).toBe(false);
 await userEvent.click(screen.getByRole('button',{name:'Registrar y emitir'}));await waitFor(()=>expect(done).toHaveBeenCalled());
 expect(calls.filter(c=>c.url.endsWith('/operations'))).toHaveLength(1);expect(calls.filter(c=>c.url.endsWith('/authorize'))).toHaveLength(1);expect(calls.filter(c=>c.url.endsWith('/finalize'))).toHaveLength(1);
});
it('rejects a mismatch in payment sums before preparing a document',async()=>{
 mount();const amount=await screen.findByLabelText('Monto del cobro 1');await userEvent.clear(amount);await userEvent.type(amount,'1');
 await userEvent.click(screen.getByRole('button',{name:'Revisar factura'}));expect(await screen.findByRole('region',{name:'Revisión del comprobante SPA'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Registrar y emitir'})).not.toBeInTheDocument();expect(calls.filter(c=>c.body)).toHaveLength(0);
});
it('a fully paid account can use its original receipts without an open cash shift',async()=>{
 covered=true;noShift=true;mount();const review=await screen.findByRole('button',{name:'Revisar factura'});
 await waitFor(()=>expect(review).toBeEnabled());await userEvent.click(review);
 await screen.findByRole('button',{name:'Registrar y emitir'});
 expect(calls.find(c=>c.url.endsWith('/previews'))!.body.newCollections).toEqual([]);
});
it('reports a specific company fiscal error without inventing a document or collecting',async()=>{
 deny=true;mount();await screen.findByLabelText('Monto del cobro 1');await userEvent.click(screen.getByRole('button',{name:'Revisar factura'}));
 expect(await screen.findByText('Falta CUIT en la empresa.')).toBeInTheDocument();expect(calls.some(c=>c.url.endsWith('/operations'))).toBe(false);
});
it('read-only roles keep the prefactura available without write controls',async()=>{
 mount(false);const review=await screen.findByRole('button',{name:'Revisar factura'});expect(review).toBeDisabled();expect(screen.getByLabelText('Facturar a')).toBeDisabled();expect(calls.filter(c=>c.body)).toHaveLength(0);
});

it('room charging saves the chosen discount first without requiring a cash shift or issuing',async()=>{
 unpaid=true;noShift=true;const transfer=vi.fn();mount(true,vi.fn(),transfer);await screen.findByText(/Prefactura SPA/);
 await userEvent.click(screen.getByRole('button',{name:'Agregar descuento'}));await userEvent.type(screen.getByLabelText('Motivo del descuento'),'Beneficio habitación');
 await userEvent.click(screen.getByRole('button',{name:'Cargar a habitación'}));
 await waitFor(()=>expect(transfer).toHaveBeenCalledOnce());
 expect(calls.find(c=>c.url.endsWith('/prefactura-options'))!.body.settings).toMatchObject({recipientKind:'client',discount:{type:'percent',value:10,reason:'Beneficio habitación'}});
 expect(calls.some(c=>c.url.endsWith('/prepare-document')||c.url.endsWith('/operations'))).toBe(false);
});

it('reviews an unpaid invoice with no open cash shift without writing or authorizing',async()=>{
 unpaid=true;noShift=true;mount();await screen.findByLabelText('Monto del cobro 1');
 await userEvent.click(screen.getByRole('button',{name:'Revisar factura'}));
 expect(await screen.findByRole('region',{name:'Revisión del comprobante SPA'})).toHaveTextContent('95.000');
 expect(screen.queryByRole('button',{name:'Registrar y emitir'})).not.toBeInTheDocument();expect(calls.filter(c=>c.body)).toHaveLength(0);
});
it('chooses a non-fiscal voucher and confirms only the outstanding collection, without fiscal requests',async()=>{
 const done=vi.fn();mount(true,done);await screen.findByLabelText('Monto del cobro 1');
 await userEvent.selectOptions(screen.getByLabelText('Tipo de comprobante'),'cierre_spa');
 await userEvent.click(screen.getByRole('button',{name:'Revisar comprobante'}));
 expect(calls.filter(c=>c.body)).toHaveLength(0);
 await userEvent.click(screen.getByRole('button',{name:'Confirmar cobro y emitir voucher'}));
 await waitFor(()=>expect(done).toHaveBeenCalledOnce());
 const request=calls.find(c=>c.url.endsWith('/voucher'))!.body;
 expect(request.settings.receiptType).toBe('cierre_spa');expect(request.newCollections).toEqual([{rowId:'new-collection',method:'efectivo',amountCents:9000000,shiftId:'shift'}]);
 expect(calls.some(c=>c.url.endsWith('/prepare-document')||c.url.endsWith('/operations')||c.url.endsWith('/authorize'))).toBe(false);
});
it('shows an incompatible fiscal type without preparing or collecting',async()=>{
 mount();await screen.findByLabelText('Monto del cobro 1');await userEvent.selectOptions(screen.getByLabelText('Tipo de comprobante'),'FA');
 await userEvent.click(screen.getByRole('button',{name:'Revisar factura'}));
 expect(await screen.findByRole('region',{name:'Revisión del comprobante SPA'})).toHaveTextContent('no corresponde');expect(calls.filter(c=>c.body)).toHaveLength(0);
});

it('shows the saved fiscal condition and a prominent actionable cash warning without issuing',async()=>{
 emptyShifts=true;mount();
 const notice=await screen.findByTestId('spa-cash-notice');
 await waitFor(()=>expect(notice).toHaveTextContent('Abrí la caja SPA'));
 expect(screen.getByRole('textbox',{name:'Condición IVA'})).toHaveValue('Consumidor final');
 const link=screen.getByRole('link',{name:'Ir a Caja'});
 expect(link).toHaveAttribute('href','/cash-register');expect(link).toHaveAttribute('target','_blank');
 expect(notice.compareDocumentPosition(screen.getByRole('combobox',{name:'Facturar a'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(calls.filter(c=>c.body)).toHaveLength(0);
});
it('does not offer cash access to an unauthorized user and does not invent missing IVA',async()=>{
 emptyShifts=true;missingVat=true;allowCash=false;mount();
 expect(await screen.findByRole('textbox',{name:'Condición IVA'})).toHaveValue('No registrada');
 await waitFor(()=>expect(screen.getAllByText(/Falta una condición IVA válida/).length).toBeGreaterThan(0));
 expect(screen.queryByRole('link',{name:'Ir a Caja'})).not.toBeInTheDocument();
 expect(calls.filter(c=>c.body)).toHaveLength(0);
});
