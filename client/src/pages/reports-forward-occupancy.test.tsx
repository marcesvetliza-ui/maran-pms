import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import ReportsPage from './reports';
import DashboardExecutive from './dashboard-executive';
const daily = ['2026-11-24','2026-11-25','2026-11-26'].map(date=>({date,totalRooms:66,occupied:0,forecast:58,available:8,occupancy:58/66*100}));
const stats={occupancyRate:58/66*100,occupancySummary:{basis:'reserved',roomNights:174,capacityNights:198,actualRoomNights:0,forecastRoomNights:174,occupancy:58/66*100},occupiedRooms:20,availableRooms:46,totalRooms:66,totalRevenue:0,accommodationRevenue:0,extrasRevenue:0,adr:0,revpar:0,byChannel:[],roomsByStatus:{occupied:20,available:46,cleaning:0,maintenance:0,oos:0},alojamiento:{resumen:{roomNights:0,capacityNights:0},proyeccion:{roomNights:174,revenue:17400},advertencias:{}}};
let client: QueryClient;
beforeEach(()=>{
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  vi.stubGlobal('fetch',vi.fn(async(input:any)=>new Response(JSON.stringify(String(input).startsWith('/api/reports/occupancy?')?daily:String(input).startsWith('/api/executive/stats?')?stats:[]),{status:200,headers:{'content-type':'application/json'}})));
});
afterEach(()=>{client.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
const show=(node:React.ReactNode)=>render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
function futureDates(){fireEvent.change(screen.getByTestId('input-date-from'),{target:{value:'2026-11-24'}});fireEvent.change(screen.getByTestId('input-date-to'),{target:{value:'2026-11-26'}});}
it('muestra las reservas futuras junto al porcentaje y disponibilidad correctos en Reportes',async()=>{
  show(<ReportsPage/>);futureDates();await userEvent.click(screen.getByTestId('button-apply-dates'));
  const row=await screen.findByTestId('row-occupancy-0');expect(within(row).getByText('58')).toBeInTheDocument();expect(within(row).getByText('87,9%')).toBeInTheDocument();expect(within(row).getByText('8')).toBeInTheDocument();expect(within(row).getByText('0')).toBeInTheDocument();
  expect(screen.getByTestId('occupancy-methodology')).toHaveTextContent('Desde hoy: habitaciones reservadas para cada noche');
  expect(screen.queryByText('Sin ocupación realizada')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('/api/reports/occupancy?from=2026-11-24&to=2026-11-26',expect.any(Object));
});
it('el CSV conserva las reservas por venir y el mismo porcentaje de la tabla',async()=>{
  let captured:Blob|undefined;const OriginalURL=URL;
  vi.stubGlobal('URL',class extends OriginalURL{static createObjectURL(blob:Blob){captured=blob;return 'blob:synthetic';}static revokeObjectURL(){}});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  show(<ReportsPage/>);await screen.findByTestId('row-occupancy-0');await userEvent.click(screen.getByTestId('button-export-csv'));
  expect(captured).toBeDefined();const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(captured!);});
  expect(text).toContain('Alojadas / realizadas,Reservadas por venir,% Ocupación');expect(text).toContain('"24/11/2026","8","0","58","87,9%"');
});
it('Ejecutivo presenta ocupación reservada y las noches del rango, además del estado actual de habitaciones',async()=>{
  show(<DashboardExecutive/>);futureDates();await userEvent.click(screen.getByTestId('btn-apply-custom'));
  await waitFor(()=>expect(screen.getByTestId('kpi-occupancy')).toHaveTextContent('87.9%'));
  expect(screen.getByTestId('kpi-occupancy')).toHaveTextContent('Ocupación reservada');expect(screen.getByTestId('kpi-occupancy')).toHaveTextContent('174 habitaciones-noche reservadas');expect(screen.getByTestId('kpi-occupancy')).toHaveTextContent('20 de 66 habitaciones ocupadas');
  expect(fetch).toHaveBeenCalledWith('/api/executive/stats?from=2026-11-24&to=2026-11-26',expect.any(Object));
});
