import {useAuth} from '@/App';
import {Button as BaseButton} from '@/components/ui/button';
import type {ComponentProps} from 'react';
export function InventoryButton({permission,...props}:ComponentProps<typeof BaseButton>&{permission?:'catalog'|'operate'|'adjust'|'cost'}) {
 const {hasPermission}=useAuth();
 if(permission && !hasPermission('api:inventory:'+permission))return null;
 return <BaseButton {...props}/>;
}
export function useInventoryPermission(key:string){return useAuth().hasPermission('api:inventory:'+key);}
