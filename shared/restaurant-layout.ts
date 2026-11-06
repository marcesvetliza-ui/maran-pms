import { z } from 'zod';
export type LayoutTable = { id:string;areaId:string;positionX:number|null;positionY:number|null };
export type LayoutPosition = {positionX:number;positionY:number};
export const restaurantLayoutSchema=z.object({tables:z.array(z.object({id:z.string().min(1),areaId:z.string().min(1),positionX:z.number().int().min(0).max(99),positionY:z.number().int().min(0).max(99),expectedPositionX:z.number().int(),expectedPositionY:z.number().int()}).strict()).min(1).max(500).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length,'No repitas mesas')}).strict();
export type RestaurantLayoutRequest=z.infer<typeof restaurantLayoutSchema>;
export function moveLayoutTable<T extends LayoutTable>(tables:T[],id:string,x:number,y:number,areaId:string):T[]{
 const source=tables.find(t=>t.id===id);if(!source||source.areaId!==areaId)return tables;
 const target=tables.find(t=>t.id!==id&&t.areaId===areaId&&t.positionX===x&&t.positionY===y);
 return tables.map(t=>t.id===id?{...t,positionX:x,positionY:y}:t.id===target?.id?{...t,positionX:source.positionX,positionY:source.positionY}:t);
}
export function layoutChanges(before:LayoutTable[],after:LayoutTable[]):RestaurantLayoutRequest['tables']{
 return after.flatMap(t=>{const previous=before.find(p=>p.id===t.id);return !previous||(previous.positionX===t.positionX&&previous.positionY===t.positionY)?[]:[{id:t.id,areaId:t.areaId,positionX:t.positionX??0,positionY:t.positionY??0,expectedPositionX:previous.positionX??0,expectedPositionY:previous.positionY??0}];});
}
