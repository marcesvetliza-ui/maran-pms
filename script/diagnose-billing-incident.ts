import pg from 'pg';
import {parseArgs} from 'node:util';
import {probeBillingIncident,diagnosticTargets} from '../server/billing/incidentDiagnostic';
const {values}=parseArgs({options:{rooms:{type:'string'},date:{type:'string'},'expect-project':{type:'string'},'expect-environment':{type:'string'}}});
let pool:pg.Pool|undefined,client:pg.PoolClient|undefined;
try {
  if(!values['expect-project'] || !values['expect-environment'] || process.env.RAILWAY_PROJECT_ID!==values['expect-project'] || process.env.RAILWAY_ENVIRONMENT_ID!==values['expect-environment']) throw Error('TARGET_MISMATCH');
  const rooms=(values.rooms||'').split(','),date=values.date||'';
  diagnosticTargets(rooms,date);
  if(!process.env.DATABASE_URL) throw Error('DATABASE_UNAVAILABLE');
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10_000});
  client=await pool.connect();
  console.log('[BILLING_INCIDENT_READONLY]',JSON.stringify(await probeBillingIncident(client,rooms,date)));
} catch(error) {
  // No SQL text, parameters, URLs, keys, tokens or request bodies in logs.
  console.log('[BILLING_INCIDENT_READONLY]',JSON.stringify({ok:false,code:error instanceof Error && ['TARGET_MISMATCH','DATABASE_UNAVAILABLE'].includes(error.message)?error.message:'DIAGNOSTIC_UNAVAILABLE'}));
  process.exitCode=1;
} finally {client?.release();await pool?.end();}
