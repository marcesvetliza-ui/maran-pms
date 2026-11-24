import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const base = 'https://maranpms.com.ar';
class ProbeCheckError extends Error {}
export async function checkArcaHomologation({password, username = 'admin', fetchImpl = globalThis.fetch}) {
  if (!password) throw new ProbeCheckError('Falta SMOKE_TEST_PASSWORD en GitHub Secrets.');
  let cookie = '';
  try {
    const login = await fetchImpl(`${base}/api/auth/login`, {method: 'POST', redirect: 'manual',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password}), signal: AbortSignal.timeout(20000)});
    if (login.status !== 200) throw new ProbeCheckError(`No se pudo autenticar la prueba en Maran (HTTP ${login.status}).`);
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    if (!cookie || (await login.json().catch(() => ({}))).role !== 'admin') throw new ProbeCheckError('La prueba necesita una sesión de administrador.');
    const response = await fetchImpl(`${base}/api/billing/homologation-check`, {method: 'POST', redirect: 'manual',
      headers: {Cookie: cookie}, signal: AbortSignal.timeout(100000)});
    const report = await response.json().catch(() => ({}));
    if (response.status !== 200 || report.ok !== true || report.ambiente !== 'homologacion'
      || report.documentType !== 'FB' || !Number.isInteger(report.pointOfSale) || report.pointOfSale < 1 || report.pointOfSale > 99998
      || ['authentication','lastAuthorized','authorizedLookup','missingLookup'].some(key => report.checks?.[key] !== 'ok')) {
      const code = /^[A-Z_]{1,60}$/.test(report.code || '') ? report.code : 'INVALID_PROBE_RESULT';
      throw new ProbeCheckError(`La comprobación no quedó aprobada (HTTP ${response.status}; ${code}).`);
    }
    // Explicit projection: never print a server response or session wholesale.
    return {ok: true, environment: 'homologacion', pointOfSale: report.pointOfSale,
      authentication: 'ok', lastAuthorized: 'ok', authorizedLookup: 'ok', missingLookup: 'ok'};
  } finally {
    if (cookie) await fetchImpl(`${base}/api/auth/logout`, {method: 'POST', redirect: 'manual',
      headers: {Cookie: cookie}, signal: AbortSignal.timeout(10000)}).catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await checkArcaHomologation({password: process.env.SMOKE_TEST_PASSWORD, username: process.env.SMOKE_TEST_USER || 'admin'});
    console.log(JSON.stringify(report));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `Prueba autenticada de homologación: aprobada. Punto de venta ${report.pointOfSale}. Autenticación, último autorizado, consulta de CAE y consulta de inexistencia verificadas.\n`);
  } catch (error) {console.error(error instanceof ProbeCheckError ? error.message : 'No se pudo completar la conexión de prueba con Maran.');process.exitCode = 1;}
}
