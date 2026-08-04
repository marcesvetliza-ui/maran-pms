import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/App";
import { fmtMoney } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, parseApiError } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, subDays, startOfDay, parseISO, isSameDay, addWeeks, subWeeks, isValid, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  CalendarSearch,
  User,
  Phone,
  Mail,
  Loader2,
  Building2,
  Users,
  Clock,
  CreditCard,
  Trash2,
  Edit,
  Receipt,
  DollarSign,
  Info,
  UtensilsCrossed,
  FileText,
  Send,
  Ban,
  AlertTriangle,
  Eye,
  Download,
  FileX,
  RotateCcw,
} from "lucide-react";

type EventRoom = {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  isActive: boolean;
};

type EventChargeType = {
  id: string;
  name: string;
  category: string;
  defaultPrice: string;
  description: string | null;
  isActive: boolean;
};

type EventCharge = {
  id: string;
  eventId: string;
  chargeTypeId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  date: string;
  notes: string | null;
  createdAt: string;
};

type EventPayment = {
  id: string;
  eventId: string;
  amount: string;
  method: string;
  isAdvance: string;
  reservationId: string | null;
  notes: string | null;
  paidAt: string;
  createdAt: string;
};

type EventTableCharge = {
  id: string;
  eventTableId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
  createdAt: string;
};

type EventTablePayment = {
  id: string;
  eventTableId: string;
  amount: string;
  method: string;
  isAdvance: string;
  reservationId: string | null;
  receiptType: string | null;
  paidAt: string;
  createdAt: string;
};

type EventTableType = {
  id: string;
  eventId: string;
  tableNumber: number;
  label: string | null;
  seats: number | null;
  status: string;
  reservationId: string | null;
  receiptType: string | null;
  invoiceId?: number | null;
  invoiceRef?: string | null;
  ncId?: number | null;
  closedAt: string | null;
  createdAt: string;
  charges: EventTableCharge[];
  payments: EventTablePayment[];
};

type HotelEvent = {
  id: string;
  eventCode: string;
  name: string;
  eventRoomId: string;
  eventType: "corporate" | "social" | "wedding" | "conference" | "meeting" | "table_event" | "other";
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  companyId: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  attendees: number;
  status: "tentative" | "confirmed" | "in_progress" | "completed" | "cancelled" | "invoiced";
  notes: string | null;
  receiptType: string | null;
  closedAt: string | null;
  totalAmount: string | null;
  totalPaid: string | null;
  invoiceId?: number | null;
  ncId?: number | null;
  createdAt: string;
  eventRoom?: EventRoom;
  charges?: EventCharge[];
  payments?: EventPayment[];
};

type Reservation = {
  id: string;
  reservationCode: string;
  guestId: string;
  roomId: string;
  status: string;
  guest?: { firstName: string; lastName: string };
  room?: { roomNumber: string };
};

type Company = {
  id: string;
  name: string;
  razonSocial?: string;
  nombreFantasia?: string | null;
  cuilCuit?: string | null;
};

const eventStatusColors: Record<string, string> = {
  tentative: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  confirmed: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  in_progress: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  completed: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
  invoiced: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30",
};

const eventStatusLabels: Record<string, string> = {
  tentative: "Tentativo",
  confirmed: "Confirmado",
  in_progress: "En Curso",
  completed: "Completado",
  cancelled: "Cancelado",
  invoiced: "Facturado",
};

const eventTypeLabels: Record<string, string> = {
  corporate: "Corporativo",
  social: "Social",
  wedding: "Boda",
  conference: "Conferencia",
  meeting: "Reunion",
  table_event: "Evento por Mesa",
  other: "Otro",
};

const eventTypeColors: Record<string, string> = {
  corporate: "bg-blue-500/20 text-blue-800 dark:text-blue-200 border border-blue-400/40",
  social: "bg-pink-500/20 text-pink-800 dark:text-pink-200 border border-pink-400/40",
  wedding: "bg-amber-100/60 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200 border border-amber-400/40",
  conference: "bg-green-500/20 text-green-800 dark:text-green-200 border border-green-400/40",
  meeting: "bg-teal-500/20 text-teal-800 dark:text-teal-200 border border-teal-400/40",
  table_event: "bg-violet-500/20 text-violet-800 dark:text-violet-200 border border-violet-400/40",
  other: "bg-gray-500/20 text-gray-800 dark:text-gray-200 border border-gray-400/40",
};

const paymentMethodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Tarjeta Debito",
  tarjeta_credito: "Tarjeta Credito",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  room_charge: "Cargo a Habitacion",
  cuenta_corriente: "Cuenta Corriente",
};

const receiptTypeOptions = [
  { value: "ticket", label: "Ticket" },
  { value: "factura_a", label: "Factura A (IVA Resp. Inscripto)" },
  { value: "factura_b", label: "Factura B (Consumidor Final)" },
  { value: "nota_credito", label: "Nota Crédito" },
  { value: "voucher_no_fiscal", label: "Voucher (No Fiscal)" },
];

function safeFormatDate(dateStr: string, fmt: string, opts?: any): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    return format(d, fmt, opts);
  } catch {
    return dateStr;
  }
}

const eventFormSchema = z.object({
  eventRoomId: z.string().min(1, "Seleccione un salon"),
  name: z.string().min(1, "El nombre del evento es requerido"),
  eventType: z.enum(["corporate", "social", "wedding", "conference", "meeting", "table_event", "other"]),
  contactName: z.string().min(1, "El nombre de contacto es requerido"),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email("Email invalido").optional().or(z.literal("")),
  startDate: z.string().min(1, "La fecha de inicio es requerida"),
  endDate: z.string().min(1, "La fecha de fin es requerida"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  attendees: z.number().min(1, "Debe haber al menos 1 asistente en total"),
  attendeesAdults: z.number().min(0).default(0),
  attendeesYouth: z.number().min(0).default(0),
  attendeesChildren: z.number().min(0).default(0),
  notes: z.string().optional(),
  notasArmado: z.string().optional(),
  notasCocina: z.string().optional(),
  notasMantenimiento: z.string().optional(),
  notasHousekeeping: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

const chargeFormSchema = z.object({
  chargeTypeId: z.string().optional(),
  description: z.string().min(1, "La descripcion es requerida"),
  quantity: z.number().min(1, "La cantidad debe ser al menos 1"),
  unitPrice: z.string().min(1, "El precio es requerido"),
  notes: z.string().optional(),
});

type ChargeFormValues = z.infer<typeof chargeFormSchema>;

type PlanningEvent = {
  id: string;
  name: string;
  contactName: string;
  startDate: string;
  endDate: string;
  status: "tentative" | "confirmed" | "in_progress" | "completed" | "cancelled" | "invoiced";
  eventType: "corporate" | "social" | "wedding" | "conference" | "meeting" | "table_event" | "other";
};

type EventPlanningResponse = {
  rooms: EventRoom[];
  days: string[];
  events: Record<string, PlanningEvent>;
  cellEvents: Record<string, Record<string, string[]>>;
};

export default function EventsPage() {
  const [weekStart, setWeekStart] = useState(startOfDay(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<HotelEvent | null>(null);
  const [anularEventPayTarget, setAnularEventPayTarget] = useState<{ eventId: string; payId: string } | null>(null);
  const [anularEventPayMotivo, setAnularEventPayMotivo] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [isChargeEditable, setIsChargeEditable] = useState(false);
  const [isTableChargeEditable, setIsTableChargeEditable] = useState(false);
  const [prefilledRoomId, setPrefilledRoomId] = useState<string>("");
  const [prefilledDate, setPrefilledDate] = useState<string>("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [deleteEventConfirmOpen, setDeleteEventConfirmOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<HotelEvent | null>(null);
  const [folioReceiptType, setFolioReceiptType] = useState("");
  const [invoiceCustomerName, setInvoiceCustomerName] = useState("");
  const [invoiceCustomerCuit, setInvoiceCustomerCuit] = useState("");
  const [invoiceCustomerDni, setInvoiceCustomerDni] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [isTableFolioOpen, setIsTableFolioOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<EventTableType | null>(null);
  const [tableFolioReceiptType, setTableFolioReceiptType] = useState("");
  const [tableInvoiceCustomerName, setTableInvoiceCustomerName] = useState("");
  const [tableInvoiceCustomerCuit, setTableInvoiceCustomerCuit] = useState("");
  const [tableInvoiceCustomerDni, setTableInvoiceCustomerDni] = useState("");
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState(1);
  const [newTableLabel, setNewTableLabel] = useState("");
  const [newTableSeats, setNewTableSeats] = useState(4);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [paymentIsAdvance, setPaymentIsAdvance] = useState(false);
  const [paymentReservationId, setPaymentReservationId] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentCcEntityType, setPaymentCcEntityType] = useState<"company" | "agency">("company");
  const [paymentCcEntityId, setPaymentCcEntityId] = useState("");
  const [tableChargeDesc, setTableChargeDesc] = useState("");
  const [tableChargeQty, setTableChargeQty] = useState(1);
  const [tableChargePrice, setTableChargePrice] = useState("");
  const [tablePayAmount, setTablePayAmount] = useState("");
  const [tablePayMethod, setTablePayMethod] = useState("efectivo");
  const [tablePayAdvance, setTablePayAdvance] = useState(false);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<{ invoice: any; linkedNc: any | null } | null>(null);
  const [tablePayResId, setTablePayResId] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEmailReceiptOpen, setIsEmailReceiptOpen] = useState(false);
  const [emailReceiptAddress, setEmailReceiptAddress] = useState("");
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const startDateStr = format(weekStart, "yyyy-MM-dd");
  const endDateStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data: eventRooms = [], isLoading: roomsLoading } = useQuery<EventRoom[]>({
    queryKey: ["/api/events/rooms"],
  });

  const { data: chargeTypes = [] } = useQuery<EventChargeType[]>({
    queryKey: ["/api/events/charge-types"],
  });

  const { data: planningData, isLoading: planningLoading } = useQuery<EventPlanningResponse>({
    queryKey: ["/api/events/planning", startDateStr, endDateStr],
    queryFn: () => 
      fetch(`/api/events/planning?start=${startDateStr}&end=${endDateStr}`)
        .then(res => res.json()),
  });

  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    queryFn: () => fetch("/api/reservations").then(r => r.json()),
  });

  const activeReservations = reservations.filter(r => r.status === "checked_in" || r.status === "confirmed");

  const { data: eventTables = [], refetch: refetchTables } = useQuery<EventTableType[]>({
    queryKey: ["/api/events", selectedEvent?.id, "tables"],
    queryFn: () => fetch(`/api/events/${selectedEvent!.id}/tables`).then(r => r.json()),
    enabled: !!selectedEvent && selectedEvent.eventType === "table_event",
  });

  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/companies"],
  });
  const { data: agencies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/agencies"],
  });

  const { data: eventsShift } = useQuery<{ id: string; openedBy: string | null; status: string } | null>({
    queryKey: ["/api/cash/shifts/current", "events"],
    queryFn: () => fetch("/api/cash/shifts/current?area=events").then(r => r.json()),
    refetchInterval: 30000,
  });
  const eventsShiftActive = !!(eventsShift && eventsShift.openedBy && eventsShift.status === "open");

  // Invoice data for invoiced events that emitted an AFIP factura
  const { data: eventInvoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", selectedEvent?.invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/invoices/${selectedEvent!.invoiceId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedEvent?.invoiceId,
    staleTime: 60000,
  });

  // Invoice data for a closed table folio that emitted an AFIP factura
  const { data: tableInvoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", selectedTable?.invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/invoices/${selectedTable!.invoiceId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedTable?.invoiceId,
    staleTime: 60000,
  });

  // NC invoice data for the event main-folio that had its factura reversed
  const { data: eventNcInvoice, refetch: refetchEventNcInvoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", selectedEvent?.ncId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/invoices/${selectedEvent!.ncId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedEvent?.ncId,
    staleTime: 60000,
  });

  // NC invoice data for a table that had its factura reversed
  const { data: tableNcInvoice, refetch: refetchTableNcInvoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", selectedTable?.ncId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/invoices/${selectedTable!.ncId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedTable?.ncId,
    staleTime: 60000,
  });

  // Void adjustments from folio_movements for the selected event (written when an NC voids a payment)
  const { data: eventFolioData } = useQuery<any>({
    queryKey: ["/api/folios", "event", selectedEvent?.id],
    queryFn: async () => {
      const res = await fetch(`/api/folios/event/${selectedEvent!.id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedEvent?.id && activeTab === "folio",
  });
  const eventFolioVoidMovements: any[] = (eventFolioData?.movements ?? []).filter((m: any) => m.type === "void");
  const eventFolioNdMovements: any[] = (eventFolioData?.movements ?? []).filter((m: any) => m.sourceType === "nota_debito" || (m.receiptType?.startsWith("ND") ?? false));

  const eventsMap = planningData?.events || {};
  const cellEventsMap = planningData?.cellEvents || {};

  const eventForm = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventRoomId: "",
      name: "",
      eventType: "corporate",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      startDate: "",
      endDate: "",
      startTime: "",
      endTime: "",
      attendees: 10,
      attendeesAdults: 0,
      attendeesYouth: 0,
      attendeesChildren: 0,
      notes: "",
      notasArmado: "",
      notasCocina: "",
      notasMantenimiento: "",
      notasHousekeeping: "",
    },
  });

  const editForm = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventRoomId: "",
      name: "",
      eventType: "corporate",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      startDate: "",
      endDate: "",
      startTime: "",
      endTime: "",
      attendees: 10,
      attendeesAdults: 0,
      attendeesYouth: 0,
      attendeesChildren: 0,
      notes: "",
      notasArmado: "",
      notasCocina: "",
      notasMantenimiento: "",
      notasHousekeeping: "",
    },
  });

  // Auto-calcular total asistentes en form nuevo
  const newAdults = eventForm.watch("attendeesAdults") || 0;
  const newYouth = eventForm.watch("attendeesYouth") || 0;
  const newChildren = eventForm.watch("attendeesChildren") || 0;
  useEffect(() => {
    eventForm.setValue("attendees", newAdults + newYouth + newChildren || 1);
  }, [newAdults, newYouth, newChildren]);

  // Auto-calcular total asistentes en form edición
  const editAdults = editForm.watch("attendeesAdults") || 0;
  const editYouth = editForm.watch("attendeesYouth") || 0;
  const editChildren = editForm.watch("attendeesChildren") || 0;
  useEffect(() => {
    editForm.setValue("attendees", editAdults + editYouth + editChildren || 1);
  }, [editAdults, editYouth, editChildren]);

  const chargeForm = useForm<ChargeFormValues>({
    resolver: zodResolver(chargeFormSchema),
    defaultValues: {
      chargeTypeId: "",
      description: "",
      quantity: 1,
      unitPrice: "",
      notes: "",
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (data: EventFormValues) => apiRequest("POST", "/api/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setIsNewDialogOpen(false);
      eventForm.reset();
      toast({ title: "Evento creado exitosamente" });
    },
    onError: async (error: any) => {
      try {
        const msg = error?.message || "Error al crear el evento";
        if (msg.includes("Superposición") || msg.includes("409")) {
          toast({ title: "Conflicto de horario", description: msg, variant: "destructive" });
        } else {
          toast({ title: msg, variant: "destructive" });
        }
      } catch {
        toast({ title: "Error al crear el evento", variant: "destructive" });
      }
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EventFormValues & { status: string }> }) =>
      apiRequest("PATCH", `/api/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento actualizado" });
    },
    onError: async (error: any) => {
      const msg = error?.message || "Error al actualizar el evento";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSelectedEvent(null);
      setEventToDelete(null);
      setDeleteEventConfirmOpen(false);
      toast({ title: "Evento eliminado correctamente" });
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const createChargeMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: ChargeFormValues }) =>
      apiRequest("POST", `/api/events/${eventId}/charges`, data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      if (selectedEvent) {
        const response = await fetch(`/api/events/${selectedEvent.id}`);
        if (response.ok) {
          const updatedEvent = await response.json();
          setSelectedEvent(updatedEvent);
        }
      }
      setIsChargeDialogOpen(false);
      chargeForm.reset();
      toast({ title: "Cargo agregado" });
    },
    onError: () => {
      toast({ title: "Error al agregar el cargo", variant: "destructive" });
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: (chargeId: string) => apiRequest("DELETE", `/api/events/charges/${chargeId}`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      if (selectedEvent) {
        const response = await fetch(`/api/events/${selectedEvent.id}`);
        if (response.ok) {
          const updatedEvent = await response.json();
          setSelectedEvent(updatedEvent);
        }
      }
      toast({ title: "Cargo eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar el cargo", variant: "destructive" });
    },
  });

  const refreshSelectedEvent = async () => {
    if (!selectedEvent) return;
    const response = await fetch(`/api/events/${selectedEvent.id}`);
    if (response.ok) {
      const updatedEvent = await response.json();
      setSelectedEvent(updatedEvent);
    }
  };

  const addPaymentMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: any }) =>
      apiRequest("POST", `/api/events/${eventId}/payments`, data),
    onSuccess: async () => {
      await refreshSelectedEvent();
      setPaymentAmount("");
      setPaymentMethod("efectivo");
      setPaymentIsAdvance(false);
      setPaymentReservationId("");
      setPaymentNotes("");
      setPaymentCcEntityType("company");
      setPaymentCcEntityId("");
      toast({ title: "Pago registrado" });
    },
    onError: () => {
      toast({ title: "Error al registrar el pago", variant: "destructive" });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: ({ eventId, payId }: { eventId: string; payId: string }) => {
      console.warn("DEPRECATED: use anularEventPaymentMutation instead");
      return apiRequest("DELETE", `/api/events/${eventId}/payments/${payId}`);
    },
    onSuccess: async () => {
      await refreshSelectedEvent();
      toast({ title: "Pago eliminado" });
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const anularEventPaymentMutation = useMutation({
    mutationFn: ({ eventId, payId, motivo }: { eventId: string; payId: string; motivo: string }) =>
      apiRequest("PATCH", `/api/events/${eventId}/payments/${payId}/anular`, { motivoAnulacion: motivo }),
    onSuccess: async () => {
      await refreshSelectedEvent();
      setAnularEventPayTarget(null);
      setAnularEventPayMotivo("");
      toast({ title: "Pago anulado" });
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
      console.error("Anular event payment error:", error);
    },
  });

  const closeEventMutation = useMutation({
    mutationFn: async ({ eventId, receiptType, customerName, customerCuit, customerDni }: { eventId: string; receiptType: string; customerName?: string; customerCuit?: string; customerDni?: string }) => {
      const res = await apiRequest("POST", `/api/events/${eventId}/close`, {
        receiptType,
        customerRazonSocial: customerName || undefined,
        customerCuit: customerCuit || undefined,
        customerDni: customerDni || undefined,
      });
      return res.json();
    },
    onSuccess: async (data: any, variables) => {
      await refreshSelectedEvent();
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      const wasFactura = ["factura_a", "factura_b", "factura_c"].includes(variables.receiptType);
      if (wasFactura && !data?.invoiceId) {
        toast({ title: "Evento cerrado, pero la factura AFIP no pudo emitirse — verificar con administración", variant: "destructive" });
      } else if (data?.invoiceId) {
        toast({ title: "Evento facturado y Factura AFIP emitida correctamente" });
      } else {
        toast({ title: "Evento facturado exitosamente" });
      }
      setFolioReceiptType("");
      setInvoiceCustomerName("");
      setInvoiceCustomerCuit("");
      setInvoiceCustomerDni("");
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const addTableChargeMutation = useMutation({
    mutationFn: ({ eventId, tableId, data }: { eventId: string; tableId: string; data: any }) =>
      apiRequest("POST", `/api/events/${eventId}/tables/${tableId}/charges`, data),
    onSuccess: async () => {
      await refetchTables();
      if (selectedTable) {
        const resp = await fetch(`/api/events/${selectedEvent!.id}/tables`);
        const tables: EventTableType[] = await resp.json();
        const updated = tables.find(t => t.id === selectedTable.id);
        if (updated) setSelectedTable(updated);
      }
      setTableChargeDesc("");
      setTableChargeQty(1);
      setTableChargePrice("");
      toast({ title: "Cargo agregado a la mesa" });
    },
    onError: () => {
      toast({ title: "Error al agregar cargo", variant: "destructive" });
    },
  });

  const deleteTableChargeMutation = useMutation({
    mutationFn: ({ eventId, tableId, chargeId }: { eventId: string; tableId: string; chargeId: string }) =>
      apiRequest("DELETE", `/api/events/${eventId}/tables/${tableId}/charges/${chargeId}`),
    onSuccess: async () => {
      await refetchTables();
      if (selectedTable) {
        const resp = await fetch(`/api/events/${selectedEvent!.id}/tables`);
        const tables: EventTableType[] = await resp.json();
        const updated = tables.find(t => t.id === selectedTable.id);
        if (updated) setSelectedTable(updated);
      }
      toast({ title: "Cargo eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar cargo", variant: "destructive" });
    },
  });

  const addTablePaymentMutation = useMutation({
    mutationFn: ({ eventId, tableId, data }: { eventId: string; tableId: string; data: any }) =>
      apiRequest("POST", `/api/events/${eventId}/tables/${tableId}/payments`, data),
    onSuccess: async () => {
      await refetchTables();
      if (selectedTable) {
        const resp = await fetch(`/api/events/${selectedEvent!.id}/tables`);
        const tables: EventTableType[] = await resp.json();
        const updated = tables.find(t => t.id === selectedTable.id);
        if (updated) setSelectedTable(updated);
      }
      setTablePayAmount("");
      setTablePayMethod("efectivo");
      setTablePayAdvance(false);
      setTablePayResId("");
      toast({ title: "Pago registrado en mesa" });
    },
    onError: () => {
      toast({ title: "Error al registrar pago", variant: "destructive" });
    },
  });

  const closeTableMutation = useMutation({
    mutationFn: async ({ eventId, tableId, receiptType, customerRazonSocial, customerCuit, customerDni }: { eventId: string; tableId: string; receiptType: string; customerRazonSocial?: string; customerCuit?: string; customerDni?: string }) => {
      const res = await apiRequest("POST", `/api/events/${eventId}/tables/${tableId}/close`, { receiptType, customerRazonSocial, customerCuit, customerDni });
      return res.json();
    },
    onSuccess: async (data: any) => {
      await refetchTables();
      const wasFactura = ["factura_a", "factura_b", "factura_c"].includes(data?.receiptType);
      if (wasFactura && !data?.invoiceId) {
        toast({ title: "Mesa cerrada, pero la factura AFIP no pudo emitirse — verificar con administración", variant: "destructive" });
      } else if (data?.invoiceId) {
        toast({ title: "Mesa cerrada y Factura AFIP emitida correctamente" });
      } else {
        toast({ title: "Mesa cerrada exitosamente" });
      }
      // Update selectedTable so the badge shows without reopening the dialog
      if (data) setSelectedTable((prev) => prev ? { ...prev, status: data.status || "invoiced", receiptType: data.receiptType, invoiceId: data.invoiceId, closedAt: data.closedAt } : prev);
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const emitEventNcMutation = useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      const res = await apiRequest("POST", `/api/events/${eventId}/nc`, {});
      return res.json();
    },
    onSuccess: async (data: any) => {
      if (data?.ncId) {
        setSelectedEvent((prev) => prev ? { ...prev, ncId: data.ncId } : prev);
        await refetchEventNcInvoice();
        toast({ title: "Nota de Crédito emitida correctamente" });
      }
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const resetEventNcMutation = useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      const res = await apiRequest("PATCH", `/api/events/${eventId}/reset-nc`, {});
      return res.json();
    },
    onSuccess: async (data: any) => {
      setSelectedEvent((prev) => prev ? { ...prev, ncId: null } : prev);
      queryClient.invalidateQueries({ queryKey: ["/api/events/planning"] });
      toast({ title: "Estado de NC restablecido. Ya puede emitir una nueva NC." });
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const emitTableNcMutation = useMutation({
    mutationFn: async ({ eventId, tableId }: { eventId: string; tableId: string }) => {
      const res = await apiRequest("POST", `/api/events/${eventId}/tables/${tableId}/nc`, {});
      return res.json();
    },
    onSuccess: async (data: any) => {
      await refetchTables();
      if (data?.ncId) {
        setSelectedTable((prev) => prev ? { ...prev, ncId: data.ncId } : prev);
        await refetchTableNcInvoice();
        toast({ title: "Nota de Crédito emitida correctamente" });
      }
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const sendTableReceiptEmailMutation = useMutation({
    mutationFn: async ({ eventId, tableId, to }: { eventId: string; tableId: string; to: string }) => {
      const res = await apiRequest("POST", `/api/events/${eventId}/tables/${tableId}/receipt-email`, { to });
      return res.json();
    },
    onSuccess: () => {
      setIsEmailReceiptOpen(false);
      toast({ title: "Comprobante enviado por email" });
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const createTableMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: any }) =>
      apiRequest("POST", `/api/events/${eventId}/tables`, data),
    onSuccess: async () => {
      await refetchTables();
      setIsAddTableOpen(false);
      setNewTableNumber(n => n + 1);
      setNewTableLabel("");
      toast({ title: "Mesa agregada" });
    },
    onError: () => {
      toast({ title: "Error al agregar mesa", variant: "destructive" });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: ({ eventId, tableId }: { eventId: string; tableId: string }) =>
      apiRequest("DELETE", `/api/events/${eventId}/tables/${tableId}`),
    onSuccess: async () => {
      await refetchTables();
      toast({ title: "Mesa eliminada" });
    },
    onError: (error: any) => {
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });

  const handleCellClick = (roomId: string, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setPrefilledRoomId(roomId);
    setPrefilledDate(dateStr);
    eventForm.reset({
      eventRoomId: roomId,
      name: "",
      eventType: "corporate",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      startDate: dateStr,
      endDate: dateStr,
      startTime: "",
      endTime: "",
      attendees: 10,
      notes: "",
    });
    setIsNewDialogOpen(true);
  };

  const handleEventClick = async (eventId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (response.ok) {
        const fullEvent = await response.json();
        setSelectedEvent(fullEvent);
        setActiveTab("details");
      }
    } catch (error) {
      toast({ title: "Error al cargar el evento", variant: "destructive" });
    }
  };

  const onSubmitEvent = (data: EventFormValues) => {
    createEventMutation.mutate(data);
  };

  const handleOpenEdit = () => {
    if (!selectedEvent) return;
    editForm.reset({
      eventRoomId: selectedEvent.eventRoomId,
      name: selectedEvent.name,
      eventType: selectedEvent.eventType as EventFormValues["eventType"],
      contactName: selectedEvent.contactName,
      contactPhone: selectedEvent.contactPhone || "",
      contactEmail: selectedEvent.contactEmail || "",
      startDate: selectedEvent.startDate,
      endDate: selectedEvent.endDate,
      startTime: selectedEvent.startTime || "",
      endTime: selectedEvent.endTime || "",
      attendees: selectedEvent.attendees,
      attendeesAdults: (selectedEvent as any).attendeesAdults || 0,
      attendeesYouth: (selectedEvent as any).attendeesYouth || 0,
      attendeesChildren: (selectedEvent as any).attendeesChildren || 0,
      notes: selectedEvent.notes || "",
      notasArmado: (selectedEvent as any).notasArmado || "",
      notasCocina: (selectedEvent as any).notasCocina || "",
      notasMantenimiento: (selectedEvent as any).notasMantenimiento || "",
      notasHousekeeping: (selectedEvent as any).notasHousekeeping || "",
    });
    setIsEditDialogOpen(true);
  };

  const onSubmitEdit = (data: EventFormValues) => {
    if (!selectedEvent) return;
    updateEventMutation.mutate(
      { id: selectedEvent.id, data },
      {
        onSuccess: async () => {
          const response = await fetch(`/api/events/${selectedEvent.id}`);
          if (response.ok) {
            const updatedEvent = await response.json();
            setSelectedEvent(updatedEvent);
          }
          setIsEditDialogOpen(false);
        },
      }
    );
  };

  const onSubmitCharge = (data: ChargeFormValues) => {
    if (!selectedEvent) return;
    createChargeMutation.mutate({ eventId: selectedEvent.id, data });
  };

  const handleChargeTypeSelect = (chargeTypeId: string) => {
    const chargeType = chargeTypes.find(ct => ct.id === chargeTypeId);
    if (chargeType) {
      chargeForm.setValue("description", chargeType.name);
      chargeForm.setValue("unitPrice", chargeType.defaultPrice);
    }
  };

  const getEventsForCell = (roomId: string, date: Date): PlanningEvent[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const eventIds = cellEventsMap[roomId]?.[dateStr];
    if (!eventIds) return [];
    return eventIds.map(id => eventsMap[id]).filter(Boolean);
  };

  const calculateEventTotal = (event: HotelEvent): number => {
    if (!event.charges) return 0;
    return event.charges.reduce((sum, charge) => sum + parseFloat(charge.totalAmount), 0);
  };

  const calculateEventPaid = (event: HotelEvent): number => {
    if (!event.payments) return 0;
    return event.payments.filter((p: any) => p.status !== "anulado").reduce((sum, p) => sum + parseFloat(p.amount), 0);
  };

  const handleAddPayment = () => {
    if (!selectedEvent || !paymentAmount || parseFloat(paymentAmount) <= 0) return;
    addPaymentMutation.mutate({
      eventId: selectedEvent.id,
      data: {
        amount: paymentAmount,
        method: paymentMethod,
        isAdvance: paymentIsAdvance,
        reservationId: paymentMethod === "room_charge" ? paymentReservationId : null,
        notes: paymentNotes || null,
        ccEntityType: paymentMethod === "cuenta_corriente" && paymentCcEntityId ? paymentCcEntityType : undefined,
        ccEntityId: paymentMethod === "cuenta_corriente" && paymentCcEntityId ? paymentCcEntityId : undefined,
      },
    });
  };

  const handleCloseEvent = () => {
    if (!selectedEvent || !folioReceiptType) return;
    closeEventMutation.mutate({
      eventId: selectedEvent.id,
      receiptType: folioReceiptType,
      customerName: invoiceCustomerName || undefined,
      customerCuit: invoiceCustomerCuit || undefined,
      customerDni: invoiceCustomerDni || undefined,
    });
  };

  const handleAddTableCharge = () => {
    if (!selectedEvent || !selectedTable || !tableChargeDesc || !tableChargePrice) return;
    addTableChargeMutation.mutate({
      eventId: selectedEvent.id,
      tableId: selectedTable.id,
      data: { description: tableChargeDesc, quantity: tableChargeQty, unitPrice: tableChargePrice },
    });
  };

  const handleAddTablePayment = () => {
    if (!selectedEvent || !selectedTable || !tablePayAmount || parseFloat(tablePayAmount) <= 0) return;
    addTablePaymentMutation.mutate({
      eventId: selectedEvent.id,
      tableId: selectedTable.id,
      data: {
        amount: tablePayAmount,
        method: tablePayMethod,
        isAdvance: tablePayAdvance,
        reservationId: tablePayMethod === "room_charge" ? tablePayResId : null,
      },
    });
  };

  const handleCloseTable = () => {
    if (!selectedEvent || !selectedTable || !tableFolioReceiptType) return;
    closeTableMutation.mutate({
      eventId: selectedEvent.id,
      tableId: selectedTable.id,
      receiptType: tableFolioReceiptType,
      customerRazonSocial: tableInvoiceCustomerName || undefined,
      customerCuit: tableInvoiceCustomerCuit || undefined,
      customerDni: tableInvoiceCustomerDni || undefined,
    });
  };

  const canShowFolio = (event: HotelEvent) => {
    return ["confirmed", "in_progress", "completed"].includes(event.status);
  };

  if (roomsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const detailTabCount = selectedEvent?.eventType === "table_event" ? 4 : 3;

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Eventos - Planificacion Semanal
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(subWeeks(weekStart, 1))} title="Semana anterior" data-testid="button-prev-week">
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(subDays(weekStart, 1))} title="Día anterior" data-testid="button-prev-day">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setWeekStart(startOfDay(new Date()))} data-testid="button-today">
                  Hoy
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs" data-testid="button-date-picker">
                      <CalendarSearch className="h-3.5 w-3.5 mr-1" />
                      {format(weekStart, "d MMM", { locale: es })} – {format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <CalendarPicker
                      mode="single"
                      selected={weekStart}
                      onSelect={(date) => date && setWeekStart(startOfDay(date))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addDays(weekStart, 1))} title="Día siguiente" data-testid="button-next-day">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addWeeks(weekStart, 1))} title="Semana siguiente" data-testid="button-next-week">
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button
                onClick={() => {
                  eventForm.reset();
                  setPrefilledRoomId("");
                  setPrefilledDate("");
                  setIsNewDialogOpen(true);
                }}
                data-testid="button-new-event"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Evento
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-[900px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px] sticky left-0 bg-background z-10">Salon</TableHead>
                    {weekDays.map((day) => (
                      <TableHead key={day.toISOString()} className="text-center min-w-[120px]">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            {format(day, "EEE", { locale: es })}
                          </span>
                          <span className={isSameDay(day, new Date()) ? "font-bold text-primary" : ""}>
                            {format(day, "d")}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventRooms.filter(r => r.isActive).map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">
                        <div className="flex flex-col">
                          <span>{room.name}</span>
                          <span className="text-xs text-muted-foreground">
                            Cap: {room.capacity}
                          </span>
                        </div>
                      </TableCell>
                      {weekDays.map((day) => {
                        const cellEvents = getEventsForCell(room.id, day);
                        const isDayPast = isBefore(startOfDay(day), startOfDay(new Date()));
                        return (
                          <TableCell
                            key={day.toISOString()}
                            className={`p-1 align-top min-h-[80px] ${isDayPast ? "" : "cursor-pointer hover-elevate"}`}
                            onClick={() => !isDayPast && cellEvents.length === 0 && handleCellClick(room.id, day)}
                            data-testid={`cell-${room.id}-${format(day, "yyyy-MM-dd")}`}
                          >
                            <div className="flex flex-col gap-1">
                              {cellEvents.map((event) => {
                                const isEventPast = isBefore(parseISO(event.endDate), startOfDay(new Date()));
                                return (
                                  <div
                                    key={event.id}
                                    className={`p-1.5 rounded-md text-xs cursor-pointer ${isEventPast ? "bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 opacity-70" : (eventTypeColors[event.eventType] || eventTypeColors.other)}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEventClick(event.id);
                                    }}
                                    data-testid={`event-${event.id}`}
                                  >
                                    <div className="font-medium truncate">{event.name}</div>
                                    <div className="text-xs opacity-80 truncate">{eventTypeLabels[event.eventType] || event.eventType}</div>
                                  </div>
                                );
                              })}
                              {cellEvents.length === 0 && (
                                <div className="h-16 flex items-center justify-center">
                                  <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t" data-testid="event-type-legend">
            {Object.entries(eventTypeLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${eventTypeColors[key]}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* New Event Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Evento</DialogTitle>
            <DialogDescription>
              Complete los datos del evento
            </DialogDescription>
          </DialogHeader>
          <Form {...eventForm}>
            <form onSubmit={eventForm.handleSubmit(onSubmitEvent)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={eventForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Nombre del Evento</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre del evento" {...field} data-testid="input-event-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="eventRoomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salon</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-room">
                            <SelectValue placeholder="Seleccionar salon" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {eventRooms.filter(r => r.isActive && r.id).map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name} (Cap: {room.capacity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Evento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-type">
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="corporate">Corporativo</SelectItem>
                          <SelectItem value="social">Social</SelectItem>
                          <SelectItem value="wedding">Boda</SelectItem>
                          <SelectItem value="conference">Conferencia</SelectItem>
                          <SelectItem value="meeting">Reunion</SelectItem>
                          <SelectItem value="table_event">Evento por Mesa</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {eventForm.watch("eventType") === "table_event" && (
                  <div className="col-span-2 flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      En un Evento por Mesa, los cargos y pagos se gestionan por mesa individual. Los cargos generales del evento se cobran al organizador.
                    </p>
                  </div>
                )}

                <FormField
                  control={eventForm.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Persona de Contacto</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre de contacto" {...field} data-testid="input-contact-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <Input placeholder="Telefono" {...field} data-testid="input-contact-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Email" {...field} data-testid="input-contact-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="col-span-2 space-y-2">
                  <FormLabel>Asistentes</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={eventForm.control} name="attendeesAdults" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Adultos</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-attendees-adults" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={eventForm.control} name="attendeesYouth" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Jóvenes</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-attendees-youth" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={eventForm.control} name="attendeesChildren" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Niños</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-attendees-children" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Total (automático)</p>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-medium">
                        {newAdults + newYouth + newChildren || 1}
                        <span className="ml-1 text-xs text-muted-foreground font-normal">personas</span>
                      </div>
                    </div>
                  </div>
                </div>

                <FormField
                  control={eventForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Inicio</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-start-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Fin</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-end-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora Inicio</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora Fin</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={eventForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notas adicionales" {...field} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="col-span-2">
                  <p className="text-sm font-medium text-muted-foreground border-t pt-3 mt-1">Coordinación por área (opcional)</p>
                </div>
                <FormField control={eventForm.control} name="notasArmado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Armado</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para el equipo de armado..." rows={2} {...field} data-testid="input-notas-armado" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={eventForm.control} name="notasCocina" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cocina</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para cocina..." rows={2} {...field} data-testid="input-notas-cocina" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={eventForm.control} name="notasMantenimiento" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mantenimiento</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para mantenimiento..." rows={2} {...field} data-testid="input-notas-mantenimiento" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={eventForm.control} name="notasHousekeeping" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Housekeeping</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para housekeeping..." rows={2} {...field} data-testid="input-notas-housekeeping" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsNewDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createEventMutation.isPending} data-testid="button-submit-event">
                  {createEventMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear Evento
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Evento</DialogTitle>
            <DialogDescription>
              Modifique los datos del evento
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Nombre del Evento</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre del evento" {...field} data-testid="input-edit-event-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="eventRoomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salon</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-event-room">
                            <SelectValue placeholder="Seleccionar salon" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {eventRooms.filter(r => r.isActive && r.id).map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name} (Cap: {room.capacity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Evento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-event-type">
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="corporate">Corporativo</SelectItem>
                          <SelectItem value="social">Social</SelectItem>
                          <SelectItem value="wedding">Boda</SelectItem>
                          <SelectItem value="conference">Conferencia</SelectItem>
                          <SelectItem value="meeting">Reunion</SelectItem>
                          <SelectItem value="table_event">Evento por Mesa</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Persona de Contacto</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre de contacto" {...field} data-testid="input-edit-contact-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <Input placeholder="Telefono" {...field} data-testid="input-edit-contact-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Email" {...field} data-testid="input-edit-contact-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="col-span-2 space-y-2">
                  <FormLabel>Asistentes</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={editForm.control} name="attendeesAdults" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Adultos</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-edit-attendees-adults" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={editForm.control} name="attendeesYouth" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Jóvenes</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-edit-attendees-youth" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={editForm.control} name="attendeesChildren" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Niños</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-edit-attendees-children" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Total (automático)</p>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-medium">
                        {editAdults + editYouth + editChildren || 1}
                        <span className="ml-1 text-xs text-muted-foreground font-normal">personas</span>
                      </div>
                    </div>
                  </div>
                </div>

                <FormField
                  control={editForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Inicio</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-edit-start-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Fin</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-edit-end-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora Inicio</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-edit-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora Fin</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-edit-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notas adicionales" {...field} data-testid="input-edit-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="col-span-2">
                  <p className="text-sm font-medium text-muted-foreground border-t pt-3 mt-1">Coordinación por área (opcional)</p>
                </div>
                <FormField control={editForm.control} name="notasArmado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Armado</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para el equipo de armado..." rows={2} {...field} data-testid="input-edit-notas-armado" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="notasCocina" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cocina</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para cocina..." rows={2} {...field} data-testid="input-edit-notas-cocina" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="notasMantenimiento" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mantenimiento</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para mantenimiento..." rows={2} {...field} data-testid="input-edit-notas-mantenimiento" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="notasHousekeeping" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Housekeeping</FormLabel>
                    <FormControl><Textarea placeholder="Instrucciones para housekeeping..." rows={2} {...field} data-testid="input-edit-notas-housekeeping" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateEventMutation.isPending} data-testid="button-submit-edit-event">
                  {updateEventMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedEvent?.name}</span>
              {selectedEvent && (
                <>
                  <Badge className={eventStatusColors[selectedEvent.status]}>
                    {eventStatusLabels[selectedEvent.status]}
                  </Badge>
                  {selectedEvent.eventType === "table_event" && (
                    <Badge variant="outline" className="border-orange-500 text-orange-600">
                      <UtensilsCrossed className="h-3 w-3 mr-1" />
                      Por Mesa
                    </Badge>
                  )}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Codigo: {selectedEvent?.eventCode}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={`grid w-full ${detailTabCount === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
                <TabsTrigger value="details">Detalles</TabsTrigger>
                <TabsTrigger value="charges">Cargos</TabsTrigger>
                {selectedEvent.eventType === "table_event" && (
                  <TabsTrigger value="tables">Mesas</TabsTrigger>
                )}
                <TabsTrigger value="folio">Folio</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Salon:</span>
                      <span>{selectedEvent.eventRoom?.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Fecha:</span>
                      <span>
                        {safeFormatDate(selectedEvent.startDate, "d MMM yyyy", { locale: es })}
                        {selectedEvent.startDate !== selectedEvent.endDate && (
                          <> - {safeFormatDate(selectedEvent.endDate, "d MMM yyyy", { locale: es })}</>
                        )}
                      </span>
                    </div>
                    {selectedEvent.startTime && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Horario:</span>
                        <span>
                          {selectedEvent.startTime} - {selectedEvent.endTime || "..."}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Asistentes:</span>
                      <span>
                        {selectedEvent.attendees} total
                        {((selectedEvent as any).attendeesAdults || (selectedEvent as any).attendeesYouth || (selectedEvent as any).attendeesChildren) ? (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({(selectedEvent as any).attendeesAdults} ad. / {(selectedEvent as any).attendeesYouth} jóv. / {(selectedEvent as any).attendeesChildren} niños)
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Tipo:</span>
                      <span>{eventTypeLabels[selectedEvent.eventType]}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Contacto:</span>
                      <span>{selectedEvent.contactName}</span>
                    </div>
                    {selectedEvent.contactPhone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedEvent.contactPhone}</span>
                      </div>
                    )}
                    {selectedEvent.contactEmail && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedEvent.contactEmail}</span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedEvent.notes && (
                  <div className="p-3 rounded-md bg-muted">
                    <p className="text-sm whitespace-pre-wrap">{selectedEvent.notes}</p>
                  </div>
                )}

                {((selectedEvent as any).notasArmado || (selectedEvent as any).notasCocina ||
                  (selectedEvent as any).notasMantenimiento || (selectedEvent as any).notasHousekeeping) && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-sm font-semibold">Coordinación por área</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Armado",          value: (selectedEvent as any).notasArmado },
                        { label: "Cocina",          value: (selectedEvent as any).notasCocina },
                        { label: "Mantenimiento",   value: (selectedEvent as any).notasMantenimiento },
                        { label: "Housekeeping",    value: (selectedEvent as any).notasHousekeeping },
                      ].filter((a) => a.value).map((area) => (
                        <div key={area.label} className="rounded-md bg-muted p-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">{area.label}</p>
                          <p className="text-sm whitespace-pre-wrap">{area.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  {!isBefore(parseISO(selectedEvent.endDate), startOfDay(new Date())) && (<>
                    {selectedEvent.status !== "invoiced" && selectedEvent.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        onClick={handleOpenEdit}
                        data-testid="button-edit-event"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                    )}
                    {selectedEvent.status === "tentative" && (
                      <Button
                        onClick={() => {
                          updateEventMutation.mutate({ 
                            id: selectedEvent.id, 
                            data: { status: "confirmed" } 
                          });
                          setSelectedEvent({ ...selectedEvent, status: "confirmed" });
                        }}
                        data-testid="button-confirm-event"
                      >
                        Confirmar
                      </Button>
                    )}
                    {selectedEvent.status === "confirmed" && (
                      <Button
                        onClick={() => {
                          updateEventMutation.mutate({ 
                            id: selectedEvent.id, 
                            data: { status: "in_progress" } 
                          });
                          setSelectedEvent({ ...selectedEvent, status: "in_progress" });
                        }}
                        data-testid="button-start-event"
                      >
                        Iniciar
                      </Button>
                    )}
                    {selectedEvent.status === "in_progress" && (
                      <Button
                        onClick={() => {
                          updateEventMutation.mutate({ 
                            id: selectedEvent.id, 
                            data: { status: "completed" } 
                          });
                          setSelectedEvent({ ...selectedEvent, status: "completed" });
                        }}
                        data-testid="button-complete-event"
                      >
                        Completar
                      </Button>
                    )}
                    {(selectedEvent.status === "tentative" || selectedEvent.status === "confirmed") && (
                      <Button
                        variant="destructive"
                        onClick={() => setCancelConfirmOpen(true)}
                        data-testid="button-cancel-event"
                      >
                        Cancelar Evento
                      </Button>
                    )}
                    {selectedEvent.status !== "invoiced" && (
                      <Button
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => {
                          setEventToDelete(selectedEvent);
                          setSelectedEvent(null);
                          setTimeout(() => setDeleteEventConfirmOpen(true), 50);
                        }}
                        data-testid="button-delete-event"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </Button>
                    )}
                  </>)}
                  {canShowFolio(selectedEvent) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFolioReceiptType("");
                        setActiveTab("folio");
                      }}
                      data-testid="button-open-folio"
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      Folio / Facturar
                    </Button>
                  )}
                  {["pending", "tentative", "confirmed", "in_progress", "completed", "invoiced"].includes(selectedEvent.status) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/api/events/${selectedEvent.id}/pdf/hoja-funcion`, "_blank")}
                        data-testid="button-pdf-hoja-funcion"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Hoja de Función
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/api/events/${selectedEvent.id}/pdf/confirmacion`, "_blank")}
                        data-testid="button-pdf-confirmacion"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Confirmación Cliente
                      </Button>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="charges" className="space-y-4">
                {!eventsShiftActive && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <span className="text-base">⚠️</span>
                    <span>No hay un turno de caja activo para Eventos. Tomá el turno en Caja — Eventos antes de cargar cargos.</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Cargos del Evento</h4>
                  {selectedEvent.status !== "invoiced" && selectedEvent.status !== "cancelled" && (
                    <Button
                      size="sm"
                      disabled={!eventsShiftActive}
                      onClick={() => {
                        chargeForm.reset();
                        setIsChargeEditable(false);
                        setIsChargeDialogOpen(true);
                      }}
                      data-testid="button-add-charge"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Cargo
                    </Button>
                  )}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripcion</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Precio Unit. (c/IVA)</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedEvent.charges?.map((charge) => (
                      <TableRow key={charge.id}>
                        <TableCell>{charge.description}</TableCell>
                        <TableCell className="text-right">{charge.quantity}</TableCell>
                        <TableCell className="text-right">${charge.unitPrice}</TableCell>
                        <TableCell className="text-right font-medium">${charge.totalAmount}</TableCell>
                        <TableCell>
                          {selectedEvent.status !== "invoiced" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteChargeMutation.mutate(charge.id)}
                              data-testid={`button-delete-charge-${charge.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!selectedEvent.charges || selectedEvent.charges.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No hay cargos registrados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                <div className="flex justify-end border-t pt-4">
                  <div className="text-lg font-bold">
                    Total: ${fmtMoney(calculateEventTotal(selectedEvent))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">* Todos los precios incluyen IVA (21%).</p>
              </TabsContent>

              {/* Mesas Tab - only for table_event */}
              {selectedEvent.eventType === "table_event" && (
                <TabsContent value="tables" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Mesas del Evento</h4>
                    <div className="flex items-center gap-2">
                      {eventTables.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          data-testid="button-tables-summary-pdf"
                        >
                          <a
                            href={`/api/events/${selectedEvent.id}/tables-summary-pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Imprimir Resumen
                          </a>
                        </Button>
                      )}
                      {selectedEvent.status !== "invoiced" && selectedEvent.status !== "cancelled" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setNewTableNumber(eventTables.length + 1);
                            setNewTableLabel("");
                            setNewTableSeats(4);
                            setIsAddTableOpen(true);
                          }}
                          data-testid="button-add-table"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Agregar Mesa
                        </Button>
                      )}
                    </div>
                  </div>

                  {eventTables.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay mesas registradas. Agregue mesas para gestionar cargos individuales.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {eventTables.map((table) => {
                          const tCharges = table.charges.reduce((s, c) => s + parseFloat(c.total), 0);
                          const tPayments = table.payments.reduce((s, p) => s + parseFloat(p.amount), 0);
                          const tBalance = tCharges - tPayments;
                          return (
                            <Card
                              key={table.id}
                              className={`cursor-pointer hover-elevate ${table.status === "closed" || table.status === "invoiced" ? "opacity-70" : ""}`}
                              onClick={() => {
                                setSelectedTable(table);
                                setTableFolioReceiptType("");
                                setTableInvoiceCustomerName("");
                                setTableInvoiceCustomerCuit("");
                                setTableInvoiceCustomerDni("");
                                setIsTableFolioOpen(true);
                              }}
                              data-testid={`table-card-${table.id}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-bold text-lg">Mesa {table.tableNumber}</span>
                                  <div className="flex flex-col items-end gap-0.5">
                                    <Badge variant={table.status === "open" ? "default" : "secondary"}>
                                      {table.status === "open" ? "Abierta" : table.status === "invoiced" ? "Facturada" : "Cerrada"}
                                    </Badge>
                                    {table.ncId && (
                                      <Badge className="text-[10px] bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-100">
                                        NC Emitida
                                      </Badge>
                                    )}
                                    {table.invoiceRef && (
                                      <span className="text-xs text-muted-foreground font-mono leading-tight">
                                        {table.invoiceRef}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {table.label && <p className="text-sm text-muted-foreground mb-1">{table.label}</p>}
                                {table.seats && <p className="text-xs text-muted-foreground">{table.seats} asientos</p>}
                                <div className="mt-2 pt-2 border-t space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span>Cargos:</span>
                                    <span className="font-medium">${fmtMoney(tCharges)}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>Pagado:</span>
                                    <span className="font-medium">${fmtMoney(tPayments)}</span>
                                  </div>
                                  {tBalance > 0.01 && (
                                    <div className="flex justify-between text-sm text-red-600">
                                      <span>Saldo:</span>
                                      <span className="font-bold">${fmtMoney(tBalance)}</span>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                      <div className="border-t pt-4">
                        <h5 className="font-medium mb-2">Resumen General</h5>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Cargos</p>
                            <p className="text-xl font-bold">
                              ${fmtMoney(eventTables.reduce((s, t) => s + t.charges.reduce((sc, c) => sc + parseFloat(c.total), 0), 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Total Pagado</p>
                            <p className="text-xl font-bold">
                              ${fmtMoney(eventTables.reduce((s, t) => s + t.payments.reduce((sp, p) => sp + parseFloat(p.amount), 0), 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Mesas Abiertas</p>
                            <p className="text-xl font-bold">
                              {eventTables.filter(t => t.status === "open").length} / {eventTables.length}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>
              )}

              {/* Folio Tab */}
              <TabsContent value="folio" className="space-y-4">
                {selectedEvent.status === "invoiced" ? (
                  <div className="text-center py-6">
                    <div className="flex justify-end mb-2">
                      <a
                        href={`/api/folios/event/${selectedEvent.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                        data-testid="button-folio-pdf-invoiced"
                      >
                        <Download className="h-4 w-4" />
                        Imprimir Folio
                      </a>
                    </div>
                    <Receipt className="h-12 w-12 mx-auto text-purple-500 mb-3" />
                    <h4 className="font-bold text-lg">Evento Facturado</h4>
                    <p className="text-muted-foreground">
                      Comprobante: {selectedEvent.receiptType} | Cerrado: {selectedEvent.closedAt ? safeFormatDate(selectedEvent.closedAt, "d MMM yyyy HH:mm", { locale: es }) : ""}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-4 max-w-sm mx-auto">
                      <div>
                        <p className="text-sm text-muted-foreground">Total</p>
                        <p className="text-xl font-bold">${selectedEvent.totalAmount || "0.00"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Pagado</p>
                        <p className="text-xl font-bold text-green-600">${selectedEvent.totalPaid || "0.00"}</p>
                      </div>
                    </div>
                    {eventInvoice && (
                      <div className="mt-4 mx-auto max-w-sm p-3 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm text-left space-y-2" data-testid="event-invoice-badge">
                        <div className="flex items-center gap-2 font-semibold text-purple-800 dark:text-purple-200">
                          <FileText className="h-4 w-4 shrink-0" />
                          <span>
                            {eventInvoice.tipo_comprobante === "FA" ? "Factura A" : eventInvoice.tipo_comprobante === "FB" ? "Factura B" : eventInvoice.tipo_comprobante === "FC" ? "Factura C" : eventInvoice.tipo_comprobante}
                            {" "}
                            {String(eventInvoice.punto_venta ?? 1).padStart(4, "0")}-{String(eventInvoice.numero ?? 0).padStart(8, "0")}
                          </span>
                        </div>
                        {eventInvoice.cae && (
                          <p className="text-xs text-purple-700 dark:text-purple-300">
                            CAE: <span className="font-mono">{eventInvoice.cae}</span>
                          </p>
                        )}
                        {eventInvoice.cliente_razon_social && (
                          <p className="text-xs text-muted-foreground">Cliente: {eventInvoice.cliente_razon_social}</p>
                        )}
                        <a
                          href={`/api/billing/invoices/${selectedEvent.invoiceId}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" /> Ver factura PDF
                        </a>
                        {!selectedEvent.ncId && (
                          eventInvoice?.nota_credito_id != null ? (
                            <p className="text-xs text-muted-foreground italic text-center mt-1" data-testid="event-nc-already-exists">
                              Ya existe una NC para esta factura
                            </p>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="w-full mt-1"
                              disabled={emitEventNcMutation.isPending}
                              onClick={() => emitEventNcMutation.mutate({ eventId: selectedEvent.id })}
                              data-testid="button-emit-event-nc"
                            >
                              {emitEventNcMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Emitiendo NC...</>
                              ) : (
                                <><Ban className="h-4 w-4 mr-2" />Emitir NC (Anular Factura)</>
                              )}
                            </Button>
                          )
                        )}
                      </div>
                    )}
                    {eventNcInvoice && (() => {
                      const hasOriginal = eventNcInvoice.original_tipo && eventNcInvoice.original_numero != null;
                      const originalRef = hasOriginal
                        ? `${eventNcInvoice.original_tipo} ${String(eventNcInvoice.original_punto_venta || 1).padStart(4, "0")}-${String(eventNcInvoice.original_numero).padStart(8, "0")}`
                        : null;
                      const linkedOriginal = hasOriginal ? {
                        id: eventNcInvoice.nota_credito_id,
                        tipo_comprobante: eventNcInvoice.original_tipo,
                        numero: eventNcInvoice.original_numero,
                        punto_venta: eventNcInvoice.original_punto_venta,
                        fecha_emision: eventNcInvoice.original_fecha_emision,
                        monto_total: eventNcInvoice.original_monto_total,
                        cliente_razon_social: eventNcInvoice.original_cliente_razon_social,
                        cae: eventNcInvoice.original_cae,
                        modo_ficticio: eventNcInvoice.original_modo_ficticio,
                        estado: eventNcInvoice.original_estado,
                      } : null;
                      return (
                        <div className="mt-3 mx-auto max-w-sm p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm space-y-2" data-testid="event-nc-badge">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-200">
                              <Ban className="h-4 w-4 shrink-0" />
                              <span>
                                {eventNcInvoice.tipo_comprobante === "NCA" ? "Nota de Crédito A" : eventNcInvoice.tipo_comprobante === "NCB" ? "Nota de Crédito B" : eventNcInvoice.tipo_comprobante}
                                {" "}
                                {String(eventNcInvoice.punto_venta ?? 1).padStart(4, "0")}-{String(eventNcInvoice.numero ?? 0).padStart(8, "0")}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-red-700 dark:text-red-300 hover:text-red-900"
                              title="Ver detalle"
                              onClick={() => setSelectedInvoiceDetail({ invoice: eventNcInvoice, linkedNc: linkedOriginal })}
                              data-testid="button-event-nc-detail"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {originalRef && (
                            <p className="text-xs text-muted-foreground">
                              Factura Orig.: <span className="font-mono font-medium">{originalRef}</span>
                            </p>
                          )}
                          {eventNcInvoice.cae && (
                            <p className="text-xs text-red-700 dark:text-red-300">
                              CAE: <span className="font-mono">{eventNcInvoice.cae}</span>
                            </p>
                          )}
                          <a
                            href={`/api/billing/invoices/${selectedEvent.ncId}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" /> Ver NC PDF
                          </a>
                          <p className="text-xs text-red-700 dark:text-red-300 font-medium text-center" data-testid="event-nc-reversed-notice">
                            Este evento ha sido anulado. La factura original queda sin efecto.
                          </p>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full mt-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                              disabled={resetEventNcMutation.isPending}
                              onClick={() => resetEventNcMutation.mutate({ eventId: selectedEvent.id })}
                              data-testid="button-reset-event-nc"
                              title="Solo administradores — permite emitir una nueva NC si la anterior fue anulada"
                            >
                              {resetEventNcMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restableciendo...</>
                              ) : (
                                <><RotateCcw className="h-4 w-4 mr-2" />Restablecer estado NC (Admin)</>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : selectedEvent.status === "cancelled" ? (
                  <div className="text-center py-6 text-muted-foreground">
                    Evento cancelado - No se puede facturar
                  </div>
                ) : !canShowFolio(selectedEvent) ? (
                  <div className="text-center py-6 text-muted-foreground">
                    Confirme el evento para acceder al folio
                  </div>
                ) : (
                  <div className="space-y-4">
                  <div className="flex justify-end">
                    <a
                      href={`/api/folios/event/${selectedEvent.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                      data-testid="button-folio-pdf"
                    >
                      <Download className="h-4 w-4" />
                      Imprimir Folio
                    </a>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: Charges */}
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Cargos
                      </h4>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {selectedEvent.charges?.map((charge) => (
                          <div key={charge.id} className="flex items-center justify-between p-2 rounded border text-sm">
                            <div>
                              <span className="font-medium">{charge.description}</span>
                              <span className="text-muted-foreground ml-2">x{charge.quantity}</span>
                            </div>
                            <span className="font-medium">${charge.totalAmount}</span>
                          </div>
                        ))}
                        {eventFolioNdMovements.map((mov: any) => (
                          <div key={mov.id} className="flex items-center justify-between p-2 rounded border border-amber-200 text-sm bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-700" data-testid={`nd-movement-${mov.id}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 font-semibold shrink-0 bg-amber-50 text-amber-700 border-amber-400 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-700"
                              >
                                {mov.receiptType ?? "ND"}
                              </Badge>
                              <span className="truncate font-medium">{mov.description}</span>
                            </div>
                            <span className="font-medium shrink-0 ml-2">${parseFloat(mov.amount).toLocaleString()}</span>
                          </div>
                        ))}
                        {(!selectedEvent.charges || selectedEvent.charges.length === 0) && eventFolioNdMovements.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin cargos</p>
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t flex justify-between font-bold">
                        <span>Total Cargos:</span>
                        <span>${fmtMoney(calculateEventTotal(selectedEvent))}</span>
                      </div>
                    </div>

                    {/* Right: Payments */}
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Pagos
                      </h4>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {selectedEvent.payments?.map((payment: any) => {
                          const isAnulado = payment.status === "anulado";
                          return (
                          <div key={payment.id} className={`flex items-center justify-between p-2 rounded border text-sm ${isAnulado ? "opacity-50 bg-muted/30" : ""}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium ${isAnulado ? "line-through text-muted-foreground" : ""}`}>${payment.amount}</span>
                              <span className="text-muted-foreground">
                                {paymentMethodLabels[payment.method] || payment.method}
                              </span>
                              {isAnulado && <Badge variant="destructive" className="text-xs">ANULADO</Badge>}
                              {payment.isAdvance === "true" && !isAnulado && (
                                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">SEÑA</Badge>
                              )}
                            </div>
                            {!isAnulado && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => { setAnularEventPayTarget({ eventId: selectedEvent.id, payId: payment.id }); setAnularEventPayMotivo(""); }}
                              title="Anular pago"
                              data-testid={`button-anular-payment-${payment.id}`}
                            >
                              <Ban className="h-3 w-3 text-destructive" />
                            </Button>
                            )}
                          </div>
                          );
                        })}
                        {(!selectedEvent.payments || selectedEvent.payments.length === 0) && eventFolioVoidMovements.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin pagos</p>
                        )}
                        {eventFolioVoidMovements.map((mov: any) => (
                          <div key={mov.id} className="flex items-center justify-between p-2 rounded border border-orange-200 bg-orange-50/50 dark:bg-orange-900/10 dark:border-orange-700 text-sm" data-testid={`void-movement-${mov.id}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Badge className="text-[10px] shrink-0 bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-300">Anulación</Badge>
                              <span className="truncate text-muted-foreground">{mov.description || "Ajuste por Nota de Crédito"}</span>
                            </div>
                            <span className="font-medium text-orange-600 shrink-0 ml-2">−${parseFloat(mov.amount).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 pt-3 border-t space-y-3">
                        <div className="flex justify-between font-bold">
                          <span>Total Pagado:</span>
                          <span className="text-green-600">${fmtMoney(calculateEventPaid(selectedEvent))}</span>
                        </div>

                        <div className="flex justify-between font-bold text-lg">
                          <span>Saldo:</span>
                          <span className={calculateEventTotal(selectedEvent) - calculateEventPaid(selectedEvent) > 0.01 ? "text-red-600" : "text-green-600"}>
                            ${fmtMoney((calculateEventTotal(selectedEvent) - calculateEventPaid(selectedEvent)))}
                          </span>
                        </div>

                        {/* Add payment form */}
                        <div className="space-y-2 pt-2 border-t">
                          <p className="text-sm font-medium">Agregar Pago</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Monto"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              data-testid="input-payment-amount"
                            />
                            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                              <SelectTrigger data-testid="select-payment-method">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(paymentMethodLabels).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {paymentMethod === "room_charge" && (
                            <Select value={paymentReservationId} onValueChange={setPaymentReservationId}>
                              <SelectTrigger data-testid="select-payment-reservation">
                                <SelectValue placeholder="Seleccionar habitacion" />
                              </SelectTrigger>
                              <SelectContent>
                                {activeReservations.filter(r => r.id).map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    Hab. {r.room?.roomNumber || "?"} - {r.guest?.lastName} {r.guest?.firstName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {paymentMethod === "cuenta_corriente" && (
                            <div className="space-y-1 p-2 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                              <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
                                {selectedEvent?.companyId
                                  ? `Se cargará automáticamente a la empresa vinculada al evento.`
                                  : "¿A quién se carga?"}
                              </p>
                              {!selectedEvent?.companyId && (
                                <div className="flex gap-2">
                                  <Select value={paymentCcEntityType} onValueChange={(v) => { setPaymentCcEntityType(v as "company" | "agency"); setPaymentCcEntityId(""); }}>
                                    <SelectTrigger className="w-28" data-testid="select-cc-entity-type">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="company">Empresa</SelectItem>
                                      <SelectItem value="agency">Agencia</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Select value={paymentCcEntityId} onValueChange={setPaymentCcEntityId}>
                                    <SelectTrigger className="flex-1" data-testid="select-cc-entity">
                                      <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {paymentCcEntityType === "company"
                                        ? companies.filter((c: any) => c.id).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.razonSocial || c.nombreFantasia || c.name || c.id}</SelectItem>)
                                        : agencies.filter((a: any) => a.id).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.razonSocial || a.nombreFantasia || a.name || a.id}</SelectItem>)
                                      }
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={paymentIsAdvance}
                                onChange={(e) => setPaymentIsAdvance(e.target.checked)}
                                data-testid="checkbox-is-advance"
                              />
                              Seña / Anticipo
                            </label>
                          </div>
                          <Input
                            placeholder="Notas (opcional)"
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            data-testid="input-payment-notes"
                          />
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={handleAddPayment}
                            disabled={addPaymentMutation.isPending || !paymentAmount}
                            data-testid="button-add-payment"
                          >
                            {addPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Registrar Pago
                          </Button>
                        </div>

                        {/* Close event */}
                        <div className="space-y-2 pt-2 border-t">
                          <p className="text-sm font-medium">Cerrar Evento</p>
                          <Select value={folioReceiptType} onValueChange={(v) => {
                            setFolioReceiptType(v);
                            setInvoiceCustomerDni("");
                            if (["factura_a", "factura_b"].includes(v) && selectedEvent?.companyId) {
                              const company = (companies as Company[]).find(c => c.id === selectedEvent.companyId);
                              if (company) {
                                setInvoiceCustomerName(company.razonSocial || company.nombreFantasia || company.name || "");
                                setInvoiceCustomerCuit(v === "factura_a" ? (company.cuilCuit || "") : "");
                              } else {
                                setInvoiceCustomerName("");
                                setInvoiceCustomerCuit("");
                              }
                            } else {
                              setInvoiceCustomerName("");
                              setInvoiceCustomerCuit("");
                            }
                          }}>
                            <SelectTrigger data-testid="select-receipt-type">
                              <SelectValue placeholder="Tipo de comprobante" />
                            </SelectTrigger>
                            <SelectContent>
                              {receiptTypeOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {["factura_a", "factura_b", "factura_c"].includes(folioReceiptType) && (
                            <div className="space-y-2 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                              <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Datos del cliente para la factura AFIP</p>
                              <div>
                                <label className="text-xs text-muted-foreground">Razón Social / Nombre</label>
                                <Input
                                  placeholder={folioReceiptType === "factura_a" || folioReceiptType === "factura_c" ? "Razón social" : "Nombre y apellido"}
                                  value={invoiceCustomerName}
                                  onChange={(e) => setInvoiceCustomerName(e.target.value)}
                                  data-testid="input-invoice-customer-name"
                                />
                              </div>
                              {(folioReceiptType === "factura_a" || folioReceiptType === "factura_c") && (
                                <div>
                                  <label className="text-xs text-muted-foreground">CUIT</label>
                                  <Input
                                    placeholder="XX-XXXXXXXX-X"
                                    value={invoiceCustomerCuit}
                                    onChange={(e) => setInvoiceCustomerCuit(e.target.value)}
                                    data-testid="input-invoice-customer-cuit"
                                  />
                                </div>
                              )}
                              {folioReceiptType === "factura_b" && (
                                <div>
                                  <label className="text-xs text-muted-foreground">DNI (opcional)</label>
                                  <Input
                                    placeholder="DNI sin puntos"
                                    value={invoiceCustomerDni}
                                    onChange={(e) => setInvoiceCustomerDni(e.target.value)}
                                    data-testid="input-invoice-customer-dni"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          <Button
                            className="w-full"
                            variant="default"
                            disabled={
                              !folioReceiptType ||
                              calculateEventTotal(selectedEvent) - calculateEventPaid(selectedEvent) > 0.01 ||
                              (["factura_a", "factura_c"].includes(folioReceiptType) && !invoiceCustomerCuit.trim()) ||
                              closeEventMutation.isPending
                            }
                            onClick={handleCloseEvent}
                            data-testid="button-close-event"
                          >
                            {closeEventMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <Receipt className="h-4 w-4 mr-2" />
                            Facturar y Cerrar
                          </Button>
                          {calculateEventTotal(selectedEvent) - calculateEventPaid(selectedEvent) > 0.01 && (
                            <p className="text-xs text-red-500 text-center">
                              Debe saldar el balance para facturar
                            </p>
                          )}
                          {["factura_a", "factura_c"].includes(folioReceiptType) && !invoiceCustomerCuit.trim() && (
                            <p className="text-xs text-red-500 text-center" data-testid="cuit-required-msg">
                              El CUIT es obligatorio para Factura A/C
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog (T001) */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Evento</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estas seguro que queres cancelar el evento '{selectedEvent?.name}'? Esta accion marcara el evento como cancelado y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm-back">Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (selectedEvent) {
                  updateEventMutation.mutate({ 
                    id: selectedEvent.id, 
                    data: { status: "cancelled" } 
                  });
                  setSelectedEvent({ ...selectedEvent, status: "cancelled" });
                }
                setCancelConfirmOpen(false);
              }}
              data-testid="button-cancel-confirm-yes"
            >
              Si, cancelar evento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Event Confirmation Dialog */}
      <AlertDialog open={deleteEventConfirmOpen} onOpenChange={(open) => {
        setDeleteEventConfirmOpen(open);
        if (!open) setEventToDelete(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Evento</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro que querés eliminar el evento <strong>'{eventToDelete?.name}'</strong>? Esta acción borrará el evento y todos sus cargos de forma permanente. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-event-cancel">Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (eventToDelete) deleteEventMutation.mutate(eventToDelete.id); }}
              data-testid="button-delete-event-confirm"
            >
              {deleteEventMutation.isPending ? "Eliminando..." : "Sí, eliminar evento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Charge Dialog */}
      <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Cargo</DialogTitle>
            <DialogDescription>
              Seleccione un tipo de cargo. Use "Fuera de menú" para cargos con precio libre.
            </DialogDescription>
          </DialogHeader>
          <Form {...chargeForm}>
            <form onSubmit={chargeForm.handleSubmit(onSubmitCharge)} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <FormLabel>Tipo de Cargo</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      if (value === "fuera_de_menu") {
                        setIsChargeEditable(true);
                        chargeForm.setValue("chargeTypeId", "");
                        chargeForm.setValue("description", "");
                        chargeForm.setValue("unitPrice", "");
                      } else {
                        setIsChargeEditable(false);
                        chargeForm.setValue("chargeTypeId", value);
                        handleChargeTypeSelect(value);
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-charge-type">
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {chargeTypes.filter(ct => ct.isActive && ct.id).map((ct) => (
                        <SelectItem key={ct.id} value={ct.id}>
                          {ct.name} — ${ct.defaultPrice}
                        </SelectItem>
                      ))}
                      <SelectItem value="fuera_de_menu">Fuera de menú (libre)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <FormField
                  control={chargeForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripcion</FormLabel>
                      <FormControl>
                        <Input placeholder="Descripcion del cargo" {...field} disabled={!isChargeEditable} data-testid="input-charge-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={chargeForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cantidad</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            data-testid="input-charge-quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={chargeForm.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio Unit. <span className="text-xs font-normal text-muted-foreground">(con IVA incluido)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="0.00" {...field} disabled={!isChargeEditable} data-testid="input-charge-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={chargeForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notas adicionales" {...field} data-testid="input-charge-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsChargeDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createChargeMutation.isPending} data-testid="button-submit-charge">
                  {createChargeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Agregar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={isAddTableOpen} onOpenChange={setIsAddTableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar Mesa</DialogTitle>
            <DialogDescription>Defina los datos de la nueva mesa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Numero de Mesa</Label>
              <Input
                type="number"
                min={1}
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(parseInt(e.target.value) || 1)}
                data-testid="input-table-number"
              />
            </div>
            <div>
              <Label>Etiqueta (opcional)</Label>
              <Input
                value={newTableLabel}
                onChange={(e) => setNewTableLabel(e.target.value)}
                placeholder="Ej: VIP, Terraza..."
                data-testid="input-table-label"
              />
            </div>
            <div>
              <Label>Asientos</Label>
              <Input
                type="number"
                min={1}
                value={newTableSeats}
                onChange={(e) => setNewTableSeats(parseInt(e.target.value) || 1)}
                data-testid="input-table-seats"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddTableOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (selectedEvent) {
                  createTableMutation.mutate({
                    eventId: selectedEvent.id,
                    data: { tableNumber: newTableNumber, label: newTableLabel || null, seats: newTableSeats },
                  });
                }
              }}
              disabled={createTableMutation.isPending}
              data-testid="button-submit-table"
            >
              {createTableMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Folio Dialog */}
      <Dialog open={isTableFolioOpen} onOpenChange={(open) => { if (!open) { setIsTableFolioOpen(false); setSelectedTable(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Mesa {selectedTable?.tableNumber}
              {selectedTable?.label && <span className="text-muted-foreground font-normal">({selectedTable.label})</span>}
              <Badge variant={selectedTable?.status === "open" ? "default" : "secondary"}>
                {selectedTable?.status === "open" ? "Abierta" : selectedTable?.status === "invoiced" ? "Facturada" : "Cerrada"}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedTable?.seats && `${selectedTable.seats} asientos`}
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Charges */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Cargos
                </h4>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {selectedTable.charges.map((charge) => (
                    <div key={charge.id} className="flex items-center justify-between p-2 rounded border text-sm">
                      <div>
                        <span className="font-medium">{charge.description}</span>
                        <span className="text-muted-foreground ml-2">x{charge.quantity}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${charge.total}</span>
                        {selectedTable.status === "open" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => deleteTableChargeMutation.mutate({
                              eventId: selectedEvent!.id,
                              tableId: selectedTable.id,
                              chargeId: charge.id,
                            })}
                            data-testid={`button-delete-table-charge-${charge.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedTable.charges.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin cargos</p>
                  )}
                </div>

                {selectedTable.status === "open" && !eventsShiftActive && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      <span className="text-base">⚠️</span>
                      <span>Sin turno activo — tomá el turno en Caja — Eventos para agregar cargos.</span>
                    </div>
                  </div>
                )}
                {selectedTable.status === "open" && eventsShiftActive && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <p className="text-sm font-medium">Agregar Cargo</p>
                    <Select onValueChange={(val) => {
                      if (val === "fuera_de_menu") {
                        setIsTableChargeEditable(true);
                        setTableChargeDesc("");
                        setTableChargePrice("");
                      } else {
                        setIsTableChargeEditable(false);
                        const ct = chargeTypes.find(c => c.id === val);
                        if (ct) {
                          setTableChargeDesc(ct.name);
                          setTableChargePrice(ct.defaultPrice);
                        }
                      }
                    }}>
                      <SelectTrigger data-testid="select-table-charge-type">
                        <SelectValue placeholder="Seleccionar tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {chargeTypes.filter(ct => ct.isActive && ct.id).map(ct => (
                          <SelectItem key={ct.id} value={ct.id}>{ct.name} — ${ct.defaultPrice}</SelectItem>
                        ))}
                        <SelectItem value="fuera_de_menu">Fuera de menú (libre)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Descripcion"
                      value={tableChargeDesc}
                      onChange={(e) => setTableChargeDesc(e.target.value)}
                      disabled={!isTableChargeEditable}
                      data-testid="input-table-charge-desc"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Cant."
                        value={tableChargeQty}
                        onChange={(e) => setTableChargeQty(parseInt(e.target.value) || 1)}
                        data-testid="input-table-charge-qty"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Precio Unit."
                        value={tableChargePrice}
                        onChange={(e) => setTableChargePrice(e.target.value)}
                        disabled={!isTableChargeEditable}
                        data-testid="input-table-charge-price"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleAddTableCharge}
                      disabled={addTableChargeMutation.isPending || !tableChargeDesc || !tableChargePrice}
                      data-testid="button-add-table-charge"
                    >
                      {addTableChargeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Agregar Cargo
                    </Button>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t flex justify-between font-bold">
                  <span>Total Cargos:</span>
                  <span>${fmtMoney(selectedTable.charges.reduce((s, c) => s + parseFloat(c.total), 0))}</span>
                </div>
              </div>

              {/* Right: Payments */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pagos
                </h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {selectedTable.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-2 rounded border text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${payment.amount}</span>
                        <span className="text-muted-foreground">{paymentMethodLabels[payment.method] || payment.method}</span>
                        {payment.isAdvance === "true" && (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">SEÑA</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedTable.payments.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin pagos</p>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t space-y-3">
                  <div className="flex justify-between font-bold">
                    <span>Total Pagado:</span>
                    <span className="text-green-600">
                      ${fmtMoney(selectedTable.payments.reduce((s, p) => s + parseFloat(p.amount), 0))}
                    </span>
                  </div>
                  {(() => {
                    const tCharges = selectedTable.charges.reduce((s, c) => s + parseFloat(c.total), 0);
                    const tPaid = selectedTable.payments.reduce((s, p) => s + parseFloat(p.amount), 0);
                    const bal = tCharges - tPaid;
                    return (
                      <div className="flex justify-between font-bold text-lg">
                        <span>Saldo:</span>
                        <span className={bal > 0.01 ? "text-red-600" : "text-green-600"}>
                          ${fmtMoney(bal)}
                        </span>
                      </div>
                    );
                  })()}

                  {selectedTable.status !== "open" && (
                    <div className="pt-2 border-t space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Comprobante: <span className="font-medium">{selectedTable.receiptType || "—"}</span>
                        {selectedTable.closedAt && (
                          <> · Cerrada: {safeFormatDate(selectedTable.closedAt, "d MMM yyyy HH:mm", { locale: es })}</>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <a
                          href={`/api/events/${selectedEvent!.id}/tables/${selectedTable.id}/receipt-pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground"
                          data-testid="button-table-receipt-pdf"
                        >
                          <FileText className="h-4 w-4" />
                          Imprimir comprobante
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2"
                          data-testid="button-table-receipt-email"
                          onClick={() => {
                            setEmailReceiptAddress(selectedEvent?.contactEmail || "");
                            setIsEmailReceiptOpen(true);
                          }}
                        >
                          <Mail className="h-4 w-4" />
                          Enviar por email
                        </Button>
                      </div>
                      {tableInvoice && (
                        <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm space-y-2" data-testid="table-invoice-badge">
                          <div className="flex items-center gap-2 font-semibold text-purple-800 dark:text-purple-200">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span>
                              {tableInvoice.tipo_comprobante === "FA" ? "Factura A" : tableInvoice.tipo_comprobante === "FB" ? "Factura B" : tableInvoice.tipo_comprobante === "FC" ? "Factura C" : tableInvoice.tipo_comprobante}
                              {" "}
                              {String(tableInvoice.punto_venta ?? 1).padStart(4, "0")}-{String(tableInvoice.numero ?? 0).padStart(8, "0")}
                            </span>
                          </div>
                          {tableInvoice.cae && (
                            <p className="text-xs text-purple-700 dark:text-purple-300">
                              CAE: <span className="font-mono">{tableInvoice.cae}</span>
                            </p>
                          )}
                          {tableInvoice.cliente_razon_social && (
                            <p className="text-xs text-muted-foreground">Cliente: {tableInvoice.cliente_razon_social}</p>
                          )}
                          <a
                            href={`/api/billing/invoices/${selectedTable.invoiceId}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" /> Ver factura PDF
                          </a>
                          {!selectedTable.ncId && (
                            tableInvoice?.nota_credito_id != null ? (
                              <p className="text-xs text-muted-foreground italic text-center mt-1" data-testid="table-nc-already-exists">
                                Ya existe una NC para esta factura
                              </p>
                            ) : (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="w-full mt-1"
                                disabled={emitTableNcMutation.isPending}
                                onClick={() => emitTableNcMutation.mutate({ eventId: selectedEvent!.id, tableId: selectedTable.id })}
                                data-testid="button-emit-table-nc"
                              >
                                {emitTableNcMutation.isPending ? (
                                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Emitiendo NC...</>
                                ) : (
                                  <><Ban className="h-4 w-4 mr-2" />Emitir NC (Anular Factura)</>
                                )}
                              </Button>
                            )
                          )}
                        </div>
                      )}
                      {tableNcInvoice && (() => {
                        const hasOriginal = tableNcInvoice.original_tipo && tableNcInvoice.original_numero != null;
                        const originalRef = hasOriginal
                          ? `${tableNcInvoice.original_tipo} ${String(tableNcInvoice.original_punto_venta || 1).padStart(4, "0")}-${String(tableNcInvoice.original_numero).padStart(8, "0")}`
                          : null;
                        const linkedOriginal = hasOriginal ? {
                          id: tableNcInvoice.nota_credito_id,
                          tipo_comprobante: tableNcInvoice.original_tipo,
                          numero: tableNcInvoice.original_numero,
                          punto_venta: tableNcInvoice.original_punto_venta,
                          fecha_emision: tableNcInvoice.original_fecha_emision,
                          monto_total: tableNcInvoice.original_monto_total,
                          cliente_razon_social: tableNcInvoice.original_cliente_razon_social,
                          cae: tableNcInvoice.original_cae,
                          modo_ficticio: tableNcInvoice.original_modo_ficticio,
                          estado: tableNcInvoice.original_estado,
                        } : null;
                        return (
                        <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm space-y-2" data-testid="table-nc-badge">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-200">
                              <Ban className="h-4 w-4 shrink-0" />
                              <span>
                                {tableNcInvoice.tipo_comprobante === "NCA" ? "Nota de Crédito A" : tableNcInvoice.tipo_comprobante === "NCB" ? "Nota de Crédito B" : tableNcInvoice.tipo_comprobante}
                                {" "}
                                {String(tableNcInvoice.punto_venta ?? 1).padStart(4, "0")}-{String(tableNcInvoice.numero ?? 0).padStart(8, "0")}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-red-700 dark:text-red-300 hover:text-red-900"
                              title="Ver detalle"
                              onClick={() => setSelectedInvoiceDetail({ invoice: tableNcInvoice, linkedNc: linkedOriginal })}
                              data-testid="button-table-nc-detail"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {originalRef && (
                            <p className="text-xs text-muted-foreground">
                              Factura Orig.: <span className="font-mono font-medium">{originalRef}</span>
                            </p>
                          )}
                          {tableNcInvoice.cae && (
                            <p className="text-xs text-red-700 dark:text-red-300">
                              CAE: <span className="font-mono">{tableNcInvoice.cae}</span>
                            </p>
                          )}
                          <a
                            href={`/api/billing/invoices/${selectedTable.ncId}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" /> Ver NC PDF
                          </a>
                        </div>
                        );
                      })()}
                    </div>
                  )}

                  {selectedTable.status === "open" && (
                    <>
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-sm font-medium">Agregar Pago</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Monto"
                            value={tablePayAmount}
                            onChange={(e) => setTablePayAmount(e.target.value)}
                            data-testid="input-table-pay-amount"
                          />
                          <Select value={tablePayMethod} onValueChange={setTablePayMethod}>
                            <SelectTrigger data-testid="select-table-pay-method">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(paymentMethodLabels).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {tablePayMethod === "room_charge" && (
                          <Select value={tablePayResId} onValueChange={setTablePayResId}>
                            <SelectTrigger data-testid="select-table-pay-reservation">
                              <SelectValue placeholder="Seleccionar habitacion" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeReservations.filter(r => r.id).map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  Hab. {r.room?.roomNumber || "?"} - {r.guest?.lastName} {r.guest?.firstName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={tablePayAdvance}
                            onChange={(e) => setTablePayAdvance(e.target.checked)}
                            data-testid="checkbox-table-advance"
                          />
                          Seña / Anticipo
                        </label>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={handleAddTablePayment}
                          disabled={addTablePaymentMutation.isPending || !tablePayAmount}
                          data-testid="button-add-table-payment"
                        >
                          {addTablePaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Registrar Pago
                        </Button>
                      </div>

                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-sm font-medium">Cerrar Mesa</p>
                        <Select value={tableFolioReceiptType} onValueChange={(v) => {
                            setTableFolioReceiptType(v);
                            setTableInvoiceCustomerDni("");
                            if (["factura_a", "factura_b"].includes(v) && selectedEvent?.companyId) {
                              const company = (companies as Company[]).find(c => c.id === selectedEvent.companyId);
                              if (company) {
                                setTableInvoiceCustomerName(company.razonSocial || company.nombreFantasia || company.name || "");
                                setTableInvoiceCustomerCuit(v === "factura_a" ? (company.cuilCuit || "") : "");
                              } else {
                                setTableInvoiceCustomerName("");
                                setTableInvoiceCustomerCuit("");
                              }
                            } else {
                              setTableInvoiceCustomerName("");
                              setTableInvoiceCustomerCuit("");
                            }
                          }}>
                          <SelectTrigger data-testid="select-table-receipt-type">
                            <SelectValue placeholder="Tipo de comprobante" />
                          </SelectTrigger>
                          <SelectContent>
                            {receiptTypeOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {["factura_a", "factura_b", "factura_c"].includes(tableFolioReceiptType) && (
                          <div className="space-y-2 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                            <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Datos del cliente para la factura AFIP</p>
                            <div>
                              <label className="text-xs text-muted-foreground">Razón Social / Nombre</label>
                              <Input
                                placeholder={tableFolioReceiptType === "factura_b" ? "Nombre y apellido" : "Razón social"}
                                value={tableInvoiceCustomerName}
                                onChange={(e) => setTableInvoiceCustomerName(e.target.value)}
                                data-testid="input-table-invoice-customer-name"
                              />
                            </div>
                            {(tableFolioReceiptType === "factura_a" || tableFolioReceiptType === "factura_c") && (
                              <div>
                                <label className="text-xs text-muted-foreground">CUIT</label>
                                <Input
                                  placeholder="XX-XXXXXXXX-X"
                                  value={tableInvoiceCustomerCuit}
                                  onChange={(e) => setTableInvoiceCustomerCuit(e.target.value)}
                                  data-testid="input-table-invoice-customer-cuit"
                                />
                              </div>
                            )}
                            {tableFolioReceiptType === "factura_b" && (
                              <div>
                                <label className="text-xs text-muted-foreground">DNI (opcional)</label>
                                <Input
                                  placeholder="DNI sin puntos"
                                  value={tableInvoiceCustomerDni}
                                  onChange={(e) => setTableInvoiceCustomerDni(e.target.value)}
                                  data-testid="input-table-invoice-customer-dni"
                                />
                              </div>
                            )}
                          </div>
                        )}
                        <Button
                          className="w-full"
                          disabled={
                            !tableFolioReceiptType ||
                            selectedTable.charges.reduce((s, c) => s + parseFloat(c.total), 0) - 
                            selectedTable.payments.reduce((s, p) => s + parseFloat(p.amount), 0) > 0.01 ||
                            (["factura_a", "factura_c"].includes(tableFolioReceiptType) && !tableInvoiceCustomerCuit.trim()) ||
                            closeTableMutation.isPending
                          }
                          onClick={handleCloseTable}
                          data-testid="button-close-table"
                        >
                          {closeTableMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <Receipt className="h-4 w-4 mr-2" />
                          Cerrar Mesa
                        </Button>
                        {["factura_a", "factura_c"].includes(tableFolioReceiptType) && !tableInvoiceCustomerCuit.trim() && (
                          <p className="text-xs text-red-500 text-center" data-testid="table-cuit-required-msg">
                            El CUIT es obligatorio para Factura A/C
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Anular Pago Evento Dialog */}
      <Dialog open={anularEventPayTarget !== null} onOpenChange={(open) => {
        if (!open) { setAnularEventPayTarget(null); setAnularEventPayMotivo(""); }
      }}>
        <DialogContent className="w-[95vw] max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Anular Pago
            </DialogTitle>
            <DialogDescription>
              Esta acción anula el pago. Seguirá visible en el historial con estado ANULADO y no afectará los totales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="motivo-anular-evento">Motivo de anulación (opcional)</Label>
            <Textarea
              id="motivo-anular-evento"
              placeholder="Ej: Error de carga, duplicado..."
              value={anularEventPayMotivo}
              onChange={(e) => setAnularEventPayMotivo(e.target.value)}
              rows={3}
              data-testid="input-motivo-anular-evento"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAnularEventPayTarget(null); setAnularEventPayMotivo(""); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!anularEventPayTarget) return;
                anularEventPaymentMutation.mutate({ ...anularEventPayTarget, motivo: anularEventPayMotivo });
              }}
              disabled={anularEventPaymentMutation.isPending}
              data-testid="button-confirm-anular-evento"
            >
              {anularEventPaymentMutation.isPending ? "Anulando..." : "Confirmar Anulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog — shown when viewing an NC row */}
      <Dialog open={!!selectedInvoiceDetail} onOpenChange={(open) => { if (!open) setSelectedInvoiceDetail(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detalle del Comprobante
            </DialogTitle>
          </DialogHeader>
          {selectedInvoiceDetail && (() => {
            const { invoice: inv, linkedNc } = selectedInvoiceDetail;
            const formatNroLocal = (i: any) => `${String(i.punto_venta || 1).padStart(4, "0")}-${String(i.numero).padStart(8, "0")}`;
            const isNC = ["NCA","NCB","NCC","NCT","NCM"].includes(inv.tipo_comprobante);
            return (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Comprobante</span>
                    <span className="font-mono font-semibold">{inv.tipo_comprobante} {formatNroLocal(inv)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Fecha emisión</span>
                    <span className="text-sm">{inv.fecha_emision ? format(new Date(inv.fecha_emision), "dd/MM/yyyy") : "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Cliente</span>
                    <span className="text-sm text-right max-w-[200px]">{inv.cliente_razon_social || "Consumidor Final"}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-sm font-medium">{isNC ? "Total acreditado" : "Total facturado"}</span>
                    <span className="font-semibold">${parseFloat(inv.monto_total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {inv.cae && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">CAE</span>
                      <span className="text-xs font-mono">{inv.modo_ficticio ? <span className="text-amber-600">Ficticio</span> : inv.cae}</span>
                    </div>
                  )}
                </div>

                {/* Original factura section — shown when viewing an NC */}
                {isNC && linkedNc && (
                  <div className="rounded-lg border-2 border-blue-400/60 bg-blue-50 dark:bg-blue-900/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                        Factura Original Acreditada
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Comprobante</span>
                      <span className="font-mono font-bold text-base">{linkedNc.tipo_comprobante} {formatNroLocal(linkedNc)}</span>
                    </div>
                    {linkedNc.fecha_emision && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Fecha factura</span>
                        <span className="text-sm">{format(new Date(linkedNc.fecha_emision), "dd/MM/yyyy")}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t pt-2">
                      <span className="text-sm font-medium">Total original</span>
                      <span className="font-bold text-base text-blue-700 dark:text-blue-400">
                        ${parseFloat(linkedNc.monto_total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {linkedNc.estado && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Estado factura</span>
                        {linkedNc.estado === "anulada"
                          ? <Badge variant="destructive">ANULADA</Badge>
                          : linkedNc.estado === "parcial"
                            ? <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300">NC PARCIAL</Badge>
                            : <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300">Activa</Badge>
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.open(`/api/billing/invoices/${selectedInvoiceDetail?.invoice.id}/pdf`, "_blank")}>
              <Download className="h-4 w-4 mr-2" />Descargar PDF
            </Button>
            <Button onClick={() => setSelectedInvoiceDetail(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email receipt dialog */}
      <Dialog open={isEmailReceiptOpen} onOpenChange={(open) => { if (!open) setIsEmailReceiptOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Enviar comprobante por email
            </DialogTitle>
            <DialogDescription>
              El PDF del comprobante de{" "}
              {selectedTable ? `Mesa ${selectedTable.tableNumber}${selectedTable.label ? ` – ${selectedTable.label}` : ""}` : "la mesa"}{" "}
              se enviará como adjunto al destinatario indicado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="email-receipt-address">Dirección de email</Label>
              <Input
                id="email-receipt-address"
                type="email"
                placeholder="ejemplo@dominio.com"
                value={emailReceiptAddress}
                onChange={(e) => setEmailReceiptAddress(e.target.value)}
                data-testid="input-email-receipt-address"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && emailReceiptAddress.trim() && selectedEvent && selectedTable) {
                    sendTableReceiptEmailMutation.mutate({
                      eventId: selectedEvent.id,
                      tableId: selectedTable.id,
                      to: emailReceiptAddress,
                    });
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailReceiptOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!emailReceiptAddress.trim() || sendTableReceiptEmailMutation.isPending}
              data-testid="button-send-receipt-email-confirm"
              onClick={() => {
                if (selectedEvent && selectedTable) {
                  sendTableReceiptEmailMutation.mutate({
                    eventId: selectedEvent.id,
                    tableId: selectedTable.id,
                    to: emailReceiptAddress,
                  });
                }
              }}
            >
              {sendTableReceiptEmailMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Enviar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
