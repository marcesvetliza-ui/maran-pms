export async function fetchReportJson(url: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`No se pudo consultar el reporte (${response.status}).`);
  const data = await response.json();
  if (!data || typeof data !== "object" || "error" in data) throw new Error("La respuesta del reporte no es válida.");
  return data;
}
