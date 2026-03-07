import { useState, useEffect, Fragment, forwardRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Info, Plus, LogIn, LogOut, ExternalLink, Calendar, User, DollarSign, Bed, Users, CalendarSearch, Accessibility, Mountain, Sofa, Armchair, BedDouble, ArrowLeftRight, BedSingle, Droplets, Sunrise, Sunset, FileText, Ban, GripVertical, Move } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { PlanningData, PlanningCellStatus, Guest, RoomWithType, ReservationWithDetails, ReservationStatus, ReservationSource, RatePlan } from "@shared/schema";

function getLocalToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return {
    dayName: date.toLocaleDateString("es-ES", { weekday: "short" }),
    dayNumber: date.getDate(),
    monthName: date.toLocaleDateString("es-ES", { month: "short" }),
    isToday: dateStr === getLocalToday(),
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
    case "dirty":
      return "bg-orange-200 dark:bg-orange-900/50 border-orange-400 dark:border-orange-700";
    case "cleaning":
      return "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-200 dark:border-yellow-800";
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
    case "dirty":
      return "Sucia";
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
    { status: "dirty", label: "Sucia" },
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
  roomTypeId: string;
  bedConfig: string;
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
  const [bedConfig, setBedConfig] = useState("");
  const [ratePlanId, setRatePlanId] = useState("");
  const [source, setSource] = useState<string>("directo");
  const [manualRate, setManualRate] = useState("");
  const [notes, setNotes] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [showNewGuest, setShowNewGuest] = useState(false);
  const [newGuest, setNewGuest] = useState({ firstName: "", lastName: "", documentNumber: "", phone: "", email: "" });

  const { data: ratePlans } = useQuery<RatePlan[]>({ queryKey: ["/api/rate-plans"] });

  useEffect(() => {
    if (reservationData) {
      const nextDay = new Date(reservationData.checkInDate + "T12:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      setCheckOutDate(nextDay.toISOString().split("T")[0]);
      setBedConfig(reservationData.bedConfig || "");
    }
  }, [reservationData]);

  const filteredGuests = guestSearch.length > 0
    ? guests.filter(g => 
        `${g.firstName} ${g.lastName} ${g.documentNumber || ""}`.toLowerCase().includes(guestSearch.toLowerCase())
      ).slice(0, 10)
    : guests.slice(0, 10);

  const createGuestMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/guests", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
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
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      toast({
        title: "Reserva creada",
        description: "La reserva ha sido creada exitosamente desde el planning.",
      });
      onOpenChange(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la reserva. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setGuestId("");
    setCheckOutDate("");
    setNumberOfGuests(1);
    setBedConfig("");
    setRatePlanId("");
    setSource("directo");
    setManualRate("");
    setNotes("");
    setGuestSearch("");
    setShowNewGuest(false);
    setNewGuest({ firstName: "", lastName: "", documentNumber: "", phone: "", email: "" });
  };

  const handleSubmit = async () => {
    if (!reservationData || !checkOutDate) {
      toast({ title: "Datos incompletos", description: "Complete todos los campos obligatorios.", variant: "destructive" });
      return;
    }

    if (checkOutDate <= reservationData.checkInDate) {
      toast({ title: "Fechas inválidas", description: "La fecha de check-out debe ser posterior al check-in.", variant: "destructive" });
      return;
    }

    let finalGuestId = guestId;

    if (!finalGuestId && showNewGuest) {
      if (!newGuest.firstName.trim()) {
        toast({ title: "Datos incompletos", description: "Ingrese al menos el nombre del huésped.", variant: "destructive" });
        return;
      }
      try {
        const created = await createGuestMutation.mutateAsync({
          firstName: newGuest.firstName.trim(),
          lastName: newGuest.lastName.trim() || "",
          documentType: newGuest.documentNumber ? "dni" : null,
          documentNumber: newGuest.documentNumber || null,
          phone: newGuest.phone || null,
          email: newGuest.email || null,
          nationality: "Argentina",
          segment: "LEISURE",
        });
        finalGuestId = created.id;
      } catch {
        toast({ title: "Error", description: "No se pudo crear el huésped.", variant: "destructive" });
        return;
      }
    }

    if (!finalGuestId) {
      toast({ title: "Datos incompletos", description: "Seleccione o cree un huésped.", variant: "destructive" });
      return;
    }

    const checkIn = new Date(reservationData.checkInDate + "T12:00:00");
    const checkOut = new Date(checkOutDate + "T12:00:00");
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const selectedPlan = ratePlans?.find(rp => rp.id === ratePlanId);

    mutation.mutate({
      guestId: finalGuestId,
      roomId: reservationData.roomId,
      roomTypeId: reservationData.roomTypeId,
      checkInDate: reservationData.checkInDate,
      checkOutDate,
      numberOfGuests,
      nights,
      status: "confirmed",
      source,
      ratePlanId: ratePlanId || null,
      bedTypeNotes: bedConfig || null,
      baseRatePerNight: manualRate || selectedPlan?.baseRate || null,
      finalRatePerNight: manualRate || selectedPlan?.baseRate || null,
      totalRoomAmount: manualRate ? (parseFloat(manualRate) * nights).toFixed(2) : selectedPlan ? (parseFloat(selectedPlan.baseRate) * nights).toFixed(2) : null,
      notes: notes || null,
      discountType: "none",
      discountValue: "0",
      createdAt: new Date().toISOString(),
    });
  };

  if (!reservationData) return null;

  const bedConfigOptions = [
    { value: "MAT", label: "Matrimonial" },
    { value: "TWIN", label: "Twin (2 camas)" },
    { value: "MAT_CC", label: "Matrimonial + Cama cuna" },
    { value: "TWIN_CC", label: "Twin + Cama cuna" },
    { value: "MAT_EXTRA", label: "Matrimonial + Extra" },
    { value: "MAT_CC_EXTRA", label: "Matrimonial + Cuna + Extra" },
  ];

  const sourceOptions = [
    { value: "directo", label: "Directo" },
    { value: "telefono", label: "Teléfono" },
    { value: "web", label: "Web" },
    { value: "booking", label: "Booking" },
    { value: "expedia", label: "Expedia" },
    { value: "airbnb", label: "Airbnb" },
    { value: "despegar", label: "Despegar" },
    { value: "empresa", label: "Empresa" },
  ];

  const roomRatePlans = ratePlans?.filter(rp => rp.roomTypeId === reservationData.roomTypeId) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="title-quick-reservation">Nueva Reserva Rápida</DialogTitle>
          <DialogDescription>
            Hab. {reservationData.roomNumber} ({reservationData.roomTypeName}) — Check-in: {formatDateReadable(reservationData.checkInDate)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label>Huésped *</Label>
            {!showNewGuest ? (
              <>
                <Input
                  placeholder="Buscar huésped por nombre o DNI..."
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  data-testid="input-guest-search"
                />
                {(guestSearch.length > 0 || guests.length > 0) && (
                  <div className="border rounded-md max-h-32 overflow-y-auto">
                    {filteredGuests.map((guest) => (
                      <div
                        key={guest.id}
                        className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent ${guestId === guest.id ? "bg-accent font-medium" : ""}`}
                        onClick={() => { setGuestId(guest.id); setGuestSearch(`${guest.firstName} ${guest.lastName}`); }}
                        data-testid={`guest-option-${guest.id}`}
                      >
                        {guest.firstName} {guest.lastName} {guest.documentNumber ? `— ${guest.documentNumber}` : ""}
                      </div>
                    ))}
                    {filteredGuests.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No se encontraron huéspedes</div>
                    )}
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-fit" onClick={() => { setShowNewGuest(true); setGuestId(""); }} data-testid="button-new-guest">
                  <Plus className="h-3 w-3 mr-1" /> Nuevo huésped
                </Button>
              </>
            ) : (
              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Nuevo huésped</span>
                  <Button variant="ghost" size="sm" onClick={() => { setShowNewGuest(false); setNewGuest({ firstName: "", lastName: "", documentNumber: "", phone: "", email: "" }); }} data-testid="button-cancel-new-guest">
                    Cancelar
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nombre *" value={newGuest.firstName} onChange={(e) => setNewGuest({...newGuest, firstName: e.target.value})} data-testid="input-new-guest-firstname" />
                  <Input placeholder="Apellido" value={newGuest.lastName} onChange={(e) => setNewGuest({...newGuest, lastName: e.target.value})} data-testid="input-new-guest-lastname" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="DNI" value={newGuest.documentNumber} onChange={(e) => setNewGuest({...newGuest, documentNumber: e.target.value})} data-testid="input-new-guest-dni" />
                  <Input placeholder="Teléfono" value={newGuest.phone} onChange={(e) => setNewGuest({...newGuest, phone: e.target.value})} data-testid="input-new-guest-phone" />
                  <Input placeholder="Email" value={newGuest.email} onChange={(e) => setNewGuest({...newGuest, email: e.target.value})} data-testid="input-new-guest-email" />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Check-in</Label>
              <Input type="date" value={reservationData.checkInDate} disabled className="bg-muted" />
            </div>
            <div className="grid gap-1">
              <Label>Check-out *</Label>
              <Input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} min={reservationData.checkInDate} data-testid="input-checkout-quick" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Tipo de camaje</Label>
              <Select value={bedConfig} onValueChange={setBedConfig}>
                <SelectTrigger data-testid="select-bed-config">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {bedConfigOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Huéspedes</Label>
              <Input type="number" min={1} max={10} value={numberOfGuests} onChange={(e) => setNumberOfGuests(parseInt(e.target.value) || 1)} data-testid="input-guests-quick" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Plan tarifario</Label>
              <Select value={ratePlanId} onValueChange={setRatePlanId}>
                <SelectTrigger data-testid="select-rate-plan">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {roomRatePlans.map(rp => (
                    <SelectItem key={rp.id} value={rp.id}>{rp.name} (${rp.baseRate})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Canal</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger data-testid="select-source">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Tarifa manual / noche (opcional)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder={ratePlanId && roomRatePlans.find(rp => rp.id === ratePlanId)?.baseRate ? `Plan: $${roomRatePlans.find(rp => rp.id === ratePlanId)?.baseRate}` : "Usar tarifa del plan"}
              value={manualRate}
              onChange={(e) => setManualRate(e.target.value)}
              data-testid="input-manual-rate"
            />
          </div>

          <div className="grid gap-1">
            <Label>Observaciones</Label>
            <Textarea placeholder="Notas o pedidos especiales..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-notes-quick" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }} data-testid="button-cancel-quick">
            Volver
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || createGuestMutation.isPending} data-testid="button-create-quick">
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
  const [isEditing, setIsEditing] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editEarlyCheckIn, setEditEarlyCheckIn] = useState(false);
  const [editLateCheckOut, setEditLateCheckOut] = useState(false);
  const [editRatePerNight, setEditRatePerNight] = useState("");
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [checkoutReceiptType, setCheckoutReceiptType] = useState("ticket");
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState("efectivo");
  const [checkoutPayAmount, setCheckoutPayAmount] = useState("");

  const { data: reservation, isLoading } = useQuery<ReservationWithDetails>({
    queryKey: ["/api/reservations", reservationId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) throw new Error("Failed to fetch reservation");
      return res.json();
    },
    enabled: !!reservationId && open,
  });

  const updateReservationMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("PATCH", `/api/reservations/${reservationId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservationId] });
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      toast({ title: "Reserva actualizada" });
      setIsEditing(false);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la reserva.", variant: "destructive" });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", `/api/payments`, { ...data, reservationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    },
  });

  const startCheckout = () => {
    setCheckoutStep(1);
    setCheckoutReceiptType("ticket");
    setCheckoutPaymentMethod("efectivo");
    setCheckoutPayAmount("");
  };

  const startEditing = () => {
    if (!reservation) return;
    setEditCheckIn(reservation.checkInDate);
    setEditCheckOut(reservation.checkOutDate);
    setEditChannel(reservation.source || "directo");
    setEditNotes(reservation.notes || "");
    setEditEarlyCheckIn(reservation.earlyCheckIn === "true" || reservation.earlyCheckIn === true);
    setEditLateCheckOut(reservation.lateCheckOut === "true" || reservation.lateCheckOut === true);
    setEditRatePerNight(reservation.finalRatePerNight?.toString() || "");
    setIsEditing(true);
  };

  const saveEdit = () => {
    const ci = new Date(editCheckIn + "T12:00:00");
    const co = new Date(editCheckOut + "T12:00:00");
    const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24)));
    const rate = parseFloat(editRatePerNight) || 0;
    updateReservationMutation.mutate({
      checkInDate: editCheckIn,
      checkOutDate: editCheckOut,
      source: editChannel,
      notes: editNotes,
      earlyCheckIn: editEarlyCheckIn,
      lateCheckOut: editLateCheckOut,
      finalRatePerNight: editRatePerNight,
      nights,
      totalRoomAmount: (rate * nights).toFixed(2),
    });
  };

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
      return apiRequest("POST", `/api/reservations/${reservationId}/check-out`, { forceCheckout: true });
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

  const cancelReservationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/reservations/${reservationId}`, { status: "cancelled" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Reserva cancelada" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo cancelar", variant: "destructive" });
    },
  });

  if (!reservationId) return null;

  const statusBadge = reservation ? getStatusBadge(reservation.status) : null;
  const todayLocal = getLocalToday();
  const isCheckInDateValid = reservation ? (() => {
    const todayMs = new Date(todayLocal + "T12:00:00").getTime();
    const ciMs = new Date(reservation.checkInDate + "T12:00:00").getTime();
    return Math.abs(Math.round((ciMs - todayMs) / (1000 * 60 * 60 * 24))) <= 1;
  })() : false;
  const isCheckOutDateValid = reservation ? (() => {
    const todayMs = new Date(todayLocal + "T12:00:00").getTime();
    const coMs = new Date(reservation.checkOutDate + "T12:00:00").getTime();
    return Math.abs(Math.round((coMs - todayMs) / (1000 * 60 * 60 * 24))) <= 1;
  })() : false;
  const canCheckIn = (reservation?.status === "confirmed" || reservation?.status === "pending") && isCheckInDateValid;
  const canCheckOut = reservation?.status === "checked_in" && isCheckOutDateValid;
  const canCancel = reservation?.status === "confirmed" || reservation?.status === "pending" || reservation?.status === "tentative";
  const totalCharges = reservation?.charges?.reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;

  const printConfirmation = () => {
    if (!reservation) return;
    const guest = reservation.guest;
    const room = reservation.room;
    const guestName = `${(guest?.lastName || "").toUpperCase()} ${guest?.firstName || ""}`.trim();
    const formatShort = (dateStr: string) =>
      new Date(dateStr).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const checkIn = formatShort(reservation.checkInDate);
    const checkOut = formatShort(reservation.checkOutDate);
    const nights = Math.round(
      (new Date(reservation.checkOutDate).getTime() - new Date(reservation.checkInDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const roomTypeName = room?.roomType?.name || "Habitación";
    const dailyRate = reservation.finalRatePerNight
      ? `$${Number(reservation.finalRatePerNight).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      : "$0.00";
    const totalRate = reservation.totalRoomAmount
      ? `$${Number(reservation.totalRoomAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      : "$0.00";
    const pax = reservation.numberOfGuests || 1;
    const reservationCode = reservation.reservationCode || reservation.id;
    const company = (reservation as any).company?.razonSocial || (reservation as any).company?.nombreFantasia || "";

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Confirmación de Reserva - ${guestName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #333; background: white; }
    .page { max-width: 780px; margin: 0 auto; padding: 0; }
    .header-photo { width: 100%; height: 180px; background: linear-gradient(180deg, #2c5f8a 0%, #1a3a5c 60%, #0d2035 100%); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
    .logo-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 2px solid #c8a97e; background: #fff; }
    .logo-left { display: flex; align-items: center; gap: 14px; }
    .logo-circle { width: 56px; height: 56px; border-radius: 50%; border: 2px solid #c8a97e; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: bold; color: #c8a97e; text-align: center; line-height: 1.3; letter-spacing: 0.5px; text-transform: uppercase; padding: 6px; }
    .logo-name { font-size: 20px; font-weight: bold; color: #8b5e2a; font-family: Georgia, serif; line-height: 1.1; }
    .logo-name span { display: block; font-size: 11px; font-weight: normal; color: #999; letter-spacing: 2px; text-transform: uppercase; font-family: Arial, sans-serif; }
    .logo-badge { text-align: center; font-size: 8px; color: #888; border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; line-height: 1.5; }
    .logo-badge strong { display: block; font-size: 10px; color: #c8a97e; }
    .content { padding: 20px 28px; }
    .reservation-header { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 0; border: 1px solid #ccc; margin-bottom: 18px; }
    .reservation-header .cell { padding: 6px 10px; border-right: 1px solid #ccc; }
    .reservation-header .cell:last-child { border-right: none; }
    .reservation-header .cell-label { font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
    .reservation-header .cell-value { font-size: 12px; font-weight: bold; color: #111; }
    .greeting { font-size: 12px; color: #444; line-height: 1.6; margin-bottom: 18px; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 11px; }
    .details-table td { padding: 5px 10px; border: 1px solid #ddd; vertical-align: middle; }
    .details-table .label-col { background: #f5f5f5; font-weight: bold; color: #555; width: 45%; }
    .details-table .value-col { color: #111; font-size: 12px; }
    .rates-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #ddd; margin-bottom: 4px; }
    .rates-grid .rate-cell { padding: 5px 10px; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; font-size: 11px; }
    .rates-grid .rate-cell:nth-child(even) { border-right: none; }
    .rates-grid .rate-label { font-weight: bold; color: #555; background: #f5f5f5; font-size: 10px; }
    .rates-grid .rate-value { color: #111; }
    .total-box { border: 2px solid #333; text-align: center; padding: 6px; font-size: 13px; font-weight: bold; margin-bottom: 18px; color: #111; }
    .total-box span { font-size: 10px; font-weight: normal; color: #555; margin-right: 8px; }
    .conditions { font-size: 10px; color: #444; line-height: 1.7; margin-bottom: 20px; }
    .conditions p { margin-bottom: 3px; }
    .conditions p::before { content: "» "; color: #888; }
    .sustainable { font-size: 10px; color: #4a7c59; font-style: italic; margin-bottom: 20px; }
    .footer { border-top: 2px solid #c8a97e; padding: 12px 0 0; display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #555; }
    .footer-left { line-height: 1.8; }
    .footer-right { font-size: 13px; font-weight: bold; color: #8b5e2a; letter-spacing: 1px; text-transform: uppercase; }
    @media print { body { margin: 0; } .page { max-width: 100%; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header-photo">MARAN SUITES &amp; TOWERS · PARANÁ</div>
  <div class="logo-bar">
    <div class="logo-left">
      <div class="logo-circle">Hotel<br>&amp; Spa<br>MARAN<br>SUITES<br>&amp; Towers</div>
      <div class="logo-name">MARAN SUITES &amp; TOWERS<span>Hotel &amp; Spa · Paraná, Entre Ríos</span></div>
    </div>
    <div class="logo-badge"><strong>PLATA</strong>CERTIFICACIÓN<br>EN SOSTENIBILIDAD<br>HOTELES MÁS VERDES</div>
  </div>
  <div class="content">
    <div class="reservation-header">
      <div class="cell"><div class="cell-label">Apellido y Nombre / Last Name and Name</div><div class="cell-value">${guestName}</div></div>
      <div class="cell"><div class="cell-label">Check In</div><div class="cell-value">${checkIn}</div></div>
      <div class="cell"><div class="cell-label">Check Out</div><div class="cell-value">${checkOut}</div></div>
      <div class="cell"><div class="cell-label">Cant. de Pax</div><div class="cell-value">${pax}</div></div>
      <div class="cell"><div class="cell-label">Nº de Reserva</div><div class="cell-value">${reservationCode}</div></div>
    </div>
    ${company ? `<div class="reservation-header" style="margin-top:-14px;"><div class="cell" style="grid-column: span 5; border-right: none;"><div class="cell-label">Empresa / Company</div><div class="cell-value">${company}</div></div></div>` : ""}
    <div class="greeting"><strong>Estimado/a,</strong><br>Gracias por efectuar su reserva, será un placer recibirlo en nuestra casa. A continuación detallamos la información correspondiente a la misma.</div>
    <table class="details-table">
      <tr><td class="label-col">Cantidad de noches / Number of nights</td><td class="value-col">${nights}</td></tr>
      <tr><td class="label-col">Categoría de Habitación / Type of Room</td><td class="value-col">${roomTypeName}</td></tr>
    </table>
    <div class="rates-grid">
      <div class="rate-cell rate-label">Tarífa diaria / Daily rate</div><div class="rate-cell rate-value">${dailyRate}</div>
      <div class="rate-cell rate-label">Tarífa diaria Cochera / Garage rate</div><div class="rate-cell rate-value">$0.00</div>
      <div class="rate-cell rate-label">Total Alojamiento / Total rate</div><div class="rate-cell rate-value">${totalRate}</div>
      <div class="rate-cell rate-label">Total Cochera / Garage</div><div class="rate-cell rate-value">$0.00</div>
    </div>
    <div class="total-box"><span>Tarífa Total / Total rate:</span>${totalRate}</div>
    <div class="conditions">
      <p>La tarifa incluye desayuno buffet y gimnasio con turno previo.</p>
      <p>La cochera tiene costo adicional. El mismo se encuentra detallado en la parte superior.</p>
      <p>Nuestro horario de Check in es a partir de las 15:00 Hs y el Check out es hasta las 10:00 Hs.</p>
      <p>Early Check in o Late Check out tienen costo adicional del 50% del valor de una noche.</p>
      <p>Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI.</p>
    </div>
    <div class="sustainable">Somos un hotel certificado en acciones sustentables, por lo que no es necesario que se imprima esta confirmación de reserva, la misma es válida en formato digital.</div>
    <div class="footer">
      <div class="footer-left">Alameda de la Federación y Mitre, Paraná (3100) Entre Ríos, Argentina<br>✉ reservas@maran.com.ar &nbsp;|&nbsp; +54 9 343 503 8070 &nbsp;|&nbsp; ☎ +54 (0343) 423 5444</div>
      <div class="footer-right">maran.com.ar</div>
    </div>
  </div>
</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

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
          checkoutStep > 0 ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 mb-2">
                {[1,2,3,4].map(s => (
                  <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= checkoutStep ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Paso {checkoutStep} de 4: {checkoutStep === 1 ? "Resumen de cuenta" : checkoutStep === 2 ? "Pago" : checkoutStep === 3 ? "Comprobante" : "Confirmar"}
              </p>

              {checkoutStep === 1 && (() => {
                const totalPayments = reservation.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                const totalAmount = parseFloat(reservation.totalRoomAmount || "0") + totalCharges;
                const balance = totalAmount - totalPayments;
                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/50 rounded-md space-y-1">
                      <div className="flex justify-between text-sm"><span>Habitación ({reservation.nights} noches)</span><span>${parseFloat(reservation.totalRoomAmount || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span></div>
                      {totalCharges > 0 && <div className="flex justify-between text-sm"><span>Cargos extras</span><span>${totalCharges.toFixed(2)}</span></div>}
                      <div className="flex justify-between text-sm border-t pt-1"><span>Pagado</span><span className="text-green-600">-${totalPayments.toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold pt-1 border-t"><span>Saldo</span><span className={balance > 0 ? "text-destructive" : "text-green-600"}>${balance.toFixed(2)}</span></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCheckoutStep(0)}>Cancelar</Button>
                      <Button size="sm" onClick={() => setCheckoutStep(balance > 0 ? 2 : 3)} data-testid="button-checkout-step1-next">
                        {balance > 0 ? "Registrar Pago" : "Siguiente"}
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {checkoutStep === 2 && (() => {
                const totalPayments = reservation.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                const totalAmount = parseFloat(reservation.totalRoomAmount || "0") + totalCharges;
                const balance = totalAmount - totalPayments;
                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md text-sm">
                      Saldo pendiente: <span className="font-bold">${balance.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Monto</Label>
                        <Input type="number" min={0} step="0.01" value={checkoutPayAmount || balance.toFixed(2)} onChange={(e) => setCheckoutPayAmount(e.target.value)} data-testid="input-checkout-amount" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Método</Label>
                        <Select value={checkoutPaymentMethod} onValueChange={setCheckoutPaymentMethod}>
                          <SelectTrigger data-testid="select-checkout-method"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="tarjeta_debito">Tarjeta Débito</SelectItem>
                            <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="mercadopago">MercadoPago</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCheckoutStep(1)}>Atrás</Button>
                      <Button size="sm" onClick={() => {
                        addPaymentMutation.mutate({ amount: checkoutPayAmount || balance.toFixed(2), method: checkoutPaymentMethod, receiptType: checkoutReceiptType }, {
                          onSuccess: () => setCheckoutStep(3),
                        });
                      }} disabled={addPaymentMutation.isPending} data-testid="button-checkout-pay">
                        {addPaymentMutation.isPending ? "Procesando..." : "Registrar Pago"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setCheckoutStep(3)} data-testid="button-checkout-skip-pay">
                        Omitir
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {checkoutStep === 3 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Comprobante</Label>
                    <Select value={checkoutReceiptType} onValueChange={setCheckoutReceiptType}>
                      <SelectTrigger data-testid="select-checkout-receipt"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ticket">Ticket</SelectItem>
                        <SelectItem value="factura_a">Factura A</SelectItem>
                        <SelectItem value="factura_b">Factura B</SelectItem>
                        <SelectItem value="factura_c">Factura C</SelectItem>
                        <SelectItem value="voucher">Voucher (No Fiscal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCheckoutStep(2)}>Atrás</Button>
                    <Button size="sm" onClick={() => setCheckoutStep(4)} data-testid="button-checkout-step3-next">Siguiente</Button>
                  </div>
                </div>
              )}

              {checkoutStep === 4 && (
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
                    <p>Se realizará el check-out de <span className="font-bold">{reservation.guest?.firstName} {reservation.guest?.lastName}</span>.</p>
                    <p>Habitación <span className="font-bold">{reservation.room?.roomNumber}</span> quedará en estado <Badge variant="outline" className="text-orange-700">Sucia</Badge>.</p>
                    <p>Se creará tarea de limpieza en Housekeeping.</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCheckoutStep(3)}>Atrás</Button>
                    <Button variant="destructive" size="sm" onClick={() => {
                      checkOutMutation.mutate();
                      setCheckoutStep(0);
                    }} disabled={checkOutMutation.isPending} data-testid="button-checkout-confirm">
                      {checkOutMutation.isPending ? "Procesando..." : "Confirmar Check-out"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : isEditing ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Check-in</Label>
                  <Input type="date" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} data-testid="input-edit-checkin" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Check-out</Label>
                  <Input type="date" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} data-testid="input-edit-checkout" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Canal</Label>
                  <Select value={editChannel} onValueChange={setEditChannel}>
                    <SelectTrigger data-testid="select-edit-channel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["directo","booking","expedia","airbnb","despegar","telefono","email","web","agencia","otro"] as const).map(s => (
                        <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tarifa/noche</Label>
                  <Input type="number" min={0} step="0.01" value={editRatePerNight} onChange={(e) => setEditRatePerNight(e.target.value)} data-testid="input-edit-rate" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editEarlyCheckIn} onChange={(e) => setEditEarlyCheckIn(e.target.checked)} className="rounded" data-testid="check-edit-early" />
                  <Sunrise className="h-4 w-4 text-orange-400" /> Early Check-in
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editLateCheckOut} onChange={(e) => setEditLateCheckOut(e.target.checked)} className="rounded" data-testid="check-edit-late" />
                  <Sunset className="h-4 w-4 text-purple-400" /> Late Check-out
                </label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Observaciones</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} data-testid="input-edit-notes" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancelar</Button>
                <Button size="sm" onClick={saveEdit} disabled={updateReservationMutation.isPending} data-testid="button-save-edit">
                  {updateReservationMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </div>
            </div>
          ) : (
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
                <div style={{ whiteSpace: "pre-wrap" }}>{reservation.notes}</div>
              </div>
            )}
          </div>
          )
        ) : null}

        {!isEditing && (
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {reservation && (
            <Button
              variant="outline"
              onClick={printConfirmation}
              className="w-full sm:w-auto"
              data-testid="button-print-confirmation"
            >
              <FileText className="h-4 w-4 mr-2" />
              Confirmación
            </Button>
          )}
          {reservation && reservation.status !== "checked_out" && reservation.status !== "cancelled" && (
            <Button
              variant="outline"
              size="sm"
              onClick={startEditing}
              className="w-full sm:w-auto"
              data-testid="button-edit-reservation"
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
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
              onClick={startCheckout}
              variant="secondary"
              className="w-full sm:w-auto"
              data-testid="button-checkout-quick"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Check-out
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (window.confirm("¿Está seguro que desea cancelar esta reserva?")) {
                  cancelReservationMutation.mutate();
                }
              }}
              disabled={cancelReservationMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-cancel-reservation"
            >
              <Ban className="h-4 w-4 mr-2" />
              {cancelReservationMutation.isPending ? "Cancelando..." : "Anular"}
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
        )}
      </DialogContent>
    </Dialog>
  );
}

function DraggableReservationCell({
  id,
  reservationId,
  roomId,
  children,
  className,
  onClick,
  "data-testid": testId,
}: {
  id: string;
  reservationId: string;
  roomId: string;
  children: React.ReactNode;
  className: string;
  onClick: () => void;
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
      onClick={(e) => {
        if (!isDragging) onClick();
      }}
      className={`${className} ${isDragging ? "opacity-40 ring-2 ring-primary" : ""}`}
      data-testid={testId}
      style={{ touchAction: "none" }}
    >
      {children}
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
  const { setNodeRef, isOver: over } = useDroppable({
    id: `drop-${roomId}`,
    data: { roomId },
  });

  return (
    <tr
      ref={setNodeRef}
      className={`${className || ""} ${over ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
      data-testid={testId}
    >
      {children}
    </tr>
  );
}

export default function PlanningPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState(() => {
    const todayStr = getLocalToday();
    const today = new Date(todayStr + "T12:00:00");
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

  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{
    reservationId: string;
    guestName: string;
    fromRoomNumber: string;
    toRoomId: string;
    toRoomNumber: string;
    toRoomType: string;
  } | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const sensors = useSensors(pointerSensor);

  const moveReservationMutation = useMutation({
    mutationFn: async ({ reservationId, roomId }: { reservationId: string; roomId: string }) => {
      const res = await apiRequest("PATCH", `/api/reservations/${reservationId}`, { roomId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
      toast({ title: "Reserva movida", description: "La habitación fue actualizada correctamente." });
      setMoveConfirm(null);
    },
    onError: (error: any) => {
      const msg = error?.message || "No se pudo mover la reserva.";
      toast({ title: "Error", description: msg, variant: "destructive" });
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

    if (!reservationId || !toRoomId || fromRoomId === toRoomId) return;

    const reservation = data.reservations[reservationId];
    if (!reservation) return;

    const toRoom = data.rooms.find(r => r.id === toRoomId);
    const fromRoom = data.rooms.find(r => r.id === fromRoomId);
    if (!toRoom || !fromRoom) return;

    const checkInIdx = data.days.indexOf(reservation.checkIn);
    const checkOutIdx = data.days.indexOf(reservation.checkOut);
    const startIdx = Math.max(0, checkInIdx >= 0 ? checkInIdx : 0);
    const endIdx = checkOutIdx >= 0 ? checkOutIdx - 1 : data.days.length - 1;

    for (let i = startIdx; i <= endIdx; i++) {
      const day = data.days[i];
      const existingResId = data.cellReservations[toRoomId]?.[day];
      if (existingResId && existingResId !== reservationId) {
        toast({
          title: "Habitación ocupada",
          description: `La habitación ${toRoom.roomNumber} tiene otra reserva en esas fechas.`,
          variant: "destructive",
        });
        return;
      }
    }

    setMoveConfirm({
      reservationId,
      guestName: reservation.guestName,
      fromRoomNumber: fromRoom.roomNumber,
      toRoomId: toRoom.id,
      toRoomNumber: toRoom.roomNumber,
      toRoomType: toRoom.roomType.name,
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

  const { data: guests = [] } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
    queryFn: async () => {
      const res = await fetch("/api/guests");
      if (!res.ok) throw new Error("Failed to fetch guests");
      return res.json();
    },
  });

  const dragActiveReservation = dragActiveId && data ? data.reservations[dragActiveId] : null;

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
    const todayStr = getLocalToday();
    const today = new Date(todayStr + "T12:00:00");
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
    if (status === "available") {
      setSelectedCell({
        roomId: room.id,
        roomNumber: room.roomNumber,
        roomTypeName: room.roomType.name,
        roomTypeId: room.roomTypeId,
        bedConfig: room.bedConfig || "",
        checkInDate: day,
      });
      setQuickReservationOpen(true);
    } else {
      const resolvedId = reservationId || findReservationForRoomAndDay(room.id, day);
      if (resolvedId) {
        setSelectedReservationId(resolvedId);
        setReservationDetailOpen(true);
      }
    }
  };

  const groupedRooms = data?.rooms.reduce((acc, room) => {
    const floor = room.floor;
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(room);
    return acc;
  }, {} as Record<number, typeof data.rooms>) || {};

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

      <Card className="flex-1 min-h-0">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span>
              {data ? `${data.rooms.length} habitaciones` : "Cargando..."} | {" "}
              {dateRange.start} — {dateRange.end}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-60px)] overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data ? (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                          <DroppableRoomRow key={room.id} roomId={room.id} className="hover:bg-muted/20" data-testid={`row-room-${room.id}`}>
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
                                      {reservation ? (
                                        <DraggableReservationCell
                                          id={`drag-${reservationId}-${room.id}-${day}`}
                                          reservationId={reservationId!}
                                          roomId={room.id}
                                          onClick={() => handleCellClick(room, day, status, reservationId)}
                                          className={`h-8 rounded border flex items-center justify-center transition-all cursor-grab active:cursor-grabbing ${
                                            getSourceColor(reservation.source)
                                          } hover:ring-2 hover:ring-primary/50`}
                                          data-testid={`cell-${room.id}-${day}`}
                                        >
                                          <span className="text-[10px] font-medium truncate px-1 max-w-[56px] inline-flex items-center gap-0.5">
                                            {reservation.earlyCheckIn && day === reservation.checkIn && (
                                              <Sunrise className="h-3 w-3 text-orange-400 flex-shrink-0" data-testid="icon-early-checkin" />
                                            )}
                                            {reservation.isGroup ? "GRP" : reservation.guestName.split(" ")[0]}
                                            {reservation.lateCheckOut && day === reservation.checkOut && (
                                              <Sunset className="h-3 w-3 text-purple-400 flex-shrink-0" data-testid="icon-late-checkout" />
                                            )}
                                          </span>
                                        </DraggableReservationCell>
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
                          </DroppableRoomRow>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            <DragOverlay dropAnimation={null}>
              {dragActiveReservation ? (
                <div className="h-8 rounded border bg-primary/20 border-primary flex items-center justify-center px-2 shadow-lg min-w-[60px]">
                  <Move className="h-3 w-3 mr-1 text-primary" />
                  <span className="text-[10px] font-semibold text-primary truncate">
                    {dragActiveReservation.isGroup ? "GRP" : dragActiveReservation.guestName.split(" ")[0]}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
            </DndContext>
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

      <Dialog open={!!moveConfirm} onOpenChange={(open) => !open && setMoveConfirm(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-move-reservation">
          <DialogHeader>
            <DialogTitle>
              <Move className="h-5 w-5 inline mr-2" />
              Mover Reserva
            </DialogTitle>
            <DialogDescription>
              ¿Confirmar el cambio de habitación para esta reserva?
            </DialogDescription>
          </DialogHeader>
          {moveConfirm && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{moveConfirm.guestName}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-sm" data-testid="badge-from-room">
                  Hab. {moveConfirm.fromRoomNumber}
                </Badge>
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <Badge className="text-sm bg-primary" data-testid="badge-to-room">
                  Hab. {moveConfirm.toRoomNumber}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Tipo: {moveConfirm.toRoomType}
              </p>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setMoveConfirm(null)}
              data-testid="button-cancel-move"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (moveConfirm) {
                  moveReservationMutation.mutate({
                    reservationId: moveConfirm.reservationId,
                    roomId: moveConfirm.toRoomId,
                  });
                }
              }}
              disabled={moveReservationMutation.isPending}
              data-testid="button-confirm-move"
            >
              {moveReservationMutation.isPending ? "Moviendo..." : "Confirmar Movimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
