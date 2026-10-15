import type { PoolClient } from "pg";
import { FundingError, identifier } from "../contracts";

/** Readiness only: never authenticates, emits, exposes secrets or changes config. */
export async function checkSpaHomologation(client: Pick<PoolClient, "query">, schema = "public") {
  const s = identifier(schema);
  const config = (await client.query(`SELECT arca_ambiente AS environment,
    length(regexp_replace(COALESCE(arca_cuit,cuit,''),'[^0-9]','','g'))=11 AS issuer_ready,
    punto_venta_homolog > 0 AS point_ready,
    length(trim(COALESCE(arca_cert,''))) > 0 AS certificate_ready,
    length(trim(COALESCE(arca_key,''))) > 0 AS key_ready
    FROM ${s}.billing_config ORDER BY id LIMIT 1`)).rows[0];
  if (config?.environment !== "homologacion")
    throw new FundingError("FISCAL_ENVIRONMENT_BLOCKED", "El circuito SPA de prueba requiere homologación. No cambia automáticamente el ambiente fiscal.", 503);
  if (![config.issuer_ready, config.point_ready, config.certificate_ready, config.key_ready].every(v => v === true))
    throw new FundingError("FISCAL_PREPARATION_REQUIRED", "Completá CUIT emisor, PV, certificado y clave de homologación en la configuración fiscal.", 503);
  const points = (await client.query(`SELECT count(*)::int AS n FROM ${s}.pos_configs
    WHERE area='spa' AND activo=true AND tipo='online'`)).rows[0].n;
  if (points !== 1)
    throw new FundingError("FISCAL_PREPARATION_REQUIRED", "Debe existir un único punto de venta online activo para SPA.", 503);
  return { environment: "homologacion" as const, credentialsPresent: true, spaPointReady: true };
}
