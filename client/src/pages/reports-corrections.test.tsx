import {render,screen,cleanup,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import ReportsPage from './reports';
import AdminReportsPage from './admin-reportes';
const food={resumen:{totalVentas:15000,costoTeorico:4500,foodCostPct:30,foodOnlyCostPct:35,beverageCostPct:20,ventasFood:10000,ventasBeverage:5000,costoFood:3500,costoBeverage:1000,totalCovers:2,totalItems:3,totalOrdenes:1},porPlato:[{nombre:'Plato de prueba',totalVenta:10000,costoTotal:3500,foodCostPct:35,tieneReceta:true,isBeverage:false}]};
let failed=false;let client:QueryClient;
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});vi.stubGlobal('fetch',vi.fn(async(input:any)=>{
 const url=String(input);if(failed)return new Response(JSON.stringify({error:'database unavailable'}),{status:500});
 const data=url.includes('/food-cost?')?food:url.includes('/mermas?')?{items:[],totalMermaCosto:0}:url.includes('/restaurant?')?{totalOrders:0,totalRevenue:0,totalCovers:0,avgTicket:0,topItems:[],byArea:[]}:[];
 return new Response(JSON.stringify(data),{status:200});
}));});
afterEach(()=>{failed=false;cleanup();client.clear();vi.unstubAllGlobals();});
const show=(node:React.ReactNode)=>render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
async function openFood(){const user=userEvent.setup();await user.click(screen.getByTestId('button-area-restaurant'));await user.click(screen.getByTestId('tab-restaurant-foodcost'));}
it('renders real nested Food Cost and per-dish sales in Gerencia',async()=>{
 show(<ReportsPage/>);await openFood();const row=await screen.findByText('Plato de prueba');expect(within(row.closest('tr')!).getByText(/10\.000/)).toBeInTheDocument();expect(screen.getByText('30.0%')).toBeInTheDocument();expect(screen.getAllByText('35.0%')).toHaveLength(2);
});
it('hides cached Food Cost values after a failed refresh, disables export and supports retry',async()=>{
 show(<ReportsPage/>);await openFood();await screen.findByText('Plato de prueba');failed=true;
 await client.invalidateQueries({queryKey:['/api/restaurant/reports/food-cost-tab']});
 await screen.findByRole('alert');expect(screen.queryByText('Plato de prueba')).not.toBeInTheDocument();expect(screen.getByTestId('button-export-csv')).toBeDisabled();expect(screen.getByTestId('button-print')).toBeDisabled();
 failed=false;await userEvent.click(screen.getByRole('button',{name:'Reintentar consulta'}));await screen.findByText('Plato de prueba');
});
it('keeps a successful empty period distinct from query failure',async()=>{
 show(<ReportsPage/>);await screen.findByText(/No hay datos para el período seleccionado/);expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('does not treat HTTP errors as zero-valued Administración reports',async()=>{
 failed=true;show(<AdminReportsPage/>);await screen.findByRole('alert');expect(screen.queryByText(/EBITDA/)).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'PDF'})).not.toBeInTheDocument();
 failed=false;await userEvent.click(screen.getByRole('button',{name:'Food Cost Restaurant'}));await screen.findByText('Plato de prueba');expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
