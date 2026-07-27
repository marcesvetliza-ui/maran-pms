import { useState, useMemo, useRef } from "react";
import { fmtMoney } from "@/lib/utils";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel, SelectGroup } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, subDays, startOfDay, parseISO, isSameDay, startOfWeek, addWeeks, subWeeks, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import { Label } from "@/components/ui/label";
import { GuestSearchCombobox } from "@/components/guest-search-combobox";
import { EmitirComprobanteButton } from "@/components/emitir-comprobante-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  User,
  Phone,
  Loader2,
  Calendar,
  CalendarSearch,
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
  Settings,
  CheckCircle2,
  Printer,
  BarChart2,
  TrendingUp,
  Filter,
  RefreshCw,
  FileText,
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

type SpaProfessional = {
  id: string;
  name: string;
  lastName: string | null;
  isActive: string | null;
};

type SpaClientType = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  condicionVentaPredeterminada?: string | null;
};

type SpaAppointment = {
  id: string;
  cabinId: string;
  treatmentId: string;
  professionalId: string | null;
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
  professionalId: z.string().optional(),
  guestId: z.string().optional().nullable(),
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

type SpaTreatmentCategory = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number | null;
};

type ViewMode = "daily" | "weekly";
type SpaTab = "agenda" | "tratamientos" | "insumos" | "configuracion";

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
  const [folioRoomChargeId, setFolioRoomChargeId] = useState("");
  const [isTreatmentDialogOpen, setIsTreatmentDialogOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<SpaTreatment | null>(null);
  const [deletingTreatment, setDeletingTreatment] = useState<SpaTreatment | null>(null);
  const [supplyItemId, setSupplyItemId] = useState("");
  const [supplyQty, setSupplyQty] = useState("1");
  const [cabinDialogOpen, setCabinDialogOpen] = useState(false);
  const [editingCabin, setEditingCabin] = useState<SpaCabin | null>(null);
  const [cabinName, setCabinName] = useState("");
  const [cabinDescription, setCabinDescription] = useState("");
  const [professionalDialogOpen, setProfessionalDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<SpaProfessional | null>(null);
  const [professionalName, setProfessionalName] = useState("");
  const [professionalLastName, setProfessionalLastName] = useState("");

  // Modal % por Profesional
  const today = new Date();
  const defaultDesde = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultHasta = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  const [showProdDialog, setShowProdDialog] = useState(false);
  const [prodDesde, setProdDesde] = useState(defaultDesde);
  const [prodHasta, setProdHasta] = useState(defaultHasta);
  const [prodTreatmentId, setProdTreatmentId] = useState("all");
  const [prodProfessionalId, setProdProfessionalId] = useState("all");
  const [prodEstado, setProdEstado] = useState("all");
  const [appliedFilters, setAppliedFilters] = useState({ desde: defaultDesde, hasta: defaultHasta, treatmentId: "", professionalId: "", estado: "" });

  const { toast } = useToast();

  const { data: cabins = [], isLoading: cabinsLoading } = useQuery<SpaCabin[]>({
    queryKey: ["/api/spa/cabins"],
  });

  const { data: treatments = [] } = useQuery<SpaTreatment[]>({
    queryKey: ["/api/spa/treatments"],
  });

  const { data: treatmentCategories = [] } = useQuery<SpaTreatmentCategory[]>({
    queryKey: ["/api/spa/treatment-categories"],
  });

  const { data: professionals = [] } = useQuery<SpaProfessional[]>({
    queryKey: ["/api/spa/professionals"],
  });

  const activeProfessionals = professionals.filter(p => p.isActive === "true");

  type ProdPorProfesionalData = {
    desde: string; hasta: string;
    totalTurnos: number; totalCompletados: number; totalCancelados: number;
    ingresosTotales: number; tasaCompletados: number;
    porProfesional: { profesional: string; professionalId: string | null; turnos: number; completados: number; cancelados: number; noShows: number; pctCompletados: number; ingresosEstimados: number }[];
    porTratamiento: { tratamiento: string; treatmentId: string; turnos: number; completados: number; ingresosEstimados: number }[];
  };
  const prodQuery = useQuery<ProdPorProfesionalData>({
    queryKey: ["/api/reports/spa/por-profesional", appliedFilters],
    queryFn: async () => {
      const params = new URLSearchParams({ desde: appliedFilters.desde, hasta: appliedFilters.hasta });
      if (appliedFilters.treatmentId) params.set("treatmentId", appliedFilters.treatmentId);
      if (appliedFilters.professionalId) params.set("professionalId", appliedFilters.professionalId);
      if (appliedFilters.estado) params.set("estado", appliedFilters.estado);
      const res = await fetch(`/api/reports/spa/por-profesional?${params}`);
      if (!res.ok) throw new Error("Error al cargar reporte");
      return res.json();
    },
    enabled: showProdDialog,
  });

  const { data: spaClients = [] } = useQuery<SpaClientType[]>({
    queryKey: ["/api/spa/clients"],
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
      const response = await fetch("/api/inventory/items?area=spa", { credentials: "include" });
      if (!response.ok) throw new Error("Error");
      return response.json();
    },
    enabled: activeTab === "insumos" || (isTreatmentDialogOpen && !!editingTreatment),
  });

  const allInventoryItems = spaInventoryItems;

  const activeCabins = cabins.filter((c) => c.isActive === "true");

  const [selectedSpaGuest, setSelectedSpaGuest] = useState<{ id: string; firstName: string; lastName: string | null } | null>(null);

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      cabinId: "",
      treatmentId: "",
      professionalId: "",
      guestId: null,
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
          professionalId: data.professionalId || null,
          guestId: data.guestId || null,
          endTime,
          status: "confirmed",
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.message || err.error || "Error al crear turno");
      }
      return res.json();
    },
    onSuccess: (createdApt: SpaAppointment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] });
      toast({ title: "Turno creado — imprimiendo comanda..." });
      setIsNewDialogOpen(false);
      setSelectedSpaGuest(null);
      form.reset({
        cabinId: "", treatmentId: "", professionalId: "", guestId: null, guestName: "", guestLastName: "",
        guestPhone: "", guestEmail: "", appointmentDate: dateStr,
        startTime: "", reservationId: "", notes: "",
      });
      setTimeout(() => printComandaTermica(createdApt), 300);
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
          professionalId: data.professionalId || null,
          guestId: data.guestId || null,
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
      setSelectedSpaGuest(null);
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
    onSuccess: (_, variables) => {
      refetchAccount();
      setIsAddPaymentOpen(false);
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentReservationId("");
      setIsPaymentAdvance(false);
      toast({ title: "Pago registrado" });

      if (variables.method === "room_charge" && selectedAccount) {
        closeAccountMutation.mutate({
          accountId: selectedAccount.id,
          receiptType: "cierre_spa",
        });
      }
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
      setFolioRoomChargeId("");
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const treatmentForm = useForm({
    defaultValues: {
      name: "",
      description: "",
      categoryId: "",
      durationMinutes: 60,
      price: "",
      isActive: "true",
    },
  });

  const createTreatmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(editingTreatment ? "PATCH" : "POST",
        editingTreatment ? `/api/spa/treatments/${editingTreatment.id}` : "/api/spa/treatments",
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/treatments"] });
      toast({ title: editingTreatment ? "Tratamiento actualizado" : "Tratamiento creado" });
      setIsTreatmentDialogOpen(false);
      setEditingTreatment(null);
      treatmentForm.reset({ name: "", description: "", categoryId: "", durationMinutes: 60, price: "", isActive: "true" });
    },
    onError: () => {
      toast({ title: "Error al guardar tratamiento", variant: "destructive" });
    },
  });

  const deleteTreatmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/spa/treatments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/treatments"] });
      toast({ title: "Tratamiento eliminado" });
      setDeletingTreatment(null);
    },
    onError: () => {
      toast({ title: "Error al eliminar tratamiento", variant: "destructive" });
    },
  });

  const { data: treatmentSupplies = [], refetch: refetchSupplies } = useQuery<any[]>({
    queryKey: ["/api/spa/treatments", editingTreatment?.id, "supplies"],
    queryFn: async () => {
      if (!editingTreatment?.id) return [];
      const res = await fetch(`/api/spa/treatments/${editingTreatment.id}/supplies`);
      return res.json();
    },
    enabled: !!editingTreatment?.id,
  });

  const addSupplyMutation = useMutation({
    mutationFn: async (data: { inventoryItemId: string; quantity: string; unit: string }) => {
      return apiRequest("POST", `/api/spa/treatments/${editingTreatment!.id}/supplies`, data);
    },
    onSuccess: () => {
      refetchSupplies();
      setSupplyItemId("");
      setSupplyQty("1");
      toast({ title: "Insumo agregado" });
    },
    onError: () => toast({ title: "Error al agregar insumo", variant: "destructive" }),
  });

  const deleteSupplyMutation = useMutation({
    mutationFn: async (supplyId: string) => {
      return apiRequest("DELETE", `/api/spa/treatments/supplies/${supplyId}`);
    },
    onSuccess: () => {
      refetchSupplies();
      toast({ title: "Insumo eliminado" });
    },
    onError: () => toast({ title: "Error al eliminar insumo", variant: "destructive" }),
  });

  const [isCreatingProfesional, setIsCreatingProfesional] = useState(false);

  const handleAddSupply = async () => {
    if (!editingTreatment || !supplyQty) return;

    if (supplyItemId === "__profesional__") {
      setIsCreatingProfesional(true);
      try {
        let profItem = spaInventoryItems.find((i: any) => i.name === "Profesional");
        if (!profItem) {
          const spaCategory = spaInventoryItems.find((i: any) => i.category)?.category;
          const res = await apiRequest("POST", "/api/inventory/items", {
            name: "Profesional",
            unit: "hora",
            costPrice: "0",
            currentStock: "0",
            minStock: "0",
            ...(spaCategory ? { categoryId: spaCategory.id } : {}),
          });
          profItem = await res.json();
          queryClient.invalidateQueries({ queryKey: ["/api/inventory/items", "spa"] });
        }
        addSupplyMutation.mutate({ inventoryItemId: (profItem as any).id, quantity: supplyQty, unit: "hora" });
      } catch {
        toast({ title: "Error al crear el ítem Profesional", variant: "destructive" });
      } finally {
        setIsCreatingProfesional(false);
      }
    } else {
      const item = allInventoryItems.find((i: any) => i.id === supplyItemId);
      addSupplyMutation.mutate({ inventoryItemId: supplyItemId, quantity: supplyQty, unit: item?.unit || "" });
    }
  };

  const handleNewTreatment = () => {
    setEditingTreatment(null);
    treatmentForm.reset({ name: "", description: "", categoryId: "", durationMinutes: 60, price: "", isActive: "true" });
    setIsTreatmentDialogOpen(true);
  };

  const handleEditTreatment = (t: SpaTreatment) => {
    setEditingTreatment(t);
    treatmentForm.reset({
      name: t.name,
      description: t.description || "",
      categoryId: t.categoryId || "",
      durationMinutes: t.durationMinutes,
      price: t.price,
      isActive: t.isActive || "true",
    });
    setIsTreatmentDialogOpen(true);
  };

  const saveCabinMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      return apiRequest(editingCabin ? "PATCH" : "POST",
        editingCabin ? `/api/spa/cabins/${editingCabin.id}` : "/api/spa/cabins",
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/cabins"] });
      toast({ title: editingCabin ? "Gabinete actualizado" : "Gabinete creado" });
      setCabinDialogOpen(false);
      setEditingCabin(null);
      setCabinName("");
      setCabinDescription("");
    },
    onError: () => {
      toast({ title: "Error al guardar gabinete", variant: "destructive" });
    },
  });

  const saveProfessionalMutation = useMutation({
    mutationFn: async (data: { name: string; lastName: string }) => {
      return apiRequest(editingProfessional ? "PATCH" : "POST",
        editingProfessional ? `/api/spa/professionals/${editingProfessional.id}` : "/api/spa/professionals",
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/professionals"] });
      toast({ title: editingProfessional ? "Profesional actualizado" : "Profesional creado" });
      setProfessionalDialogOpen(false);
      setEditingProfessional(null);
      setProfessionalName("");
      setProfessionalLastName("");
    },
    onError: () => {
      toast({ title: "Error al guardar profesional", variant: "destructive" });
    },
  });

  const toggleProfessionalMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: string }) => {
      return apiRequest("PATCH", `/api/spa/professionals/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/professionals"] });
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
      cabinId, treatmentId: "", professionalId: "", guestName: "", guestLastName: "",
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
      professionalId: apt.professionalId || "",
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
    // Pre-fill room charge with the appointment's linked reservation, if any
    if (selectedAppointment?.reservationId) {
      setFolioRoomChargeId(selectedAppointment.reservationId);
      setReceiptType("cargo_habitacion");
    }
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

  const handleReservationAutoFill = (reservationId: string) => {
    const res = checkedInReservations.find(r => r.id === reservationId);
    if (res?.guest) {
      form.setValue("guestName", res.guest.firstName || "");
      form.setValue("guestLastName", res.guest.lastName || "");
      form.setValue("guestPhone", res.guest.phone || "");
      form.setValue("guestEmail", res.guest.email || "");
    }
  };

  const handleSpaClientAutoFill = (clientId: string) => {
    const client = spaClients.find(c => c.id === clientId);
    if (client) {
      form.setValue("guestName", client.firstName);
      form.setValue("guestLastName", client.lastName || "");
      form.setValue("guestPhone", client.phone || "");
      form.setValue("guestEmail", client.email || "");
    }
  };

  const printComandaTermica = (apt: SpaAppointment) => {
    const treatment = treatments.find(t => t.id === apt.treatmentId);
    const cabin = cabins.find(c => c.id === apt.cabinId);
    const professional = professionals.find(p => p.id === apt.professionalId);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const esc = (str: string) => {
      const d = printWindow.document.createElement("div");
      d.textContent = str;
      return d.innerHTML;
    };

    const clientName = `${apt.guestName} ${apt.guestLastName || ""}`.trim();
    const aptDate = apt.appointmentDate.split("-").map(Number);
    const dateLabel = format(new Date(aptDate[0], aptDate[1] - 1, aptDate[2]), "dd/MM/yyyy", { locale: es });
    const dayLabel = format(new Date(aptDate[0], aptDate[1] - 1, aptDate[2]), "EEEE", { locale: es });
    const timeRange = `${apt.startTime} - ${apt.endTime}`;
    const treatmentName = treatment?.name || "N/A";
    const duration = treatment ? `${treatment.durationMinutes} min` : "";
    const cabinName = cabin?.name || "N/A";
    const profName = professional ? `${professional.name} ${professional.lastName || ""}`.trim() : "";
    const price = treatment ? `$${fmtMoney(treatment.price)}` : "$0";
    const notes = apt.notes || "";
    const now = format(new Date(), "dd/MM/yyyy HH:mm");

    const buildCopy = (copyLabel: string, withSignature: boolean) => `
      <div class="copy">
        <div class="header">
          <div class="hotel">MARAN SUITES &amp; TOWERS</div>
          <div class="spa-title">★ SPA ★</div>
          <div class="copy-label">${esc(copyLabel)}</div>
        </div>
        <div class="divider">================================</div>
        <div class="row"><span class="lbl">COMANDA N°:</span> <span>${esc(apt.id.slice(-6).toUpperCase())}</span></div>
        <div class="row"><span class="lbl">EMITIDA:</span> <span>${esc(now)}</span></div>
        <div class="divider">--------------------------------</div>
        <div class="section-title">CLIENTE</div>
        <div class="row-full">${esc(clientName)}</div>
        ${apt.guestPhone ? `<div class="row-full">Tel: ${esc(apt.guestPhone)}</div>` : ""}
        <div class="divider">--------------------------------</div>
        <div class="section-title">SERVICIO</div>
        <div class="row-full big">${esc(treatmentName)}</div>
        ${duration ? `<div class="row-full small">Duración: ${esc(duration)}</div>` : ""}
        <div class="divider">--------------------------------</div>
        <div class="section-title">TURNO</div>
        <div class="row"><span class="lbl">Día:</span> <span>${esc(dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1))}</span></div>
        <div class="row"><span class="lbl">Fecha:</span> <span>${esc(dateLabel)}</span></div>
        <div class="row"><span class="lbl">Horario:</span> <span>${esc(timeRange)}</span></div>
        <div class="row"><span class="lbl">Gabinete:</span> <span>${esc(cabinName)}</span></div>
        ${profName ? `<div class="row"><span class="lbl">Prof.:</span> <span>${esc(profName)}</span></div>` : ""}
        <div class="divider">--------------------------------</div>
        <div class="row price-row"><span class="lbl">TOTAL:</span> <span class="price">${esc(price)}</span></div>
        ${notes ? `<div class="divider">--------------------------------</div><div class="section-title">OBSERVACIONES</div><div class="row-full small">${esc(notes)}</div>` : ""}
        <div class="divider">================================</div>
        ${withSignature ? `
          <div class="signature-area">
            <div class="small center">Firma y aclaración del cliente</div>
            <div class="signature-line"></div>
            <div class="small center">Acepto las condiciones del servicio</div>
            <div class="small center mt4">Cancelaciones: 2 hs. de anticipación</div>
          </div>
        ` : `
          <div class="footer-note">¡Gracias por elegirnos!</div>
          <div class="small center">Consultas: Recepción</div>
        `}
      </div>`;

    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Comanda SPA</title>
<style>
  @page { margin: 4mm; size: 80mm auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 300px; margin: 0 auto; color: #000; background: #fff; }
  .copy { width: 100%; padding: 4px 2px; }
  .header { text-align: center; margin-bottom: 4px; }
  .hotel { font-size: 13px; font-weight: bold; letter-spacing: 1px; }
  .spa-title { font-size: 12px; font-weight: bold; margin: 2px 0; }
  .copy-label { font-size: 10px; border: 1px solid #000; display: inline-block; padding: 1px 8px; margin-top: 3px; letter-spacing: 1px; }
  .divider { text-align: center; font-size: 10px; color: #555; margin: 3px 0; letter-spacing: 1px; white-space: nowrap; overflow: hidden; }
  .section-title { font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin: 2px 0 1px 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; margin: 1px 0; }
  .row-full { margin: 1px 0; }
  .lbl { font-weight: bold; white-space: nowrap; }
  .big { font-size: 12px; font-weight: bold; }
  .small { font-size: 9px; color: #444; }
  .center { text-align: center; }
  .price-row { font-size: 13px; font-weight: bold; margin: 2px 0; }
  .price { font-size: 14px; font-weight: bold; }
  .signature-area { margin: 6px 0 4px 0; }
  .signature-line { border-bottom: 1px solid #000; margin: 14px 4px 4px 4px; }
  .footer-note { text-align: center; font-weight: bold; font-size: 12px; margin: 4px 0 2px 0; }
  .mt4 { margin-top: 4px; }
  .page-cut { border-top: 2px dashed #888; margin: 6px 0; text-align: center; font-size: 9px; color: #888; padding-top: 2px; }
  @media print {
    .page-cut { page-break-after: always; border: none; }
    body { width: 100%; }
  }
</style>
</head><body>
${buildCopy("COPIA CLIENTE", false)}
<div class="page-cut">✂ &nbsp; CORTAR &nbsp; ✂</div>
${buildCopy("COPIA ESTABLECIMIENTO — FIRMAR", true)}
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`);
    printWindow.document.close();
  };

  const printSpaConfirmation = (apt: SpaAppointment) => {
    printComandaTermica(apt);
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
            variant={activeTab === "tratamientos" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("tratamientos")}
            data-testid="tab-tratamientos"
          >
            <Sparkles className="h-4 w-4 mr-1" /> Tratamientos
          </Button>
          <Button
            variant={activeTab === "insumos" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("insumos")}
            data-testid="tab-insumos"
          >
            <Package className="h-4 w-4 mr-1" /> Insumos
          </Button>
          <Button
            variant={activeTab === "configuracion" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("configuracion")}
            data-testid="tab-configuracion"
          >
            <Settings className="h-4 w-4 mr-1" /> Configuración
          </Button>
        </div>

        <EmitirComprobanteButton area="spa" />
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

            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={viewMode === "daily" ? handlePreviousWeek : () => setSelectedDate(subWeeks(selectedDate, 1))} title={viewMode === "daily" ? "Semana anterior" : "Semana anterior"} data-testid="button-prev-week">
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={viewMode === "daily" ? handlePreviousDay : () => setSelectedDate(subDays(selectedDate, 1))} title="Día anterior" data-testid="button-prev-day">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={handleToday} data-testid="button-today">
                Hoy
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs" data-testid="button-date-picker">
                    <CalendarSearch className="h-3.5 w-3.5 mr-1" />
                    {viewMode === "daily"
                      ? format(selectedDate, "d MMM yyyy", { locale: es })
                      : `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM yyyy", { locale: es })}`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <CalendarPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(startOfDay(date))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={viewMode === "daily" ? handleNextDay : () => setSelectedDate(addDays(selectedDate, 1))} title="Día siguiente" data-testid="button-next-day">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={viewMode === "daily" ? handleNextWeek : () => setSelectedDate(addWeeks(selectedDate, 1))} title="Semana siguiente" data-testid="button-next-week">
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowProdDialog(true)}
                data-testid="button-prod-profesional"
              >
                <BarChart2 className="h-4 w-4 mr-2" /> % por Profesional
              </Button>
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
                                  const isPast = isBefore(parseISO(appointment.appointmentDate), startOfDay(new Date()));
                                  
                                  return (
                                    <td key={slotIdx} colSpan={colSpan} className="border-b border-r p-0.5 h-14">
                                      <div
                                        className={`h-full rounded px-2 py-1 flex flex-col justify-center ${isPast ? "bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 opacity-50 cursor-default" : `cursor-pointer ${appointmentStatusColors[appointment.status]} ${isCancelled ? "opacity-50 line-through" : ""}`}`}
                                        onClick={isPast ? undefined : () => setSelectedAppointment(appointment)}
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
                                const isDatePast = isBefore(startOfDay(selectedDate), startOfDay(new Date()));
                                return (
                                  <td key={slotIdx} className={`border-b border-r p-0.5 h-14 ${isDatePast ? "bg-muted/20" : "cursor-pointer hover:bg-muted/50"}`} onClick={isDatePast ? undefined : () => handleCellClick(cabin.id, time)} data-testid={`cell-${cabin.id}-${time}`} />
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

      {activeTab === "tratamientos" && (
        <Card className="flex-1">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tratamientos del SPA</CardTitle>
            <Button size="sm" onClick={handleNewTreatment} data-testid="button-new-treatment">
              <Plus className="h-4 w-4 mr-1" /> Nuevo Tratamiento
            </Button>
          </CardHeader>
          <CardContent>
            {treatments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No hay tratamientos cargados.</p>
                <p className="text-xs mt-1">Agregá tratamientos para poder agendar turnos.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {treatmentCategories.map((cat) => {
                  const catTreatments = treatments.filter((t) => t.categoryId === cat.id);
                  if (catTreatments.length === 0) return null;
                  return (
                    <div key={cat.id}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 mt-3">{cat.name}</h3>
                      {catTreatments.map((t) => (
                        <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg mb-1" data-testid={`treatment-row-${t.id}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{t.name}</p>
                              {t.isActive !== "true" && <Badge variant="secondary" className="text-xs">Inactivo</Badge>}
                            </div>
                            {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-medium">${parseFloat(t.price).toLocaleString()}</p>
                              <p className="text-xs text-muted-foreground">{t.durationMinutes} min</p>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditTreatment(t)} data-testid={`button-edit-treatment-${t.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingTreatment(t)} data-testid={`button-delete-treatment-${t.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {treatments.filter((t) => !t.categoryId || !treatmentCategories.find((c) => c.id === t.categoryId)).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 mt-3">Sin categoría</h3>
                    {treatments.filter((t) => !t.categoryId || !treatmentCategories.find((c) => c.id === t.categoryId)).map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg mb-1" data-testid={`treatment-row-${t.id}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{t.name}</p>
                            {t.isActive !== "true" && <Badge variant="secondary" className="text-xs">Inactivo</Badge>}
                          </div>
                          {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">${parseFloat(t.price).toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">{t.durationMinutes} min</p>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditTreatment(t)} data-testid={`button-edit-treatment-${t.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingTreatment(t)} data-testid={`button-delete-treatment-${t.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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

      {activeTab === "configuracion" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Gabinetes</CardTitle>
              <Button size="sm" onClick={() => { setEditingCabin(null); setCabinName(""); setCabinDescription(""); setCabinDialogOpen(true); }} data-testid="button-new-cabin">
                <Plus className="h-4 w-4 mr-1" /> Nuevo
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {cabins.map((cabin) => (
                  <div key={cabin.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`cabin-row-${cabin.id}`}>
                    <div>
                      <p className="text-sm font-medium">{cabin.name}</p>
                      {cabin.description && <p className="text-xs text-muted-foreground">{cabin.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={cabin.isActive === "true" ? "default" : "secondary"}>
                        {cabin.isActive === "true" ? "Activo" : "Inactivo"}
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingCabin(cabin);
                        setCabinName(cabin.name);
                        setCabinDescription(cabin.description || "");
                        setCabinDialogOpen(true);
                      }} data-testid={`button-edit-cabin-${cabin.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {cabins.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay gabinetes configurados</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Profesionales</CardTitle>
              <Button size="sm" onClick={() => { setEditingProfessional(null); setProfessionalName(""); setProfessionalLastName(""); setProfessionalDialogOpen(true); }} data-testid="button-new-professional">
                <Plus className="h-4 w-4 mr-1" /> Nuevo
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {professionals.map((prof) => (
                  <div key={prof.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`professional-row-${prof.id}`}>
                    <div>
                      <p className="text-sm font-medium">{prof.name} {prof.lastName || ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleProfessionalMutation.mutate({ id: prof.id, isActive: prof.isActive === "true" ? "false" : "true" })}
                        data-testid={`button-toggle-professional-${prof.id}`}
                      >
                        {prof.isActive === "true" ? (
                          <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" /> Activo</Badge>
                        ) : (
                          <Badge variant="secondary">Inactivo</Badge>
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingProfessional(prof);
                        setProfessionalName(prof.name);
                        setProfessionalLastName(prof.lastName || "");
                        setProfessionalDialogOpen(true);
                      }} data-testid={`button-edit-professional-${prof.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {professionals.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay profesionales configurados</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={cabinDialogOpen} onOpenChange={setCabinDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCabin ? "Editar Gabinete" : "Nuevo Gabinete"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={cabinName} onChange={(e) => setCabinName(e.target.value)} data-testid="input-cabin-name" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={cabinDescription} onChange={(e) => setCabinDescription(e.target.value)} data-testid="input-cabin-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCabinDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveCabinMutation.mutate({ name: cabinName, description: cabinDescription })} disabled={!cabinName || saveCabinMutation.isPending} data-testid="button-save-cabin">
              {saveCabinMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCabin ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={professionalDialogOpen} onOpenChange={setProfessionalDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProfessional ? "Editar Profesional" : "Nuevo Profesional"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={professionalName} onChange={(e) => setProfessionalName(e.target.value)} data-testid="input-professional-name" />
            </div>
            <div>
              <Label>Apellido</Label>
              <Input value={professionalLastName} onChange={(e) => setProfessionalLastName(e.target.value)} data-testid="input-professional-lastname" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfessionalDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveProfessionalMutation.mutate({ name: professionalName, lastName: professionalLastName })} disabled={!professionalName || saveProfessionalMutation.isPending} data-testid="button-save-professional">
              {saveProfessionalMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingProfessional ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: % por Profesional */}
      <Dialog open={showProdDialog} onOpenChange={setShowProdDialog}>
        <DialogContent className="max-w-4xl flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              Producción por Profesional
            </DialogTitle>
          </DialogHeader>

          {/* Filtros */}
          <div className="flex-shrink-0 rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" /> Filtros
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Desde</label>
                <input
                  type="date"
                  value={prodDesde}
                  onChange={e => setProdDesde(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  data-testid="input-prod-desde"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input
                  type="date"
                  value={prodHasta}
                  onChange={e => setProdHasta(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  data-testid="input-prod-hasta"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Profesional</label>
                <Select value={prodProfessionalId} onValueChange={setProdProfessionalId}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-prod-profesional">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {professionals.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.lastName ? ` ${p.lastName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tratamiento</label>
                <Select value={prodTreatmentId} onValueChange={setProdTreatmentId}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-prod-tratamiento">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {treatments.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Estado</label>
                <Select value={prodEstado} onValueChange={setProdEstado}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-prod-estado">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="completed">Completados</SelectItem>
                    <SelectItem value="cancelados">Cancelados / No show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => setAppliedFilters({
                  desde: prodDesde,
                  hasta: prodHasta,
                  treatmentId: prodTreatmentId === "all" ? "" : prodTreatmentId,
                  professionalId: prodProfessionalId === "all" ? "" : prodProfessionalId,
                  estado: prodEstado === "all" ? "" : prodEstado,
                })}
                data-testid="button-prod-apply"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Aplicar
              </Button>
            </div>
          </div>

          {/* Contenido scrolleable */}
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            {prodQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Cargando...
              </div>
            ) : prodQuery.isError ? (
              <div className="flex items-center justify-center py-16 text-destructive gap-2">
                Error al cargar el reporte
              </div>
            ) : prodQuery.data ? (
              <>
                {/* KPIs resumen */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total turnos", value: prodQuery.data.totalTurnos, color: "text-foreground" },
                    { label: "Completados", value: prodQuery.data.totalCompletados, color: "text-green-600 dark:text-green-400" },
                    { label: "Cancelados", value: prodQuery.data.totalCancelados, color: "text-red-500 dark:text-red-400" },
                    { label: "Tasa completados", value: `${prodQuery.data.tasaCompletados}%`, color: "text-primary" },
                  ].map(kpi => (
                    <div key={kpi.label} className="rounded-lg border bg-card p-3 text-center">
                      <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Tabla por profesional */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" /> Por profesional
                  </h3>
                  {prodQuery.data.porProfesional.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Sin datos para el período seleccionado</div>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium">Profesional</th>
                            <th className="px-3 py-2 text-center font-medium">Turnos</th>
                            <th className="px-3 py-2 text-center font-medium">Completados</th>
                            <th className="px-3 py-2 text-center font-medium">% Completado</th>
                            <th className="px-3 py-2 text-center font-medium">Cancelados</th>
                            <th className="px-3 py-2 text-center font-medium">No show</th>
                            <th className="px-3 py-2 text-right font-medium">Ingresos est.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prodQuery.data.porProfesional.map((row, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2.5 font-medium">{row.profesional}</td>
                              <td className="px-3 py-2.5 text-center">{row.turnos}</td>
                              <td className="px-3 py-2.5 text-center text-green-600 dark:text-green-400 font-medium">{row.completados}</td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-primary"
                                      style={{ width: `${row.pctCompletados}%` }}
                                    />
                                  </div>
                                  <span className="font-semibold text-primary tabular-nums w-8">{row.pctCompletados}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center text-red-500 dark:text-red-400">{row.cancelados}</td>
                              <td className="px-3 py-2.5 text-center text-muted-foreground">{row.noShows}</td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {row.ingresosEstimados > 0
                                  ? `$${row.ingresosEstimados.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Tabla por tratamiento */}
                {prodQuery.data.porTratamiento.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" /> Por tratamiento
                    </h3>
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium">Tratamiento</th>
                            <th className="px-3 py-2 text-center font-medium">Turnos</th>
                            <th className="px-3 py-2 text-center font-medium">Completados</th>
                            <th className="px-3 py-2 text-right font-medium">Ingresos est.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prodQuery.data.porTratamiento.map((row, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2.5">{row.tratamiento}</td>
                              <td className="px-3 py-2.5 text-center">{row.turnos}</td>
                              <td className="px-3 py-2.5 text-center text-green-600 dark:text-green-400">{row.completados}</td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {row.ingresosEstimados > 0
                                  ? `$${row.ingresosEstimados.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* New / Edit Appointment Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={(open) => { if (!open) { setIsNewDialogOpen(false); setIsEditMode(false); setEditingAppointmentId(null); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
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
                        {activeCabins.filter(cabin => cabin.id).map((cabin) => (
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
                      {treatments.filter(t => t.isActive === "true" && t.id).map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name} - ${parseFloat(treatment.price).toLocaleString()} ({treatment.durationMinutes}min)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="professionalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Profesional (opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl><SelectTrigger data-testid="select-professional"><SelectValue placeholder="Sin asignar" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeProfessionals.filter(p => p.id).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} {p.lastName || ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="reservationId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Huésped del Hotel (opcional)</FormLabel>
                  <Select onValueChange={(val) => { field.onChange(val); handleReservationAutoFill(val); }} value={field.value || undefined}>
                    <FormControl><SelectTrigger data-testid="select-reservation"><SelectValue placeholder="Sin asociar" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {checkedInReservations.filter(res => res.id).sort((a, b) => parseInt(a.room?.roomNumber || "0") - parseInt(b.room?.roomNumber || "0")).map((res) => (
                        <SelectItem key={res.id} value={res.id}>
                          Hab. {res.room?.roomNumber} - {res.guest?.lastName} {res.guest?.firstName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <GuestSearchCombobox
                label="Buscar cliente (opcional)"
                selectedGuestId={selectedSpaGuest?.id ?? null}
                selectedGuestName={selectedSpaGuest ? `${selectedSpaGuest.firstName} ${selectedSpaGuest.lastName || ""}`.trim() : null}
                onGuestSelect={(g) => {
                  setSelectedSpaGuest({ id: g.id, firstName: g.firstName, lastName: g.lastName ?? null });
                  form.setValue("guestId", g.id);
                  form.setValue("guestName", g.firstName);
                  form.setValue("guestLastName", g.lastName || "");
                  form.setValue("guestPhone", g.phone || "");
                  form.setValue("guestEmail", g.email || "");
                }}
                onClear={() => {
                  setSelectedSpaGuest(null);
                  form.setValue("guestId", null);
                }}
                placeholder="Nombre, teléfono o email..."
                data-testid="spa-guest-search"
              />

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
                  {selectedAppointment.professionalId && (
                    <>
                      <h4 className="text-sm font-medium">Profesional</h4>
                      <p className="text-sm text-muted-foreground">
                        {(() => { const p = professionals.find(p => p.id === selectedAppointment.professionalId); return p ? `${p.name} ${p.lastName || ""}` : "N/A"; })()}
                      </p>
                    </>
                  )}
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
                <Button variant="outline" size="sm" onClick={() => printComandaTermica(selectedAppointment)} data-testid="button-print-confirmation">
                  <Printer className="h-4 w-4 mr-1" /> Reimprimir comanda
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/spa/appointments/${selectedAppointment.id}/pdf/confirmacion`, "_blank")}
                  data-testid="button-spa-pdf-confirmacion"
                >
                  <FileText className="h-4 w-4 mr-1" /> Confirmación
                </Button>
                {!isBefore(parseISO(selectedAppointment.appointmentDate), startOfDay(new Date())) && (<>
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
                </>)}
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
                    {selectedAccount.payments.some(p => p.method === "room_charge") ? (
                      <p className="text-sm text-muted-foreground text-center">Cargo a habitación. Se emitirá Voucher automáticamente.</p>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium">Comprobante</label>
                          <Select value={receiptType} onValueChange={(v) => { setReceiptType(v); if (v !== "cargo_habitacion") setFolioRoomChargeId(""); }}>
                            <SelectTrigger data-testid="select-receipt-type">
                              <SelectValue placeholder="Seleccionar comprobante" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cierre_spa">Cierre de SPA</SelectItem>
                              <SelectItem value="factura_a">Factura A</SelectItem>
                              <SelectItem value="factura_b">Factura B</SelectItem>
                              <SelectItem value="cargo_habitacion">Cargo a Habitación</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {receiptType === "cargo_habitacion" && (
                          <div>
                            <label className="text-sm font-medium">Habitación</label>
                            <Select
                              value={folioRoomChargeId}
                              onValueChange={setFolioRoomChargeId}
                            >
                              <SelectTrigger data-testid="select-folio-room">
                                <SelectValue placeholder="Seleccionar habitación" />
                              </SelectTrigger>
                              <SelectContent>
                                {checkedInReservations
                                  .filter(res => res.id)
                                  .sort((a, b) => parseInt(a.room?.roomNumber || "0") - parseInt(b.room?.roomNumber || "0"))
                                  .map((res) => (
                                    <SelectItem key={res.id} value={res.id}>
                                      Hab. {res.room?.roomNumber} — {res.guest?.lastName} {res.guest?.firstName}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      className="w-full"
                      disabled={
                        (receiptType !== "cargo_habitacion" && accountBalance > 0) ||
                        (!receiptType && !selectedAccount.payments.some(p => p.method === "room_charge")) ||
                        (receiptType === "cargo_habitacion" && !folioRoomChargeId) ||
                        closeAccountMutation.isPending ||
                        addPaymentMutation.isPending
                      }
                      onClick={() => {
                        if (receiptType === "cargo_habitacion") {
                          // Register room charge for full balance, onSuccess chains to closeAccount
                          addPaymentMutation.mutate({
                            accountId: selectedAccount.id,
                            amount: accountBalance.toString(),
                            method: "room_charge",
                            isAdvance: false,
                            reservationId: folioRoomChargeId,
                          });
                        } else {
                          closeAccountMutation.mutate({
                            accountId: selectedAccount.id,
                            receiptType: selectedAccount.payments.some(p => p.method === "room_charge") ? "cierre_spa" : receiptType,
                          });
                        }
                      }}
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
          {/* Add Charge Dialog — nested inside Folio dialog to avoid Radix aria-hidden blocking inputs on desktop */}
          <Dialog open={isAddChargeOpen} onOpenChange={setIsAddChargeOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Agregar Cargo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Servicio / Concepto</label>
                  <Select value={chargeType} onValueChange={(val) => {
                    setChargeType(val);
                    if (val === "cargo_editable") {
                      setChargeDescription("");
                      setChargePrice("");
                    } else {
                      const treatment = treatments.find(t => t.id === val);
                      if (treatment) {
                        setChargeDescription(treatment.name);
                        setChargePrice(treatment.price);
                      }
                    }
                  }}>
                    <SelectTrigger data-testid="select-charge-type">
                      <SelectValue placeholder="Seleccionar servicio..." />
                    </SelectTrigger>
                    <SelectContent>
                      {treatments.filter(t => t.id && t.isActive === "true").map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name} — ${fmtMoney(t.price)}</SelectItem>
                      ))}
                      <SelectItem value="cargo_editable">Cargo editable (libre)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Descripción</label>
                  <Input value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} placeholder="Ej: Toalla extra" disabled={chargeType !== "cargo_editable"} data-testid="input-charge-description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Precio Unit.</label>
                    <Input type="number" step="0.01" value={chargePrice} onChange={(e) => setChargePrice(e.target.value)} disabled={chargeType !== "cargo_editable"} data-testid="input-charge-price" />
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
                          itemType: chargeType === "cargo_editable" ? "extra" : "service",
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

          {/* Add Payment Dialog — nested inside Folio dialog to avoid Radix aria-hidden blocking inputs on desktop */}
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
                        {checkedInReservations.filter(res => res.id).sort((a, b) => parseInt(a.room?.roomNumber || "0") - parseInt(b.room?.roomNumber || "0")).map((res) => (
                          <SelectItem key={res.id} value={res.id}>
                            Hab. {res.room?.roomNumber} - {res.guest?.lastName} {res.guest?.firstName}
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
        </DialogContent>
      </Dialog>

      <Dialog open={isTreatmentDialogOpen} onOpenChange={(open) => { if (!open) { setIsTreatmentDialogOpen(false); setEditingTreatment(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTreatment ? "Editar Tratamiento" : "Nuevo Tratamiento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={treatmentForm.handleSubmit((data) => createTreatmentMutation.mutate(data))} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <Input {...treatmentForm.register("name", { required: true })} placeholder="Nombre del tratamiento" data-testid="input-treatment-name" />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Textarea {...treatmentForm.register("description")} placeholder="Descripción del tratamiento" data-testid="input-treatment-description" />
            </div>
            <div>
              <label className="text-sm font-medium">Categoría</label>
              <Select value={treatmentForm.watch("categoryId")} onValueChange={(v) => treatmentForm.setValue("categoryId", v)}>
                <SelectTrigger data-testid="select-treatment-category"><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {treatmentCategories.filter(cat => cat.id).map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Duración (min) *</label>
                <Input type="number" {...treatmentForm.register("durationMinutes", { valueAsNumber: true })} data-testid="input-treatment-duration" />
              </div>
              <div>
                <label className="text-sm font-medium">Precio <span className="text-xs font-normal text-muted-foreground">(con IVA incluido)</span></label>
                <Input type="number" step="0.01" {...treatmentForm.register("price", { required: true })} placeholder="0.00" data-testid="input-treatment-price" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Estado</label>
              <Select value={treatmentForm.watch("isActive")} onValueChange={(v) => treatmentForm.setValue("isActive", v)}>
                <SelectTrigger data-testid="select-treatment-active"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Activo</SelectItem>
                  <SelectItem value="false">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingTreatment && (
              <div className="border rounded-lg p-3 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <span>🧴</span> Insumos a descontar del inventario
                </p>
                {treatmentSupplies.length > 0 ? (
                  <div className="space-y-1">
                    {treatmentSupplies.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between text-sm bg-muted/40 rounded px-2 py-1" data-testid={`row-supply-${s.id}`}>
                        <span className="font-medium">{s.inventoryItemName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{parseFloat(s.quantity).toLocaleString("es-AR", { minimumFractionDigits: 3 })} {s.inventoryItemUnit || s.unit}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteSupplyMutation.mutate(s.id)} data-testid={`btn-delete-supply-${s.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin insumos configurados — el stock no se descontará al cerrar la cuenta.</p>
                )}
                <div className="flex items-end gap-2 pt-1">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Artículo (solo SPA)</label>
                    <Select value={supplyItemId} onValueChange={(v) => {
                      setSupplyItemId(v);
                      if (v !== "__profesional__") {
                        const item = allInventoryItems.find((i: any) => i.id === v);
                        if (item) setSupplyQty("1");
                      } else {
                        setSupplyQty("1");
                      }
                    }} data-testid="select-supply-item">
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel className="text-xs text-amber-600">Honorarios</SelectLabel>
                          <SelectItem value="__profesional__">⭐ Profesional</SelectItem>
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel className="text-xs">Insumos SPA</SelectLabel>
                          {allInventoryItems.filter((item: any) => item.id).map((item: any) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} ({item.unit})
                              {parseFloat(item.costPrice || "0") > 0 ? ` — $${parseFloat(item.costPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : ""}
                            </SelectItem>
                          ))}
                          {allInventoryItems.length === 0 && (
                            <SelectItem value="__empty__" disabled>Sin artículos SPA en inventario</SelectItem>
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-muted-foreground">{supplyItemId === "__profesional__" ? "Horas" : "Cantidad"}</label>
                    <Input type="number" step="0.001" min="0.001" value={supplyQty} onChange={e => setSupplyQty(e.target.value)} className="h-8 text-sm" data-testid="input-supply-qty" />
                  </div>
                  <Button type="button" size="sm" className="h-8" disabled={!supplyItemId || !supplyQty || addSupplyMutation.isPending || isCreatingProfesional}
                    onClick={handleAddSupply}
                    data-testid="btn-add-supply">
                    {(addSupplyMutation.isPending || isCreatingProfesional) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                    Agregar
                  </Button>
                </div>
                {supplyItemId === "__profesional__" && (
                  <p className="text-xs text-amber-600">
                    ⭐ El ítem "Profesional" se crea automáticamente con costo $0. Editá su precio desde Inventario cuando lo tengas.
                  </p>
                )}
              </div>
            )}
            {!editingTreatment && (
              <p className="text-xs text-muted-foreground text-center border rounded p-2">
                Podrás configurar insumos de inventario después de crear el tratamiento.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsTreatmentDialogOpen(false); setEditingTreatment(null); }}>Cancelar</Button>
              <Button type="submit" disabled={createTreatmentMutation.isPending} data-testid="button-submit-treatment">
                {createTreatmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingTreatment ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingTreatment} onOpenChange={(open) => { if (!open) setDeletingTreatment(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Tratamiento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">¿Estás seguro de eliminar "{deletingTreatment?.name}"? Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTreatment(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteTreatmentMutation.isPending} onClick={() => deletingTreatment && deleteTreatmentMutation.mutate(deletingTreatment.id)} data-testid="button-confirm-delete-treatment">
              {deleteTreatmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
