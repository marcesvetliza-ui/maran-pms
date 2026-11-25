import { useRef, useState, useId, isValidElement, cloneElement } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  CalendarDays,
  ChevronLeft,
  Plus,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/App";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, parseApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getArgentinaToday, toArgentinaDateStr } from "@/lib/utils";

type Row = Record<string, any>;
const root = "/api/restaurant/events";
const peso = (value: unknown) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const day = (value: string) => {
  const date = value?.includes("T")
    ? toArgentinaDateStr(new Date(value))
    : value;
  return date?.split("-").reverse().join("/");
};
const selectClass =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm";
const emptyEvent = () => ({
  name: "",
  description: "",
  date: getArgentinaToday(),
  time: "20:00",
  endTime: "02:00",
  capacity: "",
  adultPrice: "",
  childPrice: "0",
  areaId: "",
  menu: [] as Row[],
});
const emptyBooking = () => ({
  guestName: "",
  guestPhone: "",
  guestEmail: "",
  adults: "2",
  children: "0",
  notes: "",
});
export function RestaurantEvents({
  onOpenOrder,
}: {
  onOpenOrder: (id: string) => Promise<void>;
}) {
  const queryClient = useQueryClient(),
    { toast } = useToast();
  const [eventId, setEventId] = useState(""),
    [mode, setMode] = useState<
      "event" | "booking" | "advance" | "tables" | "cancel" | null
    >(null),
    [selected, setSelected] = useState<Row | null>(null);
  const [event, setEvent] = useState(emptyEvent),
    [guest, setGuest] = useState(emptyBooking),
    [advance, setAdvance] = useState({
      amount: "",
      method: "efectivo",
      receiptType: "ticket",
      dni: "",
      notes: "",
    }),
    [tableIds, setTableIds] = useState<string[]>([]),
    [reason, setReason] = useState("");
  const [product, setProduct] = useState(""),
    [audience, setAudience] = useState("all"),
    [quantity, setQuantity] = useState("1"),
    [menuSearch, setMenuSearch] = useState("");
  const { user } = useAuth();
  type Pending = {
    signature: string;
    id: string;
    method: string;
    path: string;
    data: Row;
    eventId: string;
  };
  const storageKey = "restaurant-event-pending:" + user?.id;
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  });
  const operation = useRef<Pending | null>(pending);
  const remember = (value: Pending | null) => {
    operation.current = value;
    setPending(value);
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  };
  const events = useQuery<Row[]>({
    queryKey: [root],
    queryFn: async () => {
      const r = await apiRequest("GET", root);
      return r.json();
    },
  });
  const catalog = useQuery<{ areas: Row[]; items: Row[] }>({
    queryKey: [root, "catalog"],
    queryFn: async () => {
      const r = await apiRequest("GET", root + "/catalog");
      return r.json();
    },
    staleTime: 60000,
  });
  const detail = useQuery<{ event: Row; bookings: Row[]; tables: Row[] }>({
    queryKey: [root, eventId],
    queryFn: async () => {
      const r = await apiRequest("GET", root + "/" + eventId);
      return r.json();
    },
    enabled: !!eventId,
    refetchInterval: 30000,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [root] }),
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async ({
      method,
      path,
      data,
    }: {
      method: string;
      path: string;
      data: Row;
    }) => {
      const signature = JSON.stringify({ method, path, data });
      if (operation.current && operation.current.signature !== signature)
        throw new Error(
          "Primero verificá el intento pendiente con sus datos originales.",
        );
      if (!operation.current)
        remember({
          signature,
          id: crypto.randomUUID(),
          method,
          path,
          data,
          eventId,
        });
      const response = await apiRequest(method, root + path, {
        ...data,
        operationId: operation.current!.id,
      });
      return response.json();
    },
    onSuccess: async (result) => {
      const completed = operation.current;
      remember(null);
      if (completed?.eventId) setEventId(completed.eventId);
      if (completed?.path === "" && result.id) setEventId(result.id);
      await refresh();
      setMode(null);
      if (result.orderId) {
        await onOpenOrder(result.orderId);
      } else if (mode === "event") {
        setEventId(result.id);
      }
      toast({
        title:
          result.documentStatus === "pending"
            ? "Anticipo registrado · comprobante pendiente"
            : "Guardado",
        description: result.message,
      });
    },
    onError: (e: Error) => {
      if ((e as any).notSent || /^4\d\d:/.test(e.message)) remember(null);
      toast({
        title: "No se pudo completar",
        description: parseApiError(e),
        variant: "destructive",
      });
    },
  });
  const retryDocument = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest(
        "POST",
        root + "/advances/" + id + "/document",
        {},
      );
      return r.json();
    },
    onSuccess: async (result) => {
      await refresh();
      toast({
        title:
          result.documentStatus === "completed"
            ? "Comprobante completado"
            : "Comprobante pendiente",
        description: result.message,
      });
    },
    onError: (e: Error) =>
      toast({
        title: "No se pudo completar",
        description: parseApiError(e),
        variant: "destructive",
      }),
  });
  const retryFinalDocument = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(
        "POST",
        root + "/orders/" + id + "/document",
        {},
      );
      return response.json();
    },
    onSuccess: async (result) => {
      await refresh();
      toast({
        title:
          result.documentStatus === "completed"
            ? "Comprobante completado"
            : "Comprobante pendiente",
        description: result.message,
      });
    },
    onError: (e: Error) =>
      toast({
        title: "No se pudo completar",
        description: parseApiError(e),
        variant: "destructive",
      }),
  });
  const open = (value: typeof mode, booking?: Row) => {
    if (operation.current) {
      toast({
        title: "Hay un intento pendiente",
        description: "Verificalo antes de registrar otra operación.",
      });
      return;
    }
    setSelected(booking || null);
    setMode(value);
    if (value === "event")
      setEvent(
        booking
          ? {
              name: booking.name,
              description: booking.includes,
              date: booking.date,
              time: booking.time,
              endTime: booking.endTime,
              capacity: String(booking.capacity),
              adultPrice: booking.adult_price,
              childPrice: booking.child_price,
              areaId: booking.area_id,
              menu: booking.menu,
            }
          : emptyEvent(),
      );
    if (value === "booking") setGuest(emptyBooking());
    if (value === "advance")
      setAdvance({
        amount: "",
        method: "efectivo",
        receiptType: "ticket",
        dni: "",
        notes: "",
      });
    if (value === "tables")
      setTableIds(booking?.tables.map((t: Row) => t.id) || []);
    if (value === "cancel") setReason("");
  };
  const submit = () => {
    if (mode === "event")
      mutation.mutate({
        method: selected?.event_id ? "PATCH" : "POST",
        path: selected?.event_id ? "/" + selected.event_id : "",
        data: {
          ...event,
          capacity: Number(event.capacity),
          adultPrice: event.adultPrice.replace(",", "."),
          childPrice: event.childPrice.replace(",", "."),
          menu: event.menu,
        },
      });
    if (mode === "booking")
      mutation.mutate({
        method: "POST",
        path: "/" + eventId + "/bookings",
        data: {
          ...guest,
          adults: Number(guest.adults),
          children: Number(guest.children),
        },
      });
    if (mode === "advance" && selected)
      mutation.mutate({
        method: "POST",
        path: "/bookings/" + selected.reservation_id + "/advances",
        data: { ...advance, amount: advance.amount.replace(",", ".") },
      });
    if (mode === "tables" && selected)
      mutation.mutate({
        method: "PATCH",
        path: "/bookings/" + selected.reservation_id + "/tables",
        data: { tableIds },
      });
    if (mode === "cancel" && selected)
      mutation.mutate({
        method: "POST",
        path: "/bookings/" + selected.reservation_id + "/cancel",
        data: { reason },
      });
  };
  const e = detail.data?.event,
    bookings = detail.data?.bookings || [],
    items = catalog.data?.items || [],
    busy =
      mutation.isPending ||
      retryDocument.isPending ||
      retryFinalDocument.isPending;
  const error = events.error || catalog.error || detail.error;
  return (
    <section className="space-y-5" data-testid="restaurant-events">
      <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-sky-800 p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-sky-100">
              <CalendarDays className="h-4 w-4" />
              Restaurant · Eventos propios
            </div>
            <h2 className="text-2xl font-semibold">
              {e?.name || "Evento restaurant"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-sky-100">
              {e
                ? `${day(e.date)} · ${e.time} a ${e.endTime} · ${e.areaName}`
                : "Organizá cada fecha, sus reservas y las mesas. Las señas acompañan a la reserva."}
            </p>
          </div>
          {eventId ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEventId("");
                  setSelected(null);
                }}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Eventos
              </Button>
              <Button
                variant="secondary"
                onClick={() => open("event", e)}
                disabled={!e}
              >
                Editar evento
              </Button>
              <Button
                onClick={() => open("booking")}
                disabled={!e || e.status !== "confirmed"}
                className="bg-white text-blue-950 hover:bg-sky-50"
              >
                <Plus className="mr-1 h-4 w-4" />
                Nueva reserva
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => open("event")}
              className="bg-white text-blue-950 hover:bg-sky-50"
            >
              <Plus className="mr-1 h-4 w-4" />
              Crear evento
            </Button>
          )}
        </div>
      </div>
      {pending && (
        <div
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          <p>
            Hay un intento cuyo resultado falta confirmar. Conservamos sus datos
            para verificarlo sin repetir cobros.
          </p>
          <Button
            className="mt-2"
            disabled={busy}
            onClick={() =>
              mutation.mutate({
                method: pending.method,
                path: pending.path,
                data: pending.data,
              })
            }
          >
            Verificar intento pendiente
          </Button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 p-4 text-red-700"
        >
          {parseApiError(error)}{" "}
          <Button variant="outline" onClick={() => refresh()}>
            Reintentar
          </Button>
        </p>
      )}
      {(events.isLoading || (eventId && detail.isLoading)) && (
        <p role="status">Cargando eventos…</p>
      )}
      {!eventId && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.data?.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setEventId(ev.id)}
              className="rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-lg">{ev.name}</h3>
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {day(ev.date)} · {ev.time} · {ev.areaName}
              </p>
              <p className="my-4 text-sm">{ev.includes}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800 dark:bg-blue-950 dark:text-blue-100">
                  {ev.persons}/{ev.capacity} personas
                </span>
                <span className="rounded-full bg-muted px-3 py-1">
                  {ev.bookingCount} reservas
                </span>
              </div>
              <p className="mt-4 text-sm">
                Adulto {peso(ev.adult_price)} · Niño {peso(ev.child_price)}
              </p>
            </button>
          ))}
          {events.data?.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-muted-foreground">
              Creá el primer evento y empezá a tomar reservas, con o sin mesa
              asignada.
            </p>
          )}
        </div>
      )}
      {eventId && e && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [Users, "Comensales", `${e.persons} / ${e.capacity}`],
              [UtensilsCrossed, "Reservas", String(e.bookingCount)],
              [
                Wallet,
                "Anticipos registrados",
                peso(bookings.reduce((sum, b) => sum + Number(b.advances), 0)),
              ],
            ].map(([Icon, label, value]) => {
              const I = Icon as typeof Users;
              return (
                <div
                  key={String(label)}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-4"
                >
                  <I className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {String(label)}
                    </p>
                    <p className="text-xl font-semibold">{String(value)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border bg-muted/30 p-4">
            <p className="font-medium">Qué incluye</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {e.includes}
            </p>
            <p className="mt-2 text-sm">
              Adulto {peso(e.adult_price)} · Niño {peso(e.child_price)}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {bookings.map((b) => (
              <article
                key={b.reservation_id}
                className="rounded-2xl border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-lg">{b.guestName}</h3>
                    <p className="text-sm text-muted-foreground">
                      {b.phone} · {b.adults} adultos · {b.children} niños
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs">
                    {(
                      {
                        confirmed: "Confirmada",
                        check_in: "En servicio",
                        completed: "Cerrada",
                        cancelled: "Cancelada",
                      } as Record<string, string>
                    )[b.status] || b.status}
                  </span>
                </div>
                <p className="my-3 text-sm font-medium text-blue-700 dark:text-blue-300">
                  {b.tables.length
                    ? "Mesas " + b.tables.map((t: Row) => t.number).join(" + ")
                    : "Sin mesa asignada"}
                </p>
                {b.notes && (
                  <p className="mb-3 rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-line">
                    {b.notes}
                  </p>
                )}
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">
                  <div>
                    <dt className="text-muted-foreground">Contratado</dt>
                    <dd className="font-semibold">
                      {peso(b.contracted_total)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Anticipos</dt>
                    <dd className="font-semibold">{peso(b.advances)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {b.orderStatus === "closed"
                        ? "Cobrado al cierre"
                        : b.orderId
                          ? "Saldo actual"
                          : "Saldo del menú"}
                    </dt>
                    <dd className="font-semibold">
                      {peso(
                        b.orderStatus === "closed"
                          ? b.orderTotal
                          : Number(b.orderTotal ?? b.contracted_total) -
                              Number(b.advances),
                      )}
                    </dd>
                  </div>
                </dl>
                {b.payments.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-blue-700 dark:text-blue-300">
                      Ver {b.payments.length} anticipos y comprobantes
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {b.payments.map((p: Row) => (
                        <li key={p.id} className="rounded-xl bg-muted/40 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {day(p.date)} · {p.method} · {peso(p.amount)}
                            </span>
                            {p.documentStatus === "pending" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => retryDocument.mutate(p.id)}
                              >
                                Completar comprobante
                              </Button>
                            ) : p.invoiceId ? (
                              <a
                                className="text-blue-700 underline dark:text-blue-300"
                                target="_blank"
                                rel="noreferrer"
                                href={
                                  "/api/billing/invoices/" +
                                  p.invoiceId +
                                  "/pdf"
                                }
                              >
                                Comprobante
                              </a>
                            ) : (
                              <span>Revisar registro previo</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {p.receipt}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {b.status === "confirmed" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => open("tables", b)}
                        disabled={busy}
                      >
                        Asignar mesas
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => open("advance", b)}
                        disabled={
                          busy ||
                          Number(b.advances) >= Number(b.contracted_total)
                        }
                      >
                        Agregar anticipo
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          busy ||
                          !b.tables.length ||
                          getArgentinaToday() < e.date ||
                          getArgentinaToday() > e.endDate
                        }
                        onClick={() =>
                          mutation.mutate({
                            method: "POST",
                            path: "/bookings/" + b.reservation_id + "/start",
                            data: {},
                          })
                        }
                      >
                        Iniciar servicio
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => open("cancel", b)}
                        disabled={busy}
                      >
                        Cancelar reserva
                      </Button>
                    </>
                  )}
                  {b.orderId && b.orderStatus !== "closed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await onOpenOrder(b.orderId);
                        } catch (error) {
                          toast({
                            title: "No se pudo abrir la cuenta",
                            description: parseApiError(error),
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Abrir cuenta
                    </Button>
                  )}
                  {b.orderStatus === "closed" && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={
                          "/api/restaurant/orders/" + b.orderId + "/receipt-pdf"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver comprobante
                      </a>
                    </Button>
                  )}
                  {b.finalDocumentStatus === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => retryFinalDocument.mutate(b.orderId)}
                    >
                      Completar comprobante del cierre
                    </Button>
                  )}
                  {b.finalInvoiceId && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={
                          "/api/billing/invoices/" + b.finalInvoiceId + "/pdf"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver factura
                      </a>
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {!bookings.length && (
              <p className="rounded-2xl border border-dashed p-7 text-muted-foreground">
                Este evento todavía no tiene reservas. Podés tomarlas sin
                asignar mesas.
              </p>
            )}
          </div>
        </>
      )}
      <Dialog
        open={!!mode}
        onOpenChange={(value) => {
          if (!value && !busy) setMode(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden rounded-3xl p-0 sm:rounded-3xl">
          <DialogHeader className="border-b bg-slate-50 px-6 py-5 dark:bg-slate-900">
            <DialogTitle>
              {
                {
                  event: selected?.event_id
                    ? "Editar evento restaurant"
                    : "Crear evento restaurant",
                  booking: "Nueva reserva",
                  advance: "Registrar anticipo",
                  tables: "Asignar mesas",
                  cancel: "Cancelar reserva",
                }[mode || "event"]
              }
            </DialogTitle>
            <DialogDescription>
              {selected
                ? selected.guestName
                : e?.name || "Menú, fecha y lugares disponibles."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {mode === "event" && (
              <>
                <Field label="Nombre del evento">
                  <Input
                    value={event.name}
                    onChange={(x) =>
                      setEvent({ ...event, name: x.target.value })
                    }
                    placeholder="Cena de Navidad"
                  />
                </Field>
                <Field label="Qué incluye">
                  <Textarea
                    value={event.description}
                    onChange={(x) =>
                      setEvent({ ...event, description: x.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Fecha">
                    <Input
                      type="date"
                      value={event.date}
                      onChange={(x) =>
                        setEvent({ ...event, date: x.target.value })
                      }
                    />
                  </Field>
                  <Field label="Desde">
                    <Input
                      type="time"
                      value={event.time}
                      onChange={(x) =>
                        setEvent({ ...event, time: x.target.value })
                      }
                    />
                  </Field>
                  <Field label="Hasta">
                    <Input
                      type="time"
                      value={event.endTime}
                      onChange={(x) =>
                        setEvent({ ...event, endTime: x.target.value })
                      }
                    />
                  </Field>
                </div>
                {event.endTime < event.time && (
                  <p className="text-xs text-muted-foreground">
                    El evento termina al día siguiente.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Salón">
                    <select
                      className={selectClass}
                      value={event.areaId}
                      onChange={(x) => {
                        const a = catalog.data?.areas.find(
                          (a) => a.id === x.target.value,
                        );
                        setEvent({
                          ...event,
                          areaId: x.target.value,
                          capacity: String(a?.capacity || ""),
                        });
                      }}
                    >
                      <option value="">Elegir salón</option>
                      {catalog.data?.areas
                        .filter((a) => a.isActive === "true")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} · {a.capacity} personas
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Cupo de personas">
                    <Input
                      type="number"
                      min="1"
                      value={event.capacity}
                      onChange={(x) =>
                        setEvent({ ...event, capacity: x.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Precio por adulto">
                    <Input
                      inputMode="decimal"
                      value={event.adultPrice}
                      onChange={(x) =>
                        setEvent({ ...event, adultPrice: x.target.value })
                      }
                    />
                  </Field>
                  <Field label="Precio por niño">
                    <Input
                      inputMode="decimal"
                      value={event.childPrice}
                      onChange={(x) =>
                        setEvent({ ...event, childPrice: x.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
                  <h4 className="font-medium">
                    Productos incluidos en el menú
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Se cargan al iniciar el servicio, para enviarlos a cocina y
                    registrar su consumo de stock. Las cantidades son por
                    persona.
                  </p>
                  <Input
                    aria-label="Buscar producto incluido"
                    placeholder="Buscar plato o bebida…"
                    value={menuSearch}
                    onChange={(x) => setMenuSearch(x.target.value)}
                  />
                  <Field label="Producto">
                    <select
                      className={selectClass}
                      value={product}
                      onChange={(x) => setProduct(x.target.value)}
                    >
                      <option value="">Elegir producto</option>
                      {items
                        .filter(
                          (i) =>
                            i.isActive !== "false" &&
                            i.isAvailable !== "false" &&
                            i.name
                              .toLowerCase()
                              .includes(menuSearch.toLowerCase()),
                        )
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Para">
                      <select
                        className={selectClass}
                        value={audience}
                        onChange={(x) => setAudience(x.target.value)}
                      >
                        <option value="all">Todos</option>
                        <option value="adult">Adultos</option>
                        <option value="child">Niños</option>
                      </select>
                    </Field>
                    <Field label="Cantidad por persona">
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={quantity}
                        onChange={(x) => setQuantity(x.target.value)}
                      />
                    </Field>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!product || !Number(quantity)}
                    onClick={() => {
                      setEvent({
                        ...event,
                        menu: [
                          ...event.menu,
                          {
                            menuItemId: product,
                            audience,
                            quantity: Number(quantity),
                          },
                        ],
                      });
                      setProduct("");
                      setMenuSearch("");
                    }}
                  >
                    Agregar al menú
                  </Button>
                  <ul className="space-y-2">
                    {event.menu.map((line, index) => (
                      <li
                        key={index}
                        className="flex items-center justify-between gap-2 rounded-xl bg-background p-2 text-sm"
                      >
                        <span>
                          {items.find((i) => i.id === line.menuItemId)?.name} ·{" "}
                          {line.quantity} por{" "}
                          {line.audience === "all"
                            ? "persona"
                            : line.audience === "adult"
                              ? "adulto"
                              : "niño"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEvent({
                              ...event,
                              menu: event.menu.filter((_, n) => n !== index),
                            })
                          }
                        >
                          Quitar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            {mode === "booking" && (
              <>
                <Field label="Titular">
                  <Input
                    value={guest.guestName}
                    onChange={(x) =>
                      setGuest({ ...guest, guestName: x.target.value })
                    }
                  />
                </Field>
                <Field label="Teléfono">
                  <Input
                    value={guest.guestPhone}
                    onChange={(x) =>
                      setGuest({ ...guest, guestPhone: x.target.value })
                    }
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={guest.guestEmail}
                    onChange={(x) =>
                      setGuest({ ...guest, guestEmail: x.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Adultos">
                    <Input
                      type="number"
                      min="0"
                      value={guest.adults}
                      onChange={(x) =>
                        setGuest({ ...guest, adults: x.target.value })
                      }
                    />
                  </Field>
                  <Field label="Niños">
                    <Input
                      type="number"
                      min="0"
                      value={guest.children}
                      onChange={(x) =>
                        setGuest({ ...guest, children: x.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Observaciones / necesidades alimentarias">
                  <Textarea
                    value={guest.notes}
                    onChange={(x) =>
                      setGuest({ ...guest, notes: x.target.value })
                    }
                  />
                </Field>
                <p className="rounded-xl bg-blue-50 p-4 font-semibold text-blue-950 dark:bg-blue-950 dark:text-blue-100">
                  Total contratado:{" "}
                  {peso(
                    Number(guest.adults) * Number(e?.adult_price) +
                      Number(guest.children) * Number(e?.child_price),
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Se guarda sin mesa asignada. Después podés elegir una o varias
                  mesas.
                </p>
              </>
            )}
            {mode === "advance" && (
              <>
                <p>
                  Saldo pendiente:{" "}
                  <strong>
                    {peso(
                      Number(selected?.contracted_total) -
                        Number(selected?.advances),
                    )}
                  </strong>
                </p>
                <Field label="Importe del anticipo">
                  <Input
                    inputMode="decimal"
                    value={advance.amount}
                    onChange={(x) =>
                      setAdvance({ ...advance, amount: x.target.value })
                    }
                  />
                </Field>
                <Field label="Medio de pago">
                  <select
                    className={selectClass}
                    value={advance.method}
                    onChange={(x) =>
                      setAdvance({
                        ...advance,
                        method: x.target.value,
                        receiptType:
                          x.target.value === "efectivo"
                            ? advance.receiptType
                            : "FB",
                      })
                    }
                  >
                    {Object.entries({
                      efectivo: "Efectivo",
                      transferencia: "Transferencia",
                      tarjeta_debito: "Tarjeta de débito",
                      tarjeta_credito: "Tarjeta de crédito",
                      mercadopago: "Mercado Pago",
                    }).map(([key, name]) => (
                      <option value={key} key={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Comprobante">
                  <select
                    className={selectClass}
                    value={advance.receiptType}
                    onChange={(x) =>
                      setAdvance({ ...advance, receiptType: x.target.value })
                    }
                  >
                    {advance.method === "efectivo" && (
                      <option value="ticket">Ticket</option>
                    )}
                    <option value="FB">Factura B</option>
                  </select>
                </Field>
                {advance.receiptType === "FB" && (
                  <Field label="DNI del titular (Factura B)">
                    <Input
                      inputMode="numeric"
                      value={advance.dni}
                      onChange={(x) =>
                        setAdvance({ ...advance, dni: x.target.value })
                      }
                    />
                  </Field>
                )}
                <Field label="Referencia / observaciones">
                  <Input
                    value={advance.notes}
                    onChange={(x) =>
                      setAdvance({ ...advance, notes: x.target.value })
                    }
                  />
                </Field>
                <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950 dark:text-blue-100">
                  Se registra en el turno actual de Restaurant. El día del
                  evento se descuenta del total y se cobra el saldo restante.
                </p>
              </>
            )}
            {mode === "tables" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Elegí una o varias mesas. Podés guardar sin seleccionar
                  ninguna y asignarlas después.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detail.data?.tables.map((t) => {
                    const other = bookings.find(
                      (b) =>
                        b.reservation_id !== selected?.reservation_id &&
                        !["cancelled", "completed"].includes(b.status) &&
                        b.tables.some((x: Row) => x.id === t.id),
                    );
                    const checked = tableIds.includes(t.id);
                    return (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={!!other}
                        onClick={() =>
                          setTableIds((current) =>
                            current.includes(t.id)
                              ? current.filter((id) => id !== t.id)
                              : [...current, t.id],
                          )
                        }
                        key={t.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${checked ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : ""} ${other ? "opacity-50" : ""}`}
                      >
                        <CheckCircle2
                          className={
                            checked
                              ? "h-5 w-5 text-blue-600"
                              : "h-5 w-5 text-muted-foreground"
                          }
                        />
                        <span>
                          <strong>Mesa {t.number}</strong>
                          <span className="block text-xs text-muted-foreground">
                            {t.capacity} lugares{other ? " · Asignada" : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="font-medium">
                  {tableIds.length} mesas ·{" "}
                  {detail.data?.tables
                    .filter((t) => tableIds.includes(t.id))
                    .reduce((sum, t) => sum + t.capacity, 0)}{" "}
                  lugares ·{" "}
                  {Number(selected?.adults) + Number(selected?.children)}{" "}
                  comensales
                </p>
              </>
            )}
            {mode === "cancel" && (
              <>
                <p className="text-sm">
                  Los anticipos quedan conservados para su revisión por
                  Administración.
                </p>
                <Field label="Motivo">
                  <Textarea
                    value={reason}
                    onChange={(x) => setReason(x.target.value)}
                  />
                </Field>
              </>
            )}
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setMode(null)}
              disabled={busy}
            >
              Volver
            </Button>
            <Button
              onClick={submit}
              disabled={busy || (mode === "cancel" && reason.trim().length < 5)}
            >
              {busy
                ? "Guardando…"
                : mode === "advance"
                  ? "Registrar anticipo"
                  : mode === "booking"
                    ? "Crear reserva"
                    : mode === "event"
                      ? selected?.event_id
                        ? "Guardar evento"
                        : "Crear evento"
                      : mode === "cancel"
                        ? "Cancelar reserva"
                        : "Guardar mesas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const generated = useId(),
    child = children as React.ReactElement<{ id?: string }>;
  const id =
    isValidElement(child) && child.props.id ? child.props.id : generated;
  return (
    <div className="space-y-2 text-sm font-medium">
      <Label htmlFor={id}>{label}</Label>
      {isValidElement(child) ? cloneElement(child, { id }) : children}
    </div>
  );
}
