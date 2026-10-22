import {it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {HousekeepingInventory} from './housekeeping-inventory';
it('muestra sólo artículos físicos de Housekeeping, incluidos sus insumos de limpieza de Eventos',()=>{
 const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});
 client.setQueryData(['/api/housekeeping/inventory'],[
 {id:'hk',name:'Detergente',category:{id:'h',name:'Eventos',area:'housekeeping'},categoryId:'h',itemKind:'materia_prima'},
 {id:'dish',name:'Pechuga de pollo',category:{id:'h',name:'Eventos',area:'housekeeping'},categoryId:'h',itemKind:'plato'},
 {id:'e',name:'Bebida Eventos',category:{id:'e',name:'Eventos',area:'events'},categoryId:'e',itemKind:'venta_directa'},
 {id:'s',name:'Aceite SPA',category:{id:'s',name:'Productos',area:'spa'},categoryId:'s',itemKind:'materia_prima'},
 ]);
 render(<QueryClientProvider client={client}><HousekeepingInventory/></QueryClientProvider>);
 expect(screen.getByText('Detergente')).toBeInTheDocument();expect(screen.queryByText('Pechuga de pollo')).not.toBeInTheDocument();expect(screen.queryByText('Bebida Eventos')).not.toBeInTheDocument();expect(screen.queryByText('Aceite SPA')).not.toBeInTheDocument();expect(screen.getByText('1 artículos')).toBeInTheDocument();
});
