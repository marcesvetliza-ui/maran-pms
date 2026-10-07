import {it,expect} from 'vitest';
import {historicalWarehouseStock} from '../inventoryHistory';
const cut=Date.parse('2026-10-07T03:00:00Z');
const movement=(patch:Record<string,unknown>={})=>({id:'m',itemId:'i',warehouseId:'k',toWarehouseId:null,movementType:'entrada',quantity:'10',previousStock:'0',newStock:'10',createdAt:'2026-10-06T12:00:00Z',...patch});
it('reconstruye el cierre argentino sin incluir movimientos del día siguiente',()=>{
 expect(historicalWarehouseStock(7,[movement(),movement({id:'c',movementType:'consumo',previousStock:'10',newStock:'7',quantity:'3',createdAt:'2026-10-07T03:00:00Z'})],'k',cut)).toBe(10);
});
it('incluye movimientos anteriores a medianoche argentina aunque tengan fecha UTC siguiente',()=>{
 expect(historicalWarehouseStock(7,[movement(),movement({movementType:'consumo',previousStock:'10',newStock:'7',quantity:'3',createdAt:'2026-10-07T02:59:59Z'})],'k',cut)).toBe(7);
});
it('una transferencia cambia ambos depósitos pero no inventa saldo de destino sin ancla',()=>{
 const transfer=movement({movementType:'transferencia',toWarehouseId:'f',quantity:'3',previousStock:'10',newStock:'7',createdAt:'2026-10-07T04:00:00Z'});
 expect(historicalWarehouseStock(7,[movement(),transfer],'k',cut)).toBe(10);
 expect(historicalWarehouseStock(3,[transfer],'f',cut)).toBeNull();
 expect(historicalWarehouseStock(8,[movement({warehouseId:'f',newStock:'5',quantity:'5'}),transfer],'f',cut)).toBe(5);
});
it('un ajuste positivo posterior no se confunde con una salida',()=>{
 expect(historicalWarehouseStock(12,[movement(),movement({movementType:'ajuste',quantity:'2',previousStock:'10',newStock:'12',createdAt:'2026-10-07T04:00:00Z'})],'k',cut)).toBe(10);
});
it('datos sin historia, incongruentes o simultáneos sin ancla segura se marcan desconocidos',()=>{
 expect(historicalWarehouseStock(10,[],'k',cut)).toBeNull();
 expect(historicalWarehouseStock(20,[movement()],'k',cut)).toBeNull();
 expect(historicalWarehouseStock(10,[movement(),movement({id:'otra'})],'k',cut)).toBeNull();
});
