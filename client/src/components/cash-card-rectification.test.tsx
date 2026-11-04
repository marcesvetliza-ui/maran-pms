import {vi,it,expect,beforeEach} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/lib/queryClient',()=>({apiRequest:api,parseApiError:(e:Error)=>e.message}));
import {CashCardRectification} from './cash-card-rectification';
const preview={previewHash:'a'.repeat(64),shiftNumber:12,closedAt:'2026-11-04T01:14:00Z',revision:1,amount:163500,oldMethod:'tarjeta_credito',newMethod:'tarjeta_debito',before:{tarjeta_credito:16350000,tarjeta_debito:0},after:{tarjeta_credito:0,tarjeta_debito:16350000},reason:'Cupón verificado',evidenceRef:'Control POS'};
const saved=vi.fn();
beforeEach(()=>{cleanup();sessionStorage.clear();api.mockReset();saved.mockReset();});
it('requires reviewing the closing and an explicit confirmation, without auto-saving',async()=>{
 api.mockResolvedValueOnce(Response.json(preview)).mockResolvedValueOnce(Response.json({id:84}));
 render(<CashCardRectification invoiceId={84} method="tarjeta_debito" onSaved={saved}/>);
 expect(screen.queryByText('Confirmar rectificación del cierre')).toBeNull();
 await userEvent.type(screen.getByLabelText('Motivo de rectificación'),'Cupón verificado');await userEvent.type(screen.getByLabelText('Referencia de comprobación del cierre'),'Control POS');
 await userEvent.click(screen.getByText('Revisar rectificación'));
 await screen.findByText('Confirmar rectificación del cierre');expect(api).toHaveBeenCalledTimes(1);expect(saved).not.toHaveBeenCalled();
 await userEvent.click(screen.getByText('Confirmar rectificación del cierre'));await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
 expect(api.mock.calls[1][2]).toMatchObject({method:'tarjeta_debito',previewHash:preview.previewHash,reason:preview.reason,evidenceRef:preview.evidenceRef,operationId:expect.any(String)});
});
it('retains the same operation and method when recovering a lost response',async()=>{
 const body={method:'tarjeta_debito',reason:preview.reason,evidenceRef:preview.evidenceRef,previewHash:preview.previewHash,operationId:crypto.randomUUID()};sessionStorage.setItem('cash-card-rectification:84',JSON.stringify(body));
 api.mockRejectedValueOnce(new Error('Conexión interrumpida')).mockResolvedValueOnce(Response.json({id:84}));
 render(<CashCardRectification invoiceId={84} method="tarjeta_credito" onSaved={saved}/>);
 await userEvent.click(screen.getByText('Reintentar la misma rectificación'));await screen.findByRole('alert');
 await userEvent.click(screen.getByText('Reintentar la misma rectificación'));await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(api.mock.calls[0][2]).toEqual(body);expect(api.mock.calls[1][2]).toEqual(body);
});
