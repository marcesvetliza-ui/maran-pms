import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
const out = "dist/xenia-control";
await mkdir(out, { recursive: true });
await build({
  entryPoints: {
    index: "server/xenia-control/index.ts",
    setup: "server/xenia-control/setup.ts",
  },
  outdir: out,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
await cp("server/xenia-control/public", out + "/public", { recursive: true });
console.log("Panel de Xenia compilado en " + out);
