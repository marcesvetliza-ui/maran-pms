// Stable keys preserve existing stock, category and warehouse relationships.
// Comunicación is the display name for the existing marketing key.
export const INVENTORY_AREAS = [
  {key:'general',label:'Depósito General'},
  {key:'spa',label:'SPA'},
  {key:'restaurant',label:'Restaurante'},
  {key:'housekeeping',label:'Housekeeping'},
  {key:'maintenance',label:'Mantenimiento'},
  {key:'admin',label:'Administración'},
  {key:'events',label:'Eventos'},
  {key:'marketing',label:'Comunicación'},
  {key:'hotel',label:'Hotel'},
] as const;
export type InventoryAreaKey = typeof INVENTORY_AREAS[number]['key'];
export const inventoryAreaLabel = (key:string) => INVENTORY_AREAS.find(area=>area.key===key)?.label ?? key;

// Historical areas remain readable, but are not offered for new classification.
export const INVENTORY_SELECTABLE_AREAS = INVENTORY_AREAS.filter(area => area.key !== 'hotel');
