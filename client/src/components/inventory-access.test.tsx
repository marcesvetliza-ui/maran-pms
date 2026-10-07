import {render,screen} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
const permissions=vi.hoisted(()=>new Set<string>());
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:(key:string)=>permissions.has(key)})}));
import {InventoryButton} from './inventory-access';
it('a consulta user sees detail controls but cannot see mutation controls',()=>{
 permissions.clear();render(<><InventoryButton permission="catalog">Editar</InventoryButton><InventoryButton permission="operate">Transferir</InventoryButton><InventoryButton permission="adjust">Anular</InventoryButton><InventoryButton permission="cost">Costos</InventoryButton><InventoryButton>Detalle</InventoryButton></>);
 expect(screen.getByRole('button',{name:'Detalle'})).toBeInTheDocument();for(const name of ['Editar','Transferir','Anular','Costos'])expect(screen.queryByRole('button',{name})).toBeNull();
});
it('Restaurant operating permission reveals transfer but not adjustment or catalog',()=>{
 permissions.clear();permissions.add('api:inventory:operate');render(<><InventoryButton permission="operate">Transferir</InventoryButton><InventoryButton permission="catalog">Editar</InventoryButton><InventoryButton permission="adjust">Anular</InventoryButton></>);
 expect(screen.getByRole('button',{name:'Transferir'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Editar'})).toBeNull();expect(screen.queryByRole('button',{name:'Anular'})).toBeNull();
});
