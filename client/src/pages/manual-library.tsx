import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, ExternalLink, Lock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManualTopic } from "@shared/manual-library";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const label = (kind: string) => kind === "manual" ? "Manual completo" : "Guía rápida";

export default function ManualLibraryPage() {
  const { data: topics = [], isLoading, error, refetch } = useQuery<ManualTopic[]>({ queryKey: ["/api/manuals"] });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ topic: ManualTopic; kind: string } | null>(null);
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  const filtered = topics.filter(topic => terms.every(term => normalize(`${topic.title} ${topic.keywords}`).includes(term)));
  // Derive selection from the current authorized catalog, so a refetch that
  // revokes access also removes the embedded reader.
  const active = selected && topics.some(topic => topic.id === selected.topic.id) ? selected : null;
  const url = active ? `/api/manuals/${active.topic.id}/${active.kind}` : "";

  return <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
    <header>
      <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen aria-hidden="true" />Manuales y ayuda</h1>
      <p className="text-muted-foreground mt-1">Consultá una guía rápida o el manual completo de cada área.</p>
    </header>
    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
      <strong>Borradores en revisión · Edición 1, octubre de 2026.</strong>
      <p>Los documentos están pendientes de validación operativa. Consultá al responsable del área si un paso no coincide con la pantalla o el procedimiento vigente.</p>
    </div>
    <div className="relative">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input className="pl-9" aria-label="Buscar manuales" placeholder="Buscar por área o tema: reservas, retenciones, camaje…" value={search} onChange={event => setSearch(event.target.value)} />
    </div>
    {isLoading && <p role="status">Cargando biblioteca…</p>}
    {error && <div role="alert">No se pudo cargar la biblioteca. <Button variant="outline" onClick={() => refetch()}>Reintentar</Button></div>}
    {!isLoading && !error && <p className="text-sm text-muted-foreground" role="status">{filtered.length} temas disponibles. La búsqueda incluye títulos y palabras clave.</p>}
    {active && <section className="rounded-lg border overflow-hidden" aria-label="Lector de documentos">
      <div className="p-3 flex flex-wrap items-center gap-2 border-b">
        <h2 className="font-semibold flex-1">{active.topic.title} · {label(active.kind)}</h2>
        <Button variant="outline" asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Abrir PDF</a></Button>
        <Button variant="outline" asChild><a href={`${url}?download=1`}><Download className="h-4 w-4 mr-2" />Descargar</a></Button>
        <Button variant="ghost" aria-label="Cerrar lector" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
      </div>
      <p className="text-sm text-muted-foreground p-3">Si el visor de tu dispositivo no muestra todas las páginas, usá “Abrir PDF” o “Descargar”.</p>
      <iframe key={url} title={`${active.topic.title} · ${label(active.kind)}`} src={url} className="w-full h-[65vh] bg-muted" />
    </section>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map(topic => <article key={topic.id} className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold flex gap-2 items-center">{topic.restricted && <Lock className="h-4 w-4 shrink-0" aria-label="Acceso restringido" />}{topic.title}</h2>
        <p className="text-sm text-muted-foreground">{topic.keywords}</p>
        <p className="text-xs text-muted-foreground">Edición 1 · {topic.updatedAt.split("-").reverse().join("/")} · {topic.status}</p>
        {(["guia-rapida", "manual"] as const).map(kind => <div key={kind} className="flex items-center gap-2">
          <Button variant={kind === "guia-rapida" ? "default" : "outline"} className="flex-1" onClick={() => { setSelected({ topic, kind }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{label(kind)} · {topic.documents.find(document => document.kind === kind)?.pages} pág.</Button>
          <Button variant="ghost" size="icon" asChild><a href={`/api/manuals/${topic.id}/${kind}?download=1`} aria-label={`Descargar ${label(kind)} de ${topic.title}`}><Download className="h-4 w-4" /></a></Button>
        </div>)}
      </article>)}
    </div>
    {!isLoading && !error && filtered.length === 0 && <p>No hay temas que coincidan. Probá con otra palabra.</p>}
  </main>;
}
