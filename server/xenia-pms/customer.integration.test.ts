import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer as httpsServer } from "node:https";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect, type Browser } from "@playwright/test";
import pg from "pg";
// @ts-expect-error Owned synthetic PostgreSQL, never a supplied operating URL.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
// @ts-expect-error Pure SQL export, no database connection.
import { exportXeniaPmsSchema } from "../../script/xenia-pms-schema.mjs";
import { readControlConfig } from "../xenia-control/config";
import { setupControl } from "../xenia-control/setup";
import { createControlApp } from "../xenia-control/app";
import { readXeniaPmsConfig } from "./config";
import { setupXeniaPms } from "./setup";
import { exerciseQaOperations } from "./operations.acceptance";
async function listen(server: Server) { server.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r)); return (server.address() as AddressInfo).port; }
async function close(server: Server) { await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); }); }

test("an independent customer operates a clean generic compiled PMS while legacy hotels remain isolated", { timeout: 180000 }, async () => {
  const fixture = createDisposableXeniaPostgres(), servers: Server[] = [];
  let control: Awaited<ReturnType<typeof createControlApp>> | undefined, browser: Browser | undefined, child: ChildProcess | undefined;
  let output = "";
  const captureDir = process.env.XENIA_SCREENSHOT_DIR ? process.env.XENIA_SCREENSHOT_DIR + "/independent-customer" : undefined;
  try {
    const key = fixture.base + "/key.pem", cert = fixture.base + "/cert.pem";
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
      "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE"], { stdio: "ignore" });
    const tls = { key: readFileSync(key), cert: readFileSync(cert) };
    const config = readControlConfig(fixture.env); await setupControl(config); control = await createControlApp(config);
    const centralServer = httpsServer(tls, control.app); servers.push(centralServer); config.origin = "https://127.0.0.1:" + await listen(centralServer);
    const platform = (await control.store.credentials("admin.demo"))!;
    const originals = await control.store.properties(platform);
    const originalReservations = await Promise.all(originals.map(p => control!.store.reservations(platform, p.id)));
    const customer = await control.store.createOrganization(platform, "Cliente independiente Costa");
    const password = "Clave ficticia 2026";
    const customerAdmin = await control.customers.createAdministrator(platform, customer.id, { requestId: randomUUID(), username: "admin.costa.integration", name: "Administración Costa", password });
    const temporaryServer = createServer(); const backendPort = await listen(temporaryServer); await close(temporaryServer);
    const proxy = httpsServer(tls, (req, res) => {
      const forward = httpRequest({ hostname: "127.0.0.1", port: backendPort, path: req.url, method: req.method,
        headers: { ...req.headers, "x-forwarded-proto": "https" } }, incoming => { res.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(res); });
      forward.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(forward);
    });
    servers.push(proxy); const origin = "https://127.0.0.1:" + await listen(proxy);
    browser = await chromium.launch({ headless: true, executablePath: process.env.XENIA_BROWSER_PATH || undefined });
    const globalContext = await browser.newContext({ ignoreHTTPSErrors: true }); const globalPage = await globalContext.newPage();
    globalPage.setDefaultTimeout(12000);
    await globalPage.goto(config.origin); await globalPage.locator('[data-persona="owner"]').click(); await globalPage.locator("#admin-tab").click();
    await globalPage.locator("#property-client").selectOption(customer.id);
    await globalPage.locator("#property-storage").selectOption("pms");
    await globalPage.getByLabel("Nombre del establecimiento", { exact: true }).fill("Hotel Costa Norte");
    const createdResponse = globalPage.waitForResponse(r => r.url().endsWith("/api/admin/properties") && r.request().method() === "POST");
    await globalPage.locator("#property-form .primary").click();
    const created = await createdResponse; assert.equal(created.status(), 201); const hotel = await created.json();
    await expect(globalPage.locator("#property-pending")).toBeVisible(); await globalPage.locator("#admin-tab").click();
    await expect(globalPage.locator("#pms-template")).toHaveValue("custom");
    await globalPage.locator("#pms-origin").fill(origin); await globalPage.locator("#pms-form .primary").click();
    await expect(globalPage.locator("#pms-credentials")).toBeVisible();
    const sheet = await globalPage.locator("#pms-connection-sheet").inputValue();
    const values = Object.fromEntries(sheet.split("\n").map(line => { const i = line.indexOf("="); const value = line.slice(i + 1); return [line.slice(0, i), value.startsWith('"') ? JSON.parse(value) : value]; }));
    assert.equal(values.XENIA_PMS_TEMPLATE, "custom"); assert.equal(values.XENIA_PMS_PROPERTY_NAME, "Hotel Costa Norte");
    await globalPage.locator("#pms-hide-credentials").click();
    const operationalUrl = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES).extra;
    const env: NodeJS.ProcessEnv = { ...values, PATH: process.env.PATH, PORT: String(backendPort), DATABASE_URL: operationalUrl,
      NODE_EXTRA_CA_CERTS: cert, XENIA_PMS_OPERATIONS_ENABLED: "true" };
    await setupXeniaPms(readXeniaPmsConfig(env)!, exportXeniaPmsSchema());
    const pool = new pg.Pool({ connectionString: operationalUrl });
    try {
      for (const table of ["rooms", "guests", "reservations", "rate_plans", "system_users"])
        assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count, "0");
      assert.equal((await pool.query("SELECT value FROM system_settings WHERE key='hotel_name'")).rows[0].value, "Hotel Costa Norte");
    } finally { await pool.end(); }
    child = spawn(process.execPath, ["dist/index.cjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout!.on("data", d => { output = (output + d).slice(-12000); }); child.stderr!.on("data", d => { output = (output + d).slice(-12000); });
    let healthy = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw Error("Generic PMS stopped: " + output);
      try { healthy = (await fetch(`http://127.0.0.1:${backendPort}/healthz`)).ok; } catch {}
      if (healthy) break; await delay(150);
    }
    assert.ok(healthy, output);
    await expect.poll(async () => (await control!.store.catalogProperty(platform, hotel.id)).status, { timeout: 20000 }).toBe("active");
    const health = await (await fetch(`http://127.0.0.1:${backendPort}/healthz`)).json();
    assert.equal(health.template, "custom"); assert.equal(health.propertyName, "Hotel Costa Norte");
    assert.equal(health.revision, execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim());
    const installationRow = (await control.store.central.query("SELECT verified_revision,database_binding_id FROM xenia_control.pms_installations WHERE property_id=$1", [hotel.id])).rows[0];
    assert.equal(installationRow.verified_revision, health.revision); assert.ok(installationRow.database_binding_id);
    await globalPage.reload(); await expect(globalPage.locator("#open-pms")).toBeVisible(); await expect(globalPage.locator("#lodging-workspace")).toBeHidden();
    const context = await browser.newContext({ ignoreHTTPSErrors: true, timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR", viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    await page.goto(config.origin); await page.locator("#username").fill("admin.costa.integration"); await page.locator("#password").fill(password); await page.locator("#login-form .primary").click();
    await expect(page.locator("#property-selector option")).toHaveCount(1); await expect(page.locator("#admin-tab")).toBeHidden();
    await page.locator("#open-pms").click(); await expect(page).toHaveURL(origin + "/planning");
    await expect(page.locator("body")).toContainText("Hotel Costa Norte");
    const request = context.request, headers = { Origin: origin };
    const create = async (path: string, data: unknown) => { const r = await request.post(origin + path, { headers, data, timeout: 12000 }); assert.equal(r.status(), 201, await r.text()); return r.json(); };
    const type = await create("/api/room-types", { code: "CN", name: "Doble Costa", description: "Configuración ficticia propia", baseOccupancy: 2, maxOccupancy: 2 });
    const room = await create("/api/rooms", { roomNumber: "C-201", roomTypeId: type.id, floor: 2, status: "available", maxOccupancy: 2 });
    const rate = await create("/api/rate-plans", { name: "Tarifa Costa", roomTypeId: type.id, baseRate: "50000", rate1pax: "50000", rate2pax: "50000", currency: "ARS" });
    const guest = await create("/api/guests", { firstName: "Viaje", lastName: "Costa Prueba", nationality: "Argentina", active: true });
    await exerciseQaOperations(page, { origin, databaseUrl: operationalUrl, template: "custom", fixtureIds: { guestId: guest.id, roomId: room.id, roomTypeId: type.id, ratePlanId: rate.id } }, captureDir);
    const centralSession = await (await request.get(config.origin + "/api/session")).json();
    const centralHeaders = { Origin: config.origin, "X-CSRF-Token": centralSession.csrfToken };
    const staffResponse = await request.post(config.origin + `/api/organizations/${customer.id}/users`, { headers: centralHeaders, data: { requestId: randomUUID(), username: "consulta.costa.integration", name: "Consulta Costa", password, role: "viewer", propertyIds: [hotel.id] } });
    assert.equal(staffResponse.status(), 201); await staffResponse.json();
    const viewerContext = await browser.newContext({ ignoreHTTPSErrors: true }); const viewerPage = await viewerContext.newPage(); viewerPage.setDefaultTimeout(12000);
    await viewerPage.goto(config.origin); await viewerPage.locator("#username").fill("consulta.costa.integration"); await viewerPage.locator("#password").fill(password); await viewerPage.locator("#login-form .primary").click();
    await viewerPage.locator("#open-pms").click(); await expect(viewerPage).toHaveURL(origin + "/planning");
    for (const path of ["/api/charges", "/api/payments", "/api/cash/shifts/open"]) assert.equal((await viewerContext.request.post(origin + path, { headers, data: {} })).status(), 403);
    assert.equal((await request.get(config.origin + `/api/properties/${originals[0].id}/reservations`)).status(), 404);
    for (let i = 0; i < originals.length; i++) assert.deepEqual(await control.store.reservations(platform, originals[i].id), originalReservations[i]);
    await control.customers.revokeAdministrator(platform, customer.id, customerAdmin.id);
    assert.equal((await request.get(origin + "/api/reservations")).status(), 401);
    assert.equal((await viewerContext.request.get(origin + "/api/reservations")).status(), 200);
    if (captureDir) { mkdirSync(captureDir, { recursive: true }); writeFileSync(captureDir + "/acceptance.json", JSON.stringify({
      status: "passed", environment: "synthetic PostgreSQL and compiled PMS over local HTTPS", revision: health.revision,
      customerId: customer.id, propertyId: hotel.id, template: "custom", readinessAuthenticated: true,
      cleanInitialHotel: true, configurationCreatedByAuthorizedAPI: true, fullNativeStayAndCashFlow: true,
      viewerWritesRefused: true, otherCustomerAccessRefused: true, legacyHotelReservationsPreserved: true,
      administratorRevocationAppliesToOpenPmsSession: true, realHotelOperations: 0, providerCalls: 0,
    }, null, 2)); }
  } catch (error) { if (output) console.error(output.slice(-9000)); throw error; }
  finally {
    await browser?.close();
    if (child && child.exitCode === null) { child.kill("SIGTERM"); await Promise.race([new Promise(r => child!.once("exit", r)), delay(5000)]); if (child.exitCode === null) child.kill("SIGKILL"); }
    for (const server of servers.reverse()) await close(server);
    if (control) await control.close(); fixture.close();
  }
});
