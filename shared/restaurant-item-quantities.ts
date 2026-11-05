/** Allocate cents from the stored line total, carrying the remainder forward. */
export function restaurantPortionCents(subtotal:string|number,available:number,quantity:number):number {
  const cents=Math.round(Number(subtotal)*100);
  if(!Number.isSafeInteger(cents)||cents<0||!Number.isSafeInteger(available)||available<=0||!Number.isSafeInteger(quantity)||quantity<=0||quantity>available)throw new Error('Cantidad o importe de artículo inválido');
  return quantity===available?cents:Number(BigInt(cents)*BigInt(quantity)/BigInt(available));
}
export type RestaurantItemSelection={id:string;quantity:number;expectedQuantity:number;expectedSubtotal:string};
