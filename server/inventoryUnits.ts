export { INVENTORY_UNITS, inventoryUnitFactor } from "@shared/inventoryUnits";
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409});
export function convertInventoryQuantity(quantity:number,factor:number):number{
 if(!Number.isFinite(quantity)||quantity<0||!Number.isFinite(factor)||factor<=0)throw fail('Cantidad o equivalencia inválida');
 const exact=quantity*factor, rounded=Math.round(exact*1000)/1000;
 if(!Number.isFinite(exact)||exact>9999999|| (quantity>0 && rounded<=0))throw fail('Cantidad fuera del rango de stock o menor que 0,001');
 return rounded;
}
