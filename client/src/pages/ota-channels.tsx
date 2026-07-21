import { useState } from "react";
import { fmtMoney } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Settings, RefreshCw, Check, X, AlertCircle, Clock, Trash2, Play } from "lucide-react";
import type { OTAChannelWithStats, OTAReservationLogWithChannel, OTAChannelType, OTAChannelStatus, OTASyncStatus } from "@shared/schema";

const channelTypeLabels: Record<OTAChannelType, string> = {
  booking: "Booking.com",
  expedia: "Expedia",
  airbnb: "Airbnb",
  despegar: "Despegar",
  hotelbeds: "Hotelbeds",
  agoda: "Agoda",
  trivago: "Trivago",
  manual: "Manual",
};

const channelTypeColors: Record<OTAChannelType, string> = {
  booking: "bg-blue-500",
  expedia: "bg-yellow-500",
  airbnb: "bg-rose-500",
  despegar: "bg-green-500",
  hotelbeds: "bg-orange-500",
  agoda: "bg-purple-500",
  trivago: "bg-cyan-500",
  manual: "bg-slate-500",
};

const statusBadge: Record<OTAChannelStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "Activo" },
  inactive: { variant: "secondary", label: "Inactivo" },
  pending: { variant: "outline", label: "Pendiente" },
  error: { variant: "destructive", label: "Error" },
};

const syncStatusBadge: Record<OTASyncStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "outline", label: "Pendiente" },
  synced: { variant: "default", label: "Sincronizado" },
  failed: { variant: "destructive", label: "Fallido" },
  cancelled: { variant: "secondary", label: "Cancelado" },
};

export default function OTAChannelsPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<OTAChannelWithStats | null>(null);
  const [newChannel, setNewChannel] = useState({
    name: "",
    channelType: "booking" as OTAChannelType,
    commissionPercent: "15.00",
    apiKey: "",
    apiSecret: "",
    hotelCode: "",
  });

  const { data: channels, isLoading: channelsLoading } = useQuery<OTAChannelWithStats[]>({
    queryKey: ["/api/ota-channels"],
  });

  const { data: reservationLogs, isLoading: logsLoading } = useQuery<OTAReservationLogWithChannel[]>({
    queryKey: ["/api/ota-reservations"],
  });

  const createChannelMutation = useMutation({
    mutationFn: async (data: typeof newChannel) => {
      return apiRequest("POST", "/api/ota-channels", {
        ...data,
        status: "inactive",
        syncEnabled: "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ota-channels"] });
      setIsAddDialogOpen(false);
      setNewChannel({
        name: "",
        channelType: "booking",
        commissionPercent: "15.00",
        apiKey: "",
        apiSecret: "",
        hotelCode: "",
      });
      toast({ title: "Canal creado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al crear el canal", variant: "destructive" });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OTAChannelWithStats> }) => {
      return apiRequest("PATCH", `/api/ota-channels/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ota-channels"] });
      toast({ title: "Canal actualizado" });
    },
    onError: () => {
      toast({ title: "Error al actualizar el canal", variant: "destructive" });
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/ota-channels/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ota-channels"] });
      setSelectedChannel(null);
      toast({ title: "Canal eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar el canal", variant: "destructive" });
    },
  });

  const simulateImportMutation = useMutation({
    mutationFn: async (channelId: string) => {
      return apiRequest("POST", `/api/ota-channels/${channelId}/simulate-import`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ota-reservations"] });
      toast({ title: "Reserva simulada importada" });
    },
    onError: () => {
      toast({ title: "Error al simular importación", variant: "destructive" });
    },
  });

  const syncReservationMutation = useMutation({
    mutationFn: async (logId: string) => {
      return apiRequest("POST", `/api/ota-reservations/${logId}/sync`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ota-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      toast({ title: "Reserva sincronizada al sistema" });
    },
    onError: () => {
      toast({ title: "Error al sincronizar reserva", variant: "destructive" });
    },
  });

  const pendingCount = reservationLogs?.filter((log) => log.status === "pending").length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Canales OTA</h1>
          <p className="text-muted-foreground">
            Gestiona las integraciones con agencias de viajes online
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-channel">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Canal
        </Button>
      </div>

      <Tabs defaultValue="channels" className="w-full">
        <TabsList>
          <TabsTrigger value="channels" data-testid="tab-channels">Canales</TabsTrigger>
          <TabsTrigger value="reservations" data-testid="tab-reservations" className="gap-2">
            Reservas
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4 mt-4">
          {channelsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : channels && channels.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {channels.map((channel) => (
                <Card
                  key={channel.id}
                  className="cursor-pointer transition-colors hover-elevate"
                  onClick={() => setSelectedChannel(channel)}
                  data-testid={`card-channel-${channel.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${channelTypeColors[channel.channelType as OTAChannelType]}`} />
                        <CardTitle className="text-base">{channel.name}</CardTitle>
                      </div>
                      <Badge variant={statusBadge[channel.status as OTAChannelStatus].variant}>
                        {statusBadge[channel.status as OTAChannelStatus].label}
                      </Badge>
                    </div>
                    <CardDescription>{channelTypeLabels[channel.channelType as OTAChannelType]}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Reservas</span>
                        <p className="font-medium" data-testid={`text-total-reservations-${channel.id}`}>
                          {channel.totalReservations}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pendientes</span>
                        <p className="font-medium" data-testid={`text-pending-sync-${channel.id}`}>
                          {channel.pendingSync}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Comisión</span>
                        <p className="font-medium">{channel.commissionPercent}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ingresos</span>
                        <p className="font-medium">${fmtMoney(channel.totalRevenue)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">No hay canales configurados</p>
                <Button variant="outline" className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar primer canal
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4 mt-4">
          {logsLoading ? (
            <Card>
              <CardContent className="py-6">
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          ) : reservationLogs && reservationLogs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Reservas de Canales OTA</CardTitle>
                <CardDescription>
                  Reservas recibidas de los canales de distribución
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {reservationLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                      data-testid={`row-ota-reservation-${log.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-8 rounded-full ${channelTypeColors[log.channel?.channelType as OTAChannelType] || "bg-slate-500"}`} />
                        <div>
                          <p className="font-medium">{log.guestName}</p>
                          <p className="text-sm text-muted-foreground">
                            {log.externalReservationId} - {log.checkInDate} al {log.checkOutDate}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-medium">${log.totalAmount}</p>
                          <p className="text-xs text-muted-foreground">
                            Comisión: ${log.commission}
                          </p>
                        </div>
                        <Badge variant={syncStatusBadge[log.status as OTASyncStatus].variant}>
                          {syncStatusBadge[log.status as OTASyncStatus].label}
                        </Badge>
                        {log.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => syncReservationMutation.mutate(log.id)}
                            disabled={syncReservationMutation.isPending}
                            data-testid={`button-sync-${log.id}`}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${syncReservationMutation.isPending ? "animate-spin" : ""}`} />
                            Sincronizar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">No hay reservas de canales OTA</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Canal OTA</DialogTitle>
            <DialogDescription>
              Configure una nueva integración con una agencia de viajes online
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="channelType">Tipo de Canal</Label>
              <Select
                value={newChannel.channelType}
                onValueChange={(value) => setNewChannel({ ...newChannel, channelType: value as OTAChannelType, name: channelTypeLabels[value as OTAChannelType] })}
              >
                <SelectTrigger data-testid="select-channel-type">
                  <SelectValue placeholder="Seleccionar canal" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(channelTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={newChannel.name}
                onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                placeholder="Nombre del canal"
                data-testid="input-channel-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commission">Comisión (%)</Label>
              <Input
                id="commission"
                value={newChannel.commissionPercent}
                onChange={(e) => setNewChannel({ ...newChannel, commissionPercent: e.target.value })}
                placeholder="15.00"
                data-testid="input-commission"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotelCode">Código de Hotel (opcional)</Label>
              <Input
                id="hotelCode"
                value={newChannel.hotelCode}
                onChange={(e) => setNewChannel({ ...newChannel, hotelCode: e.target.value })}
                placeholder="Código en el canal"
                data-testid="input-hotel-code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createChannelMutation.mutate(newChannel)}
              disabled={!newChannel.name || createChannelMutation.isPending}
              data-testid="button-save-channel"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedChannel} onOpenChange={() => setSelectedChannel(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedChannel && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${channelTypeColors[selectedChannel.channelType as OTAChannelType]}`} />
                  <DialogTitle>{selectedChannel.name}</DialogTitle>
                </div>
                <DialogDescription>
                  {channelTypeLabels[selectedChannel.channelType as OTAChannelType]}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between">
                  <Label>Estado</Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedChannel.status === "active"}
                      onCheckedChange={(checked) => {
                        updateChannelMutation.mutate({
                          id: selectedChannel.id,
                          data: { status: checked ? "active" : "inactive" },
                        });
                        setSelectedChannel({ ...selectedChannel, status: checked ? "active" : "inactive" });
                      }}
                      data-testid="switch-channel-status"
                    />
                    <span className="text-sm">
                      {selectedChannel.status === "active" ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Reservas</span>
                    <p className="font-medium text-lg">{selectedChannel.totalReservations}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pendientes</span>
                    <p className="font-medium text-lg">{selectedChannel.pendingSync}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ingresos Totales</span>
                    <p className="font-medium text-lg">${fmtMoney(selectedChannel.totalRevenue)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Comisiones Pagadas</span>
                    <p className="font-medium text-lg">${fmtMoney(selectedChannel.totalCommission)}</p>
                  </div>
                </div>
                {selectedChannel.lastSyncAt && (
                  <div className="text-sm text-muted-foreground">
                    Última sincronización: {new Date(selectedChannel.lastSyncAt).toLocaleString("es-AR")}
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => simulateImportMutation.mutate(selectedChannel.id)}
                  disabled={simulateImportMutation.isPending}
                  data-testid="button-simulate-import"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Simular Reserva
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteChannelMutation.mutate(selectedChannel.id)}
                  disabled={deleteChannelMutation.isPending}
                  data-testid="button-delete-channel"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
