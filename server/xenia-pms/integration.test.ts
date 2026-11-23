import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { exerciseQaOperations } from "./operations.acceptance";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
import {
  createServer as httpServer,
  request as httpRequest,
  type Server,
} from "node:http";
import { createServer as httpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect, type Browser } from "@playwright/test";
// @ts-expect-error Disposable test fixture never reads an operational URL.
import { createDisposableXeniaPostgres } from "../../script/xenia-control-postgres.mjs";
// @ts-expect-error Build helper exports SQL without connecting to a database.
import { exportXeniaPmsSchema } from "../../script/xenia-pms-schema.mjs";
import { readControlConfig } from "../xenia-control/config";
import { setupControl } from "../xenia-control/setup";
import { createControlApp } from "../xenia-control/app";
import { readXeniaPmsConfig } from "./config";
import { setupXeniaPms } from "./setup";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return (server.address() as AddressInfo).port;
}
async function close(server: Server) {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
async function port() {
  const server = httpServer();
  const value = await listen(server);
  await close(server);
  return value;
}

for (const operationsEnabled of [false, true]) test(
  `full PMS: central sign-in, isolation and revocation (operations=${operationsEnabled})`,
  { timeout: 180000 },
  async () => {
    const fixture = createDisposableXeniaPostgres();
    const screenshotDir = process.env.XENIA_SCREENSHOT_DIR ? process.env.XENIA_SCREENSHOT_DIR + (operationsEnabled ? "/operations" : "/lodging") : undefined;
    let control: Awaited<ReturnType<typeof createControlApp>> | undefined;
    let browser: Browser | undefined;
    const servers: Server[] = [],
      children: ChildProcess[] = [];
    const diagnostics: string[] = [];
    try {
      assert.deepEqual(readdirSync("dist/server/assets"), ["hotel-logo.png"]);
      assert.equal(existsSync("dist/public/maran-suite-system.zip"), false);
      const key = fixture.base + "/qa-key.pem",
        cert = fixture.base + "/qa-cert.pem";
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          key,
          "-out",
          cert,
          "-days",
          "1",
          "-subj",
          "/CN=127.0.0.1",
          "-addext",
          "subjectAltName=IP:127.0.0.1",
          "-addext",
          "basicConstraints=critical,CA:TRUE",
        ],
        { stdio: "ignore" },
      );
      const tls = { key: readFileSync(key), cert: readFileSync(cert) };
      const config = readControlConfig(fixture.env);
      await setupControl(config);
      control = await createControlApp(config);
      const central = httpsServer(tls, control.app);
      servers.push(central);
      config.origin = "https://127.0.0.1:" + (await listen(central));
      const owner = (await control.store.credentials("admin.demo"))!;
      const properties = await control.store.properties(owner);
      const aurora = properties.find(
        (property) => property.slug === "aurora-demo",
      )!;
      const brisa = properties.find(
        (property) => property.slug === "brisa-demo",
      )!;
      const urls = JSON.parse(fixture.env.XENIA_PROPERTY_DATABASES);
      // Create a second fresh operational database only inside this owned cluster.
      await control.store.central.query("CREATE DATABASE xenia_pms_brisa_test");
      const brisaUrl = new URL(urls.extra);
      brisaUrl.pathname = "/xenia_pms_brisa_test";
      const schema = exportXeniaPmsSchema();
      const installations = [];
      for (const [property, template, databaseUrl] of [
        [aurora, "aurora", urls.extra],
        [brisa, "brisa", brisaUrl.toString()],
      ] as const) {
        const backendPort = await port();
        const proxy = httpsServer(tls, (req, res) => {
          const forwarded = httpRequest(
            {
              hostname: "127.0.0.1",
              port: backendPort,
              path: req.url,
              method: req.method,
              headers: { ...req.headers, "x-forwarded-proto": "https" },
            },
            (incoming) => {
              res.writeHead(incoming.statusCode ?? 502, incoming.headers);
              incoming.pipe(res);
            },
          );
          forwarded.on("error", () => {
            res.writeHead(502);
            res.end();
          });
          req.pipe(forwarded);
        });
        servers.push(proxy);
        const origin = "https://127.0.0.1:" + (await listen(proxy));
        const installation = await control.pms.configure(
          owner,
          property.id,
          origin,
        );
        const env: NodeJS.ProcessEnv = {
          PATH: process.env.PATH,
          NODE_ENV: "production",
          PORT: String(backendPort),
          NODE_EXTRA_CA_CERTS: cert,
          XENIA_PMS_MODE: "qa",
          XENIA_PMS_OPERATIONS_ENABLED: String(operationsEnabled),
          DATABASE_URL: databaseUrl,
          SESSION_SECRET: randomBytes(40).toString("hex"),
          XENIA_PMS_ORIGIN: origin,
          XENIA_CONTROL_ORIGIN: config.origin,
          XENIA_PMS_PROPERTY_ID: property.id,
          XENIA_PMS_CLIENT_ID: installation.clientId,
          XENIA_PMS_CLIENT_SECRET: installation.clientSecret,
          XENIA_PMS_TEMPLATE: template,
        };
        await setupXeniaPms(readXeniaPmsConfig(env)!, schema);
        const child = spawn(process.execPath, ["dist/index.cjs"], {
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        children.push(child);
        let output = "";
        child.stdout!.on(
          "data",
          (data) => (output = (output + data).slice(-12000)),
        );
        child.stderr!.on(
          "data",
          (data) => (output = (output + data).slice(-12000)),
        );
        child.stderr!.on("data", (data) =>
          diagnostics.push(String(data).slice(-1500)),
        );
        let ready = false;
        for (let attempt = 0; attempt < 160; attempt++) {
          if (child.exitCode !== null)
            throw new Error("QA PMS stopped: " + output);
          try {
            ready = (await fetch(`http://127.0.0.1:${backendPort}/healthz`)).ok;
          } catch {}
          if (ready) break;
          await delay(150);
        }
        assert.ok(ready, "QA PMS did not become healthy: " + output);
        installations.push({ ...installation, template, databaseUrl });
      }
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.XENIA_BROWSER_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        timezoneId: "America/Argentina/Buenos_Aires",
        locale: "es-AR",
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage(),
        errors: string[] = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
        diagnostics.push(error.message);
      });
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type()))
          diagnostics.push(message.text().slice(0, 1000));
      });
      page.on("requestfailed", (request) =>
        diagnostics.push(
          new URL(request.url()).pathname + " " + request.failure()?.errorText,
        ),
      );
      page.on("response", (response) => {
        if (response.status() >= 400)
          diagnostics.push(
            new URL(response.url()).pathname + " " + response.status(),
          );
      });
      await page.goto(config.origin);
      await page.locator("[data-persona=reception]").click();
      await expect(page.locator("#workspace")).toBeVisible();
      await expect(page.locator("#admin-tab")).toBeHidden();
      await expect(page.locator("#pms-title")).toHaveText("Hotel Aurora");
      await page.locator("#open-pms").click();
      await page.waitForURL(installations[0].origin + "/planning");
      await expect(page.getByTestId("xenia-pms-context")).toContainText(
        "Hotel Aurora",
      );
      if (screenshotDir) {
        mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({
          path: screenshotDir + "/aurora-planning.png",
        });
      }
      const request = context.request;
      assert.equal(
        (
          await request.get(installations[0].origin + "/descargar-colobig-pdf")
        ).status(),
        404,
      );
      assert.equal(
        (
          await request.get(
            installations[0].origin +
              "/xenia/callback?code=" +
              randomBytes(32).toString("base64url") +
              "&state=" +
              randomBytes(32).toString("base64url"),
          )
        ).status(),
        401,
      );
      assert.equal(
        (
          await request.post(config.origin + "/api/pms/exchange", {
            data: {
              code: randomBytes(32).toString("base64url"),
              verifier: randomBytes(32).toString("base64url"),
            },
          })
        ).status(),
        401,
      );
      const headers = { Origin: installations[0].origin };
      assert.equal(
        (await request.get(installations[0].origin + "/api/auth/me")).status(),
        200,
      );
      for (const route of [
        "/api/rooms",
        "/api/guests",
        "/api/reservations",
        "/api/planning?start=2026-11-01&end=2026-12-31",
      ]) {
        const response = await request.get(installations[0].origin + route);
        assert.equal(
          response.status(),
          200,
          route + ": " + (await response.text()),
        );
      }
      const checkIn = new Date(Date.now() + 10 * 86400000)
          .toISOString()
          .slice(0, 10),
        checkOut = new Date(Date.now() + 12 * 86400000)
          .toISOString()
          .slice(0, 10);
      const payload = {
        guestId: "xenia-qa-guest-1",
        roomId: "xenia-qa-room-102",
        roomTypeId: "xenia-qa-type",
        ratePlanId: "xenia-qa-rate",
        checkInDate: checkIn,
        checkOutDate: checkOut,
        nights: 2,
        numberOfGuests: 2,
        baseRatePerNight: "50000",
        finalRatePerNight: "50000",
        totalRoomAmount: "100000",
        status: "confirmed",
        notes: "Prueba aislada de Aurora",
      };
      await page.goto(
        installations[0].origin +
          "/new-reservation?roomId=xenia-qa-room-103&roomTypeId=xenia-qa-type&date=" +
          checkIn,
      );
      await page.getByTestId("input-search-guest").fill("Prueba");
      await page.getByTestId("guest-result-xenia-qa-guest-1").click();
      await page.getByTestId("input-checkout-date").fill(checkOut);
      await page.getByTestId("select-rate-plan").click();
      await page.getByRole("option", { name: /Tarifa de prueba/ }).click();
      await page
        .getByTestId("input-notes")
        .fill("Reserva creada desde la pantalla de Aurora");
      await expect(page.getByTestId("button-toggle-nr-charge")).toBeHidden();
      const savedInBrowser = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/reservations" &&
          response.request().method() === "POST",
      );
      await page.getByTestId("button-create-reservation").click();
      const savedResponse = await savedInBrowser;
      assert.equal(savedResponse.status(), 201, await savedResponse.text());
      const browserReservation = await savedResponse.json();
      const permission = await request.get(
        installations[0].origin + "/api/reservation-edit-permission",
      );
      assert.equal(permission.status(), 200);
      assert.equal((await permission.json()).canEdit, true);
      await page.goto(installations[0].origin + "/reservations");
      await page.getByTestId("button-filter-all").click();
      await page
        .getByTestId("reservation-row-" + browserReservation.id)
        .click();
      const nightly = page.getByTestId("nightly-pricing-panel");
      await expect(
        nightly.getByRole("button", { name: "Editar tarifas", exact: true }),
      ).toBeEnabled();
      await nightly
        .getByRole("button", { name: "Editar tarifas", exact: true })
        .click();
      await page
        .getByLabel("Nueva tarifa común", { exact: true })
        .fill("60000");
      await page
        .getByLabel("Motivo del cambio", { exact: true })
        .fill("Prueba de tarifa desde el PMS");
      const confirmPricing = async () => {
        const preview = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
            `/api/reservations/${browserReservation.id}/nightly-pricing/preview`,
        );
        await page
          .getByRole("button", { name: "Revisar propuesta", exact: true })
          .click();
        const proposal = await preview;
        assert.equal(proposal.status(), 200, await proposal.text());
        const saved = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
            `/api/reservations/${browserReservation.id}/nightly-pricing/apply`,
        );
        await page
          .getByRole("button", { name: "Confirmar cambios", exact: true })
          .click();
        const response = await saved;
        assert.equal(response.status(), 200, await response.text());
        return response.json();
      };
      const repriced = await confirmPricing();
      assert.equal(Number(repriced.totalRoomAmount), 120000);
      await expect(
        page.getByLabel("Nueva tarifa común", { exact: true }),
      ).toBeHidden();
      await page
        .getByRole("button", { name: "Modificar estadía", exact: true })
        .click();
      const longerStay = new Date(
        new Date(checkOut + "T12:00:00Z").getTime() + 86400000,
      )
        .toISOString()
        .slice(0, 10);
      await page.getByLabel("Nuevo egreso", { exact: true }).fill(longerStay);
      await page
        .getByLabel("Tarifa nueva " + checkOut.split("-").reverse().join("/"), {
          exact: true,
        })
        .fill("65000");
      await page
        .getByLabel("Motivo del cambio", { exact: true })
        .fill("Prueba de fechas desde el PMS");
      const extended = await confirmPricing();
      assert.equal(extended.checkOutDate, longerStay);
      assert.equal(extended.nights, 3);
      assert.equal(Number(extended.totalRoomAmount), 185000);
      await expect(
        page.getByLabel("Nuevo egreso", { exact: true }),
      ).toBeHidden();
      await page.getByTestId("button-edit-from-detail").click();
      await page
        .getByTestId("input-reservation-notes")
        .fill("Observación editada desde la pantalla de Aurora");
      const noteSaved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/reservations/${browserReservation.id}` &&
          response.request().method() === "PATCH",
      );
      await page.getByTestId("button-submit-reservation").click();
      const noteResponse = await noteSaved;
      assert.equal(noteResponse.status(), 200, await noteResponse.text());
      await page.reload();
      await page.getByTestId("button-filter-all").click();
      await page
        .getByTestId("reservation-row-" + browserReservation.id)
        .click();
      await expect(nightly.locator("tbody tr")).toHaveCount(3);
      await expect(nightly).toContainText("185.000,00");
      const persisted = await request.get(
        installations[0].origin + "/api/reservations/" + browserReservation.id,
      );
      const persistedReservation = await persisted.json();
      assert.equal(
        persistedReservation.notes,
        "Observación editada desde la pantalla de Aurora",
      );
      assert.equal(persistedReservation.checkOutDate, longerStay);
      assert.equal(Number(persistedReservation.totalRoomAmount), 185000);
      assert.equal(persistedReservation.roomId, "xenia-qa-room-103");
      if (screenshotDir)
        await page.screenshot({
          path:
            screenshotDir +
            "/aurora-edicion-alojamiento.png",
        });
      const stalePricing = await request.post(
        installations[0].origin +
          `/api/reservations/${browserReservation.id}/nightly-pricing/apply`,
        {
          headers,
          data: {
            revision: 0,
            reason: "Solicitud anterior",
            edit: {
              kind: "rates",
              dates: [checkIn],
              rate: "1",
              discountMode: "amount",
              discountScope: "night",
            },
          },
        },
      );
      assert.equal(stalePricing.status(), 409);
      for (const route of [
        `/api/reservations/${browserReservation.id}/charges`,
        `/api/reservations/${browserReservation.id}/nightly-pricing/apply/extra`,
      ])
        assert.equal(
          (
            await request.post(installations[0].origin + route, {
              headers,
              data: {},
            })
          ).status(),
          403,
        );
      const created = await request.post(
        installations[0].origin + "/api/reservations",
        { headers, data: payload },
      );
      assert.equal(created.status(), 201, await created.text());
      const reservation = await created.json();
      const edited = await request.patch(
        installations[0].origin + "/api/reservations/" + reservation.id,
        { headers, data: { notes: "Prueba editada de Aurora" } },
      );
      assert.equal(edited.status(), 200, await edited.text());
      assert.equal(
        (
          await request.get(
            installations[0].origin + "/api/reservations/" + reservation.id,
          )
        ).status(),
        200,
      );
      for (const route of [
        "/api/billing/emit",
        ...(operationsEnabled ? [] : ["/api/charges"]),
        "/api/channex/ari/sync",
        "/api/system-users",
      ])
        assert.equal(
          (
            await request.post(installations[0].origin + route, {
              headers,
              data: {},
            })
          ).status(),
          403,
        );
      assert.equal(
        (
          await request.post(installations[0].origin + "/api/guests", {
            headers: { Origin: "https://another.invalid" },
            data: { firstName: "Wrong", lastName: "Origin" },
          })
        ).status(),
        403,
      );
      assert.equal(
        (
          await request.post(installations[0].origin + "/api/auth/login", {
            headers,
            data: { username: "admin", password: "unused" },
          })
        ).status(),
        403,
      );
      if (operationsEnabled) await exerciseQaOperations(page, installations[0], screenshotDir);
      // An authenticated Aurora browser cannot reuse its cookie on Brisa.
      assert.equal(
        (
          await request.get(installations[1].origin + "/api/reservations")
        ).status(),
        401,
      );
      await page.goto(installations[1].origin + "/xenia/start");
      await expect(page.locator("body")).toContainText("ya no está disponible");
      const receiver = (await control.store.credentials("recepcion.aurora"))!;
      await control.store.central.query(
        "DELETE FROM xenia_control.memberships WHERE principal_id=$1 AND property_id=$2",
        [receiver.id, aurora.id],
      );
      assert.equal(
        (await request.get(installations[0].origin + "/api/rooms")).status(),
        401,
      );
      await control.store.assign(owner, aurora.id, receiver.id, "reception");
      await context.close();

      const viewerContext = await browser.newContext({
        ignoreHTTPSErrors: true,
        timezoneId: "America/Argentina/Buenos_Aires",
      });
      const viewer = await viewerContext.newPage();
      // Starting in the PMS before central login must resume the pending request.
      await viewer.goto(installations[1].origin + "/xenia/start");
      await viewer.locator("[data-persona=viewer]").click();
      await viewer.waitForURL(installations[1].origin + "/planning");
      await expect(viewer.getByTestId("xenia-pms-context")).toContainText(
        "Apart Brisa",
      );
      if (screenshotDir)
        await viewer.screenshot({
          path: screenshotDir + "/brisa-consulta.png",
        });
      const guestResponse = await viewerContext.request.get(
        installations[1].origin + "/api/guests",
      );
      assert.equal(guestResponse.status(), 200);
      assert.match(await guestResponse.text(), /Brisa/);
      const brisaReservations = await viewerContext.request.get(
        installations[1].origin + "/api/reservations",
      );
      assert.ok(!(await brisaReservations.text()).includes(reservation.id));
      const viewerPermission = await viewerContext.request.get(
        installations[1].origin + "/api/reservation-edit-permission",
      );
      assert.equal(viewerPermission.status(), 200);
      assert.equal((await viewerPermission.json()).canEdit, false);
      for (const [route, method] of [
        ["/api/reservations", "post"],
        ["/api/payments", "post"],
        ["/api/charges", "post"],
        ["/api/cash/shifts/open", "post"],
        ["/api/reservations/xenia-qa-reservation-1/check-in", "post"],
        ["/api/rooms/xenia-qa-room-101", "patch"],
        ["/api/reservations/xenia-qa-reservation-1", "delete"],
        [
          "/api/reservations/xenia-qa-reservation-1/nightly-pricing/preview",
          "post",
        ],
        [
          "/api/reservations/xenia-qa-reservation-1/nightly-pricing/apply",
          "post",
        ],
      ] as const)
        assert.equal(
          (
            await viewerContext.request[method](
              installations[1].origin + route,
              { headers: { Origin: installations[1].origin }, data: payload },
            )
          ).status(),
          403,
        );
      await viewer.goto(config.origin);
      await viewer.locator("#logout").click();
      await expect(viewer.locator("#login-view")).toBeVisible();
      assert.equal(
        (
          await viewerContext.request.get(
            installations[1].origin + "/api/rooms",
          )
        ).status(),
        401,
      );
      await viewerContext.close();
      const adminContext = await browser.newContext({
        ignoreHTTPSErrors: true,
        timezoneId: "America/Argentina/Buenos_Aires",
      });
      const admin = await adminContext.newPage();
      await admin.goto(config.origin);
      await admin.locator("[data-persona=owner]").click();
      if (operationsEnabled) {
        await admin.goto(installations[1].origin + "/xenia/start");
        await admin.waitForURL(installations[1].origin + "/planning");
        await exerciseQaOperations(admin, installations[1], screenshotDir);
        await admin.goto(config.origin);
      }
      await admin.locator("#property-selector").selectOption(aurora.id);
      await admin.locator("#admin-tab").click();
      await admin.locator("#pms-origin").fill(installations[0].origin);
      admin.once("dialog", (dialog) => dialog.accept());
      await admin.locator("#pms-form button").click();
      await expect(admin.locator("#pms-credentials")).toBeVisible();
      const sheet = await admin.locator("#pms-connection-sheet").inputValue();
      assert.match(sheet, /SESSION_SECRET=[a-f0-9]{64}/);
      assert.match(sheet, /XENIA_PMS_TEMPLATE=aurora/);
      assert.match(sheet, /XENIA_PMS_CLIENT_SECRET=[a-zA-Z0-9_-]{43}/);
      await admin.locator("#pms-hide-credentials").click();
      await expect(admin.locator("#pms-connection-sheet")).toHaveValue("");
      await adminContext.close();
      assert.deepEqual(errors, []);
      if (screenshotDir) {
        mkdirSync(screenshotDir, { recursive: true });
        writeFileSync(
          screenshotDir + "/pms-acceptance.json",
          JSON.stringify(
            {
              status: "passed",
              operationsEnabled,
              environment:
                "disposable local PostgreSQL and compiled PMS over HTTPS",
              checks: [
                "central sign-in and resume",
                "planning and lodging APIs",
                "create and edit reservation",
                "separate Aurora and Brisa databases",
                "viewer write refusal",
                "membership revocation",
                "central logout revokes PMS",
              ],
              date: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      }
    } catch (error) {
      console.error(diagnostics.slice(-25).join("\n"));
      if (browser && screenshotDir) {
        mkdirSync(screenshotDir, { recursive: true });
        for (const context of browser.contexts())
          for (const page of context.pages()) {
            await page
              .screenshot({
                path: screenshotDir + "/failed.png",
              })
              .catch(() => {});
            console.error(
              (await page.locator("body").innerText()).slice(0, 1500),
            );
          }
      }
      throw error;
    } finally {
      if (browser) await browser.close();
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGTERM");
          await new Promise<void>((resolve) =>
            child.once("exit", () => resolve()),
          );
        }
      }
      for (const server of servers) await close(server);
      if (control) await control.close();
      fixture.close();
    }
  },
);
