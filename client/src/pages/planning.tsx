import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PlanningData, PlanningCellStatus } from "@shared/schema";

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
    </div>
  );
}

export default function PlanningPage() {
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 13);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  });

  const { data, isLoading } = useQuery<PlanningData>({
    queryKey: ["/api/planning", dateRange.start, dateRange.end],
    queryFn: async () => {
      const res = await fetch(`/api/planning?start=${dateRange.start}&end=${dateRange.end}`);
      if (!res.ok) throw new Error("Failed to fetch planning data");
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
    end.setDate(end.getDate() + 13);
    setDateRange({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    });
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
          <p className="text-muted-foreground">Vista de disponibilidad por habitación y fecha</p>
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
                      <>
                        <tr key={`floor-${floor}`} className="bg-muted/30">
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

                              return (
                                <td
                                  key={day}
                                  className={`p-0.5 border-b ${info.isToday ? "bg-primary/5" : ""}`}
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={`h-8 rounded border cursor-default flex items-center justify-center ${getStatusColor(status)}`}
                                        data-testid={`cell-${room.id}-${day}`}
                                      >
                                        {reservation && (
                                          <span className="text-[10px] font-medium truncate px-1 max-w-[56px]">
                                            {reservation.guestName.split(" ")[0]}
                                          </span>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px]">
                                      <div className="text-xs space-y-1">
                                        <div className="font-semibold">{room.roomNumber} - {room.roomType.name}</div>
                                        <div>Estado: {getStatusLabel(status)}</div>
                                        {reservation && (
                                          <>
                                            <div className="border-t pt-1 mt-1">
                                              <div className="font-medium">{reservation.guestName}</div>
                                              <div className="text-muted-foreground">
                                                {reservation.checkIn} → {reservation.checkOut}
                                              </div>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
