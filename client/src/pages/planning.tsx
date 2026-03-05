import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Info, Plus, LogIn, LogOut, ExternalLink, Calendar, User, DollarSign, Bed, Users, CalendarSearch, Accessibility, Mountain, Sofa, Armchair, BedDouble, ArrowLeftRight, BedSingle, Droplets, Sunrise, Sunset } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PlanningData, PlanningCellStatus, Guest, RoomWithType, ReservationWithDetails, ReservationStatus, ReservationSource } from "@shared/schema";

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return {
    dayName: date.toLocaleDateString("es-ES", { weekday: "short" }),
    dayNumber: date.getDate(),
    monthName: date.toLocaleDateString("es-ES", { month: "short" }),
    isToday: dateStr === new Date().toISOString().split("T")[0],
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
  };
}

function formatDateReadable(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function getStatusColor(status: PlanningCellStatus): string {
  switch (status) {
    case "available":
      return "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800";
    case "booked":
      return "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800";
    case "checked_in":
      return "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800";
    case "checkout_today":
      return "bg-orange-100 dark:bg-orange-900/40 border-orange-200 dark:border-orange-800";
    case "maintenance":
      return "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800";
    case "cleaning":
      return "bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800";
    case "group_blocked":
      return "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800";
    default:
      return "bg-muted";
  }
}

function getStatusLabel(status: PlanningCellStatus): string {
  switch (status) {
    case "available":
      return "Disponible";
    case "booked":
      return "Reservado";
    case "checked_in":
      return "Ocupado";
    case "checkout_today":
      return "Check-out hoy";
    case "maintenance":
      return "Mantenimiento";
    case "cleaning":
      return "Limpieza";
    case "group_blocked":
      return "Grupo";
    default:
      return status;
  }
}

function getSourceColor(source: ReservationSource): string {
  switch (source) {
    case "directo":
      return "bg-blue-200 dark:bg-blue-800/60 border-blue-300 dark:border-blue-700";
    case "telefono":
      return "bg-sky-200 dark:bg-sky-800/60 border-sky-300 dark:border-sky-700";
    case "web":
      return "bg-cyan-200 dark:bg-cyan-800/60 border-cyan-300 dark:border-cyan-700";
    case "booking":
      return "bg-indigo-200 dark:bg-indigo-800/60 border-indigo-300 dark:border-indigo-700";
    case "expedia":
      return "bg-yellow-200 dark:bg-yellow-800/60 border-yellow-300 dark:border-yellow-700";
    case "airbnb":
      return "bg-rose-200 dark:bg-rose-800/60 border-rose-300 dark:border-rose-700";
    case "despegar":
      return "bg-orange-200 dark:bg-orange-800/60 border-orange-300 dark:border-orange-700";
    case "hotelbeds":
      return "bg-purple-200 dark:bg-purple-800/60 border-purple-300 dark:border-purple-700";
    case "agoda":
      return "bg-red-200 dark:bg-red-800/60 border-red-300 dark:border-red-700";
    case "ota":
      return "bg-violet-200 dark:bg-violet-800/60 border-violet-300 dark:border-violet-700";
    case "empresa":
      return "bg-emerald-200 dark:bg-emerald-800/60 border-emerald-300 dark:border-emerald-700";
    default:
      return "bg-gray-200 dark:bg-gray-800/60 border-gray-300 dark:border-gray-700";
  }
}

function getSourceLabel(source: ReservationSource): string {
  switch (source) {
    case "directo":
      return "Directo";
    case "telefono":
      return "Teléfono";
    case "web":
      return "Web";
    case "booking":
      return "Booking";
    case "expedia":
      return "Expedia";
    case "airbnb":
      return "Airbnb";
    case "despegar":
      return "Despegar";
    case "hotelbeds":
      return "Hotelbeds";
    case "agoda":
      return "Agoda";
    case "ota":
      return "OTA";
    case "empresa":
      return "Empresa";
    default:
      return source;
  }
}

const featureIconMap: Record<string, { icon: typeof Accessibility; label: string }> = {
  accessible: { icon: Accessibility, label: "Accesible" },
  balcony: { icon: Mountain, label: "Balcón" },
  sofa_bed: { icon: Sofa, label: "Sofá cama" },
  living_room: { icon: Armchair, label: "Living" },
  twin_config: { icon: BedDouble, label: "Config. twin" },
  separable_bed: { icon: ArrowLeftRight, label: "Camas separables" },
  extra_bed: { icon: BedSingle, label: "Cama extra" },
  shower_only: { icon: Droplets, label: "Solo ducha" },
};

const bedConfigLabels: Record<string, string> = {
  MAT: "Matrimonial",
  TWIN: "Twin",
  MAT_CC: "Matrimonial + Cama cucheta",
  TWIN_CC: "Twin + Cama cucheta",
  MAT_EXTRA: "Matrimonial + Extra",
  MAT_CC_EXTRA: "Matrimonial + CC + Extra",
};

function Legend() {
  const statusItems: { status: PlanningCellStatus; label: string }[] = [
    { status: "available", label: "Disponible" },
    { status: "cleaning", label: "Limpieza" },
    { status: "maintenance", label: "Mantenimiento" },
    { status: "group_blocked", label: "Grupo bloq." },
  ];

  const sourceItems: { source: ReservationSource; label: string }[] = [
    { source: "directo", label: "Directo" },
    { source: "telefono", label: "Teléfono" },
    { source: "web", label: "Web" },
    { source: "booking", label: "Booking" },
    { source: "expedia", label: "Expedia" },
    { source: "airbnb", label: "Airbnb" },
    { source: "despegar", label: "Despegar" },
    { source: "hotelbeds", label: "Hotelbeds" },
    { source: "agoda", label: "Agoda" },
    { source: "ota", label: "OTA" },
    { source: "empresa", label: "Empresa" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Estado:</span>
        {statusItems.map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded border ${getStatusColor(status)}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Origen:</span>
        {sourceItems.map(({ source, label }) => (
          <div key={source} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded border ${getSourceColor(source)}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type QuickReservationData = {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  checkInDate: string;
};

function QuickReservationDialog({
  open,
  onOpenChange,
  reservationData,
  guests,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationData: QuickReservationData | null;
  guests: Guest[];
}) {
  const { toast } = useToast();
  const [guestId, setGuestId] = useState("");
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [checkOutDate, setCheckOutDate] = useState("");

  useEffect(() => {
    if (reservationData) {
      const nextDay = new Date(reservationData.checkInDate + "T12:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      setCheckOutDate(nextDay.toISOString().split("T")[0]);
    }
  }, [reservationData]);

  const mutation = useMutation({
    mutationFn: async (data: {
      guestId: string;
      roomId: string;
      checkInDate: string;
      checkOutDate: string;
      numberOfGuests: number;
      status: string;
      totalAmount: string;
      createdAt: string;
    }) => {
      return apiRequest("POST", "/api/reservations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({
        title: "Reserva creada",
        description: "La reserva ha sido creada exitosamente desde el planning.",
      });
      onOpenChange(false);
      setGuestId("");
      setCheckOutDate("");
      setNumberOfGuests(1);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la reserva. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!reservationData || !guestId || !checkOutDate) {
      toast({
        title: "Datos incompletos",
        description: "Por favor complete todos los campos obligatorios.",
        variant: "destructive",
      });
      return;
    }

    if (checkOutDate <= reservationData.checkInDate) {
      toast({
        title: "Fechas inválidas",
        description: "La fecha de check-out debe ser posterior al check-in.",
        variant: "destructive",
      });
      return;
    }

    mutation.mutate({
      guestId,
      roomId: reservationData.roomId,
      checkInDate: reservationData.checkInDate,
      checkOutDate,
      numberOfGuests,
      status: "confirmed",
      totalAmount: "0",
      createdAt: new Date().toISOString(),
    });
  };

  if (!reservationData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nueva Reserva Rapida</DialogTitle>
          <DialogDescription>
            Habitacion {reservationData.roomNumber} ({reservationData.roomTypeName}) - Check-in: {formatDateReadable(reservationData.checkInDate)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="guest">Huésped *</Label>
            <Select value={guestId} onValueChange={setGuestId}>
              <SelectTrigger data-testid="select-guest-quick">
                <SelectValue placeholder="Seleccionar huésped" />
              </SelectTrigger>
              <SelectContent>
                {guests.map((guest) => (
                  <SelectItem key={guest.id} value={guest.id}>
                    {guest.firstName} {guest.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checkIn">Check-in</Label>
            <Input
              id="checkIn"
              type="date"
              value={reservationData.checkInDate}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checkOut">Check-out *</Label>
            <Input
              id="checkOut"
              type="date"
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
              min={reservationData.checkInDate}
              data-testid="input-checkout-quick"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guests">Cantidad de huéspedes</Label>
            <Input
              id="guests"
              type="number"
              min={1}
              max={10}
              value={numberOfGuests}
              onChange={(e) => setNumberOfGuests(parseInt(e.target.value) || 1)}
              data-testid="input-guests-quick"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-quick">
            Volver
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="button-create-quick">
            {mutation.isPending ? "Creando..." : "Crear Reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getStatusBadge(status: ReservationStatus) {
  const config: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative: { label: "Tentativa", variant: "outline" },
    pending: { label: "Pendiente", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Check-in", variant: "default" },
    checked_out: { label: "Check-out", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };
  return config[status] || { label: status, variant: "outline" };
}

function ReservationDetailModal({
  open,
  onOpenChange,
  reservationId,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string | null;
  onNavigate: (path: string) => void;
}) {
  const { toast } = useToast();

  const { data: reservation, isLoading } = useQuery<ReservationWithDetails>({
    queryKey: ["/api/reservations", reservationId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) throw new Error("Failed to fetch reservation");
      return res.json();
    },
    enabled: !!reservationId && open,
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/reservations/${reservationId}/check-in`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-in realizado", description: "El huesped ha sido registrado." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo realizar el check-in.", variant: "destructive" });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/reservations/${reservationId}/check-out`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-out realizado", description: "El huesped ha sido despedido." });
      onOpenChange(false);
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo realizar el check-out.";
      if (message.includes("saldo pendiente") || message.includes("balance")) {
        toast({ title: "Saldo Pendiente", description: message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: message, variant: "destructive" });
      }
    },
  });

  if (!reservationId) return null;

  const statusBadge = reservation ? getStatusBadge(reservation.status) : null;
  const canCheckIn = reservation?.status === "confirmed" || reservation?.status === "pending";
  const canCheckOut = reservation?.status === "checked_in";
  const totalCharges = reservation?.charges?.reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Detalle de Reserva
          </DialogTitle>
          {reservation && (
            <DialogDescription>
              Codigo: {reservation.reservationCode}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : reservation ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {reservation.guest?.firstName} {reservation.guest?.lastName}
                </span>
              </div>
              <Badge variant={statusBadge?.variant}>{statusBadge?.label}</Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground">Habitacion</div>
                <div className="font-medium flex items-center gap-1">
                  <Bed className="h-4 w-4" />
                  {reservation.room?.roomNumber} - {reservation.room?.roomType?.name}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Huespedes</div>
                <div className="font-medium flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {reservation.numberOfGuests} persona(s)
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Check-in</div>
                <div className="font-medium">{formatDateReadable(reservation.checkInDate)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Check-out</div>
                <div className="font-medium">{formatDateReadable(reservation.checkOutDate)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Noches</div>
                <div className="font-medium">{reservation.nights}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Tarifa/noche</div>
                <div className="font-medium">${reservation.finalRatePerNight}</div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between bg-muted/50 rounded-md p-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Total Habitacion</div>
                  <div className="font-semibold">${reservation.totalRoomAmount}</div>
                </div>
              </div>
              {totalCharges > 0 && (
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Cargos extras</div>
                  <div className="font-semibold">${totalCharges.toFixed(2)}</div>
                </div>
              )}
            </div>

            {reservation.notes && (
              <div className="text-sm bg-muted/30 rounded-md p-3">
                <div className="text-muted-foreground mb-1">Notas:</div>
                <div>{reservation.notes}</div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {canCheckIn && (
            <Button
              onClick={() => checkInMutation.mutate()}
              disabled={checkInMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-checkin-quick"
            >
              <LogIn className="h-4 w-4 mr-2" />
              {checkInMutation.isPending ? "Procesando..." : "Check-in"}
            </Button>
          )}
          {canCheckOut && (
            <Button
              onClick={() => checkOutMutation.mutate()}
              disabled={checkOutMutation.isPending}
              variant="secondary"
              className="w-full sm:w-auto"
              data-testid="button-checkout-quick"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {checkOutMutation.isPending ? "Procesando..." : "Check-out"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onNavigate(`/reservations?view=${reservationId}`);
            }}
            className="w-full sm:w-auto"
            data-testid="button-view-full"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Ver Completo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlanningPage() {
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  });

  const [quickReservationOpen, setQuickReservationOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<QuickReservationData | null>(null);
  const [reservationDetailOpen, setReservationDetailOpen] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PlanningData>({
    queryKey: ["/api/planning", dateRange.start, dateRange.end],
    queryFn: async () => {
      const res = await fetch(`/api/planning?start=${dateRange.start}&end=${dateRange.end}`);
      if (!res.ok) throw new Error("Failed to fetch planning data");
      return res.json();
    },
  });

  const { data: guests = [] } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
    queryFn: async () => {
      const res = await fetch("/api/guests");
      if (!res.ok) throw new Error("Failed to fetch guests");
      return res.json();
    },
  });

  const navigateDays = (direction: "prev" | "next") => {
    const days = direction === "prev" ? -7 : 7;
    const newStart = new Date(dateRange.start);
    const newEnd = new Date(dateRange.end);
    newStart.setDate(newStart.getDate() + days);
    newEnd.setDate(newEnd.getDate() + days);
    setDateRange({
      start: newStart.toISOString().split("T")[0],
      end: newEnd.toISOString().split("T")[0],
    });
  };

  const goToToday = () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    setDateRange({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    });
  };

  const goToDate = (date: Date | undefined) => {
    if (!date) return;
    const start = new Date(date);
    start.setDate(start.getDate() - 1);
    const end = new Date(date);
    end.setDate(end.getDate() + 14);
    setDateRange({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    });
  };

  const handleCellClick = (room: RoomWithType, day: string, status: PlanningCellStatus, reservationId?: string) => {
    if (status === "available") {
      setSelectedCell({
        roomId: room.id,
        roomNumber: room.roomNumber,
        roomTypeName: room.roomType.name,
        checkInDate: day,
      });
      setQuickReservationOpen(true);
    } else if (reservationId) {
      setSelectedReservationId(reservationId);
      setReservationDetailOpen(true);
    }
  };

  const groupedRooms = data?.rooms.reduce((acc, room) => {
    const floor = room.floor;
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(room);
    return acc;
  }, {} as Record<number, typeof data.rooms>) || {};

  const floors = Object.keys(groupedRooms).map(Number).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-planning-title">
            Planning de Ocupación
          </h1>
          <p className="text-muted-foreground">Vista de disponibilidad por habitación y fecha (15 días)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateDays("prev")}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={goToToday}
            data-testid="button-today"
          >
            Hoy
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" data-testid="button-date-picker">
                <CalendarSearch className="h-4 w-4 mr-2" />
                Ir a fecha
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarPicker
                mode="single"
                selected={new Date(dateRange.start)}
                onSelect={goToDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateDays("next")}
            data-testid="button-next-week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Legend />

      <Card className="flex-1 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span>
              {data ? `${data.rooms.length} habitaciones` : "Cargando..."} | {" "}
              {dateRange.start} — {dateRange.end}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-60px)]">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data ? (
            <ScrollArea className="h-full">
              <div className="min-w-max">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-20 bg-background">
                    <tr>
                      <th className="sticky left-0 z-30 bg-muted px-3 py-2 text-left text-sm font-medium w-24 border-b border-r">
                        Hab.
                      </th>
                      {data.days.map((day) => {
                        const info = formatDate(day);
                        return (
                          <th
                            key={day}
                            className={`px-1 py-2 text-center text-xs font-medium border-b min-w-[60px] ${
                              info.isToday ? "bg-primary/10" : info.isWeekend ? "bg-muted/50" : ""
                            }`}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-muted-foreground capitalize">{info.dayName}</span>
                              <span className={`text-sm font-semibold ${info.isToday ? "text-primary" : ""}`}>
                                {info.dayNumber}
                              </span>
                              <span className="text-muted-foreground capitalize">{info.monthName}</span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {floors.map((floor) => (
                      <Fragment key={`floor-${floor}`}>
                        <tr className="bg-muted/30">
                          <td
                            colSpan={data.days.length + 1}
                            className="px-3 py-1.5 text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/30"
                          >
                            Piso {floor}
                          </td>
                        </tr>
                        {groupedRooms[floor]?.map((room) => (
                          <tr key={room.id} className="hover:bg-muted/20" data-testid={`row-room-${room.id}`}>
                            <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-r">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex flex-col cursor-default" data-testid={`room-header-${room.id}`}>
                                    <span className="font-medium text-sm">{room.roomNumber}</span>
                                    <span className="text-xs text-muted-foreground">{room.roomType.name}</span>
                                    {room.bedConfig && (
                                      <span className="text-[10px] text-muted-foreground">{room.bedConfig}</span>
                                    )}
                                    {room.features && room.features.length > 0 && (
                                      <div className="flex flex-row items-center gap-0.5 mt-0.5">
                                        {room.features.map((feature) => {
                                          const mapped = featureIconMap[feature];
                                          if (!mapped) return null;
                                          const IconComp = mapped.icon;
                                          return <span key={feature} title={mapped.label}><IconComp className="h-3 w-3 text-muted-foreground" /></span>;
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[220px]">
                                  <div className="text-xs space-y-1">
                                    <div className="font-semibold">{room.roomNumber} - {room.roomType.name}</div>
                                    <div>Piso: {room.floor}</div>
                                    {room.bedConfig && (
                                      <div>Camaje: {bedConfigLabels[room.bedConfig] || room.bedConfig}</div>
                                    )}
                                    {room.maxOccupancy && (
                                      <div>Ocupación máx: {room.maxOccupancy} personas</div>
                                    )}
                                    {room.features && room.features.length > 0 && (
                                      <div>
                                        <span className="font-medium">Características:</span>
                                        <ul className="list-disc pl-3 mt-0.5">
                                          {room.features.map((f) => (
                                            <li key={f}>{featureIconMap[f]?.label || f}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {room.notes && (
                                      <div className="border-t pt-1 mt-1 text-muted-foreground">{room.notes}</div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            {data.days.map((day, dayIndex) => {
                              const status = data.occupancy[room.id]?.[dayIndex] || "available";
                              const reservationId = data.cellReservations[room.id]?.[day];
                              const reservation = reservationId ? data.reservations[reservationId] : null;
                              const info = formatDate(day);
                              const isClickable = status === "available";

                              return (
                                <td
                                  key={day}
                                  className={`p-0.5 border-b ${info.isToday ? "bg-primary/5" : ""}`}
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        onClick={() => handleCellClick(room, day, status, reservationId)}
                                        className={`h-8 rounded border flex items-center justify-center transition-all ${
                                          reservation ? getSourceColor(reservation.source) : getStatusColor(status)
                                        } ${
                                          isClickable || reservationId
                                            ? "cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-105" 
                                            : "cursor-default"
                                        }`}
                                        data-testid={`cell-${room.id}-${day}`}
                                      >
                                        {reservation ? (
                                          <span className="text-[10px] font-medium truncate px-1 max-w-[56px] inline-flex items-center gap-0.5">
                                            {reservation.earlyCheckIn && day === reservation.checkIn && (
                                              <Sunrise className="h-3 w-3 text-orange-400 flex-shrink-0" data-testid="icon-early-checkin" />
                                            )}
                                            {reservation.isGroup ? "GRP" : reservation.guestName.split(" ")[0]}
                                            {reservation.lateCheckOut && day === reservation.checkOut && (
                                              <Sunset className="h-3 w-3 text-purple-400 flex-shrink-0" data-testid="icon-late-checkout" />
                                            )}
                                          </span>
                                        ) : isClickable ? (
                                          <Plus className="h-3 w-3 text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100" />
                                        ) : null}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px]">
                                      <div className="text-xs space-y-1">
                                        <div className="font-semibold">{room.roomNumber} - {room.roomType.name}</div>
                                        <div>Estado: {getStatusLabel(status)}</div>
                                        {reservation ? (
                                          <div className="border-t pt-1 mt-1">
                                            {reservation.isGroup && reservation.groupName && (
                                              <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                                                Grupo: {reservation.groupName}
                                              </div>
                                            )}
                                            <div className="font-medium">{reservation.guestName}</div>
                                            <div className="text-muted-foreground">
                                              {reservation.checkIn} a {reservation.checkOut}
                                            </div>
                                            <div className="text-muted-foreground">
                                              Origen: {getSourceLabel(reservation.source)}
                                            </div>
                                            {reservation.earlyCheckIn && (
                                              <div className="text-orange-400 font-medium">
                                                Early Check-in: {reservation.earlyCheckInTime || "--"} hs
                                              </div>
                                            )}
                                            {reservation.lateCheckOut && (
                                              <div className="text-purple-400 font-medium">
                                                Late Check-out: {reservation.lateCheckOutTime || "--"} hs
                                              </div>
                                            )}
                                            <div className="border-t pt-1 mt-1 text-primary">
                                              Clic para ver detalle
                                            </div>
                                          </div>
                                        ) : isClickable ? (
                                          <div className="border-t pt-1 mt-1 text-primary">
                                            Clic para crear reserva
                                          </div>
                                        ) : null}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>

      <QuickReservationDialog
        open={quickReservationOpen}
        onOpenChange={setQuickReservationOpen}
        reservationData={selectedCell}
        guests={guests}
      />

      <ReservationDetailModal
        open={reservationDetailOpen}
        onOpenChange={setReservationDetailOpen}
        reservationId={selectedReservationId}
        onNavigate={navigate}
      />
    </div>
  );
}
