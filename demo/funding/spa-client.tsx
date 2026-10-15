import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SpaFundingPanel } from "../../client/src/components/spa/spa-funding-panel";
import "../../client/src/index.css";

function Demo() {
  const [scenarios, setScenarios] = useState<Array<{ id: string; title: string; request: { newCollections: Array<{ shiftId: string }> } }>>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const response = await fetch("/api/demo/health");
    const health = await response.json();
    if (!response.ok || health?.data?.synthetic !== true || health.data.productionEnabled !== false || health.data.emitter !== "fake")
      throw new Error("Esta pantalla sólo admite el servidor sintético aislado.");
    const responseScenarios = await fetch("/api/demo/scenarios");
    if (!responseScenarios.ok) throw new Error("No se pudieron cargar los escenarios sintéticos.");
    const catalog = await responseScenarios.json();
    setScenarios(catalog.data.filter((item: { id: string }) => item.id.startsWith("spa-")));
  })().catch(e => setError(e.message)); }, []);
  const scenario = scenarios.find(item => item.id === selected);
  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
    <h1 className="text-xl font-bold">Revisión aislada · Financiación SPA</h1>
    <p className="rounded border p-3">Datos sintéticos · Emisor simulado · Sin conexión a ARCA ni a la base operativa.</p>
    {error && <p role="alert">{error}</p>}
    <label>Escenario sintético<select className="ml-3 rounded border bg-background p-2" aria-label="Escenario sintético" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Elegir escenario</option>{scenarios.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    {scenario && <SpaFundingPanel key={scenario.id} accountId={scenario.id} userId="synthetic-reviewer" canWrite
      collectionShifts={scenario.request.newCollections.map(row => ({ id: row.shiftId, label: "Turno SPA sintético verificado" }))} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Demo />);
