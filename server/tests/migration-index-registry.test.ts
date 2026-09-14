import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// server/migrate.ts importa server/db.ts a nivel de módulo, que exige
// DATABASE_URL con solo evaluarlo (falla al importar, no solo al
// consultar). El pool de pg es perezoso — no intenta conectar hasta la
// primera query real — así que un valor de relleno alcanza para poder
// importar el registro y probarlo sin nada de eso: estas pruebas nunca
// ejecutan una query. El import dinámico (en vez de un `import` estático,
// que se evalúa antes que cualquier otra línea del archivo) deja que la
// línea de abajo corra primero.
process.env.DATABASE_URL ??= "postgres://stub-unused@127.0.0.1:1/migration-index-registry-tests";
const {
  INCREMENTAL_NON_INDEX_DDL,
  INCREMENTAL_INDEX_DEFINITIONS,
} = await import("../migrate");

// Validaciones puramente estructurales sobre el registro de migraciones
// incrementales de server/migrate.ts: nombres duplicados, createSql/
// indexName desalineados, y DDL que quedó en la forma nativa ruidosa
// (CREATE ... IF NOT EXISTS / DROP ... IF EXISTS) en vez de la guarda por
// catálogo. No requieren un servidor PostgreSQL real — viven separadas de
// migration-rerun-notices.pg.test.ts (que sí lo necesita, para probar que
// las guardas realmente silencian los avisos contra una base real) para
// que estos errores de copia y pega se detecten también en entornos sin
// una base de pruebas levantada.
const migrateSource = readFileSync(new URL("../migrate.ts", import.meta.url), "utf8");
const productionMigrationSource = migrateSource.replace(
  /^\s*fixtureSql:\s*"[^"]*",\s*$/gm,
  "",
);

function declaredIndexName(createSql: string): string | null {
  return createSql.match(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+([^\s]+)\s+ON\b/i,
  )?.[1] ?? null;
}

describe("incremental migration registry", () => {
  it("uses a unique indexName for every incremental index definition", () => {
    const indexNames = Object.values(INCREMENTAL_INDEX_DEFINITIONS).map(
      ({ indexName }) => indexName,
    );
    const duplicateIndexNames = indexNames.filter(
      (indexName, position) => indexNames.indexOf(indexName) !== position,
    );

    expect(
      duplicateIndexNames,
      `INCREMENTAL_INDEX_DEFINITIONS has duplicate indexName values: ${duplicateIndexNames.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps each indexName aligned with the name declared in createSql", () => {
    const mismatches = Object.entries(INCREMENTAL_INDEX_DEFINITIONS).flatMap(
      ([definitionName, { indexName, createSql }]) => {
        const declaredName = declaredIndexName(createSql);
        return declaredName === indexName
          ? []
          : [`${definitionName}: indexName="${indexName}", createSql declares "${declaredName ?? "<missing>"}"`];
      },
    );

    expect(
      mismatches,
      `INCREMENTAL_INDEX_DEFINITIONS has createSql/indexName mismatches:\n${mismatches.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps every incremental index on the silent catalog-guard path", () => {
    expect(migrateSource).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i);
  });

  it("keeps the inventoried non-index DDL on catalog-guard paths", () => {
    expect(INCREMENTAL_NON_INDEX_DDL.chargeTypesTable).toContain("to_regclass");
    expect(INCREMENTAL_NON_INDEX_DDL.cashShiftsTurnoTipoColumn).toContain("pg_attribute");
    expect(INCREMENTAL_NON_INDEX_DDL.groupPaymentsReceiptNumberSequence).toContain("to_regclass");
  });

  it("does not leave notice-producing non-index DDL in production migrations", () => {
    expect(productionMigrationSource).not.toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS|CREATE\s+SEQUENCE\s+IF\s+NOT\s+EXISTS/i,
    );
  });
});
