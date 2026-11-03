import { pathToFileURL } from "node:url";

export async function waitForRevision(baseUrl, expected, { fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 42 } = {}) {
  if (!/^[0-9a-f]{40}$/i.test(expected || "")) throw new Error("Se requiere la revisión Git completa esperada.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/health?expected=${expected}&check=${Date.now()}`, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10000) });
      const health = await response.json();
      if (response.ok && health.status === "ok" && health.database === "ok" && health.revision === expected && health.financialReady !== false) return health;
    } catch { /* unavailable, old, or malformed responses never satisfy deployment */ }
    if (attempt + 1 < attempts) await pause(10000);
  }
  throw new Error(`El sitio no confirmó una versión sana en la revisión ${expected}. No se ejecutan pruebas sobre una versión anterior.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  waitForRevision(process.argv[2], process.argv[3]).then(result => console.log(`Versión verificada: ${result.revision}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
