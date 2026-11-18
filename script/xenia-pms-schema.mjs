import { execFileSync } from "node:child_process";

/** Export the current PMS model without connecting to any database. */
export function exportXeniaPmsSchema() {
  const model = execFileSync(
    process.execPath,
    [
      "node_modules/drizzle-kit/bin.cjs",
      "export",
      "--dialect=postgresql",
      "--schema=./shared/schema.ts",
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  if (
    !model.startsWith("CREATE ") ||
    !model.includes('CREATE TABLE "reservations"')
  )
    throw new Error("No se pudo exportar el esquema del PMS.");
  // This existing default uses a sequence maintained by legacy migrations,
  // rather than exported as a pgSequence. QA never runs those migrations.
  return "CREATE SEQUENCE group_payments_receipt_number_seq;\n" + model;
}
