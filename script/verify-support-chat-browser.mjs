/** Actual chat component and native Send click; HTTP/assistant data are synthetic. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";
import { chromium } from "@playwright/test";

const root=fileURLToPath(new URL("..",import.meta.url));
const output=path.join(root,"generated-artifacts","support-chat-browser");
const sandbox=await mkdtemp(path.join(tmpdir(),"support-chat-browser-"));
let server,browser;
const checks={},pageErrors=[];
try{
  await mkdir(output,{recursive:true});
  await symlink(path.join(root,"node_modules"),path.join(sandbox,"node_modules"),"dir");
  await writeFile(path.join(sandbox,"index.html"),'<html lang="es"><head><meta charset="utf-8"><title>Prueba sintética de Soporte</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(path.join(sandbox,"main.tsx"),`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
    import {SupportChatPanel} from ${JSON.stringify('/@fs/'+path.join(root,'client/src/components/support-chat-panel.tsx'))};
    import ${JSON.stringify('/@fs/'+path.join(root,'client/src/index.css'))};
    const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
    function Harness(){
      const {data=[],isError}=useQuery({queryKey:['/api/programming-support/cases'],queryFn:async()=>{const r=await fetch('/api/programming-support/cases');return r.json();},refetchInterval:200});
      return <div style={{maxWidth:1200,margin:'20px auto',padding:20}}>
        <p style={{padding:12,background:'#fff3cd',marginBottom:16}}>Prueba sintética · Sin proveedor de IA ni datos del hotel</p>
        <SupportChatPanel config={{userId:'alice',canReview:false,canViewAll:false,proposalReview:true}} cases={data} ready casesError={isError}/>
      </div>;
    }
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
  `);
  server=await createServer({configFile:false,root:sandbox,cacheDir:path.join(sandbox,".vite-cache"),plugins:[react()],
    resolve:{alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')},dedupe:['react','react-dom']},
    css:{postcss:{plugins:[tailwind({config:path.join(root,'tailwind.config.ts')}),autoprefixer()]}},
    server:{host:'127.0.0.1',port:0,fs:{allow:[root,sandbox,await realpath(path.join(root,'node_modules'))]}},logLevel:'error'});
  await server.listen();
  const port=server.httpServer.address().port;
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1365,height:1000}});
  page.on('pageerror',error=>pageErrors.push(error.message));
  const cases=[],requests=[];let lost=true,work=0;
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(!url.pathname.startsWith('/api/programming-support'))return route.continue();
    const json=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    if(url.pathname.endsWith('/usage'))return json({day:'2026-11-20',renewsAt:'2026-11-21T03:00:00Z',dailyUsd:1,spentUsd:0,reservedUsd:0,remainingUsd:1,responsesUsed:0,responsesLimit:20,investigationsUsed:0,investigationsLimit:10,paused:false,reason:null});
    if(url.pathname.endsWith('/alerts')||url.pathname.endsWith('/usage/pending'))return json([]);
    if(url.pathname.endsWith('/cases'))return json(cases);
    if(url.pathname.endsWith('/chat')&&route.request().method()==='POST'){
      const body=route.request().postDataJSON();requests.push(body);
      if(!cases.length){
        work++;
        cases.push({id:'synthetic-case',title:body.text,createdBy:'alice',createdAt:'2026-11-20T10:00:00Z',updatedAt:'2026-11-20T10:03:00Z',module:'otro',actual:body.text,expected:'Orientación',steps:'',reference:'',page:'',environment:'pilot',version:'a'.repeat(40),status:'needs_info',report:null,lastError:null,conversational:true,
          messages:[{id:'user',author:'user',kind:'observation',text:body.text,createdAt:'2026-11-20T10:00:00Z'},
            {id:'answer',author:'assistant',kind:'diagnosis',reportId:'synthetic-report',revision:'a'.repeat(40),certainty:'hipotesis',text:'Respuesta sintética: vamos a revisar el mensaje de la pantalla.',createdAt:'2026-11-20T10:01:00Z'}],
          workflowEvents:[{id:'review',kind:'revise',candidateId:'synthetic-candidate',reportId:'synthetic-report',candidateKind:'proposal',digest:'a'.repeat(64),actor:'marcelo',comment:'Conservá la corrección que ya existe.',at:'2026-11-20T10:02:00Z'}],
          feedback:[{requestId:'synthetic-feedback',reportId:'synthetic-report',outcome:'unresolved',createdAt:'2026-11-20T10:03:00Z'}]});
      }
      if(lost){lost=false;return route.abort('failed');}
      return json(cases[0]);
    }
    return route.fulfill({status:404,body:'{}'});
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  const draft='Me apareció un mensaje al modificar una reserva';
  await page.getByLabel('Contanos qué pasó').fill(draft);
  await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Contanos qué pasó').inputValue(),draft);
  checks.draftAfterConnectionFailure=true;
  await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await page.getByText('Respuesta sintética: vamos a revisar el mensaje de la pantalla.',{exact:true}).waitFor();
  assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(work,1);
  checks.nativeSend=true;checks.idempotentRetry=true;
  assert.deepEqual(await page.locator('[data-timeline-kind]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-timeline-kind'))),['message','message','decision','feedback']);
  await page.getByText('Asistente · Hipótesis',{exact:true}).waitFor();
  await page.getByText('Ajustes solicitados',{exact:true}).waitFor();
  checks.unifiedChronology=true;
  await page.reload();
  await page.getByRole('button',{name:draft}).click();
  await page.getByText('Respuesta sintética: vamos a revisar el mensaje de la pantalla.',{exact:true}).waitFor();
  assert.equal(requests.length,2);assert.equal(work,1);
  checks.reloadWithoutNewWork=true;
  await page.screenshot({path:path.join(output,'Soporte_Chat_Sintetico.png'),fullPage:true});
  assert.deepEqual(pageErrors,[]);
  await writeFile(path.join(output,'resultado.json'),JSON.stringify({kind:'synthetic-browser-verification',checks,backend:'HTTP fixture',provider:'none',paidCalls:0,hotelOperations:false,requests:requests.length,syntheticWorkItems:work,pageErrors},null,2)+'\n');
  console.log(JSON.stringify({output,checks,paidCalls:0}));
}finally{
  await browser?.close();await server?.close();await rm(sandbox,{recursive:true,force:true});
}
