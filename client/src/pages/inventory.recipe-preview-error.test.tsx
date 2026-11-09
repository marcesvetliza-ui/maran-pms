vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true})}));
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {InternalMovementForm} from './inventory';
import {queryClient} from '@/lib/queryClient';
const {toast}=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast})}));
let responseBody:string;
beforeEach(()=>{
 queryClient.clear();toast.mockReset();responseBody=JSON.stringify({error:'Falta equivalencia explícita de caja a unidad para este artículo'});
 vi.stubGlobal('fetch',vi.fn(async(url:any,options?:RequestInit)=>{
   const route=String(url);
   if(route==='/api/inventory/recipe-stock-preview'){
     expect(options?.method).toBe('POST');
     expect(JSON.parse(options?.body as string)).toEqual({recipeId:'recipe-test',multiplier:1});
     return new Response(responseBody,{status:409,headers:{'Content-Type':'application/json'}});
   }
   return new Response(JSON.stringify(route==='/api/restaurant/recipes'?[{id:'recipe-test',name:'Receta de prueba'}]:[]),{status:200,headers:{'Content-Type':'application/json'}});
 }));
});
afterEach(async()=>{await queryClient.cancelQueries();queryClient.clear();vi.unstubAllGlobals();});
async function loadRecipe(){
 render(<QueryClientProvider client={queryClient}><InternalMovementForm embedded open onClose={vi.fn()}/></QueryClientProvider>);
 const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Expandir'}));
 await user.click(screen.getByTestId('select-im-recipe'));await user.click(await screen.findByRole('option',{name:'Receta de prueba'}));
 await user.click(screen.getByTestId('btn-load-recipe'));await waitFor(()=>expect(toast).toHaveBeenCalledTimes(1));
}
it('shows the server detail from the real apiRequest error contract and keeps the existing title',async()=>{
 await loadRecipe();expect(toast).toHaveBeenCalledWith({title:'Error al cargar receta',description:'Falta equivalencia explícita de caja a unidad para este artículo',variant:'destructive'});
 expect(screen.getByTestId('btn-load-recipe')).toBeEnabled();
 expect(screen.getByTestId('btn-confirm-internal-mov')).toBeDisabled();
});
it.each(['not valid JSON',JSON.stringify({error:{unexpected:true}}),JSON.stringify({error:'   '}),'null'])('keeps the generic message for an uninterpretable payload: %s',async body=>{
 responseBody=body;await loadRecipe();expect(toast).toHaveBeenCalledWith({title:'Error al cargar receta',variant:'destructive'});
 expect(screen.getByTestId('btn-load-recipe')).toBeEnabled();
});
