export const INVENTORY_UNITS=['unidad','kg','g','litro','ml','caja','paquete','docena'] as const;
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409});
/** Factor is always "stock units per one input unit", never inferred from names. */
export function inventoryUnitFactor(from:string,to:string,configured?:number):number{
 if(from===to)return 1;
 const mass:Record<string,number>={kg:1000,g:1},volume:Record<string,number>={litro:1000,ml:1};
 if(mass[from]&&mass[to])return mass[from]/mass[to];
 if(volume[from]&&volume[to])return volume[from]/volume[to];
 if(from==='docena'&&to==='unidad')return 12;
 if(from==='unidad'&&to==='docena')return 1/12;
 if(configured!==undefined && Number.isFinite(configured)&&configured>0)return configured;
 throw fail(`Falta equivalencia explícita de ${from} a ${to} para este artículo`);
}
