import type {SystemNotification} from './schema';
export function hospitalityNotificationLink(n:Pick<SystemNotification,'type'|'relatedEntityType'|'relatedEntityId'>) {
 if(n.type!=='hospitality_alert'||!n.relatedEntityId)return null;
 if(n.relatedEntityType==='hospitality_alert')return `/hospitality?tab=dashboard&alertId=${encodeURIComponent(n.relatedEntityId)}`;
 if(n.relatedEntityType==='hospitality_stay_note')return `/hospitality?tab=stay-notes&noteId=${encodeURIComponent(n.relatedEntityId)}`;
 return null;
}
/** Reception coordinates every preparation; operational areas see their own tasks. */
export function hospitalityNotificationAreas(role:string,allowed:boolean):string[]|null {
 if(!allowed)return [];
 if(['admin','manager','reception','jefe_recepcion','comercial','responsable_area'].includes(role))return null;
 if(['housekeeping','ama_de_llaves'].includes(role))return ['housekeeping','all'];
 if(['restaurant','spa','maintenance'].includes(role))return [role,'all'];
 return ['all'];
}
export function hospitalityRequestAreas(category:string,visibleTo:string[]):string[] {
 const known=['reception','housekeeping','restaurant','spa','maintenance'];
 if(!visibleTo.includes('all'))return [...new Set(visibleTo.filter(a=>known.includes(a)))];
 const defaults:Record<string,string>={habitacion:'housekeeping',amenities:'housekeeping',alimentacion:'restaurant'};
 return [defaults[category]||'reception'];
}

export function hospitalityStayIsRelevant(stay:{status:string;checkInDate:string},today:string,through:string){
 return stay.status==='checked_in'||(['confirmed','reserved','web_checkin'].includes(stay.status)&&stay.checkInDate>=today&&stay.checkInDate<=through);
}
