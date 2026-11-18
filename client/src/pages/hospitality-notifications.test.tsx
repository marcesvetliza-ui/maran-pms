import {render,screen,cleanup} from '@testing-library/react';
import {QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import HospitalityPage from './hospitality';
const route=vi.hoisted(()=>({search:''}));
vi.mock('wouter',async original=>({...await original<typeof import('wouter')>(),useSearch:()=>route.search}));
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>false,user:{username:'Synthetic Operator'}})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
beforeEach(()=>{
 queryClient.clear();
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>{
  const data=String(url).includes('/hospitality/dashboard')?{stats:{},pendingAlerts:[{id:'alert-1',alertMessage:'Preparar cuna',targetArea:'housekeeping',priority:'normal',status:'pending',roomNumber:'802',guestName:'Pérez Ana',checkInDate:'2034-01-16'}]}:String(url).includes('/hospitality/stay-notes/active')?[{id:'note-1',title:'Preparar desayuno',category:'alimentacion',priority:'normal',visibleTo:['restaurant'],isResolved:false}]:[];
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
it('opens and highlights the preparation task without resolving it',async()=>{
 route.search='?tab=dashboard&alertId=alert-1';render(<QueryClientProvider client={queryClient}><HospitalityPage/></QueryClientProvider>);
 expect(await screen.findByTestId('alert-alert-1')).toHaveClass('ring-2');expect(screen.getByText('Preparar cuna')).toBeInTheDocument();expect(screen.getByRole('tab',{name:'Dashboard'})).toHaveAttribute('aria-selected','true');
 expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
});
it('opens and highlights the exact stay note from its notification',async()=>{
 route.search='?tab=stay-notes&noteId=note-1';render(<QueryClientProvider client={queryClient}><HospitalityPage/></QueryClientProvider>);
 expect(await screen.findByTestId('note-note-1')).toHaveClass('ring-2');expect(screen.getByText('Preparar desayuno')).toBeInTheDocument();expect(screen.getByRole('tab',{name:'Notas de Estadía'})).toHaveAttribute('aria-selected','true');
});
