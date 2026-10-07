import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true})}));
import {InventoryPreparation} from './inventory-preparation';
import {initialStockTemplate,INITIAL_STOCK_COLUMNS,INVENTORY_TAXONOMY} from '@shared/inventoryTaxonomy';
it('explica la carga y enlaza los catálogos existentes sin crear platos ni tratamientos',async()=>{
 render(<InventoryPreparation/>);await userEvent.click(screen.getByRole('button',{name:/Preparar catálogo/}));
 expect(screen.getByRole('link',{name:'Ir a Recetas y Costos'})).toHaveAttribute('href','/restaurant/recetas');
 expect(screen.getByRole('link',{name:'Ir a SPA'})).toHaveAttribute('href','/spa');
 expect(screen.getByText(/Descargarla no importa artículos/)).toBeInTheDocument();
 expect(screen.getByText(/una entrada sola no establece ese destino/)).toBeInTheDocument();
});
it('la plantilla exige depósito y unidad y la estructura física excluye platos, tratamientos y personal externo',()=>{
 expect(initialStockTemplate()).toContain('"Cantidad inicial";"Depósito"');expect(INITIAL_STOCK_COLUMNS).toContain('Equivalencia a unidad de stock');
 expect(INVENTORY_TAXONOMY.some(b=>b.area==='events')).toBe(true);
 expect(INVENTORY_TAXONOMY.some(b=>b.area==='marketing')).toBe(true);
 expect(INVENTORY_TAXONOMY.every(b=>b.children.length>0)).toBe(true);
 expect(INVENTORY_TAXONOMY.some(b=>/Tratamientos|Frío|Fuera de Menú|Personal externo/.test(b.group))).toBe(false);
});
