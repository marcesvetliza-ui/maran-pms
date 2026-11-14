import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Paperclip, Send, Plus, Loader2, X } from "lucide-react";
import type { SupportTicket } from "@shared/programming-support";
import type { SupportUsage, SupportAlert } from "@shared/support-chat";
import { supportReportText } from "@shared/support-report-presentation";
import { apiRequest, parseApiErrorPayload } from "@/lib/queryClient";
import { formatHotelDateTime } from "@/lib/hotelTime";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SupportChangeReview } from "./support-change-review";

type Config = {
  userId?: string;
  canReview?: boolean;
  canViewAll?: boolean;
  proposalReview?: boolean;
  workflowSimulation?: boolean;
};
type Screenshot = { name: string; dataUrl: string };
const money = (amount: number) =>
  `US$${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 2 })}`;
export async function supportScreenshot(file: File): Promise<Screenshot> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 10000000)
    throw Error("Elegí una captura PNG o JPEG de hasta 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.width ||
      !image.height ||
      image.width > 12000 ||
      image.height > 12000
    )
      throw Error("La captura tiene un tamaño no admitido.");
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("No se pudo preparar la captura.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (dataUrl.length > 666600)
      throw Error("La captura ocupa demasiado. Recortá la parte del problema.");
    return { name: file.name.slice(0, 100), dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function SavedImage({
  id,
  name,
  userId,
}: {
  id: string;
  name: string;
  userId?: string;
}) {
  const path = `/api/programming-support/images/${id}`;
  const { data, isError } = useQuery<{ dataUrl: string }>({
    queryKey: [path, userId],
    queryFn: async () => {
      const response = await apiRequest("GET", path);
      return response.json();
    },
    retry: false,
  });
  return data ? (
    <a
      href={data.dataUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block"
    >
      <img
        src={data.dataUrl}
        alt={name}
        className="max-h-60 max-w-full rounded border"
      />
    </a>
  ) : (
    <p className="text-xs">
      {isError ? "No se pudo cargar la captura." : "Cargando captura…"}
    </p>
  );
}

export function SupportChatPanel({
  config,
  cases,
  ready,
  casesError,
}: {
  config: Config;
  cases: SupportTicket[];
  ready: boolean;
  casesError: boolean;
}) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("case"),
  );
  const [text, setText] = useState("");
  const [image, setImage] = useState<Screenshot | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [dailyUsd, setDailyUsd] = useState("1");
  const [reason, setReason] = useState("");
  const [reconcileId, setReconcileId] = useState("");
  const [actualUsd, setActualUsd] = useState("");
  const [evidence, setEvidence] = useState("");
  const inFlight = useRef(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const admin = !!config.canReview && !!config.canViewAll;
  const usageKey = ["/api/programming-support/usage", config.userId];
  const { data: usage, isError: usageError } = useQuery<
    SupportUsage & { notificationConfigured?: boolean }
  >({
    queryKey: usageKey,
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/programming-support/usage");
      return r.json();
    },
    enabled: ready,
    refetchInterval: 15000,
    retry: false,
  });
  const { data: alerts = [] } = useQuery<SupportAlert[]>({
    queryKey: ["/api/programming-support/alerts", config.userId],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/programming-support/alerts");
      return r.json();
    },
    enabled: ready && admin,
    refetchInterval: 15000,
  });
  const { data: unverified = [] } = useQuery<
    Array<{
      id: string;
      day: string;
      reservedUsd: number;
      actualUsd: number | null;
    }>
  >({
    queryKey: ["/api/programming-support/usage/pending", config.userId],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        "/api/programming-support/usage/pending",
      );
      return r.json();
    },
    enabled: ready && admin,
    refetchInterval: 15000,
  });
  const ticket = cases.find((c) => c.id === selected);
  const owns = !ticket || ticket.createdBy === config.userId;
  useEffect(() => {
    if (usage) setDailyUsd(String(usage.dailyUsd));
  }, [usage?.dailyUsd]);
  useEffect(() => {
    thread.current?.scrollTo?.({
      top: thread.current.scrollHeight,
      behavior: "smooth",
    });
  }, [ticket?.id, ticket?.messages?.length, ticket?.status]);
  const working = ticket && ["queued", "investigating"].includes(ticket.status);
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["/api/programming-support/cases"] }),
      cache.invalidateQueries({ queryKey: ["/api/programming-support/usage"] }),
      cache.invalidateQueries({
        queryKey: ["/api/programming-support/alerts"],
      }),
      cache.invalidateQueries({
        queryKey: ["/api/programming-support/usage/pending"],
      }),
    ]);
  };
  async function post(
    path: string,
    fields: Record<string, unknown>,
    isMessage = false,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const key = JSON.stringify({ path, fields });
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    try {
      const response = await apiRequest(
        "POST",
        `/api/programming-support${path}`,
        { ...fields, requestId: pending.current.id },
      );
      const result = await response.json();
      pending.current = null;
      if (isMessage) {
        setSelected(result.id);
        setText("");
        setImage(null);
      }
      await refresh();
    } catch (error) {
      const payload = parseApiErrorPayload(error);
      setError(
        payload?.error ||
          "No se pudo confirmar el envío. Tu mensaje sigue acá; podés reintentar.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <MessageSquare />
            Soporte del sistema
          </h1>
          <p className="text-sm text-muted-foreground">
              Piloto de Xenia. Podés adjuntar una captura y seguir conversando
            en el mismo caso.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelected(null);
            setText("");
            setImage(null);
            setError("");
          }}
          disabled={busy}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nueva consulta
        </Button>
      </header>
      <div className="rounded-xl border bg-card p-4 text-sm">
        {usage ? (
          <>
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                Presupuesto compartido: {money(usage.dailyUsd)} por día
              </strong>
              <span>Disponible: {money(usage.remainingUsd)}</span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Consumido: {money(usage.spentUsd)}
              {usage.reservedUsd > 0
                ? ` · En respuestas en curso: ${money(usage.reservedUsd)}`
                : ""}
            </p>
            <p className="mt-1">
              Tus respuestas solicitadas: {usage.responsesUsed}/
              {usage.responsesLimit} · Investigaciones del hotel:{" "}
              {usage.investigationsUsed}/{usage.investigationsLimit}
            </p>
            <p className="text-xs text-muted-foreground">
              Los intentos iniciados también cuentan. Los cupos se renuevan a
              las 00:00 de Argentina.
            </p>
            {usage.paused && (
              <p
                role="status"
                className="mt-2 font-medium text-amber-800 dark:text-amber-300"
              >
                {usage.reason === "unreconciled"
                  ? "Asistente pausado hasta verificar el consumo pendiente."
                  : "Se alcanzó un cupo del asistente. Podés dejar tu consulta guardada para continuar después."}{" "}
                El PMS sigue funcionando.
              </p>
            )}
          </>
        ) : (
          <p>
            {usageError
              ? "No se pudo consultar el presupuesto. El servidor sigue controlando el consumo."
              : "Consultando disponibilidad del asistente…"}
          </p>
        )}
      </div>
      <details className="rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Qué puede hacer el asistente
        </summary>
        <p className="mt-2">
          Puede orientarte e investigar el código del sistema. Explica qué pudo
          comprobar y qué falta revisar. Los cambios se proponen para revisión
          humana.
        </p>
        <p className="mt-2">
          No modifica reservas, cobros, facturas, numeradores ni permisos. No
          ejecuta operaciones en ARCA ni publica cambios desde el chat. Evitá
          incluir contraseñas, claves fiscales, documentos o datos de tarjetas.
        </p>
      </details>
      {!ready && (
        <p role="status">Falta conectar y habilitar el asistente de Xenia.</p>
      )}
      {(error || casesError) && (
        <p
          role="alert"
          className="rounded border border-red-300 p-3 text-sm text-red-700"
        >
          {error || "No se pudieron cargar las conversaciones."}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <p className="text-sm font-medium">
            {config.canViewAll
              ? "Conversaciones del equipo"
              : "Mis conversaciones"}
          </p>
          {admin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewOnly((v) => !v)}
            >
              {reviewOnly ? "Ver todas" : "Pendientes de aprobación"}
            </Button>
          )}
          {cases
            .filter(
              (c) =>
                !reviewOnly || c.changeCandidate?.status === "awaiting_review",
            )
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  setText("");
                  setImage(null);
                  setError("");
                }}
                className={`block w-full rounded-xl border p-3 text-left ${selected === c.id ? "border-primary bg-primary/5" : "bg-card"}`}
              >
                <span className="block text-sm font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatHotelDateTime(c.updatedAt)}
                </span>
                {c.changeCandidate?.status === "awaiting_review" && (
                  <span className="block text-xs text-blue-700 dark:text-blue-300">
                    Propuesta pendiente de revisión
                  </span>
                )}
                {["queued", "investigating"].includes(c.status) && (
                  <span className="block text-xs">Preparando respuesta…</span>
                )}
              </button>
            ))}
          {!cases.length && (
            <p className="text-sm text-muted-foreground">
              Tu primera consulta aparecerá acá.
            </p>
          )}
        </aside>
        <main className="min-w-0 rounded-xl border bg-card p-4">
          <h2 className="mb-4 font-semibold">
            {ticket?.title || "¿En qué te podemos ayudar?"}
          </h2>
          {selected && !ticket && (
            <p role="status" className="mb-4 text-sm">
              Cargando el caso, o no está disponible para tu usuario.
            </p>
          )}
          <div
            ref={thread}
            className="max-h-[65vh] space-y-4 overflow-y-auto pr-1"
            aria-live="polite"
          >
            {ticket && !ticket.conversational && (
              <div className="rounded-xl bg-muted p-3 text-sm">
                <strong>Consulta inicial</strong>
                <p className="whitespace-pre-wrap">{ticket.actual}</p>
                <p className="whitespace-pre-wrap">
                  Esperaba: {ticket.expected}
                </p>
              </div>
            )}
            {ticket?.messages?.map((message) => (
              <article
                key={message.id}
                className={`max-w-[95%] rounded-xl p-3 text-sm ${message.author === "user" ? "ml-auto bg-primary/10" : "bg-muted"}`}
              >
                <p className="mb-1 text-xs font-semibold">
                  {message.author === "user"
                    ? owns
                      ? "Vos"
                      : "Colaborador"
                    : message.author === "assistant"
                      ? "Asistente"
                      : "Sistema"}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {message.text}
                </p>
                {message.images?.map((i) => (
                  <SavedImage key={i.id} {...i} userId={config.userId} />
                ))}
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatHotelDateTime(message.createdAt)}
                </p>
              </article>
            ))}
            {working && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                El asistente está revisando tu consulta…
              </p>
            )}
            {ticket?.lastError && (
              <p
                role="status"
                className="rounded border border-amber-300 p-3 text-sm"
              >
                {ticket.lastError}
              </p>
            )}
          </div>
          {ticket?.report && (
            <details className="my-4 rounded border p-3 text-sm">
              <summary className="cursor-pointer">
                {ticket.reportStale
                  ? "Ver diagnóstico anterior"
                  : "Ver diagnóstico y evidencia"}
              </summary>
              <p className="mt-2 whitespace-pre-wrap">
                {supportReportText(ticket.report.cause)}
              </p>
              <p className="mt-2 whitespace-pre-wrap">
                {supportReportText(ticket.report.proposal)}
              </p>
              {ticket.report.evidence.map((e, i) => (
                <p key={i} className="mt-2 break-words text-xs">
                  {e.path}:{e.start} · {e.explanation}
                </p>
              ))}
              {ticket.report.limitations.map((l, i) => (
                <p key={i} className="mt-2 text-xs">
                  {l}
                </p>
              ))}
            </details>
          )}
          {ticket && (
            <div className="my-4">
              <SupportChangeReview
                ticket={ticket}
                canReview={!!config.canReview}
                simulation={false}
                proposalReview={!!config.proposalReview}
                busy={busy}
                onDecision={(fields) =>
                  void post(`/cases/${ticket.id}/decision`, fields)
                }
              />
            </div>
          )}
          {ticket?.status === "closed" ? (
            <p className="mt-4 text-sm">
              Este caso está cerrado. Podés abrir una nueva consulta.
            </p>
          ) : (
            <form
              className="mt-5 space-y-3 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void post(
                  ticket ? `/cases/${ticket.id}/chat` : "/chat",
                  { text, images: image ? [image] : [] },
                  true,
                );
              }}
            >
              <label className="block text-sm font-medium">
                {ticket ? "Tu mensaje" : "Contanos qué pasó"}
                <Textarea
                  className="mt-2 min-h-28"
                  maxLength={4000}
                  placeholder="Por ejemplo: intenté cerrar una habitación y apareció este mensaje…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy || !!working || !owns}
                />
              </label>
              {image && (
                <div className="flex items-center gap-3 rounded border p-2">
                  <img
                    src={image.dataUrl}
                    alt="Captura para adjuntar"
                    className="max-h-28 max-w-48 rounded"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {image.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar captura"
                    onClick={() => setImage(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                aria-label="Elegir captura"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setPreparing(true);
                  setError("");
                  void supportScreenshot(file)
                    .then(setImage)
                    .catch((e) => setError(e.message))
                    .finally(() => setPreparing(false));
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy || preparing || !!working || !owns}
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  {preparing ? "Preparando…" : "Adjuntar captura"}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !ready ||
                    busy ||
                    preparing ||
                    !!working ||
                    !owns ||
                    (!!selected && !ticket) ||
                    (text.trim().length < 2 && !image)
                  }
                >
                  <Send className="mr-2 h-4 w-4" />
                  {busy ? "Guardando…" : "Enviar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Al enviar, la consulta y las capturas se comparten con el modelo
                de OpenAI cuando hay cupo. El caso queda guardado aunque el
                asistente esté pausado.
              </p>
            </form>
          )}
          {ticket && owns && !working && ticket.status !== "closed" && (
            <Button
              className="mt-4"
              variant="ghost"
              disabled={busy}
              onClick={() => void post(`/cases/${ticket.id}/close`, {})}
            >
              Cerrar consulta
            </Button>
          )}
        </main>
      </div>
      {admin && (
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Avisos para administración</h2>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !usage?.notificationConfigured}
              onClick={() => void post("/alerts/test", {})}
            >
              Enviar aviso de prueba
            </Button>
          </div>
          {usage?.notificationConfigured === false && (
            <p
              role="status"
              className="text-sm text-amber-800 dark:text-amber-300"
            >
              Los avisos quedan en esta bandeja. Falta configurar el correo para
              recibirlos fuera del PMS.
            </p>
          )}
          {!alerts.length && (
            <p className="text-sm text-muted-foreground">
              Acá aparecerán los pedidos de aprobación y las alertas de
              presupuesto.
            </p>
          )}
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded-lg border p-3 text-sm">
              <strong>{alert.title}</strong>
              <p className="mt-1">{alert.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatHotelDateTime(alert.createdAt)} · Correo:{" "}
                {
                  (
                    {
                      pending: "pendiente",
                      sent: "aceptado por el proveedor",
                      failed: "falló el envío",
                      disabled: "sin configurar",
                      obsolete: "propuesta desactualizada",
                    } as const
                  )[alert.delivery]
                }
              </p>
              {alert.caseId && (
                <Button
                  variant="ghost"
                  className="px-0"
                  onClick={() => setSelected(alert.caseId)}
                >
                  Abrir caso
                </Button>
              )}
            </article>
          ))}
          <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Administrar el presupuesto diario
            </summary>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void post("/budget", { dailyUsd: Number(dailyUsd), reason });
              }}
            >
              <label className="block text-sm">
                Límite diario en dólares
                <Input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.01"
                  value={dailyUsd}
                  onChange={(e) => setDailyUsd(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                Motivo del cambio
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={5}
                  maxLength={500}
                  required
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Se aplica a todo el hotel y queda registrado con tu usuario.
                Modifica el límite de este día y los siguientes.
              </p>
              <Button type="submit" variant="outline" disabled={busy}>
                Guardar límite diario
              </Button>
            </form>
          </details>
          {!!unverified.length && (
            <details className="rounded border border-amber-300 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Consumo pendiente de verificar ({unverified.length})
              </summary>
              <p className="mt-2 text-sm">
                Comprobá el consumo en el proveedor antes de conciliar. Esta
                acción libera la reserva y registra el importe verificado; no
                vuelve a llamar al modelo.
              </p>
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void post("/usage/reconcile", {
                    callId: reconcileId,
                    actualUsd: Number(actualUsd),
                    evidence,
                  });
                }}
              >
                <label className="block text-sm">
                  Llamada pendiente
                  <select
                    className="block w-full rounded border bg-background p-2"
                    required
                    value={reconcileId}
                    onChange={(e) => setReconcileId(e.target.value)}
                  >
                    <option value="">Elegir llamada</option>
                    {unverified.map((call) => (
                      <option key={call.id} value={call.id}>
                        {call.day} · reserva {money(call.reservedUsd)} ·{" "}
                        {call.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Importe verificado en dólares
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    step="0.000001"
                    required
                    value={actualUsd}
                    onChange={(e) => setActualUsd(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Referencia de la comprobación
                  <Input
                    minLength={10}
                    maxLength={500}
                    required
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                  />
                </label>
                <Button type="submit" variant="outline" disabled={busy}>
                  Registrar consumo verificado
                </Button>
              </form>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
