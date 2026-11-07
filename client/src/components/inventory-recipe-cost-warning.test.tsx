import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {InventoryRecipeCostWarning} from './inventory-recipe-cost-warning';
afterEach(cleanup);
it('shows a persistent review notice with recipe context without claiming recalculation',()=>{
 render(<InventoryRecipeCostWarning items={[{id:'milk',name:'Leche entera',unitCorrectionPending:true,unitCorrectionNote:'Revisá la receta Salsa piamal'}]}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Leche entera');expect(screen.getByRole('status')).toHaveTextContent('costos anteriores');expect(screen.getByRole('status')).toHaveTextContent('Salsa piamal');
});
it('hides the notice once recalculation clears the pending marker',()=>{render(<InventoryRecipeCostWarning items={[{id:'milk',name:'Leche entera',unitCorrectionPending:false}]}/>);expect(screen.queryByRole('status')).toBeNull();});
