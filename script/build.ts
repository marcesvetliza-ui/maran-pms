import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, readdir, stat, writeFile, mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import { execSync } from "child_process";
import path from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const info = await stat(srcPath);
    if (info.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      const data = await import("fs/promises").then(m => m.readFile(srcPath));
      await writeFile(destPath, data);
    }
  }
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("copying server assets...");
  await copyDir("server/assets", "dist/server/assets");

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

async function generateSourceZip() {
  console.log("generating source code zip...");
  try {
    execSync(`zip -r dist/public/maran-suite-system.zip client/src/ server/*.ts shared/ package.json tsconfig.json tailwind.config.ts vite.config.ts drizzle.config.ts replit.md -x "*/node_modules/*" "*/.git/*" "*/.cache/*" "*/dist/*"`, { timeout: 30000 });
    console.log("source zip created at dist/public/maran-suite-system.zip");
  } catch (err) {
    console.warn("Could not generate source zip:", err);
  }
}

buildAll().then(() => generateSourceZip()).catch((err) => {
  console.error(err);
  process.exit(1);
});
