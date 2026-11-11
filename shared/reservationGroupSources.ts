import { unitParent } from './chargeUnits';
/** Translate proven individual invoice sources to the group's aggregate source ids. */
export function reservationGroupSources(reservationId:string,amounts:Record<string,number>){
 const out:Record<string,number>={};
 for(const [id,value] of Object.entries(amounts||{})){
  const source=id==='accommodation'||id.startsWith('accommodation:')?`reservation:${reservationId}:accommodation`:`reservation:${reservationId}:charge:${unitParent(id)||id}`;
  out[source]=Math.round(((out[source]||0)+Number(value))*100)/100;
 }
 return out;
}
