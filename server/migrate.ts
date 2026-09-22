import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";
import { logger } from "./logger";
import { eq, isNotNull, sql } from "drizzle-orm";
import { channexConnections, type FolioEntityType } from "@shared/schema";
import { encryptChannexApiKey } from "./channex/credentials";

const FOLIO_ENTITY_TYPES: readonly FolioEntityType[] =
  ["reservation", "restaurant_order", "spa_account", "group", "event", "company", "agency"];

/**
 * Serializes catalog-check + DDL batches across concurrently starting app
 * instances. The transaction-scoped lock is released with the implicit
 * transaction containing this multi-statement query, so it is pooler-safe.
 */
export function serializeIncrementalDdl(ddl: string): string {
  return `
    SELECT pg_advisory_xact_lock(1296126535, 1);
    ${ddl}
  `;
}

export function createIndexWithoutRerunNotice(indexName: string, createIndexSql: string): string {
  const escapedIndexName = indexName.replaceAll("'", "''");
  const escapedCreateSql = createIndexSql.replaceAll("'", "''");

  return serializeIncrementalDdl(`
    DO $$
    BEGIN
      IF to_regclass('${escapedIndexName}') IS NULL THEN
        EXECUTE '${escapedCreateSql}';
      END IF;
    END $$
  `);
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

export const COMPANY_OPENING_BALANCES_2026_09_18 = [
  { code: "11749", name: "ASOCIACION MUTUAL MODELO DE ENTRE RIOS", amount: "1254500.16", aliases: ["ASOCIACION MUTUAL MODELO DE ENTRE RIOS"] },
  { code: "111177", name: "B GAMING S.A.", amount: "268000.00", aliases: ["B GAMING S.A."] },
  { code: "11891", name: "BANCO DE SANTA CRUZ SA", amount: "535500.00", aliases: ["BANCO DE SANTA CRUZ SA"] },
  { code: "11135809", name: "CAMARA DE INDUSTRIA Y COMERCIO ARGENTINO", amount: "1679450.00", aliases: ["CAMARA DE INDUSTRIA Y COMERCIO ARGENTINO"] },
  { code: "111901", name: "CLUB DE VOLANTES ENTRERRIANOS", amount: "4417187.00", aliases: ["CLUB DE VOLANTES ENTRERRIANOS"] },
  { code: "112094", name: "CONSEJO PROF. DE CS ECON. ENTRE RIOS", amount: "250000.00", aliases: ["CONSEJO PROF. DE CS ECON. ENTRE RIOS", "CONSEJO PROFESIONAL DE CS ECO DE ER"] },
  { code: "112519", name: "DESPEGAR.COM.AR SA", amount: "2198632.60", aliases: ["DESPEGAR.COM.AR SA"] },
  { code: "112973", name: "ENER SA", amount: "2396000.13", aliases: ["ENER SA"] },
  { code: "113029", name: "ERIOCHEM S.A.", amount: "1053000.00", aliases: ["ERIOCHEM S.A.", "ERIOCHEM SA"] },
  { code: "113195", name: "F.A.D.R.A", amount: "1306500.00", aliases: ["F.A.D.R.A"] },
  { code: "11124128", name: "FGPC SRL", amount: "168500.00", aliases: ["FGPC SRL"] },
  { code: "11136329", name: "FONDO INTERNACIONAL DE DESARROLLO AGRICOLA", amount: "418840.00", aliases: ["FONDO INTERNACIONAL DE DESARROLLO AGRICOLA"] },
  { code: "11133146", name: "FUNDACION MIRADORTEC - PARQUE TECNOLOGICO", amount: "4351700.04", aliases: ["FUNDACION MIRADORTEC - PARQUE TECNOLOGICO", "FUNDACION MIRADORTEC PARQUE TECNOLOGICO"] },
  { code: "113651", name: "FUNDACION UNIVERSIDAD CATOLICA ARGENTINA", amount: "608000.00", aliases: ["FUNDACION UNIVERSIDAD CATOLICA ARGENTINA", "UNIVERSIDAD CATOLICA ARGENTINA SEDE PARANA"] },
  { code: "113800", name: "GBT II ARGENTINA S.R.L", amount: "1338500.00", aliases: ["GBT II ARGENTINA S.R.L"] },
  { code: "114082", name: "GRUPO SAN MARCOS SRL", amount: "546000.00", aliases: ["GRUPO SAN MARCOS SRL"] },
  { code: "114529", name: "INSTITUTO AUTARQUICO PROV. DEL SEGURO", amount: "6211500.11", aliases: ["INSTITUTO AUTARQUICO PROV. DEL SEGURO", "IAPSER"] },
  { code: "114331", name: "ITS INTERNATIONAL SERVICES SA", amount: "814000.00", aliases: ["ITS INTERNATIONAL SERVICES SA"] },
  { code: "114705", name: "JOHNSON ACERO S.A.", amount: "2425200.10", aliases: ["JOHNSON ACERO S.A.", "JOHNSON ACERO SA"] },
  { code: "11126237", name: "MEDIA SERVICIOS S.A.", amount: "6240000.00", aliases: ["MEDIA SERVICIOS S.A."] },
  { code: "11134775", name: "MINISTERIO DE TURISMO DE URUGUAY", amount: "1566500.00", aliases: ["MINISTERIO DE TURISMO DE URUGUAY"] },
  { code: "1182734", name: "MONTI CARLOS NORBERTO", amount: "160500.00", aliases: ["MONTI CARLOS NORBERTO"] },
  { code: "116261", name: "NUEVO BANCO DE ENTRE RIOS SA", amount: "2745600.04", aliases: ["NUEVO BANCO DE ENTRE RIOS SA"] },
  { code: "116409", name: "OSDE ORGANIZACION DE SERVICIOS DIRECTOS", amount: "275000.00", aliases: ["OSDE ORGANIZACION DE SERVICIOS DIRECTOS", "OSDE ORGANIZACION DE SERVICIOS DIRECTOS EMPRESARIOS"] },
  { code: "116527", name: "PAPELERA ENTRE RIOS S.A", amount: "983400.06", aliases: ["PAPELERA ENTRE RIOS S.A", "PAPELERA ER SA"] },
  { code: "1198703", name: "PARACIMA PRODUCCIONES SAS", amount: "377300.00", aliases: ["PARACIMA PRODUCCIONES SAS"] },
  { code: "116942", name: "PUNTO TURISTICO SA", amount: "1693000.00", aliases: ["PUNTO TURISTICO SA"] },
  { code: "117623", name: "SECAR SECURITY ARGENTINA S.A.", amount: "728000.00", aliases: ["SECAR SECURITY ARGENTINA S.A.", "SECAR SECURITY ARGENTINA SA"] },
  { code: "115911", name: "Secretaria De Trabajo De La Provincia De Entre Rios", amount: "316000.00", aliases: ["Secretaria De Trabajo De La Provincia De Entre Rios"] },
  { code: "1174120", name: "UNER", amount: "134000.00", aliases: ["UNER"] },
] as const;

const companyOpeningBalanceValuesSql = COMPANY_OPENING_BALANCES_2026_09_18.map((row) => {
  if (!/^\d+$/.test(row.code) || !/^\d+\.\d{2}$/.test(row.amount)) {
    throw new Error(`Saldo inicial de empresa inválido: ${row.code}`);
  }
  const aliasesSql = row.aliases
    .map((alias) => `'${escapeSqlLiteral(alias)}'`)
    .join(", ");
  return `('${row.code}', '${escapeSqlLiteral(row.name)}', ${row.amount}::numeric, ARRAY[${aliasesSql}]::text[])`;
}).join(",\n        ");

export const COMPANY_OPENING_BALANCES_2026_09_18_SQL = serializeIncrementalDdl(`
  SET LOCAL lock_timeout = '8s';
  SET LOCAL statement_timeout = '30s';

  DO $migration$
  DECLARE
    opening record;
    matched_company_id varchar;
    matched_count integer;
    imported_count integer := 0;
    imported_total numeric := 0;
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM audit_logs
      WHERE action = 'IMPORT_OPENING_BALANCES'
        AND module = 'cuenta_corriente'
        AND details LIKE '%OPENING-COMPANY-2026-09-18%'
    ) THEN
      RETURN;
    END IF;

    LOCK TABLE companies, account_movements, account_movement_allocations
      IN ACCESS EXCLUSIVE MODE;

    FOR opening IN
      SELECT *
      FROM (VALUES
        ${companyOpeningBalanceValuesSql}
      ) AS source(legacy_code, company_name, amount, aliases)
    LOOP
      SELECT count(*), min(c.id)
      INTO matched_count, matched_company_id
      FROM companies c
      WHERE regexp_replace(lower(translate(coalesce(c.razon_social, ''), 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
        = ANY (
          SELECT regexp_replace(lower(translate(alias, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          FROM unnest(opening.aliases) AS alias
        );

      IF matched_count > 1 THEN
        RAISE EXCEPTION
          'Importación de saldos detenida: la empresa % tiene % coincidencias',
          opening.company_name,
          matched_count;
      END IF;

      IF matched_count = 0 THEN
        INSERT INTO companies (
          razon_social,
          nombre_fantasia,
          cuil_cuit,
          pais,
          condicion_iva,
          payment_term_days,
          condicion_venta_predeterminada,
          regimen_hospedaje,
          notes,
          is_active,
          created_at
        ) VALUES (
          opening.company_name,
          opening.company_name,
          '',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          'Creada desde saldo inicial; cuenta legacy ' || opening.legacy_code,
          'true',
          now()
        )
        RETURNING id INTO matched_company_id;
      END IF;
    END LOOP;

    DELETE FROM account_movement_allocations allocation
    WHERE EXISTS (
      SELECT 1 FROM account_movements movement
      WHERE movement.id = allocation.pago_id
        AND movement.entity_type = 'company'
    )
    OR EXISTS (
      SELECT 1 FROM account_movements movement
      WHERE movement.id = allocation.cargo_id
        AND movement.entity_type = 'company'
    );

    DELETE FROM account_movements WHERE entity_type = 'company';

    FOR opening IN
      SELECT *
      FROM (VALUES
        ${companyOpeningBalanceValuesSql}
      ) AS source(legacy_code, company_name, amount, aliases)
    LOOP
      SELECT count(*), min(c.id)
      INTO matched_count, matched_company_id
      FROM companies c
      WHERE regexp_replace(lower(translate(coalesce(c.razon_social, ''), 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
        = ANY (
          SELECT regexp_replace(lower(translate(alias, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          FROM unnest(opening.aliases) AS alias
        );

      IF matched_count <> 1 THEN
        RAISE EXCEPTION
          'Importación de saldos detenida: la empresa % tiene % coincidencias al insertar',
          opening.company_name,
          matched_count;
      END IF;

      INSERT INTO account_movements (
        entity_type,
        entity_id,
        date,
        type,
        description,
        amount,
        reference,
        created_by,
        created_at
      ) VALUES (
        'company',
        matched_company_id,
        DATE '2026-09-18',
        'cargo',
        'Saldo inicial al 18/09/2026',
        opening.amount,
        'OPENING-COMPANY-2026-09-18',
        'system-import',
        now()
      );

      imported_count := imported_count + 1;
      imported_total := imported_total + opening.amount;
    END LOOP;

    IF imported_count <> 30 OR imported_total <> 47460310.24::numeric THEN
      RAISE EXCEPTION
        'Importación de saldos detenida: resultado % empresas, total %',
        imported_count,
        imported_total;
    END IF;

    IF EXISTS (
      SELECT entity_id
      FROM account_movements
      WHERE entity_type = 'company'
      GROUP BY entity_id
      HAVING count(*) <> 1
    ) OR (
      SELECT count(*) FROM account_movements WHERE entity_type = 'company'
    ) <> 30 THEN
      RAISE EXCEPTION 'Importación de saldos detenida: movimientos duplicados o residuales';
    END IF;

    INSERT INTO audit_logs (
      user_name,
      action,
      module,
      entity_type,
      description,
      details,
      "timestamp"
    ) VALUES (
      'system-import',
      'IMPORT_OPENING_BALANCES',
      'cuenta_corriente',
      'company',
      'Importación de saldos iniciales de empresas',
      'OPENING-COMPANY-2026-09-18; 30 empresas; fecha 18/09/2026; total 47460310.24',
      now()
    );
  END
  $migration$;
`);

export async function importCompanyOpeningBalances20260918() {
  try {
    await db.execute(sql.raw(COMPANY_OPENING_BALANCES_2026_09_18_SQL));
    const { rows } = await db.execute(sql`
      SELECT
        count(*)::int AS count,
        coalesce(sum(amount), 0)::numeric(14,2)::text AS total,
        EXISTS (
          SELECT 1 FROM audit_logs
          WHERE action = 'REALLOCATE_OPENING_BALANCES'
            AND details LIKE '%OPENING-CC-REALLOCATION-2026-09-18%'
        ) AS reallocated
      FROM account_movements
      WHERE entity_type = 'company'
        AND reference = 'OPENING-COMPANY-2026-09-18'
    `);
    const count = Number((rows[0] as any)?.count ?? 0);
    const total = String((rows[0] as any)?.total ?? "0");
    const reallocated = Boolean((rows[0] as any)?.reallocated);
    const expectedCount = reallocated ? 25 : 30;
    const expectedTotal = reallocated ? "40870177.64" : "47460310.24";
    if (count !== expectedCount || total !== expectedTotal) {
      throw new Error(`verificación posterior inválida: ${count} movimientos, total ${total}`);
    }
    logger.info(`Saldos iniciales de empresas verificados: ${count} movimientos, total ${total}.`);
  } catch (cause: any) {
    throw Object.assign(
      new Error(`No se pudieron importar los saldos iniciales de empresas: ${cause?.message ?? cause}`),
      {
        code: "COMPANY_OPENING_BALANCE_IMPORT_FAILED",
        cause,
      },
    );
  }
}

export const AGENCY_OPENING_BALANCES_2026_09_18 = [
  { companyName: "GBT II ARGENTINA S.R.L", agencyName: "GBT II ARGENTINA S.R.L", tradeName: "GLOBAL BUSINESS TRAVEL", cuit: "30714466603", amount: "1338500.00" },
  { companyName: "GRUPO SAN MARCOS SRL", agencyName: "GRUPO SAN MARCOS SRL", tradeName: "KEEPERS TRAVEL", cuit: "30714516546", amount: "546000.00" },
  { companyName: "DESPEGAR.COM.AR SA", agencyName: "DESPEGAR.COM.AR SA", tradeName: "DESPEGAR", cuit: "30701307115", amount: "2198632.60" },
  { companyName: "ITS INTERNATIONAL SERVICES SA", agencyName: "ITS INTERNATIONAL SERVICES SA", tradeName: "PEZZATTI", cuit: "30676757917", amount: "814000.00" },
  { companyName: "PUNTO TURISTICO SA", agencyName: "PUNTO TURISTICO SA", tradeName: "PUNTO TURISTICO", cuit: "30698479252", amount: "1693000.00" },
] as const;

const agencyCompanyNames = new Set<string>(
  AGENCY_OPENING_BALANCES_2026_09_18.map((row) => row.companyName),
);
const remainingCompanyOpeningBalanceValuesSql = COMPANY_OPENING_BALANCES_2026_09_18
  .filter((row) => !agencyCompanyNames.has(row.name))
  .map((row) => {
    const aliasesSql = row.aliases
      .map((alias) => `'${escapeSqlLiteral(alias)}'`)
      .join(", ");
    return `('${row.code}', '${escapeSqlLiteral(row.name)}', ${row.amount}::numeric, ARRAY[${aliasesSql}]::text[])`;
  })
  .join(",\n        ");
const agencyOpeningBalanceValuesSql = AGENCY_OPENING_BALANCES_2026_09_18
  .map((row) => `('${escapeSqlLiteral(row.companyName)}', '${escapeSqlLiteral(row.agencyName)}', '${escapeSqlLiteral(row.tradeName)}', '${row.cuit}', ${row.amount}::numeric)`)
  .join(",\n        ");

export const CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL = serializeIncrementalDdl(`
  SET LOCAL lock_timeout = '8s';
  SET LOCAL statement_timeout = '30s';

  DO $migration$
  DECLARE
    opening record;
    matched_company_id varchar;
    matched_agency_id varchar;
    matched_count integer;
    company_count integer := 0;
    company_total numeric := 0;
    agency_count integer := 0;
    agency_total numeric := 0;
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM audit_logs
      WHERE action = 'REALLOCATE_OPENING_BALANCES'
        AND module = 'cuenta_corriente'
        AND details LIKE '%OPENING-CC-REALLOCATION-2026-09-18%'
    ) THEN
      RETURN;
    END IF;

    LOCK TABLE
      companies,
      agencies,
      guests,
      reservations,
      payments,
      events,
      account_movements,
      account_movement_allocations
      IN ACCESS EXCLUSIVE MODE;

    FOR opening IN
      SELECT *
      FROM (VALUES
        ${remainingCompanyOpeningBalanceValuesSql}
      ) AS source(legacy_code, company_name, amount, aliases)
    LOOP
      SELECT count(*), min(c.id)
      INTO matched_count, matched_company_id
      FROM companies c
      WHERE regexp_replace(lower(translate(coalesce(c.razon_social, ''), 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
        = ANY (
          SELECT regexp_replace(lower(translate(alias, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          FROM unnest(opening.aliases) AS alias
        );
      IF matched_count <> 1 THEN
        RAISE EXCEPTION
          'Reasignación detenida: la empresa % tiene % coincidencias',
          opening.company_name,
          matched_count;
      END IF;
    END LOOP;

    FOR opening IN
      SELECT *
      FROM (VALUES
        ${agencyOpeningBalanceValuesSql}
      ) AS source(company_name, agency_name, trade_name, cuit, amount)
    LOOP
      SELECT count(*), min(c.id)
      INTO matched_count, matched_company_id
      FROM companies c
      WHERE regexp_replace(lower(translate(c.razon_social, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(translate(opening.company_name, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g');
      IF matched_count <> 1 THEN
        RAISE EXCEPTION
          'Reasignación detenida: la empresa-agencia % tiene % fichas de empresa',
          opening.company_name,
          matched_count;
      END IF;

      SELECT count(*), min(a.id)
      INTO matched_count, matched_agency_id
      FROM agencies a
      WHERE regexp_replace(lower(translate(a.razon_social, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(translate(opening.agency_name, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g');
      IF matched_count > 1 THEN
        RAISE EXCEPTION
          'Reasignación detenida: la agencia % tiene % coincidencias',
          opening.agency_name,
          matched_count;
      END IF;

      IF matched_count = 0 THEN
        INSERT INTO agencies (
          razon_social,
          nombre_fantasia,
          cuil_cuit,
          notes,
          is_active,
          created_at
        ) VALUES (
          opening.agency_name,
          opening.trade_name,
          opening.cuit,
          'Creada al reclasificar saldo inicial desde Empresas',
          'true',
          now()
        )
        RETURNING id INTO matched_agency_id;
      END IF;

      IF EXISTS (
        SELECT 1 FROM guests
        WHERE company_id = matched_company_id
          AND agency_id IS NOT NULL
          AND agency_id <> matched_agency_id
      ) OR EXISTS (
        SELECT 1 FROM reservations
        WHERE company_id = matched_company_id
          AND agency_id IS NOT NULL
          AND agency_id <> matched_agency_id
      ) OR EXISTS (
        SELECT 1 FROM payments
        WHERE company_id = matched_company_id
          AND agency_id IS NOT NULL
          AND agency_id <> matched_agency_id
      ) THEN
        RAISE EXCEPTION
          'Reasignación detenida: % tiene referencias con otra agencia',
          opening.company_name;
      END IF;
    END LOOP;

    FOR opening IN
      SELECT *
      FROM (VALUES
        ${agencyOpeningBalanceValuesSql}
      ) AS source(company_name, agency_name, trade_name, cuit, amount)
    LOOP
      SELECT min(c.id), min(a.id)
      INTO matched_company_id, matched_agency_id
      FROM companies c
      CROSS JOIN agencies a
      WHERE regexp_replace(lower(translate(c.razon_social, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(translate(opening.company_name, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
        AND regexp_replace(lower(translate(a.razon_social, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(translate(opening.agency_name, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g');

      UPDATE guests
      SET company_id = NULL, agency_id = matched_agency_id
      WHERE company_id = matched_company_id;

      UPDATE reservations
      SET company_id = NULL, agency_id = matched_agency_id
      WHERE company_id = matched_company_id;

      UPDATE payments
      SET
        company_id = NULL,
        agency_id = matched_agency_id,
        billing_target = CASE WHEN billing_target = 'company' THEN 'agency' ELSE billing_target END
      WHERE company_id = matched_company_id;

      UPDATE events
      SET company_id = NULL
      WHERE company_id = matched_company_id;
    END LOOP;

    DELETE FROM account_movement_allocations;
    DELETE FROM account_movements;

    FOR opening IN
      SELECT *
      FROM (VALUES
        ${remainingCompanyOpeningBalanceValuesSql}
      ) AS source(legacy_code, company_name, amount, aliases)
    LOOP
      SELECT min(c.id)
      INTO matched_company_id
      FROM companies c
      WHERE regexp_replace(lower(translate(coalesce(c.razon_social, ''), 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
        = ANY (
          SELECT regexp_replace(lower(translate(alias, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          FROM unnest(opening.aliases) AS alias
        );

      INSERT INTO account_movements (
        entity_type, entity_id, date, type, description, amount, reference, created_by, created_at
      ) VALUES (
        'company',
        matched_company_id,
        DATE '2026-09-18',
        'cargo',
        'Saldo inicial al 18/09/2026',
        opening.amount,
        'OPENING-COMPANY-2026-09-18',
        'system-import',
        now()
      );
      company_count := company_count + 1;
      company_total := company_total + opening.amount;
    END LOOP;

    FOR opening IN
      SELECT *
      FROM (VALUES
        ${agencyOpeningBalanceValuesSql}
      ) AS source(company_name, agency_name, trade_name, cuit, amount)
    LOOP
      SELECT min(a.id)
      INTO matched_agency_id
      FROM agencies a
      WHERE regexp_replace(lower(translate(a.razon_social, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(translate(opening.agency_name, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g');

      INSERT INTO account_movements (
        entity_type, entity_id, date, type, description, amount, reference, created_by, created_at
      ) VALUES (
        'agency',
        matched_agency_id,
        DATE '2026-09-18',
        'cargo',
        'Saldo inicial al 18/09/2026',
        opening.amount,
        'OPENING-AGENCY-2026-09-18',
        'system-import',
        now()
      );
      agency_count := agency_count + 1;
      agency_total := agency_total + opening.amount;
    END LOOP;

    IF company_count <> 25 OR company_total <> 40870177.64::numeric
       OR agency_count <> 5 OR agency_total <> 6590132.60::numeric THEN
      RAISE EXCEPTION
        'Reasignación detenida: empresas %/% agencias %/%',
        company_count, company_total, agency_count, agency_total;
    END IF;

    DELETE FROM companies c
    WHERE EXISTS (
      SELECT 1
      FROM (VALUES
        ${agencyOpeningBalanceValuesSql}
      ) AS source(company_name, agency_name, trade_name, cuit, amount)
      WHERE regexp_replace(lower(translate(c.razon_social, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(translate(source.company_name, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
    );

    IF (SELECT count(*) FROM account_movements WHERE entity_type = 'company') <> 25
       OR (SELECT coalesce(sum(amount), 0) FROM account_movements WHERE entity_type = 'company') <> 40870177.64::numeric
       OR (SELECT count(*) FROM account_movements WHERE entity_type = 'agency') <> 5
       OR (SELECT coalesce(sum(amount), 0) FROM account_movements WHERE entity_type = 'agency') <> 6590132.60::numeric
       OR EXISTS (SELECT 1 FROM account_movements WHERE entity_type = 'guest') THEN
      RAISE EXCEPTION 'Reasignación detenida: los saldos finales no coinciden';
    END IF;

    INSERT INTO audit_logs (
      user_name, action, module, entity_type, description, details, "timestamp"
    ) VALUES (
      'system-import',
      'REALLOCATE_OPENING_BALANCES',
      'cuenta_corriente',
      'company_agency_guest',
      'Reasignación de saldos iniciales de empresas a agencias y limpieza de clientes',
      'OPENING-CC-REALLOCATION-2026-09-18; empresas 25/40870177.64; agencias 5/6590132.60; clientes 0',
      now()
    );
  END
  $migration$;
`);

export const CURRENT_ACCOUNT_REALLOCATION_2026_09_18_POSTCHECK_SQL = `
  SELECT
    count(*) FILTER (
      WHERE entity_type = 'company'
        AND reference = 'OPENING-COMPANY-2026-09-18'
    )::int AS company_count,
    coalesce(sum(amount) FILTER (
      WHERE entity_type = 'company'
        AND reference = 'OPENING-COMPANY-2026-09-18'
    ), 0)::numeric(14,2)::text AS company_total,
    count(*) FILTER (
      WHERE entity_type = 'agency'
        AND reference = 'OPENING-AGENCY-2026-09-18'
    )::int AS agency_count,
    coalesce(sum(amount) FILTER (
      WHERE entity_type = 'agency'
        AND reference = 'OPENING-AGENCY-2026-09-18'
    ), 0)::numeric(14,2)::text AS agency_total,
    (
      SELECT count(*)::int
      FROM companies c
      WHERE regexp_replace(lower(translate(c.razon_social, 'áéíóúüñ.', 'aeiouun')), '[^a-z0-9]+', '', 'g')
        = ANY (ARRAY[
          'gbtiiargentinasrl',
          'gruposanmarcossrl',
          'despegarcomarsa',
          'itsinternationalservicessa',
          'puntoturisticosa'
        ])
    ) AS duplicate_company_count,
    EXISTS (
      SELECT 1 FROM audit_logs
      WHERE action = 'REALLOCATE_OPENING_BALANCES'
        AND details LIKE '%OPENING-CC-REALLOCATION-2026-09-18%'
    ) AS audit_exists
  FROM account_movements
`;

export function assertCurrentAccountReallocationPostcheck(result: any) {
  if (
    Number(result?.company_count) !== 25
    || String(result?.company_total) !== "40870177.64"
    || Number(result?.agency_count) !== 5
    || String(result?.agency_total) !== "6590132.60"
    || Number(result?.duplicate_company_count) !== 0
    || result?.audit_exists !== true
  ) {
    throw new Error(`verificación posterior inválida: ${JSON.stringify(result)}`);
  }
}

export async function reallocateCurrentAccountOpeningBalances20260918() {
  try {
    await db.execute(sql.raw(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL));
    const { rows } = await db.execute(
      sql.raw(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_POSTCHECK_SQL),
    );
    const result = rows[0] as any;
    assertCurrentAccountReallocationPostcheck(result);
    logger.info(
      "Cuentas corrientes verificadas: empresas 25/$40870177.64, agencias 5/$6590132.60, clientes $0.",
    );
  } catch (cause: any) {
    throw Object.assign(
      new Error(`No se pudieron reasignar los saldos de cuentas corrientes: ${cause?.message ?? cause}`),
      {
        code: "CURRENT_ACCOUNT_REALLOCATION_FAILED",
        cause,
      },
    );
  }
}

/**
 * PostgreSQL's native DROP ... IF EXISTS always emits a NOTICE when the
 * object is absent — unlike CREATE ... IF NOT EXISTS, this has no "quiet"
 * native form. A retired legacy object (e.g. a constraint replaced by a
 * partial index) stays absent on every future startup, so the native form
 * would log a misleading "does not exist, skipping" notice on every run
 * forever, not just once.
 */
export function dropConstraintWithoutRerunNotice(tableName: string, constraintName: string): string {
  return serializeIncrementalDdl(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${escapeSqlLiteral(constraintName)}'
          AND conrelid = '${escapeSqlLiteral(tableName)}'::regclass
      ) THEN
        EXECUTE 'ALTER TABLE ${escapeSqlLiteral(tableName)} DROP CONSTRAINT ${escapeSqlLiteral(constraintName)}';
      END IF;
    END $$
  `);
}

export function dropIndexWithoutRerunNotice(indexName: string): string {
  return serializeIncrementalDdl(`
    DO $$
    BEGIN
      IF to_regclass('${escapeSqlLiteral(indexName)}') IS NOT NULL THEN
        EXECUTE 'DROP INDEX ${escapeSqlLiteral(indexName)}';
      END IF;
    END $$
  `);
}

export function createTableWithoutRerunNotice(tableName: string, createTableSql: string): string {
  return serializeIncrementalDdl(`
    DO $$
    BEGIN
      IF to_regclass('${escapeSqlLiteral(tableName)}') IS NULL THEN
        EXECUTE '${escapeSqlLiteral(createTableSql)}';
      END IF;
    END $$
  `);
}

export function addColumnWithoutRerunNotice(
  tableName: string,
  columnName: string,
  columnDefinition: string,
): string {
  return serializeIncrementalDdl(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = '${escapeSqlLiteral(tableName)}'::regclass
          AND attname = '${escapeSqlLiteral(columnName)}'
          AND NOT attisdropped
      ) THEN
        EXECUTE 'ALTER TABLE ${escapeSqlLiteral(tableName)} ADD COLUMN ${escapeSqlLiteral(columnName)} ${escapeSqlLiteral(columnDefinition)}';
      END IF;
    END $$
  `);
}

export function createSequenceWithoutRerunNotice(sequenceName: string): string {
  return serializeIncrementalDdl(`
    DO $$
    BEGIN
      IF to_regclass('${escapeSqlLiteral(sequenceName)}') IS NULL THEN
        EXECUTE 'CREATE SEQUENCE ${escapeSqlLiteral(sequenceName)}';
      END IF;
    END $$
  `);
}

/**
 * Converts an incremental CREATE TABLE / CREATE SEQUENCE / ADD COLUMN
 * statement to catalog-guarded DDL. PostgreSQL's native IF NOT EXISTS form
 * emits a NOTICE on a rerun, which makes a healthy startup look like a failed
 * migration.
 *
 * This deliberately creates one guarded ALTER statement per column. Besides
 * avoiding notices, that means an existing column cannot prevent later
 * columns in the same historical multi-column migration from being added.
 */
export function incrementalDdlWithoutRerunNotice(ddl: string): string {
  const tableMatch = ddl.match(/^\s*CREATE\s+TABLE\s+([^\s(]+)/i);
  if (tableMatch) {
    return createTableWithoutRerunNotice(
      tableMatch[1],
      ddl,
    );
  }

  const sequenceMatch = ddl.match(/^\s*CREATE\s+SEQUENCE\s+([^\s;]+)/i);
  if (sequenceMatch) {
    return createSequenceWithoutRerunNotice(sequenceMatch[1]);
  }

  const alterMatch = ddl.match(/^\s*ALTER\s+TABLE\s+([^\s]+)/i);
  const columnMatches = [...ddl.matchAll(
    /ADD\s+COLUMN\s+((?:"[^"]+")|(?:[A-Za-z_][A-Za-z0-9_$]*))/gi,
  )];
  if (alterMatch && columnMatches.length > 0) {
    return columnMatches.map((columnMatch, index) => {
      const definitionStart = columnMatch.index! + columnMatch[0].length;
      const definitionEnd = index + 1 < columnMatches.length
        ? columnMatches[index + 1].index! - 1
        : ddl.length;
      const definition = ddl
        .slice(definitionStart, definitionEnd)
        .replace(/[,;\s]+$/, "")
        .trim();
      return addColumnWithoutRerunNotice(alterMatch[1], columnMatch[1], definition);
    }).join("\n;\n");
  }

  throw new Error("Unsupported incremental DDL; add an explicit catalog guard.");
}

export const INCREMENTAL_NON_INDEX_DDL = {
  chargeTypesTable: createTableWithoutRerunNotice("charge_types", `
    CREATE TABLE charge_types (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      label text NOT NULL,
      description text NOT NULL,
      default_amount decimal(10,2) NOT NULL,
      category text NOT NULL DEFAULT 'otros',
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0
    )
  `),
  cashShiftsTurnoTipoColumn: addColumnWithoutRerunNotice("cash_shifts", "turno_tipo", "text"),
  groupPaymentsReceiptNumberSequence: createSequenceWithoutRerunNotice("group_payments_receipt_number_seq"),
} as const;

export type IncrementalIndexDefinition = Readonly<{
  indexName: string;
  createSql: string;
  fixtureSql: string;
}>;

export const INCREMENTAL_INDEX_DEFINITIONS = {
  invoiceCountersUniquePair: {
    indexName: "invoice_counters_tipo_comprobante_punto_venta_unique",
    createSql: "CREATE UNIQUE INDEX invoice_counters_tipo_comprobante_punto_venta_unique ON invoice_counters (tipo_comprobante, punto_venta)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS invoice_counters (tipo_comprobante text, punto_venta integer)",
  },
  reservationWaitlistCheckIn: {
    indexName: "reservation_waitlist_check_in_idx",
    createSql: "CREATE INDEX reservation_waitlist_check_in_idx ON reservation_waitlist (check_in_date, created_at)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS reservation_waitlist (check_in_date date, created_at timestamp)",
  },
  spaTreatmentResourcesTreatment: {
    indexName: "idx_spa_treatment_resources_treatment",
    createSql: "CREATE INDEX idx_spa_treatment_resources_treatment ON spa_treatment_resources (treatment_id, sort_order)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS spa_treatment_resources (treatment_id varchar, sort_order integer)",
  },
  spaAppointmentResourcesAppointment: {
    indexName: "idx_spa_appointment_resources_appointment",
    createSql: "CREATE INDEX idx_spa_appointment_resources_appointment ON spa_appointment_resources (appointment_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS spa_appointment_resources (appointment_id varchar, cabin_id varchar, start_time text, end_time text)",
  },
  spaAppointmentResourcesCabin: {
    indexName: "idx_spa_appointment_resources_cabin",
    createSql: "CREATE INDEX idx_spa_appointment_resources_cabin ON spa_appointment_resources (cabin_id, start_time, end_time)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS spa_appointment_resources (appointment_id varchar, cabin_id varchar, start_time text, end_time text)",
  },
  accountMovementsEntity: {
    indexName: "idx_account_movements_entity",
    createSql: "CREATE INDEX idx_account_movements_entity ON account_movements(entity_type, entity_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS account_movements (entity_type text, entity_id varchar, group_payment_id varchar)",
  },
  accountMovementAllocationsCargo: {
    indexName: "idx_account_movement_allocations_cargo",
    createSql: "CREATE INDEX idx_account_movement_allocations_cargo ON account_movement_allocations(cargo_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS account_movement_allocations (cargo_id varchar, pago_id varchar)",
  },
  accountMovementAllocationsPago: {
    indexName: "idx_account_movement_allocations_pago",
    createSql: "CREATE INDEX idx_account_movement_allocations_pago ON account_movement_allocations(pago_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS account_movement_allocations (cargo_id varchar, pago_id varchar)",
  },
  salesInvoicesNcReconciliationPending: {
    indexName: "idx_sales_invoices_nc_reconciliation_pending",
    createSql: "CREATE INDEX idx_sales_invoices_nc_reconciliation_pending ON sales_invoices (nota_credito_id, reconciliation_status) WHERE reconciliation_status = 'pendiente'",
    fixtureSql: "CREATE TABLE IF NOT EXISTS sales_invoices (nota_credito_id integer, reconciliation_status text, group_id varchar, group_payment_id varchar, payment_id varchar, spa_account_id varchar)",
  },
  groupPaymentsInvoiceIdUnique: {
    indexName: "group_payments_invoice_id_unique",
    createSql: "CREATE UNIQUE INDEX group_payments_invoice_id_unique ON group_payments (invoice_id) WHERE invoice_id IS NOT NULL",
    fixtureSql: "CREATE TABLE IF NOT EXISTS group_payments (invoice_id integer, group_id varchar, receipt_number integer)",
  },
  accountMovementsGroupPaymentId: {
    indexName: "account_movements_group_payment_id_idx",
    createSql: "CREATE INDEX account_movements_group_payment_id_idx ON account_movements (group_payment_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS account_movements (entity_type text, entity_id varchar, group_payment_id varchar)",
  },
  groupPaymentsGroupId: {
    indexName: "group_payments_group_id_idx",
    createSql: "CREATE INDEX group_payments_group_id_idx ON group_payments(group_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS group_payments (invoice_id integer, group_id varchar, receipt_number integer)",
  },
  paymentsGroupPaymentId: {
    indexName: "payments_group_payment_id_idx",
    createSql: "CREATE INDEX payments_group_payment_id_idx ON payments(group_payment_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS payments (group_payment_id varchar)",
  },
  groupPaymentsReceiptNumberUnique: {
    indexName: "group_payments_receipt_number_unique",
    createSql: "CREATE UNIQUE INDEX group_payments_receipt_number_unique ON group_payments (receipt_number) WHERE receipt_number IS NOT NULL",
    fixtureSql: "CREATE TABLE IF NOT EXISTS group_payments (invoice_id integer, group_id varchar, receipt_number integer)",
  },
  salesInvoicesGroupId: {
    indexName: "sales_invoices_group_id_idx",
    createSql: "CREATE INDEX sales_invoices_group_id_idx ON sales_invoices (group_id)",
    fixtureSql: "CREATE TABLE IF NOT EXISTS sales_invoices (nota_credito_id integer, reconciliation_status text, group_id varchar, group_payment_id varchar, payment_id varchar, spa_account_id varchar)",
  },
  salesInvoicesGroupPaymentId: {
    indexName: "sales_invoices_group_payment_id_idx",
    createSql: "CREATE INDEX sales_invoices_group_payment_id_idx ON sales_invoices (group_payment_id) WHERE group_payment_id IS NOT NULL",
    fixtureSql: "CREATE TABLE IF NOT EXISTS sales_invoices (nota_credito_id integer, reconciliation_status text, group_id varchar, group_payment_id varchar, payment_id varchar, spa_account_id varchar)",
  },
  salesInvoicesPaymentId: {
    indexName: "sales_invoices_payment_id_idx",
    createSql: "CREATE UNIQUE INDEX sales_invoices_payment_id_idx ON sales_invoices (payment_id) WHERE payment_id IS NOT NULL",
    fixtureSql: "CREATE TABLE IF NOT EXISTS sales_invoices (nota_credito_id integer, reconciliation_status text, group_id varchar, group_payment_id varchar, payment_id varchar, spa_account_id varchar)",
  },
  salesInvoicesSpaAccountIdUnique: {
    indexName: "sales_invoices_spa_account_id_unique",
    createSql: "CREATE UNIQUE INDEX sales_invoices_spa_account_id_unique ON sales_invoices (spa_account_id) WHERE spa_account_id IS NOT NULL",
    fixtureSql: "CREATE TABLE IF NOT EXISTS sales_invoices (nota_credito_id integer, reconciliation_status text, group_id varchar, group_payment_id varchar, payment_id varchar, spa_account_id varchar)",
  },
} as const satisfies Record<string, IncrementalIndexDefinition>;

type IncrementalIndexKey = keyof typeof INCREMENTAL_INDEX_DEFINITIONS;

function incrementalIndexSql(key: IncrementalIndexKey): string {
  const definition = INCREMENTAL_INDEX_DEFINITIONS[key];
  return createIndexWithoutRerunNotice(definition.indexName, definition.createSql);
}

export const CASH_REGISTER_CONFIGS_AREA_UNIQUE_MIGRATION_SQL = serializeIncrementalDdl(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cash_register_configs_area_unique'
        AND conrelid = 'cash_register_configs'::regclass
    ) AND to_regclass('cash_register_configs_area_unique') IS NULL THEN
      ALTER TABLE cash_register_configs
        ADD CONSTRAINT cash_register_configs_area_unique UNIQUE (area);
    END IF;
  END $$
`);

/**
 * Legacy cash data may already contain more than one row for a payment. Audit
 * first and only add the uniqueness guard when the existing data is clean.
 * A dirty legacy database remains available for an explicit repair instead of
 * failing startup halfway through the migration.
 */
export const CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL = serializeIncrementalDdl(`
  DO $$
  BEGIN
    -- Remove the briefly introduced database-wide variant: group split tenders
    -- intentionally share one group payment id across multiple Caja rows.
    IF to_regclass('cash_movements_payment_id_unique') IS NOT NULL THEN
      DROP INDEX cash_movements_payment_id_unique;
    END IF;

    IF to_regclass('cash_movements_reservation_payment_id_unique') IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM cash_movements
         WHERE payment_id IS NOT NULL
           AND source_type = 'reservation'
         GROUP BY payment_id
         HAVING COUNT(*) > 1
       ) THEN
      CREATE UNIQUE INDEX cash_movements_reservation_payment_id_unique
        ON cash_movements (payment_id)
        WHERE payment_id IS NOT NULL AND source_type = 'reservation';
    END IF;
  END $$
`);

export const SPA_CIRCUIT_RESOURCE_FOREIGN_KEYS_MIGRATION_SQL = serializeIncrementalDdl(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'spa_treatment_resources_treatment_fk'
        AND conrelid = 'spa_treatment_resources'::regclass
    ) THEN
      ALTER TABLE spa_treatment_resources
      ADD CONSTRAINT spa_treatment_resources_treatment_fk
      FOREIGN KEY (treatment_id) REFERENCES spa_treatments(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'spa_treatment_resources_cabin_fk'
        AND conrelid = 'spa_treatment_resources'::regclass
    ) THEN
      ALTER TABLE spa_treatment_resources
      ADD CONSTRAINT spa_treatment_resources_cabin_fk
      FOREIGN KEY (default_cabin_id) REFERENCES spa_cabins(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'spa_appointment_resources_appointment_fk'
        AND conrelid = 'spa_appointment_resources'::regclass
    ) THEN
      ALTER TABLE spa_appointment_resources
      ADD CONSTRAINT spa_appointment_resources_appointment_fk
      FOREIGN KEY (appointment_id) REFERENCES spa_appointments(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'spa_appointment_resources_cabin_fk'
        AND conrelid = 'spa_appointment_resources'::regclass
    ) THEN
      ALTER TABLE spa_appointment_resources
      ADD CONSTRAINT spa_appointment_resources_cabin_fk
      FOREIGN KEY (cabin_id) REFERENCES spa_cabins(id) ON DELETE RESTRICT;
    END IF;
  END
  $$
`);

// Added later, alongside the resource_treatment_id columns themselves (see
// the "SPA circuit treatment resources" incremental block near the end of
// this file) — kept separate from SPA_CIRCUIT_RESOURCE_FOREIGN_KEYS_MIGRATION_SQL
// above so a brand-new database never runs a constraint before the column it
// references exists (that constant runs immediately after the original
// CREATE TABLE, long before resource_treatment_id is added).
export const SPA_TREATMENT_RESOURCE_KIND_FOREIGN_KEYS_MIGRATION_SQL = serializeIncrementalDdl(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'spa_treatment_resources_resource_treatment_fk'
        AND conrelid = 'spa_treatment_resources'::regclass
    ) THEN
      ALTER TABLE spa_treatment_resources
      ADD CONSTRAINT spa_treatment_resources_resource_treatment_fk
      FOREIGN KEY (resource_treatment_id) REFERENCES spa_treatments(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'spa_appointment_resources_resource_treatment_fk'
        AND conrelid = 'spa_appointment_resources'::regclass
    ) THEN
      ALTER TABLE spa_appointment_resources
      ADD CONSTRAINT spa_appointment_resources_resource_treatment_fk
      FOREIGN KEY (resource_treatment_id) REFERENCES spa_treatments(id) ON DELETE RESTRICT;
    END IF;
  END
  $$
`);

export const RESERVATION_COMPANIONS_GUEST_FK_MIGRATION_SQL = serializeIncrementalDdl(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'reservation_companions_guest_id_guests_id_fk'
        AND table_schema = current_schema()
        AND table_name = 'reservation_companions'
    ) THEN
      ALTER TABLE reservation_companions
        ADD CONSTRAINT reservation_companions_guest_id_guests_id_fk
        FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL;
    END IF;
  END $$;
`);

/**
 * getOrCreateFolio() used to be a plain check-then-insert: two nearly
 * simultaneous charges to the same entity (e.g. two fire-and-forget SPA
 * account charges posted back to back) could both miss the other's folio
 * and each create their own, splitting that entity's balance across two
 * rows. Before enforcing the one-folio-per-entity invariant, merge any
 * duplicates already on disk: re-parent their folio_movements onto the
 * earliest folio for that (entity_type, entity_id), recompute its totals,
 * and drop the now-empty duplicates — no financial data is lost.
 */
export const FOLIOS_ENTITY_UNIQUE_MIGRATION_SQL = serializeIncrementalDdl(`
  DO $$
  BEGIN
    IF to_regclass('folios_entity_type_entity_id_unique') IS NULL THEN
      WITH canonical AS (
        SELECT DISTINCT ON (entity_type, entity_id) id, entity_type, entity_id
        FROM folios
        ORDER BY entity_type, entity_id, created_at ASC, id ASC
      ),
      duplicate_folios AS (
        SELECT f.id AS duplicate_id, c.id AS canonical_id
        FROM folios f
        JOIN canonical c ON c.entity_type = f.entity_type AND c.entity_id = f.entity_id
        WHERE f.id <> c.id
      )
      UPDATE folio_movements fm
      SET folio_id = d.canonical_id
      FROM duplicate_folios d
      WHERE fm.folio_id = d.duplicate_id;

      WITH canonical AS (
        SELECT DISTINCT ON (entity_type, entity_id) id
        FROM folios
        ORDER BY entity_type, entity_id, created_at ASC, id ASC
      ),
      totals AS (
        SELECT
          folio_id,
          COALESCE(SUM(amount::numeric) FILTER (WHERE type IN ('charge','transfer_in')), 0) AS total_charges,
          COALESCE(SUM(amount::numeric) FILTER (WHERE type IN ('payment','advance','discount','transfer_out','void')), 0) AS total_payments
        FROM folio_movements
        WHERE folio_id IN (SELECT id FROM canonical)
        GROUP BY folio_id
      )
      UPDATE folios f
      SET total_charges = t.total_charges,
          total_payments = t.total_payments,
          balance = t.total_charges - t.total_payments
      FROM totals t
      WHERE f.id = t.folio_id;

      WITH canonical AS (
        SELECT DISTINCT ON (entity_type, entity_id) id
        FROM folios
        ORDER BY entity_type, entity_id, created_at ASC, id ASC
      )
      DELETE FROM folios
      WHERE id NOT IN (SELECT id FROM canonical);

      CREATE UNIQUE INDEX folios_entity_type_entity_id_unique
        ON folios (entity_type, entity_id);
    END IF;
  END $$
`);

// Wraps a migration in a timeout so a hung DDL lock never kills the startup
async function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms`)), ms)
      ),
    ]);
  } catch (e: any) {
    logger.warn(`Migración ${label}: ${e.message}`);
    return undefined;
  }
}

export const FINANCIAL_SCHEMA_REQUIREMENTS = {
  columns: {
    sales_invoices: [
      "id",
      "estado",
      "items",
      "payment_id",
      "group_id",
      "group_payment_id",
      "group_payment_intent",
      "credit_reapplication_intent",
      "spa_account_id",
      "reconciliation_status",
      "reconciliation_error",
      "reconciliation_updated_at",
    ],
    account_movements: [
      "id",
      "entity_type",
      "entity_id",
      "date",
      "type",
      "description",
      "amount",
      "payment_method",
      "group_payment_id",
    ],
    account_movement_allocations: ["id", "pago_id", "cargo_id", "amount"],
    group_payments: [
      "id",
      "group_id",
      "amount",
      "method",
      "date",
      "reference",
      "distribution",
      "distribution_detail",
      "payment_method_detail",
      "destination",
      "receiver_details",
      "invoice_ref",
      "retention_detail",
      "settlement_breakdown",
      "settlement_breakdown_status",
      "settlement_breakdown_note",
      "receipt_number",
      "concepts",
    ],
    payments: ["id", "reservation_id", "amount", "method", "date", "reference", "status", "group_payment_id"],
    invoice_counters: [],
    purchase_invoices: ["subtipo_retencion"],
  },
  indexes: {
    sales_invoices: [
      "sales_invoices_group_id_idx",
      "sales_invoices_group_payment_id_idx",
      "sales_invoices_payment_id_idx",
      "idx_sales_invoices_nc_reconciliation_pending",
    ],
    account_movements: [
      "idx_account_movements_entity",
      "account_movements_group_payment_id_idx",
    ],
    account_movement_allocations: [
      "idx_account_movement_allocations_cargo",
      "idx_account_movement_allocations_pago",
    ],
    group_payments: ["group_payments_group_id_idx", "group_payments_receipt_number_unique"],
    payments: ["payments_group_payment_id_idx"],
    invoice_counters: ["invoice_counters_tipo_comprobante_punto_venta_unique"],
  },
} as const;

export type FinancialSchemaStatus = {
  ready: boolean;
  checking?: boolean;
  missingColumns: string[];
  missingIndexes: string[];
};

let financialSchemaStatus: FinancialSchemaStatus | null = null;

const financialSchemaErrorMessage = (status: FinancialSchemaStatus) => {
  if (status.checking) {
    return "El esquema financiero se está verificando. Espere a que termine el inicio antes de registrar cobros.";
  }
  const missing = [
    ...status.missingColumns.map((item) => `columna ${item}`),
    ...status.missingIndexes.map((item) => `índice ${item}`),
  ];
  return [
    "El esquema financiero no está actualizado.",
    `Faltan: ${missing.join(", ")}.`,
    "Ejecute las migraciones y reinicie el servidor antes de habilitar cobros.",
  ].join(" ");
};

/** Marks financial mutations as unavailable while startup migrations are running. */
export function beginFinancialSchemaCheck() {
  financialSchemaStatus = {
    ready: false,
    checking: true,
    missingColumns: [],
    missingIndexes: [],
  };
}

export function getFinancialSchemaStatus(): FinancialSchemaStatus | null {
  return financialSchemaStatus;
}

/**
 * Protects financial mutations from running against an old production schema.
 * Tests that register routes in isolation do not call beginFinancialSchemaCheck,
 * so they can continue to provide their own storage/database setup.
 */
export function assertFinancialSchemaReady() {
  if (financialSchemaStatus && !financialSchemaStatus.ready) {
    const error = Object.assign(new Error(financialSchemaErrorMessage(financialSchemaStatus)), {
      statusCode: 503,
      code: "FINANCIAL_SCHEMA_NOT_READY",
    });
    throw error;
  }
}

/**
 * Reconstructs historical group-payment settlement splits only from one
 * unambiguous emitted invoice and its persisted fiscal intent. This is
 * exported so the real PostgreSQL backfill can be regression-tested without
 * replaying every startup migration.
 */
export async function backfillGroupPaymentSettlementBreakdowns() {
  await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
    ALTER TABLE group_payments
      ADD COLUMN settlement_breakdown jsonb,
      ADD COLUMN settlement_breakdown_status text,
      ADD COLUMN settlement_breakdown_note text
  `)));

  return db.execute(sql`
    WITH fiscal_receipts AS (
      SELECT
        gp.id AS payment_id,
        gp.amount AS payment_amount,
        si.monto_total AS invoice_total,
        si.group_payment_intent #> '{body,settlementBreakdown}' AS intended
      FROM group_payments gp
      LEFT JOIN LATERAL (
        SELECT matched.monto_total, matched.group_payment_intent
        FROM (
          SELECT
            candidate.id,
            candidate.monto_total,
            candidate.group_payment_intent,
            count(*) OVER () AS candidate_count
          FROM sales_invoices candidate
          WHERE candidate.estado = 'emitida'
            AND candidate.group_id = gp.group_id
            AND (
              candidate.id = gp.invoice_id
              OR candidate.group_payment_id = gp.id
              OR candidate.id::text = substring(
                gp.invoice_ref
                FROM '"id"\s*:\s*([0-9]+)'
              )
            )
        ) matched
        WHERE matched.candidate_count = 1
        LIMIT 1
      ) si ON true
      WHERE gp.settlement_breakdown IS NULL
        AND (
          lower(COALESCE(gp.receipt_type, '')) IN (
            'factura_a', 'factura_b', 'factura_mipyme_a', 'factura_t'
          )
          OR gp.invoice_id IS NOT NULL
          OR NULLIF(gp.invoice_ref, '') IS NOT NULL
        )
    ),
    parsed_intents AS (
      SELECT
        fiscal_receipts.*,
        CASE
          WHEN (intended->>'documentTotal') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (intended->>'documentTotal')::numeric
        END AS document_total,
        CASE
          WHEN (intended->>'appliedAdvances') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (intended->>'appliedAdvances')::numeric
        END AS applied_advances,
        CASE
          WHEN (intended->>'newCollection') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (intended->>'newCollection')::numeric
        END AS new_collection
      FROM fiscal_receipts
    ),
    valid_intents AS (
      SELECT
        payment_id,
        jsonb_build_object(
          'documentTotal', round(document_total, 2),
          'appliedAdvances', round(applied_advances, 2),
          'newCollection', round(new_collection, 2)
        ) AS breakdown
      FROM parsed_intents
      WHERE jsonb_typeof(intended) = 'object'
        AND document_total IS NOT NULL
        AND applied_advances IS NOT NULL
        AND new_collection IS NOT NULL
        AND round(document_total, 2) > 0
        AND round(applied_advances, 2) >= 0
        AND round(applied_advances, 2)
          <= round(document_total, 2)
        AND round(document_total, 2)
          = round(invoice_total::numeric, 2)
        AND round(new_collection, 2)
          = round(payment_amount::numeric, 2)
        AND round(new_collection, 2)
          >= round(
            document_total - applied_advances,
            2
          )
    )
    UPDATE group_payments gp
    SET
      settlement_breakdown = valid.breakdown,
      settlement_breakdown_status = CASE
        WHEN valid.payment_id IS NOT NULL THEN 'reconstructed_from_fiscal_intent'
        ELSE 'not_reconstructible'
      END,
      settlement_breakdown_note = CASE
        WHEN valid.payment_id IS NOT NULL
          THEN 'Desglose histórico reconstruido desde la intención fiscal persistida.'
        ELSE 'No existe una intención fiscal con desglose suficiente y coincidente; no se infirieron importes.'
      END
    FROM fiscal_receipts fiscal
    LEFT JOIN valid_intents valid ON valid.payment_id = fiscal.payment_id
    WHERE gp.id = fiscal.payment_id
      AND gp.settlement_breakdown IS NULL;

    UPDATE group_payments
    SET settlement_breakdown_status = 'captured_at_settlement',
        settlement_breakdown_note = COALESCE(
          settlement_breakdown_note,
          'Desglose capturado al confirmar el cobro.'
        )
    WHERE settlement_breakdown IS NOT NULL
      AND settlement_breakdown_status IS NULL;
  `);
}

/**
 * Verifies the live PostgreSQL catalog rather than trusting that an incremental
 * migration returned successfully. Individual migration steps intentionally
 * have timeouts, so this is the final gate that detects a skipped/blocked DDL.
 */
export async function verifyFinancialSchema(): Promise<FinancialSchemaStatus> {
  const tableNames = Object.keys(FINANCIAL_SCHEMA_REQUIREMENTS.columns);
  const columnRows = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${sql.join(tableNames.map((tableName) => sql`${tableName}`), sql`, `)})
  `);
  const indexRows = await db.execute(sql`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (${sql.join(tableNames.map((tableName) => sql`${tableName}`), sql`, `)})
  `);

  const availableColumns = new Set(
    (columnRows.rows as Array<{ table_name: string; column_name: string }>)
      .map((row) => `${row.table_name}.${row.column_name}`),
  );
  const availableIndexes = new Set(
    (indexRows.rows as Array<{ tablename: string; indexname: string }>)
      .map((row) => `${row.tablename}.${row.indexname}`),
  );

  const missingColumns = Object.entries(FINANCIAL_SCHEMA_REQUIREMENTS.columns)
    .flatMap(([tableName, columns]) =>
      columns
        .filter((columnName) => !availableColumns.has(`${tableName}.${columnName}`))
        .map((columnName) => `${tableName}.${columnName}`),
    );
  const missingIndexes = Object.entries(FINANCIAL_SCHEMA_REQUIREMENTS.indexes)
    .flatMap(([tableName, indexes]) =>
      indexes
        .filter((indexName) => !availableIndexes.has(`${tableName}.${indexName}`))
        .map((indexName) => `${tableName}.${indexName}`),
    );

  financialSchemaStatus = {
    ready: missingColumns.length === 0 && missingIndexes.length === 0,
    missingColumns,
    missingIndexes,
  };

  if (financialSchemaStatus.ready) {
    logger.info("Esquema financiero verificado: cobros maestros y Cuenta Corriente habilitados.");
  } else {
    logger.error(`[startup] ${financialSchemaErrorMessage(financialSchemaStatus)}`);
  }

  return financialSchemaStatus;
}

export async function runMigrations() {
  // In production Railway uses PgBouncer (connection pooling). Drizzle's migrate()
  // issues DDL commands (CREATE SCHEMA, advisory locks) that are incompatible with
  // pooled connections and fail with "Control plane request failed".
  // All schema changes below are idempotent.
  // so migrate() is only needed for a brand-new database setup (which is done in dev).
  if (process.env.NODE_ENV !== "production") {
    try {
      logger.info("Ejecutando migraciones pendientes...");
      await Promise.race([
        migrate(db, { migrationsFolder: "./migrations" }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("migrate() timeout after 15s")), 15_000)
        ),
      ]);
      logger.info("Migraciones completadas");
    } catch (err: any) {
      if (err?.message?.includes("already exists")) {
        logger.warn("Migraciones: tablas ya existen (base de datos existente). No se requiere acción.");
      } else {
        logger.warn("Migraciones (no-bloqueante): " + err?.message);
      }
    }
  } else {
    logger.info("Producción: migrate() omitido (conexión pooled). Usando migraciones incrementales.");
  }

  // Incremental schema additions — each wrapped in an 8s timeout so a hung
  // DDL lock in Railway/PgBouncer never prevents the app from starting.
  const T = 8_000;

  await withTimeout("cash_shifts.turno_tipo", T, () =>
    db.execute(sql.raw(INCREMENTAL_NON_INDEX_DDL.cashShiftsTurnoTipoColumn))
  );

  await withTimeout("purchase_invoices.subtipo_retencion", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE purchase_invoices ADD COLUMN subtipo_retencion text`)))
  );

  // Older databases allowed more than one counter for the same fiscal
  // document/point-of-sale pair. Keep the row that has issued the furthest
  // number before enforcing the invariant used by the atomic counter UPSERT.
  await withTimeout("invoice_counters.deduplicate", T, () =>
    db.execute(sql`
      WITH ranked_counters AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY tipo_comprobante, punto_venta
            ORDER BY ultimo_numero DESC NULLS LAST, id DESC
          ) AS duplicate_rank
        FROM invoice_counters
      )
      DELETE FROM invoice_counters counters
      USING ranked_counters ranked
      WHERE counters.id = ranked.id
        AND ranked.duplicate_rank > 1
    `)
  );
  await withTimeout("invoice_counters.unique_pair", T, () =>
    db.execute(sql.raw(incrementalIndexSql("invoiceCountersUniquePair")))
  );

  await withTimeout("charge_types (create)", T, () =>
    db.execute(sql.raw(INCREMENTAL_NON_INDEX_DDL.chargeTypesTable))
  );
  await withTimeout("charge_types (seed)", T, async () => {
    const existing = await db.execute(sql`SELECT COUNT(*) FROM charge_types`);
    const count = parseInt((existing.rows[0] as any)?.count ?? "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO charge_types (label, description, default_amount, category, sort_order) VALUES
        ('Cochera (por día)', 'Cochera', 2500, 'otros', 1),
        ('Media Pensión', 'Media Pensión', 4500, 'restaurant', 2),
        ('Pensión Completa', 'Pensión Completa', 8000, 'restaurant', 3),
        ('Desayuno adicional', 'Desayuno adicional', 1800, 'restaurant', 4),
        ('Cena', 'Cena', 3500, 'restaurant', 5),
        ('Frigobar', 'Frigobar', 1200, 'minibar', 6),
        ('Lavandería', 'Lavandería', 2000, 'otros', 7),
        ('Traslado', 'Traslado', 3000, 'otros', 8),
        ('SPA / Masaje', 'SPA / Masaje', 5000, 'spa', 9)
      `);
      logger.info("Charge types seeded with default presets.");
    }
  });

  await withTimeout("confirmation_terms (seed)", T, async () => {
    const existing = await db.execute(sql`SELECT COUNT(*) FROM system_settings WHERE key = 'confirmation_terms'`);
    const count = parseInt((existing.rows[0] as any)?.count ?? "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO system_settings (id, key, value, category, description, updated_at, updated_by)
        VALUES (
          gen_random_uuid(),
          'confirmation_terms',
          'La tarifa incluye desayuno buffet y gimnasio con turno previo.
La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.
Nuestro horario de Check-in es a partir de las 15:00 hs y el Check-out es hasta las 10:00 hs.
Early Check-in o Late Check-out tienen costo adicional del 50% del valor de una noche.
Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI / PASAPORTE / CÉDULA DE IDENTIDAD. En el caso de viajar con menores de edad deberá presentar su correspondiente identificación.
La entrega de la habitación queda condicionada al pago total del alojamiento al momento del check-in. Los comprobantes, constancias de transferencia, capturas de pantalla o avisos de pago no constituyen pago válido hasta la efectiva acreditación del importe en los medios de cobro habilitados por el hotel. Ante la falta de acreditación, el hotel podrá exigir el pago por otro medio aceptado y suspender el ingreso a la habitación hasta la regularización total del saldo correspondiente.',
          'documentos',
          'Términos y condiciones que aparecen en la confirmación de reserva (PDF). Una cláusula por línea.',
          now(),
          'system'
        )
      `);
      logger.info("confirmation_terms seeded.");
    }
  });

  await withTimeout("reservations.late_checkout", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE reservations ADD COLUMN late_checkout boolean DEFAULT false`)))
  );
  await withTimeout("reservations.late_checkout_time", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE reservations ADD COLUMN late_checkout_time varchar(10)`)))
  );

  await withTimeout("loan_items (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE loan_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        total_quantity integer NOT NULL DEFAULT 1,
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0
      )
    `)))
  );
  await withTimeout("item_loans (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE item_loans (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_item_id varchar NOT NULL REFERENCES loan_items(id),
        room_number text NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        lent_at timestamp DEFAULT now(),
        returned_at timestamp,
        notes text,
        registered_by text
      )
    `)))
  );
  await withTimeout("loan_items (seed)", T, async () => {
    const existing = await db.execute(sql`SELECT COUNT(*) FROM loan_items`);
    const count = parseInt((existing.rows[0] as any)?.count ?? "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO loan_items (name, description, total_quantity, sort_order) VALUES
        ('Plancha', 'Plancha de ropa', 3, 1),
        ('Tabla de planchar', 'Tabla de planchar plegable', 2, 2),
        ('Secador de pelo', 'Secador de pelo 1800W', 4, 3),
        ('Catre adicional', 'Catre plegable con colchón', 3, 4),
        ('Almohadas extra', 'Almohadas adicionales', 10, 5),
        ('Adaptador eléctrico', 'Adaptador universal de enchufes', 5, 6),
        ('Cuna', 'Cuna de viaje para bebé', 2, 7),
        ('Toallas extra', 'Toallas adicionales (juego)', 8, 8)
      `);
      logger.info("Loan items seeded.");
    }
  });

  await withTimeout("billing_config.arca_ambiente", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE billing_config
        ADD COLUMN arca_ambiente text DEFAULT 'ficticio',
        ADD COLUMN punto_venta_homolog integer DEFAULT 99
    `)))
  );
  await withTimeout("billing_config.arca_ambiente (update)", T, () =>
    db.execute(sql`
      UPDATE billing_config
      SET arca_ambiente = CASE WHEN modo_arca = true THEN 'produccion' ELSE 'ficticio' END
      WHERE arca_ambiente IS NULL OR arca_ambiente = 'ficticio'
    `)
  );
  await withTimeout("reservation_changelog", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE reservation_changelog (
        id serial PRIMARY KEY,
        reservation_id varchar NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        fecha timestamp NOT NULL DEFAULT now(),
        operador text,
        tipo text NOT NULL,
        descripcion text NOT NULL
      )
    `)))
  );

  await withTimeout("housekeeping_tasks", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE housekeeping_tasks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id varchar NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        task_type text NOT NULL DEFAULT 'checkout_clean',
        status text NOT NULL DEFAULT 'pending',
        priority text NOT NULL DEFAULT 'normal',
        assigned_to varchar,
        notes text,
        scheduled_date date NOT NULL,
        started_at timestamp,
        completed_at timestamp,
        inspected_by varchar,
        inspected_at timestamp,
        created_at timestamp NOT NULL
      )
    `)))
  );

  // Cash movements: columnas receiptNumber, proveedor, expenseCategory
  await withTimeout("cash_movements_receipt_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE cash_movements
        ADD COLUMN receipt_number text,
        ADD COLUMN proveedor text,
        ADD COLUMN expense_category text
    `)))
  );
  // Cash movements: payment_id para vincular movimiento de caja con pago de reserva
  await withTimeout("cash_movements_payment_id_col", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE cash_movements
        ADD COLUMN payment_id varchar
    `)))
  );
  await withTimeout("cash_closing_noncash_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE cash_closing_summaries
        ADD COLUMN total_voucher numeric(10,2) DEFAULT 0,
        ADD COLUMN non_cash_settlements_total numeric(10,2) DEFAULT 0,
        ADD COLUMN non_cash_settlements_count integer DEFAULT 0
    `)))
  );
  await withTimeout("cash_movements_payment_id_unique", T, async () => {
    const duplicateResult = await db.execute(sql`
      SELECT payment_id, COUNT(*)::integer AS movement_count
      FROM cash_movements
      WHERE payment_id IS NOT NULL
        AND source_type = 'reservation'
      GROUP BY payment_id
      HAVING COUNT(*) > 1
      ORDER BY payment_id
      LIMIT 20
    `);
    if (duplicateResult.rows.length > 0) {
      logger.warn(
        "Legacy reservation cash movements contain duplicate payment links; unique index was not created.",
        { duplicates: duplicateResult.rows },
      );
    }
    await db.execute(sql.raw(CASH_MOVEMENTS_PAYMENT_ID_UNIQUE_MIGRATION_SQL));
  });

  // Security: brute-force columns on system_users + failed_login_attempts table
  await withTimeout("system_users_security_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE system_users
        ADD COLUMN locked_at timestamp,
        ADD COLUMN lock_reason text,
        ADD COLUMN lock_permanent text DEFAULT 'false',
        ADD COLUMN failed_login_count integer DEFAULT 0
    `)))
  );

  await withTimeout("failed_login_attempts", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE failed_login_attempts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL,
        ip_address text NOT NULL,
        timestamp timestamp NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'FAILED',
        detail text,
        user_agent text,
        session_id text
      )
    `)))
  );

  // cuentaPedida flag on restaurant_orders (mozo solicitó la cuenta)
  await withTimeout("restaurant_orders_cuenta_pedida", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE restaurant_orders
        ADD COLUMN cuenta_pedida boolean NOT NULL DEFAULT false
    `)))
  );

  // allow_price_edit flag on charge_types (precio variable)
  await withTimeout("charge_types_allow_price_edit", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE charge_types
        ADD COLUMN allow_price_edit boolean NOT NULL DEFAULT false
    `)))
  );

  // Activate allow_price_edit for Lavandería by default
  await withTimeout("charge_types_lavanderia_price_edit", T, () =>
    db.execute(sql`
      UPDATE charge_types
        SET allow_price_edit = true
      WHERE label ILIKE '%lavand%' AND allow_price_edit = false
    `)
  );

  // monto_acreditado en sales_invoices (para NC parciales múltiples y estado "parcial")
  await withTimeout("sales_invoices.monto_acreditado", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN monto_acreditado numeric(14,2) DEFAULT 0`)))
  );

  // default_course en menu_items (agregado al schema pero faltaba la migración)
  await withTimeout("menu_items.default_course", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE menu_items ADD COLUMN default_course integer`)))
  );

  // is_editable en menu_items (puede no existir en producción)
  await withTimeout("menu_items.is_editable", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE menu_items ADD COLUMN is_editable text DEFAULT 'false'`)))
  );

  // billing_config: columnas de token WSAA persistente
  await withTimeout("billing_config.arca_ta_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE billing_config
        ADD COLUMN arca_ta_token text,
        ADD COLUMN arca_ta_sign text,
        ADD COLUMN arca_ta_expiry timestamp,
        ADD COLUMN arca_ta_ambiente text
    `)))
  );

  // table_reservations: make table_id nullable, add new columns
  await withTimeout("table_reservations.table_id_nullable", T, () =>
    db.execute(sql`ALTER TABLE table_reservations ALTER COLUMN table_id DROP NOT NULL`)
  );
  await withTimeout("table_reservations.new_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE table_reservations
        ADD COLUMN client_id varchar,
        ADD COLUMN card_last4 text,
        ADD COLUMN card_holder text
    `)))
  );

  // restaurant_time_slots: add area_id for per-salon turn configuration
  await withTimeout("restaurant_time_slots.area_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE restaurant_time_slots ADD COLUMN area_id varchar`)))
  );

  // restaurant_reservation_advances: advances/deposits on reservations
  await withTimeout("restaurant_reservation_advances (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE restaurant_reservation_advances (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id varchar NOT NULL,
        amount decimal(10,2) NOT NULL,
        payment_method text NOT NULL DEFAULT 'efectivo',
        voucher_number text,
        notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        applied_to_order_id varchar
      )
    `)))
  );

  await withTimeout("restaurant_reservation_advances.invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE restaurant_reservation_advances ADD COLUMN invoice_id integer`)))
  );

  await withTimeout("order_items.paid", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE order_items ADD COLUMN paid boolean NOT NULL DEFAULT false`)))
  );

  // order_items: course y sent_at — en el schema desde el inicio pero por las dudas los aseguramos
  await withTimeout("order_items.course_sent_at", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE order_items
        ADD COLUMN course integer DEFAULT 1,
        ADD COLUMN sent_at timestamptz
    `)))
  );

  await withTimeout("guests.active", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN active boolean NOT NULL DEFAULT true`)))
  );

  await withTimeout("reservation_waitlist.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE reservation_waitlist (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name text NOT NULL,
        last_name text NOT NULL,
        check_in_date date NOT NULL,
        check_out_date date NOT NULL,
        phone text,
        number_of_guests integer NOT NULL DEFAULT 1,
        notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT reservation_waitlist_dates_valid CHECK (check_out_date > check_in_date),
        CONSTRAINT reservation_waitlist_guests_valid CHECK (number_of_guests > 0)
      )
    `)))
  );
  await withTimeout("reservation_waitlist.check_in_idx", T, () =>
    db.execute(sql.raw(incrementalIndexSql("reservationWaitlistCheckIn")))
  );

  await withTimeout("rooms.is_virtual", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE rooms ADD COLUMN is_virtual boolean DEFAULT false`)))
  );

  await withTimeout("rooms.reub_restore", T, () =>
    db.execute(sql`
      INSERT INTO rooms (id, room_number, room_type_id, floor, status, is_virtual, is_active)
      SELECT
        gen_random_uuid(),
        'REUB',
        (SELECT id FROM room_types ORDER BY name LIMIT 1),
        0,
        'available',
        true,
        true
      WHERE
        (SELECT id FROM room_types ORDER BY name LIMIT 1) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rooms WHERE room_number = 'REUB')
    `)
  );
  await withTimeout("rooms.reub_normalize", T, () =>
    db.execute(sql`
      UPDATE rooms
      SET floor = 0, status = 'available', is_virtual = true, is_active = true
      WHERE room_number = 'REUB'
    `)
  );

  // table_reservations: add area_id for per-salon filtering
  await withTimeout("table_reservations.area_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE table_reservations ADD COLUMN area_id varchar`)))
  );

  // guests: vat_condition and provincia
  await withTimeout("guests.vat_condition", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN vat_condition text`)))
  );
  await withTimeout("guests.provincia", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN provincia text`)))
  );

  // guests: libro de registro + fiscal + migratorio + FCE
  await withTimeout("guests.estado_civil", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN estado_civil text`)))
  );
  await withTimeout("guests.procedencia", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN procedencia text`)))
  );
  await withTimeout("guests.nationality_code", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN nationality_code text`)))
  );
  await withTimeout("guests.fecha_ingreso_argentina", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN fecha_ingreso_argentina date`)))
  );
  await withTimeout("guests.fecha_salida_argentina", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN fecha_salida_argentina date`)))
  );
  await withTimeout("guests.es_empresa_grande", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN es_empresa_grande boolean DEFAULT false`)))
  );
  await withTimeout("guests.monto_base_fce", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN monto_base_fce text`)))
  );
  await withTimeout("guests.codigo_postal", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN codigo_postal text`)))
  );

  // table_reservations: advance fields (legacy single-advance snapshot)
  await withTimeout("table_reservations.advance_amount", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE table_reservations ADD COLUMN advance_amount numeric(10,2) DEFAULT 0`)))
  );
  await withTimeout("table_reservations.advance_method", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE table_reservations ADD COLUMN advance_method text`)))
  );
  await withTimeout("table_reservations.advance_date", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE table_reservations ADD COLUMN advance_date date`)))
  );
  await withTimeout("table_reservations.advance_notes", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE table_reservations ADD COLUMN advance_notes text`)))
  );

  // Tabla countries (nomenclador AFIP)
  await withTimeout("countries.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE countries (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        afip_code integer NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        display_order integer DEFAULT 0
      )
    `)))
  );

  // Seed países AFIP si la tabla está vacía
  await withTimeout("countries.seed", T, async () => {
    const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM countries`);
    const count = parseInt((existing.rows[0] as any).cnt || "0");
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO countries (id, afip_code, name, is_active, display_order) VALUES
        (gen_random_uuid(), 200, 'Argentina', true, 1),
        (gen_random_uuid(), 225, 'Uruguay', true, 2),
        (gen_random_uuid(), 101, 'Brasil', true, 3),
        (gen_random_uuid(), 209, 'Chile', true, 4),
        (gen_random_uuid(), 220, 'Paraguay', true, 5),
        (gen_random_uuid(), 202, 'Bolivia', true, 6),
        (gen_random_uuid(), 218, 'Perú', true, 7),
        (gen_random_uuid(), 203, 'Colombia', true, 8),
        (gen_random_uuid(), 226, 'Venezuela', true, 9),
        (gen_random_uuid(), 210, 'Ecuador', true, 10),
        (gen_random_uuid(), 123, 'Estados Unidos', true, 11),
        (gen_random_uuid(), 174, 'Canadá', true, 12),
        (gen_random_uuid(), 116, 'España', true, 13),
        (gen_random_uuid(), 130, 'Italia', true, 14),
        (gen_random_uuid(), 117, 'Francia', true, 15),
        (gen_random_uuid(), 120, 'Alemania', true, 16),
        (gen_random_uuid(), 222, 'Portugal', true, 17),
        (gen_random_uuid(), 172, 'Reino Unido', true, 18),
        (gen_random_uuid(), 126, 'Irlanda', true, 19),
        (gen_random_uuid(), 102, 'Bélgica', true, 20),
        (gen_random_uuid(), 142, 'Países Bajos', true, 21),
        (gen_random_uuid(), 166, 'Suiza', true, 22),
        (gen_random_uuid(), 147, 'Austria', true, 23),
        (gen_random_uuid(), 163, 'Suecia', true, 24),
        (gen_random_uuid(), 144, 'Noruega', true, 25),
        (gen_random_uuid(), 112, 'Dinamarca', true, 26),
        (gen_random_uuid(), 115, 'Finlandia', true, 27),
        (gen_random_uuid(), 121, 'Grecia', true, 28),
        (gen_random_uuid(), 168, 'Turquía', true, 29),
        (gen_random_uuid(), 150, 'Rusia', true, 30),
        (gen_random_uuid(), 107, 'China', true, 31),
        (gen_random_uuid(), 131, 'Japón', true, 32),
        (gen_random_uuid(), 109, 'Corea del Sur', true, 33),
        (gen_random_uuid(), 129, 'India', true, 34),
        (gen_random_uuid(), 134, 'Israel', true, 35),
        (gen_random_uuid(), 146, 'Australia', true, 36),
        (gen_random_uuid(), 143, 'Nueva Zelanda', true, 37),
        (gen_random_uuid(), 141, 'México', true, 38),
        (gen_random_uuid(), 206, 'Cuba', true, 39),
        (gen_random_uuid(), 214, 'Costa Rica', true, 40),
        (gen_random_uuid(), 215, 'Haití', true, 41),
        (gen_random_uuid(), 216, 'Jamaica', true, 42),
        (gen_random_uuid(), 219, 'Panamá', true, 43),
        (gen_random_uuid(), 217, 'Honduras', true, 44),
        (gen_random_uuid(), 213, 'Guatemala', true, 45),
        (gen_random_uuid(), 223, 'El Salvador', true, 46),
        (gen_random_uuid(), 224, 'Nicaragua', true, 47),
        (gen_random_uuid(), 221, 'República Dominicana', true, 48),
        (gen_random_uuid(), 204, 'Guyana', true, 49),
        (gen_random_uuid(), 208, 'Surinam', true, 50),
        (gen_random_uuid(), 138, 'Marruecos', true, 51),
        (gen_random_uuid(), 104, 'Argelia', true, 52),
        (gen_random_uuid(), 170, 'Túnez', true, 53),
        (gen_random_uuid(), 160, 'Sudáfrica', true, 54),
        (gen_random_uuid(), 145, 'Nigeria', true, 55),
        (gen_random_uuid(), 118, 'Ghana', true, 56),
        (gen_random_uuid(), 133, 'Kenia', true, 57),
        (gen_random_uuid(), 103, 'Arabia Saudita', true, 58),
        (gen_random_uuid(), 108, 'Irak', true, 59),
        (gen_random_uuid(), 110, 'Irán', true, 60),
        (gen_random_uuid(), 136, 'Líbano', true, 61),
        (gen_random_uuid(), 161, 'Siria', true, 62),
        (gen_random_uuid(), 111, 'Emiratos Árabes Unidos', true, 63),
        (gen_random_uuid(), 999, 'Otros', true, 99)
      `);
    }
  });

  await withTimeout("web_checkins.signature_image", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE web_checkins ADD COLUMN signature_image text`)))
  );

  await withTimeout("guests.tipo_persona", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN tipo_persona text DEFAULT 'fisica'`)))
  );

  await withTimeout("companies.es_empresa_grande", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE companies ADD COLUMN es_empresa_grande boolean DEFAULT false`)))
  );
  await withTimeout("companies.monto_base_fce", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE companies ADD COLUMN monto_base_fce text`)))
  );
  await withTimeout("companies.condicion_venta", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE companies ADD COLUMN condicion_venta_predeterminada text DEFAULT 'contado'`)))
  );
  await withTimeout("agencies.condicion_venta", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE agencies ADD COLUMN condicion_venta_predeterminada text DEFAULT 'contado'`)))
  );
  await withTimeout("guests.condicion_venta", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE guests ADD COLUMN condicion_venta_predeterminada text DEFAULT 'contado'`)))
  );

  await withTimeout("pos_configs table", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE pos_configs (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        numero INTEGER NOT NULL,
        area TEXT NOT NULL DEFAULT 'general',
        tipo TEXT NOT NULL DEFAULT 'manual',
        descripcion TEXT,
        activo BOOLEAN DEFAULT true
      )
    `)))
  );

  await withTimeout("pos_configs seed", T, async () => {
    const res = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_configs`);
    const cnt = parseInt((res.rows[0] as any).cnt ?? "0");
    if (cnt === 0) {
      await db.execute(sql`
        INSERT INTO pos_configs (nombre, numero, area, tipo, descripcion) VALUES
        ('Recepción', 1, 'recepcion', 'electronico', 'PV electrónico — alojamiento'),
        ('Restaurant', 2, 'restaurant', 'electronico', 'PV electrónico — gastronomía'),
        ('SPA', 3, 'spa', 'manual', 'PV manual — spa y bienestar'),
        ('Eventos', 4, 'eventos', 'manual', 'PV manual — salones y eventos')
      `);
    }
  });

  // ── Presupuestos multi-área ───────────────────────────────────────────────
  await withTimeout("presupuestos.area_origen", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuestos ADD COLUMN area_origen VARCHAR DEFAULT 'grupos'`)))
  );
  await withTimeout("presupuestos.participantes", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuestos ADD COLUMN participantes INTEGER`)))
  );
  await withTimeout("presupuestos.datos_destinatario", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuestos ADD COLUMN cuit TEXT`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuestos ADD COLUMN direccion TEXT`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuestos ADD COLUMN contacto TEXT`)));
  });
  await withTimeout("presupuesto_items.cantidad_habitaciones", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuesto_items ADD COLUMN cantidad_habitaciones NUMERIC(8,2) NOT NULL DEFAULT '1'`)))
  );
  await withTimeout("presupuesto_items.category", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuesto_items ADD COLUMN category varchar`)))
  );
  await withTimeout("quote_catalog_items (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE quote_catalog_items (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        area VARCHAR NOT NULL,
        category VARCHAR NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(12,2) NOT NULL DEFAULT 0,
        price_special DECIMAL(12,2),
        unit VARCHAR(100) NOT NULL DEFAULT 'por persona',
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `)))
  );
  await withTimeout("quote_conditions (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE quote_conditions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        area VARCHAR NOT NULL UNIQUE,
        content TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)))
  );
  await withTimeout("quote_conditions (seed defaults)", T, async () => {
    const res = await db.execute(sql`SELECT COUNT(*) as cnt FROM quote_conditions`);
    const cnt = parseInt((res.rows[0] as any).cnt ?? "0");
    if (cnt === 0) {
      await db.execute(sql`
        INSERT INTO quote_conditions (id, area, content) VALUES
        ('qcond-grupos', 'grupos', E'CONDICIONES DE CONTRATACIÓN:\n\n• El presente presupuesto no implica bloqueo de habitaciones.\n\n• El camaje detallado no puede modificarse.\n\n• El pago del alojamiento y servicios adicionales contratados deberá ser realizado desde la organización y no por huésped alojado o asistente al evento.\n\n• Para garantizar la reservación, solicitamos el pago del 30% del monto final.\n\n• La tarifa no incluye servicios adicionales a excepción de aquellos detallados.\n\n• La cancelación sin penalización será de 15 días previos al comienzo de la estadía.\n\n• El rooming definitivo debe entregarse 1 semana antes del Check in solicitado. A partir de esa fecha, las habitaciones estarán sujetas a disponibilidad del hotel.'),
        ('qcond-recepcion', 'recepcion', E'CONDICIONES DE CONTRATACIÓN:\n\n• El presente presupuesto no implica bloqueo de habitaciones.\n\n• Para garantizar la reservación, solicitamos el pago del 30% del monto final.\n\n• La tarifa no incluye servicios adicionales a excepción de aquellos detallados.\n\n• La cancelación sin penalización será de 15 días previos al comienzo de la estadía.\n\n• Check in a partir de las 15:00 hs. Check out hasta las 10:00 hs.'),
        ('qcond-eventos', 'eventos', E'El presente presupuesto se actualizará hasta un mes antes del evento.\n\nCONDICIONES:\n\n• Para garantizar la reserva del salón, solicitamos el pago del 50% del total del evento.\n\n• El saldo restante deberá abonarse 7 días antes del evento.\n\n• La cancelación sin penalización será de 30 días previos al evento.\n\n• Los precios incluyen IVA salvo indicación contraria.\n\n• El catering y servicios adicionales deberán confirmarse con 15 días de anticipación.'),
        ('qcond-spa', 'spa', E'• La reserva se confirma con el pago del 30% del total.\n\n• Las cancelaciones con menos de 48 horas de anticipación no tienen devolución.\n\n• Los tratamientos tienen una duración aproximada indicada en cada servicio.\n\n• Se recomienda llegar 15 minutos antes del turno reservado.'),
        ('qcond-restaurant', 'restaurant', E'• La reserva se confirma con el pago del 30% del total.\n\n• Los menús deben confirmarse con 72 horas de anticipación.\n\n• La cancelación sin penalización es de 48 horas antes del evento.\n\n• Los precios indicados son por persona salvo que se especifique lo contrario.')
        ON CONFLICT (area) DO NOTHING
      `);
    }
  });
  await withTimeout("quote_catalog_items (seed eventos)", T, async () => {
    const res = await db.execute(sql`SELECT COUNT(*) as cnt FROM quote_catalog_items WHERE area = 'eventos'`);
    const cnt = parseInt((res.rows[0] as any).cnt ?? "0");
    if (cnt === 0) {
      await db.execute(sql`
        INSERT INTO quote_catalog_items (id, area, category, name, description, price, price_special, unit, is_active, sort_order) VALUES
        ('qci-ev-s1','eventos','salon','Parque Urquiza','340 m² — Auditorio hasta 500 pax. Divisible en Ala Mitre y Ala Rivadavia.',1040000,890000,'por día',true,0),
        ('qci-ev-s2','eventos','salon','Ala Mitre','120 m² — Auditorio hasta 120 pax.',525000,451000,'por día',true,1),
        ('qci-ev-s3','eventos','salon','Ala Rivadavia','220 m² — Auditorio hasta 280 pax.',630000,545000,'por día',true,2),
        ('qci-ev-s4','eventos','salon','Rosedal','56 m² — Auditorio hasta 40 pax.',262000,225000,'por día',true,3),
        ('qci-ev-s5','eventos','salon','Solárium','Terraza exterior con vista al Parque Urquiza.',525000,451000,'por día',true,4),
        ('qci-ev-c1','eventos','coffee_break','Opción Líquida Especial','Café, variedades de té, leche, jugo de naranja.',5300,null,'por persona',true,0),
        ('qci-ev-c2','eventos','coffee_break','Opción 1','Café, variedades de té, leche, agua mineral, jugo, petit four, medialunas dulces y saladas.',6900,null,'por persona',true,1),
        ('qci-ev-c3','eventos','coffee_break','Opción 2','Café, té, leche, agua mineral, jugo, petit four, medialunas, criollos, variedad de budines, ensalada de frutas.',9000,null,'por persona',true,2),
        ('qci-ev-c4','eventos','coffee_break','Opción 3','Café, variedades de té, leche, agua mineral, jugo, petit four, budines caseros, criollos entrerrianos, scons, medialunas, mini sándwiches, ensalada de frutas, shot de frutos rojos.',14000,null,'por persona',true,3),
        ('qci-ev-c5','eventos','coffee_break','Opción Saludable','Infusión, jugo de naranja exprimido, copa de yogurt con granola y miel, ensalada de frutas, cookies de avena, frutos secos, budín integral, chia pudding.',10500,null,'por persona',true,4),
        ('qci-ev-k1','eventos','coctel','Cóctel 1','Sándwiches en pan de miga, empanaditas variadas, mini pizzas, cazuela de pollo en crema de hongos. Incluye agua mineral, aguas saborizadas y gaseosas.',35000,null,'por persona',true,0),
        ('qci-ev-k2','eventos','coctel','Cóctel 2','Sándwiches, empanaditas, mini pizzas, cazuela de pollo, mini picada, pincho de bondiola. Postre: mini flan, ensalada de frutas, mini brownie. Incluye agua mineral, aguas saborizadas y gaseosas.',43000,null,'por persona',true,1),
        ('qci-ev-e1','eventos','equipamiento','Conferencia Básico','Sonido (Mitre/Rivadavia): 2 micrófonos. Proyección con pantalla, proyector HDMI y pasador inalámbrico. Operador. 4 horas.',360000,null,'servicio',true,0),
        ('qci-ev-e2','eventos','equipamiento','Conferencia Medio','Sonido (Mitre/Rivadavia): 3 micrófonos cuello de cisne + 2 inalámbricos. Proyección HDMI, retorno de video, pasador inalámbrico. Operador. 4 horas.',432000,null,'servicio',true,1),
        ('qci-ev-e3','eventos','equipamiento','Conferencia Grande','Sonido (Parque Urquiza): 2 micrófonos. Proyección HDMI, pasador inalámbrico. Operador. 4 horas.',432000,null,'servicio',true,2),
        ('qci-ev-e4','eventos','equipamiento','Conferencia Grande Plus','Sonido (Parque Urquiza): 3 micrófonos cuello de cisne + 2 inalámbricos. Proyección HDMI, retorno de video. Operador. 4 horas.',511200,null,'servicio',true,3),
        ('qci-ev-e5','eventos','equipamiento','Conferencia + Transmisión Básico','Sonido (Mitre/Rivadavia) + transmisión básica a Zoom/Meet: ATEM Mini (swicher) + 1 cámara. Operador. 4 horas.',630000,null,'servicio',true,4),
        ('qci-ev-e6','eventos','equipamiento','Conferencia + Transmisión Medio','Sonido (Mitre/Rivadavia) + transmisión a 2 redes (YouTube, Facebook, Meet/Zoom): Mixer DataVideo 1600T con 3 cámaras robóticas. Operador. 4 horas.',747000,null,'servicio',true,5),
        ('qci-ev-e7','eventos','equipamiento','Conferencia + Transmisión High','Sonido (Mitre/Rivadavia) + transmisión simultánea a 10 redes: Mixer DataVideo 1300T con 3 cámaras Full HD + mochila de transmisión. Operador. 4 horas.',867000,null,'servicio',true,6),
        ('qci-ev-e8','eventos','equipamiento','Solo Sonido (Mitre/Rivadavia)','2 micrófonos cuello de cisne o inalámbricos. Operador. 4 horas.',255000,null,'servicio',true,7),
        ('qci-ev-e9','eventos','equipamiento','Solo Sonido (Parque Urquiza)','2 micrófonos cuello de cisne o inalámbricos. Operador. 4 horas.',276000,null,'servicio',true,8)
        ON CONFLICT (id) DO NOTHING
      `);
    }
  });

  // ── SPA appointments — guest_id column (added after initial migration) ───
  await withTimeout("spa_appointments.guest_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_appointments ADD COLUMN guest_id varchar`)))
  );

  // ── Unificación clientes SPA → guests ────────────────────────────────────
  await withTimeout("spa_clients → guests migration", T, async () => {
    await db.execute(sql`
      INSERT INTO guests (id, first_name, last_name, phone, email)
      SELECT sc.id, sc.first_name, COALESCE(sc.last_name, '-'), sc.phone, sc.email
      FROM spa_clients sc
      WHERE NOT EXISTS (SELECT 1 FROM guests g WHERE g.id = sc.id)
    `);
  });

  // ── SPA clients — nuevos campos demograficos ──────────────────────────────
  await withTimeout("spa_clients new columns", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN tipo_persona text DEFAULT 'fisica'`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN document_type text`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN document_number text`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN cuil_cuit text`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN vat_condition text`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN direccion text`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN provincia text`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN localidad text`)));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_clients ADD COLUMN codigo_postal text`)));
  });

  // ── SPA circuit resources ─────────────────────────────────────────────────
  // Additive model: existing appointments keep their single cabin, while
  // circuits may reserve extra cabins through linked resource rows.
  await withTimeout("spa_treatments.is_circuit", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE spa_cabins
      ADD COLUMN resource_type text
    `)));
    await db.execute(sql`
      UPDATE spa_cabins
      SET resource_type = CASE
        WHEN LOWER(name) LIKE '%sauna%' THEN 'sauna'
        WHEN LOWER(name) LIKE '%hidro%' THEN 'hidromasaje'
        ELSE resource_type
      END
      WHERE resource_type IS NULL
        AND (LOWER(name) LIKE '%sauna%' OR LOWER(name) LIKE '%hidro%')
    `);
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE spa_treatments
      ADD COLUMN is_circuit boolean NOT NULL DEFAULT false
    `)));
    await db.execute(sql`
      UPDATE spa_treatments t
      SET is_circuit = true
      WHERE t.is_circuit = false
        AND EXISTS (
          SELECT 1
          FROM spa_treatment_categories c
          WHERE c.id = t.category_id
            AND LOWER(c.name) = 'circuitos'
        )
    `);
  });
  await withTimeout("spa_treatment_resources", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE spa_treatment_resources (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        treatment_id varchar NOT NULL,
        default_cabin_id varchar NOT NULL,
        duration_minutes integer NOT NULL DEFAULT 30,
        sort_order integer NOT NULL DEFAULT 0
      )
    `)))
  );
  await withTimeout("spa_appointment_resources", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE spa_appointment_resources (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id varchar NOT NULL,
        cabin_id varchar NOT NULL,
        start_time text NOT NULL,
        end_time text NOT NULL,
        duration_minutes integer NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("spa circuit resource foreign keys", T, async () => {
    await db.execute(sql.raw(SPA_CIRCUIT_RESOURCE_FOREIGN_KEYS_MIGRATION_SQL));
  });
  await withTimeout("spa circuit resource indexes", T, async () => {
    await db.execute(sql.raw(incrementalIndexSql("spaTreatmentResourcesTreatment")));
    await db.execute(sql.raw(incrementalIndexSql("spaAppointmentResourcesAppointment")));
    await db.execute(sql.raw(incrementalIndexSql("spaAppointmentResourcesCabin")));
  });

  // ── Web check-in — solicitud Factura A ────────────────────────────────────
  await withTimeout("web_checkins request_factura_a column", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE web_checkins ADD COLUMN request_factura_a boolean DEFAULT false`)));
  });

  // ── Paquetes Turísticos ───────────────────────────────────────────────────
  await withTimeout("packages (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE packages (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        name text NOT NULL,
        description text,
        room_type_id varchar,
        nights integer NOT NULL DEFAULT 1,
        base_price decimal(12,2) NOT NULL DEFAULT 0,
        discount_percent decimal(5,2),
        valid_from date,
        valid_until date,
        status text NOT NULL DEFAULT 'active',
        included_services text[],
        terms text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );

  await withTimeout("package_items (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE package_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id varchar NOT NULL,
        item_type text NOT NULL,
        description text NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        unit_value decimal(10,2)
      )
    `)))
  );

  await withTimeout("package_room_prices (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE package_room_prices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id varchar NOT NULL,
        room_type_id varchar NOT NULL,
        price decimal(12,2) NOT NULL DEFAULT 0,
        extra_amount decimal(12,2) DEFAULT 0
      )
    `)))
  );

  await withTimeout("preventive_tasks (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE preventive_tasks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        description text,
        frequency text NOT NULL DEFAULT 'monthly',
        frequency_days integer NOT NULL DEFAULT 30,
        last_done_at date,
        next_due_at date NOT NULL,
        assigned_to varchar(255),
        notes text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `)))
  );

  // ── preventive_tasks: registro de demora ─────────────────────────────────
  await withTimeout("preventive_tasks.last_overdue_days", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE preventive_tasks ADD COLUMN last_overdue_days integer`)))
  );

  // ── Unificación platos/inventario ────────────────────────────────────────
  await withTimeout("inventory_items.item_kind", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE inventory_items ADD COLUMN item_kind text NOT NULL DEFAULT 'venta_directa'`)))
  );
  await withTimeout("menu_items.inventory_item_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE menu_items ADD COLUMN inventory_item_id varchar`)))
  );
  await withTimeout("item_categories.platos (ensure)", T, async () => {
    const res = await db.execute(sql`
      INSERT INTO item_categories (id, name, description, area, is_active)
      SELECT gen_random_uuid(), 'Platos', 'Platos del restaurante (generado automáticamente)', 'restaurant', 'true'
      WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE area = 'restaurant' AND name = 'Platos')
      RETURNING id
    `);
    return res;
  });
  await withTimeout("menu_items.backfill_inventory_mirror", T, async () => {
    const catRes = await db.execute(sql`SELECT id FROM item_categories WHERE area = 'restaurant' AND name = 'Platos' LIMIT 1`);
    const categoryId = (catRes.rows[0] as any)?.id;
    if (!categoryId) return;
    const missing = await db.execute(sql`SELECT id, name, is_active FROM menu_items WHERE inventory_item_id IS NULL`);
    for (const row of missing.rows as any[]) {
      const inserted = await db.execute(sql`
        INSERT INTO inventory_items (id, name, category_id, unit, item_kind, is_active, cost_price, min_stock, current_stock)
        VALUES (gen_random_uuid(), ${row.name}, ${categoryId}, 'unidad', 'plato', ${row.is_active ?? 'true'}, '0.00', '0.000', '0.000')
        RETURNING id
      `);
      const mirrorId = (inserted.rows[0] as any)?.id;
      if (mirrorId) {
        await db.execute(sql`UPDATE menu_items SET inventory_item_id = ${mirrorId} WHERE id = ${row.id}`);
      }
    }
    if (missing.rows.length > 0) {
      logger.info(`Backfill: ${missing.rows.length} platos vinculados a inventario.`);
    }
  });

  // account_movements / account_movement_allocations: nunca estaban en el bloque
  // incremental (solo en el migrate() de baseline, que se omite en producción).
  // Esto provocaba "relation does not exist" en Railway -> endpoints de saldo
  // devolvían 500 -> frontend mostraba $0.00.
  await withTimeout("account_movements (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE account_movements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type text NOT NULL,
        entity_id varchar NOT NULL,
        date date NOT NULL,
        type text NOT NULL,
        description text NOT NULL,
        amount numeric(12, 2) NOT NULL,
        reservation_id varchar,
        reservation_code text,
        guest_name text,
        reference text,
        retentions jsonb,
        created_by varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("account_movements.retentions", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE account_movements ADD COLUMN retentions jsonb`)))
  );
  await withTimeout("account_movement_allocations (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE account_movement_allocations (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        pago_id varchar NOT NULL REFERENCES account_movements(id),
        cargo_id varchar NOT NULL REFERENCES account_movements(id),
        amount numeric(12, 2) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("account_movements.idx_entity", T, () =>
    db.execute(sql.raw(incrementalIndexSql("accountMovementsEntity")))
  );
  await withTimeout("account_movement_allocations.idx_cargo", T, () =>
    db.execute(sql.raw(incrementalIndexSql("accountMovementAllocationsCargo")))
  );
  await withTimeout("account_movements.payment_method", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE account_movements ADD COLUMN payment_method text`)))
  );
  await withTimeout("account_movement_allocations.idx_pago", T, () =>
    db.execute(sql.raw(incrementalIndexSql("accountMovementAllocationsPago")))
  );

  // Credit notes for reservation folios are persisted before ARCA authorization.
  // The reconciliation fields make a post-authorization Folio correction
  // recoverable instead of allowing a second fiscal NC on retry.
  await withTimeout("sales_invoices.nc_reconciliation_status", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN reconciliation_status text`)))
  );
  await withTimeout("sales_invoices.nc_reconciliation_error", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN reconciliation_error text`)))
  );
  await withTimeout("sales_invoices.nc_reconciliation_updated_at", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN reconciliation_updated_at timestamp`)))
  );
  await withTimeout("sales_invoices.nc_reconciliation_pending_idx", T, () =>
    db.execute(sql.raw(incrementalIndexSql("salesInvoicesNcReconciliationPending")))
  );
  await withTimeout("sales_invoices.credit_reapplication_intent", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      `ALTER TABLE sales_invoices ADD COLUMN credit_reapplication_intent jsonb`
    )))
  );

  await withTimeout("reservations.checked_out_at", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE reservations ADD COLUMN checked_out_at timestamp`)))
  );

  await withTimeout("presupuestos.fecha_fin", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE presupuestos ADD COLUMN fecha_fin varchar`)))
  );

  await withTimeout("gift_vouchers (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE gift_vouchers (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_code text NOT NULL UNIQUE,
        area text NOT NULL,
        description text NOT NULL,
        value_type text NOT NULL DEFAULT 'monetario',
        value_amount decimal(10,2),
        buyer_name text NOT NULL,
        buyer_phone text,
        buyer_email text,
        beneficiary_name text,
        status text NOT NULL DEFAULT 'activo',
        issued_at timestamp NOT NULL DEFAULT now(),
        expires_at date,
        used_at timestamp,
        used_by text,
        used_notes text,
        price_paid decimal(10,2),
        payment_method text,
        notes text,
        created_by text
      )
    `)))
  );

  // Restore deleted charge types (cochera, pensión completa) if missing
  await withTimeout("charge_types_restore_missing", T, () =>
    db.execute(sql`
      INSERT INTO charge_types (label, description, default_amount, category, sort_order, active, allow_price_edit)
      SELECT 'Cochera (por día)', 'Cochera', 2500, 'otros', 1, true, false
      WHERE NOT EXISTS (SELECT 1 FROM charge_types WHERE label = 'Cochera (por día)');

      INSERT INTO charge_types (label, description, default_amount, category, sort_order, active, allow_price_edit)
      SELECT 'Pensión Completa', 'Pensión Completa', 8000, 'restaurant', 3, true, false
      WHERE NOT EXISTS (SELECT 1 FROM charge_types WHERE label = 'Pensión Completa');
    `)
  );

  await withTimeout("rooms.is_active", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE rooms ADD COLUMN is_active boolean NOT NULL DEFAULT true`)))
  );

  // restaurant_tables: event-specific columns for "Evento por Mesa" salon
  await withTimeout("restaurant_tables.event_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE restaurant_tables
        ADD COLUMN event_client_name text,
        ADD COLUMN event_client_phone text,
        ADD COLUMN event_seats integer,
        ADD COLUMN event_notes text
    `)))
  );

  // restaurant_tables: email + advance fields for event pre-load
  await withTimeout("restaurant_tables.event_advance_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE restaurant_tables
        ADD COLUMN event_client_email text,
        ADD COLUMN event_advance_amount decimal(10,2),
        ADD COLUMN event_advance_method text,
        ADD COLUMN event_advance_date text
    `)))
  );

  // restaurant_tables: layout columns (shape, position, window) — en el schema pero faltaban en la migración
  await withTimeout("restaurant_tables.layout_cols", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE restaurant_tables
        ADD COLUMN shape text DEFAULT 'square',
        ADD COLUMN position_x integer DEFAULT 0,
        ADD COLUMN position_y integer DEFAULT 0,
        ADD COLUMN has_window text DEFAULT 'false'
    `)))
  );

  // Seed "Evento por Mesa" restaurant area if not present
  await withTimeout("restaurant_areas.evento_por_mesa_seed", T, () =>
    db.execute(sql`
      INSERT INTO restaurant_areas (id, name, area_type, capacity, has_tables, is_active, notes)
      SELECT 'area-evento-mesa', 'Evento por Mesa', 'event', 100, 'true', 'true',
             'Salón para eventos con servicio de restaurante (cenas, celebraciones, etc.)'
      WHERE NOT EXISTS (SELECT 1 FROM restaurant_areas WHERE id = 'area-evento-mesa')
    `)
  );

  await withTimeout("charge_types.allow_recurring", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE charge_types ADD COLUMN allow_recurring boolean NOT NULL DEFAULT false`)))
  );

  await withTimeout("charges.is_recurring", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE charges ADD COLUMN is_recurring boolean NOT NULL DEFAULT false`)))
  );

  await withTimeout("charges.unit_amount", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE charges ADD COLUMN unit_amount decimal(10,2)`)))
  );

  // Fix: clear valid_to on rate plans that expired in the past but still have current pricing.
  // These were versioned incorrectly via "nueva versión" flow leaving them hidden.
  await withTimeout("rate_plans.clear_expired_valid_to", T, () =>
    db.execute(sql`UPDATE rate_plans SET valid_to = NULL WHERE valid_to < CURRENT_DATE`)
  );

  await withTimeout("reservations.special_rate_reason", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE reservations ADD COLUMN special_rate_reason text`)))
  );

  await withTimeout("rate_plans.fix_currency_ars", T, () =>
    db.execute(sql`UPDATE rate_plans SET currency = 'ARS' WHERE currency IS NULL OR currency = '' OR currency != 'ARS'`)
  );

  // invoice_ref en payments (anticipo con factura electrónica vinculada)
  await withTimeout("payments.invoice_ref", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE payments ADD COLUMN invoice_ref text`)))
  );

  // invoice_ref en group_payments y event_payments (misma funcionalidad para grupos y eventos)
  await withTimeout("group_payments.invoice_ref", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN invoice_ref text`)))
  );
  await withTimeout("event_payments.invoice_ref", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE event_payments ADD COLUMN invoice_ref text`)))
  );

  // invoice_link_failed: persistent flag so unlinked invoices can be found after toast disappears
  await withTimeout("payments.invoice_link_failed", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE payments ADD COLUMN invoice_link_failed boolean NOT NULL DEFAULT false`)))
  );

  // guest_id FK on reservation_companions — link companions to CRM guest profiles
  await withTimeout("reservation_companions.guest_id", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE reservation_companions ADD COLUMN guest_id varchar",
    )));
    return db.execute(sql.raw(RESERVATION_COMPANIONS_GUEST_FK_MIGRATION_SQL));
  });

  // merma: % de desperdicio por ingrediente en recetas
  await withTimeout("recipe_ingredients.merma", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE recipe_ingredients ADD COLUMN merma numeric(5,2)`)))
  );

  // Elaboraciones base (sub-recipes / intermediate productions)
  await withTimeout("recipes.elaboraciones_fields", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE recipes
        ADD COLUMN is_base boolean DEFAULT false,
        ADD COLUMN name text,
        ADD COLUMN production_unit text,
        ADD COLUMN production_yield numeric(10,3);
    `)));
    return db.execute(sql`ALTER TABLE recipes ALTER COLUMN menu_item_id DROP NOT NULL`);
  });

  await withTimeout("recipe_ingredients.sub_recipe_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE recipe_ingredients ADD COLUMN sub_recipe_id varchar`)))
  );

  // Toma de Inventario
  await withTimeout("inventory_counts.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE inventory_counts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        date date NOT NULL,
        area text,
        status text NOT NULL DEFAULT 'borrador',
        notes text,
        created_by text,
        closed_at timestamp,
        closed_by text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );

  await withTimeout("inventory_count_items.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE inventory_count_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        count_id varchar NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
        item_id varchar NOT NULL,
        item_name text NOT NULL,
        unit text NOT NULL DEFAULT 'unidad',
        expected_stock numeric(10,3) NOT NULL DEFAULT 0,
        actual_stock numeric(10,3),
        notes text
      )
    `)))
  );

  await withTimeout("menu_categories.is_beverage", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE menu_categories ADD COLUMN is_beverage BOOLEAN DEFAULT FALSE`)))
  );

  await withTimeout("internal_movements.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE internal_movements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        date date NOT NULL,
        motivo text NOT NULL,
        descripcion text,
        notes text,
        created_by text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );

  await withTimeout("internal_movement_items.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE internal_movement_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        movement_id varchar NOT NULL REFERENCES internal_movements(id) ON DELETE CASCADE,
        item_id varchar NOT NULL,
        item_name text NOT NULL,
        unit text NOT NULL DEFAULT 'unidad',
        quantity numeric(10,3) NOT NULL,
        cost_price numeric(10,2) NOT NULL DEFAULT 0,
        notes text
      )
    `)))
  );

  await withTimeout("item_categories.is_group", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE item_categories ADD COLUMN is_group boolean NOT NULL DEFAULT false`)))
  );

  await withTimeout("email_config.banner_footer", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE email_config
        ADD COLUMN email_banner_base64 text,
        ADD COLUMN email_footer_base64 text
    `)))
  );

  // group_payment_id on payments: deterministic FK so invoice_ref can be propagated to the exact group_payments row
  await withTimeout("payments.group_payment_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE payments ADD COLUMN group_payment_id varchar`)))
  );

  // Backfill [res:ID] tag on transfer charges that predate the room-link feature.
  // Charges with [corr:UUID] but no [res:...] are matched by their corr UUID; the paired
  // charge's reservation_id becomes the [res:ID] written into the other side.
  await withTimeout("charges.backfill_transfer_res_tags", T, async () => {
    const rows = await db.execute(sql`
      SELECT id, reservation_id, description, category
      FROM charges
      WHERE category IN ('transfer_in', 'transfer_out')
        AND description LIKE '%[corr:%'
        AND description NOT LIKE '%[res:%'
        AND status = 'active'
    `);

    if (rows.rows.length === 0) return;

    // Build a map: corrId → list of charge rows
    const byCorr = new Map<string, any[]>();
    for (const row of rows.rows as any[]) {
      const m = (row.description as string).match(/\[corr:([^\]]+)\]/);
      if (!m) continue;
      const corrId = m[1];
      if (!byCorr.has(corrId)) byCorr.set(corrId, []);
      byCorr.get(corrId)!.push(row);
    }

    let patched = 0;
    for (const [corrId, charges] of byCorr.entries()) {
      // We need at least one charge to carry a corr tag; find any paired charge
      // (even if the counterpart already has [res:]) to identify the linked reservation.
      const allWithCorr = await db.execute(sql`
        SELECT id, reservation_id, description, category
        FROM charges
        WHERE description LIKE ${"%" + `[corr:${corrId}]` + "%"}
          AND category IN ('transfer_in', 'transfer_out')
      `);

      const allPairs = allWithCorr.rows as any[];
      if (allPairs.length < 2) continue; // can't determine the other side

      for (const charge of charges) {
        // The res to link to is the reservation_id of the OTHER side
        const other = allPairs.find((p: any) => p.id !== charge.id);
        if (!other) continue;
        const resId = other.reservation_id as string;
        const newDesc = `${charge.description} [res:${resId}]`;

        await db.execute(sql`
          UPDATE charges SET description = ${newDesc} WHERE id = ${charge.id}
        `);

        // Mirror the update into folio_movements for the same corr tag + category
        await db.execute(sql`
          UPDATE folio_movements
          SET description = description || ${` [res:${resId}]`}
          WHERE type = ${charge.category}
            AND description LIKE ${"%" + `[corr:${corrId}]` + "%"}
            AND description NOT LIKE '%[res:%'
        `);

        patched++;
      }
    }

    if (patched > 0) {
      logger.info(`Backfill: ${patched} transfer charge(s) actualizados con etiqueta [res:].`);
    }
  });

  // Backfill folio_movements for Nota de Débito invoices emitted before the ND
  // folio-charge feature was added. Finds every ND (NDA/NDB/NDC/NDT/NDM) that
  // has a reserva_id but no matching folio_movements row (source_type='nota_debito',
  // source_id=<invoice id>), resolves the folio via the reservation, and inserts
  // the missing charge so old folio PDFs show the ND amount.
  await withTimeout("folio_movements.backfill_nd_charges", T, async () => {
    const ndRows = await db.execute(sql`
      SELECT si.id, si.tipo_comprobante, si.punto_venta, si.numero,
             si.monto_total, si.reserva_id, si.created_at
      FROM sales_invoices si
      WHERE si.tipo_comprobante IN ('NDA', 'NDB', 'NDC', 'NDT', 'NDM')
        AND si.reserva_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM folio_movements fm
          WHERE fm.source_type = 'nota_debito'
            AND fm.source_id = si.id::text
        )
    `);

    if (ndRows.rows.length === 0) return;

    let inserted = 0;
    for (const nd of ndRows.rows as any[]) {
      // Resolve folio UUID from the reservation
      const folioRow = await db.execute(sql`
        SELECT id FROM folios
        WHERE entity_type = 'reservation' AND entity_id = ${String(nd.reserva_id)}
        LIMIT 1
      `);
      const folioId = (folioRow.rows[0] as any)?.id;
      if (!folioId) continue;

      const pv = String(nd.punto_venta ?? 1).padStart(4, "0");
      const nro = String(nd.numero ?? 0).padStart(8, "0");
      const nroND = `${nd.tipo_comprobante} ${pv}-${nro}`;
      const monto = parseFloat(String(nd.monto_total ?? "0"));
      if (monto <= 0) continue;

      await db.execute(sql`
        INSERT INTO folio_movements (id, folio_id, type, amount, description, source_type, source_id, receipt_type, registered_by, created_at)
        VALUES (
          gen_random_uuid(),
          ${folioId},
          'charge',
          ${monto.toFixed(2)},
          ${"Nota de Débito " + nroND},
          'nota_debito',
          ${String(nd.id)},
          ${nd.tipo_comprobante},
          'backfill',
          ${nd.created_at ?? new Date()}
        )
      `);

      // Recalc folio balance
      await db.execute(sql`
        UPDATE folios SET
          total_charges = (
            SELECT COALESCE(SUM(amount::numeric), 0)
            FROM folio_movements
            WHERE folio_id = ${folioId} AND type IN ('charge', 'transfer_in')
          ),
          total_payments = (
            SELECT COALESCE(SUM(amount::numeric), 0)
            FROM folio_movements
            WHERE folio_id = ${folioId} AND type IN ('payment', 'advance', 'discount', 'transfer_out', 'void')
          ),
          balance = (
            SELECT COALESCE(SUM(CASE WHEN type IN ('charge','transfer_in') THEN amount::numeric
                                     ELSE -amount::numeric END), 0)
            FROM folio_movements
            WHERE folio_id = ${folioId} AND type IN ('charge','transfer_in','payment','advance','discount','transfer_out','void')
          )
        WHERE id = ${folioId}
      `);

      inserted++;
    }

    if (inserted > 0) {
      logger.info(`Backfill: ${inserted} folio_movements de Nota de Débito insertados.`);
    }
  });

  // sales_invoices.reserva_id was integer, but reservations use UUID/varchar IDs.
  // Converting to varchar so the folio lookup (entity_id = reserva_id) works correctly.
  await withTimeout("sales_invoices.reserva_id_varchar", T, () =>
    db.execute(sql`
      ALTER TABLE sales_invoices
        ALTER COLUMN reserva_id TYPE varchar USING reserva_id::varchar
    `)
  );

  await withTimeout("sales_invoices.restaurant_order_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN restaurant_order_id varchar`)))
  );

  await withTimeout("spa_accounts.invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_accounts ADD COLUMN invoice_id integer`)))
  );

  await withTimeout("events.invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE events ADD COLUMN invoice_id integer`)))
  );

  await withTimeout("event_tables.invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE event_tables ADD COLUMN invoice_id integer`)))
  );

  await withTimeout("event_tables.nc_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE event_tables ADD COLUMN nc_id integer`)))
  );

  await withTimeout("events.nc_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE events ADD COLUMN nc_id integer`)))
  );

  await withTimeout("groups.billing_entity_type", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE groups ADD COLUMN billing_entity_type text`)))
  );

  await withTimeout("spa_accounts.nc_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_accounts ADD COLUMN nc_id integer`)))
  );

  await withTimeout("groups.billing_entity_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE groups ADD COLUMN billing_entity_id varchar`)))
  );

  await withTimeout("sales_invoices.cash_forma_pago", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN cash_forma_pago text`)))
  );

  await withTimeout("sales_invoices.cash_forma_pago_detalle", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN cash_forma_pago_detalle jsonb`)))
  );

  await withTimeout("sales_invoices.source_charge_ids", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN source_charge_ids jsonb`)))
  );

  await withTimeout("sales_invoices.source_charge_amounts", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN source_charge_amounts jsonb`)))
  );

  await withTimeout("sales_invoices.observaciones", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN observaciones text`)))
  );

  await withTimeout("group_payments.receipt_type", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN receipt_type text`)))
  );

  await withTimeout("group_payments.billing_entity_type", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN billing_entity_type text`)))
  );

  await withTimeout("group_payments.billing_entity_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN billing_entity_id varchar(255)`)))
  );

  await withTimeout("group_payments.payment_method_detail", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN payment_method_detail jsonb`)))
  );

  await withTimeout("group_payments.destination_and_receiver", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE group_payments
        ADD COLUMN destination text NOT NULL DEFAULT 'group_distribution',
        ADD COLUMN receiver_details jsonb;
    `)));
    return db.execute(sql`
      UPDATE group_payments
      SET destination = 'master_folio'
      WHERE destination = 'group_distribution'
        AND distribution = 'master_folio';
    `);
  });

  await withTimeout("group_payments.invoice_id", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE group_payments ADD COLUMN invoice_id integer",
    )));
    return db.execute(sql.raw(incrementalIndexSql("groupPaymentsInvoiceIdUnique")));
  });

  await withTimeout("account_movements.group_payment_id", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE account_movements ADD COLUMN group_payment_id varchar",
    )));
    return db.execute(sql.raw(incrementalIndexSql("accountMovementsGroupPaymentId")));
  });
  await withTimeout("group_payments.group_id_idx", T, () =>
    db.execute(sql.raw(incrementalIndexSql("groupPaymentsGroupId")))
  );
  await withTimeout("payments.group_payment_id_idx", T, () =>
    db.execute(sql.raw(incrementalIndexSql("paymentsGroupPaymentId")))
  );

  // invoice_nc_ref on group_payments: JSON-encoded ARCA NC result when a nota de crédito has been emitted for this payment
  await withTimeout("group_payments.invoice_nc_ref", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN invoice_nc_ref text`)))
  );

  // retention_detail on group_payments: [{tipo, monto}] retención withheld on
  // the portion of a Folio Maestro / group-charges payment that has no real
  // room to attach payments.notes to — without this column that retención
  // was silently dropped instead of just recorded elsewhere.
  await withTimeout("group_payments.retention_detail", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_payments ADD COLUMN retention_detail jsonb`)))
  );

  // Recover only immutable splits explicitly persisted before fiscal
  // authorization. No balance-based inference is allowed: a later collection
  // can exceed the fiscal document while still applying prior advances.
  await withTimeout("group_payments.settlement_breakdown_backfill", T, () =>
    backfillGroupPaymentSettlementBreakdowns()
  );

  // Receipt numbers are generated only for newly issued parent receipts.
  // Do not backfill historic UUID receipts: their immutable display fallback
  // is intentionally handled by the receipt renderer.
  await withTimeout("group_payments.receipt_number_and_concepts", T, async () => {
    await db.execute(sql.raw(INCREMENTAL_NON_INDEX_DDL.groupPaymentsReceiptNumberSequence));
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE group_payments ADD COLUMN receipt_number integer",
    )));
    await db.execute(sql`
      ALTER TABLE group_payments
        ALTER COLUMN receipt_number SET DEFAULT nextval('group_payments_receipt_number_seq'::regclass);
      ${sql.raw(incrementalIndexSql("groupPaymentsReceiptNumberUnique"))}
    `);
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE group_payments ADD COLUMN concepts jsonb",
    )));
    return db.execute(sql`
      CREATE OR REPLACE FUNCTION prevent_group_payment_receipt_number_change()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN
          RAISE EXCEPTION 'group payment receipt_number is immutable';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS group_payments_receipt_number_immutable ON group_payments;
      CREATE TRIGGER group_payments_receipt_number_immutable
        BEFORE UPDATE ON group_payments
        FOR EACH ROW EXECUTE FUNCTION prevent_group_payment_receipt_number_change();
    `);
  });

  // group_invoices: facturas emitidas directamente desde el Resumen del Grupo (sin pago asociado)
  await withTimeout("group_invoices (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE group_invoices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id varchar NOT NULL,
        sales_invoice_id integer UNIQUE,
        invoice_ref text NOT NULL,
        notes text,
        created_at timestamp DEFAULT now()
      )
    `)))
  );

  // Add sales_invoice_id column if table was created without it (incremental add)
  await withTimeout("group_invoices.sales_invoice_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE group_invoices ADD COLUMN sales_invoice_id integer UNIQUE`)))
  );

  // The fiscal source claim must be written with sales_invoices, before the
  // client performs its follow-up link request. This makes the group residual
  // guard safe across simultaneous browser actions and application instances.
  await withTimeout("sales_invoices.group_invoice_scope", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE sales_invoices
        ADD COLUMN group_id varchar,
        ADD COLUMN group_payment_id varchar,
        ADD COLUMN group_payment_intent jsonb;
    `)));
    // The constraint/index below are retired, superseded by the partial
    // index that follows (salesInvoicesGroupPaymentId). Both stay absent on
    // every startup from here on, so the native DROP ... IF EXISTS form
    // would log a "does not exist, skipping" notice on every single run —
    // not just once — on any database that already completed this migration.
    return db.execute(sql`
      ${sql.raw(incrementalIndexSql("salesInvoicesGroupId"))};
      ${sql.raw(dropConstraintWithoutRerunNotice("sales_invoices", "sales_invoices_group_payment_id_unique"))};
      ${sql.raw(dropIndexWithoutRerunNotice("sales_invoices_group_payment_id_unique"))};
      ${sql.raw(incrementalIndexSql("salesInvoicesGroupPaymentId"))};
    `);
  });

  // Reservation-payment ownership is captured before ARCA just like group and
  // SPA ownership.  A payment has one fiscal document: the unique claim closes
  // the concurrent-tab window before an outbound ARCA request is made.
  await withTimeout("sales_invoices.payment_invoice_scope", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE sales_invoices ADD COLUMN payment_id varchar",
    )));
    return db.execute(sql.raw(incrementalIndexSql("salesInvoicesPaymentId")));
  });

  // A fiscal invoice emitted from SPA claims its account before ARCA issuance.
  // The unique partial index prevents two browser tabs from invoicing the same
  // SPA account independently.
  await withTimeout("sales_invoices.spa_account_scope", T, async () => {
    await db.execute(sql.raw(incrementalDdlWithoutRerunNotice(
      "ALTER TABLE sales_invoices ADD COLUMN spa_account_id varchar",
    )));
    return db.execute(sql.raw(incrementalIndexSql("salesInvoicesSpaAccountIdUnique")));
  });

  // Clean up 9 orphaned spa_accounts from March 2026 whose parent appointments
  // were deleted. Mark as 'cancelled' (not DELETE) to preserve payment history.
  // The 3 closed accounts have room_charge payments already applied to folios.
  await withTimeout("spa_accounts.cancel_orphans_mar2026", T, () =>
    db.execute(sql`
      UPDATE spa_accounts
      SET status = 'cancelled'
      WHERE id IN (
        '386e690e-e53c-4681-b437-0ac819326670',
        '23843e10-e5e4-4f09-a876-f2c6aca2dfad',
        '27a80722-d49b-402c-a450-55605aad58b3',
        'ff8023f0-cd02-47d1-ad4e-3bc01c8175fb',
        'e00b84fe-2cf3-4b00-b50f-c3d20918c5a1',
        '19fbd230-4d0f-4505-82cc-f5a4b8624455',
        '3d9f67ed-86a9-4065-bf81-053d2174ec6b',
        '9eef1548-3442-4785-ba9e-46dbca1829d4',
        '10866f01-f1db-48ea-9c5a-cc09ab2bd899'
      )
      AND status != 'cancelled'
    `)
  );

  // moved_from_room_number on reservations: stores original room number when a checked-in reservation is moved in-house
  await withTimeout("reservations.moved_from_room_number", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE reservations ADD COLUMN moved_from_room_number text`)))
  );

  // billing_config: iibb e telefono para comprobantes fiscales
  await withTimeout("billing_config.iibb_telefono", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE billing_config
        ADD COLUMN iibb text,
        ADD COLUMN telefono text
    `)))
  );

  // Add regimen_hospedaje to companies
  await withTimeout("companies.regimen_hospedaje", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE companies ADD COLUMN regimen_hospedaje text`)))
  );

  // cash_register_configs: unique constraint on area column.
  // Check both the constraint and its backing relation so reruns do not emit
  // duplicate-relation warnings when the index already exists.
  await withTimeout("cash_register_configs.area_unique", T, () =>
    db.execute(sql.raw(CASH_REGISTER_CONFIGS_AREA_UNIQUE_MIGRATION_SQL))
  );

  // ── Seed inicial de empresas y agencias ──────────────────────────────────
  const { rows: seedCheck } = await db.execute(
    sql`SELECT COUNT(*) AS cnt FROM companies WHERE razon_social != 'Empresa E2E Maran'`
  );
  if (parseInt((seedCheck[0] as any).cnt) === 0) {
    logger.info("Seeding companies and agencies...");
    await db.execute(sql`DELETE FROM account_movements WHERE entity_type IN ('company','agency')`);
    await db.execute(sql`DELETE FROM companies`);
    await db.execute(sql`DELETE FROM agencies`);

    // Lote 1 de empresas (1-30)
    await db.execute(sql`
      INSERT INTO companies (razon_social, nombre_fantasia, cuil_cuit, condicion_iva, contact_name, contact_email, contact_phone, notes, regimen_hospedaje, condicion_venta_predeterminada, is_active) VALUES
      ('Asociacion De Cooperativas Argentinas Cooperativa Ltda','ACA','30500120882','responsable_inscripto','brunengo','brunengo@acacoop.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Aerolineas Argentinas SA','AEROLINEAS ARGENTINAS','30641405554','responsable_inscripto','','sucursalesfacturas@aerolineas.com.ar','','Fact: rosadmin@aerolineas.com.ar','','cuenta_corriente','true'),
      ('Agramin Sacma','AGRAMIN','30521525998','responsable_inscripto','','eugenia@agramin.com.ar','','','A Determinar','cuenta_corriente','true'),
      ('Agronorte SRL','AGRONORTE','30547794482','responsable_inscripto','','bonaldimatias@agronorte.com.ar','3536-547372','Pagos: pagos@agronorte.com.ar','A Determinar','cuenta_corriente','true'),
      ('Asociacion Civil Vida y Esperanza','ASOC VIDA Y ESPERANZA','30714984396','responsable_inscripto','Luciano','oficinasvye@gmail.com','','','Full Credit','cuenta_corriente','true'),
      ('Asociacion Civil Renacer','ASOC CIVIL RENACER','30709630527','responsable_inscripto','Carolina Quiroga','carodiazquiroga@gmail.com','','','Full Credit','cuenta_corriente','true'),
      ('Asociacion De La Magistratura y La Funcion Judicial De La Provincia De Entre Rios','MAGISTRATURA ER','33621358419','responsable_inscripto','virginia','amagistradoentrerios@gmail.com','','','','cuenta_corriente','true'),
      ('Asociacion Mutual Modelo De Entre Rios','MUTUAL MODELO','30700166429','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Banco Central De La Republica Argentina','BCRA','30500011382','responsable_inscripto','Silvana Blandi','ppastrana@bcra.gob.ar','','Reservas: sblandi@bcra.gob.ar. Pagos: Patricia Pastrana. VERIFICAR EN EXTRANET','Aloja','cuenta_corriente','true'),
      ('Banco De La Nacion Argentina','BNA','30500010912','responsable_inscripto','pedro','2650ZAD1@bna.com.ar','','Reservas: 2650ZAD@bna.com.ar','Solo Aloja','cuenta_corriente','true'),
      ('Bolsa De Cereales','BOLSA DE CEREALES','30500103414','responsable_inscripto','Dana Taleb','DanaOliveraTaleb@bolsacer.org.ar','','','Full Credit','cuenta_corriente','true'),
      ('Camara Arbitral De Cereales De Entre Rios','CAMARA ARBITRAL CEREALES ER','30525669277','responsable_inscripto','Yanina Monzon','ymonzon@cacerer.com.ar','','','A Determinar','cuenta_corriente','true'),
      ('Confederacion Argentina De La Mediana Empresa Came','CAME','30538872128','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Fundacion Centro De Medicina Nuclear y Molecular Entre Rios','CEMENER','30715094394','responsable_inscripto','Ekaterina Figueroa','ekaterina.figueroa@cemener.org.ar','','','Aloj + Cochera','cuenta_corriente','true'),
      ('Circulo Odontologico De Parana','CIRCULO ODONTOLOGICO','30547604268','responsable_inscripto','Emilia Patat','escuelaposgrado@coparana.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Club Atletico Patronato','CLUB ATLETICO PATRONATO','30654542208','responsable_inscripto','Abdala Gustavo','clubpatronatoparana@hotmail.com','','Abona Mutual. Fact: gerencia@ammer.com.ar','Full Credit','cuenta_corriente','true'),
      ('Col De Abogados De Entre Rios Sede Parana','COLEGIO DE ABOGADOS','30642510203','responsable_inscripto','Valentina Schmal','valentina@caer.org.ar','','Fact: Yanina Reik - yanina@caer.org.ar. Puede reservar Juliana Schonfeld','Aloj + Cochera','cuenta_corriente','true'),
      ('Colegio De Corredores Publico','COLEGIO DE CORREDORES','30707972250','responsable_inscripto','German','','','','Full Credit','cuenta_corriente','true'),
      ('Comersol SA','COMERSOL','30713266406','responsable_inscripto','Agustin M','agustin.m@comersol.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Consejo Profesional De Cs Eco De Er','CONSEJO CS ES','30537317171','responsable_inscripto','Julieta Battauz','spcpceer@cpceer.org.ar','','Fact: Lucrecia Masseto - lmasetto@cpceer.org.ar. VERIFICAR EXTRANET','A Determinar','cuenta_corriente','true'),
      ('Consolid SRL','CONSOLID','30710996608','responsable_inscripto','','','','','Solo Aloja','cuenta_corriente','true'),
      ('Coop Mutual Patronal Sociedad Mutual De Seg Grales','COOP MUTUAL PATRONAL','30500047174','responsable_inscripto','','centraldereservas@cooperacionseguros.com.ar','','','Aloja + Cochera','cuenta_corriente','true'),
      ('Derudder Hermanos SRL','DERUDDER','30611338844','responsable_inscripto','Claudio Pocai','cpocai@zenit.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Ener SA','ENERSA','30709176672','responsable_inscripto','Graciela Eunich','geurich@enersa.com.ar','','Contactos: Graciela Eunich e Ianina Castagno','Full Credit','cuenta_corriente','true'),
      ('Eriochem SA','ERIOCHEM','30700142643','responsable_inscripto','','comprobantes@erio.com.ar','','Reservas: fmonzon@erio.com.ar','','cuenta_corriente','true'),
      ('Esco Saca','ESCO','30629929742','responsable_inscripto','Cynthia Galliussi','fatimamachuca@esco.com.ar','3434168658','Fact: Fatima Machuca. Transfieren a Banco de Entre Rios','Full Credit','cuenta_corriente','true'),
      ('Federacion Economica De Entre Rios','FEDER','30671181197','responsable_inscripto','','coordinacion@federentrerios.com.ar','','','A Determinar','cuenta_corriente','true'),
      ('Ita SA Industria y Tecnologia En Aceros SA','FLOWINDUSTRIES ITA','30619658104','responsable_inscripto','Griotti Cristian','','','','','cuenta_corriente','true'),
      ('Valvulas Worcester De Argentina SA','FLOWINDUSTRIES VALVULAS','30516014748','responsable_inscripto','Analia','analia.camporeale@flowmanagement.com.ar','1138387790','','A Determinar','cuenta_corriente','true'),
      ('Frigorifico Alberdi SA','FRIGORIFICO ALBERDI','33609706959','responsable_inscripto','Tamara Silva','','','Pagos: Maxi Rios. Ordenes de pago en marcadores','A Determinar','cuenta_corriente','true')
    `);

    // Lote 2 de empresas (31-59)
    await db.execute(sql`
      INSERT INTO companies (razon_social, nombre_fantasia, cuil_cuit, condicion_iva, contact_name, contact_email, contact_phone, notes, regimen_hospedaje, condicion_venta_predeterminada, is_active) VALUES
      ('Gigared SA','GIGARED','30663045179','responsable_inscripto','Emilce','efernandez@gigared.com.ar','','','','cuenta_corriente','true'),
      ('Iapser','IAPSER','30500055509','responsable_inscripto','Mirta Gomez','proveedores@iapserseguros.seg.ar','','Fact: Florencia Yost - fyost@iapserseguros.seg.ar','Aloja','cuenta_corriente','true'),
      ('Integra Service SRL','INTEGRA (GRUPO PETERSEN)','30715826948','responsable_inscripto','Ezequiel','integrarosario@gmail.com','','Fact: facturasgrupobancosanjuan@bancosanjuan.com. Pagos: Andrea Caminos','A Determinar','cuenta_corriente','true'),
      ('Iter Medicina SA','ITER','30704734871','responsable_inscripto','Cristina','reclamos.contable@itermed.com.ar','','','Full Credit','cuenta_corriente','true'),
      ('Johnson Acero SA','JOHNSON ACERO','30501991070','responsable_inscripto','Daniela Barreto','recepcionpna@johnsonacero.com','+543434261000 Int 138','Fact: recepcionpna@johnsonacero.com. Verificar estado CTA: etaffarel@johnsonacero.com','Aloja','cuenta_corriente','true'),
      ('Laboratorios Aspen SA','LABORATORIO ASPEN','30610562228','responsable_inscripto','Rosario Rapuzzi','administracion@aspen-lab.com','','','A Determinar','cuenta_corriente','true'),
      ('Lafedar SA','LAFEDAR','30681071381','responsable_inscripto','','mariajose.fabro@lafedar.com','','','','cuenta_corriente','true'),
      ('Rafaela Alimentos SA','LARIO','33500529909','responsable_inscripto','','lourdesmartin@lario.com.ar','','','Aloja y Cochera','cuenta_corriente','true'),
      ('Leiva Comercial SA','LEIVA HNOS','30718560256','responsable_inscripto','','','','Tambien: Leiva Hermanos SA (30710771576)','','cuenta_corriente','true'),
      ('Leiva Hermanos SA','LEIVA HNOS','30710771576','responsable_inscripto','Paula Leiva','gimenacastano@leivahnos.com.ar','','Fact: Gimena Castagno','A Determinar','cuenta_corriente','true'),
      ('Liserar SA','LISERAR','30688955749','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Fundacion Miradortec Parque Tecnologico','MIRADOR TEC','30719274923','responsable_inscripto','pallotti','administrador@miradortec.net.ar','','Pagos: Vanesa Masilla - 3434656285','','cuenta_corriente','true'),
      ('Nexo SA','NEXO','30651957830','responsable_inscripto','Roxana Schiavoni','recepcion@nexo-aberturas.com.ar','','Hacer una sola factura si hay mas de 5 reservas. Pagos: pagos@nexo-aberturas.com.ar','Full Credit','cuenta_corriente','true'),
      ('Osde Organizacion De Servicios Directos Empresarios','OSDE','30546741253','responsable_inscripto','Evelyn Livoni','','','VERIFICAR EN EXTRANET','A Determinar','cuenta_corriente','true'),
      ('Papelera Er SA','PAPELERA ER','30504516365','responsable_inscripto','Araceli Arce','administracion@papentrerios.com.ar','+54 343 4331 444 Int 233','Enviar detalle de consumos firmados. CC: tesoreria@papentrerios.com.ar. Pagos: Jacqueline Dellepiane','Full Credit','cuenta_corriente','true'),
      ('Petropack SA','PETROPACK','30631926491','responsable_inscripto','Maria Rumiz','compras.facturas@petropack.com','','Reservas: recepcion@petropack.com. Pagos: asistente.administracion@petropack.com','A Determinar','cuenta_corriente','true'),
      ('Pisos y Revestimientos SA','PISOS Y REVESTIMIENTOS','30679216895','responsable_inscripto','','','','','','cuenta_corriente','true'),
      ('Poder Judicial De Er','PODER JUDICIAL','30681097763','responsable_inscripto','Julieta Gambito','institutojuanbalberdi@gmail.com','','Suelen ser ordenes de compra','A Determinar','cuenta_corriente','true'),
      ('Punto Turistico SA','PUNTO TURISTICO','30698479252','responsable_inscripto','Agustina Caro','administracion@pturistico.com.ar','','Reservas: arcorreservas@pturistico.com.ar','A Determinar','cuenta_corriente','true'),
      ('Qualia Compania De Seguros SA','QUALIA','30714496804','responsable_inscripto','Evelyn Russo','asistentedirectorio@qualiaseguros.com','','','Aloja y Cochera','cuenta_corriente','true'),
      ('Renacer','RENACER','30709542326','responsable_inscripto','Flavia Chiosso','','','','','cuenta_corriente','true'),
      ('Secar Security Argentina SA','SECAR','30678239549','responsable_inscripto','Araceli Gonzalez','araceligonzalez@securion.com.ar','+54 343 5269254','VERIFICAR EN EXTRANET (COBRANZAS.COM)','A Determinar','cuenta_corriente','true'),
      ('Seguros Bernardino Rivadavia Cooperativa Limitada','SEGUROS RIVADAVIA','30500050310','responsable_inscripto','Clarisa','cdonoso@segurosrivadavia.com','','','','cuenta_corriente','true'),
      ('Sermex SA','SERMEX','30708032812','responsable_inscripto','Fernanda Ortiz','sortiz@sermex.com.ar','','Fact: Sofia Ortiz. Puede reservar Mario Frazzini','Full Credit','cuenta_corriente','true'),
      ('Sindicato Unificado De Trabajadores De La Educacion De Bs As Suteba','SUTEBA','30630102282','responsable_inscripto','','cgonzalez@suteba.org.ar','','Reservas: ncosta@suteba.org.ar','Solo Aloja','cuenta_corriente','true'),
      ('Universidad Catolica Argentina Sede Parana','UCA','30709499668','responsable_inscripto','','nicolasbarcos@uca.edu.ar','','Tambien: jorge_medrano@uca.edu.ar','Aloja y Cochera','cuenta_corriente','true'),
      ('Uner','UNER','30562252157','responsable_inscripto','Diego Godoy','diego.godoy@uner.edu.ar','','','Aloja y Cochera','cuenta_corriente','true'),
      ('Unimaco SA','UNIMACO','30708992301','responsable_inscripto','Yanina Carrasco','ycarrasco@familiabercomat.com','370 4348745','','Full Credit','cuenta_corriente','true'),
      ('Venturance SA','VENTURANCE','30546783495','responsable_inscripto','Maria Eugenia Rusconi','erusconi@venturance.ar','','Fact: Damian Marotti - DMarotti@venturance.ar','A Determinar','cuenta_corriente','true')
    `);

    // Agencias (11)
    await db.execute(sql`
      INSERT INTO agencies (razon_social, nombre_fantasia, cuil_cuit, condicion_iva, contact_name, contact_email, contact_phone, notes, condicion_venta_predeterminada, is_active) VALUES
      ('Organizacion De Servicios Turisticos SRL','AMICHI','30612067267','responsable_inscripto','','prepagos@amichi.com.ar','','Ingresa por channel manager. Contacto reservas: Lucas Landini','cuenta_corriente','true'),
      ('Furlong Fox SA','FURLONG FOX','30707962743','responsable_inscripto','Paola','hoteles@furlong-fox.com.ar','','Fact: fproveedores@furlong-fox.com.ar. Pagos: pagoproveedores@furlong-fox.com.ar','cuenta_corriente','true'),
      ('GBT II Argentina SRL','GBT','30714466603','responsable_inscripto','','FacturasHoteles@amexgbt.com','','Reservas: arg@vsatravel.com.mx','cuenta_corriente','true'),
      ('Neptuno Viajes SRL','NEPTUNO','30663437166','responsable_inscripto','Carolina Leiva','carolina@neptuno.tur.ar','','Reservas: cecilia@neptuno.tur.ar. Pagos: Martin Vidal. Enviar a Carolina y copiar Martin Vidal','cuenta_corriente','true'),
      ('ITS Internacional Travel Services SA','PEZZATTI','30676757917','responsable_inscripto','Alejandra Cartasegna','administracionmdq2@pezzati.com','','Reservas: alejandracartasegna@pezzati.com. Pagos: Sabrina Demaria / Jacqueline Luna','cuenta_corriente','true'),
      ('Prosa Promotora Sol Argentino SA','PROSA VIAJES','30557578524','responsable_inscripto','mgabriela','mgabriela@prosaviajes.com.ar','','','cuenta_corriente','true'),
      ('CGB Viajes SRL','TRAVEL TIPS','30715151665','responsable_inscripto','Alberto Cardullo','empresas@traveltips.com.ar','','','cuenta_corriente','true'),
      ('Travel Services Argentina SA','TTS','30521151818','responsable_inscripto','','lreynoso@travelservices.com','','Pagos: Mariel Murrilo / Leonardo Reynoso','cuenta_corriente','true'),
      ('Despegarcomar SA','DESPEGAR','30701307115','responsable_inscripto','','','','','cuenta_corriente','true'),
      ('Grupo San Marcos SRL','KEEPERS TRAVEL','30714516546','responsable_inscripto','Jazmin Elias','je@keeperstravel.com','','Fact: rera@keeperstravel.com. Pagos: Reynaldo Alberto','cuenta_corriente','true'),
      ('Coovaeco Turismo Coop De Prestacion De Serv Tur Limitada','COOVAECO TUR','30596889014','responsable_inscripto','','operadores@coovaeco.com','','Reservas: rcardillo@coovaeco.com (Rosana Cardillo). Pagos: Noelia Cartvachi','cuenta_corriente','true')
    `);

    // Saldos iniciales (deudas de las empresas/agencias con el hotel)
    await db.execute(sql`
      INSERT INTO account_movements (id, entity_type, entity_id, date, type, description, amount, created_at)
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',696500.00,NOW() FROM companies WHERE cuil_cuit='30547794482'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',600000.00,NOW() FROM companies WHERE cuil_cuit='33621358419'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',693300.03,NOW() FROM companies WHERE cuil_cuit='30537317171'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',2748100.14,NOW() FROM companies WHERE cuil_cuit='30709176672'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',344500.02,NOW() FROM companies WHERE cuil_cuit='30500055509'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',5874000.02,NOW() FROM companies WHERE cuil_cuit='30501991070'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',106000.00,NOW() FROM companies WHERE cuil_cuit='30688955749'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',4201900.09,NOW() FROM companies WHERE cuil_cuit='30719274923'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',129500.00,NOW() FROM companies WHERE cuil_cuit='30546741253'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',2253500.17,NOW() FROM companies WHERE cuil_cuit='30504516365'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',2660500.05,NOW() FROM companies WHERE cuil_cuit='30631926491'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',141500.00,NOW() FROM companies WHERE cuil_cuit='30679216895'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',3031500.00,NOW() FROM companies WHERE cuil_cuit='30698479252'
      UNION ALL
      SELECT gen_random_uuid(),'company',id,CURRENT_DATE,'cargo','Saldo inicial',810500.05,NOW() FROM companies WHERE cuil_cuit='30708032812'
      UNION ALL
      SELECT gen_random_uuid(),'agency',id,CURRENT_DATE,'cargo','Saldo inicial',530500.01,NOW() FROM agencies WHERE cuil_cuit='30707962743'
      UNION ALL
      SELECT gen_random_uuid(),'agency',id,CURRENT_DATE,'cargo','Saldo inicial',151000.00,NOW() FROM agencies WHERE cuil_cuit='30714466603'
      UNION ALL
      SELECT gen_random_uuid(),'agency',id,CURRENT_DATE,'cargo','Saldo inicial',3439244.58,NOW() FROM agencies WHERE cuil_cuit='30701307115'
    `);

    logger.info("Seed completado: 59 empresas, 11 agencias, 17 saldos iniciales.");
  }

  // group_invoices: vincular facturas emitidas desde el Resumen del Grupo al folio
  await withTimeout("group_invoices.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE group_invoices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id varchar NOT NULL,
        sales_invoice_id integer UNIQUE,
        invoice_ref text NOT NULL,
        notes text,
        created_at timestamp DEFAULT now()
      )
    `)))
  );

  // Bug fix: deleteEventCharge never removed the matching folio_movements row,
  // so charges removed from an event (loaded by mistake, later changed) kept
  // summing into the event's folio total and PDF export. Fixed going forward
  // in routes/events.ts; this cleans up the 17 orphaned rows already found in
  // production whose source event_charges no longer exist, then recomputes
  // the affected folios' totals/balance to match.
  await withTimeout("folio_movements.cleanup_orphaned_event_charges", T, () =>
    db.execute(sql`
      DELETE FROM folio_movements
      WHERE id IN (
        'd2c993db-d900-4410-af7c-380638085943',
        'f487fbbd-d567-4dbc-9b51-0268bb17b8a1',
        'e41f8485-d1a9-42a1-97ea-14d8607d7183',
        'e122bcd5-84b6-4ec4-9a66-d0862cdfb46d',
        '137ff376-e6a2-4517-9db5-128b942f6d58',
        '47a622c8-3ecd-4b1e-beca-40d92870f101',
        '6bf98e2a-45ff-4988-ac3f-788f30887fad',
        '7349c515-075e-479b-97db-2442b51ae8e9',
        '36473937-893f-4e9a-b9ee-4a9192f7d371',
        '24d950b1-74fa-4c73-b1e9-a639efa6f107',
        '861a2222-32af-4b31-a307-2da1923777c3',
        '54db69ff-8da7-49db-b526-fc60e0eefc8b',
        '0a93aaf1-8697-4755-a5db-4bce64ed9a1d',
        'f1dfadd6-5729-4904-80c3-0c1fee82f5a1',
        '4454ebdd-c500-46a0-afad-680c6cef60a3',
        '1d4e5946-5bda-4cc6-a624-e73481be1aba',
        '02088777-9a5b-4c30-b7c8-9cdc89cd857d',
        '33dca043-b6ca-4ffa-8513-1ff8bbba65e7'
      )
      AND source_type = 'event_charge'
    `)
  );
  await withTimeout("folios.recalc_after_event_charge_cleanup", T, () =>
    db.execute(sql`
      UPDATE folios f SET
        total_charges = COALESCE((
          SELECT SUM(amount::numeric) FROM folio_movements
          WHERE folio_id = f.id AND type IN ('charge','transfer_in')
        ), 0),
        total_payments = COALESCE((
          SELECT SUM(amount::numeric) FROM folio_movements
          WHERE folio_id = f.id AND type IN ('payment','advance','discount','transfer_out','void')
        ), 0)
      WHERE f.entity_type = 'event'
        AND f.id IN (
          '68e3ec06-ef02-46e2-af74-06bd74bacaa1',
          '56e90f6f-3e9e-43d8-87f5-0a97f1c14605',
          '0815f03b-6237-4879-97ef-6660667fa0d0',
          'd93f4ecf-5bf3-4a7f-b808-859b00ba7127',
          '16100fc0-25d6-426b-9622-cbca17db1a22',
          '6f853c1d-c47e-4757-bd85-9d76b0252aa4',
          '73d6fb36-a1eb-4753-bc8e-620294cafd63',
          'a96b010d-3e09-474f-b6b9-812265551e69',
          'f03ff7f5-f7bb-4c66-bde2-abca3e21293c',
          '16a3b4c9-2ea6-4747-9167-db4249d0ec85'
        )
    `)
  );
  await withTimeout("folios.recalc_balance_after_event_charge_cleanup", T, () =>
    db.execute(sql`
      UPDATE folios SET balance = total_charges::numeric - total_payments::numeric
      WHERE entity_type = 'event'
        AND id IN (
          '68e3ec06-ef02-46e2-af74-06bd74bacaa1',
          '56e90f6f-3e9e-43d8-87f5-0a97f1c14605',
          '0815f03b-6237-4879-97ef-6660667fa0d0',
          'd93f4ecf-5bf3-4a7f-b808-859b00ba7127',
          '16100fc0-25d6-426b-9622-cbca17db1a22',
          '6f853c1d-c47e-4757-bd85-9d76b0252aa4',
          '73d6fb36-a1eb-4753-bc8e-620294cafd63',
          'a96b010d-3e09-474f-b6b9-812265551e69',
          'f03ff7f5-f7bb-4c66-bde2-abca3e21293c',
          '16a3b4c9-2ea6-4747-9167-db4249d0ec85'
        )
    `)
  );

  // Centro de costo / plan de cuentas: cuentas de gasto para Eventos
  await withTimeout("accounting_accounts.eventos seed", T, () =>
    db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo) VALUES
      ('4.2.1.08.40.01', 'Catering e Insumos Eventos', 'egreso'),
      ('4.2.1.08.40.02', 'Alquiler de Mobiliario y Equipamiento', 'egreso'),
      ('4.2.1.08.40.03', 'Decoración y Ambientación', 'egreso'),
      ('4.2.1.08.40.04', 'Servicios Tercerizados Eventos', 'egreso'),
      ('4.2.1.08.40.05', 'Otros Gastos Eventos', 'egreso')
      ON CONFLICT (codigo) DO NOTHING
    `)
  );

  await withTimeout("accounting_accounts.received_retentions seed", T, () =>
    db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo, activo) VALUES
      ('1.1.4.01.08.01', 'Ret. Ing Brutos', 'activo', true),
      ('1.1.4.01.04.01', 'Ret. IVA', 'activo', true),
      ('1.1.4.01.05', 'Ret Impuestos a las ganancias', 'activo', true),
      ('1.1.4.01.11', 'Retenciones Municipales', 'activo', true),
      ('1.1.4.01.10', 'Retenciones SUSS', 'activo', true)
      ON CONFLICT (codigo) DO UPDATE SET tipo = 'activo', activo = true
    `)
  );

  // These are the base accounts used by the accounting flows. Keep an
  // operator's existing account name on conflict while restoring the
  // canonical type and active state if an earlier partial seed created it.
  await withTimeout("accounting_accounts.canonical_base seed", T, () =>
    db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo, activo) VALUES
      ('1.1.1.01', 'Caja', 'activo', true),
      ('1.1.4.01.04.01', 'Ret. IVA', 'activo', true),
      ('1.1.4.01.05', 'Ret Impuestos a las ganancias', 'activo', true),
      ('1.1.4.01.08.01', 'Ret. Ing Brutos', 'activo', true),
      ('2.1.1.01', 'Proveedores a Pagar', 'pasivo', true),
      ('4.2.1.08.05.02', 'Gastos Comerciales', 'egreso', true)
      ON CONFLICT (codigo) DO UPDATE
      SET tipo = EXCLUDED.tipo,
          activo = true
    `)
  );

  // Unify inventory suppliers with the accounting supplier master. This one
  // must fail startup instead of being swallowed: application code requires
  // the junction table as soon as the process begins serving requests.
  await db.execute(sql.raw(serializeIncrementalDdl(`
    DO $migration$
    DECLARE
      unexpected_legacy_ids text;
      purchase_supplier_type text;
      purchase_orders_have_rows boolean;
      legacy_supplier record;
      matched_accounting_supplier_id integer;
      legacy_supplier_has_items boolean;
    BEGIN
      IF to_regclass('public.suppliers') IS NOT NULL THEN
        EXECUTE $query$
          SELECT string_agg(id::text, ', ' ORDER BY id::text)
          FROM suppliers
          WHERE id::text NOT IN ('sup1', 'sup2', 'sup3')
        $query$ INTO unexpected_legacy_ids;
        IF unexpected_legacy_ids IS NOT NULL THEN
          RAISE EXCEPTION
            'Migración detenida: suppliers contiene IDs no reconocidos: %',
            unexpected_legacy_ids;
        END IF;
      END IF;

      -- Antes de tirar inventory_items.supplier_id (y la tabla suppliers que
      -- le da sentido), preservar cada vínculo item->proveedor en la tabla
      -- puente nueva. Matchea por CUIT contra accounting_suppliers, que es
      -- único; si un proveedor legacy con artículos asignados no tiene CUIT
      -- o no coincide con ningún accounting_suppliers existente, se detiene
      -- la migración en vez de perder el vínculo o inventar un proveedor
      -- contable — mismo criterio que el chequeo de IDs no reconocidos de
      -- arriba.
      IF to_regclass('public.suppliers') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'supplier_id'
         ) THEN
        IF to_regclass('public.inventory_item_suppliers') IS NULL THEN
          EXECUTE $ddl$
            CREATE TABLE inventory_item_suppliers (
              item_id varchar NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
              accounting_supplier_id integer NOT NULL REFERENCES accounting_suppliers(id) ON DELETE RESTRICT,
              is_preferred boolean NOT NULL DEFAULT false,
              PRIMARY KEY (item_id, accounting_supplier_id)
            )
          $ddl$;
        END IF;

        FOR legacy_supplier IN EXECUTE $query$
          SELECT id::text AS id, name, cuit FROM suppliers
        $query$ LOOP
          matched_accounting_supplier_id := NULL;
          IF legacy_supplier.cuit IS NOT NULL AND btrim(regexp_replace(legacy_supplier.cuit, '\\D', '', 'g')) <> '' THEN
            -- suppliers.cuit guarda guiones ("30-71234567-8"); accounting_suppliers.cuit
            -- se guarda sin formato en todo el resto del código (ver server/billing/*.ts).
            -- Comparar solo dígitos evita un falso "no matchea" por formato. \\D (no \D):
            -- esto vive dentro de un template literal de JS, que se come una barra sola.
            EXECUTE 'SELECT id FROM accounting_suppliers WHERE regexp_replace(cuit, ''\\D'', '''', ''g'') = $1'
              INTO matched_accounting_supplier_id USING regexp_replace(legacy_supplier.cuit, '\\D', '', 'g');
          END IF;

          IF matched_accounting_supplier_id IS NULL THEN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM inventory_items WHERE supplier_id = $1)'
              INTO legacy_supplier_has_items USING legacy_supplier.id;
            IF legacy_supplier_has_items THEN
              RAISE EXCEPTION
                'Migración detenida: el proveedor legacy % (%) tiene artículos de inventario asignados pero no coincide por CUIT con ningún accounting_suppliers -- vinculá o creá ese proveedor en Contabilidad antes de reintentar',
                legacy_supplier.id, legacy_supplier.name;
            END IF;
            CONTINUE;
          END IF;

          EXECUTE $ins$
            INSERT INTO inventory_item_suppliers (item_id, accounting_supplier_id, is_preferred)
            SELECT id, $1, true FROM inventory_items WHERE supplier_id = $2
            ON CONFLICT (item_id, accounting_supplier_id) DO NOTHING
          $ins$ USING matched_accounting_supplier_id, legacy_supplier.id;
        END LOOP;
      END IF;

      IF to_regclass('public.purchase_orders') IS NOT NULL THEN
        SELECT data_type INTO purchase_supplier_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'purchase_orders'
          AND column_name = 'supplier_id';

        IF purchase_supplier_type IS NOT NULL
          AND purchase_supplier_type <> 'integer' THEN
          EXECUTE 'SELECT EXISTS (SELECT 1 FROM purchase_orders)'
            INTO purchase_orders_have_rows;
          IF purchase_orders_have_rows THEN
            RAISE EXCEPTION
              'Migración detenida: purchase_orders contiene órdenes con proveedor legacy';
          END IF;
          EXECUTE 'ALTER TABLE purchase_orders DROP COLUMN supplier_id';
          purchase_supplier_type := NULL;
        END IF;

        IF purchase_supplier_type IS NULL THEN
          EXECUTE 'ALTER TABLE purchase_orders ADD COLUMN supplier_id integer';
        END IF;
      END IF;

      -- Fase 2 (pendiente, NO hacer todavía): una vez que producción confirme
      -- que el backfill de más abajo migró los 12 vínculos reales a
      -- inventory_item_suppliers, retomar acá:
      --   EXECUTE 'ALTER TABLE inventory_items DROP COLUMN supplier_id';
      --   EXECUTE 'DROP TABLE suppliers';
      -- y sacar suppliers/inventoryItems.supplierId de shared/schema.ts
      -- para que el próximo diff de despliegue sí las proponga borrar.

      IF to_regclass('public.inventory_item_suppliers') IS NULL THEN
        EXECUTE $ddl$
          CREATE TABLE inventory_item_suppliers (
            item_id varchar NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
            accounting_supplier_id integer NOT NULL REFERENCES accounting_suppliers(id) ON DELETE RESTRICT,
            is_preferred boolean NOT NULL DEFAULT false,
            PRIMARY KEY (item_id, accounting_supplier_id)
          )
        $ddl$;
      END IF;

      IF to_regclass('public.inventory_item_suppliers_supplier_idx') IS NULL THEN
        EXECUTE $ddl$
          CREATE INDEX inventory_item_suppliers_supplier_idx
          ON inventory_item_suppliers (accounting_supplier_id)
        $ddl$;
      END IF;

      IF to_regclass('public.inventory_item_suppliers_preferred_idx') IS NULL THEN
        EXECUTE $ddl$
          CREATE UNIQUE INDEX inventory_item_suppliers_preferred_idx
          ON inventory_item_suppliers (item_id) WHERE is_preferred = true
        $ddl$;
      END IF;
    END
    $migration$;

    DO $migration$
    BEGIN
      IF to_regclass('public.purchase_orders') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'purchase_orders_supplier_id_accounting_suppliers_fk'
            AND conrelid = 'public.purchase_orders'::regclass
        ) THEN
        ALTER TABLE purchase_orders
          ADD CONSTRAINT purchase_orders_supplier_id_accounting_suppliers_fk
          FOREIGN KEY (supplier_id) REFERENCES accounting_suppliers(id);
      END IF;
    END
    $migration$;
  `)));

  // Factura T (turismo): el receptor puede identificarse con pasaporte en vez
  // de DNI/CUIT. Se persiste el tipo de documento para poder mandarle a ARCA
  // el DocTipo correcto (94 = Pasaporte) y para que un reintento/recuperación
  // de un comprobante pendiente lo recupere igual que cuit/dni.
  await withTimeout("sales_invoices.cliente_document_type", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE sales_invoices ADD COLUMN cliente_document_type text`)))
  );

  // "Turnos vendidos": puente entre una línea de comprobante que vendió un
  // tratamiento y el/los turnos que después la consumen — ver spaTreatmentSales
  // en shared/schema.ts.
  await withTimeout("spa_treatment_sales", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE spa_treatment_sales (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        sales_invoice_id integer NOT NULL,
        invoice_item_index integer NOT NULL,
        treatment_id varchar NOT NULL REFERENCES spa_treatments(id) ON DELETE RESTRICT,
        buyer_name text NOT NULL,
        quantity_purchased integer NOT NULL,
        quantity_scheduled integer NOT NULL DEFAULT 0,
        quantity_used integer NOT NULL DEFAULT 0,
        unit_price_frozen numeric(10,2) NOT NULL,
        status text NOT NULL DEFAULT 'pendiente',
        notes text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("spa_treatment_sales_invoice_item_unique", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "spa_treatment_sales_invoice_item_unique",
      "CREATE UNIQUE INDEX spa_treatment_sales_invoice_item_unique ON spa_treatment_sales (sales_invoice_id, invoice_item_index)",
    )))
  );

  // "Agregar Cargo" en el folio SPA distingue conceptos del hotel (cochera,
  // media pensión — sin stock) de productos que vende el SPA (cremas,
  // bebidas). Un producto queda vinculado a su artículo de inventario para
  // poder descontarle stock al venderse.
  await withTimeout("spa_account_items.inventory_item_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_account_items ADD COLUMN inventory_item_id varchar`)))
  );

  // Tarifa convenio (mayorista/minorista) de empresas y agencias — distinto
  // de regimen_hospedaje, que describe qué incluye la tarifa.
  await withTimeout("companies.tarifa_convenio", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE companies ADD COLUMN tarifa_convenio text`)))
  );
  await withTimeout("agencies.tarifa_convenio", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE agencies ADD COLUMN tarifa_convenio text`)))
  );

  // Vouchers de regalo: pasan de un solo campo de estado editado a mano a un
  // circuito con aplicaciones (evita doble uso) y auditoría estructurada.
  await withTimeout("gift_vouchers.lifecycle_fields", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE gift_vouchers
        ADD COLUMN sale_invoice_id integer REFERENCES sales_invoices(id),
        ADD COLUMN cancelled_at timestamp,
        ADD COLUMN cancelled_by text,
        ADD COLUMN cancel_reason text
    `)))
  );
  await withTimeout("gift_vouchers.status_usado_to_utilizado", T, () =>
    db.execute(sql`UPDATE gift_vouchers SET status = 'utilizado' WHERE status = 'usado'`)
  );

  await withTimeout("gift_voucher_applications.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE gift_voucher_applications (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_id varchar NOT NULL REFERENCES gift_vouchers(id),
        target_type text NOT NULL,
        target_id varchar NOT NULL,
        amount numeric(10,2) NOT NULL,
        status text NOT NULL DEFAULT 'reservado',
        created_by text,
        created_at timestamp NOT NULL DEFAULT now(),
        consumed_at timestamp,
        released_at timestamp,
        released_by text,
        release_reason text
      )
    `)))
  );
  // Como mucho una aplicación viva (reservado/utilizado) por voucher a la
  // vez — segunda barrera contra doble uso a nivel de base, además del
  // SELECT ... FOR UPDATE que hace la transacción de aplicación.
  await withTimeout("gift_voucher_applications_active_unique", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "gift_voucher_applications_active_unique",
      "CREATE UNIQUE INDEX gift_voucher_applications_active_unique ON gift_voucher_applications (voucher_id) WHERE status <> 'liberado'",
    )))
  );
  await withTimeout("gift_voucher_applications_target_idx", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "gift_voucher_applications_target_idx",
      "CREATE INDEX gift_voucher_applications_target_idx ON gift_voucher_applications (target_type, target_id)",
    )))
  );

  await withTimeout("gift_voucher_events.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE gift_voucher_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_id varchar NOT NULL REFERENCES gift_vouchers(id),
        event_type text NOT NULL,
        from_status text,
        to_status text,
        field_changed text,
        old_value text,
        new_value text,
        reason text,
        performed_by text,
        performed_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("gift_voucher_events_voucher_idx", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "gift_voucher_events_voucher_idx",
      "CREATE INDEX gift_voucher_events_voucher_idx ON gift_voucher_events (voucher_id)",
    )))
  );

  await withTimeout("reservations.voucher_link", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE reservations
        ADD COLUMN voucher_id varchar,
        ADD COLUMN voucher_applied_amount numeric(10,2)
    `)))
  );
  await withTimeout("spa_payments.voucher_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`ALTER TABLE spa_payments ADD COLUMN voucher_id varchar`)))
  );

  // "Turnos vendidos" nunca cerraba el círculo: no había forma de saber, al
  // completarse un turno, de qué venta anticipada venía — quantity_used
  // quedaba en 0 para siempre. Guarda el vínculo al reclamar la unidad.
  await withTimeout("spa_appointments.sold_treatment_sale_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE spa_appointments
        ADD COLUMN sold_treatment_sale_id varchar REFERENCES spa_treatment_sales(id)
    `)))
  );

  // getOrCreateFolio() had a check-then-insert race: two near-simultaneous
  // charges to the same entity could each miss the other's folio and create
  // a duplicate, splitting that entity's balance in two. Merges any existing
  // duplicates and guards the invariant going forward (see storage.ts fix).
  await withTimeout("folios.entity_unique", T, () =>
    db.execute(sql.raw(FOLIOS_ENTITY_UNIQUE_MIGRATION_SQL))
  );

  // "Voucher por prestación": un voucher regalo puede nacer vinculado a una
  // venta anticipada de tratamiento SPA en vez de ser un monto libre. Su
  // estado lo dicta esa venta (ver routes/spa.ts), no la acción manual de
  // "Marcar como utilizado".
  await withTimeout("gift_vouchers.linked_treatment_sale_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE gift_vouchers
        ADD COLUMN linked_treatment_sale_id varchar REFERENCES spa_treatment_sales(id)
    `)))
  );

  // One-time cutover from the fictitious company current-account ledger to
  // the externally reconciled balances dated 18/09/2026. The audit marker
  // makes reruns a no-op; any ambiguous company match aborts the transaction
  // before existing movements are removed.
  await importCompanyOpeningBalances20260918();
  await reallocateCurrentAccountOpeningBalances20260918();

  // Channex (channel manager) — fase 1: conexión (demo primero), mapeo de
  // catálogo Channex -> PMS y bandeja de reservas. Ninguna acción de esta
  // fase crea filas en `reservations` — ver comentario en schema.ts. (No es
  // estrictamente "solo lectura": el sync sí le confirma a Channex el ack
  // de cada booking_revision que persiste, lo cual es una escritura del
  // lado de Channex, aunque no toque nada de la operación real del PMS.)
  await withTimeout("channex_connections.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE channex_connections (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        label text NOT NULL,
        environment text NOT NULL DEFAULT 'demo',
        channex_property_id text NOT NULL,
        api_key text,
        api_key_encrypted text,
        base_url text NOT NULL DEFAULT 'https://staging.channex.io/api/v1',
        is_active boolean NOT NULL DEFAULT true,
        last_catalog_sync_at timestamp,
        last_booking_sync_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("channex_connections.encrypted_api_key", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE channex_connections
        ADD COLUMN api_key_encrypted text
    `)))
  );
  await withTimeout("channex_connections.legacy_api_key_nullable", T, () =>
    db.execute(sql.raw(`
      ALTER TABLE channex_connections
        ALTER COLUMN api_key DROP NOT NULL
    `))
  );

  // Backfill fail-closed: si hay claves históricas en texto plano, la
  // migración exige la clave maestra, cifra cada una y recién entonces borra
  // el valor legible. Una instalación sin conexiones Channex no necesita el
  // secreto hasta que cree la primera.
  const legacyChannexCredentials = await db
    .select({ id: channexConnections.id, apiKey: channexConnections.apiKey })
    .from(channexConnections)
    .where(isNotNull(channexConnections.apiKey));
  for (const connection of legacyChannexCredentials) {
    if (!connection.apiKey) continue;
    await db
      .update(channexConnections)
      .set({
        apiKeyEncrypted: encryptChannexApiKey(connection.apiKey),
        apiKey: null,
      })
      .where(eq(channexConnections.id, connection.id));
  }

  await withTimeout("channex_room_type_mappings.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE channex_room_type_mappings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
        channex_room_type_id text NOT NULL,
        channex_room_type_title text NOT NULL,
        room_type_id varchar REFERENCES room_types(id),
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("channex_room_type_mappings_connection_channex_id_idx", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "channex_room_type_mappings_connection_channex_id_idx",
      "CREATE UNIQUE INDEX channex_room_type_mappings_connection_channex_id_idx ON channex_room_type_mappings (connection_id, channex_room_type_id)",
    )))
  );

  await withTimeout("channex_rate_plan_mappings.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE channex_rate_plan_mappings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
        channex_rate_plan_id text NOT NULL,
        channex_rate_plan_title text NOT NULL,
        channex_room_type_id text NOT NULL,
        rate_plan_id varchar REFERENCES rate_plans(id),
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("channex_rate_plan_mappings_connection_channex_id_idx", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "channex_rate_plan_mappings_connection_channex_id_idx",
      "CREATE UNIQUE INDEX channex_rate_plan_mappings_connection_channex_id_idx ON channex_rate_plan_mappings (connection_id, channex_rate_plan_id)",
    )))
  );

  await withTimeout("channex_bookings.create", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE channex_bookings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
        channex_booking_id text NOT NULL,
        channex_revision_id text,
        status text NOT NULL DEFAULT 'new',
        ota_name text,
        guest_name text,
        guest_email text,
        guest_phone text,
        arrival_date date,
        departure_date date,
        adults integer,
        children integer,
        infants integer,
        currency text,
        total_amount numeric(10,2),
        commission_amount numeric(10,2),
        net_amount numeric(10,2),
        channex_room_type_id text,
        channex_rate_plan_id text,
        is_mapped boolean NOT NULL DEFAULT false,
        raw_payload jsonb,
        error_message text,
        imported_at timestamp,
        imported_by varchar,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("channex_bookings_connection_channex_id_idx", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "channex_bookings_connection_channex_id_idx",
      "CREATE UNIQUE INDEX channex_bookings_connection_channex_id_idx ON channex_bookings (connection_id, channex_booking_id)",
    )))
  );
  await withTimeout("channex_bookings_status_idx", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "channex_bookings_status_idx",
      "CREATE INDEX channex_bookings_status_idx ON channex_bookings (connection_id, status)",
    )))
  );

  // Confirmación selectiva de revisiones de Channex (#542): antes, "Sincronizar
  // y confirmar" volvía a pedirle a Channex todo lo pendiente en ese momento y
  // confirmaba el lote entero, así que una revisión nueva aparecida entre el
  // preview y la confirmación se confirmaba sin que nadie la hubiera visto.
  // Con esta columna, confirmar opera solo sobre lo ya persistido por un
  // preview previo.
  await withTimeout("channex_bookings.acknowledged_revision_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE channex_bookings
        ADD COLUMN acknowledged_revision_id text,
        ADD COLUMN acknowledged_at timestamp
    `)))
  );

  // ── SPA circuit resources: allow a plain treatment (e.g. a massage) as one
  // of a circuit's bundled resources, not only a gabinete ──────────────────
  // A circuit's resource row was cabin-only (Sauna/Hidromasaje). Reception
  // needs to bundle an actual treatment too — e.g. "masaje" alongside
  // "sauna" and "hidromasaje" inside the same circuito. Both resource
  // template rows and their booked instances become cabin-xor-treatment:
  // default_cabin_id/cabin_id turn nullable, and a new resource_treatment_id
  // column carries the treatment when that's what the resource is.
  await withTimeout("spa_treatment_resources.default_cabin_id_nullable", T, () =>
    db.execute(sql`ALTER TABLE spa_treatment_resources ALTER COLUMN default_cabin_id DROP NOT NULL`)
  );
  await withTimeout("spa_treatment_resources.resource_treatment_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE spa_treatment_resources
      ADD COLUMN resource_treatment_id varchar
    `)))
  );
  await withTimeout("spa_appointment_resources.cabin_id_nullable", T, () =>
    db.execute(sql`ALTER TABLE spa_appointment_resources ALTER COLUMN cabin_id DROP NOT NULL`)
  );
  await withTimeout("spa_appointment_resources.resource_treatment_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE spa_appointment_resources
      ADD COLUMN resource_treatment_id varchar
    `)))
  );
  await withTimeout("spa treatment resource kind foreign keys", T, async () => {
    await db.execute(sql.raw(SPA_TREATMENT_RESOURCE_KIND_FOREIGN_KEYS_MIGRATION_SQL));
  });

  // ── Caja fuerte: registro de apertura/reseteo de código ───────────────────
  // Reemplaza la planilla en papel que llevaba recepción (fecha, habitación,
  // quién abrió, quién solicitó) por un log simple en Housekeeping.
  await withTimeout("safe_box_openings (create)", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      CREATE TABLE safe_box_openings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id varchar NOT NULL,
        date date NOT NULL,
        opened_by text NOT NULL,
        requested_by text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `)))
  );
  await withTimeout("safe_box_openings foreign key", T, () =>
    db.execute(sql.raw(serializeIncrementalDdl(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'safe_box_openings_room_fk'
            AND conrelid = 'safe_box_openings'::regclass
        ) THEN
          ALTER TABLE safe_box_openings
          ADD CONSTRAINT safe_box_openings_room_fk
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT;
        END IF;
      END
      $$
    `)))
  );
  await withTimeout("safe_box_openings index", T, () =>
    db.execute(sql.raw(createIndexWithoutRerunNotice(
      "idx_safe_box_openings_room_date",
      "CREATE INDEX idx_safe_box_openings_room_date ON safe_box_openings (room_id, date DESC)",
    )))
  );

  // ── Cuentas corrientes: área de origen del cargo ──────────────────────────
  // Deja filtrar la deuda de una empresa/agencia por el área que la generó
  // (Recepción, Restaurant, Eventos, Grupos). Solo hacia adelante: los
  // movimientos existentes quedan en null ("Sin clasificar"), no se infiere
  // retroactivamente.
  await withTimeout("account_movements.area", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE account_movements
      ADD COLUMN area text
    `)))
  );
  await withTimeout("account_movements.payment_id", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE account_movements
      ADD COLUMN payment_id varchar
    `)))
  );

  // generateFolioCodigo() used to derive the numeric suffix from COUNT(*) —
  // two concurrent first-charges to the same (brand-new) entity could both
  // count the same prior total and build the identical codigo, tripping
  // folios_codigo_unique before the entity-level ON CONFLICT guard ever got
  // a chance to run (see folio-entity-unique.pg.test.ts). One sequence per
  // entity type makes the number atomic; the setval below is safe to rerun
  // every boot since GREATEST only ever advances it, seeded past both the
  // sequence's own progress and any legacy count-based codigo already on disk.
  await withTimeout("folios.codigo_sequences", T, async () => {
    for (const entityType of FOLIO_ENTITY_TYPES) {
      const seqName = `folio_seq_${entityType}`;
      await db.execute(sql.raw(createSequenceWithoutRerunNotice(seqName)));
      await db.execute(sql`
        SELECT setval(
          ${seqName},
          GREATEST(
            COALESCE((SELECT last_value FROM pg_sequences WHERE sequencename = ${seqName}), 0) + 1,
            (SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo, '\\D', '', 'g'), '')::integer), 0)
             FROM folios WHERE entity_type = ${entityType}) + 1
          ),
          false
        )
      `);
    }
  });

  // ── Plan de cuentas: cuentas de ingreso por área ──────────────────────────
  // accounting_accounts ya se usaba del lado de costos (cuenta_contable_id en
  // purchase_invoices); esto le da un lado de ingresos, para que los informes
  // de ventas por área agrupen por cuenta real en vez de por un array
  // hardcodeado — mismo criterio que "Costos por Departamento" ya usa del lado
  // de gastos. area conecta cada cuenta con la misma clasificación que ya usa
  // Cuentas Corrientes (account_movements.area).
  await withTimeout("accounting_accounts.area", T, () =>
    db.execute(sql.raw(incrementalDdlWithoutRerunNotice(`
      ALTER TABLE accounting_accounts ADD COLUMN area text
    `)))
  );
  await withTimeout("accounting_accounts.seed_ingresos", T, () =>
    db.execute(sql`
      INSERT INTO accounting_accounts (codigo, nombre, tipo, nivel, activo, area) VALUES
        ('4.1.1.06.01', 'Ventas Alojamiento', 'ingreso', 4, true, 'recepcion'),
        ('4.1.1.06.02', 'Ventas Restaurant', 'ingreso', 4, true, 'restaurant'),
        ('4.1.1.06.03', 'Ventas Spa', 'ingreso', 4, true, 'spa'),
        ('4.1.1.06.04', 'Ventas Eventos', 'ingreso', 4, true, 'eventos'),
        ('4.1.1.06.05', 'Otros Ingresos', 'ingreso', 4, true, 'otros')
      ON CONFLICT (codigo) DO NOTHING
    `)
  );

  // Reconcile only invoice-backed reservation CC cargos. The invoice receptor
  // is the historical ownership evidence; current reservation links alone are
  // not trusted because they may have changed after payment creation.
  await withTimeout("reservation_cc_invoice_ledger_reconcile", T, () =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('reservation-cc-invoice-ledger-reconcile'))`);
      await tx.execute(sql`
        UPDATE payments p
        SET agency_id = a.id
        FROM sales_invoices si
        JOIN agencies a
          ON regexp_replace(COALESCE(a.cuil_cuit, ''), '\D', '', 'g')
           = regexp_replace(COALESCE(si.cliente_cuit, ''), '\D', '', 'g')
        WHERE si.payment_id = p.id
          AND p.billing_target = 'agency'
          AND p.agency_id IS NULL
          AND si.estado IN ('emitida', 'parcial')
          AND regexp_replace(COALESCE(si.cliente_cuit, ''), '\D', '', 'g') <> ''
          AND NOT EXISTS (
            SELECT 1 FROM agencies other
            WHERE other.id <> a.id
              AND regexp_replace(COALESCE(other.cuil_cuit, ''), '\D', '', 'g')
                = regexp_replace(COALESCE(si.cliente_cuit, ''), '\D', '', 'g')
          )
      `);
      await tx.execute(sql`
        UPDATE payments p
        SET company_id = c.id
        FROM sales_invoices si
        JOIN companies c
          ON regexp_replace(COALESCE(c.cuil_cuit, ''), '\D', '', 'g')
           = regexp_replace(COALESCE(si.cliente_cuit, ''), '\D', '', 'g')
        WHERE si.payment_id = p.id
          AND p.billing_target = 'company'
          AND p.company_id IS NULL
          AND si.estado IN ('emitida', 'parcial')
          AND regexp_replace(COALESCE(si.cliente_cuit, ''), '\D', '', 'g') <> ''
          AND NOT EXISTS (
            SELECT 1 FROM companies other
            WHERE other.id <> c.id
              AND regexp_replace(COALESCE(other.cuil_cuit, ''), '\D', '', 'g')
                = regexp_replace(COALESCE(si.cliente_cuit, ''), '\D', '', 'g')
          )
      `);
      await tx.execute(sql`
        WITH candidates AS (
          SELECT
            p.id AS payment_id,
            am.id AS movement_id,
            count(*) OVER (PARTITION BY p.id) AS movements_for_payment,
            count(*) OVER (PARTITION BY am.id) AS payments_for_movement
          FROM payments p
          JOIN reservations r ON r.id = p.reservation_id
          JOIN account_movements am
            ON am.reservation_id = p.reservation_id
           AND am.entity_type = COALESCE(p.billing_target, 'guest')
           AND am.entity_id = CASE
                 WHEN p.billing_target = 'company' THEN p.company_id
                 WHEN p.billing_target = 'agency' THEN p.agency_id
                 ELSE r.guest_id
               END
           AND am.type = 'cargo'
           AND am.amount::numeric = p.amount::numeric
           AND am.payment_id IS NULL
          WHERE p.method IN ('cuenta_corriente', 'current_account')
            AND (p.status IS NULL OR p.status = 'active')
        ),
        unique_invoiced_candidates AS (
          SELECT candidates.payment_id, candidates.movement_id
          FROM candidates
          JOIN sales_invoices si
            ON si.payment_id = candidates.payment_id
           AND si.estado IN ('emitida', 'parcial')
          WHERE candidates.movements_for_payment = 1
            AND candidates.payments_for_movement = 1
        )
        UPDATE account_movements am
        SET payment_id = unique_invoiced_candidates.payment_id
        FROM unique_invoiced_candidates
        WHERE am.id = unique_invoiced_candidates.movement_id
      `);
      await tx.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS account_movements_cc_payment_unique
        ON account_movements (payment_id)
        WHERE payment_id IS NOT NULL AND type = 'cargo'
      `);
      await tx.execute(sql`
        INSERT INTO account_movements (
          id, entity_type, entity_id, date, type, description, amount,
          reservation_id, reservation_code, guest_name, reference,
          payment_method, payment_id, area
        )
        SELECT
          gen_random_uuid()::text,
          COALESCE(p.billing_target, 'guest'),
          CASE
            WHEN p.billing_target = 'company' THEN p.company_id
            WHEN p.billing_target = 'agency' THEN p.agency_id
            ELSE r.guest_id
          END,
          p.date,
          'cargo',
          'Estadía ' || r.reservation_code || ' — Hab. ' || COALESCE(ro.room_number, r.room_id, 'N/A'),
          p.amount,
          p.reservation_id,
          r.reservation_code,
          NULLIF(CONCAT_WS(' ', g.first_name, g.last_name), ''),
          p.invoice_ref,
          'current_account',
          p.id,
          'recepcion'
        FROM payments p
        JOIN reservations r ON r.id = p.reservation_id
        JOIN sales_invoices si ON si.payment_id = p.id AND si.estado IN ('emitida', 'parcial')
        LEFT JOIN rooms ro ON ro.id = r.room_id
        LEFT JOIN guests g ON g.id = r.guest_id
        WHERE p.method IN ('cuenta_corriente', 'current_account')
          AND (p.status IS NULL OR p.status = 'active')
          AND p.billing_target IN ('company', 'agency')
          AND CASE
                WHEN p.billing_target = 'company' THEN p.company_id
                WHEN p.billing_target = 'agency' THEN p.agency_id
                ELSE r.guest_id
              END IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM account_movements existing
            WHERE existing.reservation_id = p.reservation_id
              AND existing.entity_type = COALESCE(p.billing_target, 'guest')
              AND existing.entity_id = CASE
                    WHEN p.billing_target = 'company' THEN p.company_id
                    WHEN p.billing_target = 'agency' THEN p.agency_id
                    ELSE r.guest_id
                  END
              AND existing.type = 'cargo'
              AND existing.amount::numeric = p.amount::numeric
              AND existing.payment_id IS NULL
          )
        ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL AND type = 'cargo'
        DO NOTHING
      `);
      await tx.execute(sql`
        UPDATE account_movements am
        SET area = 'recepcion',
            reference = COALESCE(am.reference, p.invoice_ref)
        FROM payments p
        JOIN sales_invoices si ON si.payment_id = p.id AND si.estado IN ('emitida', 'parcial')
        WHERE am.payment_id = p.id
      `);
    })
  );

  // Production incident 2026-09-22: the retired checkout-debt reconciliation
  // action created 661 synthetic cargos in one execution. Remove only rows
  // bearing that action's unique description and creation window. No payments,
  // invoices, allocations, or legitimate CC movements are touched.
  await withTimeout("rollback_checkout_debt_reconcile_2026_09_22", T, () =>
    db.execute(sql`
      DELETE FROM account_movements
      WHERE created_at >= timestamp '2026-09-22 12:59:00'
        AND created_at <  timestamp '2026-09-22 13:00:00'
        AND date = '2026-09-22'
        AND type = 'cargo'
        AND area = 'recepcion'
        AND description LIKE 'Saldo por estadía % (cierre con deuda)'
        AND group_payment_id IS NULL
    `)
  );

  // The production database may materialize created_at in its session timezone,
  // so the UTC incident window above can miss guest rows. Client CC was zero
  // before this action: remove only guest cargos with the retired action's
  // unique signature and business date, leaving companies and agencies intact.
  await withTimeout("rollback_guest_checkout_debt_reconcile_2026_09_22", T, () =>
    db.execute(sql`
      DELETE FROM account_movements
      WHERE date = '2026-09-22'
        AND entity_type = 'guest'
        AND type = 'cargo'
        AND area = 'recepcion'
        AND description LIKE 'Saldo por estadía % (cierre con deuda)'
        AND group_payment_id IS NULL
    `)
  );

  // The fiscal-identity backfill deployed during the same incident also
  // materialized historical guest CC payments as new "Estadía" cargos.
  // Guest CC was zero before the deployment. Remove only that new canonical
  // shape; live movements created by normal operations are unaffected.
  await withTimeout("rollback_guest_fiscal_backfill_2026_09_22", T, () =>
    db.execute(sql`
      DELETE FROM account_movements
      WHERE entity_type = 'guest'
        AND type = 'cargo'
        AND payment_id IS NOT NULL
        AND created_at::date = '2026-09-22'
        AND description LIKE 'Estadía %'
    `)
  );

  // Final incident sweep for the retired button. The description is exclusive
  // to that action, so this safely catches company/agency rows that a database
  // session timezone may have placed outside the original UTC minute window.
  const companyAgencyIncidentRollback = await withTimeout(
    "rollback_company_agency_checkout_debt_reconcile_2026_09_22",
    T,
    () => db.execute(sql`
      WITH deleted AS (
        DELETE FROM account_movements
        WHERE date = '2026-09-22'
          AND entity_type IN ('company', 'agency')
          AND type = 'cargo'
          AND area = 'recepcion'
          AND description LIKE 'Saldo por estadía % (cierre con deuda)'
          AND group_payment_id IS NULL
        RETURNING entity_type, amount
      )
      SELECT
        entity_type,
        count(*)::int AS deleted_count,
        COALESCE(sum(amount::numeric), 0)::text AS deleted_total
      FROM deleted
      GROUP BY entity_type
      ORDER BY entity_type
    `),
  );
  logger.info(
    `[checkout-debt-incident] Empresas/agencias eliminadas: ${JSON.stringify(companyAgencyIncidentRollback?.rows ?? [])}`,
  );
  const companyAgencyIncidentPostcheck = await withTimeout(
    "postcheck_company_agency_checkout_debt_reconcile_2026_09_22",
    T,
    () => db.execute(sql`
      SELECT
        entity_type,
        count(*)::int AS remaining_count,
        COALESCE(sum(amount::numeric), 0)::text AS remaining_total
      FROM account_movements
      WHERE date = '2026-09-22'
        AND entity_type IN ('company', 'agency')
        AND type = 'cargo'
        AND area = 'recepcion'
        AND description LIKE 'Saldo por estadía % (cierre con deuda)'
        AND group_payment_id IS NULL
      GROUP BY entity_type
      ORDER BY entity_type
    `),
  );
  logger.info(
    `[checkout-debt-incident] Empresas/agencias remanentes: ${JSON.stringify(companyAgencyIncidentPostcheck?.rows ?? [])}`,
  );

  const financialSchema = await verifyFinancialSchema();
  if (!financialSchema.ready) {
    throw Object.assign(new Error(financialSchemaErrorMessage(financialSchema)), {
      code: "FINANCIAL_SCHEMA_NOT_READY",
    });
  }

  logger.info("Migraciones incrementales completadas.");
}
