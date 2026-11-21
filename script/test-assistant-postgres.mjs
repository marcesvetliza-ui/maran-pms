/** Owned synthetic PostgreSQL only. No supplied connection URL is read or used. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const candidates = [process.env.ASSISTANT_TEST_PG_BIN];
try {
  candidates.push(execFileSync("pg_config", ["--bindir"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim());
} catch {}
for (const version of [18, 17, 16, 15, 14]) candidates.push(`/usr/lib/postgresql/${version}/bin`);
const bin = candidates.find(value => value && ["initdb", "pg_ctl", "createdb"].every(name => existsSync(path.join(value, name))));
if (!bin) throw Error("Instalá PostgreSQL local o indicá sus binarios con ASSISTANT_TEST_PG_BIN. No se usa DATABASE_URL.");
const base = mkdtempSync(path.join(tmpdir(), "assistant-pilot-test-"));
const data = path.join(base, "data"), socket = path.join(base, "socket");
mkdirSync(socket, { mode: 0o700 });
const run = (command, args) => execFileSync(path.join(bin, command), args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
});
let started = false;
try {
  run("initdb", ["-D", data, "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", data, "-l", path.join(base, "postgres.log"), "-o",
    `-k ${socket} -p 55487 -c listen_addresses='' -c unix_socket_permissions=0700`, "-w", "start"]);
  started = true;
  run("createdb", ["-h", socket, "-p", "55487", "-U", userInfo().username, "assistant_pilot_test"]);
  const testEnv = { ...process.env };
  for (const key of Object.keys(testEnv)) {
    if (/^(OPENAI_|AI_INTEGRATIONS_|AFIP_|ARCA_|CHANNEX_|RESEND_|STRIPE_|SUPPORT_|XENIA_)/.test(key) || /RAILWAY.*TOKEN/.test(key)) delete testEnv[key];
  }
  Object.assign(testEnv, {
    NODE_ENV: "test", ASSISTANT_DATABASE_URL: "", SUPPORT_CODEX_PAID_ENABLED: "false",
    ALLOW_DESTRUCTIVE_PG_TESTS: "true", // Only the cluster created above is supplied.
    DATABASE_URL: `postgresql://${encodeURIComponent(userInfo().username)}@localhost/assistant_pilot_test?host=${encodeURIComponent(socket)}&port=55487`,
  });
  console.log("PostgreSQL sintético propio, sólo socket Unix; proveedores y correo simulados.");
  execFileSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.server.pg.config.ts",
    "server/tests/support-conversational.pg.test.ts",
    "server/tests/support-proposal-chat.pg.test.ts",
    "server/tests/support-approval-foundation.pg.test.ts",
    "server/tests/programming-assistant-service.pg.test.ts",
    "server/tests/programming-assistant-clarification.pg.test.ts",
    "server/tests/support-codex-configuration.pg.test.ts",
  ], { cwd: root, env: testEnv, stdio: "inherit", timeout: 180000 });
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(base, { recursive: true, force: true });
}
