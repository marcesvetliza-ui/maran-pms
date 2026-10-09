import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supportLabels, type SupportTicket } from "@shared/programming-support";
import { Code2, Plus, RefreshCw } from "lucide-react";
import { formatHotelDateTime } from "@/lib/hotelTime";

export default function ProgrammingSupport() {
  const cache = useQueryClient();
  const { data: config, isError: configError } = useQuery<{
    enabled: boolean;
    configured: boolean;
    version: string | null;
  }>({ queryKey: ["/api/programming-support/config"] });
  const ready = config?.enabled && config?.configured;
  const { data: cases = [], isError } = useQuery<SupportTicket[]>({
    queryKey: ["/api/programming-support/cases"],
    enabled: !!ready,
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    module: "otro",
    actual: "",
    expected: "",
    steps: "",
    reference: "",
    page: "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ticket = cases.find((c) => c.id === selected);
  const pending = useRef<{ key: string; id: string } | null>(null);
  async function send(path: string, body: unknown) {
    const { requestId: ignored, ...data } = body as Record<string, unknown>;
    const key = JSON.stringify({ path, data });
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    body = { ...data, requestId: pending.current.id };
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest(
        "POST",
        `/api/programming-support/cases${path}`,
        body,
      );
      const saved: SupportTicket = await response.json();
      pending.current = null;
      setSelected(saved.id);
      setCreating(false);
      setMessage("");
      await cache.invalidateQueries({
        queryKey: ["/api/programming-support/cases"],
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Podés volver a intentarlo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Code2 />
            Soporte del sistema
          </h1>
          <p className="mt-1 text-muted-foreground">
            Consultas, diagnósticos y propuestas de mejora
          </p>
        </div>
        <Button
          disabled={!ready || busy}
          onClick={() => {
            setCreating(true);
            setSelected(null);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nueva consulta
        </Button>
      </div>
      <div className="rounded-xl border bg-blue-50 p-4 text-sm text-blue-950 dark:bg-blue-950 dark:text-blue-100">
        Piloto: el asistente lee el código y propone una solución. No ejecuta
        pruebas ni aplica cambios. Escribí referencias internas; evitá nombres
        de huéspedes, documentos, contraseñas y datos de tarjetas.
      </div>
      {!ready && (
        <Card>
          <CardHeader>
            <CardTitle>Falta conectar el asistente</CardTitle>
          </CardHeader>
          <CardContent>
            El servicio se configura por separado en Railway. Las consultas
            estarán disponibles cuando esté conectado y habilitado en la demo.
          </CardContent>
        </Card>
      )}
      {(isError || configError) && (
        <p role="alert">
          No se pudo conectar con soporte. Podés actualizar esta página.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 p-3 text-red-700"
        >
          {error}
        </p>
      )}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Contanos qué ocurrió</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send("", { ...form, requestId: crypto.randomUUID() });
              }}
            >
              <label className="block text-sm font-medium">
                Título
                <Input
                  required
                  minLength={5}
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium">
                Módulo
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  value={form.module}
                  onChange={(e) => setForm({ ...form, module: e.target.value })}
                >
                  {[
                    "recepcion",
                    "administracion",
                    "facturacion",
                    "grupos",
                    "inventario",
                    "restaurant",
                    "spa",
                    "otro",
                  ].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["actual", "Qué ocurrió", 10, 4000],
                  ["expected", "Qué esperabas", 5, 2000],
                  ["steps", "Pasos para llegar al problema", 0, 4000],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key} className="block text-sm font-medium">
                  {label}
                  <Textarea
                    required={min > 0}
                    minLength={min}
                    maxLength={max}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label className="block text-sm font-medium">
                Referencia interna (opcional)
                <Input
                  maxLength={200}
                  value={form.reference}
                  onChange={(e) =>
                    setForm({ ...form, reference: e.target.value })
                  }
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>Guardar consulta</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreating(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelected(c.id);
                setCreating(false);
              }}
              className={`w-full rounded-xl border p-4 text-left ${selected === c.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "bg-card"}`}
            >
              <span className="block font-medium">{c.title}</span>
              <Badge variant="secondary" className="my-2">
                {supportLabels[c.status]}
              </Badge>
              <span className="block text-xs text-muted-foreground">
                {formatHotelDateTime(c.updatedAt)}
              </span>
            </button>
          ))}
          {ready && !cases.length && !creating && (
            <p className="text-muted-foreground">
              Todavía no hay consultas. Creá una para empezar.
            </p>
          )}
        </div>
        {ticket && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{ticket.title}</CardTitle>
                <Badge>{supportLabels[ticket.status]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <h2 className="font-medium">Qué ocurrió</h2>
                <p className="whitespace-pre-wrap text-sm">{ticket.actual}</p>
              </div>
              <div>
                <h2 className="font-medium">Qué esperabas</h2>
                <p className="whitespace-pre-wrap text-sm">{ticket.expected}</p>
              </div>
              {ticket.lastError && <p role="alert">{ticket.lastError}</p>}
              <Button
                disabled={
                  busy ||
                  ["queued", "investigating", "closed"].includes(ticket.status)
                }
                onClick={() =>
                  void send(`/${ticket.id}/analyze`, {
                    requestId: crypto.randomUUID(),
                  })
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {ticket.report
                  ? "Investigar otra vez"
                  : "Solicitar diagnóstico"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Al solicitarlo, se envía el contenido de la consulta al modelo
                de OpenAI. El diagnóstico aparecerá acá.
              </p>
              {ticket.report && (
                <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                  <h2 className="text-lg font-semibold">
                    Diagnóstico y propuesta
                  </h2>
                  <Badge variant="outline">
                    {ticket.report.certainty.replaceAll("_", " ")}
                  </Badge>
                  {(
                    [
                      ["Resumen", ticket.report.summary],
                      ["Causa posible", ticket.report.cause],
                      ["Solución propuesta", ticket.report.proposal],
                      ["Datos históricos", ticket.report.dataRepair],
                    ] as const
                  ).map(
                    ([label, value]) =>
                      value && (
                        <section key={label}>
                          <h3 className="font-medium">{label}</h3>
                          <p className="whitespace-pre-wrap text-sm">{value}</p>
                        </section>
                      ),
                  )}
                  {(
                    [
                      [
                        "Pruebas propuestas — sin ejecutar",
                        ticket.report.proposedTests,
                      ],
                      ["Información que falta", ticket.report.questions],
                      [
                        "Alcance de este diagnóstico",
                        ticket.report.limitations,
                      ],
                    ] as const
                  ).map(
                    ([label, items]) =>
                      items.length > 0 && (
                        <section key={label}>
                          <h3 className="font-medium">{label}</h3>
                          <ul className="list-disc space-y-1 pl-5 text-sm">
                            {items.map((v, i) => (
                              <li key={i}>{v}</li>
                            ))}
                          </ul>
                        </section>
                      ),
                  )}
                  <details>
                    <summary className="cursor-pointer font-medium">
                      Evidencia consultada
                    </summary>
                    <p className="text-xs text-muted-foreground">
                      Revisión {ticket.version}
                    </p>
                    {ticket.report.evidence.map((r, i) => (
                      <p key={i} className="mt-2 break-all text-sm">
                        {r.path}:{r.start}–{r.end}
                        <br />
                        {r.explanation}
                      </p>
                    ))}
                  </details>
                </div>
              )}
              <section className="space-y-3">
                <h2 className="font-medium">Seguimiento</h2>
                {ticket.messages?.map((m) => (
                  <p
                    key={m.id}
                    className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm"
                  >
                    {m.text}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatHotelDateTime(m.createdAt)}
                    </span>
                  </p>
                ))}
                <label className="block text-sm">
                  Agregar información
                  <Textarea
                    maxLength={4000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    message.trim().length < 2 ||
                    ["queued", "investigating"].includes(ticket.status)
                  }
                  onClick={() =>
                    void send(`/${ticket.id}/messages`, {
                      text: message,
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  Guardar mensaje
                </Button>
              </section>
              <Button
                variant="outline"
                disabled={
                  busy ||
                  ["queued", "investigating", "closed"].includes(ticket.status)
                }
                onClick={() =>
                  void send(`/${ticket.id}/close`, {
                    requestId: crypto.randomUUID(),
                  })
                }
              >
                Cerrar consulta
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
