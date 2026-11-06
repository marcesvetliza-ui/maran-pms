export const PRODUCTION_URL='https://app.channex.io/api/v1';
export const DEMO_URL='https://staging.channex.io/api/v1';
export type ChannexOperation='ari'|'inbound';
export function connectionUrl(connection:any):string{
 const url=String(connection.base_url??connection.baseUrl??'').replace(/\/$/,'');
 const env=connection.environment;
 if((env==='real'&&url===PRODUCTION_URL)||(env==='demo'&&url===DEMO_URL))return url;
 throw Error('El entorno y la dirección de Channex no coinciden.');
}
export function productionEnabled(kind:ChannexOperation){return process.env.CHANNEX_PRODUCTION_ENABLED==='true'&&process.env[`CHANNEX_${kind.toUpperCase()}_PRODUCTION_ENABLED`]==='true';}
export function operationAllowed(connection:any,kind:ChannexOperation){
 try{connectionUrl(connection);return connection.environment==='demo'||productionEnabled(kind);}catch{return false;}
}
export function workerEnvironment(kind:ChannexOperation):'real'|'demo'|null{
 if(productionEnabled(kind))return 'real';
 if(process.env[`CHANNEX_${kind.toUpperCase()}_STAGING_ENABLED`]==='true'&&(process.env.CHANNEX_ALLOW_STAGING==='true'||process.env.NODE_ENV==='test'))return 'demo';
 return null;
}
