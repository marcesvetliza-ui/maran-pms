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
 const matrix=await browser.newPage({viewport:{width:1440,height:1000}});await matrix.goto('http://127.0.0.1:5018/?matrix');await matrix.getByTestId('checkbox-permiso-reception-api:ota:read').waitFor();
 assert(await matrix.getByTestId('checkbox-permiso-admin-api:ota:config').isDisabled());
 await matrix.screenshot({path:`${out}/matrix.png`,fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browser checks passed: admin, manager, reception and role matrix');
}finally{await browser.close();}
