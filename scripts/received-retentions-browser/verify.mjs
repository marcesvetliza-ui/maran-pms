import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'generated-artifacts/received-retentions';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], results = [];
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5015/?tab=retenciones');
    await page.getByText('Total vigente: $ 64.197.530,28').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page-wide horizontal overflow');
    const tab = page.getByRole('tab', { name: 'Retenciones', exact: true });
    const tabBox = await tab.boundingBox(); assert(tabBox.x >= 0 && tabBox.x + tabBox.width <= width);
    await page.screenshot({ path: `${out}/retenciones-${width}.png`, fullPage: true });
    await page.getByLabel('Desde', { exact: true }).fill('2026-11-01');
    await page.getByLabel('Hasta', { exact: true }).fill('2026-11-01');
    await page.getByLabel('Proveedor / agente', { exact: true }).fill('jose');
    await page.getByLabel('CUIT', { exact: true }).fill('30012345678');
    assert(await page.getByRole('button', { name: 'Descargar Excel' }).isDisabled());
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await page.getByText('26 retenciones en el resultado · 26 vigentes').waitFor();
    await page.getByRole('button', { name: 'Descargar Excel' }).waitFor();
    assert(await page.getByRole('button', { name: 'Descargar Excel' }).isEnabled());
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByText('Página 2 de 2 · Hasta 50 por página').waitFor();
    assert.equal(await page.getByRole('table').locator('tbody tr').count(), 2);
    assert.equal(await page.locator('body').getAttribute('data-attempted-write'), null);
    results.push({ width, passed: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await writeFile(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
console.log(`PASS ${results.length} tamaños, filtros y paginación; sin escrituras`);
