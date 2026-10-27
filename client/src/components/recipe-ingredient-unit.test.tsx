import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeIngredientUnit, ingredientUnits } from './recipe-ingredient-unit';
afterEach(cleanup);

it('converts 0.300 kg to 300 g and its cost together, without changing the total', async () => {
  const change = vi.fn();
  const client = new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async()=>[]}}});
  render(<QueryClientProvider client={client}><RecipeIngredientUnit itemId="pollo" stockUnit="kg" stockCost={6000}
    unit="kg" quantity="0.300" onChange={change}/></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Unidad del ingrediente'), {target:{value:'g'}});
  expect(change).toHaveBeenCalledWith({unit:'g',quantity:'300',cost:'6.0000'});
  expect(300 * 6).toBe(0.3 * 6000);
});

it('exposes a configured 3 kg bucket as grams at the corresponding cost', async () => {
  const change = vi.fn();
  const client = new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async()=>[{fromUnit:'g',factor:String(1/3000)}]}}});
  render(<QueryClientProvider client={client}><RecipeIngredientUnit itemId="balde" stockUnit="unidad" stockCost={18000}
    unit="unidad" quantity="0.1" onChange={change}/></QueryClientProvider>);
  await waitFor(()=>expect(screen.getByRole('option',{name:'g'})).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Unidad del ingrediente'), {target:{value:'g'}});
  expect(change).toHaveBeenCalledWith({unit:'g',quantity:'300',cost:'6.0000'});
});

it('does not offer unrelated dimensions or unconfigured packages', () => {
  expect(ingredientUnits('kg',[]).map(row=>row.unit)).toEqual(['kg','g']);
  expect(ingredientUnits('litro',[]).map(row=>row.unit)).toEqual(['litro','ml']);
});
