import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {SpaFundingGate} from "../../client/src/components/spa/spa-funding-gate";
import "../../client/src/index.css";
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Demo(){
 const [scenarios,setScenarios]=useState<Array<{id:string;title:string}>>([]);
 const [id,setId]=useState("");const [error,setError]=useState("");
 useEffect(()=>{void(async()=>{
  const health=await fetch("/api/demo/health").then(r=>r.json());
  if(health?.data?.synthetic!==true||health.data.productionEnabled!==false||health.data.emitter!=="fake")throw new Error("Sólo admite bindings sintéticos aislados.");
  const catalog=await fetch("/api/demo/scenarios").then(r=>r.json());setScenarios(catalog.data);
 })().catch(e=>setError(e.message));},[]);
 return <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
  <h1 className="text-xl font-bold">SPA · Integración aislada</h1>
  <p className="rounded border p-3">Datos sintéticos · Preparación, caja y stock en PostgreSQL local · Emisor simulado · Sin ARCA real.</p>
  {error&&<p role="alert">{error}</p>}
  <label>Escenario<select className="ml-2 rounded border bg-background p-2" aria-label="Escenario" value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar</option>{scenarios.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
  {id&&<SpaFundingGate key={id} enabled accountId={id} userId="connected-reviewer" canWrite canAdopt><p>Cuenta sin vincular</p></SpaFundingGate>}
 </main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><Demo/></QueryClientProvider>);
