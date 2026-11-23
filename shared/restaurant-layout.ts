import { z } from 'zod';
export type LayoutTable = { id:string;areaId:string;positionX:number|null;positionY:number|null };
export type LayoutPosition = {positionX:number;positionY:number};
export function restaurantGridSize(areaType: string) {
 return areaType === 'event' ? {columns:5,rows:3} : {columns:8,rows:6};
}
/** Preserve the first table in each cell; expose every invalid/duplicate placement. */
export function restaurantTablePlacement<T extends Pick<LayoutTable,'positionX'|'positionY'>>(tables:readonly T[],areaType:string) {
 const {columns,rows}=restaurantGridSize(areaType),byCell=new Map<string,T>(),unplaced:T[]=[];
 for(const table of tables){
  const x=table.positionX,y=table.positionY;
  if(x===null||y===null||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=columns||y>=rows||byCell.has(`${x}:${y}`))unplaced.push(table);
  else byCell.set(`${x}:${y}`,table);
 }
 let firstFree:LayoutPosition|null=null;
 for(let y=0;y<rows&&!firstFree;y++)for(let x=0;x<columns;x++)if(!byCell.has(`${x}:${y}`)){firstFree={positionX:x,positionY:y};break;}
 return {columns,rows,byCell,unplaced,firstFree};
}
export const restaurantLayoutSchema=z.object({tables:z.array(z.object({id:z.string().min(1),areaId:z.string().min(1),positionX:z.number().int().min(0).max(99),positionY:z.number().int().min(0).max(99),expectedPositionX:z.number().int().nullable(),expectedPositionY:z.number().int().nullable()}).strict()).min(1).max(500).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length,'No repitas mesas')}).strict();
export type RestaurantLayoutRequest=z.infer<typeof restaurantLayoutSchema>;
export function moveLayoutTable<T extends LayoutTable>(tables:T[],id:string,x:number,y:number,areaId:string):T[]{
 const source=tables.find(t=>t.id===id);if(!source||source.areaId!==areaId)return tables;
 const target=tables.find(t=>t.id!==id&&t.areaId===areaId&&t.positionX===x&&t.positionY===y);
 return tables.map(t=>t.id===id?{...t,positionX:x,positionY:y}:t.id===target?.id?{...t,positionX:source.positionX,positionY:source.positionY}:t);
}
export function layoutChanges(before:LayoutTable[],after:LayoutTable[]):RestaurantLayoutRequest['tables']{
 return after.flatMap(t=>{const previous=before.find(p=>p.id===t.id);return !previous||(previous.positionX===t.positionX&&previous.positionY===t.positionY)?[]:[{id:t.id,areaId:t.areaId,positionX:t.positionX??0,positionY:t.positionY??0,expectedPositionX:previous.positionX,expectedPositionY:previous.positionY}];});
}
