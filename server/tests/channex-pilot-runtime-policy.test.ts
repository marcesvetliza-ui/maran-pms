import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { initAppEnv,resetAppEnvForTests } from '../app-env';
import { productionEnabled,workerEnvironment,operationAllowed,PRODUCTION_URL,DEMO_URL } from '../channex/connectionPolicy';
beforeEach(()=>{vi.stubEnv('NODE_ENV','production');vi.stubEnv('CHANNEX_ALLOW_STAGING','');vi.stubEnv('CHANNEX_PRODUCTION_ENABLED','');for(const kind of ['ARI','INBOUND']){vi.stubEnv(`CHANNEX_${kind}_PRODUCTION_ENABLED`,'');vi.stubEnv(`CHANNEX_${kind}_STAGING_ENABLED`,'');}});
afterEach(()=>{vi.unstubAllEnvs();resetAppEnvForTests();initAppEnv({APP_ENV:'test',NODE_ENV:'test'});});
const runtime=(env:'pilot'|'production')=>{resetAppEnvForTests();initAppEnv({APP_ENV:env,NODE_ENV:'production'});};
describe('Xenia conserva staging al espejar el código de producción',()=>{
 it.each(['ari','inbound'] as const)('el piloto conserva la habilitación explícita de staging para %s',kind=>{
  runtime('pilot');vi.stubEnv(`CHANNEX_${kind.toUpperCase()}_STAGING_ENABLED`,'true');
  expect(workerEnvironment(kind)).toBe('demo');expect(productionEnabled(kind)).toBe(false);
  expect(operationAllowed({environment:'demo',base_url:DEMO_URL},kind)).toBe(true);
 });
 it.each(['ari','inbound'] as const)('las banderas de producción no convierten el piloto en producción (%s)',kind=>{
  runtime('pilot');vi.stubEnv('CHANNEX_PRODUCTION_ENABLED','true');vi.stubEnv(`CHANNEX_${kind.toUpperCase()}_PRODUCTION_ENABLED`,'true');
  expect(productionEnabled(kind)).toBe(false);expect(workerEnvironment(kind)).toBeNull();
  expect(operationAllowed({environment:'real',base_url:PRODUCTION_URL},kind)).toBe(false);
 });
 it('el piloto no activa staging si antes no estaba habilitado',()=>{runtime('pilot');expect(workerEnvironment('ari')).toBeNull();expect(workerEnvironment('inbound')).toBeNull();});
 it('el comportamiento de producción sigue requiriendo sus dos banderas',()=>{
  runtime('production');vi.stubEnv('CHANNEX_PRODUCTION_ENABLED','true');expect(workerEnvironment('ari')).toBeNull();
  vi.stubEnv('CHANNEX_ARI_PRODUCTION_ENABLED','true');expect(workerEnvironment('ari')).toBe('real');
 });
});
