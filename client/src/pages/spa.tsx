import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfDay, parseISO, isSameDay, startOfWeek, addWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  User,
  Phone,
  Loader2,
  Calendar,
  Sparkles,
  CreditCard,
  Home,
  Receipt,
  Pencil,
  X,
  DollarSign,
  Trash2,
  CalendarDays,
  LayoutGrid,
  AlertTriangle,
  Package,
} from "lucide-react";

type SpaCabin = {
  id: string;
  name: string;
  description: string | null;
  isActive: string | null;
};

type SpaTreatment = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  isActive: string | null;
};

type SpaAppointment = {
  id: string;
  cabinId: string;
  treatmentId: string;
  guestName: string;
  guestLastName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  reservationId: string | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  createdAt: string;
  cabin?: SpaCabin;
  treatment?: SpaTreatment;
};

type SpaPayment = {
  id: string;
  accountId: string;
  amount: string;
  method: string;
  isAdvance: string | null;
  appointmentId: string | null;
  reservationId: string | null;
  notes: string | null;
  createdAt: string;
};

type SpaAccountItem = {
  id: string;
  accountId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  itemType: string;
  notes: string | null;
  createdAt: string;
};

type SpaAccount = {
  id: string;
  appointmentId: string;
  guestName: string;
  reservationId: string | null;
  status: "open" | "closed" | "cancelled";
  subtotal: string;
  total: string;
  totalPaid: string;
  receiptType: string | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  chargedTo: string | null;
  items: SpaAccountItem[];
  payments: SpaPayment[];
};

type Reservation = {
  id: string;
  guestId: string;
  roomId: string;
  status: string;
  guest?: { firstName: string; lastName: string };
  room?: { roomNumber: string };
};

type WeeklySummaryItem = {
  cabinId: string;
  date: string;
  count: number;
};

type InventoryItemWithDetails = {
  id: string;
  name: string;
  currentStock: number;
  unit: string;
  costPrice: string;
  category?: { name: string; area: string };
};

const appointmentStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  confirmed: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  in_progress: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  completed: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
  no_show: "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30",
};

const appointmentStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  in_progress: "En Curso",
  completed: "Completado",
  cancelled: "Cancelado",
  no_show: "No Show",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  debit_card: "Tarjeta Débito",
  credit_card: "Tarjeta Crédito",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
  room_charge: "Cargo a Habitación",
};

const TIME_SLOTS: string[] = [];
for (let h = 8; h < 22; h++) {
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:30`);
}
TIME_SLOTS.push("22:00");

const appointmentFormSchema = z.object({
  cabinId: z.string().min(1, "Seleccione un gabinete"),
  treatmentId: z.string().min(1, "Seleccione un tratamiento"),
  guestName: z.string().min(1, "El nombre es requerido"),
  guestLastName: z.string().optional(),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email("Email invalido").optional().or(z.literal("")),
  appointmentDate: z.string().min(1, "La fecha es requerida"),
  startTime: z.string().min(1, "La hora de inicio es requerida"),
  reservationId: z.string().optional(),
  notes: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

type ViewMode = "daily" | "weekly";
type SpaTab = "agenda" | "insumos";

export default function SpaPage() {
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [activeTab, setActiveTab] = useState<SpaTab>("agenda");
  const [selectedAppointment, setSelectedAppointment] = useState<SpaAppointment | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isFolioOpen, setIsFolioOpen] = useState(false);
  const [isAddChargeOpen, setIsAddChargeOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReservationId, setPaymentReservationId] = useState("");
  const [isPaymentAdvance, setIsPaymentAdvance] = useState(false);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargePrice, setChargePrice] = useState("");
  const [chargeQuantity, setChargeQuantity] = useState("1");
  const [chargeType, setChargeType] = useState("service");
  const [receiptType, setReceiptType] = useState("");
  const { toast } = useToast();

  const { data: cabins = [], isLoading: cabinsLoading } = useQuery<SpaCabin[]>({
    queryKey: ["/api/spa/cabins"],
  });

  const { data: treatments = [] } = useQuery<SpaTreatment[]>({
    queryKey: ["/api/spa/treatments"],
  });

  const { data: checkedInReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    select: (data) => data.filter((r) => r.status === "checked_in"),
  });

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<SpaAppointment[]>({
    queryKey: ["/api/spa/appointments", dateStr, dateStr],
    queryFn: async () => {
      const response = await fetch(
        `/api/spa/appointments?startDate=${dateStr}&endDate=${dateStr}`
      );
      if (!response.ok) throw new Error("Error fetching appointments");
      return response.json();
    },
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { data: weeklySummary = [] } = useQuery<WeeklySummaryItem[]>({
    queryKey: ["/api/spa/appointments/weekly-summary", weekStartStr, weekEndStr],
    queryFn: async () => {
      const response = await fetch(
        `/api/spa/appointments/weekly-summary?startDate=${weekStartStr}&endDate=${weekEndStr}`
      );
      if (!response.ok) throw new Error("Error");
      return response.json();
    },
    enabled: viewMode === "weekly",
  });

  const { data: selectedAccount, refetch: refetchAccount } = useQuery<SpaAccount>({
    queryKey: ["/api/spa/accounts/by-appointment", selectedAppointment?.id],
    queryFn: async () => {
      if (!selectedAppointment) throw new Error("No appointment selected");
      const response = await fetch(`/api/spa/accounts/by-appointment/${selectedAppointment.id}`);
      if (!response.ok) throw new Error("Account not found");
      return response.json();
    },
    enabled: !!selectedAppointment,
    staleTime: 0,
  });

  const { data: spaInventoryItems = [] } = useQuery<InventoryItemWithDetails[]>({
    queryKey: ["/api/inventory/items", "spa"],
    queryFn: async () => {
      const response = await fetch("/api/inventory/items?area=spa");
      if (!response.ok) throw new Error("Error");
      return response.json();
    },
    enabled: activeTab === "insumos",
  });

  const activeCabins = cabins.filter((c) => c.isActive === "true");

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      cabinId: "",
      treatmentId: "",
      guestName: "",
      guestLastName: "",
      guestPhone: "",
      guestEmail: "",
      appointmentDate: dateStr,
      startTime: "",
      reservationId: "",
      notes: "",
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentFormValues) => {
      const treatment = treatments.find((t) => t.id === data.treatmentId);
      const durationMinutes = treatment?.durationMinutes ?? 60;
      
      const startMinutes = timeToMinutes(data.startTime);
      const endMinutes = startMinutes + durationMinutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`;

      const res = await fetch("/api/spa/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          endTime,
          status: "confirmed",
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Error al crear turno");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Turno creado correctamente" });
      setIsNewDialogOpen(false);
      form.reset({
        cabinId: "", treatmentId: "", guestName: "", guestLastName: "",
        guestPhone: "", guestEmail: "", appointmentDate: dateStr,
        startTime: "", reservationId: "", notes: "",
      });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const editAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentFormValues & { id: string }) => {
      const treatment = treatments.find((t) => t.id === data.treatmentId);
      const durationMinutes = treatment?.durationMinutes ?? 60;
      const startMinutes = timeToMinutes(data.startTime);
      const endMinutes = startMinutes + durationMinutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`;

      const res = await fetch(`/api/spa/appointments/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cabinId: data.cabinId,
          treatmentId: data.treatmentId,
          guestName: data.guestName,
          guestLastName: data.guestLastName || null,
          guestPhone: data.guestPhone || null,
          guestEmail: data.guestEmail || null,
          appointmentDate: data.appointmentDate,
          startTime: data.startTime,
          endTime,
          reservationId: data.reservationId || null,
          notes: data.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Error al editar turno");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Turno actualizado correctamente" });
      setIsNewDialogOpen(false);
      setIsEditMode(false);
      setEditingAppointmentId(null);
      setSelectedAppointment(null);
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/spa/appointments/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Turno actualizado" });
    },
    onError: () => {
      toast({ title: "Error al actualizar el turno", variant: "destructive" });
    },
  });

  const addChargeMutation = useMutation({
    mutationFn: async ({ accountId, description, quantity, unitPrice, itemType }: {
      accountId: string; description: string; quantity: number; unitPrice: string; itemType: string;
    }) => {
      return apiRequest("POST", `/api/spa/accounts/${accountId}/items`, {
        description, quantity, unitPrice, itemType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/accounts"] });
      refetchAccount();
      toast({ title: "Cargo agregado" });
      setIsAddChargeOpen(false);
      setChargeDescription("");
      setChargePrice("");
      setChargeQuantity("1");
      setChargeType("service");
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest("DELETE", `/api/spa/account-items/${itemId}`);
    },
    onSuccess: () => {
      refetchAccount();
      toast({ title: "Cargo eliminado" });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: async ({ accountId, amount, method, isAdvance, reservationId }: {
      accountId: string; amount: string; method: string; isAdvance: boolean; reservationId?: string;
    }) => {
      return apiRequest("POST", `/api/spa/accounts/${accountId}/payments`, {
        amount, method, isAdvance, reservationId: reservationId || null,
      });
    },
    onSuccess: () => {
      refetchAccount();
      toast({ title: "Pago registrado" });
      setIsAddPaymentOpen(false);
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentReservationId("");
      setIsPaymentAdvance(false);
    },
  });

  const closeAccountMutation = useMutation({
    mutationFn: async ({ accountId, receiptType }: { accountId: string; receiptType: string }) => {
      const res = await fetch(`/api/spa/accounts/${accountId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargedTo: "direct", receiptType }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Error al cerrar");
      }
      return res.json();
    },
    onSuccess: async () => {
      if (selectedAppointment) {
        await updateAppointmentMutation.mutateAsync({ id: selectedAppointment.id, status: "completed" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/spa/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Folio cerrado correctamente" });
      setIsFolioOpen(false);
      setSelectedAppointment(null);
      setReceiptType("");
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const handlePreviousDay = () => setSelectedDate(addDays(selectedDate, -1));
  const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));
  const handleToday = () => setSelectedDate(startOfDay(new Date()));
  const handlePreviousWeek = () => setSelectedDate(addWeeks(selectedDate, -1));
  const handleNextWeek = () => setSelectedDate(addWeeks(selectedDate, 1));

  const handleCellClick = (cabinId: string, time: string) => {
    setIsEditMode(false);
    setEditingAppointmentId(null);
    form.reset({
      cabinId, treatmentId: "", guestName: "", guestLastName: "",
      guestPhone: "", guestEmail: "", appointmentDate: dateStr,
      startTime: time, reservationId: "", notes: "",
    });
    setIsNewDialogOpen(true);
  };

  const handleEditAppointment = (apt: SpaAppointment) => {
    setIsEditMode(true);
    setEditingAppointmentId(apt.id);
    form.reset({
      cabinId: apt.cabinId,
      treatmentId: apt.treatmentId,
      guestName: apt.guestName,
      guestLastName: apt.guestLastName || "",
      guestPhone: apt.guestPhone || "",
      guestEmail: apt.guestEmail || "",
      appointmentDate: apt.appointmentDate,
      startTime: apt.startTime,
      reservationId: apt.reservationId || "",
      notes: apt.notes || "",
    });
    setSelectedAppointment(null);
    setIsNewDialogOpen(true);
  };

  const handleCancelAppointment = () => {
    if (selectedAppointment) {
      updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "cancelled" });
      setIsCancelConfirmOpen(false);
      setSelectedAppointment(null);
    }
  };

  const handleOpenFolio = () => {
    setSelectedAppointment(selectedAppointment);
    setIsFolioOpen(true);
  };

  const getAppointmentForSlot = (cabinId: string, slotTime: string): SpaAppointment | null => {
    const slotMinutes = timeToMinutes(slotTime);
    for (const apt of appointments) {
      if (apt.cabinId !== cabinId) continue;
      const aptDate = parseISO(apt.appointmentDate);
      if (!isSameDay(aptDate, selectedDate)) continue;
      const startMinutes = timeToMinutes(apt.startTime);
      const endMinutes = timeToMinutes(apt.endTime);
      if (slotMinutes >= startMinutes && slotMinutes < endMinutes) return apt;
    }
    return null;
  };

  const isSlotStart = (cabinId: string, slotTime: string): boolean => {
    return appointments.some(apt => 
      apt.cabinId === cabinId && 
      apt.startTime === slotTime &&
      isSameDay(parseISO(apt.appointmentDate), selectedDate)
    );
  };

  const getAppointmentColSpan = (appointment: SpaAppointment): number => {
    const startMinutes = timeToMinutes(appointment.startTime);
    const endMinutes = timeToMinutes(appointment.endTime);
    return Math.ceil((endMinutes - startMinutes) / 30);
  };

  const onSubmit = (data: AppointmentFormValues) => {
    if (isEditMode && editingAppointmentId) {
      editAppointmentMutation.mutate({ ...data, id: editingAppointmentId });
    } else {
      createAppointmentMutation.mutate(data);
    }
  };

  const hasAdvancePayment = (aptId: string) => {
    if (!selectedAccount) return false;
    return selectedAccount.payments.some(p => p.isAdvance === "true");
  };

  const accountTotal = useMemo(() => {
    if (!selectedAccount) return 0;
    return selectedAccount.items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
  }, [selectedAccount]);

  const accountPaid = useMemo(() => {
    if (!selectedAccount) return 0;
    return selectedAccount.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  }, [selectedAccount]);

  const accountBalance = accountTotal - accountPaid;

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  }, [weekStart]);

  const getWeeklyCount = (cabinId: string, date: Date): number => {
    const dateStr = format(date, "yyyy-MM-dd");
    const item = weeklySummary.find(s => s.cabinId === cabinId && s.date === dateStr);
    return item?.count ?? 0;
  };

  const getOccupancyColor = (count: number): string => {
    if (count === 0) return "bg-gray-50 dark:bg-gray-800/30";
    if (count <= 2) return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300";
    if (count <= 4) return "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300";
    return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300";
  };

  if (cabinsLoading || appointmentsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">SPA</h1>
            <p className="text-sm text-muted-foreground">Gestión de turnos y tratamientos</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={activeTab === "agenda" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("agenda")}
            data-testid="tab-agenda"
          >
            <CalendarDays className="h-4 w-4 mr-1" /> Agenda
          </Button>
          <Button
            variant={activeTab === "insumos" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("insumos")}
            data-testid="tab-insumos"
          >
            <Package className="h-4 w-4 mr-1" /> Insumos
          </Button>
        </div>
      </div>

      {activeTab === "agenda" && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={viewMode === "daily" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("daily")}
                  data-testid="view-daily"
                >
                  <LayoutGrid className="h-4 w-4 mr-1" /> Diaria
                </Button>
                <Button
                  variant={viewMode === "weekly" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("weekly")}
                  data-testid="view-weekly"
                >
                  <CalendarDays className="h-4 w-4 mr-1" /> Semanal
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={viewMode === "daily" ? handlePreviousDay : handlePreviousWeek} data-testid="button-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleToday} data-testid="button-today">Hoy</Button>
              <Button variant="outline" size="icon" onClick={viewMode === "daily" ? handleNextDay : handleNextWeek} data-testid="button-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium ml-2">
                {viewMode === "daily"
                  ? format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })
                  : `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`
                }
              </span>
            </div>

            {viewMode === "daily" && (
              <Button onClick={() => {
                setIsEditMode(false);
                setEditingAppointmentId(null);
                form.reset({
                  cabinId: "", treatmentId: "", guestName: "", guestLastName: "",
                  guestPhone: "", guestEmail: "", appointmentDate: dateStr,
                  startTime: "", reservationId: "", notes: "",
                });
                setIsNewDialogOpen(true);
              }} data-testid="button-new-appointment">
                <Plus className="h-4 w-4 mr-2" /> Nuevo Turno
              </Button>
            )}
          </div>

          {viewMode === "daily" ? (
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-base">Planning del Día - Gabinetes</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="min-w-[1800px]">
                    <table className="w-full border-collapse table-fixed">
                      <thead className="sticky top-0 z-10 bg-background">
                        <tr>
                          <th className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground w-40 sticky left-0 bg-background z-20">
                            Gabinete
                          </th>
                          {TIME_SLOTS.map((time) => (
                            <th key={time} className="border-b border-r p-1 text-center text-[10px] font-medium text-muted-foreground" style={{ width: "50px", minWidth: "50px" }}>
                              {time}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeCabins.map((cabin) => {
                          const skipSlots = new Set<number>();
                          return (
                            <tr key={cabin.id} className="h-14">
                              <td className="border-b border-r p-2 text-sm font-medium sticky left-0 bg-background z-10">
                                <div className="truncate" title={cabin.name}>{cabin.name}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{cabin.description}</div>
                              </td>
                              {TIME_SLOTS.map((time, slotIdx) => {
                                if (skipSlots.has(slotIdx)) return null;
                                const appointment = getAppointmentForSlot(cabin.id, time);
                                const isStart = isSlotStart(cabin.id, time);
                                
                                if (appointment && isStart) {
                                  const colSpan = getAppointmentColSpan(appointment);
                                  for (let i = 1; i < colSpan; i++) skipSlots.add(slotIdx + i);
                                  const isCancelled = appointment.status === "cancelled";
                                  
                                  return (
                                    <td key={slotIdx} colSpan={colSpan} className="border-b border-r p-0.5 h-14">
                                      <div
                                        className={`h-full rounded px-2 py-1 cursor-pointer flex flex-col justify-center ${appointmentStatusColors[appointment.status]} ${isCancelled ? "opacity-50 line-through" : ""}`}
                                        onClick={() => setSelectedAppointment(appointment)}
                                        title={`${appointment.guestName} ${appointment.guestLastName || ""} - ${treatments.find(t => t.id === appointment.treatmentId)?.name || ""}`}
                                        data-testid={`appointment-${appointment.id}`}
                                      >
                                        <div className="text-xs font-medium truncate">
                                          {appointment.guestName} {appointment.guestLastName || ""}
                                        </div>
                                        <div className="text-[10px] truncate opacity-75">
                                          {treatments.find(t => t.id === appointment.treatmentId)?.name}
                                        </div>
                                        <div className="text-[10px] opacity-60">
                                          {appointment.startTime} - {appointment.endTime}
                                        </div>
                                      </div>
                                    </td>
                                  );
                                }
                                if (appointment && !isStart) return null;
                                return (
                                  <td key={slotIdx} className="border-b border-r p-0.5 h-14 cursor-pointer hover:bg-muted/50" onClick={() => handleCellClick(cabin.id, time)} data-testid={`cell-${cabin.id}-${time}`} />
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-base">Vista Semanal - Gabinetes</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr>
                      <th className="border-b border-r p-3 text-left text-xs font-medium text-muted-foreground w-40">
                        Gabinete
                      </th>
                      {weekDays.map((day) => (
                        <th key={day.toISOString()} className="border-b border-r p-3 text-center text-xs font-medium text-muted-foreground">
                          <div>{format(day, "EEE", { locale: es })}</div>
                          <div className="text-sm font-semibold">{format(day, "d/M")}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeCabins.map((cabin) => (
                      <tr key={cabin.id}>
                        <td className="border-b border-r p-3 text-sm font-medium">
                          <div className="truncate">{cabin.name}</div>
                        </td>
                        {weekDays.map((day) => {
                          const count = getWeeklyCount(cabin.id, day);
                          return (
                            <td
                              key={day.toISOString()}
                              className={`border-b border-r p-3 text-center cursor-pointer hover:opacity-80 transition-opacity ${getOccupancyColor(count)}`}
                              onClick={() => {
                                setSelectedDate(startOfDay(day));
                                setViewMode("daily");
                              }}
                              data-testid={`weekly-cell-${cabin.id}-${format(day, "yyyy-MM-dd")}`}
                            >
                              <span className="text-lg font-semibold">{count}</span>
                              <div className="text-[10px] opacity-70">{count === 1 ? "turno" : "turnos"}</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center gap-4 p-3 text-xs text-muted-foreground border-t">
                  <span className="font-medium">Leyenda:</span>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800 border" /> 0</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900 border" /> 1-2</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900 border" /> 3-4</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900 border" /> 5+</div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {activeTab === "insumos" && (
        <Card className="flex-1">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Insumos del SPA</CardTitle>
          </CardHeader>
          <CardContent>
            {spaInventoryItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No hay insumos asignados al área SPA.</p>
                <p className="text-xs mt-1">Asigná categorías con área "SPA" desde el módulo de Inventario.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {spaInventoryItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`spa-item-${item.id}`}>
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category?.name}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`text-sm font-medium ${item.currentStock <= 0 ? "text-red-600" : ""}`}>
                          {item.currentStock} {item.unit}
                        </p>
                        <p className="text-xs text-muted-foreground">${parseFloat(item.costPrice).toLocaleString()}/u</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* New / Edit Appointment Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={(open) => { if (!open) { setIsNewDialogOpen(false); setIsEditMode(false); setEditingAppointmentId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Editar Turno" : "Nuevo Turno SPA"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="appointmentDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl><Input type="date" {...field} data-testid="input-appointment-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="cabinId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gabinete</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-cabin"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {activeCabins.map((cabin) => (
                          <SelectItem key={cabin.id} value={cabin.id}>{cabin.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="startTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-start-time"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {TIME_SLOTS.slice(0, -1).map((time) => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="treatmentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tratamiento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-treatment"><SelectValue placeholder="Seleccionar tratamiento" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {treatments.filter(t => t.isActive === "true").map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name} - ${parseFloat(treatment.price).toLocaleString()} ({treatment.durationMinutes}min)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="reservationId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Huésped del Hotel (opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl><SelectTrigger data-testid="select-reservation"><SelectValue placeholder="Sin asociar" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {checkedInReservations.map((res) => (
                        <SelectItem key={res.id} value={res.id}>
                          Hab. {res.room?.roomNumber} - {res.guest?.firstName} {res.guest?.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="guestName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl><Input {...field} data-testid="input-guest-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="guestLastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl><Input {...field} data-testid="input-guest-lastname" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="guestPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl><Input {...field} data-testid="input-guest-phone" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="guestEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" {...field} data-testid="input-guest-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Textarea {...field} data-testid="input-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setIsNewDialogOpen(false); setIsEditMode(false); }}>Cancelar</Button>
                <Button type="submit" disabled={createAppointmentMutation.isPending || editAppointmentMutation.isPending} data-testid="button-submit-appointment">
                  {(createAppointmentMutation.isPending || editAppointmentMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isEditMode ? "Guardar Cambios" : "Crear Turno"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Appointment Detail Dialog */}
      <Dialog open={!!selectedAppointment && !isFolioOpen} onOpenChange={() => setSelectedAppointment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Turno</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={appointmentStatusColors[selectedAppointment.status]}>
                  {appointmentStatusLabels[selectedAppointment.status]}
                </Badge>
                {selectedAccount && selectedAccount.payments.some(p => p.isAdvance === "true") && (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    <DollarSign className="h-3 w-3 mr-1" /> SEÑA
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(parseISO(selectedAppointment.appointmentDate), "EEEE d 'de' MMMM", { locale: es })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedAppointment.startTime} - {selectedAppointment.endTime}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedAppointment.guestName} {selectedAppointment.guestLastName || ""}</span>
                  </div>
                  {selectedAppointment.guestPhone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedAppointment.guestPhone}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Tratamiento</h4>
                  <p className="text-sm text-muted-foreground">
                    {treatments.find(t => t.id === selectedAppointment.treatmentId)?.name || "N/A"}
                  </p>
                  <h4 className="text-sm font-medium">Gabinete</h4>
                  <p className="text-sm text-muted-foreground">
                    {cabins.find(c => c.id === selectedAppointment.cabinId)?.name || "N/A"}
                  </p>
                </div>
              </div>

              {selectedAccount && selectedAccount.items.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> Cuenta
                  </h4>
                  <div className="space-y-1 text-sm">
                    {selectedAccount.items.map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span>{item.description} x{item.quantity}</span>
                        <span>${parseFloat(item.subtotal).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold pt-2 border-t">
                      <span>Total</span>
                      <span>${accountTotal.toLocaleString()}</span>
                    </div>
                    {accountPaid > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Pagado</span>
                        <span>${accountPaid.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  {selectedAccount.status === "closed" && (
                    <Badge className="mt-2" variant="secondary">Folio cerrado</Badge>
                  )}
                </div>
              )}

              {selectedAppointment.notes && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Notas</h4>
                  <p className="text-sm text-muted-foreground">{selectedAppointment.notes}</p>
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2">
                {["pending", "confirmed"].includes(selectedAppointment.status) && (
                  <Button variant="outline" size="sm" onClick={() => handleEditAppointment(selectedAppointment)} data-testid="button-edit-appointment">
                    <Pencil className="h-4 w-4 mr-1" /> Editar
                  </Button>
                )}
                {selectedAppointment.status === "confirmed" && (
                  <Button variant="default" size="sm" onClick={() => {
                    updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "in_progress" });
                    setSelectedAppointment(null);
                  }} disabled={updateAppointmentMutation.isPending} data-testid="button-start-appointment">
                    Iniciar
                  </Button>
                )}
                {["in_progress", "confirmed"].includes(selectedAppointment.status) && selectedAccount && selectedAccount.status === "open" && (
                  <Button variant="default" size="sm" onClick={handleOpenFolio} data-testid="button-open-folio">
                    <CreditCard className="h-4 w-4 mr-1" /> Folio
                  </Button>
                )}
                {selectedAppointment.status === "pending" && (
                  <Button variant="default" size="sm" onClick={() => {
                    updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "confirmed" });
                    setSelectedAppointment(null);
                  }} disabled={updateAppointmentMutation.isPending} data-testid="button-confirm-appointment">
                    Confirmar
                  </Button>
                )}
                {["pending", "confirmed"].includes(selectedAppointment.status) && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => {
                      updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: "no_show" });
                      setSelectedAppointment(null);
                    }} disabled={updateAppointmentMutation.isPending} data-testid="button-noshow-appointment">
                      No Show
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setIsCancelConfirmOpen(true)} data-testid="button-cancel-appointment">
                      <X className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={isCancelConfirmOpen} onOpenChange={setIsCancelConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Cancelación
            </DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                ¿Estás seguro que querés cancelar el turno de <strong>{selectedAppointment.guestName} {selectedAppointment.guestLastName || ""}</strong> el {format(parseISO(selectedAppointment.appointmentDate), "d 'de' MMMM", { locale: es })} a las {selectedAppointment.startTime} en <strong>{cabins.find(c => c.id === selectedAppointment.cabinId)?.name}</strong>? Esta acción no se puede deshacer.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCancelConfirmOpen(false)}>Volver</Button>
                <Button variant="destructive" onClick={handleCancelAppointment} disabled={updateAppointmentMutation.isPending} data-testid="button-confirm-cancel">
                  Sí, cancelar turno
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Folio Dialog */}
      <Dialog open={isFolioOpen} onOpenChange={(open) => { if (!open) { setIsFolioOpen(false); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Folio SPA - {selectedAppointment?.guestName} {selectedAppointment?.guestLastName || ""}
            </DialogTitle>
          </DialogHeader>
          {selectedAccount && selectedAppointment && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Charges */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Cargos</h3>
                  {selectedAccount.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => setIsAddChargeOpen(true)} data-testid="button-add-charge">
                      <Plus className="h-3 w-3 mr-1" /> Agregar
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {selectedAccount.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 border rounded text-sm" data-testid={`charge-item-${item.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{item.itemType}</Badge>
                          <span>{item.description}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.quantity} x ${parseFloat(item.unitPrice).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${parseFloat(item.subtotal).toLocaleString()}</span>
                        {selectedAccount.status === "open" && item.itemType !== "treatment" && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteChargeMutation.mutate(item.id)}>
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-3 space-y-1">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>${accountTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Pagado</span>
                    <span>${accountPaid.toLocaleString()}</span>
                  </div>
                  <div className={`flex justify-between text-sm font-medium ${accountBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                    <span>Saldo</span>
                    <span>${accountBalance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Right: Payments */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Pagos</h3>
                  {selectedAccount.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => setIsAddPaymentOpen(true)} data-testid="button-add-payment">
                      <DollarSign className="h-3 w-3 mr-1" /> Registrar Pago
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {selectedAccount.payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin pagos registrados</p>
                  ) : (
                    selectedAccount.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-2 border rounded text-sm" data-testid={`payment-${payment.id}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span>{paymentMethodLabels[payment.method] || payment.method}</span>
                            {payment.isAdvance === "true" && (
                              <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">SEÑA</Badge>
                            )}
                          </div>
                          {payment.notes && <p className="text-xs text-muted-foreground">{payment.notes}</p>}
                        </div>
                        <span className="font-medium text-green-600">${parseFloat(payment.amount).toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>

                {selectedAccount.status === "open" && (
                  <div className="border-t pt-4 space-y-3">
                    <div>
                      <label className="text-sm font-medium">Comprobante</label>
                      <Select value={receiptType} onValueChange={setReceiptType}>
                        <SelectTrigger data-testid="select-receipt-type">
                          <SelectValue placeholder="Seleccionar comprobante" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ticket">Ticket</SelectItem>
                          <SelectItem value="factura_a">Factura A</SelectItem>
                          <SelectItem value="factura_b">Factura B</SelectItem>
                          <SelectItem value="factura_c">Factura C</SelectItem>
                          <SelectItem value="nota_credito">Nota de Crédito</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      disabled={accountBalance > 0 || !receiptType || closeAccountMutation.isPending}
                      onClick={() => closeAccountMutation.mutate({ accountId: selectedAccount.id, receiptType })}
                      data-testid="button-close-folio"
                    >
                      {closeAccountMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Receipt className="h-4 w-4 mr-2" />
                      Cerrar Folio
                    </Button>
                    {accountBalance > 0 && (
                      <p className="text-xs text-red-500 text-center">Saldo pendiente: ${accountBalance.toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Charge Dialog */}
      <Dialog open={isAddChargeOpen} onOpenChange={setIsAddChargeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar Cargo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Select value={chargeType} onValueChange={setChargeType}>
                <SelectTrigger data-testid="select-charge-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Producto</SelectItem>
                  <SelectItem value="service">Servicio Extra</SelectItem>
                  <SelectItem value="extra">Consumo (pileta, toalla, etc.)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Input value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} placeholder="Ej: Toalla extra" data-testid="input-charge-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Precio Unit.</label>
                <Input type="number" step="0.01" value={chargePrice} onChange={(e) => setChargePrice(e.target.value)} data-testid="input-charge-price" />
              </div>
              <div>
                <label className="text-sm font-medium">Cantidad</label>
                <Input type="number" min="1" value={chargeQuantity} onChange={(e) => setChargeQuantity(e.target.value)} data-testid="input-charge-quantity" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddChargeOpen(false)}>Cancelar</Button>
              <Button
                disabled={!chargeDescription || !chargePrice || addChargeMutation.isPending}
                onClick={() => {
                  if (selectedAccount) {
                    addChargeMutation.mutate({
                      accountId: selectedAccount.id,
                      description: chargeDescription,
                      quantity: parseInt(chargeQuantity) || 1,
                      unitPrice: chargePrice,
                      itemType: chargeType,
                    });
                  }
                }}
                data-testid="button-submit-charge"
              >
                {addChargeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Agregar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={isAddPaymentOpen} onOpenChange={setIsAddPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Método de Pago</label>
              <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); if (v !== "room_charge") setPaymentReservationId(""); }}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="debit_card">Tarjeta Débito</SelectItem>
                  <SelectItem value="credit_card">Tarjeta Crédito</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">MercadoPago</SelectItem>
                  <SelectItem value="room_charge">Cargo a Habitación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "room_charge" && (
              <div>
                <label className="text-sm font-medium">Habitación</label>
                <Select value={paymentReservationId} onValueChange={setPaymentReservationId}>
                  <SelectTrigger data-testid="select-payment-room">
                    <SelectValue placeholder="Seleccionar habitación" />
                  </SelectTrigger>
                  <SelectContent>
                    {checkedInReservations.map((res) => (
                      <SelectItem key={res.id} value={res.id}>
                        Hab. {res.room?.roomNumber} - {res.guest?.firstName} {res.guest?.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Monto</label>
              <Input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={accountBalance > 0 ? `Saldo: $${accountBalance.toLocaleString()}` : ""} data-testid="input-payment-amount" />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="is-advance" checked={isPaymentAdvance} onChange={(e) => setIsPaymentAdvance(e.target.checked)} className="rounded" />
              <label htmlFor="is-advance" className="text-sm">Es seña / anticipo</label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddPaymentOpen(false)}>Cancelar</Button>
              <Button
                disabled={!paymentAmount || !paymentMethod || addPaymentMutation.isPending || (paymentMethod === "room_charge" && !paymentReservationId)}
                onClick={() => {
                  if (selectedAccount) {
                    addPaymentMutation.mutate({
                      accountId: selectedAccount.id,
                      amount: paymentAmount,
                      method: paymentMethod,
                      isAdvance: isPaymentAdvance,
                      reservationId: paymentMethod === "room_charge" ? paymentReservationId : undefined,
                    });
                  }
                }}
                data-testid="button-submit-payment"
              >
                {addPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
