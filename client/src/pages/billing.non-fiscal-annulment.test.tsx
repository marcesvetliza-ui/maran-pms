import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
const toast=vi.fn();
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast,toasts:[],dismiss:vi.fn()})}));
const {default:BillingPage}=await import('./billing');
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const voucher={id:14,tipo_comprobante:'cierre_habitacion',punto_venta:5,numero:14,monto_total:'364600',estado:'emitida',canAnnulNonFiscal:true};
function setup(options:{allowed?:boolean;fail?:boolean;fiscal?:boolean}={}){
 let eliminated=false;
 const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.startsWith('/api/billing/invoices?'))return response([{...voucher,canAnnulNonFiscal:options.allowed!==false,...(options.fiscal?{tipo_comprobante:'FB'}:{}),...(eliminated?{estado:'anulada',canAnnulNonFiscal:false,non_fiscal_annulment:{reason:'Duplicado',actor:'Admin'}}:{})}]);
  if(url==='/api/billing/config')return response({arcaAmbiente:'homologacion'});
  if(url==='/api/billing/invoices/14/annul-non-fiscal'&&init?.method==='POST'){
   if(options.fail)return response({error:'No se pudo registrar en Caja'},409);
   eliminated=true;return response({annulled:true});
  }
  return response([]);
 });
 vi.stubGlobal('fetch',fetch);render(<QueryClientProvider client={queryClient}><BillingPage/></QueryClientProvider>);return fetch;
}
beforeEach(()=>{queryClient.clear();toast.mockReset();});afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('Eliminar voucher conservando el cobro',()=>{
 it('exige motivo y registra solo la baja seleccionada; muestra estado/motivo después de guardar',async()=>{
  const fetch=setup();const user=userEvent.setup();await user.click(await screen.findByTestId('btn-annul-non-fiscal-14'));
  expect(screen.getByTestId('confirm-annul-non-fiscal')).toBeDisabled();
  await user.type(screen.getByTestId('non-fiscal-annul-reason'),'Duplicado');
  await user.click(screen.getByTestId('confirm-annul-non-fiscal'));
  await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:'Comprobante eliminado'})));
  const posts=fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(posts).toHaveLength(1);
  expect(posts[0][0]).toBe('/api/billing/invoices/14/annul-non-fiscal');expect(JSON.parse(String(posts[0][1]?.body))).toEqual({reason:'Duplicado'});
  expect(await screen.findByText('Eliminado')).toBeInTheDocument();expect(screen.getByText('Duplicado')).toBeInTheDocument();
  expect(screen.queryByTestId('btn-annul-non-fiscal-14')).not.toBeInTheDocument();
 });
 it('un error conserva el comprobante y el motivo para corregirlo',async()=>{
  setup({fail:true});const user=userEvent.setup();await user.click(await screen.findByTestId('btn-annul-non-fiscal-14'));
  await user.type(screen.getByTestId('non-fiscal-annul-reason'),'Error de carga');await user.click(screen.getByTestId('confirm-annul-non-fiscal'));
  await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:'No se pudo eliminar el comprobante'})));
  expect(screen.getByTestId('non-fiscal-annul-reason')).toHaveValue('Error de carga');expect(screen.getByTestId('btn-annul-non-fiscal-14')).toBeInTheDocument();
 });
 it.each([{allowed:false},{fiscal:true}])('no ofrece la acción sin permiso o para facturas fiscales (%j)',async options=>{
  const fetch=setup(options);await screen.findByTestId('invoice-actions-14');expect(screen.queryByTestId('btn-annul-non-fiscal-14')).not.toBeInTheDocument();expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
 });
});
