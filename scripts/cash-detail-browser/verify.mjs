import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const out = "generated-artifacts/cash-detail-review/evidence";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/repl/tools/bin/chromium",
  headless: true, args: ["--no-sandbox"],
});
const results = [];
const errors = [];
const warnings = new Set();
try {
  for (const [width, height] of [[1920, 1080], [1366, 768], [768, 1024], [390, 844]]) {
    for (const baseline of [true, false]) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") warnings.add(m.text().split("\n")[0]); });
      await page.goto(`http://127.0.0.1:5012/?auto${baseline ? "&baseline" : ""}`);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(350);
      const geometry = await dialog.evaluate(el => ({
        width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
        clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      }));
      await page.screenshot({ path: `${out}/${baseline ? "before" : "after"}-${width}x${height}.png` });
      if (!baseline) {
        assert(geometry.width <= width && geometry.width > width * (width > 1800 ? .85 : .94));
        assert(geometry.height <= height * .945);
        assert(geometry.scrollWidth <= geometry.clientWidth + 1, "No modal-wide horizontal overflow");
        const body = page.getByTestId("cash-detail-scroll");
        assert(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "No body horizontal overflow");
        const headerTop = await page.getByRole("heading", { name: "Detalle del Turno", exact: true }).evaluate(el => el.getBoundingClientRect().top);
        const print = page.getByRole("button", { name: "Imprimir detalle" });
        await print.focus();
        await page.waitForTimeout(150);
        assert.equal(await page.getByRole("heading", { name: "Detalle del Turno", exact: true }).evaluate(el => el.getBoundingClientRect().top), headerTop);
        const printBox = await print.boundingBox();
        assert(printBox.y > headerTop && printBox.y + printBox.height < height, "Focused print button visible");
        const cancelled = page.getByRole("region", { name: "Tickets cancelados del turno" });
        const hourHeader = cancelled.locator("th").first();
        assert((await hourHeader.boundingBox()).width > 60, "Cancelled table columns remain readable");
        assert(await cancelled.evaluate(el => el.scrollWidth <= el.clientWidth + 1) || width < 1000, "No unnecessary desktop cancelled table overflow");
        await page.screenshot({ path: `${out}/after-bottom-${width}x${height}.png` });
        await page.keyboard.press("Tab");
        assert(await dialog.evaluate(el => el.contains(document.activeElement)), "TAB remains inside dialog");
        await page.keyboard.press("Shift+Tab");
        assert(await dialog.evaluate(el => el.contains(document.activeElement)), "Shift+TAB remains inside dialog");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "btn-view-detail-fixture-summary");
        await page.getByTestId("btn-view-detail-fixture-summary").click();
        await dialog.waitFor();
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await dialog.waitFor({ state: "detached" });
        assert.equal(await page.locator("body").getAttribute("data-attempted-write"), null);
      }
      results.push({ baseline, width, height, geometry, passed: true });
      await page.close();
    }
  }
  for (const area of ["reception", "restaurant", "spa", "events"]) {
    for (const status of ["open", "closed"]) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:5012/?auto&area=${area}&status=${status}`);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(250);
      assert.equal(await dialog.getByRole("row").filter({ has: page.locator("td") }).count() >= 48, true);
      assert.equal(await dialog.getByRole("button", { name: "Imprimir detalle" }).count(), status === "closed" ? 1 : 0);
      if (status === "open") await page.getByText("Este turno todavía no tiene resumen de cierre.").waitFor();
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      if (status === "open" && area === "restaurant") await page.screenshot({ path: `${out}/after-open-1366x768.png` });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(await page.locator("body").getAttribute("data-attempted-write"), null);
      results.push({ area, status, passed: true });
      await page.close();
    }
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
} finally {
  await writeFile(`${out}/browser-results.json`, JSON.stringify({ results, errors, warnings: [...warnings] }, null, 2));
  await browser.close();
}
console.log(`PASS: ${results.length} scenarios. No writes. Evidence in ${out}`);
