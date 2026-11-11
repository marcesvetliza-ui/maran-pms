import { pathToFileURL } from "node:url";

export async function waitForRevision(baseUrl, expected, {
  fetcher = fetch,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 90,
  maxWaitMs = 15 * 60 * 1000,
  now = Date.now,
  report = message => console.log(message),
} = {}) {
  if (!/^[0-9a-f]{40}$/i.test(expected || "")) throw new Error("Se requiere la revisión Git completa esperada.");
  const deadline = now() + maxWaitMs;
  let last = "sin respuesta", previous;
  for (let attempt = 0; attempt < attempts && now() < deadline; attempt++) {
    try {
      const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/health?expected=${expected}&check=${now()}`, {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - now()))),
      });
      const health = await response.json();
      last = `HTTP ${response.status}; revisión=${health.revision || "ausente"}; estado=${health.status || "ausente"}; base=${health.database || "ausente"}; esquema financiero=${health.financialReady ?? "ausente"}`;
      if (response.ok && health.status === "ok" && health.database === "ok" && health.revision === expected && health.financialReady !== false) return health;
    } catch (error) {
      last = `No se pudo verificar /api/health (${error?.name || "Error"})`;
    }
    if (last !== previous || attempt % 6 === 0) { report(`Esperando despliegue (${attempt + 1}/${attempts}): ${last}`); previous = last; }
    if (attempt + 1 < attempts && now() < deadline) await pause(Math.min(10000, deadline - now()));
  }
  throw new Error(`El sitio no confirmó una versión sana en la revisión ${expected}. Último resultado: ${last}. No se ejecutan pruebas sobre una versión anterior.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  waitForRevision(process.argv[2], process.argv[3]).then(result => console.log(`Versión verificada: ${result.revision}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
