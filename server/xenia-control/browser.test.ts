import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
// @ts-expect-error Local JavaScript fixture deliberately does not accept supplied database URLs.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
import { readControlConfig } from "./config";
import { setupControl } from "./setup";
import { createControlApp } from "./app";

test(
  "the real browser keeps property contexts and shared-browser identities isolated",
  { timeout: 90000 },
  async () => {
    const fixture = createDisposableXeniaPostgres();
    const config = readControlConfig(fixture.env);
    let control: Awaited<ReturnType<typeof createControlApp>> | undefined;
    let server:
      | ReturnType<
          Awaited<ReturnType<typeof createControlApp>>["app"]["listen"]
        >
      | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      await setupControl(config);
      control = await createControlApp(config);
      server = control.app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server!.once("listening", resolve));
      config.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.XENIA_BROWSER_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        locale: "es-AR",
      });
      const page = await context.newPage(),
        errors: string[] = [];
      const capture = async (name: string) => {
        if (process.env.XENIA_SCREENSHOT_DIR) {
          await mkdir(process.env.XENIA_SCREENSHOT_DIR, { recursive: true });
          await page.bringToFront();
          await page.screenshot({
            path: path.join(process.env.XENIA_SCREENSHOT_DIR, name + ".png"),
            fullPage: true,
            animations: "disabled",
          });
        }
      };
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(config.origin);
      await expect(page.locator("[data-persona=owner]")).toBeVisible();
      await capture("ingreso");
      await page.locator("[data-persona=owner]").click();
      await expect(page.locator("#workspace")).toBeVisible();
      const aurora = (await page
        .locator("#property-selector option")
        .filter({ hasText: "Hotel Aurora" })
        .getAttribute("value"))!;
      const brisa = (await page
        .locator("#property-selector option")
        .filter({ hasText: "Apart Brisa" })
        .getAttribute("value"))!;
      await page.locator("#property-selector").selectOption(aurora);
      await expect(page.locator("#reservation-list")).toContainText(
        "Huésped de ejemplo Aurora",
      );
      await capture("panel-aurora");
      await page
        .getByLabel("Nombre del huésped", { exact: true })
        .fill("Borrador de Aurora");
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.locator("#property-selector").selectOption(brisa);
      await expect(page.locator("#property-selector")).toHaveValue(aurora);
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#property-selector").selectOption(brisa);
      await expect(
        page.getByLabel("Nombre del huésped", { exact: true }),
      ).toHaveValue("");
      await expect(page.locator("#reservation-list")).toContainText(
        "Huésped de ejemplo Brisa",
      );
      const other = await context.newPage();
      other.on("pageerror", (error) => errors.push(error.message));
      await other.goto(config.origin);
      await other.locator("#property-selector").selectOption(aurora);
      await expect(other.locator("#property-name")).toHaveText("Hotel Aurora");
      await expect(page.locator("#property-name")).toHaveText("Apart Brisa");
      const held: import("@playwright/test").Route[] = [];
      await page.route(
        "**/api/properties/" + aurora + "/reservations",
        (route) => {
          held.push(route);
        },
      );
      await page.locator("#property-selector").selectOption(aurora);
      await expect.poll(() => held.length).toBe(1);
      await page.locator("#property-selector").selectOption(brisa);
      await expect(page.locator("#reservation-list")).toContainText(
        "Huésped de ejemplo Brisa",
      );
      await held[0].fulfill({
        json: [
          {
            id: "late",
            guestName: "Respuesta vieja de Aurora",
            room: "101",
            checkIn: "2026-12-01",
            checkOut: "2026-12-02",
            status: "confirmed",
          },
        ],
      });
      await page.waitForTimeout(50);
      await expect(page.locator("#reservation-list")).not.toContainText(
        "Respuesta vieja de Aurora",
      );
      await page.unroute("**/api/properties/" + aurora + "/reservations");
      await page.locator("#admin-tab").click();
      await page.locator("#property-client").selectOption({ index: 1 });
      await page
        .getByLabel("Nombre del establecimiento", { exact: true })
        .fill("Posada de prueba");
      await page.locator("#property-form .primary").click();
      await expect(page.locator("#property-name")).toHaveText(
        "Posada de prueba",
      );
      await page.locator("#admin-tab").click();
      await page
        .getByLabel("Nombre y apellido", { exact: true })
        .fill("Recepción Posada");
      await page.locator("#new-username").fill("recepcion.posada");
      await page
        .getByLabel("Contraseña inicial", { exact: true })
        .fill("Ficticia-local-Posada-2026");
      await page.getByLabel("Posada de prueba", { exact: true }).check();
      await page.locator("#user-form .primary").click();
      await expect(page.locator("#membership-list")).toContainText(
        "Recepción Posada",
      );
      await capture("administracion");
      await page.locator("#logout").click();
      await expect(other.locator("#login-view")).toBeVisible();
      await page.locator("[data-persona=reception]").click();
      await expect(page.locator("#property-name")).toHaveText("Hotel Aurora");
      await expect(page.locator("#property-selector option")).toHaveCount(1);
      await capture("recepcion-aurora");
      await expect(other.locator("#property-name")).toHaveText("Hotel Aurora");
      await expect(other.locator("#organization-list")).toBeEmpty();
      await expect(other.locator("#assignment-user option")).toHaveCount(0);
      assert.equal(
        (
          await page.request.get(
            config.origin + "/api/properties/" + brisa + "/reservations",
          )
        ).status(),
        404,
      );
      await page.locator("#logout").click();
      await page.locator("[data-persona=viewer]").click();
      await expect(page.locator("#property-name")).toHaveText("Apart Brisa");
      await expect(page.locator("#reservation-form")).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "Anular prueba", exact: true }),
      ).toHaveCount(0);
      await page.locator("#logout").click();
      await page.locator("#username").fill("recepcion.posada");
      await page.locator("#password").fill("Ficticia-local-Posada-2026");
      await page.locator("#login-form .primary").click();
      await expect(page.locator("#property-name")).toHaveText(
        "Posada de prueba",
      );
      await expect(page.locator("#property-selector option")).toHaveCount(1);
      for (const width of [1440, 1024, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `Horizontal overflow at ${width}`,
        );
      }
      await capture("panel-mobile");
      assert.deepEqual(errors, []);
    } finally {
      if (browser) await browser.close();
      if (server)
        await new Promise<void>((resolve) => {
          server!.close(() => resolve());
          server!.closeAllConnections();
        });
      if (control) await control.close();
      fixture.close();
    }
  },
);
