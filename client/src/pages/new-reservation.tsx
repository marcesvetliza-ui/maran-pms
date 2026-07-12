import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  CalendarPlus,
  User,
  Building2,
  DoorOpen,
  Calendar,
  DollarSign,
  Check,
  CheckCircle2,
  AlertCircle,
  Sunrise,
  Sunset,
  ShoppingCart,
  XCircle,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GuestSelector, CompanySelector, AgencySelector } from "@/components/entity-selector";
import type { Guest, Company, Agency, RoomType, RoomWithType, RatePlan, InsertGuest, InsertCompany, InsertAgency } from "@shared/schema";

export default function NewReservationPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const prefilledRoomId = searchParams.get("roomId") || "";
  const prefilledRoomTypeId = searchParams.get("roomTypeId") || "";
  const prefilledDate = searchParams.get("date") || "";
  const isFromPlanning = !!prefilledRoomId;

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(prefilledRoomTypeId);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(prefilledRoomId);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>("");
  const [checkInDate, setCheckInDate] = useState<string>(() => {
    if (prefilledDate) return prefilledDate;
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [checkOutDate, setCheckOutDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [numberOfGuests, setNumberOfGuests] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");
  const [discountType, setDiscountType] = useState<string>("none");
  const [discountValue, setDiscountValue] = useState<string>("0");
  const [bedTypeNotes, setBedTypeNotes] = useState<string>("MAT");
  const [earlyCheckIn, setEarlyCheckIn] = useState(false);
  const [earlyCheckInTime, setEarlyCheckInTime] = useState("");
  const [earlyCheckInCharge, setEarlyCheckInCharge] = useState("");
  const [lateCheckOut, setLateCheckOut] = useState(false);
  const [lateCheckOutTime, setLateCheckOutTime] = useState("");
  const [lateCheckOutCharge, setLateCheckOutCharge] = useState("");

  const bedConfigOptions = [
    { value: "MAT", label: "Matrimonial" },
    { value: "TWIN", label: "Twin (2 individuales)" },
    { value: "MAT_CC", label: "Matrimonial + Cama chica" },
    { value: "TWIN_CC", label: "Twin + Cama chica" },
    { value: "MAT_EXTRA", label: "Matrimonial + Extra" },
    { value: "MAT_CC_EXTRA", label: "Matrimonial + CC + Extra" },
  ];

  const { data: chargeTypesData = [] } = useQuery<{ id: string; label: string; description: string; defaultAmount: string; category: string }[]>({
    queryKey: ["/api/charge-types"],
  });
  const nrChargePresets = [
    ...chargeTypesData.map(ct => ({ label: ct.label, description: ct.description, amount: String(ct.defaultAmount), category: ct.category })),
    { label: "Cargo personalizado", description: "", amount: "", category: "otros" },
  ];
  const [pendingCharges, setPendingCharges] = useState<Array<{ description: string; amount: string; category: string; quantity: number }>>([]);
  const [showNrChargeForm, setShowNrChargeForm] = useState(false);
  const [nrChargePresetLabel, setNrChargePresetLabel] = useState("");
  const [nrChargeDesc, setNrChargeDesc] = useState("");
  const [nrChargeAmount, setNrChargeAmount] = useState("");
  const [nrChargeQty, setNrChargeQty] = useState(1);
  const [nrChargeCategory, setNrChargeCategory] = useState("otros");

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const { data: rooms } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: ratePlans } = useQuery<RatePlan[]>({
    queryKey: ["/api/rate-plans"],
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const handleGuestSelect = (guest: Guest) => {
    setSelectedGuest(guest);
    if (guest.companyId && companies) {
      const company = companies.find(c => c.id === guest.companyId);
      if (company) setSelectedCompany(company);
    }
  };

  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 0;
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [checkInDate, checkOutDate]);

  const availableRooms = rooms?.filter((room) =>
    room.status === "available" &&
    (selectedRoomTypeId ? room.roomTypeId === selectedRoomTypeId : true)
  );

  const applicableRatePlans = ratePlans?.filter((rp) => {
    if (rp.roomTypeId !== selectedRoomTypeId) return false;
    if (rp.validFrom && checkInDate < rp.validFrom) return false;
    if (rp.validTo && checkInDate > rp.validTo) return false;
    return true;
  });

  const selectedRatePlan = ratePlans?.find((rp) => rp.id === selectedRatePlanId);
  
  const baseRate = selectedRatePlan ? parseFloat(selectedRatePlan.baseRate) : 0;
  const finalRate = useMemo(() => {
    if (!baseRate) return 0;
    if (discountType === "percent") {
      return baseRate * (1 - parseFloat(discountValue) / 100);
    } else if (discountType === "fixed") {
      return Math.max(0, baseRate - parseFloat(discountValue));
    }
    return baseRate;
  }, [baseRate, discountType, discountValue]);

  const totalAmount = (finalRate * nights).toFixed(2);

  const createGuestMutation = useMutation({
    mutationFn: async (guest: InsertGuest): Promise<Guest> => {
      const res = await apiRequest("POST", "/api/guests", guest);
      return res.json();
    },
    onSuccess: (newGuest: Guest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      setSelectedGuest(newGuest);
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
      toast({ title: "Agencia creada", description: `${newAgency.razonSocial} ha sido registrada.` });
    },
    onError: () => toast({ title: "Error", description: "No se pudo crear la agencia.", variant: "destructive" }),
  });

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reservations", {
        reservationCode: "",
        guestId: selectedGuest!.id,
        companyId: selectedCompany?.id || null,
        agencyId: selectedAgency?.id || null,
        roomTypeId: selectedRoomTypeId,
        roomId: selectedRoomId,
        ratePlanId: selectedRatePlanId || null,
        checkInDate,
        checkOutDate,
        nights,
        baseRatePerNight: baseRate.toFixed(2),
        discountType,
        discountValue,
        finalRatePerNight: finalRate.toFixed(2),
        totalRoomAmount: totalAmount,
        status: "confirmed",
        source: selectedAgency ? "agencia" : selectedCompany ? "empresa" : "directo",
        numberOfGuests,
        notes: notes || null,
        bedTypeId: null,
        bedTypeNotes: (bedTypeNotes && bedTypeNotes !== "__none__") ? bedTypeNotes : null,
        earlyCheckIn,
        earlyCheckInTime: earlyCheckInTime || null,
        earlyCheckInCharge: earlyCheckInCharge || null,
        lateCheckOut,
        lateCheckOutTime: lateCheckOutTime || null,
        lateCheckOutCharge: lateCheckOutCharge || null,
      });
      const created = await res.json();
      if (pendingCharges.length > 0 && created?.id) {
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
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Reserva creada",
        description: "La reserva ha sido creada exitosamente.",
      });
      setLocation("/reservations");
    },
    onError: (error: any) => {
      const raw = error?.message || "";
      let description = "No se pudo crear la reserva. Intente nuevamente.";
      try {
        const jsonStart = raw.indexOf("{");
        if (jsonStart >= 0) {
          const parsed = JSON.parse(raw.substring(jsonStart));
          description = parsed.error || parsed.message || description;
        }
      } catch {}
      toast({ title: "No se pudo crear la reserva", description, variant: "destructive" });
    },
  });

  const canSubmit = selectedGuest && selectedRoomTypeId && selectedRoomId && selectedRatePlanId && nights > 0 && checkInDate && checkOutDate;

  const sectionCardClass = (isComplete: boolean, isRequired: boolean): string => {
    if (isComplete) return "border-green-500 bg-green-50 dark:bg-green-950/30 dark:border-green-700 transition-colors";
    if (isRequired) return "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600 transition-colors";
    return "transition-colors";
  };

  const SectionStatus = ({ complete, required }: { complete: boolean; required?: boolean }) => {
    if (complete) return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 ml-auto flex-shrink-0" />;
    if (required) return <AlertCircle className="h-4 w-4 text-amber-500 ml-auto flex-shrink-0" />;
    return null;
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-new-reservation-title">
          Nueva Reserva
        </h1>
        <p className="text-muted-foreground">Complete los datos para crear una nueva reserva</p>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CalendarPlus className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Crear Reserva</h3>
            <p className="text-sm text-muted-foreground">
              Complete todos los campos requeridos para registrar la reserva
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <GuestSelector
            selectedGuest={selectedGuest}
            onSelect={handleGuestSelect}
            onCreateNew={(guest) => createGuestMutation.mutate(guest)}
            onClear={() => setSelectedGuest(null)}
            cardClassName={sectionCardClass(!!selectedGuest, true)}
          />

          <CompanySelector
            selectedCompany={selectedCompany}
            onSelect={setSelectedCompany}
            onCreateNew={(company) => createCompanyMutation.mutate(company)}
            onClear={() => setSelectedCompany(null)}
            cardClassName={sectionCardClass(!!selectedCompany, false)}
          />

          <AgencySelector
            selectedAgency={selectedAgency}
            onSelect={setSelectedAgency}
            onCreateNew={(agency) => createAgencyMutation.mutate(agency)}
            onClear={() => setSelectedAgency(null)}
            cardClassName={sectionCardClass(!!selectedAgency, false)}
          />

          <Card className={sectionCardClass(nights > 0, true)}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Fechas y Servicios especiales
                <SectionStatus complete={nights > 0} required />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha de Entrada</Label>
                  <Input
                    type="date"
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    data-testid="input-checkin-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de Salida</Label>
                  <Input
                    type="date"
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    min={checkInDate}
                    data-testid="input-checkout-date"
                  />
                </div>
              </div>
              {nights > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{nights} noche(s)</Badge>
                </div>
              )}
              <div className="border-t pt-3 grid gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sunrise className="h-4 w-4 text-orange-500" />
                    <Label htmlFor="nr-earlyCheckIn" className="cursor-pointer">Early Check-in</Label>
                    <span className="text-xs text-muted-foreground">(Estándar: 12:00 hs)</span>
                  </div>
                  <Switch
                    id="nr-earlyCheckIn"
                    checked={earlyCheckIn}
                    onCheckedChange={(checked) => { setEarlyCheckIn(checked); if (!checked) { setEarlyCheckInTime(""); setEarlyCheckInCharge(""); } }}
                    data-testid="switch-early-checkin"
                  />
                </div>
                {earlyCheckIn && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <div>
                      <Label className="text-xs">Hora acordada</Label>
                      <Input type="time" value={earlyCheckInTime} onChange={(e) => setEarlyCheckInTime(e.target.value)} data-testid="input-early-checkin-time" />
                    </div>
                    <div>
                      <Label className="text-xs">Cargo (vacío = cortesía)</Label>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" value={earlyCheckInCharge} onChange={(e) => setEarlyCheckInCharge(e.target.value)} data-testid="input-early-checkin-charge" />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sunset className="h-4 w-4 text-purple-500" />
                    <Label htmlFor="nr-lateCheckOut" className="cursor-pointer">Late Check-out</Label>
                    <span className="text-xs text-muted-foreground">(Estándar: 11:00 hs)</span>
                  </div>
                  <Switch
                    id="nr-lateCheckOut"
                    checked={lateCheckOut}
                    onCheckedChange={(checked) => { setLateCheckOut(checked); if (!checked) { setLateCheckOutTime(""); setLateCheckOutCharge(""); } }}
                    data-testid="switch-late-checkout"
                  />
                </div>
                {lateCheckOut && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <div>
                      <Label className="text-xs">Hora acordada</Label>
                      <Input type="time" value={lateCheckOutTime} onChange={(e) => setLateCheckOutTime(e.target.value)} data-testid="input-late-checkout-time" />
                    </div>
                    <div>
                      <Label className="text-xs">Cargo (vacío = cortesía)</Label>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" value={lateCheckOutCharge} onChange={(e) => setLateCheckOutCharge(e.target.value)} data-testid="input-late-checkout-charge" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className={sectionCardClass(!!(selectedRoomTypeId && selectedRoomId), true)}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DoorOpen className="h-4 w-4" />
                Habitacion
                <SectionStatus complete={!!(selectedRoomTypeId && selectedRoomId)} required />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Habitacion</Label>
                {isFromPlanning ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm" data-testid="text-room-type-prefilled">
                      {roomTypes?.find(rt => rt.id === selectedRoomTypeId)?.name || selectedRoomTypeId}
                    </div>
                    <Badge variant="secondary" className="text-xs">Desde planning</Badge>
                  </div>
                ) : (
                  <Select
                    value={selectedRoomTypeId}
                    onValueChange={(v) => {
                      setSelectedRoomTypeId(v);
                      setSelectedRoomId("");
                      setSelectedRatePlanId("");
                    }}
                  >
                    <SelectTrigger data-testid="select-room-type">
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {roomTypes?.filter(rt => rt.id).map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>
                          {rt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Habitacion Disponible</Label>
                {isFromPlanning ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm" data-testid="text-room-prefilled">
                      {rooms?.find(r => r.id === selectedRoomId)
                        ? `Hab. ${rooms.find(r => r.id === selectedRoomId)!.roomNumber} - Piso ${rooms.find(r => r.id === selectedRoomId)!.floor}`
                        : selectedRoomId}
                    </div>
                    <Badge variant="secondary" className="text-xs">Desde planning</Badge>
                  </div>
                ) : (
                  <>
                    <Select
                      value={selectedRoomId}
                      onValueChange={setSelectedRoomId}
                      disabled={!selectedRoomTypeId}
                    >
                      <SelectTrigger data-testid="select-room">
                        <SelectValue placeholder={selectedRoomTypeId ? "Seleccionar habitacion..." : "Primero seleccione tipo"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRooms?.slice().sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber)).map((room) => {
                          if (!room.id) return null;
                          return (
                            <SelectItem key={room.id} value={room.id}>
                              Hab. {room.roomNumber} — Piso {room.floor}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {selectedRoomTypeId && availableRooms?.length === 0 && (
                      <p className="text-sm text-destructive">No hay habitaciones disponibles para este tipo</p>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label>Cantidad de Huespedes</Label>
                <Input
                  type="number"
                  min="1"
                  value={numberOfGuests}
                  onChange={(e) => setNumberOfGuests(parseInt(e.target.value) || 1)}
                  data-testid="input-guests"
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de camaje</Label>
                <Select
                  value={bedTypeNotes}
                  onValueChange={setBedTypeNotes}
                >
                  <SelectTrigger data-testid="select-bed-type">
                    <SelectValue placeholder="Seleccionar tipo de camaje..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin especificar</SelectItem>
                    {bedConfigOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className={sectionCardClass(!!selectedRatePlanId, true)}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Tarifa y Descuentos
                <SectionStatus complete={!!selectedRatePlanId} required />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Plan de Tarifa</Label>
                <Select
                  value={selectedRatePlanId}
                  onValueChange={setSelectedRatePlanId}
                  disabled={!selectedRoomTypeId}
                >
                  <SelectTrigger data-testid="select-rate-plan">
                    <SelectValue placeholder={selectedRoomTypeId ? "Seleccionar tarifa..." : "Primero seleccione tipo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {applicableRatePlans?.filter(rp => rp.id).map((rp) => (
                      <SelectItem key={rp.id} value={rp.id}>
                        {rp.name} - ${rp.baseRate}/noche
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Descuento</Label>
                  <Select value={discountType} onValueChange={setDiscountType}>
                    <SelectTrigger data-testid="select-discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin descuento</SelectItem>
                      <SelectItem value="percent">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed">Monto fijo ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {discountType !== "none" && (
                  <div className="space-y-2">
                    <Label>Valor</Label>
                    <Input
                      type="number"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      data-testid="input-discount-value"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Notas adicionales sobre la reserva..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                data-testid="input-notes"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Consumos / Cargos adicionales
                {pendingCharges.length > 0 && (
                  <Badge variant="secondary">{pendingCharges.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingCharges.length === 0 && !showNrChargeForm && (
                <p className="text-sm text-muted-foreground">Sin cargos adicionales agregados.</p>
              )}
              {pendingCharges.length > 0 && (
                <div className="border rounded-md divide-y">
                  {pendingCharges.map((charge, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{charge.description}{charge.quantity > 1 ? ` x${charge.quantity}` : ""}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${(parseFloat(charge.amount) * charge.quantity).toFixed(2)}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => setPendingCharges(prev => prev.filter((_, i) => i !== idx))}>
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
              {showNrChargeForm && (
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <Select value={nrChargePresetLabel} onValueChange={(val) => {
                    setNrChargePresetLabel(val);
                    const preset = nrChargePresets.find(p => p.label === val);
                    if (preset) { setNrChargeDesc(preset.description); setNrChargeAmount(preset.amount); setNrChargeCategory(preset.category); setNrChargeQty(1); }
                  }}>
                    <SelectTrigger data-testid="select-nr-charge-preset"><SelectValue placeholder="Tipo de cargo..." /></SelectTrigger>
                    <SelectContent>
                      {nrChargePresets.filter(p => p.label).map(p => <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-4 gap-1 items-end">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Descripción</Label>
                      <Input value={nrChargeDesc} onChange={(e) => setNrChargeDesc(e.target.value)} placeholder="Descripción" className="h-8 text-sm" data-testid="input-nr-charge-desc" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Precio</Label>
                      <Input type="number" value={nrChargeAmount} onChange={(e) => setNrChargeAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" data-testid="input-nr-charge-amount" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Cant.</Label>
                      <Input type="number" min={1} value={nrChargeQty} onChange={(e) => setNrChargeQty(Math.max(1, parseInt(e.target.value) || 1))} className="h-8 text-sm" data-testid="input-nr-charge-qty" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => { setShowNrChargeForm(false); setNrChargePresetLabel(""); setNrChargeDesc(""); setNrChargeAmount(""); setNrChargeQty(1); }}>Cancelar</Button>
                    <Button type="button" size="sm" onClick={() => {
                      if (!nrChargeDesc || !nrChargeAmount) return;
                      setPendingCharges(prev => [...prev, { description: nrChargeDesc, amount: nrChargeAmount, category: nrChargeCategory, quantity: nrChargeQty }]);
                      setShowNrChargeForm(false); setNrChargePresetLabel(""); setNrChargeDesc(""); setNrChargeAmount(""); setNrChargeQty(1);
                    }} data-testid="button-confirm-nr-charge">Agregar cargo</Button>
                  </div>
                </div>
              )}
              {!showNrChargeForm && (
                <Button type="button" size="sm" variant="outline" onClick={() => setShowNrChargeForm(true)} data-testid="button-toggle-nr-charge">
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar cargo
                </Button>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      </div>

      <Card className="bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumen de Reserva</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Huesped</p>
              <p className="font-medium">
                {selectedGuest ? `${selectedGuest.lastName} ${selectedGuest.firstName}` : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Habitacion</p>
              <p className="font-medium">
                {selectedRoomId ? rooms?.find(r => r.id === selectedRoomId)?.roomNumber : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Noches</p>
              <p className="font-medium">{nights}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="font-medium text-lg">
                ${(parseFloat(totalAmount) + pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount || "0") * c.quantity, 0)).toFixed(2)}
              </p>
              {pendingCharges.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Hab. ${totalAmount} + cargos ${pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount || "0") * c.quantity, 0).toFixed(2)}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLocation("/reservations")} data-testid="button-cancel">
              Volver
            </Button>
            <Button
              onClick={() => createReservationMutation.mutate()}
              disabled={!canSubmit || createReservationMutation.isPending}
              data-testid="button-create-reservation"
            >
              {createReservationMutation.isPending ? (
                "Creando..."
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Crear Reserva
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
