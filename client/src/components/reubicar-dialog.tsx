import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  Loader2,
  Search,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
import {
  queryClient,
  apiRequest,
  parseApiErrorPayload,
} from "@/lib/queryClient";
import { formatDisplayDate } from "@shared/date-display";
import type { RelocationPreview } from "@shared/relocation";
const statuses: Record<string, string> = {
  available: "Limpia",
  inspected: "Inspeccionada",
  dirty: "Sucia",
  cleaning: "En limpieza",
  occupied: "Ocupada",
  limpia_ocupada: "Limpia ocupada",
  no_molestar: "No molestar",
};
async function request<T>(url: string, body?: unknown): Promise<T> {
  try {
    return await (await apiRequest(body ? "POST" : "GET", url, body)).json();
  } catch (error) {
    const payload = parseApiErrorPayload(error);
    if (payload)
      throw Object.assign(
        new Error(payload.error || "No se pudo completar la solicitud."),
        { code: payload.code },
      );
    throw error;
  }
}
type SearchResult = {
  id: string;
  code: string;
  guest: string;
  room: string;
  checkIn: string;
  checkOut: string;
  status: string;
};
export function ReubicarAction({ reservationId }: { reservationId?: string }) {
  const [open, setOpen] = useState(false);
  const { hasPermission } = useAuth();
  if (!hasPermission?.("sidebar:/reservations")) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-100"
        onClick={() => setOpen(true)}
        data-testid={reservationId ? "reubicar-reserva" : "reubicar-planning"}
      >
        <ArrowRightLeft className="h-4 w-4 mr-2" />
        Reubicar
      </Button>
      <ReubicarDialog
        open={open}
        onOpenChange={setOpen}
        initialReservationId={reservationId}
      />
    </>
  );
}
export function ReubicarDialog({
  open,
  onOpenChange,
  initialReservationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialReservationId?: string;
}) {
  const { toast } = useToast();
  const [id, setId] = useState(initialReservationId || ""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const [destination, setDestination] = useState(""),
    [sameCategory, setSameCategory] = useState(false),
    [sameBed, setSameBed] = useState(false),
    [readyOnly, setReadyOnly] = useState(false),
    [floor, setFloor] = useState(""),
    [roomSearch, setRoomSearch] = useState("");
  const [reason, setReason] = useState(""),
    [ackPreparation, setAckPreparation] = useState(false),
    [ackBed, setAckBed] = useState(false),
    [groupWarning, setGroupWarning] = useState(false),
    [ackGroup, setAckGroup] = useState(false),
    [submitError, setSubmitError] = useState("");
  const confirmationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (destination)
      confirmationRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [destination]);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    if (open) {
      setId(initialReservationId || "");
      setSearch("");
      setQuery("");
      setDestination("");
      setReason("");
      setAckPreparation(false);
      setAckBed(false);
      setGroupWarning(false);
      setAckGroup(false);
      setSubmitError("");
      attempt.current = null;
      setSameCategory(false);
      setSameBed(false);
      setReadyOnly(false);
      setFloor("");
      setRoomSearch("");
    }
  }, [open, initialReservationId]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const results = useQuery<SearchResult[]>({
    queryKey: ["/api/relocations/search", query],
    queryFn: () =>
      request(`/api/relocations/search?q=${encodeURIComponent(query)}`),
    enabled: open && !id,
    refetchOnWindowFocus: false,
  });
  const preview = useQuery<RelocationPreview>({
    queryKey: ["/api/relocations", id],
    queryFn: () => request(`/api/relocations/${encodeURIComponent(id)}`),
    enabled: open && !!id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const data = preview.data,
    r = data?.reservation,
    selected = data?.rooms.find((room) => room.id === destination);
  const choose = (value: string) => {
    setDestination(value);
    setAckPreparation(false);
    setAckBed(false);
    setGroupWarning(false);
    setAckGroup(false);
    setSubmitError("");
  };
  const submit = useMutation({
    mutationFn: async () => {
      if (!r || !selected) throw new Error("Elegí una habitación destino.");
      const body = {
        roomId: selected.id,
        reservationToken: r.token,
        destinationToken: selected.token,
        reason: reason.trim(),
        acknowledgePreparation: ackPreparation,
        acknowledgeBedChange: ackBed,
        overrideGroupWarning: ackGroup,
      };
      const signature = JSON.stringify(body);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      return request(`/api/relocations/${encodeURIComponent(id)}`, {
        ...body,
        operationId: attempt.current.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: "Habitación reubicada",
        description:
          "El cambio quedó registrado. Se conserva la tarifa acordada.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      setSubmitError(error.message);
      if (error.code === "GROUP_BLOCK_WARNING") setGroupWarning(true);
    },
  });
  const visible =
    data?.rooms.filter(
      (room) =>
        (!sameCategory || room.category === r?.category) &&
        (!sameBed || room.bedComparison === "same") &&
        (!readyOnly || room.ready) &&
        (!floor || String(room.floor) === floor) &&
        (!roomSearch ||
          room.roomNumber.toLowerCase().includes(roomSearch.toLowerCase())),
    ) || [];
  const needsBed =
    selected && ["different", "review"].includes(selected.bedComparison);
  const canSubmit =
    !!selected?.selectable &&
    reason.trim().length >= 5 &&
    (!r?.preparation || ackPreparation) &&
    (!needsBed || ackBed) &&
    (!groupWarning || ackGroup) &&
    !preview.isFetching &&
    !preview.isError;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => !submit.isPending && onOpenChange(value)}
    >
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden rounded-3xl sm:rounded-3xl border-slate-200/80 bg-slate-50 p-0 gap-0 shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-950 [&>button]:top-5 [&>button]:right-5 [&>button]:flex [&>button]:h-8 [&>button]:w-8 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:text-white [&>button]:hover:bg-white/20"
        data-testid="dialog-reubicar"
      >
        <DialogHeader className="shrink-0 bg-gradient-to-br from-blue-950 via-blue-900 to-sky-800 p-5 pr-16 text-white sm:p-6 sm:pr-16">
          <DialogTitle className="flex items-center gap-3 text-xl font-semibold tracking-tight">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <ArrowRightLeft className="h-5 w-5 text-blue-50" />
            </span>
            Reubicar
          </DialogTitle>
          <DialogDescription className="max-w-2xl text-left leading-relaxed text-blue-100/90">
            Elegí un destino disponible para todo el período. La tarifa y los
            servicios contratados se conservan.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 flex-1 p-4 sm:p-5 space-y-4 overscroll-contain scroll-pt-36 bg-gradient-to-b from-slate-100/80 to-blue-50/30 dark:from-slate-950 dark:to-blue-950/20">
          {!id ? (
            <>
              <Label htmlFor="reubicar-buscar">Reserva a reubicar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reubicar-buscar"
                  className="h-11 rounded-2xl border-slate-200 bg-white pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Habitación, apellido o código de reserva"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Incluye huéspedes alojados, reservas futuras y reservas en REUB.
                Hasta 30 resultados.
              </p>
              {results.isFetching && <p role="status">Buscando reservas…</p>}
              {results.error && <p role="alert">{results.error.message}</p>}
              {results.data?.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setId(item.id)}
                  className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/70 focus-visible:outline-primary dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-blue-950/50"
                >
                  <strong className="block">
                    {item.guest} · Hab. {item.room}
                  </strong>
                  <span className="text-sm text-muted-foreground">
                    {item.code} · {formatDisplayDate(item.checkIn)} →{" "}
                    {formatDisplayDate(item.checkOut)}
                  </span>
                </button>
              ))}
              {results.data?.length === 0 && (
                <p>No hay reservas que coincidan con la búsqueda.</p>
              )}
            </>
          ) : (
            <>
              {preview.isFetching && (
                <p role="status" className="flex gap-2 items-center">
                  <Loader2 className="animate-spin h-4 w-4" />
                  Verificando habitaciones…
                </p>
              )}
              {preview.error && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive p-3"
                >
                  {preview.error.message}
                </div>
              )}
              {r && (
                <>
                  <div className="sticky top-0 z-10 rounded-2xl border border-blue-200/70 bg-blue-50 p-3 space-y-1 shadow-sm shadow-blue-900/5 dark:border-blue-800 dark:bg-blue-950">
                    <div className="flex justify-between items-center gap-2">
                      <strong
                        className="min-w-0 truncate text-sm"
                        title={r.guest}
                      >
                        {selected
                          ? `Hab. ${r.room} → ${selected.roomNumber} · ${r.guest}`
                          : `${r.guest} · Hab. ${r.room}`}
                      </strong>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Actualizar opciones"
                        className="shrink-0 rounded-xl text-blue-800 hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-blue-900"
                        onClick={() => {
                          choose("");
                          preview.refetch();
                        }}
                        disabled={preview.isFetching || submit.isPending}
                      >
                        <RefreshCw className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">
                          Actualizar opciones
                        </span>
                      </Button>
                    </div>
                    <p
                      className="text-sm truncate"
                      title={`${r.category} · ${r.guests} persona(s) · ${r.code}`}
                    >
                      {selected
                        ? `${r.category} → ${selected.category}`
                        : `${r.category} · ${r.guests} persona(s) · ${r.code}`}
                    </p>
                    <p className="text-sm font-medium">
                      Desde {formatDisplayDate(r.from)} hasta{" "}
                      {formatDisplayDate(r.to)}
                    </p>
                    <p
                      className="text-sm text-muted-foreground truncate"
                      title={[r.requestedBed, r.bedNotes]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      Camaje solicitado: {r.requestedBed}
                      {r.bedNotes ? ` · ${r.bedNotes}` : ""}
                    </p>
                    {r.status === "checked_in" && !selected && (
                      <p className="text-xs text-muted-foreground">
                        Traslado desde hoy. Las noches anteriores conservan su
                        habitación original.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {[
                      [sameCategory, setSameCategory, "Misma categoría"],
                      [sameBed, setSameBed, "Mismo armado"],
                      [readyOnly, setReadyOnly, "Listas para ingresar"],
                    ].map(([checked, set, label]) => (
                      <label
                        key={label as string}
                        className={`flex gap-2 items-center rounded-full border px-3 py-2 transition-colors ${checked ? "border-blue-200 bg-blue-100/80 text-blue-950 dark:border-blue-700 dark:bg-blue-900/70 dark:text-blue-100" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-blue-700 dark:accent-blue-400"
                          checked={checked as boolean}
                          onChange={(e) =>
                            (set as (v: boolean) => void)(e.target.checked)
                          }
                        />
                        {label as string}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor="reubicar-piso">
                      Piso
                    </label>
                    <select
                      id="reubicar-piso"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                    >
                      <option value="">Todos los pisos</option>
                      {[...new Set(data.rooms.map((room) => room.floor))]
                        .sort((a, b) => a - b)
                        .map((value) => (
                          <option key={value} value={value}>
                            Piso {value}
                          </option>
                        ))}
                    </select>
                    <Input
                      aria-label="Número de habitación destino"
                      className="h-10 rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Número de habitación"
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {visible.length} destinos libres de reservas durante todo el
                    período. Limpieza y camaje reflejan el último registro; no
                    garantizan preparación futura.
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="Habitación destino"
                    className="space-y-2"
                  >
                    {visible.map((room, index) => (
                      <div key={room.id}>
                        {(index === 0 ||
                          visible[index - 1].roomTypeId !==
                            room.roomTypeId) && (
                          <p className="pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <span className="inline-flex rounded-full bg-blue-100/80 px-3 py-1 text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                              {room.category}
                            </span>
                          </p>
                        )}
                        <button
                          role="radio"
                          aria-checked={destination === room.id}
                          disabled={
                            !room.selectable ||
                            preview.isFetching ||
                            submit.isPending
                          }
                          onClick={() => choose(room.id)}
                          className={`w-full text-left border rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-[100px_1fr_160px] gap-3 shadow-sm transition-colors ${destination === room.id ? "border-blue-400 bg-blue-100/70 ring-2 ring-blue-300/60 dark:border-blue-500 dark:bg-blue-950/80 dark:ring-blue-800" : "border-slate-200/80 bg-white/90 hover:border-blue-300 hover:bg-blue-50/70 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-blue-950/50"} disabled:bg-slate-100/70 disabled:opacity-60 dark:disabled:bg-slate-900/60`}
                        >
                          <strong className="text-base font-semibold">
                            <span className="flex items-center gap-2">
                              Hab. {room.roomNumber}
                              {destination === room.id && (
                                <CheckCircle2
                                  className="h-4 w-4 text-blue-700 dark:text-blue-300"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <span className="block text-xs font-normal text-muted-foreground">
                              Piso {room.floor} · {room.capacity ?? "—"} pax
                            </span>
                          </strong>
                          <span className="text-sm flex flex-wrap items-center gap-2">
                            <BedDouble className="h-4 w-4 shrink-0" />
                            {room.bed || "Sin informar"}
                            {room.bedComparison === "different" && (
                              <span className="text-amber-700 dark:text-amber-300 text-xs">
                                Requiere cambio de armado
                              </span>
                            )}
                            {room.bedComparison === "review" && (
                              <span className="text-amber-700 dark:text-amber-300 text-xs">
                                Camaje a revisar
                              </span>
                            )}
                          </span>
                          <span
                            className={`self-center justify-self-start rounded-full px-3 py-1.5 text-xs font-medium ${room.ready ? "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100/80 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}
                          >
                            {statuses[room.status] || room.status}
                            {room.unavailableReason && (
                              <span className="block text-xs">
                                {room.unavailableReason}
                              </span>
                            )}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                  {!visible.length && (
                    <p className="border rounded-lg p-4">
                      No hay destinos disponibles con estos filtros. Podés
                      ampliar la búsqueda.
                    </p>
                  )}
                  {selected && (
                    <section
                      ref={confirmationRef}
                      className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-emerald-50/60 p-4 space-y-3 shadow-sm dark:border-blue-800 dark:from-blue-950 dark:to-slate-900"
                      aria-label="Confirmar cambio"
                    >
                      <strong className="flex items-center gap-2">
                        Hab. {r.room}
                        <ArrowRight className="h-4 w-4" />
                        Hab. {selected.roomNumber}
                      </strong>
                      <p className="text-sm">
                        {r.category} → {selected.category} ·{" "}
                        {formatDisplayDate(r.from)} → {formatDisplayDate(r.to)}
                      </p>
                      <p className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        Se conserva la tarifa y el paquete acordados.
                      </p>
                      {r.preparation && (
                        <label className="flex items-start gap-2 rounded-2xl bg-amber-100/70 text-amber-950 dark:bg-amber-950 dark:text-amber-100 p-3 text-sm">
                          <input
                            type="checkbox"
                            checked={ackPreparation}
                            onChange={(e) =>
                              setAckPreparation(e.target.checked)
                            }
                          />
                          <span>
                            <strong>Housekeeping pidió NO MOVER.</strong>{" "}
                            {r.preparation}. Revisé la preparación especial y
                            confirmo el cambio; quedará pendiente de revisión en
                            destino.
                          </span>
                        </label>
                      )}
                      {needsBed && (
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={ackBed}
                            onChange={(e) => setAckBed(e.target.checked)}
                          />
                          <span>
                            Revisé el camaje solicitado y el registrado. Se
                            avisará a Housekeeping para preparar el destino.
                          </span>
                        </label>
                      )}
                      <Label htmlFor="reubicar-motivo">Motivo del cambio</Label>
                      <Textarea
                        id="reubicar-motivo"
                        className="rounded-2xl border-blue-200 bg-white shadow-sm dark:border-blue-800 dark:bg-slate-950"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={500}
                        placeholder="Ej.: Pedido del huésped"
                      />
                      <p className="text-xs text-muted-foreground">
                        Mínimo 5 caracteres. Queda registrado con fecha y
                        usuario.
                      </p>
                      {groupWarning && (
                        <label className="flex items-start gap-2 text-sm text-amber-800">
                          <input
                            type="checkbox"
                            checked={ackGroup}
                            onChange={(e) => setAckGroup(e.target.checked)}
                          />
                          Revisé la advertencia de cupos de grupos y confirmo
                          continuar.
                        </label>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {submitError && (
            <div
              role="alert"
              className="text-sm border border-destructive text-destructive p-3 rounded-lg flex gap-2"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {submitError}
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-slate-200/80 bg-slate-100/90 p-4 shrink-0 gap-2 sm:justify-between dark:border-slate-800 dark:bg-slate-900">
          <Button
            variant="outline"
            className="rounded-xl bg-white dark:bg-slate-950"
            disabled={submit.isPending}
            onClick={() => {
              if (id && !initialReservationId) {
                setId("");
                choose("");
              } else onOpenChange(false);
            }}
          >
            {id && !initialReservationId ? "Otra reserva" : "Cancelar"}
          </Button>
          <Button
            className="rounded-xl bg-gradient-to-r from-blue-800 to-sky-700 text-white shadow-sm hover:from-blue-900 hover:to-sky-800"
            disabled={!canSubmit || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Reubicando…" : "Confirmar cambio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
