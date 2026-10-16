/** Deterministic largest-remainder allocation in integer cents; order breaks ties. */
export function allocateFundingCents(total:number,capacities:number[]):number[] {
 if(!Number.isSafeInteger(total)||total<0||capacities.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error("Importes en centavos inválidos");
 const capacity=capacities.reduce((n,v)=>n+BigInt(v),0n),target=BigInt(total);
 if(target>capacity)throw new Error("El importe supera la cobertura disponible");
 if(!capacity)return capacities.map(()=>0);
 const rows=capacities.map((n,index)=>({index,value:BigInt(n)*target/capacity,remainder:BigInt(n)*target%capacity}));
 let remainder=target-rows.reduce((n,r)=>n+r.value,0n);
 for(const r of [...rows].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)) {
  if(!remainder)break;if(r.value<BigInt(capacities[r.index])){r.value++;remainder--;}
 }
 return rows.map(r=>Number(r.value));
}
