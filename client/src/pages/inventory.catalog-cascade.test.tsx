vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true})}));
import {render,screen,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi} from 'vitest';
import {NewItemForm} from './inventory';
const supplier=[{id:1,razonSocial:'Proveedor Uno',razon_social:'Proveedor Uno',cuit:'20111111111',activo:true} as any];

it('encadena área y agrupamiento y limpia la categoría al cambiar de área',async()=>{
 const user=userEvent.setup();const submit=vi.fn();
 const categories=[{id:'g',name:'Grupo SPA',area:'spa',isGroup:true,isActive:'true'},{id:'s',name:'Sub SPA',area:'spa',parentId:'g',isGroup:false,isActive:'true'},{id:'rg',name:'Grupo Restaurant',area:'restaurant',isGroup:true,isActive:'true'},{id:'r',name:'Sub Restaurant',area:'restaurant',parentId:'rg',isGroup:false,isActive:'true'},{id:'x',name:'Inactiva',area:'spa',parentId:'g',isGroup:false,isActive:'false'}];
 render(<QueryClientProvider client={new QueryClient()}><NewItemForm categories={categories as any} brands={[]} suppliers={supplier} existingItems={[]} onSubmit={submit} isPending={false} onCancel={()=>{}}/></QueryClientProvider>);
 await user.click(screen.getByTestId('select-item-area'));await user.click(screen.getByRole('option',{name:'SPA'}));
 await user.click(screen.getByTestId('select-item-group'));await user.click(screen.getByRole('option',{name:'Grupo SPA'}));
 await user.click(screen.getByTestId('select-category'));
 expect(screen.queryByRole('option',{name:'Sub Restaurant'})).toBeNull();expect(screen.queryByRole('option',{name:'Inactiva'})).toBeNull();
 await user.click(screen.getByRole('option',{name:'Sub SPA'}));
 await user.click(screen.getByTestId('select-item-area'));await user.click(screen.getByRole('option',{name:'Restaurante'}));
 expect(screen.getByTestId('select-category')).toHaveTextContent('Seleccionar subagrupamiento');
 expect(screen.getByTestId('select-item-group')).toHaveTextContent('Todos los agrupamientos');
 await user.click(screen.getByTestId('select-category'));await user.click(screen.getByRole('option',{name:'Sub Restaurant'}));
 fireEvent.click(screen.getByRole('checkbox',{name:/Proveedor Uno/}));
 await user.clear(screen.getByTestId('input-min-stock'));await user.type(screen.getByTestId('input-min-stock'),'2');
 await user.type(screen.getByTestId('input-critical-stock'),'1');
 await user.type(screen.getByTestId('input-item-name'),'Artículo');await user.click(screen.getByTestId('button-save-item'));
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({categoryId:'r'}));
});

it('ofrece Eventos y conserva la clave de Comunicación al asignar un subagrupamiento',async()=>{
 const user=userEvent.setup();const submit=vi.fn();
 const categories=[{id:'mg',name:'Grupo comunicación',area:'marketing',isGroup:true,isActive:'true'},{id:'legacy-marketing',parentId:'mg',name:'Varios comunicación',area:'marketing',isGroup:false,isActive:'true'}];
 render(<QueryClientProvider client={new QueryClient()}><NewItemForm categories={categories as any} brands={[]} suppliers={supplier} existingItems={[]} onSubmit={submit} isPending={false} onCancel={()=>{}}/></QueryClientProvider>);
 await user.click(screen.getByTestId('select-item-area'));
 expect(screen.getByRole('option',{name:'Eventos'})).toBeVisible();
 expect(screen.queryByRole('option',{name:'Marketing'})).toBeNull();
 await user.click(screen.getByRole('option',{name:'Comunicación'}));
 await user.click(screen.getByTestId('select-category'));await user.click(screen.getByRole('option',{name:'Varios comunicación'}));
 fireEvent.click(screen.getByRole('checkbox',{name:/Proveedor Uno/}));
 await user.clear(screen.getByTestId('input-min-stock'));await user.type(screen.getByTestId('input-min-stock'),'2');
 await user.type(screen.getByTestId('input-critical-stock'),'1');
 await user.type(screen.getByTestId('input-item-name'),'Artículo comunicación');await user.click(screen.getByTestId('button-save-item'));
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({categoryId:'legacy-marketing'}));
});

it('edita la ficha completa, conserva marca inactiva y omite costos sin permiso',async()=>{
 const user=userEvent.setup();const submit=vi.fn();
 const categories=[{id:'group',name:'Cocina',area:'restaurant',isGroup:true,isActive:'true'},{id:'sub',name:'Harinas',area:'restaurant',parentId:'group',isGroup:false,isActive:'true'}];
 const item={id:'item',name:'Harina',sku:'RST-1',categoryId:'sub',category:categories[1],brandId:'old',unit:'kg',costPrice:'100',minStock:2,maxStock:20,criticalStock:1,currentStock:8,isActive:'true',itemKind:'materia_prima',abcClass:'B',ivaRate:'10.5',suppliers:[{id:1,razonSocial:'Proveedor',cuit:'1',isPreferred:true}]};
 render(<QueryClientProvider client={new QueryClient()}><NewItemForm initialItem={item as any} canCost={false} categories={categories as any} brands={[{id:'old',name:'Marca histórica',isActive:'false'}]} suppliers={[{id:1,razonSocial:'Proveedor',cuit:'1',activo:true} as any]} existingItems={[item as any]} onSubmit={submit} isPending={false} onCancel={()=>{}}/></QueryClientProvider>);
 expect(screen.getByTestId('select-unit')).toBeDisabled();
 expect(screen.getByTestId('select-category')).toHaveTextContent('Harinas');
 expect(screen.queryByTestId('input-cost')).toBeNull();
 expect(screen.queryByTestId('warning-duplicate-item-name')).toBeNull();
 await user.clear(screen.getByTestId('input-max-stock'));await user.type(screen.getByTestId('input-max-stock'),'30');
 await user.click(screen.getByTestId('button-save-item'));
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({name:'Harina',sku:'RST-1',categoryId:'sub',brandId:'old',unit:'kg',maxStock:'30',abcClass:'B',ivaRate:'10.5',accountingSupplierIds:[1],preferredAccountingSupplierId:1}));
 expect(submit.mock.calls[0][0]).not.toHaveProperty('costPrice');expect(submit.mock.calls[0][0]).not.toHaveProperty('currentStock');
});
