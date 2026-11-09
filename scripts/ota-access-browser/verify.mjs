import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='generated-artifacts/ota-role-review';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
try{
 for(const role of ['admin','manager','reception']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:5018/?role=${role}`);await page.getByRole('heading',{name:'Canales OTAs',exact:true}).waitFor();
  if(role==='reception'){
   assert.equal(await page.getByRole('tab').count(),1);await page.getByText('Reserva de prueba',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:/webhook|Pausar recepción|Reintentar/}).count(),0);
  }else{await page.getByText('Tarifas de esta categoría',{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Permisos'}).count(),role==='admin'?1:0);}
  await page.screenshot({path:`${out}/${role}.png`,fullPage:true});await page.close();
 }
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5018/?role=admin');await page.getByRole('button',{name:'Calendario',exact:true}).click();
  await page.getByRole('button',{name:/2026-11-14:/}).waitFor();
  await page.getByRole('button',{name:/2026-11-14:/}).click();await page.getByRole('button',{name:/2026-11-16:/}).click();
  assert.equal(await page.getByLabel('Desde período 1',{exact:true}).inputValue(),'2026-11-14');
  assert.equal(await page.getByLabel('Hasta período 1',{exact:true}).inputValue(),'2026-11-16');
  assert.equal(await page.getByLabel('Acción de precio período 1',{exact:true}).count(),0);
  await page.getByLabel('Acción de precios por ocupación período 1',{exact:true}).selectOption('set');
  await page.getByLabel('Precio 1 personas período 1',{exact:true}).fill('150000');
  await page.getByLabel('Precio 2 personas período 1',{exact:true}).fill('170000');
  assert.equal(await page.evaluate(()=>window.__otaRequests.filter(r=>r.method!=='GET').length),0);
  await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();
  await page.getByRole('region',{name:'Revisión de cambios'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__otaRequests.filter(r=>r.url.endsWith('/apply')).length),0);
  await page.screenshot({path:`${out}/calendar-${width}.png`,fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page should not overflow');
  await page.getByRole('button',{name:'Confirmar cambios',exact:true}).click();
  await page.waitForFunction(()=>window.__otaRequests.some(r=>r.url.endsWith('/apply')));
  assert.equal(await page.evaluate(()=>window.__otaRequests.filter(r=>r.url.endsWith('/apply')).length),1);
  await page.close();
 }
 const matrix=await browser.newPage({viewport:{width:1440,height:1000}});await matrix.goto('http://127.0.0.1:5018/?matrix');await matrix.getByTestId('checkbox-permiso-reception-api:ota:read').waitFor();
 assert(await matrix.getByTestId('checkbox-permiso-admin-api:ota:config').isDisabled());
 await matrix.screenshot({path:`${out}/matrix.png`,fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browser checks passed: admin, manager, reception and role matrix');
}finally{await browser.close();}
