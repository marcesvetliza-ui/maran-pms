import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const out='generated-artifacts/cash-closing-stress';await mkdir(out,{recursive:true});
const shift={id:'synthetic',area:'recepcion',shiftNumber:1,turnoTipo:'mañana',openedAt:'2026-11-16T08:52:00Z',closedAt:'2026-11-16T17:15:00Z',openedBy:'Operador de prueba',closedBy:'Operador de prueba',status:'closed'};
const movements=Array.from({length:130},(_,i)=>({id:i,createdAt:'2026-11-16T15:00:00Z',sourceType:'reservation',paymentMethod:i%2?'tarjeta_credito':'efectivo',amount:100+i,movementType:'income',documentClass:'fiscal',documentReference:`Factura B 0005-${String(i+1).padStart(8,'0')}`,description:`Reserva RES-1700000000000-${i} — Hab. ${i+100} — Apellido${String(i).padStart(3,'0')}, Nombre — Pago efectivo`}));
movements.push({...movements[0],id:131,description:'Egreso de control',movementType:'expense',amount:80});
movements.push({...movements[0],id:132,description:'Retención de control',movementType:'informational',paymentMethod:'retencion_iva',amount:500});
movements.push({...movements[0],id:133,description:'Anulado de control',anulado:true,motivoAnulacion:'Motivo de anulación de prueba',amount:999});
movements.push({...movements[0],id:134,description:'Descripción manual extensa '+('concepto completo para control '.repeat(100))+'FIN-COMPLETO',sourceType:'manual'});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:718,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5019/');await page.waitForFunction(()=>!!window.previewClosing);
 const html=await page.evaluate(data=>window.previewClosing(data),{shift,movements,systemCash:null,countedCash:null,snapshot:{totalGeneral:'5000',transactionCount:10,totalCash:'5000'}});
 await page.setContent(html.replace('<script>window.onload=function(){window.print();};</script>',''));
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('table.movements tbody tr').count(),movements.length);
 assert(await page.locator('header .total strong').innerText().then(t=>t.includes('5.000,00')),'Frozen closing total');
 assert(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Report must fit A4 printable width');
 await page.pdf({path:out+'/stress.pdf',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
 const verification=JSON.parse(execFileSync('python',['-c',`import fitz,json,sys
p=fitz.open(sys.argv[1]); texts=[page.get_text() for page in p]; text='\\n'.join(texts)
assert len(p)>1
assert all('Apellido / concepto' in t for t in texts[:-1])
assert all(text.count('Apellido'+str(i).zfill(3))==1 for i in range(130))
assert 'FIN-COMPLETO' in text and 'Motivo de anulación de prueba' in ' '.join(text.split())
assert 'RES-1700000000000' not in text
print(json.dumps({'pages':len(p),'verifiedGuestRows':130,'completeLongDescription':True,'cancelReasonPreserved':True}))`,out+'/stress.pdf'],{encoding:'utf8'}));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(verification));
}finally{await browser.close();}
