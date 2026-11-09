import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CodeSource} from '../../services/programming-assistant/source';
let fixture:string|undefined;
afterEach(async()=>{if(fixture)await rm(fixture,{recursive:true,force:true});fixture=undefined;});
it('resolves the router rather than selecting a similarly named page',async()=>{
 fixture=await mkdtemp(path.join(tmpdir(),'support-screen-'));await mkdir(path.join(fixture,'client/src/pages'),{recursive:true});
 await writeFile(path.join(fixture,'client/src/App.tsx'),'const StockPage = lazy(() => import("@/pages/stock"));\nconst RecipePage = lazy(() => import("@/pages/recipe"));\n<Route path="/stock" component={StockPage} />\n<Route path="/recipe" component={RecipePage} />');
 await writeFile(path.join(fixture,'client/src/pages/stock.tsx'),'const load=async()=>{\nawait apiRequest("POST", "/api/stock/preview");\nthrow Error("No se puede cargar receta");\n};');
 await writeFile(path.join(fixture,'client/src/pages/recipe.tsx'),'throw Error("No se puede cargar receta");');
 const source=new CodeSource(fixture,'a'.repeat(40));const result=await source.screenContext('/stock','No se puede cargar receta');
 expect(result).toMatchObject({resolved:true,file:'client/src/pages/stock.tsx',endpoints:['/api/stock/preview']});
 expect(result.readings.every(ref=>source.validates(ref))).toBe(true);
 expect(source.readRanges.has('client/src/pages/recipe.tsx')).toBe(false);
 expect(await source.screenContext('/unregistered','receta')).toMatchObject({resolved:false});
 expect(await source.screenContext('/../../secret','receta')).toMatchObject({resolved:false});
});
it('locates the reported internal-consumption error and real preview endpoint in this revision',async()=>{
 const cases=JSON.parse(await readFile('services/programming-assistant/evaluation/codex-support-cases.json','utf8'));
 const item=cases.find((item:{id:string})=>item.id==='recipe-detail'),source=new CodeSource(process.cwd(),'a'.repeat(40));
 const result=await source.screenContext(item.page,item.title+'\n'+item.actual);
 expect(result.file).toBe('client/src/pages/inventory.tsx');expect(result.endpoints).toContain('/api/inventory/recipe-stock-preview');
 expect(result.readings.some(ref=>ref.content.includes('Error al cargar receta')&&ref.content.includes('recipe-stock-preview'))).toBe(true);
 expect(source.readRanges.has('client/src/pages/recetas-costos.tsx')).toBe(false);
 const route=await source.traceEndpoint('/api/inventory/recipe-stock-preview',{includeTests:false,method:'POST'});
 expect(route.handlers[0].path).toBe('server/inventoryStage2Routes.ts');
 expect(route.handlers[0].content).toContain('recipe-stock-preview');
});
it('locates the cash difference calculation instead of stopping at payment-method labels',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const result=await source.screenContext('/cash-register','Diferencia negativa en cierre de caja SPA. El sistema muestra efectivo esperado, conteo físico todavía en cero y diferencia negativa.');
 expect(result.file).toBe('client/src/pages/cash-register.tsx');
 expect(result.readings.some(ref=>ref.content.includes('efectivoContado - efectivoSistema'))).toBe(true);
 expect(result.readings.every(ref=>source.validates(ref))).toBe(true);
});
