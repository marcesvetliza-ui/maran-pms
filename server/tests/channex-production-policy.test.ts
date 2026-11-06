import {afterEach,describe,it,expect,vi} from 'vitest';
import {connectionUrl,operationAllowed,workerEnvironment,PRODUCTION_URL,DEMO_URL} from '../channex/connectionPolicy';
import {sendAri} from '../channex/ariWorker';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('production isolation',()=>{
 it('keeps production disabled unless both the global and operation switches are explicit',async()=>{
  vi.stubEnv('CHANNEX_PRODUCTION_ENABLED','');vi.stubEnv('CHANNEX_ARI_PRODUCTION_ENABLED','');vi.stubEnv('CHANNEX_ARI_STAGING_ENABLED','');
  const real={environment:'real',base_url:PRODUCTION_URL};expect(connectionUrl(real)).toBe(PRODUCTION_URL);expect(operationAllowed(real,'ari')).toBe(false);expect(workerEnvironment('ari')).toBeNull();
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(sendAri(real,'availability',[])).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv('CHANNEX_PRODUCTION_ENABLED','true');expect(operationAllowed(real,'ari')).toBe(false);
  vi.stubEnv('CHANNEX_ARI_PRODUCTION_ENABLED','true');expect(operationAllowed(real,'ari')).toBe(true);expect(workerEnvironment('ari')).toBe('real');expect(operationAllowed(real,'inbound')).toBe(false);
 });
 it('rejects credentials sent to a host belonging to a different environment or a custom host',()=>{
  for(const connection of [{environment:'real',base_url:DEMO_URL},{environment:'demo',base_url:PRODUCTION_URL},{environment:'real',base_url:'https://example.com/api/v1'}])expect(()=>connectionUrl(connection)).toThrow();
 });
});
