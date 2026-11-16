import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
import OtaManager from '@/pages/ota-manager';
import AdminPermisos from '@/pages/admin-permisos';
import {CHANNEX_CAPABILITIES,CHANNEX_ROLE_DEFAULTS} from '@shared/channexAccess';
import '@/index.css';
import {calendarEffective,calendarDays,applyCalendarValues} from '@shared/rate-calendar';
const params=new URLSearchParams(location.search),role=params.get('role')||'admin';
const access={owner:role==='admin',entry:true,...Object.fromEntries(Object.keys(CHANNEX_CAPABILITIES).map(key=>[key,(CHANNEX_ROLE_DEFAULTS[key as keyof typeof CHANNEX_CAPABILITIES] as readonly string[]).includes(role)]))};
const rooms=[{id:'301',roomNumber:'301',roomTypeId:'premium',floor:3},{id:'307',roomNumber:'307',roomTypeId:'premium',floor:3}];
const plans=[{id:'rack',name:'RACK',roomTypeId:'premium',roomType:{name:'Premium'},currency:'USD',baseRate:'119.09',rate1pax:'119.09',rate2pax:'144.98',rate3pax:'152.75'},{id:'ars',name:'RACK ARS',roomTypeId:'premium',roomType:{name:'Premium'},currency:'ARS'}];
(window as any).__otaRequests=[];
const demoBookings=Array.from({length:5},(_,i)=>({revision_id:`rev-${i}`,booking_id:`booking-${i}`,revision_count:i===1?3:1,
 booking_status:i===2?'cancelled':i===1?'modified':'new',status:i===3?'review':'applied',review_code:i===3?'INVALID_ROOM_MAPPING':null,
 acked_at:'2026-11-16T12:30:00Z',created_at:'2026-11-16T12:30:00Z',inserted_at:'2026-11-16T12:25:00Z',
 channel:i===4?'Expedia':'Booking.com',reference:`BK-96001${i}`,guest_name:['Reserva de prueba','María González','Carlos López','Lucía Fernández','Pablo Rodríguez'][i],
 arrival:'2026-12-10',departure:'2026-12-12',amount:i===4?'320.00':'290.00',currency:'USD',
 reservations:i===3?[]:[{id:`pms-${i}`,code:`RES-${100+i}`,guestName:'Huésped de prueba',roomNumber:String(307-i),category:'Premium',checkInDate:'2026-12-10',checkOutDate:'2026-12-12'}]}));
const saved=new Map();
window.fetch=async(input:any,init?:RequestInit)=>{const url=String(input);let data:any=[];const body=init?.body?JSON.parse(String(init.body)):null;(window as any).__otaRequests.push({url,method:init?.method||'GET',body});
 if(url==='/api/channex/access')data=access;
 else if(url==='/api/admin/role-permissions')data={roles:['admin','manager','jefe_recepcion','comercial','reception'],catalog:Object.entries(CHANNEX_CAPABILITIES).map(([key,label])=>({resourceKey:`api:ota:${key}`,label,section:'Canales OTAs'})),grants:Object.entries(CHANNEX_ROLE_DEFAULTS).flatMap(([key,roles])=>roles.map(role=>({role,resourceKey:`api:ota:${key}`})))};
 else if(url==='/api/channex/runtime')data={credentialsStorageReady:true,productionAriEnabled:true,productionInboundEnabled:true};
 else if(url==='/api/channex/connections')data=[{id:'conn',label:'Maran Suites & Towers',environment:'real',isActive:true}];
 else if(url==='/api/room-types')data=[{id:'premium',name:'Premium',maxOccupancy:3}];
 else if(url==='/api/rate-plans')data=plans;
 else if(url.startsWith('/api/rate-calendar')){
 const effective=(id:string,date:string)=>saved.get(id+date)||calendarEffective({id,base_rate:'119.09',currency:'USD',rate_1pax:'119.09',rate_2pax:'144.98',rate_3pax:'152.75'},date);
 if(url.endsWith('/preview')){
 const segments=body.changes.flatMap((change:any)=>change.ratePlanIds.flatMap((id:string)=>calendarDays(change.dateFrom,change.dateTo).map(date=>{const before=effective(id,date);return {ratePlanId:id,dateFrom:date,dateTo:date,before,after:applyCalendarValues(before,change.values,'119.09')};})));
 data={previewToken:'a'.repeat(64),changedCells:segments.length,selectedCells:segments.length,segments};
 }else if(url.endsWith('/apply')){for(const change of body.changes)for(const id of change.ratePlanIds)for(const date of calendarDays(change.dateFrom,change.dateTo))saved.set(id+date,applyCalendarValues(effective(id,date),change.values,'119.09'));data={saved:true};}
 else{const q=new URL(url,location.origin).searchParams;data={cells:calendarDays(q.get('dateFrom')!,q.get('dateTo')!).flatMap(date=>(q.get('ratePlanIds')||'rack').split(',').map(id=>effective(id,date)))};}
 }
 else if(url.endsWith('/usd'))data={quote:{rate:'1545',updatedAt:'2026-11-10T12:00:00Z'},lastEdit:{actor:'Administrador',reason:'Cotización de prueba'}};
 else if(url.endsWith('/usd/preview')||url.endsWith('/usd/apply'))data={previewToken:'b'.repeat(64),exchangeRate:'1545',effectiveFrom:'2026-11-10',plans:[{sourceId:'rack',targetName:'RACK · Booking USD',sourceValues:{base_rate:'184000',rate_1pax:'184000',rate_2pax:'224000',rate_3pax:'236000'},values:{base_rate:'119.09',rate_1pax:'119.09',rate_2pax:'144.98',rate_3pax:'152.75'},before:null,calendarChanges:[]}]};
 else if(url.endsWith('/room-options'))data=rooms;
 else if(url.endsWith('/room-type-mappings'))data=[{id:'m1',channexRoomTypeTitle:'Premium hasta 3 personas',channexRoomTypeId:'remote',roomTypeId:'premium',roomIds:['301']}];
 else if(url.endsWith('/rate-plan-mappings'))data=[{id:'p1',channexRatePlanTitle:'Premium con desayuno',channexRoomTypeId:'remote',ratePlanId:'rack'}];
 else if(url.includes('/inbound/bookings?')){
  const q=new URL(url,location.origin).searchParams;let bookings=demoBookings.filter(r=>(!q.get('search')||`${r.guest_name} ${r.reference}`.toLowerCase().includes(q.get('search')!.toLowerCase()))&&(!q.get('channel')||r.channel===q.get('channel')));
  const counts={all:bookings.length,attention:bookings.filter(r=>r.status==='review').length,new:bookings.filter(r=>r.booking_status==='new').length,modified:bookings.filter(r=>r.booking_status==='modified').length,cancelled:bookings.filter(r=>r.booking_status==='cancelled').length};
  const view=q.get('view');if(view!=='all')bookings=bookings.filter(r=>view==='attention'?r.status==='review':r.booking_status===view);
  data={counts,channels:['Booking.com','Expedia'],bookings,page:1,pageSize:25};
 }
 else if(url.includes('/inbound/assignment/'))data={revisionId:'rev-3',payloadHash:'a'.repeat(64),configurationHash:'b'.repeat(64),reviewCode:'INVALID_ROOM_MAPPING',arrival:'2026-12-10',departure:'2026-12-12',currency:'USD',amount:'290.00',exchangeRate:'1545.000000',settlementTotal:'448050.00',canOverrideScope:true,rooms:[{key:'remote',category:'Premium del canal',mappedCategory:'Premium',occupancy:2,sourceTotal:'290.00',choices:[{id:'307',number:'307',categoryId:'premium',category:'Premium',capacity:2,floor:3,categoryChanged:false,scopeOverride:false},{id:'501',number:'501',categoryId:'suite',category:'Suite Panorámica',capacity:3,floor:5,categoryChanged:true,scopeOverride:true}]}]};
 else if(url.includes('/inbound/assign/')){data={applied:true,reservationIds:['assigned-synthetic']};demoBookings[3].status='applied';demoBookings[3].review_code=null;demoBookings[3].reservations=[{id:'assigned-synthetic',code:'RES-SYNTHETIC',guestName:'Lucía Fernández',roomNumber:'501',category:'Suite Panorámica',checkInDate:'2026-12-10',checkOutDate:'2026-12-12'}];}
 else if(url.includes('/inbound/booking-detail/'))data={notes:'Llegada estimada después de las 22:00. Solicita habitación tranquila.',notesStatus:'available',settlements:[{reservation_id:'pms-0',source_currency:'USD',source_total:'290.00',exchange_rate:'1545.000000',settlement_currency:'ARS',settlement_total:'448050.00',created_at:'2026-11-16T12:30:00Z'}]};
 else if(url.includes('/inbound/history/'))data={total:1,revisions:[demoBookings[0]]};
 else if(url.endsWith('/inbound'))data={serverEnabled:true,settings:{enabled:true,has_token:true},revisions:[{revision_id:'revision-test',booking_id:'booking-test',status:'applied',acked_at:'2026-11-09',reservations:[{id:'r1',guestName:'Reserva de prueba',roomNumber:'301',checkInDate:'2026-11-14',checkOutDate:'2026-11-15'}]}]};
 else if(/\/ari(?:\?|$)/.test(url))data={settings:{floor:3,currency:'ARS',enabled:false,room_ids:null},dispatchEnabled:true,rooms:rooms.map(r=>({...r,roomTypeName:'Premium',channexRoomTypeId:'remote'})),summary:[{status:'pending',count:28}],events:[]};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}>{params.has('matrix')?<AdminPermisos/>:<OtaManager/>}</QueryClientProvider>);
