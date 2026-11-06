import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import RecetasCostosPage from './recetas-costos';
vi.mock('@/components/breakfast-control-tab',()=>({BreakfastControlTab:()=>null}));
vi.mock('@/components/production-tab',()=>({ProductionTab:()=>null}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/queryClient',async original=>({...await original<any>(),apiRequest:vi.fn()}));
const ingredient={id:'existing',ingredientName:'Pollo',quantity:'0.300',unit:'kg',unitCost:'6000',inventoryItemId:'chicken'};
const dish={id:'dish',menuItemId:'menu',ingredients:[ingredient]};
const base={id:'base',isBase:true,name:'Salsa básica',productionUnit:'kg',productionYield:'1',ingredients:[ingredient]};
const other={id:'other',isBase:true,name:'Ñoquis húngaros',productionUnit:'kg',productionYield:'2',ingredients:[ingredient]};
const produced={id:'produced',isBase:true,name:'Carne picada',productionUnit:'g',productionYield:'1000',outputInventoryItemId:'stock-output',ingredients:[ingredient]};
let recipeRows:any[];
beforeEach(()=>{
 recipeRows=[dish,base,other,produced].map(recipe=>({...recipe,ingredients:recipe.ingredients.map(ingredient=>({...ingredient}))}));
 queryClient.clear();queryClient.setDefaultOptions({queries:{retry:false,staleTime:Infinity,queryFn:async()=>recipeRows},mutations:{retry:false}});
 queryClient.setQueryData(['/api/restaurant/menu/categories'],[{id:'category',name:'Platos'}]);
 queryClient.setQueryData(['/api/restaurant/menu/items'],[{id:'menu',categoryId:'category',name:'Pollo con salsa',price:'10000',isAvailable:'true'}]);
 queryClient.setQueryData(['/api/restaurant/recipes'],recipeRows);
 queryClient.setQueryData(['/api/inventory/items?itemKind=materia_prima,venta_directa,semielaborado'],[{id:'chicken',unit:'kg',name:'Pollo',costPrice:'6000'},{id:'stock-output',unit:'kg',name:'Carne picada',costPrice:'8000'}]);
});
afterEach(()=>{cleanup();queryClient.clear();vi.resetAllMocks();});
async function openDish(){
 render(<QueryClientProvider client={queryClient}><RecetasCostosPage/></QueryClientProvider>);
 fireEvent.click(screen.getByTestId('button-edit-recipe-menu'));
 return within(await screen.findByRole('dialog'));
}
it('opens the dish with ingredient entry before the assembled recipe and totals',async()=>{
 const dialog=await openDish();
 const add=dialog.getByTestId('button-add-ingredient');
 const table=dialog.getByRole('table');
 expect(add.compareDocumentPosition(table)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(table.compareDocumentPosition(dialog.getByText('Margen:'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 fireEvent.click(dialog.getByRole('button',{name:'Elaboración Base'}));
 fireEvent.change(dialog.getByRole('textbox',{name:'Buscar elaboración base'}),{target:{value:'noquis hungaros'}});
 expect(dialog.queryByRole('button',{name:/Salsa básica/})).toBeNull();
 fireEvent.click(dialog.getByRole('button',{name:/Ñoquis húngaros/}));
 expect(dialog.getByText('kg',{selector:'div'})).toBeTruthy();
 fireEvent.change(dialog.getByTestId('input-ingredient-qty'),{target:{value:'0.1'}});
 vi.mocked(apiRequest).mockImplementation(async(_method,_path,data:any)=>{
  const added={...data,id:'new'};
  recipeRows=recipeRows.map(recipe=>recipe.id==='dish'?{...recipe,ingredients:[...recipe.ingredients,added]}:recipe);
  return {json:async()=>added} as Response;
 });
 fireEvent.click(add);
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('POST','/api/restaurant/recipes/dish/ingredients',expect.objectContaining({quantity:'0.1',subRecipeId:'other',unit:'kg',inventoryItemId:null})));
 await waitFor(()=>expect(dialog.queryByRole('textbox',{name:'Buscar elaboración base'})).toBeNull());
 expect(dialog.getByTestId('button-add-ingredient')).toBeDisabled();
 await within(table).findByText('Ñoquis húngaros');
});
it('searches preparations with stock independently and keeps yield and cost units distinct',async()=>{
 const dialog=await openDish();
 fireEvent.click(dialog.getByRole('button',{name:'Elaboración Base'}));
 fireEvent.change(dialog.getByRole('textbox',{name:'Buscar elaboración base'}),{target:{value:'Salsa'}});
 fireEvent.click(dialog.getByRole('button',{name:'Preparación con stock'}));
 const search=dialog.getByRole('textbox',{name:'Buscar preparación con stock'});
 expect(search).toHaveValue('');
 fireEvent.change(search,{target:{value:'CARNE'}});
 const option=dialog.getByRole('button',{name:/Carne picada/});
 expect(option.textContent).toContain('1000 g');
 expect(option.textContent).toContain('Costo por kg');
 fireEvent.click(option);expect(option).toHaveAttribute('aria-pressed','true');
 fireEvent.change(search,{target:{value:'inexistente'}});
 expect(dialog.getByRole('status')).toHaveTextContent('No hay resultados');
});
it('uses the same order and search in base elaborations while excluding itself',async()=>{
 render(<QueryClientProvider client={queryClient}><RecetasCostosPage/></QueryClientProvider>);
 fireEvent.mouseDown(screen.getByRole('tab',{name:/Elaboraciones Base/}),{button:0});
 fireEvent.click(screen.getByRole('tab',{name:/Elaboraciones Base/}));
 fireEvent.click(await screen.findByTestId('button-edit-base-recipe-base'));
 const dialog=within(await screen.findByRole('dialog'));
 const add=dialog.getByRole('button',{name:'Agregar Ingrediente'});
 expect(add.compareDocumentPosition(dialog.getByRole('table'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 fireEvent.click(dialog.getByRole('button',{name:'Elaboración Base'}));
 expect(dialog.queryByRole('button',{name:/Salsa básica/})).toBeNull();
 fireEvent.change(dialog.getByRole('textbox',{name:'Buscar elaboración base'}),{target:{value:'húngaros'}});
 fireEvent.click(dialog.getByRole('button',{name:/Ñoquis húngaros/}));
 expect(dialog.getByText('kg',{selector:'div'})).toBeTruthy();
});

it('previews a copied recipe and creates a zero-price MP dish only after explicit save',async()=>{
 const menuRows:any[]=[{id:'menu',categoryId:'category',name:'Pollo con salsa',price:'10000',isAvailable:'true',preparationTime:15}];
 queryClient.setDefaultOptions({queries:{retry:false,staleTime:Infinity,queryFn:async({queryKey})=>String(queryKey[0]).includes('/menu/items')?menuRows:String(queryKey[0]).includes('/recipes')?recipeRows:[]},mutations:{retry:false}});
 render(<QueryClientProvider client={queryClient}><RecetasCostosPage/></QueryClientProvider>);
 fireEvent.click(screen.getByTestId('button-add-menu-item'));
 fireEvent.click(screen.getByRole('button',{name:'Copiar receta existente'}));
 fireEvent.change(screen.getByLabelText('Buscar receta para copiar'),{target:{value:'Pollo'}});
 fireEvent.click(screen.getByRole('button',{name:'Pollo con salsa'}));
 expect(screen.getByTestId('input-recipe-item-name')).toHaveValue('Pollo con salsa (copia)');expect(screen.getByTestId('input-recipe-item-price')).toHaveValue(10000);
 expect(screen.getByText(/Los cambios posteriores en la receta original/)).toBeVisible();expect(apiRequest).not.toHaveBeenCalled();
 fireEvent.change(screen.getByTestId('input-recipe-item-name'),{target:{value:'Pollo con salsa MP'}});fireEvent.change(screen.getByTestId('input-recipe-item-price'),{target:{value:'0'}});
 vi.mocked(apiRequest).mockImplementation(async(_method,_path,data:any)=>{
  const item={id:'copy-menu',...data};menuRows.push(item);const recipe={id:'copy-recipe',menuItemId:item.id,ingredients:[{...ingredient,id:'copy-ingredient'}]};recipeRows.push(recipe);
  return {json:async()=>({menuItem:item,recipe,warnings:[]})} as Response;
 });
 fireEvent.click(screen.getByRole('button',{name:'Crear plato con receta copiada'}));
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('POST','/api/restaurant/recipes/dish/copy-dish',expect.objectContaining({name:'Pollo con salsa MP',price:'0',categoryId:'category'})));
 await screen.findByText('Receta — Pollo con salsa MP');expect(vi.mocked(apiRequest).mock.calls).toHaveLength(1);
});
