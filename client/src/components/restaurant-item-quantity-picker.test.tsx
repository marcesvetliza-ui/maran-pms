import React,{useState} from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it} from 'vitest';
import {RestaurantItemQuantityPicker} from './restaurant-item-quantity-picker';
const items=[{id:'bife',quantity:2,subtotal:'25000.00',menuItem:{name:'Bife'}},{id:'agua',quantity:4,subtotal:'4800.00',menuItem:{name:'Agua'}}];
function Harness(){const [qty,setQty]=useState<Record<string,number>>({});return <RestaurantItemQuantityPicker items={items} quantities={qty} onChange={setQty}/>;}
it('selects one of two steaks and one of four waters with exact totals',()=>{
 render(<Harness/>);fireEvent.click(screen.getByLabelText('Seleccionar Bife'));fireEvent.click(screen.getByLabelText('Seleccionar Agua'));
 expect(screen.getByLabelText('Cantidad de Bife')).toHaveValue(1);expect(screen.getByRole('status')).toHaveTextContent('Seleccionado: $13.700,00');expect(screen.getByRole('status')).toHaveTextContent('Queda pendiente: $16.100,00');
 fireEvent.click(screen.getByLabelText('Agregar una unidad de Bife'));expect(screen.getByLabelText('Agregar una unidad de Bife')).toBeDisabled();
 fireEvent.click(screen.getByText('Todo'));expect(screen.getByLabelText('Cantidad de Agua')).toHaveValue(4);expect(screen.getByRole('status')).toHaveTextContent('Queda pendiente: $0,00');
 fireEvent.click(screen.getByText('Limpiar'));expect(screen.getByLabelText('Cantidad de Bife')).toHaveValue(0);
});
