import { spawn } from "node:child_process";
import { createDisposableXeniaPostgres } from "./xenia-control-postgres.mjs";

const fixture = createDisposableXeniaPostgres();
const env = { ...process.env, ...fixture.env };
const run = (file) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", file], {
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("No se pudo preparar la demostración.")),
    );
  });
try {
  await run("server/xenia-control/setup.ts");
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "server/xenia-control/index.ts"],
    { env, stdio: "inherit" },
  );
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    server.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  server.once("exit", (code) => {
    fixture.close();
    process.exitCode = code ?? 0;
  });
  server.once("error", (error) => {
    console.error(error.message);
    fixture.close();
    process.exitCode = 1;
  });
} catch (error) {
  fixture.close();
  console.error(error.message);
  process.exitCode = 1;
}
