import { execFileSync } from "node:child_process";
import { mkdir, writeFile, rm, copyFile } from "node:fs/promises";
import { build } from "esbuild";
import { exportXeniaPmsSchema } from "./xenia-pms-schema.mjs";

if (!process.argv.includes("--schema-only")) {
  execFileSync(process.execPath, ["--import", "tsx", "script/build.ts"], {
    stdio: "inherit",
    env: { ...process.env, VITE_XENIA_PMS_QA: "true", VITE_SENTRY_DSN: "" },
  });
  await rm("dist/public/maran-suite-system.zip", { force: true });
  await rm("dist/server/assets", { recursive: true, force: true });
  await mkdir("dist/server/assets", { recursive: true });
  await copyFile(
    "server/xenia-control/public/branding/xenia-horizontal.png",
    "dist/server/assets/hotel-logo.png",
  );
  await copyFile(
    "server/xenia-control/public/branding/xenia-icon.png",
    "dist/public/favicon.png",
  );
}
await mkdir("dist/xenia-pms", { recursive: true });
const schema = exportXeniaPmsSchema();
await writeFile("dist/xenia-pms/schema.sql", schema);
await build({
  entryPoints: ["server/xenia-pms/setup.ts"],
  outfile: "dist/xenia-pms/setup.js",
  platform: "node",
  format: "esm",
  bundle: true,
  packages: "external",
  sourcemap: true,
});
console.log("Esquema y preparación del PMS de pruebas compilados.");
