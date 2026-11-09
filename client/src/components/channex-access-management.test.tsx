import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {ChannexAccessManagement} from './channex-access-management';
const state=vi.hoisted(()=>({owner:true}));
vi.mock('@/hooks/use-channex-access',()=>({useChannexAccess:()=>({data:state})}));
afterEach(()=>{cleanup();state.owner=true;});
it('directs admin to the shared role matrix instead of maintaining a per-user editor',()=>{
 render(<ChannexAccessManagement/>);
 expect(screen.getByRole('link',{name:'Abrir Permisos por Rol'})).toHaveAttribute('href','/admin/permisos');
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('keeps permission management admin-only',()=>{
 state.owner=false;render(<ChannexAccessManagement/>);
 expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
