import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const data=JSON.parse(await readFile(process.argv[2],'utf8'));
const output=process.argv[3]||'generated-artifacts/cash-closing';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:718,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5019/');await page.waitForFunction(()=>!!window.previewClosing);
 const html=await page.evaluate(data=>window.previewClosing(data),data);
 assert(!/\b(?:RES-\d{6,}(?:-\d+)?|RS-\d+|CHX-[a-f0-9-]{36})\b/i.test(html),'Reservation codes must not inflate print labels');
 await writeFile(output+'/cierre-compacto.html',html);
 await page.setContent(html.replace('<script>window.onload=function(){window.print();};</script>',''),{waitUntil:'load'});
 await page.emulateMedia({media:'print'});
 const total=await page.locator('header .total strong').innerText();
 const count=await page.locator('table.movements tbody tr').count();
 assert.equal(count,data.movements.length,'Every movement must appear exactly once');
 assert(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal clipping');
 await page.pdf({path:output+'/cierre-compacto.pdf',format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
 await page.screenshot({path:output+'/cierre-compacto.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({output,total,movements:count}));
}finally{await browser.close();}
