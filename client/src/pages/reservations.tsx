import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/App";
import { getLocalToday, formatDateAR, toArgentinaDateStr, fmtMoney } from "@/lib/utils";
import {
  CalendarCheck,
  CalendarRange,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Pencil,
  Eye,
  Calendar,
  User,
  DoorOpen,
  X,
  Check,
  LogIn,
  LogOut,
  Copy,
  ArrowRightLeft,
  Sunrise,
  Sunset,
  DollarSign,
  History,
  Lock,
  Ban,
  AlertTriangle,
  ShoppingCart,
  XCircle,
  FileText,
  Users2,
  Ticket,
  Gift,
  PlusCircle,
  Globe,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Trash2,
  UserCheck,
  Loader2,
  Link2,
  TrendingUp,
  Phone,
  AlertCircle,
  Clock,
  Undo2,
  Heart,
} from "lucide-react";
import { EmitirFacturaDialog, NotaCreditoDialog, type EmitirFacturaInitialValues } from "./billing";
import { PrefacturaDialog } from "@/components/PrefacturaDialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmitirComprobanteButton } from "@/components/emitir-comprobante-button";
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
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GuestSelector, CompanySelector, AgencySelector, NationalityCombobox } from "@/components/entity-selector";
import type { ReservationWithDetails, Guest, Company, Agency, RoomWithType, RoomType, RatePlan, InsertReservation, InsertGuest, InsertCompany, InsertAgency, ReservationStatus, DiscountType, ReservationSource, Charge, Payment, PaymentMethod, BedType, Package } from "@shared/schema";

function parseReservationError(error: any): string {
  try {
    const raw = error?.message || "";
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.substring(jsonStart));
      return parsed.error || parsed.message || "Error desconocido";
    }
  } catch {}
  return "No se pudo completar la operación. Intente nuevamente.";
}

const VALID_STATUSES: ReservationStatus[] = ["tentative", "pending", "confirmed", "web_checkin", "checked_in", "checked_out", "cancelled"];
const normalizeStatus = (s: string | null | undefined): ReservationStatus =>
  VALID_STATUSES.includes(s as ReservationStatus) ? (s as ReservationStatus) : "confirmed";

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const statusConfig: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative:   { label: "Confirmada",   variant: "default" },
    pending:     { label: "Confirmada",   variant: "default" },
    confirmed:   { label: "Confirmada",   variant: "default" },
    web_checkin: { label: "Pre Check-In", variant: "default" },
    checked_in:  { label: "Check-in",     variant: "default" },
    checked_out: { label: "Check-out",    variant: "outline" },
    cancelled:   { label: "Cancelada",    variant: "destructive" },
  };

  const config = statusConfig[status] || { label: "Sin estado", variant: "outline" as const };

  return (
    <Badge variant={config.variant} title={!statusConfig[status] ? "Estado inválido — abrir Editar y guardar para corregir" : undefined}>
      {config.label}
    </Badge>
  );
}

export function ReservationFormDialog({
  reservation,
  guests,
  rooms,
  roomTypes,
  open,
  onOpenChange,
  onSuccess,
  defaultValues,
}: {
  reservation?: ReservationWithDetails;
  guests: Guest[];
  rooms: RoomWithType[];
  roomTypes: RoomType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultValues?: {
    roomId?: string;
    roomTypeId?: string;
    checkInDate?: string;
  };
}) {
  const { toast } = useToast();
  const isEditing = !!reservation;

  const sectionCardClass = (isComplete: boolean, isRequired: boolean): string => {
    if (isComplete) return "border-green-500 bg-green-50 dark:bg-green-950/30 dark:border-green-700 transition-colors";
    if (isRequired) return "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600 transition-colors";
    return "transition-colors";
  };

  const today = getLocalToday();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(
    reservation?.guest || null
  );
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(
    reservation?.company || null
  );
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(
    reservation?.agency || null
  );

  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(reservation?.room?.roomTypeId || reservation?.roomTypeId || defaultValues?.roomTypeId || "");
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");

  const { data: maintenanceBlocks = [] } = useQuery<{ roomId: string; blockFrom: string; blockTo: string }[]>({
    queryKey: ["/api/maintenance/blocks"],
    enabled: open,
  });

  const { data: allReservationsForFilter = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations"],
    enabled: open,
  });

  // Cargos adicionales al crear — cargados desde la BD
  const { data: chargeTypesData = [] } = useQuery<{ id: string; label: string; description: string; defaultAmount: string; category: string; allowPriceEdit: boolean; allowRecurring: boolean }[]>({
    queryKey: ["/api/charge-types"],
  });
  const newResChargePresets = [
    ...chargeTypesData.map(ct => ({ label: ct.label, description: ct.description, amount: String(ct.defaultAmount), category: ct.category as any, allowPriceEdit: ct.allowPriceEdit ?? false, allowRecurring: ct.allowRecurring ?? false })),
    { label: "Cargo personalizado", description: "", amount: "", category: "otros" as const, allowPriceEdit: true, allowRecurring: false },
  ];
  const [pendingCharges, setPendingCharges] = useState<Array<{ description: string; amount: string; category: string; quantity: number }>>([]);
  const [showResChargeForm, setShowResChargeForm] = useState(false);
  const [resChargePreset, setResChargePreset] = useState("");
  const [resChargeDesc, setResChargeDesc] = useState("");
  const [resChargeAmount, setResChargeAmount] = useState("");
  const [resChargeQty, setResChargeQty] = useState(1);
  const [resChargeRecurring, setResChargeRecurring] = useState(false);
  const [resChargeCategory, setResChargeCategory] = useState("otros");
  const [hasVoucher, setHasVoucher] = useState(!!(reservation?.voucherCode || reservation?.voucherNotes));

  type PendingCompanion = { firstName: string; lastName: string; documentType: string; documentNumber: string; dateOfBirth: string; nationality: string; guestId?: string | null };
  const emptyCompanion: PendingCompanion = { firstName: "", lastName: "", documentType: "DNI", documentNumber: "", dateOfBirth: "", nationality: "", guestId: null };
  const [pendingCompanions, setPendingCompanions] = useState<PendingCompanion[]>([]);
  const [showCompanionForm, setShowCompanionForm] = useState(false);
  const [pendingCompMode, setPendingCompMode] = useState<"search" | "new">("search");
  const [pendingCompQ, setPendingCompQ] = useState("");
  const [pendingCompHits, setPendingCompHits] = useState<{ id: string; firstName: string; lastName: string; documentNumber?: string | null }[]>([]);
  const [pendingCompSearching, setPendingCompSearching] = useState(false);
  const [newCompForm, setNewCompForm] = useState<PendingCompanion>(emptyCompanion);
  const [isUpgrade, setIsUpgrade] = useState(!!(reservation?.isUpgrade));
  const [adjacentWarning, setAdjacentWarning] = useState<{ type: "early" | "late"; code: string; pendingValue: boolean } | null>(null);

  const [formData, setFormData] = useState<Partial<InsertReservation>>({
    reservationCode: reservation?.reservationCode || "",
    guestId: reservation?.guestId || "",
    companyId: reservation?.companyId || "",
    agencyId: reservation?.agencyId || "",
    roomTypeId: reservation?.room?.roomTypeId || reservation?.roomTypeId || defaultValues?.roomTypeId || "",
    roomId: reservation?.roomId || reservation?.room?.id || defaultValues?.roomId || "",
    ratePlanId: (reservation?.specialRateReason && !reservation?.ratePlanId) ? "__special__" : (reservation?.ratePlanId || ""),
    specialRateReason: reservation?.specialRateReason || "",
    checkInDate: reservation?.checkInDate || defaultValues?.checkInDate || today,
    checkOutDate: reservation?.checkOutDate || (() => {
      if (defaultValues?.checkInDate) {
        const d = new Date(defaultValues.checkInDate + "T12:00:00");
        d.setDate(d.getDate() + 1);
        return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      }
      return tomorrow;
    })(),
    nights: reservation?.nights || 1,
    numberOfGuests: reservation?.numberOfGuests || 1,
    status: reservation ? normalizeStatus(reservation.status) : "confirmed",
    source: reservation?.source || "directo",
    discountType: reservation?.discountType || "none",
    discountValue: reservation?.discountValue || "0",
    baseRatePerNight: reservation?.baseRatePerNight || "",
    finalRatePerNight: reservation?.finalRatePerNight || "",
    totalRoomAmount: reservation?.totalRoomAmount || "",
    bedTypeId: reservation?.bedTypeId || null,
    bedTypeNotes: reservation?.bedTypeNotes || "",
    earlyCheckIn: reservation?.earlyCheckIn || false,
    earlyCheckInTime: reservation?.earlyCheckInTime || "",
    earlyCheckInCharge: reservation?.earlyCheckInCharge || "",
    lateCheckOut: reservation?.lateCheckOut || false,
    lateCheckOutTime: reservation?.lateCheckOutTime || "",
    lateCheckOutCharge: reservation?.lateCheckOutCharge || "",
    notes: reservation?.notes || "",
    contactName: reservation?.contactName || "",
    contactPhone: reservation?.contactPhone || "",
    voucherCode: reservation?.voucherCode || "",
    voucherNotes: reservation?.voucherNotes || "",
    isUpgrade: reservation?.isUpgrade || false,
    originalRoomTypeId: reservation?.originalRoomTypeId || "",
    createdAt: reservation?.createdAt || new Date().toISOString(),
  });

  useEffect(() => {
    if (open) {
      setSelectedGuest(reservation?.guest || null);
      setSelectedCompany(reservation?.company || null);
      setSelectedAgency(reservation?.agency || null);
      setSelectedRoomTypeId(reservation?.room?.roomTypeId || reservation?.roomTypeId || defaultValues?.roomTypeId || "");
      setFormData({
        reservationCode: reservation?.reservationCode || "",
        guestId: reservation?.guestId || "",
        companyId: reservation?.companyId || "",
        agencyId: reservation?.agencyId || "",
        roomTypeId: reservation?.room?.roomTypeId || reservation?.roomTypeId || defaultValues?.roomTypeId || "",
        roomId: reservation?.roomId || reservation?.room?.id || defaultValues?.roomId || "",
        ratePlanId: (reservation?.specialRateReason && !reservation?.ratePlanId) ? "__special__" : (reservation?.ratePlanId || ""),
        specialRateReason: reservation?.specialRateReason || "",
        checkInDate: reservation?.checkInDate || defaultValues?.checkInDate || today,
        checkOutDate: reservation?.checkOutDate || (() => {
          if (defaultValues?.checkInDate) {
            const d = new Date(defaultValues.checkInDate + "T12:00:00");
            d.setDate(d.getDate() + 1);
            return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
          }
          return tomorrow;
        })(),
        nights: reservation?.nights || 1,
        numberOfGuests: reservation?.numberOfGuests || 1,
        status: reservation ? normalizeStatus(reservation.status) : "confirmed",
        source: reservation?.source || "directo",
        discountType: reservation?.discountType || "none",
        discountValue: reservation?.discountValue || "0",
        baseRatePerNight: reservation?.baseRatePerNight || "",
        finalRatePerNight: reservation?.finalRatePerNight || "",
        totalRoomAmount: reservation?.totalRoomAmount || "",
        bedTypeId: reservation?.bedTypeId || null,
        bedTypeNotes: reservation?.bedTypeNotes || "",
        earlyCheckIn: reservation?.earlyCheckIn || false,
        earlyCheckInTime: reservation?.earlyCheckInTime || "",
        earlyCheckInCharge: reservation?.earlyCheckInCharge || "",
        lateCheckOut: reservation?.lateCheckOut || false,
        lateCheckOutTime: reservation?.lateCheckOutTime || "",
        lateCheckOutCharge: reservation?.lateCheckOutCharge || "",
        notes: reservation?.notes || "",
        contactName: reservation?.contactName || "",
        contactPhone: reservation?.contactPhone || "",
        voucherCode: reservation?.voucherCode || "",
        voucherNotes: reservation?.voucherNotes || "",
        isUpgrade: reservation?.isUpgrade || false,
        originalRoomTypeId: reservation?.originalRoomTypeId || "",
        createdAt: reservation?.createdAt || new Date().toISOString(),
      });
      setPendingCharges([]);
      setShowResChargeForm(false);
      setResChargePreset("");
      setResChargeDesc("");
      setResChargeAmount("");
      setResChargeQty(1);
      setHasVoucher(!!(reservation?.voucherCode || reservation?.voucherNotes));
      setIsUpgrade(!!(reservation?.isUpgrade));
      setPendingCompanions([]);
      setShowCompanionForm(false);
      setNewCompForm(emptyCompanion);
    }
  }, [open, reservation?.id, defaultValues?.roomId, defaultValues?.roomTypeId, defaultValues?.checkInDate]);

  const createGuestMutation = useMutation({
    mutationFn: async (guest: InsertGuest): Promise<Guest> => {
      const res = await apiRequest("POST", "/api/guests", guest);
      return res.json();
    },
    onSuccess: (newGuest: Guest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      setSelectedGuest(newGuest);
      setFormData((prev) => ({ ...prev, guestId: newGuest.id }));
      toast({
        title: "Huesped creado",
        description: `${newGuest.lastName} ${newGuest.firstName} ha sido registrado.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear el huesped.",
        variant: "destructive",
      });
    },
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (company: InsertCompany): Promise<Company> => {
      const res = await apiRequest("POST", "/api/companies", company);
      return res.json();
    },
    onSuccess: (newCompany: Company) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setSelectedCompany(newCompany);
      setFormData((prev) => ({ ...prev, companyId: newCompany.id }));
      toast({
        title: "Empresa creada",
        description: `${newCompany.razonSocial} ha sido registrada.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la empresa.",
        variant: "destructive",
      });
    },
  });

  const createAgencyMutation = useMutation({
    mutationFn: async (agency: InsertAgency): Promise<Agency> => {
      const res = await apiRequest("POST", "/api/agencies", agency);
      return res.json();
    },
    onSuccess: (newAgency: Agency) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agencies"] });
      setSelectedAgency(newAgency);
      setFormData((prev) => ({ ...prev, agencyId: newAgency.id }));
      toast({
        title: "Agencia creada",
        description: `${newAgency.razonSocial} ha sido registrada.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la agencia.",
        variant: "destructive",
      });
    },
  });

  const { data: ratePlansRaw } = useQuery<RatePlan[]>({
    queryKey: ["/api/rate-plans/by-room-type", selectedRoomTypeId],
    queryFn: async () => {
      if (!selectedRoomTypeId) return [];
      const res = await fetch(`/api/rate-plans/by-room-type/${selectedRoomTypeId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedRoomTypeId,
  });

  // Filtra planes vencidos: si validTo existe y es anterior a la fecha de check-in, se excluye
  const ratePlans = ratePlansRaw?.filter(rp => {
    if (rp.validTo && formData.checkInDate && rp.validTo < formData.checkInDate) return false;
    return true;
  });

  const { data: bedTypes } = useQuery<BedType[]>({
    queryKey: ["/api/bed-types"],
  });

  const { data: activePackages } = useQuery<Package[]>({
    queryKey: ["/api/packages/active"],
  });

  // Preferencias del huésped seleccionado (solo lectura, para mostrarlo en el form)
  const selectedGuestIdForPrefs = formData.guestId;
  const { data: selectedGuestPrefs } = useQuery<any[]>({
    queryKey: ["/api/guests", selectedGuestIdForPrefs, "preferences"],
    queryFn: () => fetch(`/api/guests/${selectedGuestIdForPrefs}/preferences`).then(r => r.json()),
    enabled: !!selectedGuestIdForPrefs,
  });

  const { data: generatedCode } = useQuery<{ code: string }>({
    queryKey: ["/api/reservations/generate-code"],
    enabled: !isEditing && !formData.reservationCode,
  });

  const calculateNights = (checkIn: string, checkOut: string) => {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff; // can be 0 or negative — used for validation
  };

  const calculateTotals = (baseRate: string, discountType: DiscountType, discountValue: string, nights: number) => {
    const base = parseFloat(baseRate) || 0;
    const discount = parseFloat(discountValue) || 0;
    
    let finalRate = base;
    if (discountType === "percent") {
      finalRate = base - (base * discount / 100);
    } else if (discountType === "fixed") {
      finalRate = base - discount;
    }
    finalRate = Math.max(0, finalRate);
    
    return {
      finalRatePerNight: finalRate.toFixed(2),
      totalRoomAmount: (finalRate * nights).toFixed(2),
    };
  };

  const handleRoomTypeChange = (roomTypeId: string) => {
    setSelectedRoomTypeId(roomTypeId);
    // Si hay un paquete activo, recalcular precio para el nuevo tipo de habitación
    if (selectedPackageId && activePackages) {
      const pkg = activePackages.find(p => p.id === selectedPackageId);
      if (pkg) {
        const roomPrice = pkg.roomPrices?.find((rp: any) => rp.roomTypeId === roomTypeId);
        const totalPrice = parseFloat(roomPrice ? roomPrice.price : pkg.basePrice);
        const nights = Number(formData.nights) || pkg.nights || 1;
        const ratePerNight = (totalPrice / nights).toFixed(2);
        setFormData({
          ...formData,
          roomTypeId,
          roomId: "",
          ratePlanId: "",
          baseRatePerNight: ratePerNight,
          finalRatePerNight: ratePerNight,
          totalRoomAmount: totalPrice.toFixed(2),
        });
        return;
      }
    }
    setFormData({ 
      ...formData, 
      roomTypeId, 
      roomId: "", 
      ratePlanId: "",
      baseRatePerNight: "",
      finalRatePerNight: "",
      totalRoomAmount: "",
    });
  };

  const getPaxRate = (plan: any, numGuests: number) => {
    const paxRateMap: Record<number, string | null | undefined> = {
      1: plan.rate1pax,
      2: plan.rate2pax,
      3: plan.rate3pax,
      4: plan.rate4pax,
    };
    return paxRateMap[numGuests] || plan.baseRate;
  };

  const handleRatePlanChange = (ratePlanId: string) => {
    if (ratePlanId === "__special__") {
      setFormData({ ...formData, ratePlanId: "__special__", specialRateReason: formData.specialRateReason || "" });
      return;
    }
    const plan = ratePlans?.find(p => p.id === ratePlanId);
    if (plan) {
      const nights = calculateNights(formData.checkInDate || today, formData.checkOutDate || tomorrow);
      const rate = getPaxRate(plan, parseInt(String(formData.numberOfGuests)) || 2);
      const totals = calculateTotals(rate, formData.discountType as DiscountType, formData.discountValue || "0", nights);
      setFormData({ 
        ...formData, 
        ratePlanId, 
        specialRateReason: "",
        baseRatePerNight: rate,
        ...totals,
      });
    }
  };

  const handleDateChange = (field: "checkInDate" | "checkOutDate", value: string) => {
    let newCheckIn = field === "checkInDate" ? value : formData.checkInDate || today;
    let newCheckOut = field === "checkOutDate" ? value : formData.checkOutDate || tomorrow;
    // Auto-advance checkout if checkin moves past it
    if (field === "checkInDate" && newCheckOut && value >= newCheckOut) {
      const next = new Date(value + "T12:00:00");
      next.setDate(next.getDate() + 1);
      newCheckOut = next.toISOString().split("T")[0];
    }
    const nights = calculateNights(newCheckIn, newCheckOut);
    const totals = calculateTotals(
      formData.baseRatePerNight || "0",
      formData.discountType as DiscountType,
      formData.discountValue || "0",
      Math.max(0, nights)
    );
    setFormData({ ...formData, [field === "checkInDate" ? "checkInDate" : "checkOutDate"]: value, checkInDate: newCheckIn, checkOutDate: newCheckOut, nights, ...totals });
  };

  const handleDiscountChange = (discountType?: DiscountType, discountValue?: string) => {
    const nights = calculateNights(formData.checkInDate || today, formData.checkOutDate || tomorrow);
    const totals = calculateTotals(
      formData.baseRatePerNight || "0",
      discountType || formData.discountType as DiscountType,
      discountValue !== undefined ? discountValue : formData.discountValue || "0",
      nights
    );
    setFormData({ 
      ...formData, 
      ...(discountType !== undefined && { discountType }),
      ...(discountValue !== undefined && { discountValue }),
      ...totals,
    });
  };

  const handleBaseRateChange = (newBaseRate: string) => {
    const nights = calculateNights(formData.checkInDate || today, formData.checkOutDate || tomorrow);
    const totals = calculateTotals(
      newBaseRate,
      formData.discountType as DiscountType,
      formData.discountValue || "0",
      nights
    );
    setFormData({ 
      ...formData, 
      baseRatePerNight: newBaseRate,
      ...totals,
    });
  };

  const mutation = useMutation({
    mutationFn: async (data: Partial<InsertReservation>) => {
      if (isEditing) {
        const res = await apiRequest("PATCH", `/api/reservations/${reservation.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/reservations", {
        ...data,
        reservationCode: data.reservationCode || generatedCode?.code || `RES-${Date.now()}`,
      });
      const created = await res.json();
      // Reservation is confirmed in DB at this point.
      // Charges and companions are secondary operations — if they fail, the reservation
      // must still appear in the board. Errors here are shown as warnings without
      // rolling back the already-saved reservation.
      if (pendingCharges.length > 0) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        try {
          for (const charge of pendingCharges) {
            const totalAmt = (parseFloat(charge.amount) * charge.quantity).toFixed(2);
            await apiRequest("POST", "/api/charges", {
              description: charge.description,
              amount: totalAmt,
              category: charge.category,
              reservationId: created.id,
              date: todayStr,
            });
          }
        } catch {
          toast({
            title: "Reserva creada — cargos pendientes",
            description: "La reserva fue guardada pero no se pudieron agregar los cargos adicionales. Podés agregarlos desde el folio.",
            variant: "destructive",
            duration: 8000,
          });
        }
      }
      if (pendingCompanions.length > 0) {
        try {
          for (const comp of pendingCompanions) {
            const body: any = { ...comp, reservationId: created.id };
            if (!body.dateOfBirth) delete body.dateOfBirth;
            await apiRequest("POST", `/api/reservations/${created.id}/companions`, body);
          }
        } catch {
          toast({
            title: "Reserva creada — acompañantes pendientes",
            description: "La reserva fue guardada pero no se pudieron registrar los acompañantes. Podés agregarlos desde la reserva.",
            variant: "destructive",
            duration: 8000,
          });
        }
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      if (isEditing && reservation?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservation.id] });
      }
      toast({
        title: isEditing ? "Reserva actualizada" : "Reserva creada",
        description: `La reserva ha sido ${isEditing ? "actualizada" : "creada"} exitosamente.`,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => {
      let message = "No se pudo guardar la reserva. Intente nuevamente.";
      try {
        const text = error?.message || "";
        const jsonStart = text.indexOf("{");
        if (jsonStart >= 0) {
          const parsed = JSON.parse(text.substring(jsonStart));
          message = parsed.error || message;
        }
      } catch {}
      toast({
        title: isEditing ? "Error al actualizar la reserva" : "Error al crear la reserva",
        description: message,
        variant: "destructive",
        duration: 8000,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalGuestId = formData.guestId || reservation?.guestId || "";
    if (!finalGuestId) {
      toast({ title: "Huésped requerido", description: "Seleccioná o creá un huésped antes de guardar.", variant: "destructive" });
      return;
    }
    const finalRoomId = formData.roomId || reservation?.roomId || "";
    if (!finalRoomId) {
      toast({ title: "Habitación requerida", description: "Seleccioná un tipo y habitación antes de guardar.", variant: "destructive" });
      return;
    }
    // Date validation: checkout must be strictly after checkin
    const ci = formData.checkInDate || "";
    const co = formData.checkOutDate || "";
    if (!ci || !co || co <= ci) {
      toast({ title: "Fechas inválidas", description: "La fecha de Check-out debe ser posterior al Check-in.", variant: "destructive" });
      return;
    }
    if (formData.ratePlanId === "__special__" && !formData.specialRateReason?.trim()) {
      toast({ title: "Motivo requerido", description: "Ingrese el motivo de la tarifa especial para guardar.", variant: "destructive" });
      return;
    }
    mutation.mutate({
      ...formData,
      ratePlanId: formData.ratePlanId === "__special__" ? null : (formData.ratePlanId || null),
      specialRateReason: formData.ratePlanId === "__special__" ? (formData.specialRateReason || null) : null,
      roomId: finalRoomId,
      roomTypeId: formData.roomTypeId || reservation?.roomTypeId || "",
      guestId: finalGuestId,
      bedTypeId: formData.bedTypeId || null,
      nights: Number(formData.nights),
      numberOfGuests: Number(formData.numberOfGuests),
      baseRatePerNight: String(formData.baseRatePerNight || "0"),
      finalRatePerNight: String(formData.finalRatePerNight || "0"),
      totalRoomAmount: String(formData.totalRoomAmount || "0"),
      discountValue: String(formData.discountValue || "0"),
    });
  };

  const hasMaintenanceBlockConflict = (roomId: string) => {
    const checkIn = formData.checkInDate || today;
    const checkOut = formData.checkOutDate || tomorrow;
    return maintenanceBlocks.some(
      blk => blk.roomId === roomId && blk.blockFrom < checkOut && blk.blockTo > checkIn
    );
  };

  const blockedRoomIdsByReservation = new Set(
    allReservationsForFilter
      .filter(r => {
        const checkIn = formData.checkInDate || today;
        const checkOut = formData.checkOutDate || tomorrow;
        const thisResId = reservation?.id;
        return (
          r.roomId &&
          r.id !== thisResId &&
          ["confirmed", "checked_in", "web_checkin", "pending", "reserved"].includes(r.status) &&
          r.checkInDate < checkOut &&
          r.checkOutDate > checkIn
        );
      })
      .map((r: any) => r.roomId)
  );

  const availableRooms = isUpgrade
    ? rooms.filter((r) => {
        if ((r as any).isVirtual) return false;
        if (r.isActive === false) return false;
        if (blockedRoomIdsByReservation.has(r.id)) return false;
        if (r.status === "maintenance") return !hasMaintenanceBlockConflict(r.id);
        return true;
      })
    : rooms.filter((r) => {
        const currentRoomId = reservation?.roomId || reservation?.room?.id || defaultValues?.roomId || formData.roomId;
        const sameRoom = !!currentRoomId && r.id === currentRoomId;
        if (sameRoom) return true;
        if (!selectedRoomTypeId) return false;
        if (r.roomTypeId !== selectedRoomTypeId) return false;
        if ((r as any).isVirtual) return false;
        if (r.isActive === false) return false;
        if (blockedRoomIdsByReservation.has(r.id)) return false;
        if (r.status === "maintenance") return !hasMaintenanceBlockConflict(r.id);
        return true;
      });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Reserva" : "Nueva Reserva"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica los detalles de la reserva." : "Ingresa los datos para crear una nueva reserva."}
            {!isEditing && generatedCode && (
              <Badge variant="outline" className="ml-2">
                Código: {generatedCode.code}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <GuestSelector
              selectedGuest={selectedGuest}
              onSelect={(guest) => {
                setSelectedGuest(guest);
                setFormData((prev) => ({ ...prev, guestId: guest.id }));
              }}
              onCreateNew={(guest) => createGuestMutation.mutate(guest)}
              onClear={() => {
                setSelectedGuest(null);
                setFormData((prev) => ({ ...prev, guestId: "" }));
              }}
              cardClassName={sectionCardClass(!!selectedGuest, !isEditing)}
            />

            {/* Preferencias del huésped — visible en el form al seleccionar */}
            {(() => {
              const activePrefs = (selectedGuestPrefs || []).filter((p: any) => p.isActive !== false);
              if (!formData.guestId || activePrefs.length === 0) return null;
              const criticalPrefs = activePrefs.filter((p: any) => p.priority === "critical");
              return (
                <div className={`p-3 rounded-lg border ${criticalPrefs.length > 0 ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {criticalPrefs.length > 0
                      ? <AlertTriangle className="h-4 w-4 text-red-500" />
                      : <Heart className="h-4 w-4 text-orange-500" />}
                    <span className="font-medium text-sm">
                      Preferencias del huésped ({activePrefs.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activePrefs.map((pref: any) => (
                      <div key={pref.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className={`text-xs ${
                          pref.priority === "critical" ? "border-red-400 text-red-700 dark:text-red-300" :
                          pref.priority === "high"     ? "border-orange-400 text-orange-700 dark:text-orange-300" : ""
                        }`}>
                          {pref.priority === "critical" ? "Crítica" : pref.priority === "high" ? "Alta" : pref.priority === "low" ? "Baja" : "Normal"}
                        </Badge>
                        <span>{pref.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <CompanySelector
              selectedCompany={selectedCompany}
              onSelect={(company) => {
                setSelectedCompany(company);
                setFormData((prev) => ({ ...prev, companyId: company.id }));
              }}
              onCreateNew={(company) => createCompanyMutation.mutate(company)}
              onClear={() => {
                setSelectedCompany(null);
                setFormData((prev) => ({ ...prev, companyId: "" }));
              }}
              cardClassName={sectionCardClass(!!selectedCompany, false)}
            />

            <AgencySelector
              selectedAgency={selectedAgency}
              onSelect={(agency) => {
                setSelectedAgency(agency);
                setFormData((prev) => ({ ...prev, agencyId: agency.id }));
              }}
              onCreateNew={(agency) => createAgencyMutation.mutate(agency)}
              onClear={() => {
                setSelectedAgency(null);
                setFormData((prev) => ({ ...prev, agencyId: "" }));
              }}
              cardClassName={sectionCardClass(!!selectedAgency, false)}
            />

            <div className="grid gap-2">
              <Label htmlFor="source">Origen</Label>
              <Select
                value={formData.source}
                onValueChange={(value) => setFormData({ ...formData, source: value as ReservationSource })}
              >
                <SelectTrigger data-testid="select-source">
                  <SelectValue placeholder="Origen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="directo">Directo</SelectItem>
                  <SelectItem value="telefono">Teléfono</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="booking">Booking</SelectItem>
                  <SelectItem value="expedia">Expedia</SelectItem>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                  <SelectItem value="despegar">Despegar</SelectItem>
                  <SelectItem value="ota">OTA (otros)</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="agencia">Agencia de Viajes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={`rounded-lg border p-3 grid grid-cols-2 gap-4 ${sectionCardClass(!!(selectedRoomTypeId && formData.roomId), !isEditing)}`}>
              <div className="grid gap-2">
                <Label htmlFor="roomType">
                  {isUpgrade ? "Tarifa a cobrar" : "Tipo de Habitación"}
                </Label>
                <Select
                  value={isUpgrade ? (formData.originalRoomTypeId || selectedRoomTypeId) : selectedRoomTypeId}
                  onValueChange={isUpgrade
                    ? (value) => {
                        setSelectedRoomTypeId(value);
                        setFormData(prev => ({
                          ...prev,
                          originalRoomTypeId: value,
                          ratePlanId: "",
                          baseRatePerNight: "",
                          finalRatePerNight: "",
                          totalRoomAmount: "",
                        }));
                      }
                    : handleRoomTypeChange}
                >
                  <SelectTrigger data-testid="select-room-type" className={isUpgrade ? "border-amber-400 dark:border-amber-600" : ""}>
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
                {isUpgrade && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Tarifa que se cobrará al huésped</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="room">
                  {isUpgrade ? "Habitación de Upgrade ↑" : "Habitación"}
                </Label>
                <Select
                  value={formData.roomId}
                  onValueChange={(value) => {
                    if (isUpgrade) {
                      const selectedRoom = rooms.find(r => r.id === value);
                      setFormData({ ...formData, roomId: value, roomTypeId: selectedRoom?.roomTypeId || formData.roomTypeId || "" });
                    } else {
                      setFormData({ ...formData, roomId: value });
                    }
                  }}
                  disabled={isUpgrade ? false : !selectedRoomTypeId}
                >
                  <SelectTrigger data-testid="select-room" className={isUpgrade ? "border-amber-400 dark:border-amber-600" : ""}>
                    <SelectValue placeholder="Seleccionar habitación" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRooms.filter(room => room.id).slice().sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber)).map((room) => {
                      const roomType = isUpgrade ? roomTypes.find(t => t.id === room.roomTypeId) : null;
                      return (
                        <SelectItem key={room.id} value={room.id}>
                          Hab. {room.roomNumber}{roomType ? ` — ${roomType.name}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className={`rounded-lg border p-3 grid gap-2 ${sectionCardClass(!!formData.ratePlanId, !isEditing)}`}>
              <Label htmlFor="ratePlan">Plan Tarifario</Label>
              <Select
                value={formData.ratePlanId || ""}
                onValueChange={handleRatePlanChange}
                disabled={!selectedRoomTypeId}
              >
                <SelectTrigger data-testid="select-rate-plan">
                  <SelectValue placeholder="Seleccionar plan tarifario" />
                </SelectTrigger>
                <SelectContent>
                  {ratePlans?.filter(plan => plan.id).map((plan) => {
                    const hasPaxRates = plan.rate2pax || plan.rate3pax || plan.rate4pax;
                    return (
                      <SelectItem key={plan.id} value={plan.id}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{plan.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ${fmtMoney(plan.baseRate)}
                            {plan.rate2pax ? ` · 2P: $${fmtMoney(plan.rate2pax)}` : ""}
                            {plan.rate3pax ? ` · 3P: $${fmtMoney(plan.rate3pax)}` : ""}
                            {plan.rate4pax ? ` · 4P: $${fmtMoney(plan.rate4pax)}` : ""}
                            {!hasPaxRates ? " (tarifa fija)" : ""}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                  <SelectItem value="__special__">⭐ Tarifa Especial (manual)</SelectItem>
                </SelectContent>
              </Select>
              {formData.ratePlanId === "__special__" && (
                <div className="space-y-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-700 mt-1">
                  <div className="space-y-1.5">
                    <Label>Motivo de tarifa especial <span className="text-destructive">*</span> <span className="font-normal text-muted-foreground text-xs">(aparece en informe diario y caja)</span></Label>
                    <Textarea
                      placeholder="Ej: Convenio verbal, cliente frecuente, cortesía gerencia..."
                      value={formData.specialRateReason || ""}
                      onChange={(e) => setFormData({ ...formData, specialRateReason: e.target.value })}
                      rows={2}
                      data-testid="input-special-rate-reason"
                    />
                  </div>
                </div>
              )}
              {formData.ratePlanId && formData.ratePlanId !== "__special__" && (() => {
                const plan = ratePlans?.find(p => p.id === formData.ratePlanId);
                if (!plan) return null;
                const paxMap: Record<number, string | null | undefined> = { 1: plan.rate1pax, 2: plan.rate2pax, 3: plan.rate3pax, 4: plan.rate4pax };
                const numGuests = formData.numberOfGuests || 1;
                const paxRate = paxMap[numGuests];
                const effectivePaxRate = paxRate || plan.baseRate;
                const isPaxSpecific = !!paxRate;
                return (
                  <div className="flex items-center gap-1.5 mt-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/40 rounded text-xs text-blue-700 dark:text-blue-300">
                    <span>Tarifa para {numGuests} huésped{numGuests > 1 ? "es" : ""}:</span>
                    <span className="font-bold">${fmtMoney(effectivePaxRate)}/noche</span>
                    {isPaxSpecific && <span className="text-blue-500">(tarifa {numGuests}P)</span>}
                  </div>
                );
              })()}
            </div>

            {/* Voucher + Upgrade */}
            <div className="grid gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    id="hasVoucher"
                    checked={hasVoucher}
                    onCheckedChange={(checked) => {
                      setHasVoucher(checked);
                      if (!checked) {
                        setFormData(prev => ({ ...prev, voucherCode: "", voucherNotes: "" }));
                      }
                    }}
                    data-testid="switch-has-voucher"
                  />
                  <Label htmlFor="hasVoucher" className="flex items-center gap-1.5 cursor-pointer">
                    <Ticket className="h-4 w-4 text-muted-foreground" />
                    Tiene voucher
                  </Label>
                </div>
                <Button
                  type="button"
                  variant={isUpgrade ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const newVal = !isUpgrade;
                    setIsUpgrade(newVal);
                    if (newVal) {
                      setFormData(prev => ({
                        ...prev,
                        isUpgrade: true,
                        originalRoomTypeId: selectedRoomTypeId || prev.roomTypeId || "",
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        isUpgrade: false,
                        originalRoomTypeId: "",
                        roomTypeId: selectedRoomTypeId || prev.roomTypeId || "",
                      }));
                    }
                  }}
                  className={isUpgrade ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : "border-amber-400 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-950/30"}
                  data-testid="button-toggle-upgrade"
                >
                  <TrendingUp className="h-4 w-4 mr-1.5" />
                  {reservation ? "Upgrade / Cambio de categoría" : "Up Grade"}
                </Button>
              </div>
            </div>
            {hasVoucher && (
              <div className="grid gap-3 pl-6 border-l-2 border-amber-300 dark:border-amber-700">
                <div className="grid gap-2">
                  <Label htmlFor="voucherCode">Número / Código de Voucher</Label>
                  <Input
                    id="voucherCode"
                    placeholder="Ej: VCH-2026-00123"
                    value={formData.voucherCode || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, voucherCode: e.target.value }))}
                    data-testid="input-voucher-code"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="voucherNotes">Observaciones del voucher</Label>
                  <Textarea
                    id="voucherNotes"
                    placeholder="Ej: Voucher de regalo 2 noches, válido hasta dic 2026"
                    value={formData.voucherNotes || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, voucherNotes: e.target.value }))}
                    rows={2}
                    data-testid="textarea-voucher-notes"
                  />
                </div>
              </div>
            )}

            {activePackages && activePackages.length > 0 && (
              <div className="grid gap-2">
                <Label>Paquete (opcional)</Label>
                <Select
                  value={selectedPackageId}
                  onValueChange={(val) => {
                    if (val === "__none__") {
                      setSelectedPackageId("");
                      // Reset price to rate plan values (or clear if no rate plan)
                      const plan = ratePlans?.find(p => p.id === formData.ratePlanId);
                      if (plan) {
                        const nights = calculateNights(formData.checkInDate || today, formData.checkOutDate || tomorrow);
                        const rate = getPaxRate(plan, parseInt(String(formData.numberOfGuests)) || 2);
                        const totals = calculateTotals(rate, formData.discountType as DiscountType, formData.discountValue || "0", nights);
                        setFormData(prev => ({ ...prev, baseRatePerNight: rate, ...totals, notes: prev.notes?.replace(/\[Paquete:[^\]]*\]\s*/g, "").trim() || "" }));
                      } else {
                        setFormData(prev => ({ ...prev, baseRatePerNight: "", finalRatePerNight: "", totalRoomAmount: "", notes: prev.notes?.replace(/\[Paquete:[^\]]*\]\s*/g, "").trim() || "" }));
                      }
                      return;
                    }
                    setSelectedPackageId(val);
                    const pkg = activePackages.find(p => p.id === val);
                    if (pkg) {
                      // Buscar precio específico para el tipo de habitación seleccionado
                      const roomPrice = pkg.roomPrices?.find((rp: any) => rp.roomTypeId === selectedRoomTypeId);
                      const effectiveBasePrice = roomPrice ? roomPrice.price : pkg.basePrice;
                      if (isEditing) {
                        // En edición: solo actualiza precio y notas, NO cambia fechas
                        const currentNights = Number(formData.nights) || 1;
                        const totalPrice = parseFloat(effectiveBasePrice);
                        setFormData(prev => ({
                          ...prev,
                          baseRatePerNight: ratePerNight,
                          finalRatePerNight: ratePerNight,
                          totalRoomAmount: (totalPrice).toFixed(2),
                          discountType: "none",
                          discountValue: "0",
                          notes: prev.notes?.replace(/\[Paquete:[^\]]*\]\s*/g, "").trim()
                            ? `[Paquete: ${pkg.name}] ${prev.notes.replace(/\[Paquete:[^\]]*\]\s*/g, "").trim()}`
                            : `[Paquete: ${pkg.name}]`,
                        }));
                      } else {
                        // En creación: aplica fechas según duración del paquete
                        const nights = pkg.nights || 1;
                        const checkIn = formData.checkInDate || today;
                        const d = new Date(checkIn + "T12:00:00");
                        d.setDate(d.getDate() + nights);
                        const newCheckOut = toArgentinaDateStr(d);
                        const totalPrice = parseFloat(effectiveBasePrice);
                        const ratePerNight = (totalPrice / nights).toFixed(2);
                        setFormData(prev => ({
                          ...prev,
                          checkOutDate: newCheckOut,
                          nights,
                          baseRatePerNight: ratePerNight,
                          finalRatePerNight: ratePerNight,
                          totalRoomAmount: totalPrice.toFixed(2),
                          discountType: "none",
                          discountValue: "0",
                          notes: prev.notes?.replace(/\[Paquete:[^\]]*\]\s*/g, "").trim()
                            ? `[Paquete: ${pkg.name}] ${prev.notes.replace(/\[Paquete:[^\]]*\]\s*/g, "").trim()}`
                            : `[Paquete: ${pkg.name}]`,
                        }));
                      }
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-package">
                    <SelectValue placeholder="Sin paquete" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin paquete</SelectItem>
                    {activePackages.filter(pkg => pkg.id).map(pkg => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} — ${pkg.basePrice} ({pkg.nights} noche{pkg.nights !== 1 ? "s" : ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPackageId && (() => {
                  const pkg = activePackages.find(p => p.id === selectedPackageId);
                  if (!pkg) return null;
                  const roomPrice = pkg.roomPrices?.find((rp: any) => rp.roomTypeId === selectedRoomTypeId);
                  const effectivePrice = roomPrice ? roomPrice.price : pkg.basePrice;
                  return (
                    <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-3 py-2">
                      <Gift className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-green-800 dark:text-green-300">{pkg.name}</span>
                        <span className="text-xs text-green-700 dark:text-green-400 ml-1">· {pkg.nights} noche{pkg.nights !== 1 ? "s" : ""}</span>
                        {roomPrice && (
                          <span className="text-xs text-green-600 dark:text-green-500 ml-1">· precio por categoría</span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-green-800 dark:text-green-300 whitespace-nowrap">
                        ${Number(effectivePrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {(() => {
              const datesInvalid = !!formData.checkInDate && !!formData.checkOutDate && formData.checkOutDate <= formData.checkInDate;
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="checkIn">Fecha Check-in</Label>
                    <Input
                      id="checkIn"
                      type="date"
                      value={formData.checkInDate}
                      onChange={(e) => handleDateChange("checkInDate", e.target.value)}
                      required
                      className={datesInvalid ? "border-destructive" : ""}
                      data-testid="input-check-in"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="checkOut">Fecha Check-out</Label>
                    <Input
                      id="checkOut"
                      type="date"
                      value={formData.checkOutDate}
                      min={formData.checkInDate ? (() => { const d = new Date(formData.checkInDate + "T12:00:00"); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })() : undefined}
                      onChange={(e) => handleDateChange("checkOutDate", e.target.value)}
                      required
                      className={datesInvalid ? "border-destructive" : ""}
                      data-testid="input-check-out"
                    />
                    {datesInvalid && (
                      <p className="text-xs text-destructive">⚠ El egreso debe ser posterior al ingreso</p>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="nights">Noches</Label>
                <Input
                  id="nights"
                  type="number"
                  value={formData.nights}
                  readOnly
                  className="bg-muted"
                  data-testid="input-nights"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="guests">Huéspedes</Label>
                <Input
                  id="guests"
                  type="number"
                  min={1}
                  value={formData.numberOfGuests}
                  onChange={(e) => {
                    const numGuests = parseInt(e.target.value) || 1;
                    const plan = ratePlans?.find(p => p.id === formData.ratePlanId);
                    if (plan) {
                      const rate = getPaxRate(plan, numGuests);
                      const nights = calculateNights(formData.checkInDate || today, formData.checkOutDate || tomorrow);
                      const totals = calculateTotals(rate, formData.discountType as DiscountType, formData.discountValue || "0", nights);
                      setFormData({ ...formData, numberOfGuests: numGuests, baseRatePerNight: rate, ...totals });
                    } else {
                      setFormData({ ...formData, numberOfGuests: numGuests });
                    }
                  }}
                  data-testid="input-num-guests"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Estado</Label>
                {isEditing && (formData.status === "checked_in" || formData.status === "checked_out") ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted text-muted-foreground text-sm" data-testid="select-reservation-status">
                    <Lock className="h-3.5 w-3.5" />
                    <span>{formData.status === "checked_in" ? "Reserva en casa (check-in hecho)" : "Check-out realizado"}</span>
                  </div>
                ) : (
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as ReservationStatus })}
                  >
                    <SelectTrigger data-testid="select-reservation-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Confirmada</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="discountType">Tipo Descuento</Label>
                <Select
                  value={formData.discountType}
                  onValueChange={(value) => handleDiscountChange(value as DiscountType, undefined)}
                >
                  <SelectTrigger data-testid="select-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin descuento</SelectItem>
                    <SelectItem value="percent">Porcentaje (%)</SelectItem>
                    <SelectItem value="fixed">Monto Fijo ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="discountValue">Valor Descuento</Label>
                <Input
                  id="discountValue"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.discountValue || ""}
                  onChange={(e) => handleDiscountChange(undefined, e.target.value)}
                  disabled={formData.discountType === "none"}
                  data-testid="input-discount-value"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="baseRate">Tarifa Base/Noche <span className="ml-1 text-xs font-normal text-muted-foreground">(con IVA incluido)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="baseRate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.baseRatePerNight || ""}
                    readOnly={formData.ratePlanId !== "__special__"}
                    onChange={formData.ratePlanId === "__special__" ? (e) => handleBaseRateChange(e.target.value) : undefined}
                    placeholder="0.00"
                    className={`pl-7 ${formData.ratePlanId === "__special__" ? "" : "bg-muted cursor-not-allowed"}`}
                    data-testid="input-base-rate"
                    title={formData.ratePlanId === "__special__" ? "Ingrese la tarifa por noche" : "La tarifa se establece automáticamente según el plan tarifario"}
                  />
                </div>
                {formData.ratePlanId !== "__special__" && (
                  <p className="text-xs text-muted-foreground">
                    {selectedPackageId
                      ? "Definida por el paquete seleccionado"
                      : "Definida por el plan tarifario seleccionado"}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bedConfig">Tipo de camaje</Label>
              <Select
                value={formData.bedTypeId || "none"}
                onValueChange={(value) => {
                  if (value === "none") {
                    setFormData({ ...formData, bedTypeId: null, bedTypeNotes: "" });
                  } else {
                    const bt = bedTypes?.find(b => b.id === value);
                    setFormData({ ...formData, bedTypeId: value, bedTypeNotes: bt?.name || "" });
                  }
                }}
              >
                <SelectTrigger data-testid="select-bed-config-form">
                  <SelectValue placeholder="Sin preferencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin preferencia</SelectItem>
                  {bedTypes?.filter(bt => bt.id && bt.isActive).sort((a, b) => a.displayOrder - b.displayOrder).map(bt => (
                    <SelectItem key={bt.id} value={bt.id}>
                      <div className="flex flex-col gap-0">
                        <span>{bt.name}</span>
                        {bt.description && <span className="text-xs text-muted-foreground">{bt.description}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isEditing && (
              <div className="border rounded-lg">
                <div className="flex items-center justify-between p-3 border-b bg-muted/40">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">Consumos / Cargos adicionales</span>
                    {pendingCharges.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{pendingCharges.length}</Badge>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowResChargeForm(!showResChargeForm)} data-testid="button-toggle-charge-form">
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>

                {showResChargeForm && (
                  <div className="p-3 border-b bg-muted/20 space-y-2">
                    <Select
                      value={resChargePreset}
                      onValueChange={(val) => {
                        setResChargePreset(val);
                        const preset = newResChargePresets.find(p => p.label === val);
                        if (preset) {
                          setResChargeDesc(preset.description);
                          setResChargeAmount(preset.amount);
                          setResChargeCategory(preset.category);
                          setResChargeQty(1);
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-new-res-charge-preset">
                        <SelectValue placeholder="Seleccionar tipo de cargo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {newResChargePresets.map(p => (
                          <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-4 gap-2 items-end">
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">Descripción</Label>
                        <Input
                          value={resChargeDesc}
                          onChange={(e) => setResChargeDesc(e.target.value)}
                          placeholder="Descripción"
                          data-testid="input-new-res-charge-desc"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Precio unit.</Label>
                        <Input
                          type="number"
                          value={resChargeAmount}
                          onChange={(e) => setResChargeAmount(e.target.value)}
                          placeholder="0.00"
                          data-testid="input-new-res-charge-amount"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Cant.</Label>
                        <Input
                          type="number"
                          min={1}
                          value={resChargeQty}
                          onChange={(e) => {
                            setResChargeRecurring(false);
                            setResChargeQty(Math.max(1, parseInt(e.target.value) || 1));
                          }}
                          data-testid="input-new-res-charge-qty"
                        />
                      </div>
                    </div>
                    {/* Toggle cargo por noche — solo para tipos habilitados */}
                    {newResChargePresets.find(p => p.label === resChargePreset)?.allowRecurring && (
                    <div className="flex items-center gap-3 py-1">
                      <Switch
                        id="new-res-recurring-toggle"
                        checked={resChargeRecurring}
                        onCheckedChange={(checked) => {
                          setResChargeRecurring(checked);
                          const nights = Number(formData.nights) || 1;
                          setResChargeQty(checked ? nights : 1);
                        }}
                        data-testid="switch-new-res-recurring-charge"
                      />
                      <Label htmlFor="new-res-recurring-toggle" className="text-xs cursor-pointer select-none">
                        Cargo por noche
                        {resChargeRecurring && (
                          <span className="text-muted-foreground ml-1">· {Number(formData.nights) || 1} noche{(Number(formData.nights) || 1) !== 1 ? "s" : ""}</span>
                        )}
                      </Label>
                    </div>
                    )}
                    {resChargeAmount && resChargeRecurring && (
                      <div className="flex items-center rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm">
                        <span className="text-blue-700 dark:text-blue-300 font-medium">
                          {Number(formData.nights) || 1} noches × ${fmtMoney(resChargeAmount || "0")} = <span className="font-bold">${(parseFloat(resChargeAmount || "0") * (Number(formData.nights) || 1)).toFixed(2)}</span>
                        </span>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowResChargeForm(false);
                          setResChargePreset("");
                          setResChargeDesc("");
                          setResChargeAmount("");
                          setResChargeQty(1);
                          setResChargeRecurring(false);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (!resChargeDesc || !resChargeAmount) return;
                          setPendingCharges(prev => [...prev, { description: resChargeDesc, amount: resChargeAmount, category: resChargeCategory, quantity: resChargeQty }]);
                          setShowResChargeForm(false);
                          setResChargePreset("");
                          setResChargeDesc("");
                          setResChargeAmount("");
                          setResChargeQty(1);
                          setResChargeRecurring(false);
                        }}
                        data-testid="button-confirm-new-res-charge"
                      >
                        Agregar cargo
                      </Button>
                    </div>
                  </div>
                )}

                {pendingCharges.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">Sin cargos adicionales</p>
                ) : (
                  <div className="divide-y">
                    {pendingCharges.map((charge, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>{charge.description}{charge.quantity > 1 ? ` x${charge.quantity}` : ""}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">${fmtMoney(parseFloat(charge.amount) * charge.quantity)}</span>
                          <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => setPendingCharges(prev => prev.filter((_, i) => i !== idx))}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 text-sm font-semibold bg-muted/30">
                      <span>Total cargos</span>
                      <span>${fmtMoney(pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount) * c.quantity, 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Tarifa Final/Noche</p>
                  <p className="text-lg font-semibold">${fmtMoney(formData.finalRatePerNight)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Alojamiento</p>
                  <p className="text-lg font-semibold">${fmtMoney(formData.totalRoomAmount)}</p>
                </div>
              </div>
              {pendingCharges.length > 0 && (() => {
                const chargesTotal = pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount) * c.quantity, 0);
                const roomTotal = parseFloat(formData.totalRoomAmount || "0");
                const grandTotal = fmtMoney(roomTotal + chargesTotal);
                return (
                  <div className="border-t pt-2 flex justify-between items-center">
                    <p className="text-sm font-semibold text-foreground">Total General</p>
                    <p className="text-2xl font-bold text-primary">${grandTotal}</p>
                  </div>
                );
              })()}
              {pendingCharges.length === 0 && (
                <div className="border-t pt-2 flex justify-end">
                  <p className="text-2xl font-bold text-primary">${fmtMoney(formData.totalRoomAmount)}</p>
                </div>
              )}
            </div>

            <div className="grid gap-3 border rounded-lg p-3">
              <Label className="text-sm font-semibold">Servicios especiales</Label>
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sunrise className="h-4 w-4 text-orange-500" />
                    <Label htmlFor="earlyCheckIn" className="cursor-pointer">Early Check-in</Label>
                    <span className="text-xs text-muted-foreground">(Estándar: 12:00 hs)</span>
                  </div>
                  <Switch
                    id="earlyCheckIn"
                    checked={!!formData.earlyCheckIn}
                    onCheckedChange={async (checked) => {
                      if (checked && formData.roomId && formData.checkInDate) {
                        const res = await fetch(`/api/reservations/check-adjacent?roomId=${formData.roomId}&date=${formData.checkInDate}&direction=before`, { credentials: "include" });
                        const adj = res.ok ? await res.json() : null;
                        if (adj && adj.id !== reservation?.id) {
                          setAdjacentWarning({ type: "early", code: adj.reservationCode, pendingValue: true });
                          return;
                        }
                      }
                      setFormData({ ...formData, earlyCheckIn: checked, ...(!checked && { earlyCheckInTime: "", earlyCheckInCharge: "" }) });
                    }}
                    data-testid="switch-early-checkin"
                  />
                </div>
                {formData.earlyCheckIn && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <div>
                      <Label htmlFor="earlyCheckInTime" className="text-xs">Hora acordada</Label>
                      <Input
                        id="earlyCheckInTime"
                        type="time"
                        value={formData.earlyCheckInTime || ""}
                        onChange={(e) => setFormData({ ...formData, earlyCheckInTime: e.target.value })}
                        data-testid="input-early-checkin-time"
                      />
                    </div>
                    <div>
                      <Label htmlFor="earlyCheckInCharge" className="text-xs">Cargo (vacío = cortesía)</Label>
                      <Input
                        id="earlyCheckInCharge"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.earlyCheckInCharge || ""}
                        onChange={(e) => setFormData({ ...formData, earlyCheckInCharge: e.target.value })}
                        data-testid="input-early-checkin-charge"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sunset className="h-4 w-4 text-purple-500" />
                    <Label htmlFor="lateCheckOut" className="cursor-pointer">Late Check-out</Label>
                    <span className="text-xs text-muted-foreground">(Estándar: 11:00 hs)</span>
                  </div>
                  <Switch
                    id="lateCheckOut"
                    checked={!!formData.lateCheckOut}
                    onCheckedChange={async (checked) => {
                      if (checked && formData.roomId && formData.checkOutDate) {
                        const res = await fetch(`/api/reservations/check-adjacent?roomId=${formData.roomId}&date=${formData.checkOutDate}&direction=after`, { credentials: "include" });
                        const adj = res.ok ? await res.json() : null;
                        if (adj && adj.id !== reservation?.id) {
                          setAdjacentWarning({ type: "late", code: adj.reservationCode, pendingValue: true });
                          return;
                        }
                      }
                      setFormData({ ...formData, lateCheckOut: checked, ...(!checked && { lateCheckOutTime: "", lateCheckOutCharge: "" }) });
                    }}
                    data-testid="switch-late-checkout"
                  />
                </div>
                {formData.lateCheckOut && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <div>
                      <Label htmlFor="lateCheckOutTime" className="text-xs">Hora acordada</Label>
                      <Input
                        id="lateCheckOutTime"
                        type="time"
                        value={formData.lateCheckOutTime || ""}
                        onChange={(e) => setFormData({ ...formData, lateCheckOutTime: e.target.value })}
                        data-testid="input-late-checkout-time"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lateCheckOutCharge" className="text-xs">Cargo (vacío = cortesía)</Label>
                      <Input
                        id="lateCheckOutCharge"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.lateCheckOutCharge || ""}
                        onChange={(e) => setFormData({ ...formData, lateCheckOutCharge: e.target.value })}
                        data-testid="input-late-checkout-charge"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas adicionales sobre la reserva..."
                data-testid="input-reservation-notes"
              />
            </div>

            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contacto de la Reserva</p>
              <p className="text-xs text-muted-foreground">Para cuando la reserva no la gestiona el huésped principal</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="contactName" className="text-xs">Nombre del contacto</Label>
                  <Input
                    id="contactName"
                    value={formData.contactName || ""}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="Ej: María González"
                    className="h-8 text-sm"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="contactPhone" className="text-xs">Teléfono del contacto</Label>
                  <Input
                    id="contactPhone"
                    value={formData.contactPhone || ""}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="Ej: 3446-123456"
                    className="h-8 text-sm"
                    data-testid="input-contact-phone"
                  />
                </div>
              </div>
            </div>

            {/* Acompañantes — solo en nueva reserva */}
            {!isEditing && (
              <div className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Acompañantes</span>
                    {pendingCompanions.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{pendingCompanions.length}</Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => { setShowCompanionForm(v => !v); setNewCompForm(emptyCompanion); }}
                    data-testid="button-add-companion-form"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>

                {showCompanionForm && (
                  <div className="p-3 border-t bg-muted/10 space-y-2">
                    {/* Mode toggle */}
                    <div className="flex rounded-md border overflow-hidden text-xs">
                      <button type="button"
                        className={`flex-1 py-1.5 transition-colors ${pendingCompMode === "search" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"}`}
                        onClick={() => { setPendingCompMode("search"); setPendingCompQ(""); setPendingCompHits([]); }}
                      >Buscar existente</button>
                      <button type="button"
                        className={`flex-1 py-1.5 transition-colors border-l ${pendingCompMode === "new" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"}`}
                        onClick={() => { setPendingCompMode("new"); setPendingCompQ(""); setPendingCompHits([]); }}
                      >Nuevo</button>
                    </div>

                    {pendingCompMode === "search" ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            placeholder="Buscar por nombre, apellido o DNI..."
                            value={pendingCompQ}
                            className="h-8 text-sm pl-8"
                            data-testid="input-pending-comp-search"
                            onChange={async e => {
                              const q = e.target.value;
                              setPendingCompQ(q);
                              if (q.length < 2) { setPendingCompHits([]); return; }
                              setPendingCompSearching(true);
                              try {
                                const r = await fetch(`/api/guests/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
                                setPendingCompHits(await r.json() || []);
                              } catch { setPendingCompHits([]); } finally { setPendingCompSearching(false); }
                            }}
                          />
                          {pendingCompSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>
                        {pendingCompQ.length >= 2 && pendingCompHits.length > 0 && (
                          <div className="border rounded-md bg-popover shadow-md max-h-44 overflow-y-auto">
                            {pendingCompHits.map(g => (
                              <button key={g.id} type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex flex-col border-b last:border-0"
                                onClick={() => {
                                  setPendingCompanions(prev => [...prev, {
                                    firstName: g.firstName,
                                    lastName: g.lastName || "",
                                    documentType: "DNI",
                                    documentNumber: g.documentNumber || "",
                                    dateOfBirth: "",
                                    nationality: "",
                                    guestId: g.id,
                                  }]);
                                  setPendingCompQ(""); setPendingCompHits([]);
                                  setShowCompanionForm(false);
                                  setPendingCompMode("search");
                                }}
                              >
                                <span className="font-medium">{g.lastName} {g.firstName}</span>
                                {g.documentNumber && <span className="text-xs text-muted-foreground">DNI {g.documentNumber}</span>}
                                <span className="text-xs text-green-600 font-medium">← Vincular al CRM</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {pendingCompQ.length >= 2 && !pendingCompSearching && pendingCompHits.length === 0 && (
                          <p className="text-xs text-muted-foreground">Sin resultados. <button type="button" className="text-primary underline" onClick={() => setPendingCompMode("new")}>Agregar nuevo</button></p>
                        )}
                        {pendingCompQ.length > 0 && pendingCompQ.length < 2 && (
                          <p className="text-xs text-muted-foreground">Escribí al menos 2 caracteres</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
                            <Input placeholder="Nombre" value={newCompForm.firstName} onChange={e => setNewCompForm(p => ({ ...p, firstName: e.target.value }))} className="h-8 text-sm" data-testid="input-new-comp-firstname" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Apellido *</label>
                            <Input placeholder="Apellido" value={newCompForm.lastName} onChange={e => setNewCompForm(p => ({ ...p, lastName: e.target.value }))} className="h-8 text-sm" data-testid="input-new-comp-lastname" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Tipo doc.</label>
                            <select value={newCompForm.documentType} onChange={e => setNewCompForm(p => ({ ...p, documentType: e.target.value }))} className="w-full h-8 text-sm border rounded-md px-2 bg-background" data-testid="select-new-comp-doctype">
                              <option value="DNI">DNI</option>
                              <option value="Pasaporte">Pasaporte</option>
                              <option value="LC">LC</option>
                              <option value="LE">LE</option>
                              <option value="CI">CI (extranjero)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Nº documento</label>
                            <Input placeholder="Número" value={newCompForm.documentNumber} onChange={e => setNewCompForm(p => ({ ...p, documentNumber: e.target.value }))} className="h-8 text-sm" data-testid="input-new-comp-docnumber" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Fecha de nacimiento</label>
                            <Input type="date" value={newCompForm.dateOfBirth} onChange={e => setNewCompForm(p => ({ ...p, dateOfBirth: e.target.value }))} className="h-8 text-sm" data-testid="input-new-comp-dob" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Nacionalidad</label>
                            <NationalityCombobox value={newCompForm.nationality} onChange={(name) => setNewCompForm(p => ({ ...p, nationality: name }))} />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setShowCompanionForm(false); setPendingCompQ(""); setPendingCompHits([]); setNewCompForm(emptyCompanion); setPendingCompMode("search"); }}>
                        Cancelar
                      </Button>
                      {pendingCompMode === "new" && (
                        <Button type="button" size="sm" className="h-7 text-xs" disabled={!newCompForm.firstName || !newCompForm.lastName}
                          onClick={() => { setPendingCompanions(prev => [...prev, { ...newCompForm }]); setNewCompForm(emptyCompanion); setShowCompanionForm(false); setPendingCompMode("search"); }}
                          data-testid="button-save-new-comp"
                        >
                          Agregar
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {pendingCompanions.length === 0 && !showCompanionForm ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Sin acompañantes (opcional)
                  </div>
                ) : (
                  <ul className="divide-y">
                    {pendingCompanions.map((c, idx) => (
                      <li key={idx} className="flex items-center justify-between px-3 py-2" data-testid={`pending-companion-row-${idx}`}>
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {c.lastName?.[0]}{c.firstName?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{c.lastName} {c.firstName}</p>
                            <p className="text-xs text-muted-foreground">{c.documentType} {c.documentNumber || "—"}</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setPendingCompanions(prev => prev.filter((_, i) => i !== idx))}
                          data-testid={`button-remove-pending-companion-${idx}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Volver
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-reservation">
              {mutation.isPending ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Reserva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!adjacentWarning} onOpenChange={(open) => { if (!open) setAdjacentWarning(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {adjacentWarning?.type === "early" ? "Reserva saliente el mismo día" : "Reserva entrante el mismo día"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {adjacentWarning?.type === "early"
              ? <>La habitación tiene otra reserva (<strong>{adjacentWarning?.code}</strong>) que hace check-out ese mismo día. Aplicar Early Check-in puede generar solapamiento de horarios.</>
              : <>La habitación tiene otra reserva (<strong>{adjacentWarning?.code}</strong>) que hace check-in ese mismo día. Aplicar Late Check-out puede generar solapamiento de horarios.</>
            }
            {" "}¿Querés aplicarlo de todas formas?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setAdjacentWarning(null)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (adjacentWarning?.type === "early") {
              setFormData(prev => ({ ...prev, earlyCheckIn: true }));
            } else {
              setFormData(prev => ({ ...prev, lateCheckOut: true }));
            }
            setAdjacentWarning(null);
          }}>
            Aplicar de todas formas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Tarjeta Débito",
  tarjeta_credito: "Tarjeta Crédito",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cuenta Corriente",
};

function ReservationDetailDialog({
  reservation,
  open,
  onOpenChange,
  onCancel,
  onEdit,
}: {
  reservation: ReservationWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onEdit?: () => void;
}) {
  const { toast } = useToast();
  const isLocked = reservation.status === "checked_out" || reservation.status === "cancelled";
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [earlyCheckoutDialogOpen, setEarlyCheckoutDialogOpen] = useState(false);
  const [showUninvoicedWarning, setShowUninvoicedWarning] = useState(false);
  const [uninvoicedWarningAction, setUninvoicedWarningAction] = useState<"facturar" | "checkout" | null>(null);

  // Reset billing state whenever a different reservation is opened
  useEffect(() => {
    setShowFacturar(false);
    setShowFacturarMode("billing");
    setUninvoicedWarningAction(null);
    setShowUninvoicedWarning(false);
  }, [reservation.id]);

  const openCheckoutWizard = () => {
    setShowFacturarMode("checkout");
    setShowFacturar(true);
  };

  const openFacturarSolo = () => {
    setShowFacturar(true);
  };

  const { data: chargeTypesData = [] } = useQuery<{ id: string; label: string; description: string; defaultAmount: string; category: string; allowPriceEdit: boolean; allowRecurring: boolean }[]>({
    queryKey: ["/api/charge-types"],
  });

  const earlyCheckoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/reservations/${reservation.id}`, { status: "checked_out" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setEarlyCheckoutDialogOpen(false);
      onOpenChange(false);
      toast({ title: "Check-out anticipado realizado", description: "La habitación fue liberada." });
    },
    onError: (error: any) => {
      let msg = "No se pudo realizar el check-out anticipado.";
      try {
        const raw = error?.message || "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart !== -1) {
          const body = JSON.parse(raw.slice(jsonStart));
          msg = body?.message || body?.error || msg;
        }
      } catch {}
      toast({ title: "Error al realizar check-out", description: msg, variant: "destructive" });
    },
  });


  const printConfirmation = () => {
    window.open(`/api/reservations/${reservation.id}/confirmation-pdf`, "_blank");
  };
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [transferringChargeId, setTransferringChargeId] = useState<string | null>(null);
  const [targetReservationId, setTargetReservationId] = useState<string>("");
  const [showBulkTransfer, setShowBulkTransfer] = useState(false);
  const [bulkTargetReservationId, setBulkTargetReservationId] = useState<string>("");
  const [bulkSelectedChargeIds, setBulkSelectedChargeIds] = useState<Set<string>>(new Set());
  const [bulkIncludeAccommodation, setBulkIncludeAccommodation] = useState(false);
  const [bulkSelectedPaymentIds, setBulkSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [bulkTransferNote, setBulkTransferNote] = useState("");
  const [anularTarget, setAnularTarget] = useState<{ type: "cargo" | "pago"; id: string } | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anularEmitirNC, setAnularEmitirNC] = useState(false);
  const [anularSinNCPending, setAnularSinNCPending] = useState(false);
  const [invoicingPaymentId, setInvoicingPaymentId] = useState<string | null>(null);
  const [showAdvanceFacturar, setShowAdvanceFacturar] = useState(false);
  const [ncForInvoiceId, setNcForInvoiceId] = useState<number | null>(null);
  const [restaurantVoucherOrderNum, setRestaurantVoucherOrderNum] = useState<string | null>(null);
  const [newCharge, setNewCharge] = useState({
    description: "",
    amount: "",
    category: "otros" as "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment",
  });
  const chargePresets = [
    ...chargeTypesData.map(ct => ({ label: ct.label, description: ct.description, amount: String(ct.defaultAmount), category: ct.category as any, allowPriceEdit: ct.allowPriceEdit ?? false, allowRecurring: ct.allowRecurring ?? false })),
    { label: "Cargo editable", description: "", amount: "", category: "otros" as const, allowPriceEdit: true, allowRecurring: false },
  ];
  const [chargeQty, setChargeQty] = useState(1);
  const [isRecurringCharge, setIsRecurringCharge] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<typeof chargePresets[0] | null>(null);
  const [newPayment, setNewPayment] = useState({
    amount: "",
    method: "efectivo" as PaymentMethod,
    reference: "",
    notes: "",
    billingTarget: "guest" as "guest" | "company",
  });
  const [paymentRows, setPaymentRows] = useState<Array<{ amount: string; method: string; reference: string; billingTarget: string; companyId?: string; agencyId?: string }>>([
    { amount: "", method: "efectivo", reference: "", billingTarget: "guest" },
  ]);

  // Edit titular (guest)
  const [editingGuest, setEditingGuest] = useState(false);
  const [guestEditData, setGuestEditData] = useState({
    firstName: reservation.guest?.firstName || "",
    lastName: reservation.guest?.lastName || "",
    email: reservation.guest?.email || "",
    phone: reservation.guest?.phone || "",
    documentType: reservation.guest?.documentType || "DNI",
    documentNumber: reservation.guest?.documentNumber || "",
    nationality: reservation.guest?.nationality || "",
    localidad: reservation.guest?.localidad || "",
  });
  const updateGuestMutation = useMutation({
    mutationFn: async (data: typeof guestEditData) =>
      apiRequest("PATCH", `/api/guests/${reservation.guest?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      setEditingGuest(false);
      toast({ title: "Datos del titular actualizados" });
    },
    onError: () => toast({ title: "Error al actualizar titular", variant: "destructive" }),
  });

  // Factura desde folio
  const [showFacturar, setShowFacturar] = useState(false);
  const [showFacturarMode, setShowFacturarMode] = useState<"billing" | "checkout">("billing");
  const [facturaEmitida, setFacturaEmitida] = useState(false);
  const { data: billingConfig } = useQuery<any>({ queryKey: ["/api/billing/config"] });

  // Companions
  type CompanionForm = { firstName: string; lastName: string; documentType: string; documentNumber: string; dateOfBirth: string; nationality: string; guestId?: string | null };
  const emptyComp: CompanionForm = { firstName: "", lastName: "", documentType: "DNI", documentNumber: "", dateOfBirth: "", nationality: "", guestId: null };
  type GuestHit = { id: string; firstName: string; lastName: string; documentNumber?: string | null };
  const [showAddCompanion, setShowAddCompanion] = useState(false);
  const [companionMode, setCompanionMode] = useState<"search" | "new">("search");
  const [companionQ, setCompanionQ] = useState("");
  const [companionHits, setCompanionHits] = useState<GuestHit[]>([]);
  const [companionSearching, setCompanionSearching] = useState(false);
  const [newCompanion, setNewCompanion] = useState<CompanionForm>(emptyComp);
  const [editingCompanionId, setEditingCompanionId] = useState<string | null>(null);
  const [editCompanionData, setEditCompanionData] = useState<CompanionForm>(emptyComp);

  const { data: companions = [], refetch: refetchCompanions } = useQuery<any[]>({
    queryKey: ["/api/reservations", reservation.id, "companions"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservation.id}/companions`, { credentials: "include" });
      return res.json();
    },
  });

  const addCompanionMutation = useMutation({
    mutationFn: async (data: CompanionForm) =>
      apiRequest("POST", `/api/reservations/${reservation.id}/companions`, data),
    onSuccess: () => {
      refetchCompanions();
      setShowAddCompanion(false);
      setNewCompanion(emptyComp);
      toast({ title: "Acompañante agregado" });
    },
    onError: () => toast({ title: "Error al agregar acompañante", variant: "destructive" }),
  });

  const updateCompanionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CompanionForm }) =>
      apiRequest("PATCH", `/api/reservations/${reservation.id}/companions/${id}`, data),
    onSuccess: () => {
      refetchCompanions();
      setEditingCompanionId(null);
      setEditCompanionData(emptyComp);
      toast({ title: "Acompañante actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar acompañante", variant: "destructive" }),
  });

  const deleteCompanionMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/reservations/${reservation.id}/companions/${id}`, undefined),
    onSuccess: () => {
      refetchCompanions();
      toast({ title: "Acompañante eliminado" });
    },
  });

  const promoteCompanionMutation = useMutation({
    mutationFn: async (companionId: string) => {
      const res = await apiRequest("POST", `/api/reservations/${reservation.id}/companions/${companionId}/promote`, {});
      return res.json();
    },
    onSuccess: (data) => {
      refetchCompanions();
      toast({ title: `Perfil creado: ${data?.guest?.firstName} ${data?.guest?.lastName}` });
    },
    onError: () => toast({ title: "Error al crear perfil de huésped", variant: "destructive" }),
  });

  // Fetch active reservations for transfer target selection
  const { data: activeReservations, isError: isActiveReservationsError, isLoading: isActiveReservationsLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations", "transfer-targets"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Failed to fetch reservations");
      const all = await res.json();
      return all
        .filter((r: ReservationWithDetails) => 
          (r.status === "checked_in" || r.status === "web_checkin") && r.id !== reservation.id
        )
        .sort((a: ReservationWithDetails, b: ReservationWithDetails) => {
          if (a.status !== b.status) {
            return a.status === "checked_in" ? -1 : 1;
          }
          const numA = parseInt(a.room?.roomNumber || "0", 10);
          const numB = parseInt(b.room?.roomNumber || "0", 10);
          return numA - numB;
        });
    },
    enabled: transferringChargeId !== null || showBulkTransfer,
  });

  const { data: charges, refetch: refetchCharges } = useQuery<Charge[]>({
    queryKey: ["/api/reservations", reservation.id, "charges", "all"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservation.id}/charges?includeAnulados=true`);
      return res.json();
    },
  });

  const { data: payments, refetch: refetchPayments } = useQuery<Payment[]>({
    queryKey: ["/api/reservations", reservation.id, "payments", "all"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservation.id}/payments?includeAnulados=true`);
      return res.json();
    },
  });

  const { data: restaurantVoucherDetail, isLoading: isLoadingVoucher } = useQuery<any>({
    queryKey: ["/api/restaurant/orders/by-number", restaurantVoucherOrderNum],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant/orders/by-number/${restaurantVoucherOrderNum}`, { credentials: "include" });
      if (!res.ok) throw new Error("No encontrado");
      return res.json();
    },
    enabled: !!restaurantVoucherOrderNum,
  });

  const { data: changelog = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations", reservation.id, "changelog"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservation.id}/changelog`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: companiesForCC = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: paymentRows.some(r => r.method === "cuenta_corriente" && r.billingTarget === "company" && !reservation.companyId),
  });

  const { data: agenciesForCC = [] } = useQuery<Agency[]>({
    queryKey: ["/api/agencies"],
    enabled: paymentRows.some(r => r.method === "cuenta_corriente" && r.billingTarget === "agency" && !reservation.agencyId),
  });

  // Always-loaded for billing fallback (guest's default company/agency)

  // Invoices linked to this reservation (for timeline)
  const { data: folioInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/billing/invoices", "reserva", reservation.id],
    queryFn: async () => {
      const res = await fetch(`/api/billing/invoices?reservaId=${reservation.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addChargeMutation = useMutation({
    mutationFn: async (chargeData: { description: string; amount: string; category: string; reservationId: string; date: string; isRecurring?: boolean; unitAmount?: string }) => {
      return apiRequest("POST", "/api/charges", chargeData);
    },
    onSuccess: () => {
      refetchCharges();
      setShowAddCharge(false);
      setNewCharge({ description: "", amount: "", category: "otros" });
      toast({ title: "Cargo agregado", description: "El cargo ha sido registrado en el folio." });
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: async (chargeId: string) => {
      console.warn("DEPRECATED: use anularChargeMutation instead");
      return apiRequest("DELETE", `/api/charges/${chargeId}`, undefined);
    },
    onSuccess: () => {
      refetchCharges();
      toast({ title: "Cargo eliminado", description: "El cargo ha sido eliminado del folio." });
    },
  });

  const anularChargeMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      return apiRequest("PATCH", `/api/charges/${id}/anular`, { motivoAnulacion: motivo });
    },
    onSuccess: () => {
      refetchCharges();
      setAnularTarget(null);
      setMotivoAnulacion("");
      toast({ title: "Cargo anulado", description: "El cargo ha sido anulado del folio." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo anular el cargo", variant: "destructive" });
      console.error("Anular charge error:", error);
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (paymentData: { amount: string; method: PaymentMethod; reference?: string; notes?: string; billingTarget?: string; reservationId: string; date: string }) => {
      return apiRequest("POST", "/api/payments", paymentData);
    },
    onSuccess: () => {
      refetchPayments();
      setShowAddPayment(false);
      setNewPayment({ amount: "", method: "efectivo", reference: "", notes: "", billingTarget: "guest" });
      toast({ title: "Pago registrado", description: "El pago ha sido registrado exitosamente." });
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo registrar el pago";
      toast({
        title: "Error al registrar pago",
        description: message,
        variant: "destructive",
      });
      console.error("Payment error:", error);
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      console.warn("DEPRECATED: use anularPaymentMutation instead");
      return apiRequest("DELETE", `/api/payments/${paymentId}`, undefined);
    },
    onSuccess: () => {
      refetchPayments();
      toast({ title: "Pago eliminado", description: "El pago ha sido eliminado del registro." });
    },
  });

  const anularPaymentMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}/anular`, { motivoAnulacion: motivo });
      return res.json();
    },
    onSuccess: (data: any) => {
      refetchPayments();
      setAnularTarget(null);
      setMotivoAnulacion("");
      if (data?.notaCreditoGenerada === false) {
        toast({
          title: "⚠️ Alerta Fiscal",
          description: "El pago fue anulado pero la factura electrónica vinculada NO fue compensada con una Nota de Crédito. Este caso quedó registrado en el log de auditoría. Se requiere acción del responsable fiscal.",
          variant: "destructive",
          duration: 12000,
        });
      } else {
        toast({ title: "Pago anulado", description: "El pago ha sido anulado del registro." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo anular el pago", variant: "destructive" });
      console.error("Anular payment error:", error);
    },
  });


  const relinkInvoiceMutation = useMutation({
    mutationFn: async ({ paymentId, invoiceData }: { paymentId: string; invoiceData: any }) => {
      const res = await apiRequest("PATCH", `/api/payments/${paymentId}/invoice`, { invoiceData });
      if (!res.ok) throw new Error("Re-vínculo fallido");
      return res.json();
    },
    onSuccess: () => {
      refetchPayments();
      toast({ title: "Factura vinculada", description: "La factura quedó vinculada al pago correctamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo vincular la factura. Intente nuevamente.", variant: "destructive" });
    },
  });

  const transferChargeMutation = useMutation({
    mutationFn: async ({ chargeId, targetReservationId }: { chargeId: string; targetReservationId: string }) => {
      return apiRequest("POST", `/api/charges/${chargeId}/transfer`, { targetReservationId });
    },
    onSuccess: () => {
      refetchCharges();
      setTransferringChargeId(null);
      setTargetReservationId("");
      toast({ title: "Cargo transferido", description: "El cargo ha sido transferido a la otra habitación." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo transferir el cargo.", variant: "destructive" });
    },
  });

  const bulkTransferMutation = useMutation({
    mutationFn: async (data: { targetReservationId: string; chargeIds: string[]; includeAccommodation: boolean; transferNote: string; paymentIds: string[] }) => {
      const res = await apiRequest("POST", `/api/reservations/${reservation.id}/bulk-transfer`, data);
      return res.json();
    },
    onSuccess: (data: any) => {
      refetchCharges();
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservation.id] });
      setShowBulkTransfer(false);
      setBulkTargetReservationId("");
      setBulkSelectedChargeIds(new Set());
      setBulkIncludeAccommodation(false);
      setBulkSelectedPaymentIds(new Set());
      setBulkTransferNote("");
      const parts = [];
      if (data.accommodationTransferred) parts.push("alojamiento");
      if (data.chargesTransferred > 0) parts.push(`${data.chargesTransferred} cargo(s) extra`);
      if (data.paymentsTransferred > 0) parts.push(`${data.paymentsTransferred} anticipo(s)`);
      toast({ title: "Transferencia realizada", description: `Se transfirió: ${parts.join(" y ")}.` });
    },
    onError: (err: any) => {
      toast({ title: "Error al transferir", description: err?.message || "No se pudo completar la transferencia.", variant: "destructive" });
    },
  });

  const handleTransferCharge = () => {
    if (!transferringChargeId || !targetReservationId) return;
    transferChargeMutation.mutate({ chargeId: transferringChargeId, targetReservationId });
  };

  const handleAddCharge = () => {
    if (!newCharge.description || !newCharge.amount) return;
    const totalAmount = (parseFloat(newCharge.amount) * chargeQty).toFixed(2);
    const descWithQty = chargeQty > 1 ? `${newCharge.description} (x${chargeQty})` : newCharge.description;
    addChargeMutation.mutate({
      description: descWithQty,
      amount: totalAmount,
      category: newCharge.category,
      reservationId: reservation.id,
      date: getLocalToday(),
      ...(isRecurringCharge && { isRecurring: true, unitAmount: newCharge.amount }),
    });
    setSelectedPreset(null);
    setChargeQty(1);
    setIsRecurringCharge(false);
  };

  // Quickly add one more unit of an existing charge (for cochera, etc.)
  const handleRepeatCharge = (charge: typeof consumptionCharges[0]) => {
    // Strip "(xN)" from description to get the base item name
    const baseDesc = charge.description.replace(/\s*\(x\d+\)$/, "").trim();
    // Find unit price from presets, fallback to stored amount
    const preset = chargePresets.find(p => p.description.toLowerCase() === baseDesc.toLowerCase());
    const unitAmount = preset ? preset.amount : charge.amount;
    const unitCategory = (preset?.category || charge.category) as typeof newCharge.category;
    addChargeMutation.mutate({
      description: baseDesc,
      amount: unitAmount,
      category: unitCategory,
      reservationId: reservation.id,
      date: getLocalToday(),
    });
  };


  const handleAddPayment = () => {
    if (!newPayment.amount) return;
    addPaymentMutation.mutate({
      ...newPayment,
      reservationId: reservation.id,
      date: getLocalToday(),
    });
  };

  const handleAddMultiPayment = async () => {
    const validRows = paymentRows.filter(r => r.amount && parseFloat(r.amount) > 0);
    if (validRows.length === 0) return;

    const missingCompany = validRows.find(
      r => r.method === "cuenta_corriente" && r.billingTarget === "company" && !reservation.companyId && !r.companyId
    );
    if (missingCompany) {
      toast({ title: "Seleccioná una empresa", description: "Elegí a qué empresa se le cargará este pago a cuenta corriente.", variant: "destructive" });
      return;
    }
    const missingAgency = validRows.find(
      r => r.method === "cuenta_corriente" && r.billingTarget === "agency" && !reservation.agencyId && !r.agencyId
    );
    if (missingAgency) {
      toast({ title: "Seleccioná una agencia", description: "Elegí a qué agencia se le cargará este pago a cuenta corriente.", variant: "destructive" });
      return;
    }

    let successCount = 0;
    let lastPaymentId: string | null = null;
    for (const row of validRows) {
      try {
        const res = await addPaymentMutation.mutateAsync({
          amount: row.amount,
          method: row.method as PaymentMethod,
          reference: row.reference || undefined,
          notes: undefined,
          billingTarget: row.billingTarget as "guest" | "company",
          reservationId: reservation.id,
          date: getLocalToday(),
          ...(row.companyId ? { companyId: row.companyId } : {}),
          ...(row.agencyId ? { agencyId: row.agencyId } : {}),
        } as any);
        // Capture the created payment's ID so we can optionally link an invoice
        try {
          const saved = await (res as any).clone().json();
          if (saved?.id) lastPaymentId = saved.id;
        } catch { /* ignore */ }
        successCount++;
      } catch {
        if (successCount > 0) {
          toast({ title: `${successCount} pago(s) registrado(s), pero hubo un error en los restantes`, variant: "destructive" });
        }
        return;
      }
    }
    setShowAddPayment(false);
    setPaymentRows([{ amount: "", method: "efectivo", reference: "", billingTarget: "guest" }]);
    // Only offer invoice linking when a single advance was registered (clear intent)
    if (successCount === 1 && lastPaymentId) {
      setInvoicingPaymentId(lastPaymentId);
    }
  };

  const categoryLabels: Record<string, string> = {
    room: "Habitación",
    restaurant: "Restaurante",
    spa: "Spa",
    minibar: "Minibar",
    otros: "Otros",
    adjustment: "Ajuste",
  };

  const consumptionCharges = charges?.filter((c) => c.category !== "payment") || [];
  const activeConsumptionCharges = consumptionCharges.filter((c) => (c as any).status !== "anulado");
  const totalConsumptions = activeConsumptionCharges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
  const totalPayments = payments?.filter((p) => (p as any).status !== "anulado").reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
  const earlyCharge = parseFloat(reservation.earlyCheckInCharge || "0");
  const lateCharge = parseFloat(reservation.lateCheckOutCharge || "0");
  const subtotalRoom = parseFloat(reservation.totalRoomAmount || "0") + earlyCharge + lateCharge;
  const totalToPay = subtotalRoom + totalConsumptions;
  const balance = totalToPay - totalPayments;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[680px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <>Reserva {reservation.reservationCode}<ReservationStatusBadge status={reservation.status} /></>
          </DialogTitle>
          <DialogDescription>
            Detalle de la reservación
          </DialogDescription>
        </DialogHeader>


        {isLocked && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md text-sm text-amber-700 dark:text-amber-300" data-testid="banner-locked-reservation">
            <Lock className="h-4 w-4 shrink-0" />
            <span>Reserva cerrada — no se puede modificar (solo lectura)</span>
          </div>
        )}

        <Tabs defaultValue="datos" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="datos" data-testid="tab-datos">Datos</TabsTrigger>
            <TabsTrigger value="folio" data-testid="tab-folio">Folio</TabsTrigger>
            <TabsTrigger value="historial" data-testid="tab-historial" className="flex items-center gap-1">
              <History className="h-3 w-3" />
              Historial
              {changelog.length > 0 && <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5">{changelog.length}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="datos" className="space-y-4 mt-4">
            {!editingGuest ? (
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                  {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-lg" data-testid="text-guest-name">
                    {reservation.guest?.lastName} {reservation.guest?.firstName}
                  </p>
                  <p className="text-sm text-muted-foreground">{reservation.guest?.email}</p>
                  {reservation.guest?.phone && (
                    <p className="text-sm text-muted-foreground">{reservation.guest?.phone}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="outline">{reservation.source}</Badge>
                  {!isLocked && reservation.guest?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setGuestEditData({
                          firstName: reservation.guest?.firstName || "",
                          lastName: reservation.guest?.lastName || "",
                          email: reservation.guest?.email || "",
                          phone: reservation.guest?.phone || "",
                          documentType: reservation.guest?.documentType || "DNI",
                          documentNumber: reservation.guest?.documentNumber || "",
                          nationality: reservation.guest?.nationality || "",
                          localidad: reservation.guest?.localidad || "",
                        });
                        setEditingGuest(true);
                      }}
                      data-testid="button-edit-titular"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar titular
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Editar datos del titular</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
                    <Input className="h-8 text-sm" value={guestEditData.firstName} onChange={e => setGuestEditData(p => ({ ...p, firstName: e.target.value }))} data-testid="input-edit-firstname" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Apellido *</label>
                    <Input className="h-8 text-sm" value={guestEditData.lastName} onChange={e => setGuestEditData(p => ({ ...p, lastName: e.target.value }))} data-testid="input-edit-lastname" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                    <Input className="h-8 text-sm" type="email" value={guestEditData.email} onChange={e => setGuestEditData(p => ({ ...p, email: e.target.value }))} data-testid="input-edit-email" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Teléfono</label>
                    <Input className="h-8 text-sm" value={guestEditData.phone} onChange={e => setGuestEditData(p => ({ ...p, phone: e.target.value }))} data-testid="input-edit-phone" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tipo doc.</label>
                    <select
                      value={guestEditData.documentType}
                      onChange={e => setGuestEditData(p => ({ ...p, documentType: e.target.value }))}
                      className="w-full h-8 text-sm border rounded-md px-2 bg-background"
                      data-testid="select-edit-doctype"
                    >
                      <option value="DNI">DNI</option>
                      <option value="Pasaporte">Pasaporte</option>
                      <option value="LC">LC</option>
                      <option value="LE">LE</option>
                      <option value="CI">CI (extranjero)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nº documento</label>
                    <Input className="h-8 text-sm" value={guestEditData.documentNumber} onChange={e => setGuestEditData(p => ({ ...p, documentNumber: e.target.value }))} data-testid="input-edit-docnumber" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nacionalidad</label>
                    <Input className="h-8 text-sm" value={guestEditData.nationality} onChange={e => setGuestEditData(p => ({ ...p, nationality: e.target.value }))} data-testid="input-edit-nationality" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ciudad</label>
                    <Input className="h-8 text-sm" value={guestEditData.localidad} onChange={e => setGuestEditData(p => ({ ...p, localidad: e.target.value }))} data-testid="input-edit-localidad" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingGuest(false)}>Cancelar</Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!guestEditData.firstName || !guestEditData.lastName || updateGuestMutation.isPending}
                    onClick={() => updateGuestMutation.mutate(guestEditData)}
                    data-testid="button-save-titular"
                  >
                    {updateGuestMutation.isPending ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </div>
              </div>
            )}

            {reservation.guest?.localidad && (
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Ciudad</p>
                <p className="text-sm">
                  {reservation.guest.localidad}
                  {reservation.guest.nationality && ` - ${reservation.guest.nationality}`}
                </p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-3 border rounded-lg">
                <DoorOpen className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Hab.</p>
                <p className="font-semibold" data-testid="text-room-number">{reservation.room?.roomNumber}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <Calendar className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Check-in</p>
                <p className="font-semibold text-sm" data-testid="text-checkin">{formatDateAR(reservation.checkInDate)}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <Calendar className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Check-out</p>
                <p className="font-semibold text-sm" data-testid="text-checkout">{formatDateAR(reservation.checkOutDate)}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <User className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Noches</p>
                <p className="font-semibold" data-testid="text-nights">{reservation.nights}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Tipo de Habitación</p>
                <p className="font-medium">{reservation.room?.roomType?.name || "—"}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Huéspedes</p>
                <p className="font-medium">{reservation.numberOfGuests} persona(s)</p>
              </div>
            </div>

            {reservation.notes && (
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Notas</p>
                <p className="text-sm">{reservation.notes}</p>
              </div>
            )}

            {/* Companions Section */}
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Acompañantes</span>
                  {companions.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{companions.length}</Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowAddCompanion(v => !v)}
                  data-testid="button-add-companion"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Agregar
                </Button>
              </div>

              {showAddCompanion && (
                <div className="p-4 border-t bg-muted/10 space-y-3">
                  {/* Mode toggle */}
                  <div className="flex rounded-md border overflow-hidden text-xs">
                    <button type="button"
                      className={`flex-1 py-1.5 transition-colors ${companionMode === "search" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"}`}
                      onClick={() => { setCompanionMode("search"); setCompanionQ(""); setCompanionHits([]); }}
                    >Buscar existente</button>
                    <button type="button"
                      className={`flex-1 py-1.5 transition-colors border-l ${companionMode === "new" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"}`}
                      onClick={() => { setCompanionMode("new"); setCompanionQ(""); setCompanionHits([]); }}
                    >Nuevo</button>
                  </div>

                  {companionMode === "search" ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Buscar por nombre, apellido o DNI..."
                          value={companionQ}
                          className="h-8 text-sm pl-8"
                          data-testid="input-companion-search"
                          onChange={async e => {
                            const q = e.target.value;
                            setCompanionQ(q);
                            if (q.length < 2) { setCompanionHits([]); return; }
                            setCompanionSearching(true);
                            try {
                              const r = await fetch(`/api/guests/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
                              setCompanionHits(await r.json() || []);
                            } catch { setCompanionHits([]); } finally { setCompanionSearching(false); }
                          }}
                        />
                        {companionSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                      {companionQ.length >= 2 && companionHits.length > 0 && (
                        <div className="border rounded-md bg-popover shadow-md max-h-44 overflow-y-auto">
                          {companionHits.map((g: GuestHit) => (
                            <button key={g.id} type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex flex-col border-b last:border-0"
                              onClick={() => {
                                addCompanionMutation.mutate({
                                  firstName: g.firstName,
                                  lastName: g.lastName || "",
                                  documentType: "DNI",
                                  documentNumber: g.documentNumber || "",
                                  dateOfBirth: "",
                                  nationality: "",
                                  guestId: g.id,
                                });
                                setCompanionQ(""); setCompanionHits([]);
                              }}
                            >
                              <span className="font-medium">{g.lastName} {g.firstName}</span>
                              {g.documentNumber && <span className="text-xs text-muted-foreground">DNI {g.documentNumber}</span>}
                              <span className="text-xs text-green-600 font-medium">← Vincular al CRM</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {companionQ.length >= 2 && !companionSearching && companionHits.length === 0 && (
                        <p className="text-xs text-muted-foreground">Sin resultados. <button type="button" className="text-primary underline" onClick={() => setCompanionMode("new")}>Agregar nuevo</button></p>
                      )}
                      {companionQ.length > 0 && companionQ.length < 2 && (
                        <p className="text-xs text-muted-foreground">Escribí al menos 2 caracteres</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
                          <Input placeholder="Nombre" value={newCompanion.firstName} onChange={e => setNewCompanion(p => ({ ...p, firstName: e.target.value }))} data-testid="input-companion-firstname" className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Apellido *</label>
                          <Input placeholder="Apellido" value={newCompanion.lastName} onChange={e => setNewCompanion(p => ({ ...p, lastName: e.target.value }))} data-testid="input-companion-lastname" className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Tipo doc.</label>
                          <select value={newCompanion.documentType} onChange={e => setNewCompanion(p => ({ ...p, documentType: e.target.value }))} className="w-full h-8 text-sm border rounded-md px-2 bg-background" data-testid="select-companion-doctype">
                            <option value="DNI">DNI</option>
                            <option value="Pasaporte">Pasaporte</option>
                            <option value="LC">LC</option>
                            <option value="LE">LE</option>
                            <option value="CI">CI (extranjero)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Nº documento</label>
                          <Input placeholder="Número" value={newCompanion.documentNumber} onChange={e => setNewCompanion(p => ({ ...p, documentNumber: e.target.value }))} data-testid="input-companion-docnumber" className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Fecha de nacimiento</label>
                          <Input type="date" value={newCompanion.dateOfBirth} onChange={e => setNewCompanion(p => ({ ...p, dateOfBirth: e.target.value }))} data-testid="input-companion-dob" className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Nacionalidad</label>
                          <NationalityCombobox value={newCompanion.nationality} onChange={(name) => setNewCompanion(p => ({ ...p, nationality: name }))} />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setShowAddCompanion(false); setCompanionQ(""); setCompanionHits([]); setNewCompanion(emptyComp); setCompanionMode("search"); }}>
                      Cancelar
                    </Button>
                    {companionMode === "new" && (
                      <Button size="sm" className="h-7 text-xs" disabled={!newCompanion.firstName || !newCompanion.lastName || addCompanionMutation.isPending} onClick={() => addCompanionMutation.mutate(newCompanion)} data-testid="button-save-companion">
                        {addCompanionMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Guardar
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {companions.length === 0 && !showAddCompanion ? (
                <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                  Sin acompañantes registrados
                </div>
              ) : (
                <ul className="divide-y">
                  {companions.map((c: any) => (
                    <li key={c.id} data-testid={`companion-row-${c.id}`}>
                      {editingCompanionId === c.id ? (
                        <div className="p-3 bg-muted/10 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
                              <Input
                                placeholder="Nombre"
                                value={editCompanionData.firstName}
                                onChange={e => setEditCompanionData(p => ({ ...p, firstName: e.target.value }))}
                                className="h-8 text-sm"
                                data-testid={`input-edit-comp-firstname-${c.id}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Apellido *</label>
                              <Input
                                placeholder="Apellido"
                                value={editCompanionData.lastName}
                                onChange={e => setEditCompanionData(p => ({ ...p, lastName: e.target.value }))}
                                className="h-8 text-sm"
                                data-testid={`input-edit-comp-lastname-${c.id}`}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Tipo doc.</label>
                              <select
                                value={editCompanionData.documentType}
                                onChange={e => setEditCompanionData(p => ({ ...p, documentType: e.target.value }))}
                                className="w-full h-8 text-sm border rounded-md px-2 bg-background"
                                data-testid={`select-edit-comp-doctype-${c.id}`}
                              >
                                <option value="DNI">DNI</option>
                                <option value="Pasaporte">Pasaporte</option>
                                <option value="LC">LC</option>
                                <option value="LE">LE</option>
                                <option value="CI">CI (extranjero)</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Nº documento</label>
                              <Input
                                placeholder="Número"
                                value={editCompanionData.documentNumber}
                                onChange={e => setEditCompanionData(p => ({ ...p, documentNumber: e.target.value }))}
                                className="h-8 text-sm"
                                data-testid={`input-edit-comp-docnumber-${c.id}`}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Fecha de nacimiento</label>
                              <Input
                                type="date"
                                value={editCompanionData.dateOfBirth}
                                onChange={e => setEditCompanionData(p => ({ ...p, dateOfBirth: e.target.value }))}
                                className="h-8 text-sm"
                                data-testid={`input-edit-comp-dob-${c.id}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Nacionalidad</label>
                              <NationalityCombobox
                                value={editCompanionData.nationality}
                                onChange={(name) => setEditCompanionData(p => ({ ...p, nationality: name }))}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => { setEditingCompanionId(null); setEditCompanionData(emptyComp); }}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!editCompanionData.firstName || !editCompanionData.lastName || updateCompanionMutation.isPending}
                              onClick={() => updateCompanionMutation.mutate({ id: c.id, data: editCompanionData })}
                              data-testid={`button-save-edit-companion-${c.id}`}
                            >
                              Guardar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                              {c.lastName?.[0]}{c.firstName?.[0]}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{c.lastName} {c.firstName}</p>
                              <p className="text-xs text-muted-foreground">
                                {c.documentType} {c.documentNumber || "—"}
                                {c.nationality ? ` · ${c.nationality}` : ""}
                                {c.dateOfBirth ? ` · ${new Date(c.dateOfBirth).toLocaleDateString("es-AR")}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {c.guestId ? (
                              <Badge variant="secondary" className="text-xs gap-1 text-green-700 bg-green-50 border-green-200 hover:bg-green-100 cursor-default" title="Perfil de huésped vinculado al CRM">
                                <Link2 className="h-3 w-3" /> En CRM
                              </Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground gap-1"
                                onClick={() => promoteCompanionMutation.mutate(c.id)}
                                disabled={promoteCompanionMutation.isPending}
                                title="Crear perfil de huésped en el CRM"
                                data-testid={`button-promote-companion-${c.id}`}
                              >
                                <UserPlus className="h-3 w-3" /> Crear perfil
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setEditingCompanionId(c.id);
                                setEditCompanionData({
                                  firstName: c.firstName || "",
                                  lastName: c.lastName || "",
                                  documentType: c.documentType || "DNI",
                                  documentNumber: c.documentNumber || "",
                                  dateOfBirth: c.dateOfBirth ? c.dateOfBirth.split("T")[0] : "",
                                  nationality: c.nationality || "",
                                });
                                setShowAddCompanion(false);
                              }}
                              data-testid={`button-edit-companion-${c.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteCompanionMutation.mutate(c.id)}
                              data-testid={`button-delete-companion-${c.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(reservation.contactName || reservation.contactPhone) && (
              <div className="rounded-lg border border-dashed p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contacto de la Reserva</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {reservation.contactName && (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{reservation.contactName}</span>
                    </span>
                  )}
                  {reservation.contactPhone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{reservation.contactPhone}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="folio" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Plan Tarifario</p>
                <p className="font-medium">{reservation.ratePlan?.name || "Tarifa Base"}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Estado</p>
                <ReservationStatusBadge status={reservation.status} />
              </div>
            </div>
            {reservation.isUpgrade && (
              <div className="p-3 border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Up Grade aplicado</p>
                </div>
                {reservation.originalRoomTypeId && (() => {
                  const origType = (reservation as any).originalRoomType;
                  return origType ? (
                    <p className="text-sm text-muted-foreground">Tipo reservado: <span className="font-medium text-foreground">{origType.name}</span></p>
                  ) : null;
                })()}
                <p className="text-sm text-muted-foreground mt-0.5">Habitación asignada: <span className="font-medium text-foreground">Hab. {reservation.room?.roomNumber} — {reservation.room?.roomType?.name}</span></p>
              </div>
            )}
            {(reservation.voucherCode || reservation.voucherNotes) && (
              <div className="p-3 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-950/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <Ticket className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Voucher</p>
                </div>
                {reservation.voucherCode && (
                  <p className="text-sm"><span className="text-muted-foreground">Código:</span> <span className="font-medium font-mono">{reservation.voucherCode}</span></p>
                )}
                {reservation.voucherNotes && (
                  <p className="text-sm mt-1"><span className="text-muted-foreground">Observación:</span> {reservation.voucherNotes}</p>
                )}
              </div>
            )}

            {!isLocked && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
                  onClick={() => {
                    setBulkSelectedChargeIds(new Set());
                    setBulkIncludeAccommodation(false);
                    setBulkTargetReservationId("");
                    setBulkTransferNote("");
                    setShowBulkTransfer(true);
                  }}
                  data-testid="button-bulk-transfer"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Transferir folio a otra habitación
                </Button>
              </div>
            )}

            <div className="border rounded-lg">
              <div className="p-3 border-b bg-muted/50">
                <h4 className="font-semibold">Resumen de Alojamiento</h4>
              </div>
              <div className="p-3">
                <div className="flex justify-between text-sm mb-2">
                  <span>Tarifa por noche</span>
                  <span>${(parseFloat(reservation.totalRoomAmount || "0") / (reservation.nights || 1)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {reservation.discountType !== "none" && (
                  <div className="flex justify-between text-sm mb-2 text-muted-foreground">
                    <span>Descuento aplicado ({reservation.discountType === "percent" ? `${reservation.discountValue}%` : `$${reservation.discountValue}`})</span>
                    <span>—</span>
                  </div>
                )}
                <div className="flex justify-between text-sm mb-2">
                  <span>Cantidad de noches</span>
                  <span>x {reservation.nights}</span>
                </div>
                {earlyCharge > 0 && (
                  <div className="flex justify-between text-sm mb-2 text-amber-600 dark:text-amber-400">
                    <span>+ Early Check-in{reservation.earlyCheckInTime ? ` (${reservation.earlyCheckInTime} hs)` : ""}</span>
                    <span>${fmtMoney(earlyCharge)}</span>
                  </div>
                )}
                {lateCharge > 0 && (
                  <div className="flex justify-between text-sm mb-2 text-amber-600 dark:text-amber-400">
                    <span>+ Late Check-out{reservation.lateCheckOutTime ? ` (${reservation.lateCheckOutTime} hs)` : ""}</span>
                    <span>${fmtMoney(lateCharge)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Subtotal Alojamiento</span>
                  <span data-testid="text-subtotal-room">${fmtMoney(subtotalRoom)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">* Precio incluye IVA (21%). El desglose se realiza al facturar.</p>
              </div>
            </div>

            <div className="border rounded-lg">
              <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                <h4 className="font-semibold">Consumos / Cargos Adicionales</h4>
                {!isLocked && (
                <Button size="sm" variant="outline" onClick={() => setShowAddCharge(!showAddCharge)} data-testid="button-add-charge">
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
                )}
              </div>

              {showAddCharge && (
                <div className="p-3 border-b bg-muted/30 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Tipo de cargo</Label>
                    <Select
                      value={selectedPreset?.label || ""}
                      onValueChange={(val) => {
                        const preset = chargePresets.find(p => p.label === val);
                        if (preset) {
                          setSelectedPreset(preset);
                          setNewCharge({
                            description: preset.description,
                            amount: preset.amount,
                            category: preset.category,
                          });
                          setChargeQty(1);
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-charge-preset">
                        <SelectValue placeholder="Seleccionar tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {chargePresets.map((p) => (
                          <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-4 gap-2 items-end">
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground mb-1 block">Descripción</Label>
                      <Input
                        placeholder="Descripción del cargo"
                        value={newCharge.description}
                        onChange={(e) => setNewCharge({ ...newCharge, description: e.target.value })}
                        disabled={!selectedPreset?.allowPriceEdit}
                        data-testid="input-charge-description"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Precio unit. <span className="text-xs">(con IVA)</span>
                        {selectedPreset?.allowPriceEdit && selectedPreset?.label !== "Cargo editable" && (
                          <span className="ml-1 text-amber-600 font-medium">· variable</span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={newCharge.amount}
                        onChange={(e) => setNewCharge({ ...newCharge, amount: e.target.value })}
                        disabled={!selectedPreset?.allowPriceEdit}
                        data-testid="input-charge-unit-price"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Cantidad</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={chargeQty}
                        onChange={(e) => {
                          setIsRecurringCharge(false);
                          setChargeQty(Math.max(1, parseInt(e.target.value) || 1));
                        }}
                        data-testid="input-charge-qty"
                      />
                    </div>
                  </div>

                  {/* Toggle cargo repetitivo por noche — solo para tipos habilitados */}
                  {selectedPreset?.allowRecurring && (
                  <div className="flex items-center gap-3 py-1">
                    <Switch
                      id="recurring-charge-toggle"
                      checked={isRecurringCharge}
                      onCheckedChange={(checked) => {
                        setIsRecurringCharge(checked);
                        setChargeQty(checked ? (reservation.nights || 1) : 1);
                      }}
                      data-testid="switch-recurring-charge"
                    />
                    <Label htmlFor="recurring-charge-toggle" className="text-xs cursor-pointer select-none flex items-center gap-1.5">
                      <span>Cargo por noche</span>
                      {isRecurringCharge && (
                        <span className="text-muted-foreground">· se multiplica por {reservation.nights || 1} noche{(reservation.nights || 1) !== 1 ? "s" : ""}</span>
                      )}
                    </Label>
                  </div>
                  )}

                  {newCharge.amount && isRecurringCharge && (
                    <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm">
                      <span className="text-blue-700 dark:text-blue-300 font-medium">
                        {reservation.nights || 1} noches × ${fmtMoney(newCharge.amount || "0")} = <span className="font-bold">${(parseFloat(newCharge.amount || "0") * (reservation.nights || 1)).toFixed(2)}</span>
                      </span>
                    </div>
                  )}

                  {newCharge.amount && !isRecurringCharge && chargeQty > 1 && (
                    <div className="text-sm text-right text-muted-foreground">
                      Total: <span className="font-semibold text-foreground">
                        ${fmtMoney(parseFloat(newCharge.amount || "0") * chargeQty)}
                      </span>
                      <span className="ml-1 text-xs">
                        ({chargeQty} × ${fmtMoney(newCharge.amount || "0")})
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Categoría</Label>
                      <Select
                        value={newCharge.category}
                        onValueChange={(value) => setNewCharge({ ...newCharge, category: value as typeof newCharge.category })}
                        disabled={!selectedPreset?.allowPriceEdit}
                      >
                        <SelectTrigger data-testid="select-charge-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restaurant">Restaurante</SelectItem>
                          <SelectItem value="spa">Spa</SelectItem>
                          <SelectItem value="minibar">Minibar / Frigobar</SelectItem>
                          <SelectItem value="otros">Otros</SelectItem>
                          <SelectItem value="adjustment">Ajuste</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowAddCharge(false);
                        setSelectedPreset(null);
                        setChargeQty(1);
                        setIsRecurringCharge(false);
                        setNewCharge({ description: "", amount: "", category: "otros" });
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddCharge}
                      disabled={!selectedPreset || !newCharge.description || !newCharge.amount || addChargeMutation.isPending}
                      data-testid="button-confirm-charge"
                    >
                      {addChargeMutation.isPending ? "Guardando..." : `Agregar${chargeQty > 1 ? ` (${chargeQty})` : ""}`}
                    </Button>
                  </div>
                </div>
              )}

              <div className="divide-y max-h-[150px] overflow-y-auto">
                {consumptionCharges.map((charge) => {
                  const isAnulado = (charge as any).status === "anulado";
                  const restaurantOrderNum = charge.category === "restaurant"
                    ? (charge.description.match(/Pedido\s+(\S+)/)?.[1] ?? null)
                    : null;
                  return (
                  <div key={charge.id} className={`flex items-center justify-between p-3 text-sm ${isAnulado ? "opacity-50 bg-muted/30" : ""}`} data-testid={`charge-row-${charge.id}`}>
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0">{categoryLabels[charge.category]}</Badge>
                      {isAnulado && <Badge variant="destructive" className="text-xs shrink-0">ANULADO</Badge>}
                      {(charge as any).isRecurring && <Badge variant="secondary" className="text-xs shrink-0 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">×noche</Badge>}
                      <span className={`truncate ${isAnulado ? "line-through text-muted-foreground" : ""}`}>{charge.description}</span>
                      <span className="text-muted-foreground text-xs shrink-0">({formatDateAR(charge.date)})</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <span className={`font-medium tabular-nums ${isAnulado ? "line-through text-muted-foreground" : ""}`} data-testid={`text-charge-amount-${charge.id}`}>
                        ${fmtMoney(charge.amount)}
                      </span>
                      {restaurantOrderNum && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setRestaurantVoucherOrderNum(restaurantOrderNum)}
                          title="Ver detalle del consumo"
                          data-testid={`button-voucher-${charge.id}`}
                        >
                          <Eye className="h-3 w-3 text-orange-500" />
                        </Button>
                      )}
                      {!isLocked && !isAnulado && (
                        <>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6"
                          onClick={() => handleRepeatCharge(charge)}
                          title="Agregar una unidad más de este cargo"
                          disabled={addChargeMutation.isPending}
                          data-testid={`button-repeat-charge-${charge.id}`}
                        >
                          <PlusCircle className="h-3 w-3 text-green-600" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6"
                          onClick={() => setTransferringChargeId(charge.id)}
                          title="Transferir a otra habitación"
                          data-testid={`button-transfer-charge-${charge.id}`}
                        >
                          <ArrowRightLeft className="h-3 w-3 text-blue-600" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6"
                          onClick={() => { setAnularTarget({ type: "cargo", id: charge.id }); setMotivoAnulacion(""); }}
                          title="Anular cargo"
                          data-testid={`button-anular-charge-${charge.id}`}
                        >
                          <Ban className="h-3 w-3 text-destructive" />
                        </Button>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
                {consumptionCharges.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    Sin consumos adicionales
                  </div>
                )}
              </div>
              <div className="flex justify-between p-3 border-t text-sm font-medium">
                <span>Total Consumos</span>
                <span data-testid="text-total-consumptions">${fmtMoney(totalConsumptions)}</span>
              </div>
            </div>

            {/* Dialog detalle consumo restaurant */}
            <Dialog open={!!restaurantVoucherOrderNum} onOpenChange={(o) => { if (!o) setRestaurantVoucherOrderNum(null); }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Detalle de Consumo — Restaurante</DialogTitle>
                  {restaurantVoucherDetail && (
                    <DialogDescription>
                      Pedido #{restaurantVoucherDetail.orderNumber}
                      {restaurantVoucherDetail.waiterName ? ` · Mozo: ${restaurantVoucherDetail.waiterName}` : ""}
                    </DialogDescription>
                  )}
                </DialogHeader>
                {isLoadingVoucher ? (
                  <div className="space-y-2 py-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : restaurantVoucherDetail ? (
                  <div className="space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descripción</TableHead>
                          <TableHead className="text-center w-14">Cant.</TableHead>
                          <TableHead className="text-right w-28">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(restaurantVoucherDetail.items || []).map((item: any) => {
                          const customName = (item.notes || "").match(/^\[(.+?)\]/)?.[1];
                          const displayName = customName || item.menuItemName || "Ítem";
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm">
                                {displayName}
                                {item.notes && !customName && <span className="block text-xs text-muted-foreground">{item.notes}</span>}
                              </TableCell>
                              <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                ${parseFloat(item.subtotal || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="flex justify-between font-semibold text-sm pt-1 border-t px-1">
                      <span>Total</span>
                      <span>${parseFloat(restaurantVoucherDetail.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">* Precio incluye IVA. El desglose se realiza al facturar al huésped.</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No se encontró el detalle del pedido.</p>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRestaurantVoucherOrderNum(null)}>Cerrar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="border rounded-lg">
              <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                <h4 className="font-semibold">Pagos / Anticipos</h4>
                {!isLocked && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (!showAddPayment) {
                    const amt = balance > 0 ? fmtMoney(balance) : "";
                    setNewPayment({ ...newPayment, amount: amt });
                    setPaymentRows([{ amount: amt, method: "efectivo", reference: "", billingTarget: "guest" }]);
                  }
                  setShowAddPayment(!showAddPayment);
                }} data-testid="button-add-payment">
                  <Plus className="h-4 w-4 mr-1" />
                  Registrar Pago
                </Button>
                )}
              </div>

              {showAddPayment && (
                <div className="p-3 border-b bg-muted/30 space-y-2">
                  {paymentRows.map((row, index) => (
                    <div key={index} className="space-y-1">
                      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                          <Input
                            type="number"
                            placeholder="Monto"
                            value={row.amount}
                            onChange={(e) => {
                              const updated = [...paymentRows];
                              updated[index].amount = e.target.value;
                              setPaymentRows(updated);
                            }}
                            className="pl-7"
                            data-testid={`input-payment-amount-${index}`}
                          />
                        </div>
                        <Select
                          value={row.method}
                          onValueChange={(value) => {
                            const updated = [...paymentRows];
                            updated[index].method = value;
                            setPaymentRows(updated);
                          }}
                        >
                          <SelectTrigger data-testid={`select-payment-method-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="tarjeta_debito">Débito</SelectItem>
                            <SelectItem value="tarjeta_credito">Crédito</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="mercadopago">MercadoPago</SelectItem>
                            <SelectItem value="cuenta_corriente">Cta. Cte.</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex gap-1 items-center">
                          <Input
                            placeholder="Ref."
                            value={row.reference}
                            onChange={(e) => {
                              const updated = [...paymentRows];
                              updated[index].reference = e.target.value;
                              setPaymentRows(updated);
                            }}
                            className="flex-1"
                            data-testid={`input-payment-reference-${index}`}
                          />
                          <Select
                            value={row.billingTarget}
                            onValueChange={(value) => {
                              const updated = [...paymentRows];
                              updated[index].billingTarget = value;
                              setPaymentRows(updated);
                            }}
                          >
                            <SelectTrigger className="w-[90px]" data-testid={`select-billing-target-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="guest">Huésped</SelectItem>
                              <SelectItem value="company">Empresa</SelectItem>
                              <SelectItem value="agency">Agencia</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Aviso CC huésped individual */}
                        {row.method === "cuenta_corriente" && row.billingTarget === "guest" && (
                          <div className="flex items-start gap-1.5 mt-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-2 py-1.5">
                            <Users2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-blue-700 dark:text-blue-400 leading-tight">
                              El cargo se registrará en la Cuenta Corriente del huésped
                              {reservation.guest ? <strong> {reservation.guest.lastName} {reservation.guest.firstName}</strong> : ""}.
                            </p>
                          </div>
                        )}
                        {row.method === "cuenta_corriente" && row.billingTarget === "company" && !reservation.companyId && !row.companyId && (
                          <div className="flex items-start gap-1.5 mt-1 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-2 py-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-tight">
                              Seleccioná una empresa para que el cargo quede registrado en su cuenta corriente.
                            </p>
                          </div>
                        )}
                        {row.method === "cuenta_corriente" && row.billingTarget === "agency" && !reservation.agencyId && !row.agencyId && (
                          <div className="flex items-start gap-1.5 mt-1 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-2 py-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-tight">
                              Seleccioná una agencia para que el cargo quede registrado en su cuenta corriente.
                            </p>
                          </div>
                        )}
                        {/* Selector de empresa/agencia para cuenta corriente */}
                        {row.method === "cuenta_corriente" && row.billingTarget === "company" && !reservation.companyId && (
                          <div className="flex items-center gap-1 mt-1">
                            <Select
                              value={row.companyId || ""}
                              onValueChange={(value) => {
                                const updated = [...paymentRows];
                                updated[index].companyId = value;
                                setPaymentRows(updated);
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`select-cc-company-${index}`}>
                                <SelectValue placeholder="Seleccionar empresa..." />
                              </SelectTrigger>
                              <SelectContent>
                                {companiesForCC.filter(c => c.id).map(c => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.razonSocial || c.nombreFantasia}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {row.method === "cuenta_corriente" && row.billingTarget === "company" && reservation.companyId && (
                          <p className="text-xs text-muted-foreground mt-1">
                            CC: {(reservation as any).company?.razonSocial || "empresa vinculada"}
                          </p>
                        )}
                        {row.method === "cuenta_corriente" && row.billingTarget === "agency" && !reservation.agencyId && (
                          <div className="flex items-center gap-1 mt-1">
                            <Select
                              value={row.agencyId || ""}
                              onValueChange={(value) => {
                                const updated = [...paymentRows];
                                updated[index].agencyId = value;
                                setPaymentRows(updated);
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`select-cc-agency-${index}`}>
                                <SelectValue placeholder="Seleccionar agencia..." />
                              </SelectTrigger>
                              <SelectContent>
                                {agenciesForCC.filter(a => a.id).map(a => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.razonSocial || a.nombreFantasia}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {row.method === "cuenta_corriente" && row.billingTarget === "agency" && reservation.agencyId && (
                          <p className="text-xs text-muted-foreground mt-1">
                            CC: {(reservation as any).agency?.razonSocial || "agencia vinculada"}
                          </p>
                        )}
                        {paymentRows.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setPaymentRows(paymentRows.filter((_, i) => i !== index))}
                            data-testid={`button-remove-payment-row-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setPaymentRows([...paymentRows, { amount: "", method: "efectivo", reference: "", billingTarget: "guest" }])}
                      data-testid="button-add-payment-row"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar método
                    </Button>
                    <span>
                      Total: ${fmtMoney(paymentRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0))}
                    </span>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button size="sm" variant="ghost" onClick={() => { setShowAddPayment(false); setPaymentRows([{ amount: "", method: "efectivo", reference: "", billingTarget: "guest" }]); }}>
                      Cancelar
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleAddMultiPayment} 
                      disabled={addPaymentMutation.isPending || paymentRows.every(r => !r.amount)}
                      data-testid="button-confirm-payment"
                    >
                      Confirmar
                    </Button>
                  </div>
                </div>
              )}

              {payments?.some((p: any) => p.invoiceLinkFailed) && (
                <div className="flex items-start gap-2 p-2 mx-0 mb-1 rounded-md bg-orange-50 border border-orange-300 dark:bg-orange-950/30 dark:border-orange-700 text-xs text-orange-800 dark:text-orange-300" data-testid="invoice-link-failed-banner">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-600" />
                  <span>Hay <strong>{payments.filter((p: any) => p.invoiceLinkFailed).length}</strong> pago(s) con factura emitida pero no vinculada. Usá «Re-vincular» para corregirlo.</span>
                </div>
              )}
              <div className="divide-y max-h-[120px] overflow-y-auto">
                {payments?.map((payment) => {
                  const isAnulado = (payment as any).status === "anulado";
                  const linkFailed = !!(payment as any).invoiceLinkFailed;
                  const invoiceRef = (() => { try { return (payment as any).invoiceRef ? JSON.parse((payment as any).invoiceRef) : null; } catch { return null; } })();
                  const invoiceBadgeText = invoiceRef && !linkFailed
                    ? `${invoiceRef.tipo_comprobante ?? "FAC"} ${String(invoiceRef.punto_venta ?? "").padStart(4, "0")}-${String(invoiceRef.numero ?? "").padStart(8, "0")}`
                    : null;
                  return (
                  <div key={payment.id} className={`flex items-center justify-between p-3 text-sm ${isAnulado ? "opacity-50 bg-muted/30" : ""} ${linkFailed && !isAnulado ? "bg-orange-50/50 dark:bg-orange-950/10" : ""}`} data-testid={`payment-row-${payment.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{paymentMethodLabels[payment.method]}</Badge>
                      {isAnulado && <Badge variant="destructive" className="text-xs">ANULADO</Badge>}
                      {linkFailed && !isAnulado && (
                        <Badge variant="outline" className="text-xs text-orange-700 border-orange-400 bg-orange-50 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-600">
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" />Vínculo pendiente
                        </Badge>
                      )}
                      {invoiceBadgeText && !isAnulado && (
                        <Badge variant="secondary" className="text-xs text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                          <FileText className="h-2.5 w-2.5 mr-1" />{invoiceBadgeText}
                        </Badge>
                      )}
                      {!invoiceBadgeText && !linkFailed && !isAnulado && (
                        <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-700">
                          <AlertCircle className="h-2.5 w-2.5 mr-1" />Sin factura
                        </Badge>
                      )}
                      {(payment as any).billingTarget === "company" && (
                        <Badge variant="secondary" className="text-xs">Empresa</Badge>
                      )}
                      {payment.reference && <span className={`text-muted-foreground ${isAnulado ? "line-through" : ""}`}>{payment.reference}</span>}
                      <span className="text-muted-foreground text-xs">({formatDateAR(payment.date)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isAnulado ? "line-through text-muted-foreground" : "text-green-600"}`}>${fmtMoney(payment.amount)}</span>
                      {linkFailed && !isAnulado && invoiceRef && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2 border-orange-400 text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-600"
                          disabled={relinkInvoiceMutation.isPending}
                          onClick={() => relinkInvoiceMutation.mutate({ paymentId: payment.id, invoiceData: invoiceRef })}
                          title="Re-vincular factura a este pago"
                          data-testid={`button-relink-payment-${payment.id}`}
                        >
                          <Undo2 className="h-3 w-3 mr-1" />Re-vincular
                        </Button>
                      )}
                      {!isLocked && !isAnulado && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => {
                          const inv = (() => { try { return (payment as any).invoiceRef ? JSON.parse((payment as any).invoiceRef) : null; } catch { return null; } })();
                          setAnularTarget({ type: "pago", id: payment.id });
                          setMotivoAnulacion("");
                          setAnularEmitirNC(!!inv); // auto-check NC when payment has invoice
                        }}
                        title="Anular pago"
                        data-testid={`button-anular-payment-${payment.id}`}
                      >
                        <Ban className="h-3 w-3 text-destructive" />
                      </Button>
                      )}
                    </div>
                  </div>
                  );
                })}
                {(!payments || payments.length === 0) && (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    Sin pagos registrados
                  </div>
                )}
              </div>

              {/* Prompt to emit invoice for a just-registered advance */}
              {invoicingPaymentId && (() => {
                const p = payments?.find((x: any) => x.id === invoicingPaymentId);
                const g = reservation.guest;
                const advanceInitial: EmitirFacturaInitialValues = {
                  razonSocial: g ? `${g.lastName} ${g.firstName}` : "",
                  cuit: g?.cuit || undefined,
                  dni: g?.documentNumber || undefined,
                  items: p ? [{ descripcion: `Anticipo — Reserva ${reservation.reservationCode}`, precioUnitario: parseFloat(p.amount) }] : [],
                };
                return (
                  <div className="p-3 border-t bg-blue-50/60 dark:bg-blue-950/20 flex items-start gap-3">
                    <FileText className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-blue-800 dark:text-blue-300">Anticipo registrado</p>
                      <p className="text-xs text-blue-700 dark:text-blue-400">¿Emitir factura electrónica por este anticipo?</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setInvoicingPaymentId(null)}>Omitir</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => setShowAdvanceFacturar(true)}>Emitir</Button>
                    </div>
                    {showAdvanceFacturar && (
                      <EmitirFacturaDialog
                        open={showAdvanceFacturar}
                        onClose={() => setShowAdvanceFacturar(false)}
                        config={billingConfig}
                        initialValues={advanceInitial}
                        paymentId={invoicingPaymentId || undefined}
                        onSuccess={() => {
                          refetchPayments();
                          setInvoicingPaymentId(null);
                          setShowAdvanceFacturar(false);
                          toast({ title: "Factura vinculada", description: "La factura electrónica fue vinculada al anticipo." });
                        }}
                      />
                    )}
                  </div>
                );
              })()}

              <div className="flex justify-between p-3 border-t text-sm font-medium">
                <span>Total Pagado</span>
                <span className="text-green-600" data-testid="text-total-payments">${fmtMoney(totalPayments)}</span>
              </div>
            </div>

            <div className="border rounded-lg bg-primary/5">
              <div className="p-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Subtotal Alojamiento</span>
                  <span>${fmtMoney(reservation.totalRoomAmount || "0")}</span>
                </div>
                {earlyCharge > 0 && (
                  <div className="flex justify-between text-sm mb-1 text-amber-600 dark:text-amber-400">
                    <span>+ Early Check-in{reservation.earlyCheckInTime ? ` (${reservation.earlyCheckInTime} hs)` : ""}</span>
                    <span>${fmtMoney(earlyCharge)}</span>
                  </div>
                )}
                {lateCharge > 0 && (
                  <div className="flex justify-between text-sm mb-1 text-amber-600 dark:text-amber-400">
                    <span>+ Late Check-out{reservation.lateCheckOutTime ? ` (${reservation.lateCheckOutTime} hs)` : ""}</span>
                    <span>${fmtMoney(lateCharge)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm mb-1">
                  <span>+ Consumos</span>
                  <span>${fmtMoney(totalConsumptions)}</span>
                </div>
                <div className="flex justify-between text-sm mb-2 border-b pb-2">
                  <span>- Pagos/Anticipos</span>
                  <span className="text-green-600">-${fmtMoney(totalPayments)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>SALDO PENDIENTE</span>
                  <span className={balance > 0 ? "text-destructive" : "text-green-600"} data-testid="text-balance">
                    ${fmtMoney(balance)}
                  </span>
                </div>
                {balance > 0.01 && !showAddPayment && !isLocked && (
                  <div className="flex flex-col gap-2 mt-2">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const uninvoiced = (payments || []).filter((p: any) => p.status !== "anulado" && !p.invoiceRef);
                        if (uninvoiced.length > 0) {
                          setUninvoicedWarningAction("facturar");
                          setShowUninvoicedWarning(true);
                        } else {
                          openFacturarSolo();
                        }
                      }}
                      data-testid="button-facturar-folio"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Facturar Saldo (${fmtMoney(balance)})
                      {facturaEmitida && <span className="ml-1 text-xs opacity-70">(ya facturado)</span>}
                    </Button>
                  </div>
                )}
                {balance <= 0.01 && !isLocked && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
                    onClick={() => setShowFacturar(true)}
                    data-testid="button-facturar-folio-saldado"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Emitir Factura
                  </Button>
                )}
              </div>
            </div>

            {/* ── Movimientos cronológicos del folio ─────────────── */}
            {(() => {
              const chargeItems = consumptionCharges.map((c: any) => ({
                sortDate: new Date(c.date || c.createdAt || 0).getTime(),
                dateLabel: (() => { const d = new Date(c.date || c.createdAt || 0); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; })(),
                type: "cargo" as const,
                label: c.description,
                amount: parseFloat(c.amount || "0"),
                isAnulado: c.status === "anulado",
                id: `cargo-${c.id}`,
              }));
              const paymentItems = (payments || []).map((p: any) => {
                const invRef = (() => { try { return p.invoiceRef ? JSON.parse(p.invoiceRef) : null; } catch { return null; } })();
                const invBadge = invRef
                  ? `${invRef.tipo_comprobante ?? "FAC"} ${String(invRef.punto_venta ?? "").padStart(4,"0")}-${String(invRef.numero ?? "").padStart(8,"0")}`
                  : null;
                return {
                  sortDate: new Date(p.paymentDate || p.date || p.createdAt || 0).getTime(),
                  dateLabel: (() => { const d = new Date(p.paymentDate || p.date || p.createdAt || 0); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; })(),
                  type: "pago" as const,
                  label: p.reference || p.notes || p.paymentMethod || "Pago",
                  invBadge,
                  amount: parseFloat(p.amount || "0"),
                  isAnulado: (p as any).status === "anulado",
                  id: `pago-${p.id}`,
                };
              });
              const invoiceItems = folioInvoices.map((f: any) => ({
                sortDate: new Date((f.fecha_emision || "") + "T12:00:00").getTime(),
                dateLabel: (() => { const d = new Date((f.fecha_emision || "") + "T12:00:00"); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; })(),
                type: "factura" as const,
                label: `${f.tipo_comprobante} ${String(f.punto_venta).padStart(4,"0")}-${String(f.numero).padStart(8,"0")} — ${f.cliente_razon_social}`,
                amount: parseFloat(f.monto_total || "0"),
                isAnulado: f.estado === "anulada",
                id: `factura-${f.id}`,
              }));
              const allItems = [...chargeItems, ...paymentItems, ...invoiceItems].sort((a, b) => b.sortDate - a.sortDate);
              if (allItems.length === 0) return null;
              const colorMap = {
                cargo:   "border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800",
                pago:    "border-green-200 bg-green-50/50 dark:bg-green-900/10 dark:border-green-800",
                factura: "border-purple-200 bg-purple-50/50 dark:bg-purple-900/10 dark:border-purple-800",
              };
              const labelMap = { cargo: "Cargo", pago: "Pago", factura: "Factura" };
              const amtColor = { cargo: "", pago: "text-green-600 dark:text-green-400", factura: "text-purple-700 dark:text-purple-300" };
              return (
                <div className="border rounded-lg">
                  <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-semibold text-sm">Movimientos cronológicos</h4>
                    <span className="text-xs text-muted-foreground ml-auto">{allItems.length} movimiento{allItems.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                    {allItems.map((item) => (
                      <div key={item.id} className={`flex items-center gap-2 text-xs p-1.5 rounded border ${colorMap[item.type]} ${item.isAnulado ? "opacity-40 line-through" : ""}`} data-testid={`timeline-${item.id}`}>
                        <span className="text-muted-foreground shrink-0 w-14">{item.dateLabel}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0 px-1 py-0 h-4">{labelMap[item.type]}</Badge>
                        <span className="flex-1 truncate">{item.label}</span>
                        {(item as any).invBadge && !item.isAnulado && (
                          <Badge variant="secondary" className="text-[10px] shrink-0 px-1 py-0 h-4 text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                            <FileText className="h-2.5 w-2.5 mr-0.5" />{(item as any).invBadge}
                          </Badge>
                        )}
                        <span className={`font-medium shrink-0 ${amtColor[item.type]}`}>
                          {item.type === "pago" ? "−" : ""}${item.amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="historial" className="mt-4">
            {changelog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                <History className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sin cambios registrados aún.</p>
                <p className="text-xs">Los cambios de fechas, habitación, tarifa y estado se registran automáticamente.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {changelog.map((entry: any) => {
                  const date = new Date(entry.fecha);
                  const dateStr = `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
                  const tipoColors: Record<string,string> = {
                    fecha: "bg-blue-50 dark:bg-blue-900/20 border-blue-200",
                    habitacion: "bg-purple-50 dark:bg-purple-900/20 border-purple-200",
                    estado: "bg-green-50 dark:bg-green-900/20 border-green-200",
                    tarifa: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200",
                    huesped: "bg-orange-50 dark:bg-orange-900/20 border-orange-200",
                    notas: "bg-gray-50 dark:bg-gray-900/20 border-gray-200",
                  };
                  return (
                    <div key={entry.id} className={`flex items-start gap-3 text-sm p-2 rounded border ${tipoColors[entry.tipo] || "bg-muted border-border"}`} data-testid={`changelog-entry-${entry.id}`}>
                      <span className="text-muted-foreground shrink-0 w-32 text-xs pt-0.5">{dateStr}</span>
                      <span className="text-muted-foreground shrink-0 w-20 text-xs pt-0.5 truncate">{entry.operador || "Sistema"}</span>
                      <span className="text-foreground text-xs">{entry.descripcion}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={printConfirmation}
              data-testid="button-print-confirmation"
            >
              <FileText className="h-4 w-4 mr-2" />
              Confirmación
            </Button>
            {onEdit && reservation.status !== "cancelled" && reservation.status !== "checked_out" && (
              <Button
                variant="outline"
                onClick={() => {
                  onEdit();
                  onOpenChange(false);
                }}
                data-testid="button-edit-from-detail"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Button>
            )}
            {reservation.status === "checked_in" && (
              <Button
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300"
                onClick={() => {
                  const uninvoiced = (payments || []).filter((p: any) => p.status !== "anulado" && !p.invoiceRef);
                  if (uninvoiced.length > 0) {
                    setUninvoicedWarningAction("checkout");
                    setShowUninvoicedWarning(true);
                  } else {
                    openCheckoutWizard();
                  }
                }}
                data-testid="button-early-checkout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Check-out
              </Button>
            )}
            {reservation.status !== "cancelled" && reservation.status !== "checked_out" && (
              <Button 
                variant="destructive" 
                onClick={() => {
                  onOpenChange(false);
                  onCancel();
                }}
                data-testid="button-cancel-from-detail"
              >
                <X className="mr-2 h-4 w-4" />
                Anular Reserva
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Warning: anticipos sin factura */}
      <AlertDialog open={showUninvoicedWarning} onOpenChange={(open) => { if (!open) setShowUninvoicedWarning(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Anticipos sin factura emitida
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {(() => {
                    const count = (payments || []).filter((p: any) => p.status !== "anulado" && !p.invoiceRef).length;
                    return `${count} anticipo${count !== 1 ? "s" : ""} registrado${count !== 1 ? "s" : ""} sin factura electrónica emitida.`;
                  })()}
                </p>
                <p className="text-sm">¿Desea volver para emitirlas antes de continuar, o continuar de todas formas?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUninvoicedWarning(false)} data-testid="button-uninvoiced-back">
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setShowUninvoicedWarning(false);
                if (uninvoicedWarningAction === "facturar") openFacturarSolo();
                else if (uninvoicedWarningAction === "checkout") openCheckoutWizard();
              }}
              data-testid="button-uninvoiced-proceed"
            >
              Continuar de todas formas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Charge Dialog */}
      <Dialog open={transferringChargeId !== null} onOpenChange={(open) => {
        if (!open) {
          setTransferringChargeId(null);
          setTargetReservationId("");
        }
      }}>
        <DialogContent className="w-[95vw] max-w-[450px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transferir Cargo
            </DialogTitle>
            <DialogDescription>
              Seleccione la habitación destino para transferir este cargo
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {transferringChargeId && (() => {
              const chargeToTransfer = consumptionCharges.find(c => c.id === transferringChargeId);
              if (!chargeToTransfer) return null;
              return (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Cargo a transferir:</p>
                  <div className="flex justify-between text-sm">
                    <span>{chargeToTransfer.description}</span>
                    <span className="font-semibold">${chargeToTransfer.amount}</span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2">
              <label className="text-sm font-medium">Habitación destino</label>
              {isActiveReservationsError ? (
                <div className="p-3 border border-destructive/50 bg-destructive/10 rounded-lg text-sm text-destructive">
                  Error al cargar las habitaciones disponibles. Por favor, intente nuevamente.
                </div>
              ) : (
                <Select value={targetReservationId} onValueChange={setTargetReservationId} disabled={isActiveReservationsLoading}>
                  <SelectTrigger data-testid="select-target-reservation">
                    <SelectValue placeholder={isActiveReservationsLoading ? "Cargando..." : "Seleccionar habitación..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeReservations?.filter(r => r.id).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        Hab. {r.room?.roomNumber} — {r.guest?.lastName} {r.guest?.firstName}
                        {r.status === "web_checkin" ? " (web check-in)" : " (en casa)"}
                      </SelectItem>
                    ))}
                    {(!activeReservations || activeReservations.length === 0) && !isActiveReservationsLoading && (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No hay otras habitaciones activas
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setTransferringChargeId(null);
              setTargetReservationId("");
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleTransferCharge}
              disabled={!targetReservationId || transferChargeMutation.isPending}
              data-testid="button-confirm-transfer"
            >
              {transferChargeMutation.isPending ? "Transfiriendo..." : "Transferir Cargo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Transfer Dialog */}
      <Dialog open={showBulkTransfer} onOpenChange={(open) => {
        if (!open) {
          setShowBulkTransfer(false);
          setBulkTargetReservationId("");
          setBulkSelectedChargeIds(new Set());
          setBulkIncludeAccommodation(false);
          setBulkSelectedPaymentIds(new Set());
          setBulkTransferNote("");
        }
      }}>
        <DialogContent className="w-[95vw] max-w-[520px] flex flex-col max-h-[85dvh] overflow-hidden p-0 gap-0">
          {/* ── Sticky header ── */}
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Transferir folio a otra habitación
            </DialogTitle>
            <DialogDescription>
              Seleccioná los cargos y/o anticipos que querés mover a otra reserva.
            </DialogDescription>
          </DialogHeader>

          {/* ── Scrollable content ── */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Destination reservation */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Reserva destino</label>
              <Select value={bulkTargetReservationId} onValueChange={setBulkTargetReservationId} disabled={isActiveReservationsLoading}>
                <SelectTrigger data-testid="select-bulk-target-reservation">
                  <SelectValue placeholder={isActiveReservationsLoading ? "Cargando..." : "Seleccionar habitación / huésped..."} />
                </SelectTrigger>
                <SelectContent>
                  {activeReservations?.filter(r => r.id).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Hab. {r.room?.roomNumber} — {r.guest?.lastName} {r.guest?.firstName}
                      {r.status === "web_checkin" ? " (web check-in)" : " (en casa)"}
                    </SelectItem>
                  ))}
                  {(!activeReservations || activeReservations.length === 0) && !isActiveReservationsLoading && (
                    <div className="p-2 text-sm text-muted-foreground text-center">No hay otras habitaciones activas</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* ── Cargos section ── */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cargos</label>
              <div className="border rounded-lg divide-y">
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    id="bulk-accommodation"
                    className="h-4 w-4 rounded border-gray-300 shrink-0"
                    checked={bulkIncludeAccommodation}
                    onChange={(e) => setBulkIncludeAccommodation(e.target.checked)}
                    data-testid="checkbox-include-accommodation"
                  />
                  <label htmlFor="bulk-accommodation" className="flex-1 flex justify-between items-center cursor-pointer text-sm gap-2">
                    <span className="font-medium">Alojamiento</span>
                    <span className="font-semibold tabular-nums shrink-0">
                      ${Number(reservation.totalRoomAmount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </label>
                </div>
                {activeConsumptionCharges.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">Sin consumos adicionales</div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 p-2 bg-muted/30">
                      <input
                        type="checkbox"
                        id="bulk-all-charges"
                        className="h-4 w-4 rounded border-gray-300 shrink-0"
                        checked={bulkSelectedChargeIds.size === activeConsumptionCharges.length && activeConsumptionCharges.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setBulkSelectedChargeIds(new Set(activeConsumptionCharges.map(c => c.id)));
                          else setBulkSelectedChargeIds(new Set());
                        }}
                      />
                      <label htmlFor="bulk-all-charges" className="text-xs text-muted-foreground cursor-pointer">
                        Seleccionar todos los consumos
                      </label>
                    </div>
                    {activeConsumptionCharges.map((charge) => (
                      <div key={charge.id} className="flex items-center gap-3 p-3">
                        <input
                          type="checkbox"
                          id={`bulk-charge-${charge.id}`}
                          className="h-4 w-4 rounded border-gray-300 shrink-0"
                          checked={bulkSelectedChargeIds.has(charge.id)}
                          onChange={(e) => {
                            const next = new Set(bulkSelectedChargeIds);
                            if (e.target.checked) next.add(charge.id);
                            else next.delete(charge.id);
                            setBulkSelectedChargeIds(next);
                          }}
                          data-testid={`checkbox-charge-${charge.id}`}
                        />
                        <label htmlFor={`bulk-charge-${charge.id}`} className="flex-1 flex justify-between items-center cursor-pointer text-sm gap-2">
                          <span className="truncate">{charge.description}</span>
                          <span className="font-medium tabular-nums shrink-0">${Number(charge.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                        </label>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── Anticipos / Pagos section ── */}
            {(() => {
              const activePaymentsForBulk = payments?.filter((p: any) => p.status !== "anulado") || [];
              if (activePaymentsForBulk.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Anticipos / Pagos</label>
                  <div className="border rounded-lg divide-y">
                    {activePaymentsForBulk.length > 1 && (
                      <div className="flex items-center gap-3 p-2 bg-muted/30">
                        <input
                          type="checkbox"
                          id="bulk-all-payments"
                          className="h-4 w-4 rounded border-gray-300 shrink-0"
                          checked={bulkSelectedPaymentIds.size === activePaymentsForBulk.length}
                          onChange={(e) => {
                            if (e.target.checked) setBulkSelectedPaymentIds(new Set(activePaymentsForBulk.map((p: any) => p.id)));
                            else setBulkSelectedPaymentIds(new Set());
                          }}
                        />
                        <label htmlFor="bulk-all-payments" className="text-xs text-muted-foreground cursor-pointer">
                          Seleccionar todos los anticipos
                        </label>
                      </div>
                    )}
                    {activePaymentsForBulk.map((p: any) => {
                      const invoiceRef = (() => { try { return p.invoiceRef ? JSON.parse(p.invoiceRef) : null; } catch { return null; } })();
                      return (
                        <div key={p.id} className="flex items-center gap-3 p-3">
                          <input
                            type="checkbox"
                            id={`bulk-payment-${p.id}`}
                            className="h-4 w-4 rounded border-gray-300 shrink-0"
                            checked={bulkSelectedPaymentIds.has(p.id)}
                            onChange={(e) => {
                              const next = new Set(bulkSelectedPaymentIds);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              setBulkSelectedPaymentIds(next);
                            }}
                          />
                          <label htmlFor={`bulk-payment-${p.id}`} className="flex-1 flex justify-between items-center cursor-pointer text-sm gap-2">
                            <span className="truncate flex items-center gap-1.5">
                              <span>{paymentMethodLabels[p.method as PaymentMethod] || p.method}</span>
                              {invoiceRef && (
                                <Badge variant="secondary" className="text-xs py-0 text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                                  <FileText className="h-2.5 w-2.5 mr-1" />
                                  {invoiceRef.tipo_comprobante}
                                </Badge>
                              )}
                              <span className="text-muted-foreground text-xs">({formatDateAR(p.date)})</span>
                            </span>
                            <span className="font-medium tabular-nums text-green-600 shrink-0">${Number(p.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Balance preview ── */}
            {(bulkIncludeAccommodation || bulkSelectedChargeIds.size > 0 || bulkSelectedPaymentIds.size > 0) && (() => {
              const activePaymentsForBulk = payments?.filter((p: any) => p.status !== "anulado") || [];
              const accommodationAmt = Number(reservation.totalRoomAmount || 0);
              const selectedChargesAmt = activeConsumptionCharges
                .filter(c => bulkSelectedChargeIds.has(c.id))
                .reduce((sum, c) => sum + Number(c.amount), 0);
              const selectedPaymentsAmt = activePaymentsForBulk
                .filter((p: any) => bulkSelectedPaymentIds.has(p.id))
                .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

              const transferredCharges = (bulkIncludeAccommodation ? accommodationAmt : 0) + selectedChargesAmt;
              const transferredPayments = selectedPaymentsAmt;

              // Source result after transfer
              const srcRemainingCharges = totalToPay - transferredCharges;
              const srcRemainingPayments = totalPayments - transferredPayments;
              const srcResultBalance = srcRemainingCharges - srcRemainingPayments;

              // Net transferred to destination (may be negative = transferring a credit)
              const netToTarget = transferredCharges - transferredPayments;

              const srcNegative = srcResultBalance < -0.01;
              const targetNegative = netToTarget < -0.01;

              return (
                <div className="rounded-lg border divide-y text-sm">
                  <div className="px-3 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Resultado de la transferencia
                  </div>
                  <div className="px-3 py-2.5 flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Esta reserva quedará con saldo</span>
                    <span className={`font-semibold tabular-nums ${srcNegative ? "text-amber-600" : srcResultBalance === 0 ? "text-green-600" : ""}`}>
                      ${srcResultBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      {srcNegative && " ⚠"}
                    </span>
                  </div>
                  <div className="px-3 py-2.5 flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Se agrega al destino (neto)</span>
                    <span className={`font-semibold tabular-nums ${targetNegative ? "text-amber-600" : ""}`}>
                      ${netToTarget.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      {targetNegative && " ⚠"}
                    </span>
                  </div>
                  {srcNegative && (
                    <div className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20">
                      ⚠ Esta reserva quedaría en crédito (saldo negativo). Considerá transferir también los anticipos correspondientes.
                    </div>
                  )}
                  {targetNegative && (
                    <div className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20">
                      ⚠ Se transfiere más anticipo que cargos — el destino quedaría en crédito.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Optional note */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Referencia / Observación <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <Input
                placeholder="Ej: Familia García, empresa XYZ, etc."
                value={bulkTransferNote}
                onChange={(e) => setBulkTransferNote(e.target.value)}
                data-testid="input-bulk-transfer-note"
              />
            </div>
          </div>

          {/* ── Sticky footer ── */}
          <DialogFooter className="px-6 py-4 border-t bg-background shrink-0">
            <Button variant="outline" onClick={() => setShowBulkTransfer(false)}>Cancelar</Button>
            <Button
              onClick={() => bulkTransferMutation.mutate({
                targetReservationId: bulkTargetReservationId,
                chargeIds: Array.from(bulkSelectedChargeIds),
                includeAccommodation: bulkIncludeAccommodation,
                transferNote: bulkTransferNote,
                paymentIds: Array.from(bulkSelectedPaymentIds),
              })}
              disabled={
                !bulkTargetReservationId ||
                (!bulkIncludeAccommodation && bulkSelectedChargeIds.size === 0 && bulkSelectedPaymentIds.size === 0) ||
                bulkTransferMutation.isPending
              }
              data-testid="button-confirm-bulk-transfer"
            >
              {bulkTransferMutation.isPending ? "Transfiriendo..." : "Confirmar transferencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anular Cargo / Pago Dialog */}
      {(() => {
        const anularPayment = anularTarget?.type === "pago"
          ? payments?.find((p: any) => p.id === anularTarget.id)
          : null;
        const anularInvoiceRef = (() => {
          try { return (anularPayment as any)?.invoiceRef ? JSON.parse((anularPayment as any).invoiceRef) : null; } catch { return null; }
        })();
        return (
        <Dialog open={anularTarget !== null} onOpenChange={(open) => {
          if (!open) { setAnularTarget(null); setMotivoAnulacion(""); setAnularEmitirNC(false); }
        }}>
          <DialogContent className="w-[95vw] max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Anular {anularTarget?.type === "cargo" ? "Cargo" : "Pago"}
              </DialogTitle>
              <DialogDescription>
                Esta acción anula el registro. Seguirá visible en el folio con estado ANULADO y no afectará los totales.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {anularInvoiceRef && (
                <div className="p-2.5 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <FileText className="h-3.5 w-3.5" />
                    Este anticipo tiene factura electrónica vinculada
                  </div>
                  <p className="text-amber-700 dark:text-amber-400">
                    {anularInvoiceRef.tipo_comprobante} {String(anularInvoiceRef.punto_venta ?? "").padStart(4, "0")}-{String(anularInvoiceRef.numero ?? "").padStart(8, "0")}
                    {anularInvoiceRef.cae ? ` — CAE: ${anularInvoiceRef.cae}` : ""}
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={anularEmitirNC}
                      onChange={(e) => setAnularEmitirNC(e.target.checked)}
                      className="rounded border-amber-400"
                    />
                    <span>Emitir Nota de Crédito al anular</span>
                  </label>
                </div>
              )}
              <Label htmlFor="motivo-anulacion">Motivo de anulación (opcional)</Label>
              <Textarea
                id="motivo-anulacion"
                placeholder="Ej: Error de carga, duplicado..."
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                rows={3}
                data-testid="input-motivo-anulacion"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAnularTarget(null); setMotivoAnulacion(""); setAnularEmitirNC(false); }}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!anularTarget) return;
                  if (anularTarget.type === "cargo") {
                    anularChargeMutation.mutate({ id: anularTarget.id, motivo: motivoAnulacion });
                  } else {
                    // If payment has an invoice but NC is not checked, require explicit second confirmation
                    if (anularInvoiceRef && !anularEmitirNC) {
                      setAnularSinNCPending(true);
                      return;
                    }
                    anularPaymentMutation.mutate({ id: anularTarget.id, motivo: motivoAnulacion }, {
                      onSuccess: () => {
                        if (anularEmitirNC && anularInvoiceRef?.id) {
                          setNcForInvoiceId(anularInvoiceRef.id);
                          setAnularEmitirNC(false);
                        }
                      },
                    });
                  }
                }}
                disabled={anularChargeMutation.isPending || anularPaymentMutation.isPending}
                data-testid="button-confirm-anular"
              >
                {(anularChargeMutation.isPending || anularPaymentMutation.isPending) ? "Anulando..." : "Confirmar Anulación"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        );
      })()}

      {/* Confirmación extra: anular pago con factura electrónica sin emitir NC */}
      {(() => {
        // Recover anularInvoiceRef in this scope for the alert dialog actions
        const _anularPayment = anularTarget?.type === "pago" ? payments?.find((p: any) => p.id === anularTarget.id) : null;
        const _anularInvoiceRef = (() => { try { return (_anularPayment as any)?.invoiceRef ? JSON.parse((_anularPayment as any).invoiceRef) : null; } catch { return null; } })();
        return (
          <AlertDialog open={anularSinNCPending} onOpenChange={(o) => { if (!o) setAnularSinNCPending(false); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  ¿Anular sin Nota de Crédito?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>Este anticipo tiene una factura electrónica emitida:</p>
                    {_anularInvoiceRef && (
                      <p className="font-medium text-foreground">
                        {_anularInvoiceRef.tipo_comprobante} {String(_anularInvoiceRef.punto_venta ?? "").padStart(4, "0")}-{String(_anularInvoiceRef.numero ?? "").padStart(8, "0")}
                        {_anularInvoiceRef.cae ? ` — CAE: ${_anularInvoiceRef.cae}` : ""}
                      </p>
                    )}
                    <p className="text-destructive font-medium">
                      Si continúa sin emitir una Nota de Crédito, el comprobante quedará activo en AFIP sin su contrapartida, generando una inconsistencia fiscal.
                    </p>
                    <p>Se recomienda volver y marcar "Emitir Nota de Crédito al anular".</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setAnularSinNCPending(false)}>
                  Volver (emitir NC)
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    setAnularSinNCPending(false);
                    if (!anularTarget) return;
                    anularPaymentMutation.mutate({ id: anularTarget.id, motivo: motivoAnulacion });
                  }}
                  data-testid="button-confirm-anular-sin-nc"
                >
                  Confirmar sin NC (riesgo fiscal)
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {/* Nota de Crédito para anticipo anulado */}
      {ncForInvoiceId !== null && (
        <NotaCreditoDialog invoiceId={ncForInvoiceId} onClose={() => setNcForInvoiceId(null)} />
      )}

      {/* Prefactura / Facturar Saldo / Check-out desde folio */}
      <PrefacturaDialog
        open={showFacturar}
        onClose={() => setShowFacturar(false)}
        reservationId={reservation.id}
        reservation={reservation}
        mode={showFacturarMode}
        onCheckoutComplete={() => setFacturaEmitida(true)}
      />
    </Dialog>
  );
}

function CancelReservationDialog({
  reservation,
  open,
  onOpenChange,
  onSuccess,
  currentUserName,
}: {
  reservation: ReservationWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentUserName?: string;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [cancelledBy, setCancelledBy] = useState("");

  useEffect(() => {
    if (open) {
      setCancelledBy(currentUserName || "");
      setReason("");
    }
  }, [open, currentUserName]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/reservations/${reservation.id}/cancel`, {
        reason,
        cancelledBy: cancelledBy || currentUserName || "Sistema",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cancelled-reservations"], exact: false });
      toast({
        title: "Reserva anulada",
        description: "La reserva ha sido anulada y registrada en el log de cancelaciones.",
      });
      setReason("");
      setCancelledBy("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (error: Error) => {
      let description = "No se pudo anular la reserva.";
      try {
        const body = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        if (body.error) description = body.error;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    },
  });

  const handleCancel = () => {
    if (!reason.trim()) {
      toast({
        title: "Motivo requerido",
        description: "Por favor, ingrese el motivo de la anulación.",
        variant: "destructive",
      });
      return;
    }
    cancelMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <X className="h-5 w-5" />
            Anular Reserva
          </DialogTitle>
          <DialogDescription>
            <strong>Anular</strong> cambia el estado a "Cancelada" y registra el motivo en el historial. 
            La reserva NO se elimina del sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Código:</span>
              <span className="font-medium">{reservation.reservationCode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Huésped:</span>
              <span className="font-medium">
                {reservation.guest?.lastName} {reservation.guest?.firstName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Habitación:</span>
              <span className="font-medium">{reservation.room?.roomNumber}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fechas:</span>
              <span className="font-medium">
                {formatDateAR(reservation.checkInDate)} - {formatDateAR(reservation.checkOutDate)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancelledBy">Anulado por</Label>
            <Input
              id="cancelledBy"
              placeholder="Nombre del usuario que anula"
              value={cancelledBy}
              onChange={(e) => setCancelledBy(e.target.value)}
              data-testid="input-cancelled-by"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo de anulación *</Label>
            <Textarea
              id="reason"
              placeholder="Ingrese el motivo de la anulación..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="input-cancel-reason"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
            data-testid="button-confirm-cancel"
          >
            {cancelMutation.isPending ? "Anulando..." : "Confirmar Anulación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReservationsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showHistory, setShowHistory] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailReturnTo, setDetailReturnTo] = useState<string | null>(null);
  const detailReturnToRef = useRef<string | null>(null);
  const setDetailReturnToSync = (val: string | null) => {
    detailReturnToRef.current = val;
    setDetailReturnTo(val);
  };
  const [editReturnTo, setEditReturnTo] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateCheckIn, setDuplicateCheckIn] = useState("");
  const [duplicateCheckOut, setDuplicateCheckOut] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | undefined>();

  const todayStr = getLocalToday();
  const [dateMode, setDateMode] = useState<"upcoming" | "today" | "range" | "all" | "created" | "anuladas">("today");
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState("");
  const [createdFrom, setCreatedFrom] = useState(todayStr);
  const [createdTo, setCreatedTo] = useState(todayStr);

  // Filtros para tab Anuladas
  const [cancelSearch, setCancelSearch] = useState("");
  const [cancelFrom, setCancelFrom] = useState("");
  const [cancelTo, setCancelTo] = useState("");

  // Motor de Reservas (web pending)
  const [webSectionExpanded, setWebSectionExpanded] = useState(true);
  const [confirmingReservation, setConfirmingReservation] = useState<any | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [retroCheckInDialogOpen, setRetroCheckInDialogOpen] = useState(false);
  const [retroCheckInMotivo, setRetroCheckInMotivo] = useState("");
  const [pendingCheckInId, setPendingCheckInId] = useState<string | null>(null);
  const [listCheckoutWarningResId, setListCheckoutWarningResId] = useState<string | null>(null);
  const [listCheckoutWarningCount, setListCheckoutWarningCount] = useState(0);

  const { data: webPendingReservations = [], refetch: refetchWeb } = useQuery<any[]>({
    queryKey: ["/api/admin/booking-engine/reservations"],
    refetchInterval: 60_000,
  });

  const { data: availableRoomsForAssign = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/booking-engine/available-rooms", confirmingReservation?.id],
    queryFn: async () => {
      if (!confirmingReservation) return [];
      const params = new URLSearchParams({
        checkIn: confirmingReservation.check_in_date,
        checkOut: confirmingReservation.check_out_date,
        roomTypeId: confirmingReservation.room_type_id || "",
        excludeReservationId: confirmingReservation.id,
      });
      const res = await fetch(`/api/admin/booking-engine/available-rooms?${params}`);
      return res.json();
    },
    enabled: !!confirmingReservation,
  });

  const confirmWebMutation = useMutation({
    mutationFn: async ({ id, roomId }: { id: string; roomId: string }) => {
      const res = await fetch(`/api/admin/booking-engine/reservations/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Error"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reserva confirmada", description: "La reserva fue confirmada y aparece en el planning." });
      setConfirmingReservation(null);
      setSelectedRoomId("");
      refetchWeb();
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] });
    },
    onError: (e: any) => toast({ title: "Error al confirmar", description: e.message, variant: "destructive" }),
  });

  const rejectWebMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/booking-engine/reservations/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error al rechazar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reserva rechazada" });
      setRejectingId(null);
      refetchWeb();
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    },
    onError: () => toast({ title: "Error al rechazar", variant: "destructive" }),
  });

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations", dateMode, dateFrom, dateTo, createdFrom, createdTo],
    enabled: dateMode !== "anuladas",
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateMode === "today") {
        params.set("dateFrom", todayStr);
        params.set("dateTo", todayStr);
      } else if (dateMode === "range" && dateFrom) {
        params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
      } else if (dateMode === "all") {
        params.set("dateMode", "all");
      } else if (dateMode === "created") {
        params.set("dateField", "createdAt");
        if (createdFrom) params.set("dateFrom", createdFrom);
        if (createdTo) params.set("dateTo", createdTo);
      }
      const res = await fetch(`/api/reservations?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch reservations");
      return res.json();
    },
  });

  const { data: cancelledLogs = [], isLoading: isLoadingCancelled } = useQuery<any[]>({
    queryKey: ["/api/cancelled-reservations"],
    enabled: dateMode === "anuladas",
  });

  const filteredCancelledLogs = cancelledLogs.filter((log: any) => {
    const q = cancelSearch.toLowerCase();
    if (q && !log.guestName?.toLowerCase().includes(q) && !log.roomNumber?.toLowerCase().includes(q) && !log.reservationCode?.toLowerCase().includes(q)) return false;
    if (cancelFrom) {
      const logDate = log.checkInDate || log.cancellationDate;
      if (logDate && logDate < cancelFrom) return false;
    }
    if (cancelTo) {
      const logDate = log.checkInDate || log.cancellationDate;
      if (logDate && logDate > cancelTo) return false;
    }
    return true;
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/reservations/${id}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cancelled-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Reserva recuperada", description: "La reserva volvió a estado Confirmada." });
    },
    onError: (e: any) => {
      let msg = "No se pudo recuperar la reserva.";
      try { const b = JSON.parse(e.message.replace(/^\d+:\s*/, "")); if (b.error) msg = b.error; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const viewId = params.get("view");
    const returnTo = params.get("returnTo");
    if (!viewId) return;
    // Clear URL immediately so the effect doesn't re-trigger
    navigate("/reservations", { replace: true });
    // Fetch the reservation directly — avoids date-range filter issues
    fetch(`/api/reservations/${viewId}`)
      .then(r => r.ok ? r.json() : null)
      .then((res: ReservationWithDetails | null) => {
        if (res) {
          setSelectedReservation(res);
          setDetailReturnToSync(returnTo);
          setDetailDialogOpen(true);
        }
      })
      .catch(() => {});
  }, [searchParams]);

  const { data: guests } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const { data: rooms } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      return apiRequest("PATCH", `/api/reservations/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Estado actualizado", description: "El estado de la reserva ha sido actualizado." });
    },
  });

  const checkInFromListMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      return apiRequest("POST", `/api/reservations/${id}/check-in`, motivo ? { motivo } : {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setRetroCheckInDialogOpen(false);
      setRetroCheckInMotivo("");
      setPendingCheckInId(null);
      toast({ title: "Check-in realizado", description: "El huésped fue registrado correctamente." });
    },
    onError: (error: any) => {
      let body: any = {};
      try {
        const msg = error?.message || "";
        const jsonStart = msg.indexOf("{");
        if (jsonStart !== -1) body = JSON.parse(msg.slice(jsonStart));
      } catch {}
      if (body?.error === "CHECK_IN_RETROACTIVO") {
        setRetroCheckInDialogOpen(true);
      } else {
        toast({ title: "Error en check-in", description: body?.error || body?.message || "No se pudo realizar el check-in.", variant: "destructive" });
        setPendingCheckInId(null);
      }
    },
  });


  const duplicateMutation = useMutation({
    mutationFn: async ({ id, checkInDate, checkOutDate }: { id: string; checkInDate: string; checkOutDate: string }) => {
      return apiRequest("POST", `/api/reservations/${id}/duplicate`, { checkInDate, checkOutDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDuplicateDialogOpen(false);
      setDuplicateCheckIn("");
      setDuplicateCheckOut("");
      toast({ title: "Reserva duplicada", description: "Se ha creado una nueva reserva con los datos copiados." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo duplicar la reserva", variant: "destructive" });
    },
  });

  const filteredReservations = reservations
    ?.filter((res) => {
      const guestName = `${res.guest?.lastName} ${res.guest?.firstName}`.toLowerCase();
      const matchesSearch =
        guestName.includes(searchQuery.toLowerCase()) ||
        res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        res.reservationCode?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || res.status === statusFilter;

      if (!showHistory) {
        const isPast = res.checkOutDate < todayStr && res.status === "checked_out";
        const isCancelledOld = res.checkOutDate < todayStr && res.status === "cancelled";
        if (isPast || isCancelledOld) return false;
      }

      return matchesSearch && matchesStatus;
    })
    ?.sort((a, b) =>
      dateMode === "created"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : a.checkInDate.localeCompare(b.checkInDate)
    );

  const isResLocked = (r: ReservationWithDetails) => {
    return r.status === "checked_out" || r.status === "cancelled";
  };

  const handleEditReservation = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setDialogOpen(true);
  };

  const handleViewReservation = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setDetailDialogOpen(true);
  };

  const handleDuplicateReservation = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setDuplicateCheckIn("");
    setDuplicateCheckOut("");
    setDuplicateDialogOpen(true);
  };

  const handleNewReservation = () => {
    setSelectedReservation(undefined);
    setDialogOpen(true);
  };

  const handleCancelReservation = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setCancelDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-reservations-title">
            Reservas
          </h1>
          <p className="text-muted-foreground">Gestiona todas las reservaciones del hotel</p>
        </div>
        <div className="flex items-center gap-2">
          <EmitirComprobanteButton area="recepcion" />
          <Button onClick={handleNewReservation} data-testid="button-new-reservation">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Reserva
          </Button>
        </div>
      </div>

      {/* Motor de Reservas - Pending Web Reservations */}
      {webPendingReservations.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <button
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => setWebSectionExpanded(v => !v)}
            data-testid="button-toggle-web-reservations"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/50">
                <Globe className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">Motor de Reservas Web</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {webPendingReservations.length} solicitud{webPendingReservations.length !== 1 ? "es" : ""} pendiente{webPendingReservations.length !== 1 ? "s" : ""} de confirmación
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">{webPendingReservations.length}</Badge>
              {webSectionExpanded ? <ChevronUp className="h-4 w-4 text-amber-600" /> : <ChevronDown className="h-4 w-4 text-amber-600" />}
            </div>
          </button>

          {webSectionExpanded && (
            <div className="border-t border-amber-200 dark:border-amber-800 divide-y divide-amber-100 dark:divide-amber-900">
              {webPendingReservations.map((wr: any) => (
                <div key={wr.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid={`row-web-reservation-${wr.id}`}>
                  <div className="flex flex-col sm:flex-row gap-4 flex-1 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{`${wr.first_name || ""} ${wr.last_name || ""}`.trim() || "-"}</p>
                      <p className="text-xs text-muted-foreground truncate">{wr.email || "-"}</p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Entrada</span>
                        <span className="font-medium">{wr.check_in_date ? formatDateAR(wr.check_in_date) : "-"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Salida</span>
                        <span className="font-medium">{wr.check_out_date ? formatDateAR(wr.check_out_date) : "-"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Tipo</span>
                        <span className="font-medium">{wr.room_type_name || wr.room_type_id || "-"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Hab.</span>
                        <span className="font-medium">{wr.room_number || "-"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Total</span>
                        <span className="font-medium">${fmtMoney(wr.total_amount || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rejectingId === wr.id ? (
                      <>
                        <span className="text-sm text-red-600 font-medium">¿Rechazar?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectWebMutation.mutate(wr.id)}
                          disabled={rejectWebMutation.isPending}
                          data-testid={`button-reject-confirm-${wr.id}`}
                        >
                          Sí, rechazar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectingId(null)} data-testid={`button-reject-cancel-${wr.id}`}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => { setConfirmingReservation(wr); setSelectedRoomId(wr.room_id || ""); }}
                          data-testid={`button-confirm-web-${wr.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => setRejectingId(wr.id)}
                          data-testid={`button-reject-web-${wr.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm Web Reservation Dialog */}
      <Dialog open={!!confirmingReservation} onOpenChange={open => { if (!open) { setConfirmingReservation(null); setSelectedRoomId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-amber-500" />
              Confirmar Reserva Web
            </DialogTitle>
            <DialogDescription>
              Asigná una habitación disponible y confirmá la reserva del motor de reservas online.
            </DialogDescription>
          </DialogHeader>
          {confirmingReservation && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Huésped:</span> <strong>{`${confirmingReservation.first_name || ""} ${confirmingReservation.last_name || ""}`.trim() || "-"}</strong></p>
                <p><span className="text-muted-foreground">Email:</span> {confirmingReservation.email || "-"}</p>
                <p><span className="text-muted-foreground">Fechas:</span> {formatDateAR(confirmingReservation.check_in_date)} → {formatDateAR(confirmingReservation.check_out_date)}</p>
                <p><span className="text-muted-foreground">Tipo:</span> {confirmingReservation.room_type_name || confirmingReservation.room_type_id}</p>
                <p><span className="text-muted-foreground">Total:</span> ${fmtMoney(confirmingReservation.total_amount || 0)}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Habitación a asignar</label>
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId} data-testid="select-web-room">
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná una habitación..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoomsForAssign.length === 0 ? (
                      <SelectItem value="_none" disabled>Sin habitaciones disponibles</SelectItem>
                    ) : (
                      availableRoomsForAssign.filter((r: any) => r.id).map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                          Hab. {r.roomNumber} — {r.roomTypeName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Habitación pre-asignada por el motor: <strong>{confirmingReservation.room_number || "ninguna"}</strong>
                  {confirmingReservation.room_id && !selectedRoomId && " (se usará si no elegís otra)"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmingReservation(null); setSelectedRoomId(""); }}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={confirmWebMutation.isPending || (!selectedRoomId && !confirmingReservation?.room_id)}
              onClick={() => {
                const roomId = selectedRoomId || confirmingReservation?.room_id;
                if (roomId) confirmWebMutation.mutate({ id: confirmingReservation.id, roomId });
              }}
              data-testid="button-confirm-web-submit"
            >
              {confirmWebMutation.isPending ? "Confirmando..." : "Confirmar reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground mr-1">Ver:</span>
              <Button
                variant={dateMode === "upcoming" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateMode("upcoming")}
                data-testid="button-filter-upcoming"
              >
                Activas y futuras
              </Button>
              <Button
                variant={dateMode === "today" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateMode("today")}
                data-testid="button-filter-today"
              >
                Hoy ({formatDateAR(todayStr)})
              </Button>
              <Button
                variant={dateMode === "range" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateMode("range")}
                data-testid="button-filter-range"
              >
                <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
                Por fechas
              </Button>
              <Button
                variant={dateMode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateMode("all")}
                data-testid="button-filter-all"
              >
                Todas
              </Button>
              <Button
                variant={dateMode === "created" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateMode("created")}
                data-testid="button-filter-created"
              >
                <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
                Por fecha de creación
              </Button>
              <Button
                variant={dateMode === "anuladas" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setDateMode("anuladas")}
                data-testid="button-filter-anuladas"
                className={dateMode !== "anuladas" ? "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30" : ""}
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Anuladas
              </Button>
              {dateMode === "range" && (
                <div className="flex items-center gap-2 ml-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 w-36 text-sm"
                    data-testid="input-date-from"
                  />
                  <span className="text-muted-foreground text-sm">→</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 w-36 text-sm"
                    data-testid="input-date-to"
                  />
                </div>
              )}
              {dateMode === "created" && (
                <div className="flex items-center gap-2 ml-2">
                  <Input
                    type="date"
                    value={createdFrom}
                    onChange={(e) => setCreatedFrom(e.target.value)}
                    className="h-8 w-36 text-sm"
                    data-testid="input-created-from"
                  />
                  <span className="text-muted-foreground text-sm">→</span>
                  <Input
                    type="date"
                    value={createdTo}
                    onChange={(e) => setCreatedTo(e.target.value)}
                    className="h-8 w-36 text-sm"
                    data-testid="input-created-to"
                  />
                </div>
              )}
            </div>
            {dateMode !== "anuladas" && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por huésped o habitación..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-reservations"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="confirmed">Confirmadas</SelectItem>
                  <SelectItem value="checked_in">Check-in</SelectItem>
                  <SelectItem value="checked_out">Check-out</SelectItem>
                  <SelectItem value="cancelled">Canceladas</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={showHistory ? "default" : "outline"}
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                data-testid="button-toggle-history"
              >
                <History className="h-4 w-4 mr-1" />
                {showHistory ? "Ocultar historial" : "Ver historial"}
              </Button>
            </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!isLoading && filteredReservations && dateMode !== "anuladas" && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1" data-testid="text-results-count">
          <span>
            {filteredReservations.length} reserva{filteredReservations.length !== 1 ? "s" : ""}
            {dateMode === "today" && " para hoy"}
            {dateMode === "upcoming" && " activas y futuras"}
            {dateMode === "range" && dateFrom && ` desde ${formatDateAR(dateFrom)}${dateTo ? ` hasta ${formatDateAR(dateTo)}` : ""}`}
          </span>
        </div>
      )}

      {/* Cancelled Reservations Table */}
      {dateMode === "anuladas" && (
        <>
          {/* Filtros de anuladas */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por huésped, habitación o código..."
                    value={cancelSearch}
                    onChange={(e) => setCancelSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-cancel-search"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Check-in entre</span>
                  <Input
                    type="date"
                    value={cancelFrom}
                    onChange={(e) => setCancelFrom(e.target.value)}
                    className="h-9 w-36 text-sm"
                    data-testid="input-cancel-from"
                  />
                  <span className="text-muted-foreground text-sm">→</span>
                  <Input
                    type="date"
                    value={cancelTo}
                    onChange={(e) => setCancelTo(e.target.value)}
                    className="h-9 w-36 text-sm"
                    data-testid="input-cancel-to"
                  />
                  {(cancelSearch || cancelFrom || cancelTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCancelSearch(""); setCancelFrom(""); setCancelTo(""); }}
                      data-testid="button-cancel-clear-filters"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoadingCancelled ? (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              </CardContent>
            </Card>
          ) : filteredCancelledLogs.length > 0 ? (
            <>
              <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                <span>
                  {filteredCancelledLogs.length} reserva{filteredCancelledLogs.length !== 1 ? "s" : ""} anulada{filteredCancelledLogs.length !== 1 ? "s" : ""}
                  {cancelledLogs.length !== filteredCancelledLogs.length && ` (de ${cancelledLogs.length} total)`}
                </span>
              </div>
              <Card className="border-red-200 dark:border-red-900">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Huésped</TableHead>
                      <TableHead>Hab.</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Total reserva</TableHead>
                      <TableHead>Fecha anulación</TableHead>
                      <TableHead>Anulado por</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="w-[90px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCancelledLogs.map((log: any) => (
                      <TableRow key={log.id} data-testid={`cancelled-log-row-${log.id}`}>
                        <TableCell className="font-mono text-sm font-medium">{log.reservationCode}</TableCell>
                        <TableCell>{log.guestName}</TableCell>
                        <TableCell>{log.roomNumber}</TableCell>
                        <TableCell>{formatDateAR(log.checkInDate)}</TableCell>
                        <TableCell>{formatDateAR(log.checkOutDate)}</TableCell>
                        <TableCell className="font-medium">
                          {log.totalAmount ? `$${parseFloat(log.totalAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                        </TableCell>
                        <TableCell>
                          {log.cancellationDate
                            ? new Date(log.cancellationDate).toLocaleString("es-AR", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                                timeZone: "America/Argentina/Buenos_Aires",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>{log.cancelledBy || "—"}</TableCell>
                        <TableCell className="max-w-[200px]">
                          {log.reason ? (
                            <span className="text-sm text-muted-foreground italic">{log.reason}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">Sin motivo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.reservationId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950/30"
                              onClick={() => restoreMutation.mutate(log.reservationId)}
                              disabled={restoreMutation.isPending}
                              data-testid={`button-restore-${log.id}`}
                            >
                              <Undo2 className="h-3 w-3" />
                              Recuperar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <XCircle className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {cancelSearch || cancelFrom || cancelTo ? "Sin resultados" : "Sin anulaciones"}
                </h3>
                <p className="text-muted-foreground">
                  {cancelSearch || cancelFrom || cancelTo
                    ? "Ninguna anulación coincide con los filtros aplicados."
                    : "No hay reservas anuladas registradas en el sistema."}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Reservations Table */}
      {dateMode !== "anuladas" && (isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredReservations && filteredReservations.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Huésped</TableHead>
                <TableHead>Habitación</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Huéspedes</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.map((reservation) => (
                <TableRow 
                  key={reservation.id} 
                  data-testid={`reservation-row-${reservation.id}`}
                  className="cursor-pointer hover-elevate"
                  onClick={() => handleViewReservation(reservation)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">
                            {reservation.guest?.lastName} {reservation.guest?.firstName}
                          </p>
                          {reservation.isUpgrade && (
                            <span title="Up Grade aplicado">
                              <TrendingUp className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                          {reservation.voucherCode && (
                            <span title={`Voucher: ${reservation.voucherCode}`}>
                              <Ticket className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{reservation.guest?.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{reservation.room?.roomNumber}</TableCell>
                  <TableCell>{formatDateAR(reservation.checkInDate)}</TableCell>
                  <TableCell>{formatDateAR(reservation.checkOutDate)}</TableCell>
                  <TableCell>{reservation.numberOfGuests}</TableCell>
                  <TableCell>
                    <ReservationStatusBadge status={reservation.status} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {(() => {
                      const room = parseFloat(reservation.totalRoomAmount || "0");
                      const extras = (reservation.charges || [])
                        .filter((c: any) => c.status !== "anulado" && c.category !== "payment")
                        .reduce((sum: number, c: any) => sum + parseFloat(c.amount || "0"), 0);
                      const pagado = (reservation.payments || [])
                        .filter((p: any) => p.status !== "anulado")
                        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);
                      const saldo = room + extras - pagado;
                      return `$${saldo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
                    })()}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewReservation(reservation)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Detalle
                        </DropdownMenuItem>
                        {!isResLocked(reservation) && (
                          <DropdownMenuItem onClick={() => handleEditReservation(reservation)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={() => handleDuplicateReservation(reservation)}
                          data-testid={`duplicate-reservation-${reservation.id}`}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </DropdownMenuItem>
                        {!isResLocked(reservation) && (
                          <>
                          <DropdownMenuSeparator />
                          {reservation.status === "pending" && (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "confirmed" })}
                            >
                              <Check className="mr-2 h-4 w-4 text-green-600" />
                              Confirmar
                            </DropdownMenuItem>
                          )}
                          {(reservation.status === "confirmed" || reservation.status === "pending" || reservation.status === "tentative") && (
                            <DropdownMenuItem
                              onClick={() => {
                                setPendingCheckInId(reservation.id);
                                checkInFromListMutation.mutate({ id: reservation.id });
                              }}
                            >
                              <LogIn className="mr-2 h-4 w-4 text-blue-600" />
                              Hacer Check-in
                            </DropdownMenuItem>
                          )}
                          {reservation.status === "checked_in" && (
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/reservations/${reservation.id}/payments?includeAnulados=true`, { credentials: "include" });
                                  const pmts = res.ok ? await res.json() : [];
                                  const uninvoiced = Array.isArray(pmts) ? pmts.filter((p: any) => p.status !== "anulado" && !p.invoiceRef) : [];
                                  if (uninvoiced.length > 0) {
                                    setListCheckoutWarningCount(uninvoiced.length);
                                    setListCheckoutWarningResId(reservation.id);
                                  } else {
                                    updateStatusMutation.mutate({ id: reservation.id, status: "checked_out" });
                                  }
                                } catch {
                                  updateStatusMutation.mutate({ id: reservation.id, status: "checked_out" });
                                }
                              }}
                            >
                              <LogOut className="mr-2 h-4 w-4 text-orange-600" />
                              Hacer Check-out
                            </DropdownMenuItem>
                          )}
                          {reservation.status !== "cancelled" && reservation.status !== "checked_out" && (
                            <DropdownMenuItem
                              onClick={() => handleCancelReservation(reservation)}
                            >
                              <X className="mr-2 h-4 w-4 text-red-600" />
                              Anular Reserva
                            </DropdownMenuItem>
                          )}
                          </>
                        )}
                        {isResLocked(reservation) && (
                          <DropdownMenuItem disabled>
                            <Lock className="mr-2 h-4 w-4" />
                            Reserva cerrada
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarCheck className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay reservas</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== "all"
                ? "No se encontraron reservas con los filtros aplicados."
                : "Comienza creando la primera reserva del hotel."}
            </p>
            {!searchQuery && statusFilter === "all" && (
              <Button onClick={handleNewReservation}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Primera Reserva
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Reservation Form Dialog */}
      <ReservationFormDialog
        key={selectedReservation?.id ?? "new"}
        reservation={selectedReservation}
        guests={guests || []}
        rooms={rooms || []}
        roomTypes={roomTypes || []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          const editingId = selectedReservation?.id;
          const savedReturnTo = editReturnTo;
          setEditReturnTo(null);
          if (editingId) {
            fetch(`/api/reservations/${editingId}`, { credentials: "include" })
              .then(r => r.ok ? r.json() : null)
              .then(updated => {
                if (updated) {
                  setSelectedReservation(updated);
                  setDetailReturnToSync(savedReturnTo);
                  setDetailDialogOpen(true);
                } else {
                  setSelectedReservation(undefined);
                }
              })
              .catch(() => { setSelectedReservation(undefined); });
          } else {
            setSelectedReservation(undefined);
          }
        }}
      />

      {/* Reservation Detail Dialog */}
      {selectedReservation && (
        <ReservationDetailDialog
          reservation={selectedReservation}
          open={detailDialogOpen}
          onOpenChange={(open) => {
            setDetailDialogOpen(open);
            if (!open && detailReturnToRef.current) {
              const returnUrl = detailReturnToRef.current;
              detailReturnToRef.current = null;
              setDetailReturnTo(null);
              navigate(returnUrl);
            }
          }}
          onCancel={() => setCancelDialogOpen(true)}
          onEdit={() => {
            const savedReturnTo = detailReturnToRef.current;
            detailReturnToRef.current = null;
            setDetailReturnTo(null);
            setEditReturnTo(savedReturnTo);
            setDetailDialogOpen(false);
            setDialogOpen(true);
          }}
        />
      )}

      {/* Cancel Reservation Dialog */}
      {selectedReservation && (
        <CancelReservationDialog
          reservation={selectedReservation}
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          onSuccess={() => setSelectedReservation(undefined)}
          currentUserName={user?.username}
        />
      )}

      {/* Duplicate Reservation Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar Reserva</DialogTitle>
            <DialogDescription>
              Crea una nueva reserva con los mismos datos del huesped y habitacion.
              Selecciona las nuevas fechas para la reserva duplicada.
            </DialogDescription>
          </DialogHeader>
          {selectedReservation && (() => {
            const todayLocal = getLocalToday();
            const isCheckInPast = duplicateCheckIn ? duplicateCheckIn < todayLocal : false;
            const isCheckOutBeforeCheckIn = duplicateCheckIn && duplicateCheckOut ? duplicateCheckOut <= duplicateCheckIn : false;
            const nights = duplicateCheckIn && duplicateCheckOut && !isCheckOutBeforeCheckIn
              ? Math.ceil((new Date(duplicateCheckOut + "T12:00:00").getTime() - new Date(duplicateCheckIn + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24))
              : 0;
            const hasValidDates = duplicateCheckIn && duplicateCheckOut && !isCheckInPast && !isCheckOutBeforeCheckIn && nights > 0;

            return (
              <div className="space-y-4">
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-sm font-medium">Reserva original:</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedReservation.guest?.lastName} {selectedReservation.guest?.firstName} - Hab. {selectedReservation.room?.roomNumber}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="duplicate-checkin">Nueva Fecha Entrada</Label>
                    <Input
                      id="duplicate-checkin"
                      type="date"
                      min={getLocalToday()}
                      value={duplicateCheckIn}
                      onChange={(e) => setDuplicateCheckIn(e.target.value)}
                      data-testid="input-duplicate-checkin"
                    />
                    {isCheckInPast && (
                      <p className="text-xs text-destructive">La fecha no puede ser en el pasado</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duplicate-checkout">Nueva Fecha Salida</Label>
                    <Input
                      id="duplicate-checkout"
                      type="date"
                      min={duplicateCheckIn || getLocalToday()}
                      value={duplicateCheckOut}
                      onChange={(e) => setDuplicateCheckOut(e.target.value)}
                      data-testid="input-duplicate-checkout"
                    />
                    {isCheckOutBeforeCheckIn && (
                      <p className="text-xs text-destructive">La salida debe ser posterior a la entrada</p>
                    )}
                  </div>
                </div>
                {nights > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Estancia: {nights} noche(s)
                  </p>
                )}
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedReservation && duplicateCheckIn && duplicateCheckOut) {
                  const checkIn = new Date(duplicateCheckIn);
                  const checkOut = new Date(duplicateCheckOut);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  if (checkIn < today) {
                    toast({ title: "Error", description: "La fecha de entrada no puede ser en el pasado", variant: "destructive" });
                    return;
                  }
                  if (checkOut <= checkIn) {
                    toast({ title: "Error", description: "La fecha de salida debe ser posterior a la entrada", variant: "destructive" });
                    return;
                  }
                  
                  duplicateMutation.mutate({
                    id: selectedReservation.id,
                    checkInDate: duplicateCheckIn,
                    checkOutDate: duplicateCheckOut,
                  });
                }
              }}
              disabled={!duplicateCheckIn || !duplicateCheckOut || duplicateMutation.isPending}
              data-testid="button-confirm-duplicate"
            >
              {duplicateMutation.isPending ? "Duplicando..." : "Crear Reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning: anticipos sin factura (checkout desde lista) */}
      <AlertDialog open={!!listCheckoutWarningResId} onOpenChange={(open) => { if (!open) setListCheckoutWarningResId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Anticipos sin factura emitida
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {listCheckoutWarningCount} anticipo{listCheckoutWarningCount !== 1 ? "s" : ""} registrado{listCheckoutWarningCount !== 1 ? "s" : ""} sin factura electrónica emitida.
                </p>
                <p className="text-sm">¿Desea abrir el detalle para emitirlas antes de continuar, o hacer el check-out de todas formas?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setListCheckoutWarningResId(null)} data-testid="button-list-uninvoiced-back">
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                const resId = listCheckoutWarningResId;
                setListCheckoutWarningResId(null);
                if (resId) updateStatusMutation.mutate({ id: resId, status: "checked_out" });
              }}
              data-testid="button-list-uninvoiced-proceed"
            >
              Continuar de todas formas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Check-in retroactivo dialog */}
      <Dialog open={retroCheckInDialogOpen} onOpenChange={(open) => { setRetroCheckInDialogOpen(open); if (!open) { setRetroCheckInMotivo(""); setPendingCheckInId(null); } }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Check-in retroactivo
            </DialogTitle>
            <DialogDescription>
              La fecha de check-in es anterior a hoy. Ingrese el motivo por el cual se registra con fecha pasada.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="retro-motivo-list">Motivo (obligatorio)</Label>
            <Input
              id="retro-motivo-list"
              className="mt-1"
              placeholder="Ej: El huésped llegó ayer sin registrar..."
              value={retroCheckInMotivo}
              onChange={(e) => setRetroCheckInMotivo(e.target.value)}
              data-testid="input-retro-checkin-motivo"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRetroCheckInDialogOpen(false); setRetroCheckInMotivo(""); setPendingCheckInId(null); }}>Cancelar</Button>
            <Button
              disabled={!retroCheckInMotivo.trim() || checkInFromListMutation.isPending}
              onClick={() => { if (pendingCheckInId && retroCheckInMotivo.trim()) checkInFromListMutation.mutate({ id: pendingCheckInId, motivo: retroCheckInMotivo }); }}
              data-testid="button-confirm-retro-checkin"
            >
              {checkInFromListMutation.isPending ? "Procesando..." : "Confirmar Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
