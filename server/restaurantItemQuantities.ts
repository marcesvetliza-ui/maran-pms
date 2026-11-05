import {eq} from 'drizzle-orm';
import {db} from './db';
import {orderItems,orderSplits} from '@shared/schema';
import {restaurantPortionCents,type RestaurantItemSelection} from '@shared/restaurant-item-quantities';
const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
/** Caller owns an order-locked transaction. Split commercial rows only; no kitchen/stock actions. */
export async function selectRestaurantItemQuantities(orderId:string,itemIds:unknown,selections:unknown){
  if(!Array.isArray(itemIds)||!itemIds.length||itemIds.length>500||itemIds.some(id=>typeof id!=='string')||new Set(itemIds).size!==itemIds.length)throw fail('Seleccioná artículos válidos sin repetir',400);
  const splits=await db.select({id:orderSplits.id}).from(orderSplits).where(eq(orderSplits.orderId,orderId));
  if(splits.length)throw fail('La cuenta ya tiene partes asignadas. Completá o cancelá esa división antes de seleccionar artículos.');
  const rows=await db.select().from(orderItems).where(eq(orderItems.orderId,orderId)).for('update');
  const chosen=rows.filter(row=>itemIds.includes(row.id));
  if(chosen.length!==itemIds.length||chosen.some(row=>row.paid))throw fail('Los artículos cambiaron, no existen o están ya cobrados. Actualizá la cuenta.',selections===undefined?400:409);
  // Old clients can still select whole rows; partial rows require an exact snapshot.
  if(selections===undefined)return chosen.map(row=>({...row,sourceItemId:row.id}));
  if(!Array.isArray(selections)||selections.length!==itemIds.length||new Set(selections.map(s=>s?.id)).size!==selections.length)throw fail('Selección de cantidades inválida',400);
  const mapped=new Map<string,RestaurantItemSelection>();
  for(const s of selections){
    if(!s||typeof s.id!=='string'||!itemIds.includes(s.id)||!Number.isSafeInteger(s.quantity)||s.quantity<=0||!Number.isSafeInteger(s.expectedQuantity)||s.expectedQuantity<=0||typeof s.expectedSubtotal!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(s.expectedSubtotal))throw fail('Cantidad seleccionada inválida',400);
    mapped.set(s.id,s);
  }
  // Validate the whole request before splitting anything.
  for(const row of chosen){const s=mapped.get(row.id)!;
    if(s.expectedQuantity!==row.quantity||Math.round(Number(s.expectedSubtotal)*100)!==Math.round(Number(row.subtotal)*100)||s.quantity>row.quantity)throw fail('La cantidad o el precio cambió. Actualizá la cuenta antes de continuar.');
  }
  const result=[];
  for(const row of chosen){const s=mapped.get(row.id)!;
    if(s.quantity===row.quantity){result.push({...row,sourceItemId:row.id});continue;}
    const selected=restaurantPortionCents(row.subtotal,row.quantity,s.quantity);
    const remaining=Math.round(Number(row.subtotal)*100)-selected;
    await db.update(orderItems).set({quantity:row.quantity-s.quantity,subtotal:(remaining/100).toFixed(2)}).where(eq(orderItems.id,row.id));
    const {id,...copy}=row;
    const [portion]=await db.insert(orderItems).values({...copy,quantity:s.quantity,subtotal:(selected/100).toFixed(2)}).returning();
    result.push({...portion,sourceItemId:row.id});
  }
  return result;
}
