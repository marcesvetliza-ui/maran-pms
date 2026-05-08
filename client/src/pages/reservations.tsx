import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { getLocalToday, formatDateAR, toArgentinaDateStr } from "@/lib/utils";
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
} from "lucide-react";
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
import { GuestSelector, CompanySelector, AgencySelector } from "@/components/entity-selector";
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

const VALID_STATUSES: ReservationStatus[] = ["tentative", "pending", "confirmed", "checked_in", "checked_out", "cancelled"];
const normalizeStatus = (s: string | null | undefined): ReservationStatus =>
  VALID_STATUSES.includes(s as ReservationStatus) ? (s as ReservationStatus) : "pending";

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const statusConfig: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative: { label: "Tentativa", variant: "outline" },
    pending: { label: "Pendiente", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Check-in", variant: "default" },
    checked_out: { label: "Check-out", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
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

  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(reservation?.roomTypeId || defaultValues?.roomTypeId || "");
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");

  // Cargos adicionales al crear
  const newResChargePresets = [
    { label: "Cochera (por día)", description: "Cochera", amount: "2500", category: "otros" as const },
    { label: "Media Pensión", description: "Media Pensión", amount: "4500", category: "restaurant" as const },
    { label: "Pensión Completa", description: "Pensión Completa", amount: "8000", category: "restaurant" as const },
    { label: "Desayuno adicional", description: "Desayuno adicional", amount: "1800", category: "restaurant" as const },
    { label: "Cena", description: "Cena", amount: "3500", category: "restaurant" as const },
    { label: "Frigobar", description: "Frigobar", amount: "1200", category: "minibar" as const },
    { label: "Lavandería", description: "Lavandería", amount: "2000", category: "otros" as const },
    { label: "Traslado", description: "Traslado", amount: "3000", category: "otros" as const },
    { label: "SPA / Masaje", description: "SPA / Masaje", amount: "5000", category: "spa" as const },
    { label: "Cargo personalizado", description: "", amount: "", category: "otros" as const },
  ];
  const [pendingCharges, setPendingCharges] = useState<Array<{ description: string; amount: string; category: string; quantity: number }>>([]);
  const [showResChargeForm, setShowResChargeForm] = useState(false);
  const [resChargePreset, setResChargePreset] = useState("");
  const [resChargeDesc, setResChargeDesc] = useState("");
  const [resChargeAmount, setResChargeAmount] = useState("");
  const [resChargeQty, setResChargeQty] = useState(1);
  const [resChargeCategory, setResChargeCategory] = useState("otros");
  const [hasVoucher, setHasVoucher] = useState(!!(reservation?.voucherCode || reservation?.voucherNotes));

  const [formData, setFormData] = useState<Partial<InsertReservation>>({
    reservationCode: reservation?.reservationCode || "",
    guestId: reservation?.guestId || "",
    companyId: reservation?.companyId || "",
    agencyId: reservation?.agencyId || "",
    roomTypeId: reservation?.roomTypeId || defaultValues?.roomTypeId || "",
    roomId: reservation?.roomId || defaultValues?.roomId || "",
    ratePlanId: reservation?.ratePlanId || "",
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
    voucherCode: reservation?.voucherCode || "",
    voucherNotes: reservation?.voucherNotes || "",
    createdAt: reservation?.createdAt || new Date().toISOString(),
  });

  useEffect(() => {
    if (open) {
      setSelectedGuest(reservation?.guest || null);
      setSelectedCompany(reservation?.company || null);
      setSelectedAgency(reservation?.agency || null);
      setSelectedRoomTypeId(reservation?.roomTypeId || defaultValues?.roomTypeId || "");
      setFormData({
        reservationCode: reservation?.reservationCode || "",
        guestId: reservation?.guestId || "",
        companyId: reservation?.companyId || "",
        agencyId: reservation?.agencyId || "",
        roomTypeId: reservation?.roomTypeId || defaultValues?.roomTypeId || "",
        roomId: reservation?.roomId || defaultValues?.roomId || "",
        ratePlanId: reservation?.ratePlanId || "",
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
        voucherCode: reservation?.voucherCode || "",
        voucherNotes: reservation?.voucherNotes || "",
        createdAt: reservation?.createdAt || new Date().toISOString(),
      });
      setPendingCharges([]);
      setShowResChargeForm(false);
      setResChargePreset("");
      setResChargeDesc("");
      setResChargeAmount("");
      setResChargeQty(1);
      setHasVoucher(!!(reservation?.voucherCode || reservation?.voucherNotes));
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
        description: `${newGuest.firstName} ${newGuest.lastName} ha sido registrado.`,
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

  const { data: ratePlans } = useQuery<RatePlan[]>({
    queryKey: ["/api/rate-plans/by-room-type", selectedRoomTypeId],
    queryFn: async () => {
      if (!selectedRoomTypeId) return [];
      const res = await fetch(`/api/rate-plans/by-room-type/${selectedRoomTypeId}`);
      return res.json();
    },
    enabled: !!selectedRoomTypeId,
  });

  const { data: bedTypes } = useQuery<BedType[]>({
    queryKey: ["/api/bed-types"],
  });

  const { data: activePackages } = useQuery<Package[]>({
    queryKey: ["/api/packages/active"],
  });

  const { data: generatedCode } = useQuery<{ code: string }>({
    queryKey: ["/api/reservations/generate-code"],
    enabled: !isEditing && !formData.reservationCode,
  });

  const calculateNights = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
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
    const plan = ratePlans?.find(p => p.id === ratePlanId);
    if (plan) {
      const nights = calculateNights(formData.checkInDate || today, formData.checkOutDate || tomorrow);
      const rate = getPaxRate(plan, parseInt(String(formData.numberOfGuests)) || 2);
      const totals = calculateTotals(rate, formData.discountType as DiscountType, formData.discountValue || "0", nights);
      setFormData({ 
        ...formData, 
        ratePlanId, 
        baseRatePerNight: rate,
        ...totals,
      });
    }
  };

  const handleDateChange = (field: "checkInDate" | "checkOutDate", value: string) => {
    const newData = { ...formData, [field]: value };
    const nights = calculateNights(
      field === "checkInDate" ? value : formData.checkInDate || today,
      field === "checkOutDate" ? value : formData.checkOutDate || tomorrow
    );
    const totals = calculateTotals(
      formData.baseRatePerNight || "0", 
      formData.discountType as DiscountType, 
      formData.discountValue || "0", 
      nights
    );
    setFormData({ ...newData, nights, ...totals });
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
      if (pendingCharges.length > 0) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
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
        title: "Error",
        description: message,
        variant: "destructive",
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
    mutation.mutate({
      ...formData,
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

  const availableRooms = rooms.filter((r) => {
    const sameRoom = r.id === reservation?.roomId || r.id === defaultValues?.roomId || r.id === formData.roomId;
    const isUsable = ["available", "dirty", "cleaning", "inspected"].includes(r.status);
    return (isUsable || sameRoom) && r.roomTypeId === selectedRoomTypeId;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
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
            />

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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="roomType">Tipo de Habitación</Label>
                <Select
                  value={selectedRoomTypeId}
                  onValueChange={handleRoomTypeChange}
                >
                  <SelectTrigger data-testid="select-room-type">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="room">Habitación</Label>
                <Select
                  value={formData.roomId}
                  onValueChange={(value) => setFormData({ ...formData, roomId: value })}
                  disabled={!selectedRoomTypeId}
                >
                  <SelectTrigger data-testid="select-room">
                    <SelectValue placeholder="Seleccionar habitación" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        Hab. {room.roomNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
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
                  {ratePlans?.map((plan) => {
                    const hasPaxRates = plan.rate2pax || plan.rate3pax || plan.rate4pax;
                    return (
                      <SelectItem key={plan.id} value={plan.id}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{plan.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {plan.currency} {Number(plan.baseRate).toLocaleString("es-AR")}
                            {plan.rate2pax ? ` · 2P: ${Number(plan.rate2pax).toLocaleString("es-AR")}` : ""}
                            {plan.rate3pax ? ` · 3P: ${Number(plan.rate3pax).toLocaleString("es-AR")}` : ""}
                            {plan.rate4pax ? ` · 4P: ${Number(plan.rate4pax).toLocaleString("es-AR")}` : ""}
                            {!hasPaxRates ? " (tarifa fija)" : ""}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {formData.ratePlanId && (() => {
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
                    <span className="font-bold">{plan.currency} {Number(effectivePaxRate).toLocaleString("es-AR")}/noche</span>
                    {isPaxSpecific && <span className="text-blue-500">(tarifa {numGuests}P)</span>}
                  </div>
                );
              })()}
            </div>

            {/* Voucher */}
            <div className="grid gap-2">
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
                      const nights = pkg.nights || 1;
                      const checkIn = formData.checkInDate || today;
                      const d = new Date(checkIn + "T12:00:00");
                      d.setDate(d.getDate() + nights);
                      const newCheckOut = toArgentinaDateStr(d);
                      const totalPrice = parseFloat(pkg.basePrice);
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
                  }}
                >
                  <SelectTrigger data-testid="select-package">
                    <SelectValue placeholder="Sin paquete" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin paquete</SelectItem>
                    {activePackages.map(pkg => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} — ${pkg.basePrice} ({pkg.nights} noche{pkg.nights !== 1 ? "s" : ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPackageId && (() => {
                  const pkg = activePackages.find(p => p.id === selectedPackageId);
                  if (!pkg) return null;
                  return (
                    <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-3 py-2">
                      <Gift className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-green-800 dark:text-green-300">{pkg.name}</span>
                        <span className="text-xs text-green-700 dark:text-green-400 ml-1">· {pkg.nights} noche{pkg.nights !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="text-sm font-bold text-green-800 dark:text-green-300 whitespace-nowrap">
                        ${Number(pkg.basePrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="checkIn">Fecha Check-in</Label>
                <Input
                  id="checkIn"
                  type="date"
                  value={formData.checkInDate}
                  onChange={(e) => handleDateChange("checkInDate", e.target.value)}
                  required
                  data-testid="input-check-in"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="checkOut">Fecha Check-out</Label>
                <Input
                  id="checkOut"
                  type="date"
                  value={formData.checkOutDate}
                  onChange={(e) => handleDateChange("checkOutDate", e.target.value)}
                  required
                  data-testid="input-check-out"
                />
              </div>
            </div>

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
                      <SelectItem value="tentative">Tentativa</SelectItem>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="confirmed">Confirmada</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
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
                    readOnly
                    placeholder="0.00"
                    className="pl-7 bg-muted cursor-not-allowed"
                    data-testid="input-base-rate"
                    title="La tarifa se establece automáticamente según el plan tarifario"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedPackageId
                    ? "Definida por el paquete seleccionado"
                    : "Definida por el plan tarifario seleccionado"}
                </p>
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
                  {bedTypes?.filter(bt => bt.isActive).sort((a, b) => a.displayOrder - b.displayOrder).map(bt => (
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
                          onChange={(e) => setResChargeQty(Math.max(1, parseInt(e.target.value) || 1))}
                          data-testid="input-new-res-charge-qty"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowResChargeForm(false); setResChargePreset(""); setResChargeDesc(""); setResChargeAmount(""); setResChargeQty(1); }}
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
                          <span className="font-medium">${(parseFloat(charge.amount) * charge.quantity).toFixed(2)}</span>
                          <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => setPendingCharges(prev => prev.filter((_, i) => i !== idx))}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 text-sm font-semibold bg-muted/30">
                      <span>Total cargos</span>
                      <span>${pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount) * c.quantity, 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Tarifa Final/Noche</p>
                  <p className="text-lg font-semibold">${formData.finalRatePerNight || "0.00"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Habitación</p>
                  <p className="text-2xl font-bold text-primary">${formData.totalRoomAmount || "0.00"}</p>
                </div>
              </div>
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
                    onCheckedChange={(checked) => setFormData({ ...formData, earlyCheckIn: checked, ...(!checked && { earlyCheckInTime: "", earlyCheckInCharge: "" }) })}
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
                    onCheckedChange={(checked) => setFormData({ ...formData, lateCheckOut: checked, ...(!checked && { lateCheckOutTime: "", lateCheckOutCharge: "" }) })}
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
    onError: () => {
      toast({ title: "Error al realizar check-out", variant: "destructive" });
    },
  });

  const printConfirmation = () => {
    const guest = reservation.guest;
    const room = reservation.room;
    const guestName = `${(guest?.lastName || "").toUpperCase()} ${guest?.firstName || ""}`.trim();
    const formatShort = (dateStr: string) => {
      const [y, m, d] = dateStr.split("-");
      return `${d}/${m}/${y}`;
    };
    const checkIn = formatShort(reservation.checkInDate);
    const checkOut = formatShort(reservation.checkOutDate);
    const nights = Math.round(
      (new Date(reservation.checkOutDate).getTime() - new Date(reservation.checkInDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const roomTypeName = (room as any)?.roomType?.name || "Habitación";
    const dailyRate = reservation.finalRatePerNight
      ? `$${Number(reservation.finalRatePerNight).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      : "$0.00";
    const totalRate = reservation.totalRoomAmount
      ? `$${Number(reservation.totalRoomAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      : "$0.00";
    const pax = reservation.numberOfGuests || 1;
    const reservationCode = reservation.reservationCode || reservation.id;
    const company = (reservation as any).company?.razonSocial || (reservation as any).company?.nombreFantasia || "";
    const earlyCheckIn = reservation.earlyCheckIn;
    const earlyCheckInTime = reservation.earlyCheckInTime || "";
    const earlyCheckInCharge = reservation.earlyCheckInCharge ? parseFloat(String(reservation.earlyCheckInCharge)) : 0;
    const lateCheckOut = reservation.lateCheckOut;
    const lateCheckOutTime = reservation.lateCheckOutTime || "";
    const lateCheckOutCharge = reservation.lateCheckOutCharge ? parseFloat(String(reservation.lateCheckOutCharge)) : 0;
    const formatMoney = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
    const totalConExtras = parseFloat(reservation.totalRoomAmount || "0") + (earlyCheckIn ? earlyCheckInCharge : 0) + (lateCheckOut ? lateCheckOutCharge : 0);
    const activeChargesForPrint = (activeConsumptionCharges || []).filter(c => c.category !== "payment");
    const totalChargesForPrint = activeChargesForPrint.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const grandTotal = totalConExtras + totalChargesForPrint;
    const hasCochera = activeChargesForPrint.some(c => (c.description || "").toLowerCase().includes("cochera"));
    const extrasHtml = activeChargesForPrint.length > 0
      ? `<div class="extras-section"><div class="extras-title">Servicios Adicionales / Additional Services</div><table class="extras-table">${activeChargesForPrint.map(c => `<tr><td class="extras-desc">${c.description || ""}</td><td class="extras-amount">$${parseFloat(c.amount).toLocaleString("es-AR",{minimumFractionDigits:2})}</td></tr>`).join("")}<tr class="extras-total-row"><td class="extras-desc" style="font-weight:bold;color:#444;">Subtotal servicios</td><td class="extras-amount" style="font-weight:bold;color:#111;">$${totalChargesForPrint.toLocaleString("es-AR",{minimumFractionDigits:2})}</td></tr></table></div>`
      : "";

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Confirmación de Reserva - ${guestName}</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:12px;color:#333;background:white;}.page{max-width:780px;margin:0 auto;padding:0;}.header-photo{width:100%;height:180px;background:linear-gradient(180deg,#2c5f8a 0%,#1a3a5c 60%,#0d2035 100%);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:13px;letter-spacing:2px;text-transform:uppercase;}.logo-bar{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:2px solid #c8a97e;background:#fff;}.logo-left{display:flex;align-items:center;gap:14px;}.logo-circle{width:56px;height:56px;border-radius:50%;border:2px solid #c8a97e;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:bold;color:#c8a97e;text-align:center;line-height:1.3;letter-spacing:0.5px;text-transform:uppercase;padding:6px;}.logo-name{font-size:20px;font-weight:bold;color:#8b5e2a;font-family:Georgia,serif;line-height:1.1;}.logo-name span{display:block;font-size:11px;font-weight:normal;color:#999;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;}.logo-badge{text-align:center;font-size:8px;color:#888;border:1px solid #ccc;border-radius:4px;padding:6px 10px;line-height:1.5;}.logo-badge strong{display:block;font-size:10px;color:#c8a97e;}.content{padding:20px 28px;}.reservation-header{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:0;border:1px solid #ccc;margin-bottom:18px;}.reservation-header .cell{padding:6px 10px;border-right:1px solid #ccc;}.reservation-header .cell:last-child{border-right:none;}.reservation-header .cell-label{font-size:8px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;}.reservation-header .cell-value{font-size:12px;font-weight:bold;color:#111;}.greeting{font-size:12px;color:#444;line-height:1.6;margin-bottom:18px;}.details-table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;}.details-table td{padding:5px 10px;border:1px solid #ddd;vertical-align:middle;}.details-table .label-col{background:#f5f5f5;font-weight:bold;color:#555;width:45%;}.details-table .value-col{color:#111;font-size:12px;}.rates-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #ddd;margin-bottom:4px;}.rates-grid .rate-cell{padding:5px 10px;border-right:1px solid #ddd;border-bottom:1px solid #ddd;font-size:11px;}.rates-grid .rate-cell:nth-child(even){border-right:none;}.rates-grid .rate-label{font-weight:bold;color:#555;background:#f5f5f5;font-size:10px;}.rates-grid .rate-value{color:#111;}.total-box{border:2px solid #333;text-align:center;padding:6px;font-size:13px;font-weight:bold;margin-bottom:18px;color:#111;}.total-box span{font-size:10px;font-weight:normal;color:#555;margin-right:8px;}.conditions{font-size:10px;color:#444;line-height:1.7;margin-bottom:20px;}.conditions p{margin-bottom:3px;}.conditions p::before{content:"» ";color:#888;}.sustainable{font-size:10px;color:#4a7c59;font-style:italic;margin-bottom:20px;}.footer{border-top:2px solid #c8a97e;padding:12px 0 0;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#555;}.footer-left{line-height:1.8;}.footer-right{font-size:13px;font-weight:bold;color:#8b5e2a;letter-spacing:1px;text-transform:uppercase;}@media print{body{margin:0;}.page{max-width:100%;}}.extras-section{margin-bottom:14px;border:1px solid #ddd;border-radius:3px;overflow:hidden;}.extras-title{font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#666;padding:5px 10px;background:#f9f9f9;border-bottom:1px solid #ddd;font-weight:bold;}.extras-table{width:100%;border-collapse:collapse;font-size:11px;}.extras-table tr{border-bottom:1px solid #eee;}.extras-table td{padding:4px 10px;}.extras-desc{color:#333;}.extras-amount{text-align:right;font-weight:bold;color:#111;width:120px;}.extras-total-row td{background:#f5f5f5;border-top:1px solid #ccc;}</style></head><body><div class="page"><div class="header-photo">MARAN SUITES &amp; TOWERS · PARANÁ</div><div class="logo-bar"><div class="logo-left"><div class="logo-circle">Hotel<br>&amp; Spa<br>MARAN<br>SUITES<br>&amp; Towers</div><div class="logo-name">MARAN SUITES &amp; TOWERS<span>Hotel &amp; Spa · Paraná, Entre Ríos</span></div></div><div class="logo-badge"><strong>PLATA</strong>CERTIFICACIÓN<br>EN SOSTENIBILIDAD<br>HOTELES MÁS VERDES</div></div><div class="content"><div class="reservation-header"><div class="cell"><div class="cell-label">Apellido y Nombre / Last Name and Name</div><div class="cell-value">${guestName}</div></div><div class="cell"><div class="cell-label">Check In</div><div class="cell-value">${checkIn}</div></div><div class="cell"><div class="cell-label">Check Out</div><div class="cell-value">${checkOut}</div></div><div class="cell"><div class="cell-label">Cant. de Pax</div><div class="cell-value">${pax}</div></div><div class="cell"><div class="cell-label">Nº de Reserva</div><div class="cell-value">${reservationCode}</div></div></div>${company ? `<div class="reservation-header" style="margin-top:-14px;"><div class="cell" style="grid-column:span 5;border-right:none;"><div class="cell-label">Empresa / Company</div><div class="cell-value">${company}</div></div></div>` : ""}<div class="greeting"><strong>Estimado/a,</strong><br>Gracias por efectuar su reserva, será un placer recibirlo en nuestra casa. A continuación detallamos la información correspondiente a la misma.</div><table class="details-table"><tr><td class="label-col">Cantidad de noches / Number of nights</td><td class="value-col">${nights}</td></tr><tr><td class="label-col">Categoría de Habitación / Type of Room</td><td class="value-col">${roomTypeName}</td></tr></table><div class="rates-grid"><div class="rate-cell rate-label">Tarifa diaria / Daily rate</div><div class="rate-cell rate-value">${dailyRate}</div><div class="rate-cell rate-label">Total Alojamiento / Total room rate</div><div class="rate-cell rate-value">${totalRate}</div>${earlyCheckIn ? `<div class="rate-cell rate-label" style="color:#b45309;">Early Check-in${earlyCheckInTime ? ` (${earlyCheckInTime} hs)` : ""}</div><div class="rate-cell rate-value" style="color:#b45309;">${formatMoney(earlyCheckInCharge)}</div>` : ""}${lateCheckOut ? `<div class="rate-cell rate-label" style="color:#7c3aed;">Late Check-out${lateCheckOutTime ? ` (${lateCheckOutTime} hs)` : ""}</div><div class="rate-cell rate-value" style="color:#7c3aed;">${formatMoney(lateCheckOutCharge)}</div>` : ""}</div>${extrasHtml}<div class="total-box"><span>Total General / Grand Total:</span>$${grandTotal.toLocaleString("es-AR",{minimumFractionDigits:2})}</div><div class="conditions"><p>La tarifa incluye desayuno buffet y gimnasio con turno previo.</p>${hasCochera ? "" : "<p>La cochera tiene costo adicional.</p>"}<p>Nuestro horario de Check in es a partir de las ${earlyCheckIn && earlyCheckInTime ? earlyCheckInTime : "15:00"} Hs y el Check out es hasta las ${lateCheckOut && lateCheckOutTime ? lateCheckOutTime : "10:00"} Hs.</p><p>Early Check in o Late Check out tienen costo adicional del 50% del valor de una noche.</p><p>Importante: En el momento de ingreso, deberá acreditar su identidad con su respectivo DNI.</p></div><div class="sustainable">Somos un hotel certificado en acciones sustentables, por lo que no es necesario que se imprima esta confirmación de reserva, la misma es válida en formato digital.</div><div class="footer"><div class="footer-left">Alameda de la Federación y Mitre, Paraná (3100) Entre Ríos, Argentina<br>✉ reservas@maran.com.ar &nbsp;|&nbsp; +54 9 343 503 8070 &nbsp;|&nbsp; ☎ +54 (0343) 423 5444</div><div class="footer-right">maran.com.ar</div></div></div></div><script>window.onload=function(){window.print();};</script></body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [transferringChargeId, setTransferringChargeId] = useState<string | null>(null);
  const [targetReservationId, setTargetReservationId] = useState<string>("");
  const [showBulkTransfer, setShowBulkTransfer] = useState(false);
  const [bulkTargetReservationId, setBulkTargetReservationId] = useState<string>("");
  const [bulkSelectedChargeIds, setBulkSelectedChargeIds] = useState<Set<string>>(new Set());
  const [bulkIncludeAccommodation, setBulkIncludeAccommodation] = useState(false);
  const [bulkTransferNote, setBulkTransferNote] = useState("");
  const [anularTarget, setAnularTarget] = useState<{ type: "cargo" | "pago"; id: string } | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [newCharge, setNewCharge] = useState({
    description: "",
    amount: "",
    category: "otros" as "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment",
  });
  const chargePresets = [
    { label: "Cochera (por día)", description: "Cochera", amount: "2500", category: "otros" as const },
    { label: "Media Pensión", description: "Media Pensión", amount: "4500", category: "restaurant" as const },
    { label: "Pensión Completa", description: "Pensión Completa", amount: "8000", category: "restaurant" as const },
    { label: "Desayuno adicional", description: "Desayuno adicional", amount: "1800", category: "restaurant" as const },
    { label: "Cena", description: "Cena", amount: "3500", category: "restaurant" as const },
    { label: "Frigobar", description: "Frigobar", amount: "1200", category: "minibar" as const },
    { label: "Lavandería", description: "Lavandería", amount: "2000", category: "otros" as const },
    { label: "Traslado", description: "Traslado", amount: "3000", category: "otros" as const },
    { label: "SPA / Masaje", description: "SPA / Masaje", amount: "5000", category: "spa" as const },
    { label: "Cargo editable", description: "", amount: "", category: "otros" as const },
  ];
  const [chargeQty, setChargeQty] = useState(1);
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

  // Fetch active reservations for transfer target selection
  const { data: activeReservations, isError: isActiveReservationsError, isLoading: isActiveReservationsLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations", "transfer-targets"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Failed to fetch reservations");
      const all = await res.json();
      return all
        .filter((r: ReservationWithDetails) => 
          (r.status === "checked_in" || r.status === "confirmed") && r.id !== reservation.id
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

  const addChargeMutation = useMutation({
    mutationFn: async (chargeData: { description: string; amount: string; category: string; reservationId: string; date: string }) => {
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
      return apiRequest("PATCH", `/api/payments/${id}/anular`, { motivoAnulacion: motivo });
    },
    onSuccess: () => {
      refetchPayments();
      setAnularTarget(null);
      setMotivoAnulacion("");
      toast({ title: "Pago anulado", description: "El pago ha sido anulado del registro." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo anular el pago", variant: "destructive" });
      console.error("Anular payment error:", error);
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
    mutationFn: async (data: { targetReservationId: string; chargeIds: string[]; includeAccommodation: boolean; transferNote: string }) => {
      return apiRequest("POST", `/api/reservations/${reservation.id}/bulk-transfer`, data);
    },
    onSuccess: (data: any) => {
      refetchCharges();
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", reservation.id] });
      setShowBulkTransfer(false);
      setBulkTargetReservationId("");
      setBulkSelectedChargeIds(new Set());
      setBulkIncludeAccommodation(false);
      setBulkTransferNote("");
      const parts = [];
      if (data.accommodationTransferred) parts.push("alojamiento");
      if (data.chargesTransferred > 0) parts.push(`${data.chargesTransferred} cargo(s) extra`);
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
    });
    setSelectedPreset(null);
    setChargeQty(1);
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
    let successCount = 0;
    for (const row of validRows) {
      try {
        await addPaymentMutation.mutateAsync({
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
  const subtotalRoom = parseFloat(reservation.totalRoomAmount || "0");
  const totalToPay = subtotalRoom + totalConsumptions;
  const balance = totalToPay - totalPayments;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Reserva {reservation.reservationCode}
            <ReservationStatusBadge status={reservation.status} />
          </DialogTitle>
          <DialogDescription>Detalle de la reservación</DialogDescription>
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
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg" data-testid="text-guest-name">
                  {reservation.guest?.firstName} {reservation.guest?.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{reservation.guest?.email}</p>
                {reservation.guest?.phone && (
                  <p className="text-sm text-muted-foreground">{reservation.guest?.phone}</p>
                )}
              </div>
              <Badge variant="outline">{reservation.source}</Badge>
            </div>

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
                  <span>${reservation.finalRatePerNight || 0}</span>
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
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Subtotal Alojamiento</span>
                  <span data-testid="text-subtotal-room">${subtotalRoom.toFixed(2)}</span>
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
                        disabled={selectedPreset?.label !== "Cargo editable"}
                        data-testid="input-charge-description"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Precio unit. <span className="text-xs">(con IVA)</span></Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={newCharge.amount}
                        onChange={(e) => setNewCharge({ ...newCharge, amount: e.target.value })}
                        disabled={selectedPreset?.label !== "Cargo editable"}
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
                        onChange={(e) => setChargeQty(Math.max(1, parseInt(e.target.value) || 1))}
                        data-testid="input-charge-qty"
                      />
                    </div>
                  </div>

                  {newCharge.amount && chargeQty > 1 && (
                    <div className="text-sm text-right text-muted-foreground">
                      Total: <span className="font-semibold text-foreground">
                        ${(parseFloat(newCharge.amount || "0") * chargeQty).toFixed(2)}
                      </span>
                      <span className="ml-1 text-xs">
                        ({chargeQty} × ${parseFloat(newCharge.amount || "0").toFixed(2)})
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Categoría</Label>
                      <Select
                        value={newCharge.category}
                        onValueChange={(value) => setNewCharge({ ...newCharge, category: value as typeof newCharge.category })}
                        disabled={selectedPreset?.label !== "Cargo editable"}
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
                  return (
                  <div key={charge.id} className={`flex items-center justify-between p-3 text-sm ${isAnulado ? "opacity-50 bg-muted/30" : ""}`} data-testid={`charge-row-${charge.id}`}>
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0">{categoryLabels[charge.category]}</Badge>
                      {isAnulado && <Badge variant="destructive" className="text-xs shrink-0">ANULADO</Badge>}
                      <span className={`truncate ${isAnulado ? "line-through text-muted-foreground" : ""}`}>{charge.description}</span>
                      <span className="text-muted-foreground text-xs shrink-0">({formatDateAR(charge.date)})</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <span className={`font-medium tabular-nums ${isAnulado ? "line-through text-muted-foreground" : ""}`} data-testid={`text-charge-amount-${charge.id}`}>
                        ${parseFloat(charge.amount).toFixed(2)}
                      </span>
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
                <span data-testid="text-total-consumptions">${totalConsumptions.toFixed(2)}</span>
              </div>
            </div>

            <div className="border rounded-lg">
              <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                <h4 className="font-semibold">Pagos / Anticipos</h4>
                {!isLocked && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (!showAddPayment) {
                    const amt = balance > 0 ? balance.toFixed(2) : "";
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
                              {reservation.guest ? <strong> {reservation.guest.firstName} {reservation.guest.lastName}</strong> : ""}.
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
                                {companiesForCC.map(c => (
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
                                {agenciesForCC.map(a => (
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
                      Total: ${paymentRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toFixed(2)}
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

              <div className="divide-y max-h-[120px] overflow-y-auto">
                {payments?.map((payment) => {
                  const isAnulado = (payment as any).status === "anulado";
                  return (
                  <div key={payment.id} className={`flex items-center justify-between p-3 text-sm ${isAnulado ? "opacity-50 bg-muted/30" : ""}`} data-testid={`payment-row-${payment.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{paymentMethodLabels[payment.method]}</Badge>
                      {isAnulado && <Badge variant="destructive" className="text-xs">ANULADO</Badge>}
                      {(payment as any).billingTarget === "company" && (
                        <Badge variant="secondary" className="text-xs">Empresa</Badge>
                      )}
                      {payment.reference && <span className={`text-muted-foreground ${isAnulado ? "line-through" : ""}`}>{payment.reference}</span>}
                      <span className="text-muted-foreground text-xs">({formatDateAR(payment.date)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isAnulado ? "line-through text-muted-foreground" : "text-green-600"}`}>${parseFloat(payment.amount).toFixed(2)}</span>
                      {!isLocked && !isAnulado && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => { setAnularTarget({ type: "pago", id: payment.id }); setMotivoAnulacion(""); }}
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
              <div className="flex justify-between p-3 border-t text-sm font-medium">
                <span>Total Pagado</span>
                <span className="text-green-600" data-testid="text-total-payments">${totalPayments.toFixed(2)}</span>
              </div>
            </div>

            <div className="border rounded-lg bg-primary/5">
              <div className="p-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Subtotal Alojamiento</span>
                  <span>${subtotalRoom.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span>+ Consumos</span>
                  <span>${totalConsumptions.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mb-2 border-b pb-2">
                  <span>- Pagos/Anticipos</span>
                  <span className="text-green-600">-${totalPayments.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>SALDO PENDIENTE</span>
                  <span className={balance > 0 ? "text-destructive" : "text-green-600"} data-testid="text-balance">
                    ${balance.toFixed(2)}
                  </span>
                </div>
                {balance > 0.01 && !showAddPayment && !isLocked && (
                  <Button 
                    size="sm" 
                    className="w-full mt-2" 
                    onClick={() => {
                      setNewPayment({ amount: balance.toFixed(2), method: "efectivo", reference: "", notes: "", billingTarget: "guest" });
                      setPaymentRows([{ amount: balance.toFixed(2), method: "efectivo", reference: "", billingTarget: "guest" }]);
                      setShowAddPayment(true);
                    }}
                    data-testid="button-pay-balance"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Pagar Saldo Pendiente (${balance.toFixed(2)})
                  </Button>
                )}
              </div>
            </div>
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
                Editar Reserva
              </Button>
            )}
            {reservation.status === "checked_in" && (
              <Button
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300"
                onClick={() => setEarlyCheckoutDialogOpen(true)}
                data-testid="button-early-checkout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Check-out anticipado
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

      {/* Early Checkout Confirmation Dialog */}
      <AlertDialog open={earlyCheckoutDialogOpen} onOpenChange={setEarlyCheckoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-orange-500" />
              Confirmar Check-out Anticipado
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  El huésped <strong>{reservation.guest?.firstName} {reservation.guest?.lastName}</strong> tiene reserva 
                  hasta el <strong>{(() => { const [y,m,d] = reservation.checkOutDate.split("-"); return `${d}/${m}/${y}`; })()}</strong>.
                </p>
                <p>Al confirmar el check-out anticipado, la habitación <strong>{reservation.room?.roomNumber}</strong> quedará libre inmediatamente.</p>
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2">
                  Verificá que el folio esté saldado antes de liberar la habitación.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => earlyCheckoutMutation.mutate()}
              disabled={earlyCheckoutMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-early-checkout"
            >
              {earlyCheckoutMutation.isPending ? "Procesando..." : "Confirmar Check-out anticipado"}
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
        <DialogContent className="w-[95vw] max-w-[450px] max-h-[90vh] overflow-y-auto">
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
                    {activeReservations?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        Hab. {r.room?.roomNumber} — {r.guest?.firstName} {r.guest?.lastName}
                        {r.status === "checked_in" ? " (en casa)" : " (confirmada)"}
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
          setBulkTransferNote("");
        }
      }}>
        <DialogContent className="w-[95vw] max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Transferir folio a otra habitación
            </DialogTitle>
            <DialogDescription>
              Seleccioná qué cargos querés pasar a otra reserva. El saldo de esta quedará en $0 para los ítems transferidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Destination reservation */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Reserva destino</label>
              <Select value={bulkTargetReservationId} onValueChange={setBulkTargetReservationId} disabled={isActiveReservationsLoading}>
                <SelectTrigger data-testid="select-bulk-target-reservation">
                  <SelectValue placeholder={isActiveReservationsLoading ? "Cargando..." : "Seleccionar habitación / huésped..."} />
                </SelectTrigger>
                <SelectContent>
                  {activeReservations?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Hab. {r.room?.roomNumber} — {r.guest?.firstName} {r.guest?.lastName}
                      {r.status === "checked_in" ? " (en casa)" : " (confirmada)"}
                    </SelectItem>
                  ))}
                  {(!activeReservations || activeReservations.length === 0) && !isActiveReservationsLoading && (
                    <div className="p-2 text-sm text-muted-foreground text-center">No hay otras habitaciones activas</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Accommodation line */}
            <div className="border rounded-lg divide-y">
              <div className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  id="bulk-accommodation"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={bulkIncludeAccommodation}
                  onChange={(e) => setBulkIncludeAccommodation(e.target.checked)}
                  data-testid="checkbox-include-accommodation"
                />
                <label htmlFor="bulk-accommodation" className="flex-1 flex justify-between items-center cursor-pointer text-sm">
                  <span className="font-medium">Alojamiento</span>
                  <span className="font-semibold tabular-nums">
                    ${Number(reservation.totalRoomAmount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </label>
              </div>

              {/* Active extra charges */}
              {activeConsumptionCharges.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Sin consumos adicionales</div>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-2 bg-muted/30">
                    <input
                      type="checkbox"
                      id="bulk-all-charges"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={bulkSelectedChargeIds.size === activeConsumptionCharges.length && activeConsumptionCharges.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBulkSelectedChargeIds(new Set(activeConsumptionCharges.map(c => c.id)));
                        } else {
                          setBulkSelectedChargeIds(new Set());
                        }
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
                        className="h-4 w-4 rounded border-gray-300"
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

            {/* Total to transfer */}
            {(bulkIncludeAccommodation || bulkSelectedChargeIds.size > 0) && (
              <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 text-sm font-semibold">
                <span className="text-blue-800 dark:text-blue-300">Total a transferir</span>
                <span className="text-blue-900 dark:text-blue-200 tabular-nums">
                  ${(
                    (bulkIncludeAccommodation ? Number(reservation.totalRoomAmount || 0) : 0) +
                    activeConsumptionCharges
                      .filter(c => bulkSelectedChargeIds.has(c.id))
                      .reduce((sum, c) => sum + Number(c.amount), 0)
                  ).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkTransfer(false)}>Cancelar</Button>
            <Button
              onClick={() => bulkTransferMutation.mutate({
                targetReservationId: bulkTargetReservationId,
                chargeIds: Array.from(bulkSelectedChargeIds),
                includeAccommodation: bulkIncludeAccommodation,
                transferNote: bulkTransferNote,
              })}
              disabled={
                !bulkTargetReservationId ||
                (!bulkIncludeAccommodation && bulkSelectedChargeIds.size === 0) ||
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
      <Dialog open={anularTarget !== null} onOpenChange={(open) => {
        if (!open) { setAnularTarget(null); setMotivoAnulacion(""); }
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
            <Button variant="outline" onClick={() => { setAnularTarget(null); setMotivoAnulacion(""); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!anularTarget) return;
                if (anularTarget.type === "cargo") {
                  anularChargeMutation.mutate({ id: anularTarget.id, motivo: motivoAnulacion });
                } else {
                  anularPaymentMutation.mutate({ id: anularTarget.id, motivo: motivoAnulacion });
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
    </Dialog>
  );
}

function CancelReservationDialog({
  reservation,
  open,
  onOpenChange,
  onSuccess,
}: {
  reservation: ReservationWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [cancelledBy, setCancelledBy] = useState("");

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/reservations/${reservation.id}/cancel`, {
        reason,
        cancelledBy: cancelledBy || "Usuario del Sistema",
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
      <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                {reservation.guest?.firstName} {reservation.guest?.lastName}
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
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showHistory, setShowHistory] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateCheckIn, setDuplicateCheckIn] = useState("");
  const [duplicateCheckOut, setDuplicateCheckOut] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | undefined>();

  const todayStr = getLocalToday();
  const [dateMode, setDateMode] = useState<"upcoming" | "today" | "range" | "all" | "created">("upcoming");
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState("");
  const [createdFrom, setCreatedFrom] = useState(todayStr);
  const [createdTo, setCreatedTo] = useState(todayStr);

  // Motor de Reservas (web pending)
  const [webSectionExpanded, setWebSectionExpanded] = useState(true);
  const [confirmingReservation, setConfirmingReservation] = useState<any | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

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

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const viewId = params.get("view");
    if (viewId && reservations) {
      const reservation = reservations.find(r => r.id === viewId);
      if (reservation) {
        setSelectedReservation(reservation);
        setDetailDialogOpen(true);
        navigate("/reservations", { replace: true });
      } else if (dateMode !== "all") {
        setDateMode("all");
        setShowHistory(true);
      }
    }
  }, [searchParams, reservations, navigate]);

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
      const guestName = `${res.guest?.firstName} ${res.guest?.lastName}`.toLowerCase();
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
        <Button onClick={handleNewReservation} data-testid="button-new-reservation">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Reserva
        </Button>
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
                        <span className="font-medium">${Number(wr.total_amount || 0).toLocaleString("es-AR")}</span>
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
                <p><span className="text-muted-foreground">Total:</span> ${Number(confirmingReservation.total_amount || 0).toLocaleString("es-AR")}</p>
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
                      availableRoomsForAssign.map((r: any) => (
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
                  <SelectItem value="pending">Pendientes</SelectItem>
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
          </div>
        </CardContent>
      </Card>

      {!isLoading && filteredReservations && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1" data-testid="text-results-count">
          <span>
            {filteredReservations.length} reserva{filteredReservations.length !== 1 ? "s" : ""}
            {dateMode === "today" && " para hoy"}
            {dateMode === "upcoming" && " activas y futuras"}
            {dateMode === "range" && dateFrom && ` desde ${formatDateAR(dateFrom)}${dateTo ? ` hasta ${formatDateAR(dateTo)}` : ""}`}
          </span>
        </div>
      )}

      {/* Reservations Table */}
      {isLoading ? (
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
                <TableHead>Total</TableHead>
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
                        {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">
                            {reservation.guest?.firstName} {reservation.guest?.lastName}
                          </p>
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
                      return `$${(room + extras).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
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
                          {reservation.status === "confirmed" && (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "checked_in" })}
                            >
                              <LogIn className="mr-2 h-4 w-4 text-blue-600" />
                              Hacer Check-in
                            </DropdownMenuItem>
                          )}
                          {reservation.status === "checked_in" && (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "checked_out" })}
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
      )}

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
          setSelectedReservation(undefined);
          if (editingId) {
            fetch(`/api/reservations/${editingId}`, { credentials: "include" })
              .then(r => r.json())
              .then(updated => {
                setSelectedReservation(updated);
                setDetailDialogOpen(true);
              })
              .catch(() => {});
          }
        }}
      />

      {/* Reservation Detail Dialog */}
      {selectedReservation && (
        <ReservationDetailDialog
          reservation={selectedReservation}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onCancel={() => setCancelDialogOpen(true)}
          onEdit={() => {
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
            const checkInDate = duplicateCheckIn ? new Date(duplicateCheckIn) : null;
            const checkOutDate = duplicateCheckOut ? new Date(duplicateCheckOut) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const isCheckInPast = checkInDate && checkInDate < today;
            const isCheckOutBeforeCheckIn = checkInDate && checkOutDate && checkOutDate <= checkInDate;
            const nights = checkInDate && checkOutDate && !isCheckOutBeforeCheckIn
              ? Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
              : 0;
            const hasValidDates = duplicateCheckIn && duplicateCheckOut && !isCheckInPast && !isCheckOutBeforeCheckIn && nights > 0;

            return (
              <div className="space-y-4">
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-sm font-medium">Reserva original:</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedReservation.guest?.firstName} {selectedReservation.guest?.lastName} - Hab. {selectedReservation.room?.roomNumber}
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
    </div>
  );
}
