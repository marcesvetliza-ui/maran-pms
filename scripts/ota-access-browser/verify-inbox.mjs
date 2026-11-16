import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='generated-artifacts/ota-inbox';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
try{
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5018/?role=admin');await page.getByRole('table').waitFor();
  assert.equal(await page.getByRole('tab',{name:'Reservas recibidas'}).getAttribute('aria-selected'),'true');
  assert.equal(await page.getByRole('columnheader').count(),8);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Table must scroll inside its container');
  await page.screenshot({path:`${out}/table-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/Ver detalle de Reserva de prueba/}).click();
  await page.getByText('Llegada estimada después de las 22:00. Solicita habitación tranquila.').waitFor();
  await page.getByText(/Registrado: ARS 448.050,00/).waitFor();
  await page.screenshot({path:`${out}/detail-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByLabel('Buscar por huésped o referencia').fill('María');
  await page.getByLabel('Desde',{exact:true}).fill('2026-12-01');await page.getByLabel('Hasta',{exact:true}).fill('2026-12-31');
  await page.getByRole('button',{name:'Aplicar filtros'}).click();await page.getByRole('status').filter({hasText:'1 reservas'}).waitFor();
  assert.equal(await page.getByRole('row').count(),2);
  assert.equal(await page.evaluate(()=>window.__otaRequests.filter(r=>r.method!=='GET').length),0);
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('Inbox browser checks passed at 1440, 768 and 390px; table, detail, search and no writes.');
}finally{await browser.close();}
