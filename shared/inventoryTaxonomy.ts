import type {InventoryAreaKey} from './inventoryAreas';
export type InventoryBranch={area:InventoryAreaKey;group:string;children:readonly string[]};
// Physical inventory only. Menu dishes and SPA treatments have their own catalogs.
export const INVENTORY_TAXONOMY:readonly InventoryBranch[]=[
 {area:'restaurant',group:'Justo Cafetería',children:['Cafetería','Cafetería especial']},
 {area:'restaurant',group:'Justo Cocina',children:['Carnes','Frutas y Verduras','Embutidos','Lácteos','Varios']},
 {area:'restaurant',group:'Justo Bebidas',children:['Vinos y Champagne','Coctelería','Cervezas','Bebidas sin alcohol']},
 {area:'restaurant',group:'Vajilla y Descartables de Cocina',children:['Vajilla','Descartables']},
 ...['Amenities','Lavadero','Áreas Públicas','Eventos','Cocina','SPA','Varios Limpieza'].map(group=>({area:'housekeeping' as const,group,children:['General']})),
 {area:'housekeeping',group:'Habitaciones',children:['Blancos Habitaciones','Muebles','Varios']},
 ...['Productos','Blancos','Varios'].map(group=>({area:'spa' as const,group,children:['General']})),
 ...['Insumos de oficina','Papelería','Repuestos técnicos','Varios'].map(group=>({area:'admin' as const,group,children:['General']})),
 ...['Herramientas del edificio','Varios'].map(group=>({area:'maintenance' as const,group,children:['General']})),
 {area:'events',group:'Varios',children:['General']},
 {area:'marketing',group:'Varios comunicación',children:['General']},
];
export const INITIAL_STOCK_COLUMNS=['Artículo','Área','Agrupamiento','Subagrupamiento','Tipo','Unidad de stock','Cantidad inicial','Depósito','Costo unitario','Unidad de compra','Equivalencia a unidad de stock','Mínimo por depósito','Crítico por depósito'] as const;
export const initialStockTemplate=()=> '\uFEFF'+INITIAL_STOCK_COLUMNS.map(c=>'"'+c+'"').join(';')+'\r\n';
