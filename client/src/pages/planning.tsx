import { useState, useEffect, useRef, Fragment, forwardRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, Info, Plus, LogIn, LogOut, ExternalLink, Calendar, User, DollarSign, Bed, Users, CalendarSearch, Accessibility, Mountain, Sofa, Armchair, BedDouble, ArrowLeftRight, BedSingle, Droplets, Sunrise, Sunset, FileText, Ban, GripVertical, Move, Maximize2, Minimize2, ShoppingCart, XCircle, TrendingUp, Palette, X, SlidersHorizontal } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import type { PlanningData, PlanningCellStatus, Guest, RoomWithType, RoomType, ReservationWithDetails, ReservationStatus, ReservationSource, RatePlan, Company, Agency, InsertAgency, Package, BedType } from "@shared/schema";
import { ReservationFormDialog } from "./reservations";
import { CompanySelector, AgencySelector } from "@/components/entity-selector";
import { getLocalToday, toArgentinaDateStr } from "@/lib/utils";
import {
  formatDate, PLANNING_COLORS, getStatusColor, getStatusLabel,
  getSourceColor, getSourceBg, getPlanningCellClasses, getGroupCellStyle, getSourceLabel,
  ROOM_STATUS_OPTIONS, Legend,
} from "@/lib/planning-utils";
import { QuickReservationDialog } from "@/components/planning-quick-reservation";
import type { QuickReservationData } from "@/components/planning-quick-reservation";
import { ReservationDetailModal } from "@/components/planning-reservation-detail";
import {
  PlanningMoveConfirmDialog,
  PlanningBedConfigDialog,
  PlanningColorContextMenu,
  type MoveConfirmData,
} from "@/components/planning-dialogs";
import { RoomPopover } from "@/components/planning-room-popover";
import { PlanningFiltersPanel, type PlanningFilter, DEFAULT_PLANNING_FILTER, countActiveFilters } from "@/components/planning-filters-panel";

function DraggableReservationCell({
  id,
  reservationId,
  roomId,
  children,
  className,
  style,
  onClick,
  onContextMenu,
  "data-testid": testId,
}: {
  id: string;
  reservationId: string;
  roomId: string;
  children: React.ReactNode;
  className: string;
  style?: React.CSSProperties;
  onClick: (e?: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  "data-testid"?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { reservationId, roomId },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onContextMenu={onContextMenu}
      className={`${className} ${isDragging ? "opacity-40 ring-2 ring-primary" : ""}`}
      style={{ touchAction: "none", ...style }}
    >
      <div
        onClick={(e) => { if (!isDragging) onClick(e); }}
        data-testid={testId}
        className="w-full h-full"
      >
        {children}
      </div>
    </div>
  );
}

function DroppableRoomRow({
  roomId,
  children,
  className,
  isOver,
  "data-testid": testId,
}: {
  roomId: string;
  children: React.ReactNode;
  className?: string;
  isOver?: boolean;
  "data-testid"?: string;
}) {
  return (
    <tr
      className={`${className || ""} ${isOver ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
      data-testid={testId}
    >
      {children}
    </tr>
  );
}

function DroppableCell({
  roomId,
  day,
  children,
  className,
}: {
  roomId: string;
  day: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${roomId}-${day}`,
    data: { roomId, day },
  });

  return (
    <td
      ref={setNodeRef}
      className={`${className || ""} ${isOver ? "bg-primary/10 ring-2 ring-primary/40" : ""}`}
    >
      {children}
    </td>
  );
}

export default function PlanningPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const planningRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  // Close CSS-fullscreen on Escape key
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  const [dateRange, setDateRange] = useState(() => {
    const todayStr = getLocalToday();
    const end = new Date(todayStr + "T12:00:00");
    end.setDate(end.getDate() + 15);
    return {
      start: todayStr,
      end: toArgentinaDateStr(end),
    };
  });

  const [quickReservationOpen, setQuickReservationOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<QuickReservationData | null>(null);
  const [reservationDetailOpen, setReservationDetailOpen] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);

  const [editReservationOpen, setEditReservationOpen] = useState(false);
  const [editingReservationData, setEditingReservationData] = useState<ReservationWithDetails | null>(null);

  const [newReservationOpen, setNewReservationOpen] = useState(false);
  const [newReservationDefaults, setNewReservationDefaults] = useState<{ roomId?: string; roomTypeId?: string; checkInDate?: string } | null>(null);

  const [editingBedConfig, setEditingBedConfig] = useState<{ roomId: string; roomNumber: string; current: string } | null>(null);
  const [roomPopoverOpen, setRoomPopoverOpen] = useState<string | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [blocksExpanded, setBlocksExpanded] = useState(false);
  const [showRevenue, setShowRevenue] = useState(() => localStorage.getItem("planning_revenue") === "true");

  const toggleRevenue = () => setShowRevenue(v => {
    const next = !v;
    localStorage.setItem("planning_revenue", String(next));
    return next;
  });

  const [filters, setFilters] = useState<PlanningFilter>(DEFAULT_PLANNING_FILTER);

  const updateBedConfigMutation = useMutation({
    mutationFn: async ({ roomId, bedConfig }: { roomId: string; bedConfig: string }) => {
      const res = await apiRequest("PATCH", `/api/rooms/${roomId}`, { bedConfig });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setEditingBedConfig(null);
      toast({ title: "Camaje actualizado" });
    },
    onError: () => {
      toast({ title: "Error al actualizar camaje", variant: "destructive" });
    },
  });

  const updateRoomStatusMutation = useMutation({
    mutationFn: async ({ roomId, status }: { roomId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/rooms/${roomId}`, { status });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setRoomPopoverOpen(null);
      const opt = ROOM_STATUS_OPTIONS.find(o => o.value === vars.status);
      toast({ title: `Estado actualizado: ${opt?.label ?? vars.status}` });
    },
    onError: () => {
      toast({ title: "Error al actualizar estado", variant: "destructive" });
    },
  });

  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [colorContextMenu, setColorContextMenu] = useState<{ x: number; y: number; reservationId: string } | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{
    reservationId: string;
    guestName: string;
    fromRoomNumber: string;
    toRoomId: string;
    toRoomNumber: string;
    toRoomType: string;
    newCheckIn: string;
    newCheckOut: string;
    dateChanged: boolean;
  } | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const sensors = useSensors(pointerSensor);

  const moveReservationMutation = useMutation({
    mutationFn: async ({
      reservationId,
      roomId,
      checkInDate,
      checkOutDate,
    }: {
      reservationId: string;
      roomId: string;
      checkInDate?: string;
      checkOutDate?: string;
    }) => {
      const payload: Record<string, string> = { roomId };
      if (checkInDate) payload.checkInDate = checkInDate;
      if (checkOutDate) {
        payload.checkOutDate = checkOutDate;
        const ci = new Date((checkInDate || "") + "T12:00:00");
        const co = new Date(checkOutDate + "T12:00:00");
        payload.nights = String(Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24)));
      }
      const res = await apiRequest("PATCH", `/api/reservations/${reservationId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      toast({ title: "Reserva movida", description: "La habitación y fechas fueron actualizadas correctamente." });
      setMoveConfirm(null);
    },
    onError: (error: any) => {
      const msg = error?.message || "No se pudo mover la reserva.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deleteGroupBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      await apiRequest("DELETE", `/api/group-blocks/${blockId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      toast({ title: "Bloque eliminado del planning" });
    },
    onError: () => {
      toast({ title: "Error al eliminar bloque", variant: "destructive" });
    },
  });

  const updateReservationColorMutation = useMutation({
    mutationFn: async ({ reservationId, color }: { reservationId: string; color: string | null }) => {
      const res = await apiRequest("PATCH", `/api/reservations/${reservationId}`, { color });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      setColorContextMenu(null);
    },
    onError: () => {
      toast({ title: "Error al guardar color", variant: "destructive" });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const resId = (event.active.data.current as any)?.reservationId;
    setDragActiveId(resId || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    if (!over || !data) return;

    const reservationId = (active.data.current as any)?.reservationId;
    const fromRoomId = (active.data.current as any)?.roomId;
    const toRoomId = (over.data.current as any)?.roomId;
    const toDay = (over.data.current as any)?.day as string | undefined;

    if (!reservationId || !toRoomId) return;

    const reservation = data.reservations[reservationId];
    if (!reservation) return;

    const toRoom = data.rooms.find(r => r.id === toRoomId);
    const fromRoom = data.rooms.find(r => r.id === fromRoomId);
    if (!toRoom || !fromRoom) return;

    let newCheckIn = reservation.checkIn;
    let newCheckOut = reservation.checkOut;

    if (toDay && toDay !== reservation.checkIn) {
      const originalCheckIn = new Date(reservation.checkIn + "T12:00:00");
      const originalCheckOut = new Date(reservation.checkOut + "T12:00:00");
      const nights = Math.round(
        (originalCheckOut.getTime() - originalCheckIn.getTime()) / (1000 * 60 * 60 * 24)
      );
      newCheckIn = toDay;
      const newCheckOutDate = new Date(toDay + "T12:00:00");
      newCheckOutDate.setDate(newCheckOutDate.getDate() + nights);
      newCheckOut = toArgentinaDateStr(newCheckOutDate);
    }

    for (const [cellDay, existingResId] of Object.entries(data.cellReservations[toRoomId] || {})) {
      if (existingResId === reservationId) continue;
      if (cellDay >= newCheckIn && cellDay < newCheckOut) {
        toast({
          title: "Habitación ocupada",
          description: `La habitación ${toRoom.roomNumber} tiene otra reserva en esas fechas.`,
          variant: "destructive",
        });
        return;
      }
    }

    if (fromRoomId === toRoomId && newCheckIn === reservation.checkIn) return;

    setMoveConfirm({
      reservationId,
      guestName: reservation.guestName,
      fromRoomNumber: fromRoom.roomNumber,
      toRoomId: toRoom.id,
      toRoomNumber: toRoom.roomNumber,
      toRoomType: toRoom.roomType?.name ?? "",
      newCheckIn,
      newCheckOut,
      dateChanged: newCheckIn !== reservation.checkIn,
    });
  };

  const { data, isLoading } = useQuery<PlanningData>({
    queryKey: ["/api/planning", dateRange.start, dateRange.end],
    queryFn: async () => {
      const res = await fetch(`/api/planning?start=${dateRange.start}&end=${dateRange.end}`);
      if (!res.ok) throw new Error("Failed to fetch planning data");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Pre-compute day index map for fast lookup
  const dayIndexMap = useMemo(() => {
    if (!data?.days) return {} as Record<string, number>;
    const m: Record<string, number> = {};
    data.days.forEach((d, i) => { m[d] = i; });
    return m;
  }, [data?.days]);

  // Compute ghost overlay for unassigned group blocks
  // For each block, pick the first N available rooms of that type and mark their cells
  const groupBlockOverlay = useMemo(() => {
    if (!data?.unassignedGroupBlocks || !data.rooms || !data.days) {
      return {} as Record<string, Record<string, { blockId: string; groupId: string; groupName: string; groupColor: string }>>;
    }
    const overlay: Record<string, Record<string, { blockId: string; groupId: string; groupName: string; groupColor: string }>> = {};

    for (const block of data.unassignedGroupBlocks) {
      const unassignedCount = block.quantity - block.assigned;
      if (unassignedCount <= 0) continue;

      const blockDays = data.days.filter(d => d >= block.checkIn && d < block.checkOut);
      if (blockDays.length === 0) continue;

      const roomsOfType = data.rooms.filter(r => r.roomTypeId === block.roomTypeId);

      // Find rooms that are fully available for the whole block period
      const availableRooms = roomsOfType.filter(room => {
        return blockDays.every(day => {
          const idx = dayIndexMap[day];
          if (idx === undefined) return false;
          const status = data.occupancy[room.id]?.[idx];
          return status === "available";
        });
      });

      const targetRooms = availableRooms.slice(0, unassignedCount);
      for (const room of targetRooms) {
        if (!overlay[room.id]) overlay[room.id] = {};
        for (const day of blockDays) {
          overlay[room.id][day] = {
            blockId: block.blockId,
            groupId: block.groupId,
            groupName: block.groupName,
            groupColor: block.groupColor,
          };
        }
      }
    }
    return overlay;
  }, [data?.unassignedGroupBlocks, data?.rooms, data?.days, data?.occupancy, dayIndexMap]);

  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");

  const { data: dayNotes = [] } = useQuery<{ date: string; note: string }[]>({
    queryKey: ["/api/planning/day-notes", dateRange.start, dateRange.end],
    queryFn: async () => {
      const res = await fetch(`/api/planning/day-notes?from=${dateRange.start}&to=${dateRange.end}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const dayNotesMap = Object.fromEntries(dayNotes.map((n) => [n.date, n.note]));

  const { data: planningWorkOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/maintenance/work-orders"],
  });

  const maintenanceAlertRoomIds = new Set(
    planningWorkOrders
      .filter((wo) => wo.status === "pending" || wo.status === "in_progress" || wo.status === "assigned")
      .map((wo) => wo.roomId)
      .filter(Boolean)
  );

  const saveNoteMutation = useMutation({
    mutationFn: async ({ date, note }: { date: string; note: string }) => {
      const res = await apiRequest("PUT", `/api/planning/day-notes/${date}`, { note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning/day-notes"] });
      setEditingNoteDate(null);
    },
    onError: () => {
      toast({ title: "Error al guardar nota", variant: "destructive" });
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

  const { data: allRooms = [] } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: roomTypes = [] } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const dragActiveReservation = dragActiveId && data ? data.reservations[dragActiveId] : null;

  const navigateDays = (direction: "prev" | "next", days = 1) => {
    const delta = direction === "prev" ? -days : days;
    const newStart = new Date(dateRange.start);
    const newEnd = new Date(dateRange.end);
    newStart.setDate(newStart.getDate() + delta);
    newEnd.setDate(newEnd.getDate() + delta);
    setDateRange({
      start: toArgentinaDateStr(newStart),
      end: toArgentinaDateStr(newEnd),
    });
  };

  const goToToday = () => {
    const todayStr = getLocalToday();
    const end = new Date(todayStr + "T12:00:00");
    end.setDate(end.getDate() + 15);
    setDateRange({
      start: todayStr,
      end: toArgentinaDateStr(end),
    });
  };

  const goToDate = (date: Date | undefined) => {
    if (!date) return;
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const start = new Date(y, m, d);
    const end = new Date(y, m, d + 14);
    setDateRange({
      start: toArgentinaDateStr(start),
      end: toArgentinaDateStr(end),
    });
  };

  const findReservationForRoomAndDay = (roomId: string, day: string): string | null => {
    if (!data?.reservations || !data?.cellReservations?.[roomId]) return null;
    const roomCells = data.cellReservations[roomId];
    for (const [cellDay, resId] of Object.entries(roomCells)) {
      if (cellDay === day) return resId;
    }
    const targetDate = new Date(day + "T00:00:00");
    for (const [resId, reservation] of Object.entries(data.reservations)) {
      const checkIn = new Date(reservation.checkIn + "T00:00:00");
      const checkOut = new Date(reservation.checkOut + "T00:00:00");
      const hasRoomMatch = Object.values(roomCells).includes(resId);
      if (hasRoomMatch && targetDate >= checkIn && targetDate < checkOut) {
        return resId;
      }
    }
    return null;
  };

  const handleCellClick = (room: RoomWithType, day: string, status: PlanningCellStatus, reservationId?: string) => {
    if (status === "maintenance") {
      toast({ title: "Habitación en mantenimiento", description: "No se pueden crear reservas en esta habitación mientras está en mantenimiento.", variant: "destructive" });
      return;
    }
    if (status === "late_blocked") {
      toast({ title: "Late check-out ese día", description: "La habitación tiene late check-out. Podés igualmente cargar una nueva reserva para ese día.", duration: 4000 });
      setNewReservationDefaults({ roomId: room.id, roomTypeId: room.roomTypeId, checkInDate: day });
      setNewReservationOpen(true);
      return;
    }
    if (status === "early_blocked") {
      toast({ title: "Early check-in al día siguiente", description: "La habitación tiene early check-in mañana. Podés igualmente cargar una nueva reserva.", duration: 4000 });
      setNewReservationDefaults({ roomId: room.id, roomTypeId: room.roomTypeId, checkInDate: day });
      setNewReservationOpen(true);
      return;
    }
    if (status === "available" || status === "dirty" || status === "cleaning" || status === "inspected") {
      setNewReservationDefaults({ roomId: room.id, roomTypeId: room.roomTypeId, checkInDate: day });
      setNewReservationOpen(true);
    } else {
      const resolvedId = reservationId || findReservationForRoomAndDay(room.id, day);
      if (resolvedId) {
        setSelectedReservationId(resolvedId);
        setReservationDetailOpen(true);
      }
    }
  };

  // Compute active statuses present in current view for Legend filtering
  const activeStatuses = new Set<PlanningCellStatus>();
  if (data) {
    for (const roomOcc of Object.values(data.occupancy)) {
      for (const s of roomOcc) activeStatuses.add(s);
    }
  }

  // REUB virtual room (always shown separately at top)
  const reubRoom = data?.rooms.find(r => (r as any).isVirtual === true || r.roomNumber === "REUB") ?? null;

  // Available room types and floors for filter UI — exclude REUB
  const availableRoomTypes = data?.rooms
    ? Array.from(new Map(data.rooms.filter(r => !(r as any).isVirtual).map(r => [r.roomTypeId, r.roomType])).entries()).map(([id, rt]) => ({ id, name: rt?.name ?? id }))
    : [];
  const availableFloors = data?.rooms
    ? Array.from(new Set(data.rooms.filter(r => !(r as any).isVirtual).map(r => String(r.floor)))).sort((a, b) => Number(a) - Number(b))
    : [];

  const isCompareMode = !!(filters.compareRoom1 || filters.compareRoom2);

  // Apply filters to rooms (REUB excluded — shown separately)
  const filteredRooms = (data?.rooms ?? []).filter(room => {
    // REUB is handled separately
    if ((room as any).isVirtual || room.roomNumber === "REUB") return false;

    // Compare mode: show only the specified rooms
    if (isCompareMode) {
      const num = room.roomNumber.toLowerCase();
      return (
        (filters.compareRoom1 && num === filters.compareRoom1.toLowerCase()) ||
        (filters.compareRoom2 && num === filters.compareRoom2.toLowerCase())
      );
    }

    if (filters.roomTypeIds.length > 0 && !filters.roomTypeIds.includes(room.roomTypeId)) return false;
    if (filters.floorFilter && String(room.floor) !== filters.floorFilter) return false;
    const roomOcc = data?.occupancy[room.id] ?? [];
    const hasReservation = roomOcc.some(s => s !== "available" && s !== "dirty" && s !== "cleaning" && s !== "inspected");
    if (!filters.showEmpty && !hasReservation) return false;
    if (!filters.showOccupied && hasReservation) return false;
    if (filters.statusFilter && !roomOcc.includes(filters.statusFilter as PlanningCellStatus)) return false;
    // Filter by guest name — check all reservations assigned to this room in the visible period
    if (filters.guestSearch) {
      const cellRes = data?.cellReservations[room.id] ?? {};
      const resIds = Array.from(new Set(Object.values(cellRes)));
      const hasMatch = resIds.some(resId => {
        const res = data?.reservations[resId];
        return res?.guestName?.toLowerCase().includes(filters.guestSearch.toLowerCase());
      });
      if (!hasMatch) return false;
    }
    return true;
  });

  const groupedRooms = filteredRooms.reduce((acc, room) => {
    const floor = room.floor;
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(room);
    return acc;
  }, {} as Record<number, typeof filteredRooms>);

  const floors = Object.keys(groupedRooms).map(Number).sort((a, b) => a - b);

  // Sort rooms within each floor numerically by room number
  Object.keys(groupedRooms).forEach((floor) => {
    groupedRooms[Number(floor)].sort((a, b) => {
      const numA = parseInt(a.roomNumber.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.roomNumber.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  });

  return (
    <div ref={planningRef} className={`flex flex-col gap-4 p-6 ${isFullscreen ? "fixed inset-0 z-[60] bg-background overflow-auto" : "h-full"}`}>
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 shrink-0">
        {/* Top bar: title + navigation + collapse button — always visible */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-planning-title">
              Planning de Ocupación
            </h1>
            {!headerCollapsed && (
              <p className="text-muted-foreground">Vista de disponibilidad por habitación y fecha (15 días)</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => navigateDays("prev", 7)} title="Semana anterior" data-testid="button-prev-week">
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigateDays("prev", 1)} title="Día anterior" data-testid="button-prev-day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={goToToday} data-testid="button-today">Hoy</Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" data-testid="button-date-picker">
                  <CalendarSearch className="h-4 w-4 mr-2" />
                  Ir a fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarPicker mode="single" selected={new Date(dateRange.start + "T12:00:00")} onSelect={goToDate} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => navigateDays("next", 1)} title="Día siguiente" data-testid="button-next-day">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigateDays("next", 7)} title="Semana siguiente" data-testid="button-next-week">
              <ChevronsRight className="h-4 w-4" />
            </Button>
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={countActiveFilters(filters) > 0 ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  data-testid="button-open-filters"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtrar
                  {countActiveFilters(filters) > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none ml-0.5">
                      {countActiveFilters(filters)}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="mb-3">
                  <h4 className="font-semibold text-sm">Filtros</h4>
                  <p className="text-xs text-muted-foreground">Reducí la vista del planning</p>
                </div>
                <PlanningFiltersPanel
                  filters={filters}
                  setFilters={setFilters}
                  availableFloors={availableFloors}
                  availableRoomTypes={availableRoomTypes}
                  onClose={() => setFiltersOpen(false)}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              data-testid="button-fullscreen-planning"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setHeaderCollapsed(v => !v)}
              title={headerCollapsed ? "Expandir panel" : "Minimizar panel"}
              data-testid="button-toggle-header"
            >
              {headerCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Collapsable section */}
        {!headerCollapsed && (
          <>
            <Legend activeStatuses={activeStatuses} />

            {data?.unassignedGroupBlocks && data.unassignedGroupBlocks.length > 0 && (
              <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-700">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm flex-1">
                      <button
                        onClick={() => setBlocksExpanded(prev => !prev)}
                        className="flex items-center gap-1 w-full text-left font-medium text-orange-800 dark:text-orange-300 hover:underline focus:outline-none"
                        data-testid="button-toggle-unassigned-blocks"
                      >
                        <span>Bloques sin asignar ({data.unassignedGroupBlocks.length}) — clic en cada bloque para asignar habitaciones</span>
                        {blocksExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      {blocksExpanded && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {data.unassignedGroupBlocks.map((block, idx) => (
                            <button
                              key={idx}
                              onClick={() => navigate(`/groups/${block.groupId}`)}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-orange-400 text-orange-700 dark:text-orange-300 text-xs hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                              data-testid={`badge-unassigned-block-${idx}`}
                            >
                              <Users className="h-3 w-3" />
                              <span className="font-medium">{block.groupName}</span>
                              <span>·</span>
                              <span>{block.quantity - block.assigned} hab. {block.roomTypeName}</span>
                              <span className="text-orange-500">({block.checkIn} → {block.checkOut})</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="py-3 px-4 border-b shrink-0">
          <CardTitle className="text-base font-medium flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span>
                {data ? (() => {
                  const totalReal = data.rooms.filter(r => !(r as any).isVirtual && r.roomNumber !== "REUB").length;
                  return `${filteredRooms.length} habitaciones${filteredRooms.length !== totalReal ? ` (de ${totalReal})` : ""}`;
                })() : "Cargando..."} | {" "}
                {dateRange.start} — {dateRange.end}
              </span>
            </div>
            <button
              onClick={toggleRevenue}
              title={showRevenue ? "Ocultar indicadores de revenue" : "Mostrar indicadores de ocupación y revenue"}
              data-testid="button-toggle-revenue"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                showRevenue
                  ? "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 text-emerald-800 dark:text-emerald-300"
                  : "bg-muted border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Revenue
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data ? (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className={`overflow-auto ${isFullscreen ? "max-h-[calc(100vh-80px)]" : "flex-1 min-h-0"}`}>
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
                    {/* ── FILA DE NOTAS DEL DÍA ─────────────────────── */}
                    <tr className="border-b bg-amber-50/60 dark:bg-amber-950/20">
                      <td className="sticky left-0 z-30 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border-r whitespace-nowrap w-24">
                        Notas
                      </td>
                      {data.days.map((day) => {
                        const info = formatDate(day);
                        const note = dayNotesMap[day] || "";
                        const isEditing = editingNoteDate === day;
                        return (
                          <td
                            key={day}
                            className={`px-0.5 py-0.5 min-w-[60px] align-middle ${
                              info.isToday ? "bg-primary/5" : info.isWeekend ? "bg-muted/20" : ""
                            }`}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingNoteValue}
                                onChange={(e) => setEditingNoteValue(e.target.value)}
                                onBlur={() => saveNoteMutation.mutate({ date: day, note: editingNoteValue })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveNoteMutation.mutate({ date: day, note: editingNoteValue });
                                  if (e.key === "Escape") setEditingNoteDate(null);
                                }}
                                className="w-full text-[10px] px-1 py-0.5 rounded border border-amber-400 bg-white dark:bg-gray-900 focus:outline-none"
                                data-testid={`input-day-note-${day}`}
                              />
                            ) : (
                              <div
                                onClick={() => { setEditingNoteDate(day); setEditingNoteValue(note); }}
                                title={note || "Clic para agregar nota"}
                                className="text-[10px] text-center text-amber-700 dark:text-amber-400 truncate cursor-pointer px-1 py-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 min-h-[18px]"
                                data-testid={`cell-day-note-${day}`}
                              >
                                {note || <span className="text-amber-300 dark:text-amber-700">·</span>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {/* ── FILA DE REVENUE ──────────────────────────── */}
                    {showRevenue && (
                      <tr className="border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                        <td className="sticky left-0 z-30 bg-emerald-50/90 dark:bg-emerald-950/40 px-3 py-1.5 border-r w-24">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <TrendingUp className="h-3 w-3" />
                            Revenue
                          </div>
                        </td>
                        {data.days.map((day, dayIndex) => {
                          const total = data.rooms.length || 66;
                          const occupied = data.rooms.filter(r => {
                            const st = data.occupancy[r.id]?.[dayIndex] ?? "available";
                            return st !== "available" && st !== "maintenance";
                          }).length;
                          const pct = Math.round((occupied / total) * 100);

                          let barColor = "bg-green-400";
                          let textColor = "text-green-700 dark:text-green-400";
                          let demandLabel = "Demanda baja";
                          let suggestion = "Tarifa estándar o descuento";

                          if (pct >= 85) {
                            barColor = "bg-red-500";
                            textColor = "text-red-700 dark:text-red-400";
                            demandLabel = "Casi lleno";
                            suggestion = "↑ Subir tarifa +20–25%";
                          } else if (pct >= 70) {
                            barColor = "bg-orange-400";
                            textColor = "text-orange-700 dark:text-orange-400";
                            demandLabel = "Demanda alta";
                            suggestion = "↑ Subir tarifa +10–15%";
                          } else if (pct >= 40) {
                            barColor = "bg-yellow-400";
                            textColor = "text-yellow-700 dark:text-yellow-500";
                            demandLabel = "Demanda media";
                            suggestion = "Mantener tarifa";
                          }

                          const info = formatDate(day);
                          return (
                            <td
                              key={day}
                              className={`px-1 py-1 min-w-[60px] align-middle ${
                                info.isToday ? "bg-primary/5" : info.isWeekend ? "bg-muted/20" : ""
                              }`}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex flex-col items-center gap-0.5 cursor-default select-none">
                                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${barColor}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className={`text-[9px] font-semibold leading-none ${textColor}`}>
                                      {pct}%
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs max-w-[160px]">
                                  <div className="space-y-0.5 text-center">
                                    <div className="font-semibold">{demandLabel}</div>
                                    <div className="text-muted-foreground">{occupied}/{total} hab. ocupadas</div>
                                    <div className="text-emerald-600 dark:text-emerald-400 font-medium">{suggestion}</div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {/* ── FILA REUB — comodín siempre visible arriba ── */}
                    {reubRoom && (
                      <DroppableRoomRow key="reub" roomId={reubRoom.id} className="border-b-2 border-amber-300 dark:border-amber-700" data-testid="row-reub">
                        <td className="sticky left-0 z-10 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 border-r border-amber-300 dark:border-amber-700">
                          <div className="flex flex-col leading-tight">
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">REUB</span>
                            <span className="text-[9px] text-amber-600/70 dark:text-amber-500/60">comodín</span>
                          </div>
                        </td>
                        {data.days.map((day) => {
                          const reservationId = data.cellReservations[reubRoom.id]?.[day];
                          const reservation = reservationId ? data.reservations[reservationId] : null;
                          const info = formatDate(day);
                          return (
                            <DroppableCell
                              key={day}
                              roomId={reubRoom.id}
                              day={day}
                              className={`p-0.5 border-b border-amber-200/60 dark:border-amber-800/40 ${info.isToday ? "bg-amber-100/60 dark:bg-amber-900/20" : "bg-amber-50/40 dark:bg-amber-950/20"}`}
                            >
                              {reservation ? (
                                <DraggableReservationCell
                                  id={`drag-${reservationId}-${reubRoom.id}-${day}`}
                                  reservationId={reservationId!}
                                  roomId={reubRoom.id}
                                  onClick={() => handleCellClick(reubRoom as any, day, "booked", reservationId)}
                                  onContextMenu={(e: React.MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setColorContextMenu({ x: e.clientX, y: e.clientY, reservationId: reservationId! });
                                  }}
                                  className={`h-8 rounded flex items-center justify-center transition-all cursor-grab active:cursor-grabbing border-2 border-amber-400 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 hover:ring-2 hover:ring-amber-400/50`}
                                  data-testid={`cell-reub-${day}`}
                                >
                                  <span className="text-[10px] font-medium truncate px-1 max-w-[56px]">
                                    {reservation.guestName === "Sin Asignar" || !reservation.guestName
                                      ? reservation.groupName?.substring(0, 4).toUpperCase() || "GRP"
                                      : reservation.guestName.split(" ")[0]}
                                  </span>
                                </DraggableReservationCell>
                              ) : (
                                <div
                                  className="h-8 rounded"
                                  data-testid={`cell-reub-empty-${day}`}
                                />
                              )}
                            </DroppableCell>
                          );
                        })}
                      </DroppableRoomRow>
                    )}
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
                          <DroppableRoomRow key={room.id} roomId={room.id} className="hover:bg-muted/20" data-testid={`row-room-${room.id}`}>
                            <td className="sticky left-0 z-10 bg-background px-2 py-1 border-r">
                              <RoomPopover
                                room={room}
                                open={roomPopoverOpen === room.id}
                                onOpenChange={(o) => setRoomPopoverOpen(o ? room.id : null)}
                                onEditBedConfig={setEditingBedConfig}
                                onUpdateStatus={({ roomId, status }) => updateRoomStatusMutation.mutate({ roomId, status })}
                                isPendingStatusUpdate={updateRoomStatusMutation.isPending}
                                maintenanceAlertRoomIds={maintenanceAlertRoomIds}
                              />
                            </td>
                            {data.days.map((day, dayIndex) => {
                              const status = data.occupancy[room.id]?.[dayIndex] || "available";
                              const reservationId = data.cellReservations[room.id]?.[day];
                              const reservation = reservationId ? data.reservations[reservationId] : null;
                              const info = formatDate(day);
                              const isClickable = status === "available";
                              const ghostBlock = (!reservation && status === "available") ? groupBlockOverlay[room.id]?.[day] : undefined;

                              return (
                                <DroppableCell
                                  key={day}
                                  roomId={room.id}
                                  day={day}
                                  className={`p-0.5 border-b ${info.isToday ? "bg-primary/5" : ""}`}
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {reservation && status === "checked_out" ? (
                                        <div
                                          onClick={() => handleCellClick(room, day, status, reservationId)}
                                          className="h-8 rounded border border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center opacity-40 cursor-pointer hover:opacity-60 transition-opacity bg-zinc-100 dark:bg-zinc-800/40"
                                          data-testid={`cell-${room.id}-${day}`}
                                        >
                                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate px-1 max-w-[56px]">
                                            {reservation.guestName === "Sin Asignar" || !reservation.guestName
                                              ? reservation.groupName?.substring(0, 4).toUpperCase() || "GRP"
                                              : reservation.guestName.split(" ")[0]}
                                          </span>
                                        </div>
                                      ) : reservation && status !== "early_blocked" && status !== "late_blocked" ? (
                                        <DraggableReservationCell
                                          id={`drag-${reservationId}-${room.id}-${day}`}
                                          reservationId={reservationId!}
                                          roomId={room.id}
                                          onClick={() => handleCellClick(room, day, status, reservationId)}
                                          onContextMenu={(e: React.MouseEvent) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setColorContextMenu({ x: e.clientX, y: e.clientY, reservationId: reservationId! });
                                          }}
                                          className={`h-8 rounded flex items-center justify-center transition-all cursor-grab active:cursor-grabbing ${
                                            reservation.isGroup
                                              ? "border"
                                              : reservation.color
                                                ? "border"
                                                : getPlanningCellClasses(status, reservation.source)
                                          } hover:ring-2 hover:ring-primary/50`}
                                          style={
                                            reservation.isGroup
                                              ? getGroupCellStyle(reservation.groupColor)
                                              : reservation.color
                                                ? getGroupCellStyle(reservation.color)
                                                : undefined
                                          }
                                          data-testid={`cell-${room.id}-${day}`}
                                        >
                                          <span className="text-[10px] font-medium truncate px-1 max-w-[56px] inline-flex items-center gap-0.5">
                                            {reservation.earlyCheckIn && day === reservation.checkIn && (
                                              <Sunrise className="h-3 w-3 text-orange-400 flex-shrink-0" data-testid="icon-early-checkin" />
                                            )}
                                            {reservation.isUpgrade && day === reservation.checkIn && (
                                              <TrendingUp className="h-3 w-3 text-amber-400 flex-shrink-0" title="Up Grade" />
                                            )}
                                            {reservation.guestName === "Sin Asignar" || !reservation.guestName
                                              ? reservation.groupName?.substring(0, 4).toUpperCase() || "GRP"
                                              : reservation.guestName.split(" ")[0]}
                                            {reservation.lateCheckOut && (() => {
                                              const coDate = new Date(reservation.checkOut + "T12:00:00");
                                              coDate.setDate(coDate.getDate() - 1);
                                              const lastDay = toArgentinaDateStr(coDate);
                                              return day === lastDay;
                                            })() && (
                                              <Sunset className="h-3 w-3 text-purple-400 flex-shrink-0" data-testid="icon-late-checkout" />
                                            )}
                                          </span>
                                        </DraggableReservationCell>
                                      ) : status === "early_blocked" ? (
                                        <div
                                          className={`h-8 rounded border flex items-center justify-center ${getStatusColor("early_blocked")}`}
                                          data-testid={`cell-${room.id}-${day}`}
                                        >
                                          <Sunrise className="h-3 w-3 text-orange-400" />
                                        </div>
                                      ) : status === "late_blocked" ? (
                                        <div
                                          className={`h-8 rounded border flex items-center justify-center ${getStatusColor("late_blocked")}`}
                                          data-testid={`cell-${room.id}-${day}`}
                                        >
                                          <Sunset className="h-3 w-3 text-purple-400" />
                                        </div>
                                      ) : ghostBlock ? (
                                        <div
                                          className="h-8 rounded border-2 border-dashed flex items-center justify-between cursor-pointer transition-all hover:brightness-110 group/ghost relative px-1"
                                          style={(() => {
                                            const hex = ghostBlock.groupColor.replace("#", "");
                                            const r = parseInt(hex.substring(0, 2), 16);
                                            const g = parseInt(hex.substring(2, 4), 16);
                                            const b = parseInt(hex.substring(4, 6), 16);
                                            return {
                                              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
                                              borderColor: `rgba(${r}, ${g}, ${b}, 0.5)`,
                                            };
                                          })()}
                                          title={`Bloque sin asignar — ${ghostBlock.groupName}`}
                                          data-testid={`cell-ghost-${room.id}-${day}`}
                                          onClick={() => navigate(`/groups/${ghostBlock.groupId}`)}
                                        >
                                          <span
                                            className="text-[9px] font-semibold truncate max-w-[44px] opacity-70"
                                            style={(() => {
                                              const hex = ghostBlock.groupColor.replace("#", "");
                                              const r = parseInt(hex.substring(0, 2), 16);
                                              const g = parseInt(hex.substring(2, 4), 16);
                                              const b = parseInt(hex.substring(4, 6), 16);
                                              return { color: `rgb(${r}, ${g}, ${b})` };
                                            })()}
                                          >
                                            {ghostBlock.groupName.substring(0, 5).toUpperCase()}
                                          </span>
                                          <button
                                            className="hidden group-hover/ghost:flex items-center justify-center w-4 h-4 rounded-full bg-destructive/80 text-white text-[9px] font-bold flex-shrink-0 hover:bg-destructive transition-colors"
                                            title="Eliminar bloque"
                                            data-testid={`button-delete-ghost-${ghostBlock.blockId}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteGroupBlockMutation.mutate(ghostBlock.blockId);
                                            }}
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ) : (
                                        <div
                                          onClick={() => handleCellClick(room, day, status, reservationId)}
                                          className={`h-8 rounded border flex items-center justify-center transition-all ${
                                            getStatusColor(status)
                                          } ${
                                            isClickable
                                              ? "cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-105" 
                                              : "cursor-default"
                                          }`}
                                          data-testid={`cell-${room.id}-${day}`}
                                        >
                                          {isClickable ? (
                                            <Plus className="h-3 w-3 text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100" />
                                          ) : null}
                                        </div>
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px]">
                                      <div className="text-xs space-y-1">
                                        <div className="font-semibold">{room.roomNumber} - {room.roomType?.name ?? ""}</div>
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
                                              Origen: {getSourceLabel(reservation.source)} ({reservation.source})
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
                                            {reservation.prefSummary && (
                                              <div className="flex items-center gap-1 border-t pt-1 mt-1 flex-wrap">
                                                <span className="text-muted-foreground">Prefs:</span>
                                                {reservation.prefSummary.hasCritical && <span title="Preferencia crítica" className="text-red-500">🚨</span>}
                                                {reservation.prefSummary.hasSpecialDate && <span title="Fecha especial" className="text-yellow-500">🎂</span>}
                                                {reservation.prefSummary.hasDiet && <span title="Restricción alimentaria" className="text-orange-500">🍽️</span>}
                                                {!reservation.prefSummary.hasCritical && reservation.prefSummary.hasHigh && <span title="Preferencia alta" className="text-amber-500">⚠️</span>}
                                                <span className="text-muted-foreground">({reservation.prefSummary.count})</span>
                                              </div>
                                            )}
                                            <div className="border-t pt-1 mt-1 text-primary">
                                              Clic para ver detalle
                                            </div>
                                          </div>
                                        ) : ghostBlock ? (
                                          <div className="border-t pt-1 mt-1 space-y-0.5">
                                            <div className="font-semibold" style={(() => { const hex = ghostBlock.groupColor.replace("#",""); const r=parseInt(hex.substring(0,2),16),g=parseInt(hex.substring(2,4),16),b=parseInt(hex.substring(4,6),16); return {color:`rgb(${r},${g},${b})`}; })()}>
                                              Grupo: {ghostBlock.groupName}
                                            </div>
                                            <div className="text-muted-foreground text-[10px]">Bloque sin asignar — clic para ir al grupo y asignar habitación</div>
                                          </div>
                                        ) : isClickable ? (
                                          <div className="border-t pt-1 mt-1 text-primary">
                                            Clic para crear reserva
                                          </div>
                                        ) : null}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </DroppableCell>
                              );
                            })}
                          </DroppableRoomRow>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            <DragOverlay dropAnimation={null}>
              {dragActiveReservation ? (
                <div className="h-8 rounded border bg-primary/20 border-primary flex items-center justify-center px-2 shadow-lg min-w-[60px]">
                  <Move className="h-3 w-3 mr-1 text-primary" />
                  <span className="text-[10px] font-semibold text-primary truncate">
                    {dragActiveReservation.guestName === "Sin Asignar" || !dragActiveReservation.guestName
                      ? dragActiveReservation.groupName?.substring(0, 4).toUpperCase() || "GRP"
                      : dragActiveReservation.guestName.split(" ")[0]}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
            </DndContext>
          ) : null}
        </CardContent>
      </Card>

      <ReservationFormDialog
        key={newReservationDefaults ? `${newReservationDefaults.roomId}-${newReservationDefaults.checkInDate}` : "new-reservation"}
        reservation={undefined}
        guests={guests}
        rooms={allRooms}
        roomTypes={roomTypes}
        open={newReservationOpen}
        onOpenChange={(open) => {
          setNewReservationOpen(open);
          if (!open) setNewReservationDefaults(null);
        }}
        defaultValues={newReservationDefaults || undefined}
        onSuccess={() => {
          setNewReservationDefaults(null);
          queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
        }}
      />

      <ReservationDetailModal
        open={reservationDetailOpen}
        onOpenChange={setReservationDetailOpen}
        reservationId={selectedReservationId}
        onNavigate={navigate}
        onEdit={(reservation) => {
          setEditingReservationData(reservation);
          setEditReservationOpen(true);
        }}
      />

      {editingReservationData && (
        <ReservationFormDialog
          reservation={editingReservationData}
          guests={guests}
          rooms={allRooms}
          roomTypes={roomTypes}
          open={editReservationOpen}
          onOpenChange={setEditReservationOpen}
          onSuccess={() => {
            const editedId = editingReservationData?.id;
            setEditingReservationData(null);
            queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
            if (editedId) {
              queryClient.invalidateQueries({ queryKey: ["/api/reservations", editedId] });
              setSelectedReservationId(editedId);
              setReservationDetailOpen(true);
            }
          }}
        />
      )}

      <PlanningMoveConfirmDialog
        moveConfirm={moveConfirm}
        isPending={moveReservationMutation.isPending}
        onConfirm={(data) => {
          moveReservationMutation.mutate({
            reservationId: data.reservationId,
            roomId: data.toRoomId,
            checkInDate: data.newCheckIn,
            checkOutDate: data.newCheckOut,
          });
        }}
        onCancel={() => setMoveConfirm(null)}
      />

      <PlanningBedConfigDialog
        editingBedConfig={editingBedConfig}
        isPending={updateBedConfigMutation.isPending}
        onChange={(value) => setEditingBedConfig(prev => prev ? { ...prev, current: value } : null)}
        onConfirm={() => {
          if (editingBedConfig) {
            updateBedConfigMutation.mutate({ roomId: editingBedConfig.roomId, bedConfig: editingBedConfig.current });
          }
        }}
        onCancel={() => setEditingBedConfig(null)}
      />

      <PlanningColorContextMenu
        colorContextMenu={colorContextMenu}
        isPending={updateReservationColorMutation.isPending}
        onSelectColor={(reservationId, color) => updateReservationColorMutation.mutate({ reservationId, color })}
        onClose={() => setColorContextMenu(null)}
      />
    </div>
  );
}
