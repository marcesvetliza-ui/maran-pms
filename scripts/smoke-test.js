#!/usr/bin/env node
/**
 * Maran PMS — Smoke Test
 * Uso: node scripts/smoke-test.js [URL]
 * Ejemplo: node scripts/smoke-test.js https://maranpms.com.ar
 * Sin argumentos, usa http://localhost:5000
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";
const ADMIN_USER = process.argv[3] || "admin";
const ADMIN_PASS = process.argv[4] || "maran2026";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

let passed = 0;
let failed = 0;
let cookie = "";

function ok(name) {
  console.log(`  ${GREEN}✓${RESET} ${name}`);
  passed++;
}

function fail(name, reason) {
  console.log(`  ${RED}✗${RESET} ${name}`);
  if (reason) console.log(`    ${YELLOW}→ ${reason}${RESET}`);
  failed++;
}

async function request(method, path, body, useCookie = true) {
  const headers = { "Content-Type": "application/json" };
  if (useCookie && cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch {}
  return { status: res.status, json, headers: res.headers };
}

async function runTests() {
  console.log(`\n${BOLD}Maran PMS — Smoke Test${RESET}`);
  console.log(`${YELLOW}Entorno: ${BASE_URL}${RESET}\n`);

  // ── 1. Health check ──────────────────────────────────────────────────────
  console.log(`${BOLD}1. Health check${RESET}`);
  try {
    const r = await request("GET", "/api/health", null, false);
    if (r.status === 200 && r.json?.status === "ok") ok("App responde OK");
    else fail("App responde OK", `HTTP ${r.status} — status: ${r.json?.status}`);
    if (r.json?.database === "ok") ok("Base de datos conectada");
    else fail("Base de datos conectada", `database: ${r.json?.database}`);
  } catch (e) {
    fail("App responde OK", e.message);
    fail("Base de datos conectada", "no se pudo conectar");
  }

  // ── 2. Login ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}2. Autenticación${RESET}`);
  try {
    const r = await request("POST", "/api/auth/login", { username: ADMIN_USER, password: ADMIN_PASS }, false);
    if (r.status === 200 && r.json?.id) {
      ok(`Login como ${ADMIN_USER}`);
      const setCookie = r.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
    } else {
      fail(`Login como ${ADMIN_USER}`, `HTTP ${r.status} — ${r.json?.message}`);
    }
  } catch (e) {
    fail(`Login como ${ADMIN_USER}`, e.message);
  }

  // ── 3. Dashboard ─────────────────────────────────────────────────────────
  console.log(`\n${BOLD}3. Dashboard${RESET}`);
  try {
    const r = await request("GET", "/api/dashboard/stats");
    if (r.status === 200 && r.json) ok("Stats del dashboard");
    else fail("Stats del dashboard", `HTTP ${r.status}`);
  } catch (e) { fail("Stats del dashboard", e.message); }

  // ── 4. Habitaciones ──────────────────────────────────────────────────────
  console.log(`\n${BOLD}4. Habitaciones${RESET}`);
  try {
    const r = await request("GET", "/api/rooms");
    if (r.status === 200 && Array.isArray(r.json) && r.json.length > 0) ok(`Lista de habitaciones (${r.json.length} hab.)`);
    else fail("Lista de habitaciones", `HTTP ${r.status} — ${r.json?.length ?? "?"} items`);
  } catch (e) { fail("Lista de habitaciones", e.message); }
  try {
    const r = await request("GET", "/api/room-types");
    if (r.status === 200 && Array.isArray(r.json)) ok(`Tipos de habitación (${r.json.length} tipos)`);
    else fail("Tipos de habitación", `HTTP ${r.status}`);
  } catch (e) { fail("Tipos de habitación", e.message); }

  // ── 5. Reservas ──────────────────────────────────────────────────────────
  console.log(`\n${BOLD}5. Reservas${RESET}`);
  try {
    const r = await request("GET", "/api/reservations");
    if (r.status === 200 && Array.isArray(r.json)) ok(`Lista de reservas (${r.json.length} reservas)`);
    else fail("Lista de reservas", `HTTP ${r.status}`);
  } catch (e) { fail("Lista de reservas", e.message); }

  // ── 6. Tarifas ───────────────────────────────────────────────────────────
  console.log(`\n${BOLD}6. Tarifas${RESET}`);
  try {
    const r = await request("GET", "/api/rate-plans");
    if (r.status === 200 && Array.isArray(r.json)) ok(`Planes de tarifa (${r.json.length} planes)`);
    else fail("Planes de tarifa", `HTTP ${r.status}`);
  } catch (e) { fail("Planes de tarifa", e.message); }

  // ── 7. Inventario ────────────────────────────────────────────────────────
  console.log(`\n${BOLD}7. Inventario${RESET}`);
  try {
    const r = await request("GET", "/api/inventory/items");
    if (r.status === 200 && Array.isArray(r.json)) ok(`Items de inventario (${r.json.length} items)`);
    else fail("Items de inventario", `HTTP ${r.status}`);
  } catch (e) { fail("Items de inventario", e.message); }

  // ── 8. Caja ──────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}8. Caja${RESET}`);
  try {
    const r = await request("GET", "/api/cash/shifts");
    if (r.status === 200 && Array.isArray(r.json)) ok(`Turnos de caja (${r.json.length} turnos)`);
    else fail("Turnos de caja", `HTTP ${r.status}`);
  } catch (e) { fail("Turnos de caja", e.message); }

  // ── 9. Restaurant ────────────────────────────────────────────────────────
  console.log(`\n${BOLD}9. Restaurant${RESET}`);
  try {
    const r = await request("GET", "/api/restaurant/tables");
    if (r.status === 200 && Array.isArray(r.json)) ok(`Mesas del restaurant (${r.json.length} mesas)`);
    else fail("Mesas del restaurant", `HTTP ${r.status}`);
  } catch (e) { fail("Mesas del restaurant", e.message); }

  // ── Resultado final ──────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${"─".repeat(40)}`);
  if (failed === 0) {
    console.log(`${GREEN}${BOLD}✓ ${passed}/${total} checks pasaron — sistema OK${RESET}`);
  } else {
    console.log(`${RED}${BOLD}✗ ${failed}/${total} checks fallaron${RESET}`);
    console.log(`${GREEN}✓ ${passed}/${total} pasaron${RESET}`);
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error(`\n${RED}Error inesperado: ${e.message}${RESET}`);
  process.exit(1);
});
