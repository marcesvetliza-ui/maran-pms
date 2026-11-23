import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
// @ts-expect-error Synthetic disposable cluster, no operating database input.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
import { readControlConfig } from "./config";
import { setupControl } from "./setup";
import { createControlApp } from "./app";

test("native customer administration preserves scope, uncertain creation and account changes", { timeout: 90000 }, async () => {
  const fixture = createDisposableXeniaPostgres(), config = readControlConfig(fixture.env);
  let control: Awaited<ReturnType<typeof createControlApp>> | undefined;
  let server: ReturnType<Awaited<ReturnType<typeof createControlApp>>["app"]["listen"]> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const errors: string[] = [];
  try {
    await setupControl(config); control = await createControlApp(config);
    const platform = (await control.store.credentials("admin.demo"))!;
    const orgA = (await control.store.properties(platform))[0].organizationId;
    const orgB = (await control.store.createOrganization(platform, "Cliente del Hotel Norte")).id;
    const hotel = await control.store.createProperty(platform, { organizationId: orgB, name: "Hotel Norte", slug: "norte-independiente", modules: ["lodging"] });
    const password = "Clave ficticia 2026";
    await control.customers.createAdministrator(platform, orgA, { requestId: randomUUID(), username: "admin.a.native", name: "Administración Cliente A", password });
    server = control.app.listen(0, "127.0.0.1"); await new Promise<void>(r => server!.once("listening", r));
    config.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.XENIA_BROWSER_PATH || undefined });
    const platformContext = await browser.newContext(), context = await browser.newContext();
    const platformPage = await platformContext.newPage(), page = await context.newPage();
    for (const p of [platformPage, page]) { p.setDefaultTimeout(12000); p.on("pageerror", e => errors.push(e.message)); }
    await platformPage.goto(config.origin); await platformPage.locator('[data-persona="owner"]').click();
    await platformPage.locator("#admin-tab").click();
    await platformPage.getByLabel("Cliente del administrador", { exact: true }).selectOption(orgB);
    await platformPage.getByLabel("Nombre del administrador", { exact: true }).fill("Administración Hotel Norte");
    await platformPage.getByLabel("Usuario del administrador", { exact: true }).fill("admin.b.native");
    await platformPage.getByLabel("Contraseña inicial del administrador", { exact: true }).fill(password);
    await platformPage.getByRole("button", { name: "Crear administrador del cliente", exact: true }).click();
    await expect(platformPage.locator("#customer-admin-list")).toContainText("admin.b.native");
    const login = async (username: string) => {
      await page.goto(config.origin); await page.locator("#login-form").getByLabel("Usuario", { exact: true }).fill(username);
      await page.getByLabel("Contraseña", { exact: true }).fill(password); await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(page.locator("#workspace")).toBeVisible();
    };
    await login("admin.b.native");
    await expect(page.locator("#admin-tab")).toBeHidden(); await expect(page.locator("#team-tab")).toBeVisible();
    await expect(page.locator("#property-selector option")).toHaveCount(1);
    await page.locator("#team-tab").click();
    await expect(page.locator("#team-organization option")).toHaveCount(1);
    await expect(page.locator("#team-property-options")).toContainText("Hotel Norte");
    await expect(page.locator("#team-property-options")).not.toContainText("Aurora");
    const fillStaff = async () => {
      await page.getByLabel("Nombre del colaborador", { exact: true }).fill("Recepción Norte");
      await page.getByLabel("Usuario del colaborador", { exact: true }).fill("recepcion.norte.native");
      await page.getByLabel("Contraseña inicial del colaborador", { exact: true }).fill(password);
      await page.locator(`#team-property-options input[value="${hotel.id}"]`).check();
    };
    let originalBody: any;
    await page.route(config.origin + `/api/organizations/${orgB}/users`, async route => {
      if (route.request().method() !== "POST" || originalBody) return route.continue();
      originalBody = route.request().postDataJSON(); const response = await route.fetch(); assert.equal(response.status(), 201);
      await route.abort("failed");
    });
    await fillStaff(); await page.getByRole("button", { name: "Crear colaborador", exact: true }).click();
    await expect(page.locator("#notice")).toContainText("Se interrumpió la conexión");
    await expect(page.getByLabel("Nombre del colaborador", { exact: true })).toHaveValue("Recepción Norte");
    assert.ok(!(await page.evaluate("JSON.stringify(sessionStorage)")).includes(password));
    await page.unroute(config.origin + `/api/organizations/${orgB}/users`);
    await page.reload(); await page.locator("#team-tab").click(); await fillStaff();
    const replay = page.waitForResponse(r => r.url().endsWith(`/api/organizations/${orgB}/users`) && r.request().method() === "POST");
    await page.getByRole("button", { name: "Crear colaborador", exact: true }).click();
    const replayResponse = await replay; assert.equal(replayResponse.status(), 200);
    assert.equal(replayResponse.request().postDataJSON().requestId, originalBody.requestId); const person = await replayResponse.json();
    await expect(page.locator("#team-list")).toContainText("recepcion.norte.native");
    assert.equal((await control.store.central.query("SELECT count(*) FROM xenia_control.principals WHERE username='recepcion.norte.native'")).rows[0].count, "1");
    const card = page.locator(`[data-principal-id="${person.id}"]`);
    await card.getByRole("combobox").selectOption("viewer"); await card.getByRole("button", { name: "Guardar permiso" }).click();
    await expect(page.locator(`[data-principal-id="${person.id}"] select`)).toHaveValue("viewer");
    page.once("dialog", d => d.accept()); await page.locator(`[data-principal-id="${person.id}"]`).getByRole("button", { name: "Suspender en este cliente" }).click();
    await expect(page.locator(`[data-principal-id="${person.id}"]`)).toContainText("Suspendido en este cliente");
    assert.equal((await control.store.central.query("SELECT count(*) FROM xenia_control.memberships WHERE principal_id=$1", [person.id])).rows[0].count, "0");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "El equipo no debe desbordar horizontalmente en un teléfono");
    if (process.env.XENIA_SCREENSHOT_DIR) {
      await mkdir(process.env.XENIA_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: process.env.XENIA_SCREENSHOT_DIR + "/cliente-equipo-norte.png", fullPage: true });
    }
    // A late response from the previous identity must not repopulate the new account.
    const held: import("@playwright/test").Route[] = [];
    await page.route(config.origin + `/api/organizations/${orgB}/users`, r => { held.push(r); });
    await page.locator("#operations-tab").click(); await page.locator("#team-tab").click();
    await expect.poll(() => held.length).toBe(1);
    const other = await context.newPage(); await other.goto(config.origin); await other.locator("#logout").click();
    await other.locator("#login-form").getByLabel("Usuario", { exact: true }).fill("admin.a.native");
    await other.getByLabel("Contraseña", { exact: true }).fill(password); await other.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.locator("#user-name")).toHaveText("Administración Cliente A");
    await held[0].fulfill({ json: [{ id: person.id, name: "Datos tardíos de otro cliente", username: "otro.cliente", properties: [], active: true }] });
    await page.unroute(config.origin + `/api/organizations/${orgB}/users`);
    await page.locator("#team-tab").click(); await expect(page.locator("#team-title")).not.toContainText("Norte");
    await expect(page.locator("#team-list")).toContainText("Administración Cliente A");
    await expect(page.locator("#team-list")).not.toContainText("Datos tardíos");
    await expect(page.locator("#team-list")).not.toContainText("recepcion.norte.native");
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await new Promise<void>(r => { server!.close(() => r()); server!.closeAllConnections(); });
    if (control) await control.close(); fixture.close();
  }
});
