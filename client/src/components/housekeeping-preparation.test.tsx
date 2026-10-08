import {describe,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PreparationBadge,HousekeepingPreparationControl} from './housekeeping-preparation';
import {apiRequest} from '@/lib/queryClient';
vi.mock('@/lib/queryClient',()=>({apiRequest:vi.fn(),queryClient:{invalidateQueries:vi.fn()}}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
describe('aviso visible de preparación',()=>{
 it('en una celda corta muestra el símbolo y permite leer el motivo al tocarlo',async()=>{
  const user=userEvent.setup();render(<PreparationBadge compact preparation={{roomId:'1',state:'prepared',note:'Cuna preparada',markedAt:'ahora',markedBy:'Ama de llaves'}} />);
  await user.click(screen.getByRole('button',{name:/NO MOVER/}));expect(screen.getByRole('dialog')).toHaveTextContent('Cuna preparada');expect(screen.getByRole('heading',{name:'NO MOVER'})).toBeInTheDocument();
 });
 it('el nuevo destino muestra revisar preparación, sin afirmar que está listo',()=>{
  render(<PreparationBadge preparation={{roomId:'2',state:'review',note:'Cuna',markedAt:'ahora',markedBy:'HK'}} />);expect(screen.getByRole('button',{name:/REVISAR PREPARACIÓN/})).toBeInTheDocument();
 });
 it('marca la reserva elegida con nota y ofrece quitar el aviso explícitamente',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});client.setQueryData(['/api/housekeeping/preparations'],[{id:'res1',room_id:'1',guest_name:'Pérez',check_in_date:'2027-01-01',reservation_code:'RES1',housekeeping_preparation:{state:'prepared',note:'Cuna'}}]);vi.mocked(apiRequest).mockResolvedValue(new Response('{}'));
  const user=userEvent.setup();render(<QueryClientProvider client={client}><HousekeepingPreparationControl roomId="1" roomNumber="301" /></QueryClientProvider>);
  await user.click(screen.getByRole('button',{name:/Limpia — No mover/}));expect(screen.getByRole('button',{name:'Quitar aviso de no mover'})).toBeInTheDocument();await user.clear(screen.getByLabelText('Pedido especial (opcional)'));await user.type(screen.getByLabelText('Pedido especial (opcional)'),'Almohadas especiales');await user.click(screen.getByRole('button',{name:'Marcar limpia — No mover'}));await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('PUT','/api/housekeeping/room/1/preparation',{reservationId:'res1',action:'mark',note:'Almohadas especiales'}));client.clear();
 });
});
