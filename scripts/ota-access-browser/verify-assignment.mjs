import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='generated-artifacts/ota-assignment';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
try{
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5018/?role=admin');await page.getByRole('table').waitFor();
  await page.getByRole('button',{name:'Asignar al PMS',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText('Premium del canal',{exact:true}).waitFor();
  await dialog.getByLabel('Categoría en PMS 1').selectOption('suite');await dialog.getByLabel('Habitación disponible 1').selectOption('501');
  await dialog.getByLabel('Motivo de la asignación').fill('Mejora de categoría solicitada por el hotel');
  assert(await dialog.getByRole('button',{name:'Confirmar asignación al PMS'}).isDisabled());
  await dialog.getByRole('checkbox',{name:/Confirmo que asigno/}).check();assert(await dialog.getByRole('button',{name:'Confirmar asignación al PMS'}).isDisabled());
  await dialog.getByRole('checkbox',{name:/Confirmo esta/}).check();assert(await dialog.getByRole('button',{name:'Confirmar asignación al PMS'}).isEnabled());
  assert.equal(await page.evaluate(()=>window.__otaRequests.filter(r=>r.method!=='GET').length),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page must fit viewport');
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Assignment must fit dialog');
  await page.screenshot({path:`${out}/confirmation-${width}.png`,fullPage:true});
  await dialog.getByRole('button',{name:'Confirmar asignación al PMS'}).click();await dialog.getByRole('link',{name:/Ver reserva en PMS RES-SYNTHETIC/}).waitFor();
  const writes=await page.evaluate(()=>window.__otaRequests.filter(r=>r.method!=='GET'));
  assert.equal(writes.length,1);assert.deepEqual(writes[0].body.assignments,{remote:'501'});assert.equal(writes[0].body.confirmCategoryChange,true);assert.equal(writes[0].body.confirmScopeChange,true);
  await page.close();
 }
 const readonly=await browser.newPage();await readonly.goto('http://127.0.0.1:5018/?role=reception');await readonly.getByRole('table').waitFor();assert.equal(await readonly.getByRole('button',{name:'Asignar al PMS',exact:true}).count(),0);await readonly.close();
 assert.deepEqual(errors,[]);console.log('Assignment browser checks passed: category/source warning, both confirmations, exact preserved amount, no write before confirmation, role and viewport 1440/768/390px.');
}finally{await browser.close();}
