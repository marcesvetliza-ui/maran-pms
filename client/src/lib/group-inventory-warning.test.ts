import { afterEach, expect, it, vi } from 'vitest';
import { apiRequestWithGroupInventoryWarning } from './queryClient';
const warning={code:'GROUP_BLOCK_WARNING',canOverride:true,warning:{warnings:[{groupId:'ficer',groupName:'FICER',groupStatus:'confirmed',date:'2026-11-24',requested:5}]}};
const response=()=>new Response(JSON.stringify(warning),{status:409});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('explains confirmed unassigned commitments and retries once with operator acceptance',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(Response.json({autoAssigned:3}));vi.stubGlobal('fetch',fetcher);
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true),accepted=vi.fn();
 const body={roomTypeId:'premium',quantity:3};
 expect((await apiRequestWithGroupInventoryWarning('POST','/api/groups/johnson/blocks',body,{onGroupWarningAccepted:accepted})).ok).toBe(true);
 expect(confirm).toHaveBeenCalledTimes(1);expect(confirm.mock.calls[0][0]).toContain('FICER (confirmado)');expect(confirm.mock.calls[0][0]).toContain('sin habitaciones');
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({...body,overrideTentativeGroupWarning:true});expect(body).not.toHaveProperty('overrideTentativeGroupWarning');expect(accepted).toHaveBeenCalledTimes(1);
});
it('cancel stops without retrying or remembering acceptance',async()=>{
 const fetcher=vi.fn().mockResolvedValue(response());vi.stubGlobal('fetch',fetcher);vi.spyOn(window,'confirm').mockReturnValue(false);const accepted=vi.fn();
 await expect(apiRequestWithGroupInventoryWarning('POST','/api/groups/johnson/blocks',{quantity:3},{onGroupWarningAccepted:accepted})).rejects.toThrow();
 expect(fetcher).toHaveBeenCalledTimes(1);expect(accepted).not.toHaveBeenCalled();
});
it('an accepted warning never retries a physical overlap or loops on another warning',async()=>{
 for(const second of [{error:'La habitación ya tiene una reserva',code:'PHYSICAL_ROOM_OVERLAP',canOverride:false},warning]){
  const fetcher=vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response(JSON.stringify(second),{status:409}));vi.stubGlobal('fetch',fetcher);
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
  await expect(apiRequestWithGroupInventoryWarning('POST','/api/reservations',{roomId:'free-room'})).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);expect(confirm).toHaveBeenCalledTimes(1);confirm.mockRestore();
 }
});
