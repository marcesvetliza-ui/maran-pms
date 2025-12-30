import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Info, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { PlanningData, PlanningCellStatus, Guest, RoomWithType } from "@shared/schema";

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

function Legend() {
  const items: { status: PlanningCellStatus; label: string }[] = [
    { status: "available", label: "Disponible" },
    { status: "booked", label: "Reservado" },
    { status: "checked_in", label: "Ocupado" },
    { status: "checkout_today", label: "Check-out hoy" },
    { status: "group_blocked", label: "Grupo" },
    { status: "cleaning", label: "Limpieza" },
    { status: "maintenance", label: "Mantenimiento" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map(({ status, label }) => (
        <div key={status} className="flex items-center gap-1.5">
          <div className={`w-4 h-4 rounded border ${getStatusColor(status)}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 ml-4 pl-4 border-l">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Clic en celda libre para crear reserva</span>
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
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
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
          <DialogTitle>Nueva Reserva Rápida</DialogTitle>
          <DialogDescription>
            Habitación {reservationData.roomNumber} ({reservationData.roomTypeName}) - Check-in: {formatDateReadable(reservationData.checkInDate)}
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
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="button-create-quick">
            {mutation.isPending ? "Creando..." : "Crear Reserva"}
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
      navigate(`/reservations?view=${reservationId}`);
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
        <div className="flex items-center gap-2">
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
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{room.roomNumber}</span>
                                <span className="text-xs text-muted-foreground">{room.roomType.name}</span>
                              </div>
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
                                        className={`h-8 rounded border flex items-center justify-center transition-all ${getStatusColor(status)} ${
                                          isClickable || reservationId
                                            ? "cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-105" 
                                            : "cursor-default"
                                        }`}
                                        data-testid={`cell-${room.id}-${day}`}
                                      >
                                        {reservation ? (
                                          <span className="text-[10px] font-medium truncate px-1 max-w-[56px]">
                                            {reservation.isGroup ? "GRP" : reservation.guestName.split(" ")[0]}
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
    </div>
  );
}
