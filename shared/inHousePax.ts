/** Declared pax already includes companions. Registered people are a minimum,
 * never an additional quantity to add to that declaration. */
export function inHousePax(declared:number|null|undefined,companions=0):number {
  const booked=Number.isInteger(declared)&&Number(declared)>0?Number(declared):1;
  const registered=1+(Number.isInteger(companions)&&companions>0?companions:0);
  return Math.max(booked,registered);
}
