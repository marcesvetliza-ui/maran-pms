export type HousekeepingBlockConflict = {id:string;guestName:string;checkInDate:string;checkOutDate:string;status:string};
export async function loadHousekeepingBlockConflicts(roomId:string,from:string,to:string):Promise<HousekeepingBlockConflict[]> {
  const response=await fetch(`/api/maintenance/blocks/check-conflicts?roomId=${encodeURIComponent(roomId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{credentials:"include"});
  if(!response.ok)throw new Error("No se pudieron verificar las reservas.");
  const value:unknown=await response.json();
  if(!Array.isArray(value)||value.some(row=>!row||["id","guestName","checkInDate","checkOutDate","status"].some(key=>typeof row[key]!=="string")))
    throw new Error("Respuesta de conflictos inválida.");
  return value;
}
