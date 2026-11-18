import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import OtaManager from './ota-manager';
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>false})}));
let access:any,created:boolean,payload:any,roomMappings:any[],planMappings:any[];
beforeEach(()=>{
 queryClient.clear();created=false;payload=undefined;roomMappings=[];planMappings=[];access={owner:true,entry:true,status:true,read:true,config:true,bookings:true,sync:true};
 vi.stubGlobal('fetch',vi.fn(async(input:any,init?:RequestInit)=>{
  const url=String(input),response=(data:any)=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  if(init?.method==='POST'){payload=JSON.parse(String(init.body));created=true;return response({id:'conn',...payload,isActive:false});}
  if(init?.method==='PATCH'){
   payload=JSON.parse(String(init.body));
   if(url.includes('/room-type-mappings/')){roomMappings=roomMappings.map(map=>({...map,...payload}));return response({...roomMappings[0],connectionId:'conn'});}
   if(url.includes('/rate-plan-mappings/')){planMappings=planMappings.map(map=>({...map,...payload}));return response({...planMappings[0],connectionId:'conn'});}
  }
  if(url==='/api/channex/access')return response(access);
  if(url==='/api/channex/runtime')return response({credentialsStorageReady:true,productionAriEnabled:false,productionInboundEnabled:false});
  if(url==='/api/channex/access/users')return response({users:[],grants:[]});
  if(url==='/api/channex/connections')return response(created?[{id:'conn',label:'Maran',environment:'real',isActive:false}]:[]);
  if(url==='/api/channex/connections/conn/room-type-mappings')return response(roomMappings);
  if(url==='/api/channex/connections/conn/rate-plan-mappings')return response(planMappings);
  if(url==='/api/room-types')return response([{id:'type',name:'Suite'}]);
  if(url==='/api/rate-plans')return response([{id:'plan',name:'Tarifa Suite',roomTypeId:'type',currency:'USD'}]);
  if(url.startsWith('/api/rate-calendar?'))return response({cells:[]});
  if(init?.method==='PATCH'){
   payload=JSON.parse(String(init.body));
   if(url.includes('/room-type-mappings/')){roomMappings=roomMappings.map(row=>({...row,...payload}));return response({...roomMappings[0],connectionId:'conn'});}
   if(url.includes('/rate-plan-mappings/')){planMappings=planMappings.map(row=>({...row,...payload}));return response({...planMappings[0],connectionId:'conn'});}
  }
  if(url.includes('/ari'))return response({settings:{floor:null,currency:'ARS',enabled:false},dispatchEnabled:false,rooms:[],summary:[],events:[]});
  if(url.includes('/inbound/bookings?'))return response({counts:{all:0,attention:0,new:0,modified:0,cancelled:0},bookings:[],page:1,pageSize:25});
  if(url.endsWith('/inbound'))return response({serverEnabled:false,settings:{enabled:false,has_token:false},revisions:[]});
  return response([]);
 }));
});

it.each(['room-type-mappings','rate-plan-mappings'])('refreshes only the affected %s after a save',async(kind)=>{
 created=true;
 roomMappings=[{id:'room-map',channexRoomTypeTitle:'Suite OTA',channexRoomTypeId:'remote-room',roomTypeId:kind==='rate-plan-mappings'?'type':null}];
 planMappings=[{id:'plan-map',channexRatePlanTitle:'Flexible OTA',channexRoomTypeId:'remote-room',ratePlanId:null}];
 const dependentKeys=[['channex-readiness','conn'],['channex-inbound','conn'],['/api/channex/bookings','conn'],['/api/channex/connections','conn','ari'],['/api/channex/connections','conn',kind]];
 dependentKeys.forEach(key=>{queryClient.setQueryData(key,key[0]==='channex-inbound'?{synthetic:true,serverEnabled:false,settings:{enabled:false,has_token:false},revisions:[]}:key[0]==='channex-readiness'?{synthetic:true,checks:[]}:{synthetic:true});});
 queryClient.setQueryData<{synthetic:boolean}>(['channex-readiness','other'],{synthetic:true});
 render(<QueryClientProvider client={queryClient}><OtaManager/></QueryClientProvider>);const user=userEvent.setup();
 await user.click(await screen.findByRole('tab',{name:'Configuración y mapeos'}));
 await screen.findByRole('button',{name:'Guardar mapeo de Suite OTA'});
 const counts=()=>Object.fromEntries(['/api/channex/access','/api/channex/runtime','/api/channex/connections','/api/channex/connections/conn/room-options','/api/channex/connections/conn/room-type-mappings','/api/channex/connections/conn/rate-plan-mappings'].map(path=>[path,vi.mocked(fetch).mock.calls.filter(([url,init])=>String(url)===path&&(!init?.method||init.method==='GET')).length]));
 const before=counts();
 if(kind==='room-type-mappings'){
  await user.selectOptions(screen.getByLabelText('Categoría de Suite OTA'),'type');
  await user.click(screen.getByRole('button',{name:'Guardar mapeo de Suite OTA'}));
 }else{
  await user.click(screen.getByTestId('select-rate-plan-mapping-plan-map'));
  await user.click(await screen.findByRole('option',{name:/Tarifa Suite/}));
  await user.click(screen.getByRole('button',{name:'Guardar tarifa'}));
 }
 await waitFor(()=>expect(payload).toEqual(kind==='room-type-mappings'?{roomTypeId:'type',roomIds:null}:{ratePlanId:'plan'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar mapeo de Suite OTA'})).toBeEnabled());
 const after=counts();
 for(const path of Object.keys(before)) expect(after[path]-before[path]).toBe(path.endsWith('/'+kind)?1:0);
 dependentKeys.forEach(key=>{if(key[0]==='channex-inbound')expect(queryClient.getQueryData(key)).toMatchObject({settings:{enabled:false}});else expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);});
 expect(queryClient.getQueryState(['channex-readiness','other'])?.isInvalidated).toBe(false);
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
it('gives admin all sections and saves only an inactive production connection with a masked credential',async()=>{
 render(<QueryClientProvider client={queryClient}><OtaManager/></QueryClientProvider>);const user=userEvent.setup();
 expect(await screen.findByRole('tab',{name:'Configuración y mapeos'})).toBeInTheDocument();expect(screen.getByRole('tab',{name:'Permisos'})).toBeInTheDocument();
 await user.click(screen.getByRole('tab',{name:'Configuración y mapeos'}));
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
 await screen.findByRole('heading',{name:'Reservas recibidas'});
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

it('opens the operational inbox first even for an administrator, keeping setup controls secondary',async()=>{
 created=true;render(<QueryClientProvider client={queryClient}><OtaManager/></QueryClientProvider>);
 expect(await screen.findByRole('tab',{name:'Reservas recibidas'})).toHaveAttribute('aria-selected','true');await screen.findByRole('table',{name:'Reservas recibidas de canales OTAs'});
 expect(screen.queryByRole('button',{name:'Habilitar recepción'})).not.toBeInTheDocument();expect(screen.queryByLabelText('Clave API de producción')).not.toBeInTheDocument();
});
