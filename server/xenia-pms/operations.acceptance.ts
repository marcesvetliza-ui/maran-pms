import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { expect, type Page } from "@playwright/test";

/** Invoked only by the disposable-cluster, compiled-PMS acceptance test. */
export async function exerciseQaOperations(page: Page, installation: {
  origin: string; databaseUrl: string; template: string;
}, screenshotDir?: string) {
  const url = new URL(installation.databaseUrl);
  assert.equal(url.hostname, "localhost");
  assert.match(url.searchParams.get("host") || "", /^\/tmp\/xenia-multihotel-[^/]+\/socket$/);
  const pool = new pg.Pool({ connectionString: installation.databaseUrl });
  const origin = installation.origin, request = page.context().request, headers = { Origin: origin };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const tomorrow = new Date(new Date(today + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const checks: string[] = [];
  const cashPayment = installation.template === "aurora";
  const mark = (message: string) => { checks.push(message); console.info("[QA operations]", installation.template, message); };
  const boundedJson = async (response: { json: () => Promise<any> }) => {
    let timer: ReturnType<typeof setTimeout>;
    try { return await Promise.race([response.json(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Error("Response body did not complete within 12 seconds")), 12000);
    })]); } finally { clearTimeout(timer!); }
  };
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(12000);
  try {
    assert.equal((await (await request.get(origin + "/api/xenia/installation")).json()).operationsEnabled, true);
    const health = await (await request.get(origin + "/healthz")).json();
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(health.revision, revision);
    assert.equal(health.mode, "qa");
    const actor = await (await request.get(origin + "/api/auth/me")).json();
    const actorName = actor.fullName || actor.username;
    // Open the real reception shift through the normal Caja UI.
    await page.goto(origin + "/cash-register");
    await page.getByTestId("btn-open-shift-reception").click();
    await page.getByTestId("btn-turno-tipo-mañana-reception").click();
    await page.getByTestId("select-opened-by-reception").click();
    await page.getByRole("option", { name: actorName, exact: true }).click();
    const opened = page.waitForResponse(r => new URL(r.url()).pathname === "/api/cash/shifts/open");
    await page.getByTestId("btn-confirm-open-shift-reception").click();
    const openResponse = await opened;
    assert.equal(openResponse.status(), 201);
    const shift = await boundedJson(openResponse);
    mark("native reception shift opening with the verified Xenia identity");

    const created = await request.post(origin + "/api/reservations", { timeout: 12000, headers, data: {
      guestId: "xenia-qa-guest-1", roomId: "xenia-qa-room-102", roomTypeId: "xenia-qa-type", ratePlanId: "xenia-qa-rate",
      checkInDate: today, checkOutDate: tomorrow, nights: 1, numberOfGuests: 1,
      baseRatePerNight: "50000", finalRatePerNight: "50000", totalRoomAmount: "50000", status: "confirmed",
      notes: "Circuito individual de prueba, datos ficticios",
    } });
    assert.equal(created.status(), 201, await created.text());
    const reservation = await created.json();
    await page.goto(origin + "/check-in");
    await page.getByTestId("button-checkin-" + reservation.id).click();
    const checkedIn = page.waitForResponse(r => new URL(r.url()).pathname === `/api/reservations/${reservation.id}/check-in`);
    await page.getByTestId("button-confirm-checkin").click();
    const checkInResponse = await checkedIn;
    assert.equal(checkInResponse.status(), 200);
    assert.equal((await (await request.get(origin + "/api/reservations/" + reservation.id)).json()).status, "checked_in");
    mark("native check-in and durable room/stay state");

    const openFolio = async () => {
      await page.goto(origin + "/reservations");
      await page.getByTestId("button-filter-all").click();
      await page.getByTestId("reservation-row-" + reservation.id).click();
      await page.getByRole("tab", { name: "Folio", exact: true }).click();
    };
    await openFolio();
    await page.getByTestId("button-add-charge").click();
    await page.getByTestId("select-charge-preset").click();
    await page.getByRole("option", { name: "Agua de prueba", exact: true }).click();
    const charged = page.waitForResponse(r => new URL(r.url()).pathname === "/api/charges" && r.request().method() === "POST");
    await page.getByTestId("button-confirm-charge").click();
    const chargeResponse = await charged;
    assert.equal(chargeResponse.status(), 201);
    const charge = await boundedJson(chargeResponse), chargeBody = chargeResponse.request().postDataJSON();
    assert.equal((await request.post(origin + "/api/charges", { timeout: 12000, headers, data: chargeBody })).status(), 200);
    assert.equal((await request.post(origin + "/api/charges", { timeout: 12000, headers, data: { ...chargeBody, amount: "2000" } })).status(), 409);
    assert.equal((await pool.query("SELECT count(*) FROM charges WHERE id=$1", [charge.id])).rows[0].count, "1");
    assert.equal((await pool.query("SELECT count(*) FROM folio_movements WHERE source_type='charge' AND source_id=$1", [charge.id])).rows[0].count, "1");
    mark("native consumption, identical replay and conflicting replay without duplicate ledger entries");

    // Inject a local-only ledger failure: the charge and audit must roll back too.
    const failureBody = { ...chargeBody, operationId: randomUUID(), description: "Fallo controlado de ledger", amount: "250" };
    await pool.query(`CREATE FUNCTION xenia_pms.fail_test_charge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.description='Fallo controlado de ledger' THEN RAISE EXCEPTION 'synthetic ledger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER xenia_test_charge_failure BEFORE INSERT ON folio_movements FOR EACH ROW EXECUTE FUNCTION xenia_pms.fail_test_charge();`);
    assert.equal((await request.post(origin + "/api/charges", { timeout: 12000, headers, data: failureBody })).status(), 500);
    assert.equal((await pool.query("SELECT count(*) FROM charges WHERE id=$1", ["xenia-qa-charge:" + failureBody.operationId])).rows[0].count, "0");
    await pool.query("DROP TRIGGER xenia_test_charge_failure ON folio_movements; DROP FUNCTION xenia_pms.fail_test_charge()");
    assert.equal((await request.post(origin + "/api/charges", { timeout: 12000, headers, data: failureBody })).status(), 201);
    mark("transaction rollback after a synthetic ledger failure and safe retry");

    assert.equal((await request.post(origin + `/api/reservations/${reservation.id}/check-out`, { timeout: 12000, headers, data: { requireSettled: true } })).status(), 409);
    assert.equal((await request.post(origin + `/api/reservations/${reservation.id}/check-out`, { timeout: 12000, headers, data: { forceCheckout: true } })).status(), 400);
    assert.equal((await request.patch(origin + `/api/reservations/${reservation.id}`, { timeout: 12000, headers, data: { status: "checked_out" } })).status(), 403);
    assert.equal((await (await request.get(origin + "/api/reservations/" + reservation.id)).json()).status, "checked_in");
    mark("pending balance blocks checkout and direct status/forced-departure bypasses");

    await openFolio();
    const folio = await (await request.get(origin + `/api/reservations/${reservation.id}/folio`)).json();
    const expected = Number(folio.balance);
    assert.equal(expected, 51250);
    let paymentBody: any, droppedStatus: number | undefined;
    await page.route(origin + "/api/payments", async route => {
      if (route.request().method() !== "POST" || paymentBody) return route.continue();
      paymentBody = route.request().postDataJSON();
      const response = await route.fetch();
      droppedStatus = response.status();
      await route.abort("failed");
    });
    await page.getByTestId("button-add-payment").click();
    await page.getByTestId("input-payment-amount-0").fill(expected.toFixed(2));
    if (!cashPayment) {
      await page.getByTestId("select-payment-method-0").click();
      await page.getByRole("option", { name: "Transferencia", exact: true }).click();
    }
    await page.getByTestId("button-confirm-payment").click();
    await expect(page.getByText("Error al registrar pago", { exact: true })).toBeVisible();
    assert.equal(droppedStatus, 201);
    // Reload the real UI and retry exactly the uncertain operation.
    await page.reload();
    await page.unroute(origin + "/api/payments");
    await openFolio();
    await page.getByTestId("button-add-payment").click();
    await page.getByTestId("input-payment-amount-0").fill(expected.toFixed(2));
    if (!cashPayment) {
      await page.getByTestId("select-payment-method-0").click();
      await page.getByRole("option", { name: "Transferencia", exact: true }).click();
    }
    const recovered = page.waitForResponse(r => new URL(r.url()).pathname === "/api/payments" && r.request().method() === "POST");
    await page.getByTestId("button-confirm-payment").click();
    const recovery = await recovered;
    assert.equal(recovery.status(), 200);
    assert.equal(recovery.request().postDataJSON().paymentRequestId, paymentBody.paymentRequestId);
    const payment = await boundedJson(recovery);
    assert.equal((await request.post(origin + "/api/payments", { timeout: 12000, headers, data: { ...paymentBody, amount: "1" } })).status(), 409);
    assert.equal((await pool.query("SELECT count(*) FROM payments WHERE reservation_id=$1", [reservation.id])).rows[0].count, "1");
    assert.equal((await pool.query("SELECT count(*) FROM cash_movements WHERE payment_id=$1", [payment.id])).rows[0].count, "1");
    mark("lost payment response, reload and native retry preserve the operation identity and a single payment/Caja entry");
    if (screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: `${screenshotDir}/${installation.template}-folio-pagado.png` });
    }

    // Tomorrow's scheduled departure is intentionally absent from today's
    // departure list. Exercise the PMS's early-departure action in its folio.
    await page.getByTestId("button-early-checkout").click();
    const departed = page.waitForResponse(r => new URL(r.url()).pathname === `/api/reservations/${reservation.id}/check-out` && r.request().method() === "POST");
    await page.getByTestId("button-confirm-xenia-qa-checkout").click();
    const departure = await departed;
    assert.equal(departure.status(), 200);
    assert.equal((await (await request.get(origin + "/api/reservations/" + reservation.id)).json()).status, "checked_out");
    assert.equal(Number((await (await request.get(origin + `/api/reservations/${reservation.id}/folio`)).json()).balance), 0);
    assert.equal((await pool.query("SELECT count(*) FROM sales_invoices")).rows[0].count, "0");
    mark("native checkout at zero balance without issuing fiscal documents");

    await page.goto(origin + "/cash-register");
    await page.getByTestId("btn-close-shift-header-reception").click();
    if (cashPayment) {
      await page.getByText("Billetes $1.000", { exact: true }).locator("..").locator("input").fill("51");
      await page.getByText("Monedas ($)", { exact: true }).locator("..").locator("input").fill("250");
    }
    await page.getByTestId("select-closed-by-reception").click();
    await page.getByRole("option", { name: actorName, exact: true }).click();
    const closed = page.waitForResponse(r => new URL(r.url()).pathname === `/api/cash/shifts/${shift.id}/close`);
    await page.getByTestId("btn-confirm-close-shift-reception").click();
    const closeResponse = await closed;
    assert.equal(closeResponse.status(), 200);
    const closing = await boundedJson(closeResponse);
    assert.equal(Number(closing.summary.totalCash), cashPayment ? expected : 0);
    assert.equal(Number(closing.summary.totalTransfer), cashPayment ? 0 : expected);
    assert.equal(Number(closing.summary.totalGeneral), expected);
    assert.equal(Number(closeResponse.request().postDataJSON().efectivoContado) - Number(closing.summary.totalCash), 0);
    assert.equal(closing.shift.closedBy, actor.username);
    assert.equal((await pool.query("SELECT count(*) FROM cash_closing_summaries WHERE shift_id=$1", [shift.id])).rows[0].count, "1");
    mark("native cash count and shift closing reconcile exactly with the durable payment");
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/${installation.template}-cierre-caja.png` });
    for (const path of ["/api/billing/emit", "/api/billing/invoices", "/api/channex/ari/sync", "/api/cash/init-shifts",
      "/api/cash/movements", "/api/admin/init-cash-configs", "/api/system-users"])
      assert.equal((await request.post(origin + path, { timeout: 12000, headers, data: {} })).status(), 403, path);
    assert.equal((await request.post(origin + "/api/payments", { timeout: 12000, headers, data: { ...paymentBody,
      paymentRequestId: randomUUID(), invoiceData: { id: 1 } } })).status(), 400);
    mark("fiscal, integration, manual-Caja and administration writers remain blocked");
    if (screenshotDir) writeFileSync(`${screenshotDir}/${installation.template}-operaciones.json`, JSON.stringify({
      status: "passed", environment: "owned synthetic PostgreSQL; compiled PMS over local HTTPS; native Chromium UI",
      template: installation.template, revision, checks, roomTotal: 50000, consumptions: 1250, paid: expected,
      paymentMethod: cashPayment ? "cash" : "transfer", countedCash: cashPayment ? expected : 0,
      finalBalance: 0, cashDifference: 0, paymentCount: 1, fiscalDocuments: 0,
      actualHotelOperations: 0, providerCalls: 0, at: new Date().toISOString(),
    }, null, 2));
  } finally { await pool.end(); }
}
