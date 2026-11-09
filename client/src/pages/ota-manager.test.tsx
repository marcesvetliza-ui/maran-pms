import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import OtaManager from './ota-manager';
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>false})}));
let access:any,created:boolean,payload:any;
beforeEach(()=>{
 queryClient.clear();created=false;payload=undefined;access={owner:true,entry:true,status:true,read:true,config:true,bookings:true,sync:true};
 vi.stubGlobal('fetch',vi.fn(async(input:any,init?:RequestInit)=>{
  const url=String(input),response=(data:any)=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  if(init?.method==='POST'){payload=JSON.parse(String(init.body));created=true;return response({id:'conn',...payload,isActive:false});}
  if(url==='/api/channex/access')return response(access);
  if(url==='/api/channex/runtime')return response({credentialsStorageReady:true,productionAriEnabled:false,productionInboundEnabled:false});
  if(url==='/api/channex/access/users')return response({users:[],grants:[]});
  if(url==='/api/channex/connections')return response(created?[{id:'conn',label:'Maran',environment:'real',isActive:false}]:[]);
  if(url.includes('/ari'))return response({settings:{floor:null,currency:'ARS',enabled:false},dispatchEnabled:false,rooms:[],summary:[],events:[]});
  if(url.endsWith('/inbound'))return response({serverEnabled:false,settings:{enabled:false,has_token:false},revisions:[]});
  return response([]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
it('gives admin all sections and saves only an inactive production connection with a masked credential',async()=>{
 render(<QueryClientProvider client={queryClient}><OtaManager/></QueryClientProvider>);const user=userEvent.setup();
 expect(await screen.findByRole('tab',{name:'Configuración y mapeos'})).toBeInTheDocument();expect(screen.getByRole('tab',{name:'Permisos'})).toBeInTheDocument();
 await user.click(screen.getByText('Cuenta y credenciales de Channex'));
 await user.type(screen.getByLabelText('Property ID de producción'),'real-property');const key=screen.getByLabelText('Clave API de producción');expect(key).toHaveAttribute('type','password');await user.type(key,'test-only-key');
 await user.click(screen.getByRole('button',{name:'Guardar conexión desactivada'}));
 await waitFor(()=>expect(payload).toMatchObject({environment:'real',baseUrl:'https://app.channex.io/api/v1',channexPropertyId:'real-property',isActive:false}));
 expect(await screen.findByRole('button',{name:'Activar conexión revisada'})).toBeDisabled();
});
it('hides configuration and permission management from an authorized read-only user',async()=>{
 access={owner:false,entry:true,status:false,read:true,config:false,bookings:false,sync:false};created=true;
 render(<QueryClientProvider client={queryClient}><OtaManager/></QueryClientProvider>);
 await screen.findByRole('tab',{name:'Reservas recibidas'});expect(screen.queryByRole('tab',{name:'Configuración y mapeos'})).not.toBeInTheDocument();expect(screen.queryByRole('tab',{name:'Permisos'})).not.toBeInTheDocument();
 expect(screen.queryByRole('tab',{name:'Estado y sincronizaciones'})).not.toBeInTheDocument();
 await screen.findByText(/Recepción de reservas de Channex/);
 expect(screen.queryByRole('button',{name:/Pausar recepción|Habilitar recepción|acceso del webhook/})).not.toBeInTheDocument();expect(screen.queryByLabelText(/Piso incluido/)).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Sincronización completa de recuperación'})).not.toBeInTheDocument();
});
it('does not load connection data for a user without module access',async()=>{
 access={owner:false,entry:false,status:false,read:false,config:false,bookings:false,sync:false};render(<QueryClientProvider client={queryClient}><OtaManager/></QueryClientProvider>);
 await screen.findByText(/No tenés acceso a Canales OTAs/);expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url)==='/api/channex/connections')).toBe(false);
});

it.each(['manager','jefe_recepcion','comercial'])('shows daily OTA controls without permissions management for %s',async()=>{
 access={owner:false,entry:true,status:true,read:true,config:true,bookings:true,sync:true};
 render(<QueryClientProvider client={queryClient}><OtaManager/></QueryClientProvider>);
 expect(await screen.findByRole('tab',{name:'Configuración y mapeos'})).toBeInTheDocument();
 expect(screen.getByRole('tab',{name:'Estado y sincronizaciones'})).toBeInTheDocument();
 expect(screen.getByRole('tab',{name:'Reservas recibidas'})).toBeInTheDocument();
 expect(screen.queryByRole('tab',{name:'Permisos'})).not.toBeInTheDocument();
});
