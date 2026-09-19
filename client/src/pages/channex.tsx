import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, PlugZap, Info } from "lucide-react";
import type {
  ChannexBooking,
  ChannexBookingStatus,
  ChannexConnectionPublic,
  ChannexEnvironment,
  ChannexRoomTypeMapping,
  ChannexRatePlanMapping,
} from "@shared/schema";

const CHANNEX_CONFIG_ROLES = ["admin", "manager", "resp_administracion", "jefe_recepcion"];

const STATUS_LABELS: Record<ChannexBookingStatus, string> = {
  new: "Nuevas",
  needs_review: "Requieren revisión",
  imported: "Importadas",
  modified: "Modificadas",
  cancelled: "Canceladas",
  error: "Con error",
};

const STATUS_BADGE: Record<ChannexBookingStatus, "default" | "secondary" | "destructive" | "outline"> = {
  new: "outline",
  needs_review: "secondary",
  imported: "default",
  modified: "secondary",
  cancelled: "outline",
  error: "destructive",
};

type MappingRow<TMapping> = TMapping & { name: string | null };

function fmtDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

export default function ChannexPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canConfigure = Boolean(user?.role && CHANNEX_CONFIG_ROLES.includes(user.role));

  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ChannexBookingStatus | "all">("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [newConnection, setNewConnection] = useState({
    label: "",
    environment: "demo" as ChannexEnvironment,
    channexPropertyId: "",
    apiKey: "",
    baseUrl: "https://staging.channex.io/api/v1",
  });

  const { data: connections, isLoading: connectionsLoading } = useQuery<ChannexConnectionPublic[]>({
    queryKey: ["/api/channex/connections"],
  });

  const activeConnectionId = selectedConnectionId || connections?.[0]?.id || "";
  const activeConnection = connections?.find((c) => c.id === activeConnectionId) ?? null;

  const { data: bookings, isLoading: bookingsLoading } = useQuery<ChannexBooking[]>({
    queryKey: ["/api/channex/bookings", activeConnectionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/channex/bookings?connectionId=${activeConnectionId}`);
      return res.json();
    },
    enabled: Boolean(activeConnectionId),
  });

  const { data: roomTypeMappings } = useQuery<MappingRow<ChannexRoomTypeMapping>[]>({
    queryKey: ["/api/channex/connections", activeConnectionId, "room-type-mappings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/channex/connections/${activeConnectionId}/room-type-mappings`);
      const rows = await res.json();
      return rows.map((r: any) => ({ ...r, name: r.roomTypeName }));
    },
    enabled: Boolean(activeConnectionId),
  });

  const { data: ratePlanMappings } = useQuery<MappingRow<ChannexRatePlanMapping>[]>({
    queryKey: ["/api/channex/connections", activeConnectionId, "rate-plan-mappings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/channex/connections/${activeConnectionId}/rate-plan-mappings`);
      const rows = await res.json();
      return rows.map((r: any) => ({ ...r, name: r.ratePlanName }));
    },
    enabled: Boolean(activeConnectionId),
  });

  const roomTypeTitleFor = (channexRoomTypeId: string | null) =>
    roomTypeMappings?.find((m) => m.channexRoomTypeId === channexRoomTypeId)?.channexRoomTypeTitle ?? channexRoomTypeId ?? "—";
  const ratePlanTitleFor = (channexRatePlanId: string | null) =>
    ratePlanMappings?.find((m) => m.channexRatePlanId === channexRatePlanId)?.channexRatePlanTitle ?? channexRatePlanId ?? "—";

  const syncBookingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/channex/connections/${activeConnectionId}/sync-bookings`);
      return res.json();
    },
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channex/bookings", activeConnectionId] });
      toast({
        title: "Sincronización completa",
        description: `${summary.fetched} novedades recibidas (${summary.created} nuevas, ${summary.updated} actualizadas)${summary.ackFailures ? ` — ${summary.ackFailures} sin confirmar a Channex` : ""}.`,
      });
    },
    onError: (err: any) => toast({ title: "Error al sincronizar", description: err.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/channex/bookings/${id}/import`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al importar");
      return res.json();
    },
    onSuccess: (preview) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channex/bookings", activeConnectionId] });
      toast({
        title: "Reserva aceptada (vista previa)",
        description: `${preview.roomTypeName} · ${preview.ratePlanName}. Esto NO crea una reserva en el PMS — es una vista previa de cómo quedaría, para que Recepción practique el mapeo y la revisión.`,
      });
    },
    onError: (err: any) => toast({ title: "No se pudo aceptar", description: err.message, variant: "destructive" }),
  });

  const markReviewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/channex/bookings/${id}/mark-review`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/channex/bookings", activeConnectionId] }),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/channex/bookings/${id}/retry`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al reintentar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channex/bookings", activeConnectionId] });
      toast({ title: "Reserva actualizada desde Channex" });
    },
    onError: (err: any) => toast({ title: "No se pudo reintentar", description: err.message, variant: "destructive" }),
  });

  const syncCatalogMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/channex/connections/${activeConnectionId}/sync-catalog`);
      return res.json();
    },
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channex/connections", activeConnectionId, "room-type-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channex/connections", activeConnectionId, "rate-plan-mappings"] });
      toast({ title: "Catálogo sincronizado", description: `${summary.roomTypes} habitaciones, ${summary.ratePlans} tarifas.` });
    },
    onError: (err: any) => toast({ title: "Error al sincronizar catálogo", description: err.message, variant: "destructive" }),
  });

  const createConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/channex/connections", newConnection);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al crear la conexión");
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channex/connections"] });
      setSelectedConnectionId(created.id);
      setNewConnection({ label: "", environment: "demo", channexPropertyId: "", apiKey: "", baseUrl: "https://staging.channex.io/api/v1" });
      toast({ title: "Conexión creada", description: "Ahora sincronizá el catálogo antes de traer reservas." });
    },
    onError: (err: any) => toast({ title: "No se pudo crear la conexión", description: err.message, variant: "destructive" }),
  });

  const updateRoomTypeMappingMutation = useMutation({
    mutationFn: async ({ id, roomTypeId }: { id: string; roomTypeId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/channex/room-type-mappings/${id}`, { roomTypeId });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/channex/connections", activeConnectionId, "room-type-mappings"] }),
  });

  const updateRatePlanMappingMutation = useMutation({
    mutationFn: async ({ id, ratePlanId }: { id: string; ratePlanId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/channex/rate-plan-mappings/${id}`, { ratePlanId });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/channex/connections", activeConnectionId, "rate-plan-mappings"] }),
  });

  const { data: allRoomTypes } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/room-types"] });
  const { data: allRatePlans } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/rate-plans"] });

  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    if (statusFilter === "all") return bookings;
    return bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  const counts = useMemo(() => {
    const base: Record<ChannexBookingStatus, number> = { new: 0, needs_review: 0, imported: 0, modified: 0, cancelled: 0, error: 0 };
    for (const b of bookings ?? []) base[b.status] += 1;
    return base;
  }, [bookings]);

  const selectedBooking = bookings?.find((b) => b.id === selectedBookingId) ?? null;

  return (
    <div className="p-6 space-y-6" data-testid="page-channex">
      <div>
        <h1 className="text-2xl font-bold">Channex</h1>
        <p className="text-muted-foreground">Channel manager — conexión de prueba con reservas reales del entorno demo.</p>
      </div>

      {activeConnection && (
        <div
          className={`rounded-md border p-3 flex items-start gap-2 ${
            activeConnection.environment === "demo"
              ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200"
              : "bg-red-50 border-red-300 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
          }`}
          data-testid="banner-channex-environment"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">
              {activeConnection.environment === "demo" ? "CHANNEX — ENTORNO DE PRUEBA" : "CHANNEX — PROPIEDAD REAL"}
            </p>
            <p>
              {activeConnection.environment === "demo"
                ? "Estas reservas no afectan la operación real. \"Aceptar\" no crea ninguna reserva en el PMS — solo muestra cómo quedaría."
                : "Conexión marcada como real, pero esta fase del sistema todavía no crea reservas reales ni envía disponibilidad/tarifas a Channex."}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {connections && connections.length > 0 && (
          <Select value={activeConnectionId} onValueChange={setSelectedConnectionId}>
            <SelectTrigger className="w-64" data-testid="select-channex-connection">
              <SelectValue placeholder="Elegir conexión" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label} ({c.environment === "demo" ? "prueba" : "real"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          disabled={!activeConnectionId || syncBookingsMutation.isPending}
          onClick={() => syncBookingsMutation.mutate()}
          data-testid="button-sync-bookings"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncBookingsMutation.isPending ? "animate-spin" : ""}`} />
          Sincronizar reservas
        </Button>
        {activeConnection?.lastBookingSyncAt && (
          <span className="text-xs text-muted-foreground">
            Última sincronización: {new Date(activeConnection.lastBookingSyncAt).toLocaleString("es-AR")}
          </span>
        )}
      </div>

      {connectionsLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !connections || connections.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4" />
            Todavía no hay ninguna conexión de Channex configurada.
            {canConfigure ? " Creala en la pestaña \"Conexión\"." : " Pedile a Jefatura/Gerencia/Administración que la configure."}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="bandeja">
          <TabsList>
            <TabsTrigger value="bandeja" data-testid="tab-bandeja">Bandeja</TabsTrigger>
            {canConfigure && <TabsTrigger value="mapeo" data-testid="tab-mapeo">Mapeo</TabsTrigger>}
            {canConfigure && <TabsTrigger value="conexion" data-testid="tab-conexion">Conexión</TabsTrigger>}
          </TabsList>

          <TabsContent value="bandeja" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={statusFilter === "all" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter("all")}
              >
                Todas ({bookings?.length ?? 0})
              </Badge>
              {(Object.keys(STATUS_LABELS) as ChannexBookingStatus[]).map((status) => (
                <Badge
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setStatusFilter(status)}
                  data-testid={`filter-status-${status}`}
                >
                  {STATUS_LABELS[status]} ({counts[status]})
                </Badge>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                {bookingsLoading ? (
                  <div className="p-6"><Skeleton className="h-40 w-full" /></div>
                ) : filteredBookings.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No hay reservas en este estado. Probá "Sincronizar reservas".</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead>Localizador</TableHead>
                        <TableHead>Huésped</TableHead>
                        <TableHead>Entrada</TableHead>
                        <TableHead>Salida</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Tarifa</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map((booking) => (
                        <TableRow key={booking.id} data-testid={`row-booking-${booking.id}`}>
                          <TableCell>{booking.otaName ?? "—"}</TableCell>
                          <TableCell
                            className="font-mono text-xs cursor-pointer underline"
                            onClick={() => setSelectedBookingId(booking.id)}
                          >
                            {booking.channexBookingId}
                          </TableCell>
                          <TableCell>{booking.guestName ?? "—"}</TableCell>
                          <TableCell>{fmtDate(booking.arrivalDate)}</TableCell>
                          <TableCell>{fmtDate(booking.departureDate)}</TableCell>
                          <TableCell>{roomTypeTitleFor(booking.channexRoomTypeId)}</TableCell>
                          <TableCell>{ratePlanTitleFor(booking.channexRatePlanId)}</TableCell>
                          <TableCell>{booking.totalAmount ? `${booking.currency ?? ""} ${booking.totalAmount}` : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_BADGE[booking.status]}>{STATUS_LABELS[booking.status]}</Badge>
                            {!booking.isMapped && booking.status !== "cancelled" && (
                              <div className="text-xs text-destructive mt-1">falta mapeo</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!booking.isMapped || booking.status === "cancelled" || importMutation.isPending}
                              onClick={() => importMutation.mutate(booking.id)}
                              data-testid={`button-import-${booking.id}`}
                              title="No crea una reserva en el PMS — solo marca esta reserva de Channex como aceptada/revisada."
                            >
                              Aceptar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => markReviewMutation.mutate(booking.id)}>
                              Revisión
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => retryMutation.mutate(booking.id)}>
                              Reintentar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canConfigure && (
            <TabsContent value="mapeo" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Una reserva no se puede importar hasta que su habitación y tarifa de Channex tengan un mapeo asignado.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncCatalogMutation.isPending}
                  onClick={() => syncCatalogMutation.mutate()}
                  data-testid="button-sync-catalog"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncCatalogMutation.isPending ? "animate-spin" : ""}`} />
                  Sincronizar catálogo
                </Button>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Habitaciones</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(roomTypeMappings ?? []).map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="w-48 truncate text-sm">{m.channexRoomTypeTitle}</span>
                      <Select
                        value={m.roomTypeId ?? "none"}
                        onValueChange={(value) => updateRoomTypeMappingMutation.mutate({ id: m.id, roomTypeId: value === "none" ? null : value })}
                      >
                        <SelectTrigger className="w-64" data-testid={`select-room-type-mapping-${m.id}`}>
                          <SelectValue placeholder="Sin mapear" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin mapear</SelectItem>
                          {(allRoomTypes ?? []).map((rt) => (
                            <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {(!roomTypeMappings || roomTypeMappings.length === 0) && (
                    <p className="text-sm text-muted-foreground">Sin datos — sincronizá el catálogo primero.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Tarifas</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(ratePlanMappings ?? []).map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="w-48 truncate text-sm">{m.channexRatePlanTitle}</span>
                      <Select
                        value={m.ratePlanId ?? "none"}
                        onValueChange={(value) => updateRatePlanMappingMutation.mutate({ id: m.id, ratePlanId: value === "none" ? null : value })}
                      >
                        <SelectTrigger className="w-64" data-testid={`select-rate-plan-mapping-${m.id}`}>
                          <SelectValue placeholder="Sin mapear" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin mapear</SelectItem>
                          {(allRatePlans ?? []).map((rp) => (
                            <SelectItem key={rp.id} value={rp.id}>{rp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {(!ratePlanMappings || ratePlanMappings.length === 0) && (
                    <p className="text-sm text-muted-foreground">Sin datos — sincronizá el catálogo primero.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canConfigure && (
            <TabsContent value="conexion">
              <Card>
                <CardHeader>
                  <CardTitle>Conexiones</CardTitle>
                  <CardDescription>La API key nunca se muestra de nuevo después de guardarla.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(connections ?? []).map((c) => (
                    <div key={c.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                      <div>
                        <p className="font-medium">{c.label} <Badge variant="outline">{c.environment === "demo" ? "prueba" : "real"}</Badge></p>
                        <p className="text-muted-foreground text-xs">Property ID: {c.channexPropertyId} · {c.baseUrl}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><PlugZap className="h-4 w-4" /> Nueva conexión</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nombre</Label>
                      <Input value={newConnection.label} onChange={(e) => setNewConnection({ ...newConnection, label: e.target.value })} data-testid="input-connection-label" />
                    </div>
                    <div>
                      <Label>Entorno</Label>
                      <Select value={newConnection.environment} onValueChange={(v) => setNewConnection({ ...newConnection, environment: v as ChannexEnvironment })}>
                        <SelectTrigger data-testid="select-connection-environment"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="demo">Prueba (demo)</SelectItem>
                          <SelectItem value="real">Real</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Property ID de Channex</Label>
                      <Input value={newConnection.channexPropertyId} onChange={(e) => setNewConnection({ ...newConnection, channexPropertyId: e.target.value })} data-testid="input-connection-property-id" />
                    </div>
                    <div>
                      <Label>API Key</Label>
                      <Input type="password" value={newConnection.apiKey} onChange={(e) => setNewConnection({ ...newConnection, apiKey: e.target.value })} data-testid="input-connection-api-key" />
                    </div>
                    <div className="col-span-2">
                      <Label>Base URL</Label>
                      <Input value={newConnection.baseUrl} onChange={(e) => setNewConnection({ ...newConnection, baseUrl: e.target.value })} data-testid="input-connection-base-url" />
                    </div>
                  </div>
                  <Button
                    disabled={!newConnection.label || !newConnection.channexPropertyId || !newConnection.apiKey || createConnectionMutation.isPending}
                    onClick={() => createConnectionMutation.mutate()}
                    data-testid="button-create-connection"
                  >
                    Crear conexión
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}

      <Dialog open={Boolean(selectedBooking)} onOpenChange={(open) => !open && setSelectedBookingId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reserva {selectedBooking?.channexBookingId}</DialogTitle>
            <DialogDescription>{selectedBooking?.otaName} · {STATUS_LABELS[selectedBooking?.status ?? "new"]}</DialogDescription>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-3 text-sm">
              {selectedBooking.errorMessage && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive text-xs">
                  {selectedBooking.errorMessage}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <p><span className="text-muted-foreground">Huésped:</span> {selectedBooking.guestName ?? "—"}</p>
                <p><span className="text-muted-foreground">Email:</span> {selectedBooking.guestEmail ?? "—"}</p>
                <p><span className="text-muted-foreground">Teléfono:</span> {selectedBooking.guestPhone ?? "—"}</p>
                <p><span className="text-muted-foreground">Adultos/Menores/Infantes:</span> {selectedBooking.adults ?? 0}/{selectedBooking.children ?? 0}/{selectedBooking.infants ?? 0}</p>
                <p><span className="text-muted-foreground">Entrada:</span> {fmtDate(selectedBooking.arrivalDate)}</p>
                <p><span className="text-muted-foreground">Salida:</span> {fmtDate(selectedBooking.departureDate)}</p>
                <p><span className="text-muted-foreground">Categoría:</span> {roomTypeTitleFor(selectedBooking.channexRoomTypeId)}</p>
                <p><span className="text-muted-foreground">Tarifa:</span> {ratePlanTitleFor(selectedBooking.channexRatePlanId)}</p>
                <p><span className="text-muted-foreground">Total:</span> {selectedBooking.currency} {selectedBooking.totalAmount}</p>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Ver datos crudos de Channex</summary>
                <pre className="whitespace-pre-wrap break-all bg-muted p-2 rounded mt-1">{JSON.stringify(selectedBooking.rawPayload, null, 2)}</pre>
              </details>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!selectedBooking?.isMapped || selectedBooking?.status === "cancelled"}
              onClick={() => selectedBooking && importMutation.mutate(selectedBooking.id)}
              title="No crea una reserva en el PMS — solo marca esta reserva de Channex como aceptada/revisada."
            >
              Aceptar
            </Button>
            <Button variant="ghost" onClick={() => selectedBooking && markReviewMutation.mutate(selectedBooking.id)}>Marcar para revisión</Button>
            <Button variant="ghost" onClick={() => selectedBooking && retryMutation.mutate(selectedBooking.id)}>Reintentar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
