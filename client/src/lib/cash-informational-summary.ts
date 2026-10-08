export function informationalSummary<T extends {anulado?:boolean;movementType:string;paymentMethod:string;amount:string|number}>(
 movements:T[],normalize:(method:string)=>string,
){
 const groups:Record<string,{count:number;total:number;items:T[]}>= {};
 for(const movement of movements){
  if(movement.anulado || movement.movementType!=="informational")continue;
  const method=normalize(movement.paymentMethod);
  const group=groups[method]??(groups[method]={count:0,total:0,items:[]});
  group.count++;group.total+=Number(movement.amount)||0;group.items.push(movement);
 }
 return groups;
}
