import type { OtaRoomDetails } from '@shared/otaRoomDetails';
import { displayOtaBedRequest } from '@shared/otaRoomDetails';
export type ChannelGuest = { name: string; surname: string };
const clean = (v: unknown, max = 120) => typeof v === 'string' && v.length <= max && !/[\x00-\x1f]/.test(v) && !['***','[redacted]'].includes(v.trim()) ? v.trim() : '';
export function roomGuests(value: unknown): ChannelGuest[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0,20).flatMap(v => {
    const name=clean(v?.name),surname=clean(v?.surname);
    return name ? [{name,surname}] : [];
  });
}
const fullName=(g:ChannelGuest)=>[g.name,g.surname].filter(Boolean).join(' ');
function bedText(value: unknown): string | null {
  if(typeof value!=='string'||value.length>65536||/(?:\d[ -]?){12,19}|\b(?:cvv|cvc|card|tarjeta|credit.?card)\b/i.test(value))return null;
  const lines=value.split(/[\r\n]+/).filter(line=>/^\s*(?:BED PREFERENCE|PREFERENCIA DE CAMAS?)\s*:/i.test(line));
  return lines.length ? [...new Set(lines.map(line=>line.trim()))].join('\n').slice(0,1800) : null;
}
/** Only bed preference lines enter ordinary PMS records. Full private notes
 * remain in the encrypted, separately authorized channel detail. */
export function channelRoomDetails(payload:any, key:string, privateNotes?:string|null):OtaRoomDetails {
 const a=payload?.attributes||{},rooms=Array.isArray(a.rooms)?a.rooms:[];
 const raw=rooms.find((r:any)=>(r.booking_room_id||r.id||(rooms.length===1?'single':null))===key);
 const guests=roomGuests(raw?.guests),booker={name:clean(a.customer?.name),surname:clean(a.customer?.surname)};
 const forRoom=(r:any)=>[...new Set((Array.isArray(r?.meta?.room_remarks)?r.meta.room_remarks:[]).map(bedText).filter(Boolean))].join('\n')||null;
 const own=forRoom(raw),global=bedText(privateNotes)||bedText(a.notes);
 const text=own||global;
 const repeated=!!own&&rooms.length>1&&rooms.filter((r:any)=>forRoom(r)===own).length>1;
 const scope=rooms.length>1&&(!own||repeated)?'booking':'room';
 return {version:1,bookerName:fullName(booker),guestNames:guests.map(fullName),guestSource:guests.length?'room':'booker',guestStatus:'imported',bedRequest:text?{text,scope}:null,importedBedNotes:null};
}
export function channelGuestProfile(customer:{name:string;surname:string;mail?:string|null;phone?:string|null},guests:ChannelGuest[]){
 const lead=guests[0]||customer;
 const same=fullName(lead).toLocaleLowerCase()===fullName(customer).toLocaleLowerCase();
 return {firstName:lead.name,lastName:lead.surname||'—',email:same?customer.mail||null:null,phone:same?customer.phone||null:null};
}
export function withChannelBedNotes(details:OtaRoomDetails, old?:{bedTypeId?:string|null;bedTypeNotes?:string|null;otaRoomDetails?:OtaRoomDetails|null;housekeepingBedPreparation?:unknown}){
 const previous=old?.otaRoomDetails?.importedBedNotes;
 const canWrite=!old?.housekeepingBedPreparation&&!old?.bedTypeId&&(!old?.bedTypeNotes||(!!previous&&old.bedTypeNotes===previous));
 const notes=details.bedRequest ? `${details.bedRequest.scope==='booking'?'Pedido del canal compartido; confirmar distribución':'Pedido de camas del canal'}: ${displayOtaBedRequest(details.bedRequest.text)}`:null;
 return {otaRoomDetails:{...details,importedBedNotes:canWrite?notes:null},...(canWrite?{bedTypeNotes:notes}:{})};
}
