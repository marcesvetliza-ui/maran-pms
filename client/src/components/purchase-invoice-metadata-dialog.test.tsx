import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import {PurchaseInvoiceMetadataDialog} from './purchase-invoice-metadata-dialog';
const invoice={id:42,tipoComprobante:'FACT-A',numeroComprobante:'00300500',puntoVenta:'00219',fechaEmision:'2026-10-26',periodo:'10/2026',proveedorNombre:'PALADINI SA',montoTotal:'201731.64',metadataVersion:'2026-11-11 10:00:00.123456'};
afterEach(()=>{queryClient.clear();vi.unstubAllGlobals();});
it('shows immutable totals and sends only corrected metadata after a reason is entered',async()=>{
 let body:any,url:any;const close=vi.fn();vi.stubGlobal('fetch',vi.fn(async(input:any,options:any)=>{url=input;body=JSON.parse(options.body);return new Response('{}',{status:200});}));
 render(<QueryClientProvider client={queryClient}><PurchaseInvoiceMetadataDialog invoice={invoice} onClose={close}/></QueryClientProvider>);const user=userEvent.setup();
 expect(screen.getByText(/201.731,64/)).toBeInTheDocument();expect(screen.getAllByRole('textbox')).toHaveLength(4);
 expect(screen.getByRole('button',{name:'Guardar corrección'})).toBeDisabled();
 await user.clear(screen.getByLabelText('Número de comprobante'));await user.type(screen.getByLabelText('Número de comprobante'),'00300501');await user.type(screen.getByLabelText('Motivo de la corrección'),'Error al transcribir el número');
 await user.click(screen.getByRole('button',{name:'Guardar corrección'}));await waitFor(()=>expect(close).toHaveBeenCalled());
 expect(url).toBe('/api/purchase-invoices/42/metadata');expect(body).toEqual({puntoVenta:'00219',numeroComprobante:'00300501',fechaEmision:'2026-10-26',observaciones:'',motivo:'Error al transcribir el número',expectedVersion:invoice.metadataVersion});
});
it('retains the correction and displays a stale or duplicate conflict without closing',async()=>{
 const close=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'El comprobante cambió. Actualizá la pantalla.'}),{status:409})));
 render(<QueryClientProvider client={queryClient}><PurchaseInvoiceMetadataDialog invoice={invoice} onClose={close}/></QueryClientProvider>);const user=userEvent.setup();await user.type(screen.getByLabelText('Motivo de la corrección'),'Revisar número');await user.click(screen.getByRole('button',{name:'Guardar corrección'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('El comprobante cambió');expect(close).not.toHaveBeenCalled();
});

it('preserves an unspecified informational payment method when correcting an old paid NC',async()=>{
 let body:any;vi.stubGlobal('fetch',vi.fn(async(_url:any,options:any)=>{body=JSON.parse(options.body);return new Response('{}',{status:200});}));
 render(<QueryClientProvider client={queryClient}><PurchaseInvoiceMetadataDialog invoice={{...invoice,tipoComprobante:'NC-A',formaPagoInformativa:null}} onClose={vi.fn()}/></QueryClientProvider>);const user=userEvent.setup();
 expect(screen.getByRole('combobox',{name:'Forma de pago informativa'})).toHaveTextContent('Sin informar');
 await user.type(screen.getByLabelText('Motivo de la corrección'),'Corregir observaciones');await user.click(screen.getByRole('button',{name:'Guardar corrección'}));await waitFor(()=>expect(body).toBeTruthy());expect(body.formaPagoInformativa).toBeNull();
});
