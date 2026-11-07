import React,{useState} from 'react';
import {render,screen,waitFor,fireEvent} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
import {useSessionPermissions} from './use-session-permissions';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/queryClient',()=>({apiRequest:request}));
const user={id:'reception-1',role:'reception'};
function Reservation(){const [value,setValue]=useState('');return <input aria-label="Notas de reserva" value={value} onChange={e=>setValue(e.target.value)}/>;}
function Harness({identity=user}:{identity?:typeof user}){const p=useSessionPermissions(identity);return p.ready?<><Reservation/><span>{p.resourceKeys.join(',')}</span></>:<p>{p.isError?'Reintentar carga':'Cargando'}</p>;}
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return {client,view:render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>)};}
afterEach(()=>vi.clearAllMocks());
it('preserves an open reservation and its draft after a failed background permissions refresh',async()=>{
 request.mockResolvedValueOnce({json:async()=>({role:'reception',resourceKeys:['sidebar:/reservations']})});
 const {client}=setup();const input=await screen.findByLabelText('Notas de reserva');fireEvent.change(input,{target:{value:'Sin guardar'}});
 request.mockRejectedValueOnce(new Error('Network unavailable'));
 await client.refetchQueries({queryKey:['/api/permissions/mine']});
 expect(screen.getByLabelText('Notas de reserva')).toBe(input);expect(input).toHaveValue('Sin guardar');expect(screen.queryByText('Cargando')).not.toBeInTheDocument();
});
it('does not treat an initial failed request as usable permissions',async()=>{
 request.mockRejectedValueOnce(new Error('Network unavailable'));setup();expect(await screen.findByText('Reintentar carga')).toBeInTheDocument();expect(screen.queryByLabelText('Notas de reserva')).not.toBeInTheDocument();
});
it('does not reuse the previous user permissions and applies a successful revocation',async()=>{
 request.mockResolvedValueOnce({json:async()=>({role:'reception',resourceKeys:['sidebar:/reservations']})});
 const {client,view}=setup();await screen.findByLabelText('Notas de reserva');
 request.mockResolvedValueOnce({json:async()=>({role:'reception',resourceKeys:[]})});await client.refetchQueries({queryKey:['/api/permissions/mine']});
 await waitFor(()=>expect(screen.queryByText('sidebar:/reservations')).not.toBeInTheDocument());
 request.mockImplementationOnce(()=>new Promise(()=>{}));
 view.rerender(<QueryClientProvider client={client}><Harness identity={{id:'other',role:'reception'}}/></QueryClientProvider>);
 expect(screen.getByText('Cargando')).toBeInTheDocument();expect(screen.queryByLabelText('Notas de reserva')).not.toBeInTheDocument();
});
