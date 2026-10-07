import {useAuth} from '@/App';
import {Button as BaseButton} from '@/components/ui/button';
import {forwardRef, type ComponentPropsWithoutRef} from 'react';
export const InventoryButton = forwardRef<HTMLButtonElement,ComponentPropsWithoutRef<typeof BaseButton>&{permission?:'catalog'|'operate'|'adjust'|'cost'}>(function InventoryButton({permission,...props},ref) {
 const {hasPermission}=useAuth();
 if(permission && !hasPermission('api:inventory:'+permission))return null;
 return <BaseButton ref={ref} {...props}/>;
});
export function useInventoryPermission(key:string){return useAuth().hasPermission('api:inventory:'+key);}
