import { expect,it } from 'vitest';
import {channelRoomDetails,channelGuestProfile,roomGuests,withChannelBedNotes} from '../channex/roomDetails';
import {parseBookingRevision} from '../channex/bookingRevision';
const note='BED PREFERENCE:Standard Double Room: 2 singoli - Standard Double Room: 1 matrimoniale alla francese';
const payload=()=>({id:'revision',attributes:{property_id:'property',booking_id:'booking',inserted_at:'2026-11-26T12:00:00Z',status:'new',currency:'USD',arrival_date:'2026-12-09',departure_date:'2026-12-10',amount:'195.20',customer:{name:'Booker',surname:'Alpha',mail:'booker@example.invalid'},rooms:[{booking_room_id:'one',room_type_id:'double',rate_plan_id:'rate',occupancy:{adults:1},guests:[{name:'Booker',surname:'Alpha'}],days:{'2026-12-09':'97.60'},meta:{room_remarks:[note]}},{booking_room_id:'two',room_type_id:'double',rate_plan_id:'rate',occupancy:{adults:2},guests:[{name:'Guest',surname:'Beta'}],days:{'2026-12-09':'97.60'},meta:{room_remarks:[note]}}]}});
it('keeps the lead guest of each source unit and the exact confirmed prices',()=>{
 const r=parseBookingRevision(payload(),'property');expect(r.rooms.map(x=>x.guests)).toEqual([[{name:'Booker',surname:'Alpha'}],[{name:'Guest',surname:'Beta'}]]);expect(r.rooms.map(x=>x.totalCents)).toEqual([9760,9760]);
 expect(channelGuestProfile(r.customer!,r.rooms[1].guests)).toMatchObject({firstName:'Guest',lastName:'Beta',email:null,phone:null});
 expect(channelGuestProfile(r.customer!,r.rooms[0].guests)).toMatchObject({email:'booker@example.invalid'});
});
it('marks repeated bed remarks as booking-wide without pairing by array order or occupancy',()=>{
 const raw=payload();for(const key of['one','two'])expect(channelRoomDetails(raw,key).bedRequest).toEqual({text:note,scope:'booking'});
 raw.attributes.rooms.reverse();expect(channelRoomDetails(raw,'two').guestNames).toEqual(['Guest Beta']);expect(channelRoomDetails(raw,'two').bedRequest?.scope).toBe('booking');
});
it('uses a distinct room-specific bed request only for that unit',()=>{
 const raw=payload();raw.attributes.rooms[0].meta.room_remarks=['BED PREFERENCE: Twin beds'];raw.attributes.rooms[1].meta.room_remarks=[];
 expect(channelRoomDetails(raw,'one').bedRequest).toEqual({text:'BED PREFERENCE: Twin beds',scope:'room'});expect(channelRoomDetails(raw,'two').bedRequest).toBeNull();
});
it('keeps an optional private global request separate from ordinary private notes',()=>{
 const raw=payload();raw.attributes.rooms.forEach(r=>r.meta.room_remarks=[]);
 expect(channelRoomDetails(raw,'one','Arrival after 22\nBED PREFERENCE: Twin beds\nprivate contact line').bedRequest).toEqual({text:'BED PREFERENCE: Twin beds',scope:'booking'});
 expect(JSON.stringify(channelRoomDetails(raw,'one','BED PREFERENCE: card 4111111111111111'))).not.toContain('411111');
});
it('falls back without inventing room guests and tolerates optional malformed guest metadata',()=>{
 expect(roomGuests([{name:'***'},{name:'',surname:'Only'},{name:12},null])).toEqual([]);
 const raw=payload();raw.attributes.rooms[1].guests=[];expect(channelRoomDetails(raw,'two')).toMatchObject({guestSource:'booker',guestNames:[],bookerName:'Booker Alpha'});
});
it('preserves reception bed choices and only refreshes untouched channel notes',()=>{
 const details=channelRoomDetails(payload(),'one');
 const first=withChannelBedNotes(details);expect(first.bedTypeNotes).toContain('2 camas individuales');expect(first.bedTypeNotes).toContain('confirmar distribución');
 const local=withChannelBedNotes(details,{bedTypeId:'mat',bedTypeNotes:'Confirmed with reception'});expect(local).not.toHaveProperty('bedTypeNotes');expect(local.otaRoomDetails.importedBedNotes).toBeNull();
 const cleared=withChannelBedNotes({...details,bedRequest:null},{bedTypeNotes:first.bedTypeNotes,otaRoomDetails:first.otaRoomDetails});expect(cleared.bedTypeNotes).toBeNull();
});
it('never changes bed notes behind an existing housekeeping preparation',()=>{
 const details=channelRoomDetails(payload(),'one');
 const result=withChannelBedNotes(details,{bedTypeNotes:null,housekeepingBedPreparation:{bedConfig:'MAT'}});
 expect(result).not.toHaveProperty('bedTypeNotes');expect(result.otaRoomDetails.bedRequest?.scope).toBe('booking');
});
