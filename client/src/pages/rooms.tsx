import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DoorOpen,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
  Wrench,
  Sparkles,
  CheckCircle,
  Accessibility,
  Fence,
  BedDouble,
  Sofa,
  ShowerHead,
  BedSingle,
  Users,
  Home,
  AlertTriangle,
  ReceiptText,
  X,
  Ban,
  ShieldCheck,
  LogIn,
  LogOut,
  Clock,
  User,
  Eye,
  OctagonMinus,
  Phone,
  Calendar,
  RefreshCw,
  ShieldAlert,
  Utensils,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/App";
import type { RoomWithType, RoomType, InsertRoom, RoomStatus, ChargeType, SystemUserRole } from "@shared/schema";

// Roles que pueden crear/editar habitaciones y gestionar cargos
const ROOM_ADMIN_ROLES: SystemUserRole[] = ["admin", "manager", "ama_de_llaves", "resp_deposito", "resp_administracion", "jefe_recepcion", "comercial"];

function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    available: { label: "Libre limpia", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    occupied: { label: "Ocupada", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    dirty: { label: "Libre sucia", className: "bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-400" },
    cleaning: { label: "En limpieza", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
    maintenance: { label: "Mantenimiento", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    oos: { label: "Fuera de Servicio", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
    inspected: { label: "Inspeccionada", className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400" },
    limpia_ocupada: { label: "Limpia ocupada", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
    no_molestar: { label: "No molestar", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  };

  const config = statusConfig[status] ?? { label: status, className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" };

  return <Badge className={config.className}>{config.label}</Badge>;
}

const featureConfig: Record<string, { icon: typeof Accessibility; label: string }> = {
  accessible: { icon: Accessibility, label: "Accesible" },
  balcony: { icon: Fence, label: "Balcon" },
  separable_bed: { icon: BedDouble, label: "Cama separable" },
  sofa_bed: { icon: Sofa, label: "Sofa cama" },
  shower_only: { icon: ShowerHead, label: "Solo ducha" },
  extra_bed: { icon: BedSingle, label: "Cama extra" },
  twin_config: { icon: BedSingle, label: "Config. Twin" },
  living_room: { icon: Home, label: "Living" },
};

function RoomFeatures({ features, maxOccupancy }: { features?: string[] | null; maxOccupancy?: number | null }) {
  if (!features || features.length === 0) {
    return maxOccupancy ? (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Users className="h-3 w-3" />
        <span className="text-xs">{maxOccupancy}</span>
      </div>
    ) : null;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {maxOccupancy && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <Users className="h-3 w-3" />
              <span className="text-xs">{maxOccupancy}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Max. {maxOccupancy} pax</TooltipContent>
        </Tooltip>
      )}
      {features.map((feature) => {
        const config = featureConfig[feature];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <Tooltip key={feature}>
            <TooltipTrigger asChild>
              <div className="text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent>{config.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function RoomDropdownMenu({
  room,
  onEdit,
  onStatus,
  onMaintenance,
  onToggleActive,
  canManage,
}: {
  room: RoomWithType;
  onEdit: () => void;
  onStatus: (s: RoomStatus) => void;
  onMaintenance: () => void;
  onToggleActive: () => void;
  canManage: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`btn-menu-${room.id}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canManage && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar habitación
          </DropdownMenuItem>
        )}
        {canManage && <DropdownMenuSeparator />}
        {room.isActive !== false && (
          <>
            <DropdownMenuItem onClick={() => onStatus("available")}>
              <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
              Libre limpia
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus("dirty")}>
              <OctagonMinus className="mr-2 h-4 w-4 text-orange-500" />
              Libre sucia
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus("cleaning")}>
              <Sparkles className="mr-2 h-4 w-4 text-yellow-600" />
              Enviar a Limpieza
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus("inspected")}>
              <Eye className="mr-2 h-4 w-4 text-teal-600" />
              Inspeccionada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus("limpia_ocupada")}>
              <ShieldCheck className="mr-2 h-4 w-4 text-emerald-600" />
              Limpia ocupada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus("no_molestar")}>
              <Ban className="mr-2 h-4 w-4 text-purple-600" />
              No molestar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMaintenance}>
              <Wrench className="mr-2 h-4 w-4 text-orange-500" />
              Reportar a Mantenimiento
            </DropdownMenuItem>
          </>
        )}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={room.isActive !== false ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}
              onClick={onToggleActive}
            >
              {room.isActive !== false
                ? <><OctagonMinus className="mr-2 h-4 w-4" />Deshabilitar habitación</>
                : <><Eye className="mr-2 h-4 w-4" />Habilitar habitación</>
              }
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoomFormDialog({
  room,
  roomTypes,
  open,
  onOpenChange,
  onSuccess,
}: {
  room?: RoomWithType;
  roomTypes: RoomType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!room;

  const [formData, setFormData] = useState<Partial<InsertRoom>>({
    roomNumber: room?.roomNumber || "",
    roomTypeId: room?.roomTypeId || "",
    floor: room?.floor || 1,
    status: room?.status || "available",
    notes: room?.notes || "",
  });

  useEffect(() => {
    if (open) {
      setFormData({
        roomNumber: room?.roomNumber || "",
        roomTypeId: room?.roomTypeId || "",
        floor: room?.floor || 1,
        status: room?.status || "available",
        notes: room?.notes || "",
      });
    }
  }, [open, room?.id]);

  const mutation = useMutation({
    mutationFn: async (data: Partial<InsertRoom>) => {
      if (isEditing) {
        return apiRequest("PATCH", `/api/rooms/${room.id}`, data);
      }
      return apiRequest("POST", "/api/rooms", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: isEditing ? "Habitación actualizada" : "Habitación creada",
        description: `La habitación ${formData.roomNumber} ha sido ${isEditing ? "actualizada" : "creada"} exitosamente.`,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar la habitación. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Habitación" : "Nueva Habitación"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los detalles de la habitación."
              : "Ingresa los datos para crear una nueva habitación."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="roomNumber">Número de Habitación</Label>
              <Input
                id="roomNumber"
                value={formData.roomNumber}
                onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                placeholder="101"
                required
                data-testid="input-room-number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="roomType">Tipo de Habitación</Label>
              <Select
                value={formData.roomTypeId}
                onValueChange={(value) => setFormData({ ...formData, roomTypeId: value })}
              >
                <SelectTrigger data-testid="select-room-type">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.filter(type => type.id).map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="floor">Piso</Label>
              <Input
                id="floor"
                type="number"
                min={1}
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                data-testid="input-floor"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as RoomStatus })}
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="occupied">Ocupada</SelectItem>
                  <SelectItem value="dirty">Sucia</SelectItem>
                  <SelectItem value="cleaning">Limpieza</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento</SelectItem>
                  <SelectItem value="oos">Fuera de Servicio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas adicionales..."
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-room">
              {mutation.isPending ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Habitación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════
// OCUPADAS VIEW — Habitaciones con huéspedes alojados
// ══════════════════════════════════════════════════════════

const SOURCE_LABELS: Record<string, string> = {
  direct: "Directo", booking: "Booking.com", airbnb: "Airbnb",
  expedia: "Expedia", phone: "Teléfono", walk_in: "Walk-in",
  web: "Web", agency: "Agencia", company: "Empresa", other: "Otro",
};
const SEGMENT_LABELS: Record<string, string> = {
  LEISURE: "Turismo", CORP: "Corporativo", SPORT: "Deportivo",
  CONGRESS: "Congreso", OTHER: "Otro",
};

function OcupadaCard({ item }: { item: any }) {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const checkOutToday = item.checkOut === todayStr;
  const checkOutTomorrow = item.nightsRemaining === 1;

  return (
    <Card
      className={`relative overflow-hidden border-2 ${
        checkOutToday
          ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10"
          : "border-blue-200 dark:border-blue-800"
      }`}
      data-testid={`inhouse-card-${item.reservationId}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-3xl font-bold tracking-tight">{item.roomNumber}</CardTitle>
              <span className="text-xs text-muted-foreground">Piso {item.floor}</span>
            </div>
            <CardDescription className="text-xs mt-0.5">{item.roomTypeName || "Sin tipo"}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {checkOutToday && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px]">
                <LogOut className="h-2.5 w-2.5 mr-0.5" />Salida hoy
              </Badge>
            )}
            {!checkOutToday && checkOutTomorrow && (
              <Badge variant="outline" className="text-[10px] text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700">Salida mañana</Badge>
            )}
            {item.reservationStatus === "web_checkin" && (
              <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-[10px]">Web CI</Badge>
            )}
            {item.earlyCheckIn && (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[10px]">
                <Clock className="h-2.5 w-2.5 mr-0.5" />Early {item.earlyCheckInTime || ""}
              </Badge>
            )}
            {item.lateCheckOut && (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                <Clock className="h-2.5 w-2.5 mr-0.5" />Late {item.lateCheckOutTime || ""}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Huésped */}
        <div className="min-h-[40px]">
          {item.guest ? (
            <div>
              <div className="font-semibold text-sm leading-tight">
                {item.guest.lastName}{item.guest.firstName ? `, ${item.guest.firstName}` : ""}
              </div>
              {item.guest.segment && (
                <p className="text-[10px] text-muted-foreground">{SEGMENT_LABELS[item.guest.segment] || item.guest.segment}</p>
              )}
              {item.guest.phone && (
                <a href={`tel:${item.guest.phone}`} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                  <Phone className="h-3 w-3" />{item.guest.phone}
                </a>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">Sin huésped asignado</div>
          )}
        </div>

        {/* Estadía */}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              {new Date(item.checkIn + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
              {" → "}
              {new Date(item.checkOut + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
            </span>
            <span className={`font-medium text-[11px] ${
              item.nightsRemaining <= 0 ? "text-amber-600 dark:text-amber-400" :
              item.nightsRemaining === 1 ? "text-orange-500 dark:text-orange-400" : "text-foreground"
            }`}>
              {item.nightsRemaining <= 0 ? "Sale hoy" : `${item.nightsRemaining}n restantes`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {item.adults}A{item.children > 0 ? ` + ${item.children}N` : ""}
              {item.companionsCount > 0 ? ` · ${item.companionsCount} acomp.` : ""}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>{SOURCE_LABELS[item.source] || item.source}</span>
          </div>
        </div>

        {/* Saldo del folio */}
        <div className={`flex items-center justify-between rounded-md px-3 py-2 ${
          item.folioBalance <= 0
            ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
            : item.folioBalance < 10000
            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
        }`}>
          <span className="text-xs font-medium">Saldo cuenta</span>
          <span className="text-sm font-bold tabular-nums">
            {item.folioBalance < 0 ? (
              <span>−${Math.abs(item.folioBalance).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] font-normal opacity-70">a favor</span></span>
            ) : (
              `$${item.folioBalance.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            )}
          </span>
        </div>

        {/* Hospitalidad */}
        {(item.hasPreferences || item.pendingAlertsCount > 0) && (
          <div className="flex flex-wrap gap-1 border-t pt-2">
            {item.hasCritical && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-[10px] gap-0.5">
                <ShieldAlert className="h-3 w-3" />Pref. crítica
              </Badge>
            )}
            {item.hasSpecialDate && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 text-[10px]">
                🎂 Fecha especial
              </Badge>
            )}
            {item.hasDiet && (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-[10px] gap-0.5">
                <Utensils className="h-3 w-3" />Dietario
              </Badge>
            )}
            {item.hasPreferences && !item.hasCritical && !item.hasSpecialDate && !item.hasDiet && (
              <Badge variant="outline" className="text-[10px]">
                <User className="h-3 w-3 mr-0.5" />{item.prefsCount} prefer.
              </Badge>
            )}
            {item.pendingAlertsCount > 0 && (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-[10px] gap-0.5">
                <AlertTriangle className="h-3 w-3" />{item.pendingAlertsCount} alerta{item.pendingAlertsCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ArrivingCard({ item }: { item: any }) {
  return (
    <Card
      className="relative overflow-hidden border-2 border-green-200 dark:border-green-800 bg-green-50/20 dark:bg-green-900/10"
      data-testid={`arriving-card-${item.reservationId}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-3xl font-bold tracking-tight">{item.roomNumber}</CardTitle>
              <span className="text-xs text-muted-foreground">Piso {item.floor}</span>
            </div>
            <CardDescription className="text-xs mt-0.5">{item.roomTypeName || "Sin tipo"}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
              <LogIn className="h-2.5 w-2.5 mr-0.5" />Por ingresar
            </Badge>
            {item.reservationStatus === "web_checkin" && (
              <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-[10px]">Web CI</Badge>
            )}
            {item.earlyCheckIn && (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[10px]">
                <Clock className="h-2.5 w-2.5 mr-0.5" />Early {item.earlyCheckInTime || ""}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Huésped */}
        <div className="min-h-[40px]">
          {item.guest ? (
            <div>
              <div className="font-semibold text-sm leading-tight">
                {item.guest.lastName}{item.guest.firstName ? `, ${item.guest.firstName}` : ""}
              </div>
              {item.guest.phone && (
                <a href={`tel:${item.guest.phone}`} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                  <Phone className="h-3 w-3" />{item.guest.phone}
                </a>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">Sin huésped asignado</div>
          )}
        </div>
        {/* Estadía */}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              {new Date(item.checkIn + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
              {" → "}
              {new Date(item.checkOut + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
            </span>
            <span className="font-medium text-[11px] text-foreground">{item.nights}n</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {item.adults}A{item.children > 0 ? ` + ${item.children}N` : ""}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>{SOURCE_LABELS[item.source] || item.source}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OcupadasView() {
  const [search, setSearch] = useState("");
  const { data: inHouse = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/rooms/in-house"],
  });
  const { data: arriving = [], isLoading: isLoadingArriving, refetch: refetchArriving, isFetching: isFetchingArriving } = useQuery<any[]>({
    queryKey: ["/api/rooms/arriving-today"],
  });

  const filtered = search.trim()
    ? inHouse.filter(item =>
        item.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
        (item.guest && `${item.guest.firstName ?? ""} ${item.guest.lastName ?? ""}`.toLowerCase().includes(search.toLowerCase()))
      )
    : inHouse;

  const filteredArriving = search.trim()
    ? arriving.filter(item =>
        item.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
        (item.guest && `${item.guest.firstName ?? ""} ${item.guest.lastName ?? ""}`.toLowerCase().includes(search.toLowerCase()))
      )
    : arriving;

  const exitingToday = inHouse.filter(i => i.nightsRemaining <= 0).length;
  const withBalance = inHouse.filter(i => i.folioBalance > 0).length;

  const handleRefresh = () => { refetch(); refetchArriving(); };

  if (isLoading || isLoadingArriving) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-72" />)}
      </div>
    );
  }

  if (inHouse.length === 0 && arriving.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BedDouble className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No hay huéspedes alojados</h3>
          <p className="text-muted-foreground">No hay reservas con check-in activo ni llegadas programadas para hoy.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen rápido */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg px-3 py-2 text-sm font-medium">
          <BedDouble className="h-4 w-4" />
          {inHouse.length} alojado{inHouse.length !== 1 ? "s" : ""}
        </div>
        {arriving.length > 0 && (
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg px-3 py-2 text-sm font-medium">
            <LogIn className="h-4 w-4" />
            {arriving.length} ingresan hoy
          </div>
        )}
        {exitingToday > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-2 text-sm font-medium">
            <LogOut className="h-4 w-4" />
            {exitingToday} salen hoy
          </div>
        )}
        {withBalance > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded-lg px-3 py-2 text-sm font-medium">
            <ReceiptText className="h-4 w-4" />
            {withBalance} con saldo
          </div>
        )}
        {arriving.length > 0 && inHouse.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-2.5 py-1.5">
            <span>Ocupación comprometida:</span>
            <span className="font-semibold text-foreground">{inHouse.length + arriving.length} hab.</span>
          </div>
        )}
      </div>

      {/* Búsqueda */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Hab. o huésped..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-inhouse"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isFetching || isFetchingArriving}
          title="Actualizar"
          data-testid="btn-refresh-inhouse"
        >
          <RefreshCw className={`h-4 w-4 ${(isFetching || isFetchingArriving) ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-sm text-muted-foreground">{filtered.length + filteredArriving.length} habitaciones</span>
      </div>

      {/* Grilla ocupadas */}
      {filtered.length > 0 && (
        <>
          {arriving.length > 0 && (
            <div className="flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Alojados ahora</span>
              <div className="flex-1 border-t border-blue-200 dark:border-blue-800 ml-1" />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(item => (
              <OcupadaCard key={item.reservationId} item={item} />
            ))}
          </div>
        </>
      )}

      {filtered.length === 0 && search && inHouse.length > 0 && (
        <div className="text-center text-muted-foreground py-4">
          Sin alojados para "<span className="font-medium">{search}</span>"
        </div>
      )}

      {/* Sección llegadas de hoy */}
      {filteredArriving.length > 0 && (
        <div className="space-y-3 mt-2">
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-green-500" />
            <span className="text-sm font-semibold text-green-700 dark:text-green-300">Llegadas de hoy</span>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
              {filteredArriving.length} pendiente{filteredArriving.length !== 1 ? "s" : ""}
            </Badge>
            <div className="flex-1 border-t border-green-200 dark:border-green-800 ml-1" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredArriving.map(item => (
              <ArrivingCard key={item.reservationId} item={item} />
            ))}
          </div>
        </div>
      )}

      {filteredArriving.length === 0 && search && arriving.length > 0 && (
        <div className="text-center text-muted-foreground py-4">
          Sin llegadas para "<span className="font-medium">{search}</span>"
        </div>
      )}
    </div>
  );
}

export default function RoomsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = ROOM_ADMIN_ROLES.includes((user?.role ?? "") as SystemUserRole);
  const [activeTab, setActiveTab] = useState<"inventario" | "ocupadas">("inventario");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithType | undefined>();
  const [maintenanceTarget, setMaintenanceTarget] = useState<RoomWithType | null>(null);
  const [maintenanceDescription, setMaintenanceDescription] = useState("");

  // ── Charge Types panel ──────────────────────────────────────────────────────
  const [chargesSheetOpen, setChargesSheetOpen] = useState(false);
  const [editingCT, setEditingCT] = useState<ChargeType | null>(null);
  const [ctLabel, setCtLabel] = useState("");
  const [ctDescription, setCtDescription] = useState("");
  const [ctAmount, setCtAmount] = useState("");
  const [ctCategory, setCtCategory] = useState("otros");
  const [ctAllowPriceEdit, setCtAllowPriceEdit] = useState(false);
  const [ctFormOpen, setCtFormOpen] = useState(false);
  const [deletingCTId, setDeletingCTId] = useState<string | null>(null);

  const { data: chargeTypesList = [] } = useQuery<ChargeType[]>({
    queryKey: ["/api/charge-types/all"],
    enabled: chargesSheetOpen,
  });

  function openNewCT() {
    setEditingCT(null);
    setCtLabel(""); setCtDescription(""); setCtAmount(""); setCtCategory("otros"); setCtAllowPriceEdit(false);
    setCtFormOpen(true);
  }
  function openEditCT(ct: ChargeType) {
    setEditingCT(ct);
    setCtLabel(ct.label); setCtDescription(ct.description);
    setCtAmount(String(ct.defaultAmount)); setCtCategory(ct.category);
    setCtAllowPriceEdit(ct.allowPriceEdit ?? false);
    setCtFormOpen(true);
  }

  const saveCTMutation = useMutation({
    mutationFn: () => editingCT
      ? apiRequest("PATCH", `/api/charge-types/${editingCT.id}`, { label: ctLabel, description: ctDescription, defaultAmount: parseFloat(ctAmount), category: ctCategory, allowPriceEdit: ctAllowPriceEdit })
      : apiRequest("POST", "/api/charge-types", { label: ctLabel, description: ctDescription, defaultAmount: parseFloat(ctAmount), category: ctCategory, allowPriceEdit: ctAllowPriceEdit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types"] });
      setCtFormOpen(false);
      toast({ title: editingCT ? "Cargo actualizado" : "Cargo creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteCTMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/charge-types/${id}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Error al eliminar");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types"] });
      setDeletingCTId(null);
      toast({ title: "Cargo eliminado" });
    },
    onError: (e: any) => {
      setDeletingCTId(null);
      toast({ title: "No se puede eliminar", description: e?.message, variant: "destructive" });
    },
  });

  const toggleCTMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/charge-types/${id}`, { active }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/charge-types"] });
      toast({ title: vars.active ? "Cargo habilitado" : "Cargo deshabilitado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const CT_CATEGORIES = [
    { value: "otros", label: "Otros" },
    { value: "restaurant", label: "Restaurant" },
    { value: "spa", label: "SPA" },
    { value: "minibar", label: "Minibar" },
    { value: "room", label: "Habitación" },
    { value: "adjustment", label: "Ajuste" },
  ];

  const { data: rooms, isLoading } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const { data: workOrders } = useQuery<any[]>({
    queryKey: ["/api/maintenance/work-orders"],
  });

  const { data: allReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations"],
  });

  const openWorkOrderRoomIds = new Set(
    (workOrders || [])
      .filter((wo) => wo.status === "pending" || wo.status === "in_progress")
      .map((wo) => wo.roomId)
      .filter(Boolean)
  );

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const activeResByRoom = new Map<string, any>();
  const entradaHoyRoomIds = new Set<string>();
  const salidaHoyRoomIds = new Set<string>();
  const proximaLlegadaByRoom = new Map<string, any>();

  for (const res of allReservations) {
    if (!res.roomId) continue;
    const isActive = res.status === "checked_in" || res.status === "limpia_ocupada" || res.status === "no_molestar";
    if (isActive) {
      activeResByRoom.set(res.roomId, res);
    }
    const isCheckedIn = res.status === "checked_in";
    const isPendingArrival = res.status === "confirmed" || res.status === "reserved" || res.status === "web_checkin";
    if (isPendingArrival && res.checkInDate === todayStr) {
      entradaHoyRoomIds.add(res.roomId);
    }
    if (isCheckedIn && res.checkOutDate === todayStr) {
      salidaHoyRoomIds.add(res.roomId);
    }
    if (isPendingArrival && res.checkInDate >= todayStr) {
      const existing = proximaLlegadaByRoom.get(res.roomId);
      if (!existing || res.checkInDate < existing.checkInDate) {
        proximaLlegadaByRoom.set(res.roomId, res);
      }
    }
  }

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RoomStatus }) => {
      return apiRequest("PATCH", `/api/rooms/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Estado actualizado", description: "El estado de la habitación ha sido actualizado." });
    },
  });

  const toggleRoomActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/rooms/${id}`, { isActive });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: vars.isActive ? "Habitación habilitada" : "Habitación deshabilitada", description: vars.isActive ? "La habitación vuelve a estar activa en el sistema." : "La habitación ya no aparecerá en el planning ni en reservas." });
    },
    onError: () => toast({ title: "Error", description: "No se pudo actualizar la habitación.", variant: "destructive" }),
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: async ({ roomId, roomNumber, description }: { roomId: string; roomNumber: string; description: string }) => {
      return apiRequest("POST", "/api/maintenance/work-orders", {
        title: `Reporte hab. ${roomNumber}`,
        description: description || null,
        roomId,
        category: "general",
        priority: "medium",
        status: "pending",
        reportedBy: "Recepción",
        reportedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/work-orders"] });
      toast({
        title: "Reporte enviado",
        description: "Se creó una orden de trabajo en Mantenimiento. La habitación no fue bloqueada.",
      });
      setMaintenanceTarget(null);
      setMaintenanceDescription("");
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la orden de trabajo.", variant: "destructive" });
    },
  });

  const filteredRooms = rooms?.filter((room) => {
    if ((room as any).isVirtual) return false;
    // Habitaciones inactivas: solo las ve quienes pueden gestionar
    if (room.isActive === false && !canManage) return false;
    const matchesSearch = room.roomNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || room.roomTypeId === typeFilter;
    let matchesStatus = false;
    if (statusFilter === "all") matchesStatus = true;
    else if (statusFilter === "libre_limpias") matchesStatus = room.status === "available" || room.status === "inspected";
    else if (statusFilter === "ocupadas_all") matchesStatus = room.status === "occupied" || room.status === "limpia_ocupada" || room.status === "no_molestar";
    else matchesStatus = room.status === statusFilter;
    return matchesSearch && matchesStatus && matchesType;
  })?.sort((a, b) => {
    // Habitaciones inactivas al final
    if ((a.isActive === false) !== (b.isActive === false)) return a.isActive === false ? 1 : -1;
    if (a.floor !== b.floor) return a.floor - b.floor;
    const numA = parseInt(a.roomNumber.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.roomNumber.replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return a.roomNumber.localeCompare(b.roomNumber);
  });

  const handleEditRoom = (room: RoomWithType) => {
    setSelectedRoom(room);
    setDialogOpen(true);
  };

  const handleNewRoom = () => {
    setSelectedRoom(undefined);
    setDialogOpen(true);
  };

  // Solo habitaciones activas y reales para los contadores
  const realRooms = rooms?.filter((r) => !(r as any).isVirtual && r.isActive !== false) ?? [];
  const statusCounts = {
    all: realRooms.length,
    libre_limpias: realRooms.filter((r) => r.status === "available" || r.status === "inspected").length,
    ocupadas_all: realRooms.filter((r) => r.status === "occupied" || r.status === "limpia_ocupada" || r.status === "no_molestar").length,
    dirty: realRooms.filter((r) => r.status === "dirty").length,
    cleaning: realRooms.filter((r) => r.status === "cleaning").length,
    maintenance: realRooms.filter((r) => r.status === "maintenance").length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-rooms-title">
            Habitaciones
          </h1>
          <p className="text-muted-foreground">Gestiona el inventario de habitaciones del hotel</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Tab toggle */}
          <div className="flex items-center rounded-lg border p-0.5 bg-muted/40">
            <Button
              variant={activeTab === "inventario" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setActiveTab("inventario")}
              data-testid="tab-inventario"
            >
              <DoorOpen className="mr-1.5 h-3.5 w-3.5" />
              Inventario
            </Button>
            <Button
              variant={activeTab === "ocupadas" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setActiveTab("ocupadas")}
              data-testid="tab-ocupadas"
            >
              <BedDouble className="mr-1.5 h-3.5 w-3.5" />
              Ocupadas
            </Button>
          </div>
          {canManage && activeTab === "inventario" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setChargesSheetOpen(true)} data-testid="button-charge-types">
                <ReceiptText className="mr-2 h-4 w-4" />
                Cargos en habitaciones
              </Button>
              <Button size="sm" onClick={handleNewRoom} data-testid="button-new-room">
                <Plus className="mr-2 h-4 w-4" />
                Nueva Habitación
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── PESTAÑA: OCUPADAS ───────────────────────────────── */}
      {activeTab === "ocupadas" && <OcupadasView />}

      {/* ── PESTAÑA: INVENTARIO ─────────────────────────────── */}
      {activeTab === "inventario" && <>

      {/* Status Summary Cards */}
      <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
        {[
          { key: "all", label: "Total", color: "bg-muted", textColor: "" },
          { key: "libre_limpias", label: "Libre Limpias", color: "bg-green-100 dark:bg-green-900/30", textColor: "text-green-800 dark:text-green-300" },
          { key: "ocupadas_all", label: "Ocupadas", color: "bg-blue-100 dark:bg-blue-900/30", textColor: "text-blue-800 dark:text-blue-300" },
          { key: "dirty", label: "Sucias", color: "bg-orange-100 dark:bg-orange-900/30", textColor: "text-orange-800 dark:text-orange-300" },
          { key: "cleaning", label: "En Limpieza", color: "bg-yellow-100 dark:bg-yellow-900/30", textColor: "text-yellow-800 dark:text-yellow-300" },
          { key: "maintenance", label: "Mantenimiento", color: "bg-red-100 dark:bg-red-900/30", textColor: "text-red-800 dark:text-red-300" },
        ].map(({ key, label, color, textColor }) => (
          <Card
            key={key}
            className={`cursor-pointer hover-elevate ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === key && key !== "all" ? "all" : key)}
            data-testid={`filter-card-${key}`}
          >
            <CardContent className={`p-4 ${color} rounded-lg`}>
              <div className={`text-2xl font-bold ${textColor}`}>{statusCounts[key as keyof typeof statusCounts]}</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de habitación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-rooms"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {roomTypes?.filter(type => type.id).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
              >
                <DoorOpen className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rooms Display */}
      {isLoading ? (
        <div className={viewMode === "grid" ? "grid gap-4 md:grid-cols-3 lg:grid-cols-4" : ""}>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className={viewMode === "grid" ? "h-32" : "h-16 mb-2"} />
          ))}
        </div>
      ) : filteredRooms && filteredRooms.length > 0 ? (
        viewMode === "grid" ? (
          <div className="flex flex-col gap-6">
            {(() => {
              const floors = [...new Set(filteredRooms.map((r) => r.floor))].sort((a, b) => a - b);
              return floors.map((floor) => {
                const floorRooms = filteredRooms.filter((r) => r.floor === floor);
                const floorFree = floorRooms.filter((r) => r.status === "available" || r.status === "inspected").length;
                return (
                  <div key={floor}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-sm font-semibold text-muted-foreground px-2">
                        Piso {floor}
                        {floorFree > 0 && (
                          <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                            · {floorFree} libre{floorFree !== 1 ? "s" : ""}
                          </span>
                        )}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {floorRooms.map((room) => {
                        const isOccupied = room.status === "occupied" || room.status === "limpia_ocupada" || room.status === "no_molestar";
                        const activeRes = activeResByRoom.get(room.id);
                        const proximaRes = proximaLlegadaByRoom.get(room.id);
                        const hasEntrada = entradaHoyRoomIds.has(room.id);
                        const hasSalida = salidaHoyRoomIds.has(room.id);
                        const borderClass = room.status === "available" || room.status === "inspected"
                          ? "border-green-200 dark:border-green-800"
                          : isOccupied
                          ? "border-blue-200 dark:border-blue-800"
                          : room.status === "dirty"
                          ? "border-orange-400 dark:border-orange-700"
                          : room.status === "cleaning"
                          ? "border-yellow-200 dark:border-yellow-800"
                          : "border-red-200 dark:border-red-800";
                        return (
                          <Card
                            key={room.id}
                            className={`hover-elevate cursor-pointer relative ${borderClass} ${room.isActive === false ? "opacity-50 grayscale border-dashed" : ""}`}
                            data-testid={`room-card-${room.id}`}
                          >
                            {room.isActive === false && (
                              <div className="absolute inset-0 flex items-start justify-end p-2 z-10 pointer-events-none">
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 uppercase tracking-wide">Deshabilitada</span>
                              </div>
                            )}
                            {/* Badges entrada/salida */}
                            {(hasEntrada || hasSalida) && room.isActive !== false && (
                              <div className="absolute top-2 right-10 flex gap-1 z-10">
                                {hasEntrada && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-green-600 text-white px-1.5 py-0.5 text-[10px] font-bold">
                                        <LogIn className="h-2.5 w-2.5" />
                                        Entrada
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Tiene check-in hoy</TooltipContent>
                                  </Tooltip>
                                )}
                                {hasSalida && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[10px] font-bold">
                                        <LogOut className="h-2.5 w-2.5" />
                                        Salida
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Tiene check-out hoy</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            )}
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between gap-2">
                                <CardTitle className="text-2xl">{room.roomNumber}</CardTitle>
                                <RoomDropdownMenu
                                  room={room}
                                  onEdit={() => handleEditRoom(room)}
                                  onStatus={(s) => updateStatusMutation.mutate({ id: room.id, status: s })}
                                  onMaintenance={() => { setMaintenanceTarget(room); setMaintenanceDescription(""); }}
                                  onToggleActive={() => toggleRoomActiveMutation.mutate({ id: room.id, isActive: room.isActive === false })}
                                  canManage={canManage}
                                />
                              </div>
                              <CardDescription className="text-xs">{room.roomType?.name || "Sin tipo"}</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <RoomStatusBadge status={room.status} />
                                  {openWorkOrderRoomIds.has(room.id) && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                                          <AlertTriangle className="h-3 w-3" />
                                          Mant.
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>Tiene una orden de mantenimiento abierta</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                {isOccupied && activeRes && (
                                  <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-2 mt-1">
                                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                                      <User className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{activeRes.guest?.firstName} {activeRes.guest?.lastName}</span>
                                    </div>
                                    {activeRes.checkOutDate && (
                                      <div className="flex items-center gap-1.5">
                                        <LogOut className="h-3 w-3 shrink-0 text-amber-500" />
                                        <span>
                                          {activeRes.checkOutDate === todayStr
                                            ? <span className="font-semibold text-amber-600 dark:text-amber-400">Salida hoy</span>
                                            : `Sale ${new Date(activeRes.checkOutDate + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {!isOccupied && proximaRes && proximaRes.checkInDate === todayStr && (
                                  <div className="text-xs border-t pt-2 mt-1 space-y-0.5">
                                    <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium">
                                      <LogIn className="h-3 w-3 shrink-0" />
                                      <span>Llega hoy — {proximaRes.guest?.firstName} {proximaRes.guest?.lastName}</span>
                                    </div>
                                  </div>
                                )}
                                {!isOccupied && proximaRes && proximaRes.checkInDate > todayStr && (
                                  <div className="text-xs border-t pt-2 mt-1">
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Clock className="h-3 w-3 shrink-0" />
                                      <span>Próx. llegada {new Date(proximaRes.checkInDate + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}</span>
                                    </div>
                                  </div>
                                )}
                                <RoomFeatures features={room.features} maxOccupancy={room.maxOccupancy} />
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Piso</TableHead>
                  <TableHead>Pax</TableHead>
                  <TableHead>Caracteristicas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRooms.map((room) => (
                  <TableRow key={room.id} data-testid={`room-row-${room.id}`}>
                    <TableCell className="font-medium">{room.roomNumber}</TableCell>
                    <TableCell>{room.roomType?.name || "Sin tipo"}</TableCell>
                    <TableCell>{room.floor}</TableCell>
                    <TableCell>{room.maxOccupancy || 2}</TableCell>
                    <TableCell>
                      <RoomFeatures features={room.features} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <RoomStatusBadge status={room.status} />
                        {openWorkOrderRoomIds.has(room.id) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                                <AlertTriangle className="h-3 w-3" />
                                Mant.
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Tiene una orden de mantenimiento abierta</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoomDropdownMenu
                        room={room}
                        onEdit={() => handleEditRoom(room)}
                        onStatus={(s) => updateStatusMutation.mutate({ id: room.id, status: s })}
                        onMaintenance={() => { setMaintenanceTarget(room); setMaintenanceDescription(""); }}
                        onToggleActive={() => toggleRoomActiveMutation.mutate({ id: room.id, isActive: room.isActive === false })}
                        canManage={canManage}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <DoorOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay habitaciones</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                ? "No se encontraron habitaciones con los filtros aplicados."
                : "Comienza agregando la primera habitación del hotel."}
            </p>
            {!searchQuery && statusFilter === "all" && typeFilter === "all" && (
              <Button onClick={handleNewRoom}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Primera Habitación
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      </>}
      {/* Room Form Dialog */}
      <RoomFormDialog
        room={selectedRoom}
        roomTypes={roomTypes || []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setSelectedRoom(undefined)}
      />

      {/* Maintenance Report Dialog */}
      <Dialog open={!!maintenanceTarget} onOpenChange={(o) => { if (!o) { setMaintenanceTarget(null); setMaintenanceDescription(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-500" />
              Reportar problema — Hab. {maintenanceTarget?.roomNumber}
            </DialogTitle>
            <DialogDescription>
              Se creará una orden de trabajo en el módulo de Mantenimiento. La habitación <strong>no será bloqueada</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1.5 block">Descripción del problema (opcional)</label>
            <Textarea
              placeholder="Ej: Grifo con pérdida, lámpara quemada, aire acondicionado sin frío..."
              value={maintenanceDescription}
              onChange={(e) => setMaintenanceDescription(e.target.value)}
              rows={3}
              data-testid="input-maintenance-description"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMaintenanceTarget(null); setMaintenanceDescription(""); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (maintenanceTarget) {
                  createWorkOrderMutation.mutate({
                    roomId: maintenanceTarget.id,
                    roomNumber: maintenanceTarget.roomNumber,
                    description: maintenanceDescription,
                  });
                }
              }}
              disabled={createWorkOrderMutation.isPending}
              data-testid="button-submit-maintenance"
            >
              {createWorkOrderMutation.isPending ? "Enviando..." : "Enviar a Mantenimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Cargos en Habitaciones ────────────────────────────────── */}
      <Dialog open={chargesSheetOpen} onOpenChange={v => { setChargesSheetOpen(v); if (!v) setCtFormOpen(false); }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              Cargos en habitaciones
            </DialogTitle>
            <DialogDescription>
              Cargos predefinidos que aparecen al agregar consumos a una reserva.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {chargeTypesList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Sin cargos configurados</p>
            )}
            {chargeTypesList.map(ct => (
              <div key={ct.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 transition-colors ${!ct.active ? "opacity-50 bg-muted/30 border-dashed" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`text-sm font-medium truncate ${!ct.active ? "line-through text-muted-foreground" : ""}`}>{ct.label}</p>
                    {ct.allowPriceEdit && ct.active && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">Variable</span>
                    )}
                    {!ct.active && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">Deshabilitado</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ct.description} · {ct.category}</p>
                </div>
                <span className="text-sm font-semibold shrink-0 tabular-nums">
                  {ct.allowPriceEdit
                    ? <span className="text-muted-foreground italic text-xs">ref. ${parseFloat(String(ct.defaultAmount)).toLocaleString("es-AR")}</span>
                    : `$${parseFloat(String(ct.defaultAmount)).toLocaleString("es-AR")}`
                  }
                </span>
                <div className="flex gap-1 shrink-0">
                  {ct.active && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditCT(ct)} data-testid={`btn-edit-ct-${ct.id}`} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-7 w-7 ${ct.active ? "text-muted-foreground hover:text-orange-600" : "text-muted-foreground hover:text-green-600"}`}
                    onClick={() => toggleCTMutation.mutate({ id: ct.id, active: !ct.active })}
                    disabled={toggleCTMutation.isPending}
                    data-testid={`btn-toggle-ct-${ct.id}`}
                    title={ct.active ? "Deshabilitar cargo" : "Habilitar cargo"}
                  >
                    {ct.active ? <OctagonMinus className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  {deletingCTId === ct.id ? (
                    <div className="flex gap-1">
                      <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => deleteCTMutation.mutate(ct.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeletingCTId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeletingCTId(ct.id)} data-testid={`btn-delete-ct-${ct.id}`} title="Eliminar cargo">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Inline form to create / edit */}
          {ctFormOpen ? (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold">{editingCT ? "Editar cargo" : "Nuevo cargo"}</p>
              <div className="space-y-1.5">
                <Label htmlFor="ct-label">Nombre visible</Label>
                <Input id="ct-label" value={ctLabel} onChange={e => setCtLabel(e.target.value)} placeholder="Ej: Cochera (por día)" data-testid="input-ct-label" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-desc">Descripción (aparece en el folio)</Label>
                <Input id="ct-desc" value={ctDescription} onChange={e => setCtDescription(e.target.value)} placeholder="Ej: Cochera" data-testid="input-ct-description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ct-amount">{ctAllowPriceEdit ? "Precio de referencia ($)" : "Precio por defecto ($)"}</Label>
                  <Input id="ct-amount" type="number" min="0" step="0.01" value={ctAmount} onChange={e => setCtAmount(e.target.value)} data-testid="input-ct-amount" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ct-category">Categoría</Label>
                  <Select value={ctCategory} onValueChange={setCtCategory}>
                    <SelectTrigger id="ct-category" data-testid="select-ct-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${ctAllowPriceEdit ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"}`}
                onClick={() => setCtAllowPriceEdit(v => !v)}
                data-testid="toggle-ct-allow-price-edit"
              >
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${ctAllowPriceEdit ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {ctAllowPriceEdit && <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div>
                  <p className="text-sm font-medium leading-none">Precio variable</p>
                  <p className="text-xs text-muted-foreground mt-0.5">El recepcionista ingresa el importe al cargar este cargo</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setCtFormOpen(false)}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={!ctLabel.trim() || !ctDescription.trim() || !ctAmount || parseFloat(ctAmount) <= 0 || saveCTMutation.isPending}
                  onClick={() => saveCTMutation.mutate()}
                  data-testid="btn-save-ct"
                >
                  {saveCTMutation.isPending ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t pt-4">
              <Button className="w-full" variant="outline" onClick={openNewCT} data-testid="btn-new-ct">
                <Plus className="mr-2 h-4 w-4" />
                Agregar nuevo cargo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
