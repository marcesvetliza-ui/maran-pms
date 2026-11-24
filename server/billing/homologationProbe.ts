import { readLastAuthorizedNumber } from './lastAuthorizedNumber';
import { feCompConsultar } from './wsfevClient';

type Config = { arcaAmbiente?: string | null; arcaCert?: string | null; arcaKey?: string | null; arcaCuit?: string | null; cuit?: string | null; puntoVentaHomolog?: number | null };
type GetToken = (cert: string, key: string, environment: 'homologacion') => Promise<{token: string; sign: string}>;
export class HomologationProbeError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 503) { super(message); }
}
/** Reads ARCA through the PMS's ordinary ticket cache. Never authorizes a
 * voucher, changes a counter, or returns credentials/recipient information. */
export async function probeHomologation(config: Config, getToken: GetToken,
  remote: { fetch: typeof fetch; consult: typeof feCompConsultar } = {fetch: globalThis.fetch, consult: feCompConsultar}) {
  if (config.arcaAmbiente !== 'homologacion')
    throw new HomologationProbeError('HOMOLOGATION_REQUIRED', 'La comprobación requiere el ambiente de homologación.', 409);
  const pointOfSale = config.puntoVentaHomolog;
  const issuer = String(config.arcaCuit || config.cuit || '').replace(/-/g, '');
  if (!config.arcaCert || !config.arcaKey || !/^\d{11}$/.test(issuer)
    || !Number.isInteger(pointOfSale) || Number(pointOfSale) < 1 || Number(pointOfSale) > 99998)
    throw new HomologationProbeError('HOMOLOGATION_CONFIG_INVALID', 'Revisá las credenciales y el punto de venta de homologación.', 409);
  const pv = Number(pointOfSale);
  try {
    const {token, sign} = await getToken(config.arcaCert, config.arcaKey, 'homologacion');
    const auth = `<ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${issuer}</ar:Cuit></ar:Auth>`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await remote.fetch('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', {
        method: 'POST', headers: {'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"'},
        body: `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soapenv:Body><ar:FECompUltimoAutorizado>${auth}<ar:PtoVta>${pv}</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo></ar:FECompUltimoAutorizado></soapenv:Body></soapenv:Envelope>`,
        signal: AbortSignal.timeout(10000),
      });
      const last = await readLastAuthorizedNumber(response, {pointOfSale: pv, documentType: 6});
      const request = {tipo: 'FB', puntoVenta: pv, cuitEmisor: issuer, token, sign};
      if (!last) throw new HomologationProbeError('HOMOLOGATION_NO_HISTORY', 'La serie aún no tiene un comprobante autorizado para verificar su consulta.', 409);
      if (!await remote.consult({...request, numero: last}, 'homologacion'))
        throw new HomologationProbeError('HOMOLOGATION_INCONSISTENT_RESULT', 'ARCA no confirmó el comprobante que informó como último autorizado.');
      // Another operator can authorize the next voucher between our reads.
      // Read the series again rather than treating that race as missing data.
      if (await remote.consult({...request, numero: last + 1}, 'homologacion')) continue;
      return {ok: true, ambiente: 'homologacion' as const, pointOfSale: pv, documentType: 'FB' as const,
        checks: {authentication: 'ok', lastAuthorized: 'ok', authorizedLookup: 'ok', missingLookup: 'ok'}};
    }
    throw new HomologationProbeError('HOMOLOGATION_SERIES_CHANGED', 'La serie cambió durante la comprobación. Reintentá.');
  } catch (error) {
    if (error instanceof HomologationProbeError) throw error;
    // WSAA/WSFE exceptions may contain raw XML or ticket fragments.
    throw new HomologationProbeError('HOMOLOGATION_LOOKUP_FAILED', 'No se pudo verificar la consulta autenticada de homologación. Se conservaron los comprobantes y movimientos.');
  }
}
