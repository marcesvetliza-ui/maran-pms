import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

function binaries() {
  const candidates = [process.env.XENIA_PG_BIN];
  try {
    candidates.push(
      execFileSync("pg_config", ["--bindir"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {}
  for (const version of [18, 17, 16, 15, 14])
    candidates.push(`/usr/lib/postgresql/${version}/bin`);
  const directory = candidates.find(
    (value) =>
      value &&
      existsSync(path.join(value, "initdb")) &&
      existsSync(path.join(value, "pg_ctl")),
  );
  if (!directory)
    throw new Error(
      "Instalá PostgreSQL local o indicá su carpeta de binarios con XENIA_PG_BIN. No se usa DATABASE_URL.",
    );
  return directory;
}

/** Owns a newly-created Unix-socket-only cluster. No supplied database URL is read or used. */
export function createDisposableXeniaPostgres() {
  const bin = binaries(),
    base = mkdtempSync(path.join(tmpdir(), "xenia-multihotel-"));
  const data = path.join(base, "data"),
    socket = path.join(base, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const run = (command, args) =>
    execFileSync(path.join(bin, command), args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  let started = false;
  const close = () => {
    if (started) {
      try {
        run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
      } finally {
        started = false;
      }
    }
    rmSync(base, { recursive: true, force: true });
  };
  try {
    run("initdb", [
      "-D",
      data,
      "--auth-local=trust",
      "--auth-host=reject",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      path.join(base, "postgres.log"),
      "-o",
      `-k ${socket} -p 55487 -c listen_addresses='' -c unix_socket_permissions=0700`,
      "-w",
      "start",
    ]);
    started = true;
    for (const database of [
      "xenia_control",
      "xenia_hotel_a",
      "xenia_hotel_b",
      "xenia_hotel_c",
    ])
      run("createdb", [
        "-h",
        socket,
        "-p",
        "55487",
        "-U",
        userInfo().username,
        database,
      ]);
    const url = (database) =>
      `postgresql://${encodeURIComponent(userInfo().username)}@localhost/${database}?host=${encodeURIComponent(socket)}&port=55487`;
    const env = {
      XENIA_CONTROL_DATABASE_URL: url("xenia_control"),
      XENIA_PROPERTY_DATABASES: JSON.stringify({
        aurora: url("xenia_hotel_a"),
        brisa: url("xenia_hotel_b"),
        extra: url("xenia_hotel_c"),
      }),
      XENIA_CONTROL_SESSION_SECRET: randomBytes(40).toString("hex"),
      XENIA_CONTROL_ORIGIN: "http://127.0.0.1:4186",
      XENIA_CONTROL_PORT: "4186",
      XENIA_CONTROL_DEMO: "true",
      NODE_ENV: "development",
    };
    return { env, close, base };
  } catch (error) {
    try {
      close();
    } catch {}
    throw error;
  }
}
