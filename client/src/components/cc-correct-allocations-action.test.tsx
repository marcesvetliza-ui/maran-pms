import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({allowed:true}));
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>state.allowed})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/queryClient',()=>({apiRequest:vi.fn(),queryClient:{invalidateQueries:vi.fn()}}));
import { apiRequest } from '@/lib/queryClient';
import { CcCorrectAllocationsAction } from './cc-correct-allocations-action';
const data={receiptId:'receipt',receiptNumber:'REC-2026-0018',amount:'110.00',version:'a'.repeat(64),unallocated:'0.00',current:[{cargoId:'new',amount:'110.00',description:'Factura nueva',date:'2026-11-16'}],charges:[{id:'old',description:'Factura anterior',date:'2026-10-01',reference:'FC001',available:'150.00',applied:'0.00'},{id:'new',description:'Factura nueva',date:'2026-11-16',reference:'FC002',available:'110.00',applied:'110.00'}],history:[]};
const movement={id:'receipt',type:'pago'};
function mount(m=movement){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<QueryClientProvider client={client}><CcCorrectAllocationsAction movement={m} entityLabel="ENERSA"/></QueryClientProvider>);}
afterEach(()=>{cleanup();state.allowed=true;vi.resetAllMocks();});
function mock(){vi.mocked(apiRequest).mockImplementation(async(method)=>new Response(JSON.stringify(method==='GET'?data:{ok:true}),{status:200}));}
async function prepare(){const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Corregir facturas aplicadas'}));await screen.findByLabelText('Aplicar a Factura nueva');await user.click(screen.getByLabelText('Aplicar a Factura nueva'));await user.click(screen.getByLabelText('Aplicar a Factura anterior'));await user.type(screen.getByLabelText('Motivo de la corrección'),'El cobro era de facturas anteriores');return user;}
it('shows only for authorized direct receipts',()=>{state.allowed=false;mount();expect(screen.queryByRole('button')).not.toBeInTheDocument();});
it('requires explicit review and reason, then posts only the new allocation without changing receipt or cash',async()=>{
 mock();mount();const user=await prepare();expect(screen.getByRole('button',{name:'Revisar corrección'})).toBeEnabled();expect(vi.mocked(apiRequest).mock.calls.every(([method])=>method==='GET')).toBe(true);
 await user.click(screen.getByRole('button',{name:'Revisar corrección'}));expect(screen.getByText('Revisá la nueva aplicación')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Confirmar corrección'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 expect(apiRequest).toHaveBeenCalledWith('POST','/api/account-movements/receipt/allocation-correction',{requestId:expect.any(String),version:data.version,reason:'El cobro era de facturas anteriores',allocations:[{cargoId:'old',amount:'110.00'}]});
});
it('blocks unchanged allocations and excess amounts',async()=>{
 mock();mount();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Corregir facturas aplicadas'}));await screen.findByLabelText('Aplicar a Factura nueva');expect(screen.getByRole('button',{name:'Revisar corrección'})).toBeDisabled();
 await user.click(screen.getByLabelText('Aplicar a Factura nueva'));await user.click(screen.getByLabelText('Aplicar a Factura anterior'));await user.type(screen.getByLabelText('Motivo de la corrección'),'Revisar cobro');
 const input=screen.getByLabelText('Importe para Factura anterior');await user.clear(input);await user.type(input,'151,00');expect(screen.getByRole('button',{name:'Revisar corrección'})).toBeDisabled();
 expect(screen.getByRole('alert')).toHaveTextContent('no superar');expect(vi.mocked(apiRequest).mock.calls.every(([method])=>method==='GET')).toBe(true);
});
it('retains the exact request identity when retrying a lost response',async()=>{
 mock();mount();const user=await prepare();await user.click(screen.getByRole('button',{name:'Revisar corrección'}));
 vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Respuesta perdida'));await user.click(screen.getByRole('button',{name:'Confirmar corrección'}));await screen.findByRole('alert');
 const first=vi.mocked(apiRequest).mock.calls.find(([method])=>method==='POST')!;
 await user.click(screen.getByRole('button',{name:'Confirmar corrección'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 const posts=vi.mocked(apiRequest).mock.calls.filter(([method])=>method==='POST');expect(posts).toHaveLength(2);expect(posts[1]).toEqual(first);
});
it('does not offer correction on voided or linked receipts',()=>{mount({...movement,reservationId:'reservation'} as any);expect(screen.queryByRole('button')).not.toBeInTheDocument();});

it('allows clearing the current selection to leave an explicitly reviewed payment on account',async()=>{
 mock();mount();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Corregir facturas aplicadas'}));await screen.findByLabelText('Aplicar a Factura nueva');await user.click(screen.getByRole('button',{name:'Quitar selección'}));await user.type(screen.getByLabelText('Motivo de la corrección'),'Pago a cuenta pendiente de identificar');await user.click(screen.getByRole('button',{name:'Revisar corrección'}));expect(screen.getByText('El recibo quedará como pago a cuenta, sin comprobantes aplicados.')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Confirmar corrección'}));await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('POST',expect.any(String),expect.objectContaining({allocations:[]})));
});
