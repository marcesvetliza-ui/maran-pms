import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Cake, Mail, MessageCircle, History, Save, Copy } from "lucide-react";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { getArgentinaToday } from "@/lib/date-utils";
import { formatHotelDateTime } from "@/lib/hotelTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  birthdayMonths,
  birthdayWhatsappNumber,
  defaultBirthdayTemplate,
  renderBirthdayMessage,
  type BirthdayTemplate,
  type BirthdayList,
  type BirthdayGuest,
  type BirthdayPreview,
} from "@shared/hospitalitySpecialDates";
const input = "w-full rounded-md border bg-background p-2 text-sm";
const statuses: Record<string, string> = {
  queued: "En cola",
  sending: "Enviando",
  sent: "Enviado al proveedor",
  failed: "Falló el envío",
  unknown: "Resultado incierto: revisar",
  cancelled: "Cancelado antes de enviar",
  contacted: "Contacto confirmado",
};
const date = (value: string) => value.slice(5).split("-").reverse().join("/");
const contacted = (guest: BirthdayGuest) =>
  guest.contacts.some((c) => ["sent", "contacted"].includes(c.status));
export function HospitalitySpecialDates() {
  const { toast } = useToast();
  const today = getArgentinaToday(),
    [year, setYear] = useState(Number(today.slice(0, 4))),
    [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string[]>([]);
  const [template, setTemplate] = useState<BirthdayTemplate>(
      defaultBirthdayTemplate,
    ),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState("");
  const [preview, setPreview] = useState<BirthdayPreview | null>(null),
    [history, setHistory] = useState<BirthdayGuest | null>(null);
  const [whatsapp, setWhatsapp] = useState<{
    guest: BirthdayGuest;
    phone: string;
    body: string;
  } | null>(null);
  const [exclusion, setExclusion] = useState<{
    guest: BirthdayGuest;
    blocked: boolean;
    reason: string;
  } | null>(null);
  const settings = useQuery<{ template: BirthdayTemplate; version: number }>({
    queryKey: ["/api/hospitality/special-dates/settings"],
  });
  useEffect(() => {
    if (settings.data && !dirty) setTemplate(settings.data.template);
  }, [settings.data, dirty]);
  const list = useQuery<BirthdayList>({
    queryKey: ["/api/hospitality/special-dates", month, year],
    queryFn: async () =>
      (
        await apiRequest(
          "GET",
          `/api/hospitality/special-dates?month=${month}&year=${year}`,
        )
      ).json(),
    refetchInterval: 5000,
  });
  const log = useQuery<any[]>({
    queryKey: ["/api/hospitality/special-dates/guests", history?.id, "history"],
    enabled: !!history,
    queryFn: async () =>
      (
        await apiRequest(
          "GET",
          `/api/hospitality/special-dates/guests/${history!.id}/history`,
        )
      ).json(),
    refetchInterval: 5000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["/api/hospitality/special-dates"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["/api/hospitality/special-dates/guests"],
    });
  };
  const save = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("PUT", "/api/hospitality/special-dates/settings", {
          template,
          version: settings.data!.version,
        })
      ).json(),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["/api/hospitality/special-dates/settings"],
        data,
      );
      setDirty(false);
      setMessage("");
      toast({ title: "Mensaje guardado" });
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  const prepare = useMutation({
    mutationFn: async (ids: string[]) =>
      (
        await apiRequest("POST", "/api/hospitality/special-dates/preview", {
          month,
          year,
          guestIds: ids,
        })
      ).json(),
    onSuccess: (data) => {
      setPreview(data);
      setMessage("");
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  const confirm = useMutation({
    mutationFn: async () =>
      (
        await apiRequest(
          "POST",
          `/api/hospitality/special-dates/drafts/${preview!.id}/confirm`,
        )
      ).json(),
    onSuccess: (data) => {
      setPreview(null);
      setSelected([]);
      refresh();
      toast({
        title: data.alreadyConfirmed
          ? "El lote ya estaba confirmado"
          : `${data.queued} correos en cola`,
        description: data.alreadyConfirmed
          ? "No se crearon nuevos envíos. Revisá el resultado en la lista."
          : data.skipped?.length
            ? `${data.skipped.length} omitidos por cambios en datos o contactos anteriores.`
            : "Cada destinatario recibirá un correo individual. El resultado aparecerá en la lista.",
      });
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  const mark = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/hospitality/special-dates/whatsapp-contact", {
        month,
        year,
        guestId: whatsapp!.guest.id,
        recipient: whatsapp!.phone,
        body: whatsapp!.body,
      }),
    onSuccess: () => {
      setWhatsapp(null);
      refresh();
      toast({ title: "Contacto manual registrado" });
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  const suppress = useMutation({
    mutationFn: async () =>
      apiRequest(
        "PUT",
        `/api/hospitality/special-dates/guests/${exclusion!.guest.id}/exclusion`,
        { blocked: exclusion!.blocked, reason: exclusion!.reason.trim() },
      ),
    onSuccess: () => {
      setExclusion(null);
      refresh();
      toast({ title: "Preferencia de comunicaciones guardada" });
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  const copy = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      toast({ title: "Mensaje copiado" });
    } catch {
      setMessage("No se pudo copiar. Seleccioná y copiá el texto del mensaje.");
    }
  };
  const rows = (list.data?.guests || []).filter(
    (g) =>
      `${g.firstName} ${g.lastName} ${g.email || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "contacted" && contacted(g)) ||
        (filter === "pending" && !contacted(g))),
  );
  const update = (key: keyof BirthdayTemplate, value: string) => {
    setTemplate((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  };
  const reset = () => {
    setSelected([]);
    setMessage("");
    setPreview(null);
    setWhatsapp(null);
    setExclusion(null);
  };
  return (
    <section className="space-y-4" aria-label="Fechas especiales">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex gap-3 items-center">
          <Cake className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">Cumpleaños de huéspedes</h2>
            <p className="text-sm text-muted-foreground">
              Todos los huéspedes registrados que cumplen en el mes, estén
              alojados o no.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            Mes
            <select
              className={input}
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                reset();
              }}
            >
              {birthdayMonths.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Año de contacto
            <select
              className={input}
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                reset();
              }}
            >
              {[-1, 0, 1].map((offset) => (
                <option key={offset} value={Number(today.slice(0, 4)) + offset}>
                  {Number(today.slice(0, 4)) + offset}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm flex-1 min-w-48">
            Buscar huésped
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, apellido o correo"
            />
          </label>
          <label className="text-sm">
            Mostrar
            <select
              className={input}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pending">Sin contacto confirmado</option>
              <option value="contacted">Contactados</option>
            </select>
          </label>
        </div>
      </div>
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          Mensaje de cumpleaños · editar asunto, beneficio y condiciones
        </summary>
        <div className="mt-4 space-y-3">
          {settings.isError ? (
            <p role="alert">
              No se pudo cargar el mensaje.{" "}
              <Button variant="outline" onClick={() => void settings.refetch()}>
                Reintentar
              </Button>
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Variables:{" "}
                {"{nombre}, {apellido}, {beneficio}, {condiciones}, {firma}"}.
                Se guarda aquí para reutilizarlo.
              </p>
              <label className="block text-sm">
                Asunto
                <Input
                  maxLength={200}
                  value={template.subject}
                  onChange={(e) => update("subject", e.target.value)}
                />
              </label>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="text-sm">
                  Beneficio
                  <textarea
                    className={input}
                    maxLength={1000}
                    value={template.benefit}
                    onChange={(e) => update("benefit", e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Condiciones y vigencia
                  <textarea
                    className={input}
                    maxLength={1500}
                    value={template.terms}
                    onChange={(e) => update("terms", e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm">
                Texto del mensaje
                <textarea
                  className={input}
                  rows={8}
                  maxLength={6000}
                  value={template.body}
                  onChange={(e) => update("body", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Firma
                <Input
                  maxLength={500}
                  value={template.signature}
                  onChange={(e) => update("signature", e.target.value)}
                />
              </label>
              <Button
                disabled={save.isPending || !settings.data || !dirty}
                onClick={() => save.mutate()}
              >
                <Save className="h-4 w-4 mr-2" />
                Guardar mensaje
              </Button>
            </>
          )}
        </div>
      </details>
      {dirty && (
        <p role="status" className="text-sm text-amber-700">
          Guardá el mensaje antes de preparar comunicaciones.
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {list.data && !list.data.emailReady.ok && (
        <p className="rounded-md border p-3 text-sm">
          {list.data.emailReady.reason} Podés preparar mensajes y usar WhatsApp.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() =>
            setSelected(
              rows
                .filter((g) => g.emailAvailable)
                .slice(0, 250)
                .map((g) => g.id),
            )
          }
        >
          Seleccionar pendientes visibles
        </Button>
        <Button variant="ghost" onClick={() => setSelected([])}>
          Quitar selección
        </Button>
        <Button
          disabled={
            !selected.length || dirty || prepare.isPending || !settings.data
          }
          onClick={() => prepare.mutate(selected)}
        >
          <Mail className="h-4 w-4 mr-2" />
          Preparar {selected.length} emails
        </Button>
        <span className="text-xs text-muted-foreground">
          Hasta 250 por lote. Se revisan antes de confirmar.
        </span>
      </div>
      {list.isLoading ? (
        <p role="status">Cargando cumpleaños…</p>
      ) : list.isError ? (
        <div role="alert">
          No se pudieron cargar los cumpleaños.{" "}
          <Button variant="outline" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {[
                  "",
                  "Huésped",
                  "Cumpleaños",
                  "Contacto",
                  "Estado del año",
                  "Acciones",
                ].map((text, i) => (
                  <th key={i} className="p-3 text-left">
                    {text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No hay huéspedes con cumpleaños para estos filtros.
                  </td>
                </tr>
              )}
              {rows.map((g) => (
                <tr key={g.id} className="border-t align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${g.firstName} ${g.lastName}`}
                      disabled={!g.emailAvailable}
                      checked={selected.includes(g.id)}
                      onChange={(e) =>
                        setSelected((previous) =>
                          e.target.checked
                            ? [...new Set([...previous, g.id])].slice(0, 250)
                            : previous.filter((id) => id !== g.id),
                        )
                      }
                    />
                  </td>
                  <td className="p-3 font-medium">
                    {g.lastName} {g.firstName}
                  </td>
                  <td className="p-3 whitespace-nowrap">{date(g.birthday)}</td>
                  <td className="p-3">
                    <p>{g.phone || "Sin teléfono"}</p>
                    <p className={!g.validEmail ? "text-muted-foreground" : ""}>
                      {g.email || "Sin correo"}
                      {g.email && !g.validEmail ? " · revisar dirección" : ""}
                    </p>
                  </td>
                  <td className="p-3">
                    {g.excluded ? (
                      <>
                        <p className="font-semibold">No recibe promociones</p>
                        <p className="text-xs text-muted-foreground">
                          {g.exclusionReason}
                        </p>
                      </>
                    ) : !g.contacts.length ? (
                      <p>
                        {g.validEmail && !g.emailAvailable
                          ? "Correo ya registrado este año"
                          : "Pendiente"}
                      </p>
                    ) : (
                      g.contacts.map((c) => (
                        <div key={c.id} className="mb-2">
                          <p
                            className={
                              c.status === "unknown"
                                ? "font-semibold text-amber-700"
                                : ""
                            }
                          >
                            {c.channel === "email" ? "Email" : "WhatsApp"} ·{" "}
                            {statuses[c.status] || c.status}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.actorName} ·{" "}
                            {formatHotelDateTime(c.finishedAt || c.createdAt)}
                          </p>
                          {c.error && <p className="text-xs">{c.error}</p>}
                        </div>
                      ))
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={g.excluded || dirty || !settings.data}
                        onClick={() => {
                          setMessage("");
                          setWhatsapp({
                            guest: g,
                            phone: g.phone || "",
                            body: renderBirthdayMessage(
                              settings.data!.template,
                              g,
                            ).body,
                          });
                        }}
                      >
                        <MessageCircle className="h-3 w-3 mr-1" />
                        WhatsApp / copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !g.emailAvailable ||
                          dirty ||
                          prepare.isPending ||
                          !settings.data
                        }
                        onClick={() => prepare.mutate([g.id])}
                      >
                        Email
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistory(g)}
                      >
                        <History className="h-3 w-3 mr-1" />
                        Historial
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={g.exclusionInherited}
                        onClick={() => {
                          setMessage("");
                          setExclusion({
                            guest: g,
                            blocked: !g.excluded,
                            reason: "",
                          });
                        }}
                      >
                        {g.exclusionInherited
                          ? "Preferencia de correo compartido"
                          : g.excluded
                            ? "Permitir promociones"
                            : "Excluir de promociones"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        “Enviado al proveedor” confirma aceptación del envío, no recepción ni
        lectura. Abrir WhatsApp no marca contacto.
      </p>
      <Dialog
        open={!!preview}
        onOpenChange={(value) => {
          if (!value && !confirm.isPending) setPreview(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Revisar envío de cumpleaños</DialogTitle>
            <DialogDescription>
              {preview?.messages.length} correos individuales. Cada destinatario
              sólo recibe su mensaje. No se envía nada hasta confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 space-y-3">
            {preview?.messages.map((m, index) => (
              <details
                key={m.guestId}
                open={index === 0}
                className="rounded border p-3"
              >
                <summary className="cursor-pointer">
                  {m.name} · {m.recipient}
                </summary>
                <p className="font-medium mt-2">{m.subject}</p>
                <p className="whitespace-pre-wrap text-sm mt-2">{m.body}</p>
              </details>
            ))}
            {!!preview?.skipped.length && (
              <div className="rounded border p-3">
                <h3 className="font-medium">Omitidos</h3>
                {preview.skipped.map((m) => (
                  <p key={m.guestId} className="text-sm">
                    {m.name}: {m.reason}
                  </p>
                ))}
              </div>
            )}
            {message && (
              <p role="alert" className="text-destructive">
                {message}
              </p>
            )}
            {!list.data?.emailReady.ok && <p>{list.data?.emailReady.reason}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirm.isPending}
              onClick={() => setPreview(null)}
            >
              Cancelar sin enviar
            </Button>
            <Button
              disabled={
                !preview?.messages.length ||
                confirm.isPending ||
                !list.data?.emailReady.ok
              }
              onClick={() => confirm.mutate()}
            >
              Confirmar envío de {preview?.messages.length || 0} correos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!whatsapp}
        onOpenChange={(value) => {
          if (!value && !mark.isPending) setWhatsapp(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Mensaje para {whatsapp?.guest.firstName}</DialogTitle>
            <DialogDescription>
              Abrí WhatsApp, revisá y enviá el mensaje. Después confirmá el
              contacto manualmente.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm">
            Número de WhatsApp con código de país
            <Input
              value={whatsapp?.phone || ""}
              placeholder="Ej.: +54 9 …"
              onChange={(e) =>
                setWhatsapp((value) =>
                  value ? { ...value, phone: e.target.value } : value,
                )
              }
            />
          </label>
          <label className="text-sm">
            Mensaje preparado
            <textarea
              className={input}
              rows={9}
              maxLength={10000}
              value={whatsapp?.body || ""}
              onChange={(e) =>
                setWhatsapp((value) =>
                  value ? { ...value, body: e.target.value } : value,
                )
              }
            />
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void copy(whatsapp!.body)}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar mensaje
            </Button>
            <Button
              disabled={!whatsapp || !birthdayWhatsappNumber(whatsapp.phone)}
              onClick={() =>
                window.open(
                  `https://wa.me/${birthdayWhatsappNumber(whatsapp!.phone)}?text=${encodeURIComponent(whatsapp!.body)}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Abrir WhatsApp
            </Button>
          </div>
          {whatsapp?.guest.contacts.some((c) =>
            ["queued", "sending", "sent", "unknown", "contacted"].includes(
              c.status,
            ),
          ) && (
            <p className="text-sm text-amber-700">
              Ya existe contacto o envío en proceso este año. Revisá el
              historial antes de contactar nuevamente.
            </p>
          )}
          {message && (
            <p role="alert" className="text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWhatsapp(null)}
              disabled={mark.isPending}
            >
              Cerrar
            </Button>
            <Button
              disabled={
                mark.isPending ||
                !whatsapp?.body.trim() ||
                !birthdayWhatsappNumber(whatsapp?.phone || "") ||
                whatsapp?.guest.contacts.some((c) =>
                  [
                    "queued",
                    "sending",
                    "sent",
                    "unknown",
                    "contacted",
                  ].includes(c.status),
                )
              }
              onClick={() => mark.mutate()}
            >
              Ya lo envié · marcar contactado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!exclusion}
        onOpenChange={(value) => {
          if (!value && !suppress.isPending) setExclusion(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {exclusion?.blocked
                ? "Excluir de promociones"
                : "Permitir promociones"}
            </DialogTitle>
            <DialogDescription>
              {exclusion?.guest.firstName} {exclusion?.guest.lastName}. La
              preferencia se comprueba antes de enviar. Los correos que ya están
              en envío no pueden retirarse.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm">
            Motivo
            <textarea
              className={input}
              maxLength={500}
              value={exclusion?.reason || ""}
              onChange={(e) =>
                setExclusion((value) =>
                  value ? { ...value, reason: e.target.value } : value,
                )
              }
            />
          </label>
          {message && (
            <p role="alert" className="text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={suppress.isPending}
              onClick={() => setExclusion(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={suppress.isPending || !exclusion?.reason.trim()}
              onClick={() => suppress.mutate()}
            >
              Guardar preferencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={(value) => {
          if (!value) setHistory(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Historial · {history?.firstName} {history?.lastName}
            </DialogTitle>
            <DialogDescription>
              Contactos y resultados por año, canal y operador.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 space-y-3">
            {log.isLoading ? (
              <p>Cargando historial…</p>
            ) : log.isError ? (
              <p role="alert">No se pudo cargar el historial.</p>
            ) : !log.data?.length ? (
              <p>Sin contactos registrados.</p>
            ) : (
              log.data.map((item, i) => (
                <div key={i} className="border rounded p-3 text-sm">
                  <p className="font-medium">
                    {item.campaign_year} ·{" "}
                    {item.channel === "email" ? "Email" : "WhatsApp"} ·{" "}
                    {statuses[item.status] || item.status}
                  </p>
                  <p>
                    {item.recipient} · {item.actor_name} ·{" "}
                    {formatHotelDateTime(item.created_at)}
                  </p>
                  {item.details?.body && (
                    <details>
                      <summary className="cursor-pointer">
                        Ver mensaje registrado
                      </summary>
                      <p className="whitespace-pre-wrap">{item.details.body}</p>
                    </details>
                  )}
                  {item.details?.error && <p>{item.details.error}</p>}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
