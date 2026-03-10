import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { getLocalToday, formatDateAR } from "@/lib/utils";
import {
  CalendarCheck,
  CalendarRange,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
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
import type { ReservationWithDetails, Guest, Company, Agency, RoomWithType, RoomType, RatePlan, InsertReservation, InsertGuest, InsertCompany, InsertAgency, ReservationStatus, DiscountType, ReservationSource, Charge, Payment, PaymentMethod, BedType } from "@shared/schema";

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const statusConfig: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative: { label: "Tentativa", variant: "outline" },
    pending: { label: "Pendiente", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Check-in", variant: "default" },
    checked_out: { label: "Check-out", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };

  const config = statusConfig[status] || { label: status || "Desconocido", variant: "outline" as const };

  return <Badge variant={config.variant}>{config.label}</Badge>;
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

  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(reservation?.roomTypeId || "");
  
  const [formData, setFormData] = useState<Partial<InsertReservation>>({
    reservationCode: reservation?.reservationCode || "",
    guestId: reservation?.guestId || "",
    companyId: reservation?.companyId || "",
    agencyId: reservation?.agencyId || "",
    roomTypeId: reservation?.roomTypeId || "",
    roomId: reservation?.roomId || "",
    ratePlanId: reservation?.ratePlanId || "",
    checkInDate: reservation?.checkInDate || today,
    checkOutDate: reservation?.checkOutDate || tomorrow,
    nights: reservation?.nights || 1,
    numberOfGuests: reservation?.numberOfGuests || 1,
    status: reservation?.status || "pending",
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
        status: reservation?.status || "pending",
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
        createdAt: reservation?.createdAt || new Date().toISOString(),
      });
    }
  }, [open, reservation?.id]);

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
        return apiRequest("PATCH", `/api/reservations/${reservation.id}`, data);
      }
      return apiRequest("POST", "/api/reservations", {
        ...data,
        reservationCode: data.reservationCode || generatedCode?.code || `RES-${Date.now()}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
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
    mutation.mutate({
      ...formData,
      bedTypeId: formData.bedTypeId || null,
      nights: Number(formData.nights),
      numberOfGuests: Number(formData.numberOfGuests),
      baseRatePerNight: String(formData.baseRatePerNight || "0"),
      finalRatePerNight: String(formData.finalRatePerNight || "0"),
      totalRoomAmount: String(formData.totalRoomAmount || "0"),
      discountValue: String(formData.discountValue || "0"),
    });
  };

  const availableRooms = rooms.filter((r) => 
    (r.status === "available" || r.id === reservation?.roomId) && 
    r.roomTypeId === selectedRoomTypeId
  );

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
                  {ratePlans?.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - ${plan.baseRate}/noche
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as ReservationStatus })}
                >
                  <SelectTrigger data-testid="select-reservation-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="confirmed">Confirmada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
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
                <Label htmlFor="baseRate">Tarifa Base/Noche</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="baseRate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.baseRatePerNight || ""}
                    onChange={(e) => handleBaseRateChange(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                    data-testid="input-base-rate"
                  />
                </div>
              </div>
            </div>

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

            <div className="grid gap-4">
              <Label className="text-sm font-semibold">Preferencias de camaje</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="bedType">Tipo de camaje</Label>
                  <Select
                    value={formData.bedTypeId != null ? String(formData.bedTypeId) : "none"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        bedTypeId: value === "none" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger data-testid="select-bed-type">
                      <SelectValue placeholder="Seleccionar tipo de camaje" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin preferencia</SelectItem>
                      {bedTypes?.filter(bt => bt.isActive).map((bt) => (
                        <SelectItem key={bt.id} value={String(bt.id)}>
                          {bt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bedTypeNotes">Notas de camaje</Label>
                  <Input
                    id="bedTypeNotes"
                    value={formData.bedTypeNotes || ""}
                    onChange={(e) => setFormData({ ...formData, bedTypeNotes: e.target.value })}
                    placeholder="Preferencias especiales..."
                    data-testid="input-bed-type-notes"
                  />
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
  const isLocked = (() => {
    const closed = ["checked_out", "cancelled"];
    if (!closed.includes(reservation.status)) return false;
    const today = getLocalToday();
    const refDate = reservation.checkOutDate
      ? String(reservation.checkOutDate).slice(0, 10)
      : reservation.checkInDate
        ? String(reservation.checkInDate).slice(0, 10)
        : null;
    if (!refDate) return false;
    return refDate < today;
  })();
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [transferringChargeId, setTransferringChargeId] = useState<string | null>(null);
  const [targetReservationId, setTargetReservationId] = useState<string>("");
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
  const [paymentRows, setPaymentRows] = useState<Array<{ amount: string; method: string; reference: string; billingTarget: string }>>([
    { amount: "", method: "efectivo", reference: "", billingTarget: "guest" },
  ]);

  // Fetch active reservations for transfer target selection
  const { data: activeReservations, isError: isActiveReservationsError, isLoading: isActiveReservationsLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations", "transfer-targets"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Failed to fetch reservations");
      const all = await res.json();
      // Filter to only show checked_in or confirmed reservations, excluding current
      return all.filter((r: ReservationWithDetails) => 
        (r.status === "checked_in" || r.status === "confirmed") && r.id !== reservation.id
      );
    },
    enabled: transferringChargeId !== null,
  });

  const { data: charges, refetch: refetchCharges } = useQuery<Charge[]>({
    queryKey: ["/api/reservations", reservation.id, "charges"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservation.id}/charges`);
      return res.json();
    },
  });

  const { data: payments, refetch: refetchPayments } = useQuery<Payment[]>({
    queryKey: ["/api/reservations", reservation.id, "payments"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservation.id}/payments`);
      return res.json();
    },
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
      return apiRequest("DELETE", `/api/charges/${chargeId}`, undefined);
    },
    onSuccess: () => {
      refetchCharges();
      toast({ title: "Cargo eliminado", description: "El cargo ha sido eliminado del folio." });
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
      return apiRequest("DELETE", `/api/payments/${paymentId}`, undefined);
    },
    onSuccess: () => {
      refetchPayments();
      toast({ title: "Pago eliminado", description: "El pago ha sido eliminado del registro." });
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
        });
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
  const totalConsumptions = consumptionCharges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
  const totalPayments = payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="datos" data-testid="tab-datos">Datos</TabsTrigger>
            <TabsTrigger value="folio" data-testid="tab-folio">Folio</TabsTrigger>
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
                      <Label className="text-xs text-muted-foreground mb-1 block">Precio unit.</Label>
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
                {consumptionCharges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between p-3 text-sm" data-testid={`charge-row-${charge.id}`}>
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0">{categoryLabels[charge.category]}</Badge>
                      <span className="truncate">{charge.description}</span>
                      <span className="text-muted-foreground text-xs shrink-0">({formatDateAR(charge.date)})</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <span className="font-medium tabular-nums" data-testid={`text-charge-amount-${charge.id}`}>
                        ${parseFloat(charge.amount).toFixed(2)}
                      </span>
                      {!isLocked && (
                        <>
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
                          onClick={() => deleteChargeMutation.mutate(charge.id)}
                          data-testid={`button-delete-charge-${charge.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
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
                            </SelectContent>
                          </Select>
                        </div>
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
                {payments?.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 text-sm" data-testid={`payment-row-${payment.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{paymentMethodLabels[payment.method]}</Badge>
                      {(payment as any).billingTarget === "company" && (
                        <Badge variant="secondary" className="text-xs">Empresa</Badge>
                      )}
                      {payment.reference && <span className="text-muted-foreground">{payment.reference}</span>}
                      <span className="text-muted-foreground text-xs">({formatDateAR(payment.date)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-green-600">${parseFloat(payment.amount).toFixed(2)}</span>
                      {!isLocked && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => deletePaymentMutation.mutate(payment.id)}
                        data-testid={`button-delete-payment-${payment.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                      )}
                    </div>
                  </div>
                ))}
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
        </Tabs>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2 flex-wrap">
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
                        Hab. {r.room?.roomNumber} - {r.guest?.firstName} {r.guest?.lastName}
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
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo anular la reserva.",
        variant: "destructive",
      });
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
  const [dateMode, setDateMode] = useState<"upcoming" | "today" | "range" | "all">("upcoming");
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState("");

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations", dateMode, dateFrom, dateTo],
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/reservations/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Reserva eliminada", description: "La reserva ha sido eliminada del sistema." });
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
    ?.sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));

  const isResLocked = (r: ReservationWithDetails) => {
    const closed = ["checked_out", "cancelled"];
    if (!closed.includes(r.status)) return false;
    const t = getLocalToday();
    const d = r.checkOutDate ? String(r.checkOutDate).slice(0, 10) : r.checkInDate ? String(r.checkInDate).slice(0, 10) : null;
    if (!d) return false;
    return d < t;
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
                        <p className="font-medium">
                          {reservation.guest?.firstName} {reservation.guest?.lastName}
                        </p>
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
                  <TableCell className="font-medium">${reservation.totalRoomAmount || 0}</TableCell>
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
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(reservation.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
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
        reservation={selectedReservation}
        guests={guests || []}
        rooms={rooms || []}
        roomTypes={roomTypes || []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setSelectedReservation(undefined)}
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
