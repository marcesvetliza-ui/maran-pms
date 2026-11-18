import {describe,it,expect} from 'vitest';
import {hospitalityNotificationAreas,hospitalityNotificationLink,hospitalityRequestAreas,hospitalityStayIsRelevant} from './hospitalityNotifications';
describe('Hospitality bell routing',()=>{
 it('routes to the exact task without interpreting identifiers as URLs',()=>{
  expect(hospitalityNotificationLink({type:'hospitality_alert',relatedEntityType:'hospitality_alert',relatedEntityId:'a/b &x'})).toBe('/hospitality?tab=dashboard&alertId=a%2Fb%20%26x');
  expect(hospitalityNotificationLink({type:'hospitality_alert',relatedEntityType:'hospitality_stay_note',relatedEntityId:'note'})).toBe('/hospitality?tab=stay-notes&noteId=note');
  expect(hospitalityNotificationLink({type:'web_checkin',relatedEntityType:'reservation',relatedEntityId:'r'})).toBe(null);
 });
 it('lets reception coordinate and restricts operational roles to their area',()=>{
  expect(hospitalityNotificationAreas('reception',true)).toBe(null);
  expect(hospitalityNotificationAreas('admin',false)).toEqual([]);
  expect(hospitalityNotificationAreas('restaurant',true)).toEqual(['restaurant','all']);
  expect(hospitalityNotificationAreas('ama_de_llaves',true)).toEqual(['housekeeping','all']);
 });
 it('respects explicit areas and assigns general requests to the responsible area',()=>{
  expect(hospitalityRequestAreas('habitacion',['all'])).toEqual(['housekeeping']);
  expect(hospitalityRequestAreas('alimentacion',['all'])).toEqual(['restaurant']);
  expect(hospitalityRequestAreas('servicio',['spa','spa','invalid'])).toEqual(['spa']);
  expect(hospitalityRequestAreas('otro',[])).toEqual([]);
 });
});

it.each(['confirmed','reserved','web_checkin'])('keeps %s arrivals visible when opening a bell task',status=>{
 expect(hospitalityStayIsRelevant({status,checkInDate:'2034-01-16'},'2034-01-15','2034-01-22')).toBe(true);
 expect(hospitalityStayIsRelevant({status,checkInDate:'2034-02-01'},'2034-01-15','2034-01-22')).toBe(false);
});
it.each(['cancelled','checked_out','no_show','tentative'])('excludes %s stays from the active preparation dashboard',status=>{
 expect(hospitalityStayIsRelevant({status,checkInDate:'2034-01-16'},'2034-01-15','2034-01-22')).toBe(false);
});
