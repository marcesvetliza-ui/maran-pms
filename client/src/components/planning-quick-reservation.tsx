import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, ShoppingCart, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { toArgentinaDateStr, fmtMoney, getArgentinaToday } from "@/lib/utils";
import { formatDateReadable } from "@/lib/planning-utils";
import { CompanySelector, AgencySelector } from "@/components/entity-selector";
import type { Guest, RatePlan, Package, BedType, Company, Agency } from "@shared/schema";
import { GuestFormDialog } from "@/pages/guests";

export type QuickReservationData = {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  roomTypeId: string;
  bedConfig: string;
  checkInDate: string;
};

export function QuickReservationDialog({
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
  const [, navigate] = useLocation();
  const [guestId, setGuestId] = useState("");
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [checkOutDate, setCheckOutDate] = useState("");
  const [bedConfig, setBedConfig] = useState("");
  const [bedTypeId, setBedTypeId] = useState<string | null>(null);
  const [ratePlanId, setRatePlanId] = useState("");
  const [source, setSource] = useState<string>("directo");
  const [manualRate, setManualRate] = useState("");
  const [notes, setNotes] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [showGuestCreateDialog, setShowGuestCreateDialog] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [packageId, setPackageId] = useState("");
  const [specialRateReason, setSpecialRateReason] = useState("");

  const { data: chargeTypesData = [] } = useQuery<{ id: string; label: string; description: string; defaultAmount: string; category: string }[]>({
    queryKey: ["/api/charge-types"],
  });
  const quickChargePresets = [
    ...chargeTypesData.map(ct => ({ label: ct.label, description: ct.description, amount: String(ct.defaultAmount), category: ct.category as any })),
    { label: "Cargo personalizado", description: "", amount: "", category: "otros" as const },
  ];
  const [pendingCharges, setPendingCharges] = useState<Array<{ description: string; amount: string; category: string; quantity: number }>>([]);
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [chargePresetLabel, setChargePresetLabel] = useState("");
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeQty, setChargeQty] = useState(1);
  const [chargeCategory, setChargeCategory] = useState("otros");

  const { data: ratePlans } = useQuery<RatePlan[]>({ queryKey: ["/api/rate-plans"] });
  const {
    data: activePackages = [],
    isFetching: isLoadingPackages,
    isError: packagesLoadFailed,
    refetch: refetchPackages,
  } = useQuery<Package[]>({ queryKey: ["/api/packages/active"], enabled: open });
  const { data: bedTypes } = useQuery<BedType[]>({ queryKey: ["/api/bed-types"] });

  useEffect(() => {
    if (reservationData) {
      const nextDay = new Date(reservationData.checkInDate + "T12:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      setCheckOutDate(toArgentinaDateStr(nextDay));
      setBedConfig(reservationData.bedConfig || "");
    }
  }, [reservationData]);

  // The dialog stays mounted while closed, so force a fresh package request on
  // every opening instead of reusing a recently cached empty response.
  useEffect(() => {
    if (open) void refetchPackages();
  }, [open, refetchPackages]);

  useEffect(() => {
    if (!ratePlanId || !ratePlans) return;
    const plan = ratePlans.find(rp => rp.id === ratePlanId);
    if (!plan) return;
    const paxMap: Record<number, string | null | undefined> = {
      1: plan.rate1pax, 2: plan.rate2pax, 3: plan.rate3pax, 4: plan.rate4pax,
    };
    const paxRate = paxMap[numberOfGuests];
    const rate = paxRate || plan.baseRate;
    setManualRate(rate || "");
  }, [ratePlanId, numberOfGuests, ratePlans]);

  const filteredGuests = guestSearch.length > 0
    ? guests.filter(g =>
        `${g.lastName} ${g.firstName} ${g.documentNumber || ""}`.toLowerCase().includes(guestSearch.toLowerCase())
      ).slice(0, 10)
    : guests.slice(0, 10);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/reservations", data);
      return res.json();
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
      toast({ title: "Reserva creada", description: "La reserva ha sido creada exitosamente desde el planning." });
      onOpenChange(false);
      resetForm();
    },
    onError: () => {
      const roomId = reservationData?.roomId;
      const checkIn = reservationData?.checkInDate;
      const params = new URLSearchParams();
      if (roomId) params.set("roomId", roomId);
      if (checkIn) params.set("checkIn", checkIn);
      const href = `/reservations?${params.toString()}`;
      toast({
        title: "Error",
        description: "No se pudo crear la reserva. Intente nuevamente.",
        variant: "destructive",
        action: (
          <ToastAction altText="Ir a Reservas" onClick={() => navigate(href)}>
            Ir a Reservas
          </ToastAction>
        ),
      });
    },
  });

  const resetForm = () => {
    setGuestId(""); setCheckOutDate(""); setNumberOfGuests(1); setBedConfig(""); setBedTypeId(null);
    setRatePlanId(""); setSource("directo"); setManualRate(""); setNotes(""); setGuestSearch("");
    setShowGuestCreateDialog(false);
    setCompanyId(null); setSelectedCompany(null); setAgencyId(null); setSelectedAgency(null); setPackageId("");
    setPendingCharges([]); setShowChargeForm(false); setChargePresetLabel(""); setChargeDesc(""); setChargeAmount(""); setChargeQty(1);
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
    if (ratePlanId === "__special__" && (!manualRate || parseFloat(manualRate) <= 0)) {
      toast({ title: "Tarifa requerida", description: "Ingrese la tarifa por noche para la tarifa especial.", variant: "destructive" });
      return;
    }
    if (ratePlanId === "__special__" && !specialRateReason.trim()) {
      toast({ title: "Motivo requerido", description: "Ingrese el motivo de la tarifa especial.", variant: "destructive" });
      return;
    }
    const finalGuestId = guestId;
    if (!finalGuestId) {
      toast({ title: "Datos incompletos", description: "Seleccione o cree un huésped.", variant: "destructive" });
      return;
    }
    const checkIn = new Date(reservationData.checkInDate + "T12:00:00");
    const checkOut = new Date(checkOutDate + "T12:00:00");
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
    const selectedPlan = ratePlans?.find(rp => rp.id === ratePlanId);
    const selectedPackage = activePackages?.find(p => p.id === packageId);
    const getPlanPaxRate = (plan: any, pax: number) => {
      const paxMap: Record<number, string | null | undefined> = { 1: plan.rate1pax, 2: plan.rate2pax, 3: plan.rate3pax, 4: plan.rate4pax };
      return paxMap[pax] || plan.baseRate;
    };
    const planRate = selectedPlan ? getPlanPaxRate(selectedPlan, numberOfGuests) : null;
    // Normaliza el rate para la API: elimina separadores de miles (puntos) y convierte coma decimal a punto
    const normalizeRate = (r: string) => {
      const clean = r.replace(/\./g, "").replace(",", ".");
      const n = parseFloat(clean);
      return isNaN(n) ? null : n.toFixed(2);
    };
    const packageRate = selectedPackage ? (parseFloat(selectedPackage.basePrice) / (selectedPackage.nights || 1)).toFixed(2) : null;
    const rawEffective = manualRate || packageRate || planRate || null;
    const effectiveRate = rawEffective ? normalizeRate(rawEffective) : null;
    const packageNote = selectedPackage ? `[Paquete: ${selectedPackage.name}]` : "";
    const finalNotes = [packageNote, notes].filter(Boolean).join(" ") || null;
    try {
      const createdRes = await mutation.mutateAsync({
        guestId: finalGuestId, roomId: reservationData.roomId, roomTypeId: reservationData.roomTypeId,
        checkInDate: reservationData.checkInDate, checkOutDate, numberOfGuests, nights,
        status: "confirmed", source, ratePlanId: ratePlanId === "__special__" ? null : (ratePlanId || null), specialRateReason: ratePlanId === "__special__" ? specialRateReason : null, companyId: companyId || null,
        agencyId: agencyId || null, bedTypeId: bedTypeId || null, bedTypeNotes: bedConfig || null,
        baseRatePerNight: effectiveRate, finalRatePerNight: effectiveRate,
        totalRoomAmount: effectiveRate ? (parseFloat(effectiveRate) * nights).toFixed(2) : null,
        notes: finalNotes, discountType: selectedPackage?.discountPercent ? "percent" : "none",
        discountValue: selectedPackage?.discountPercent || "0", createdAt: new Date().toISOString(),
      });
      if (pendingCharges.length > 0 && createdRes?.id) {
        const todayStr = getArgentinaToday();
        try {
          for (const charge of pendingCharges) {
            const totalAmt = (parseFloat(charge.amount) * charge.quantity).toFixed(2);
            await apiRequest("POST", "/api/charges", { description: charge.description, amount: totalAmt, category: charge.category, reservationId: createdRes.id, date: todayStr });
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
    } catch { /* reservation creation errors handled in mutation.onError */ }
  };

  if (!reservationData) return null;

  const activeBedTypes = bedTypes?.filter(bt => bt.isActive).sort((a, b) => a.displayOrder - b.displayOrder) || [];
  const sourceOptions = [
    { value: "directo", label: "Directo" }, { value: "telefono", label: "Teléfono" },
    { value: "web", label: "Web" }, { value: "booking", label: "Booking" },
    { value: "expedia", label: "Expedia" }, { value: "airbnb", label: "Airbnb" },
    { value: "despegar", label: "Despegar" }, { value: "empresa", label: "Empresa" },
    { value: "agencia", label: "Agencia de Viajes" },
  ];
  const roomRatePlans = ratePlans?.filter(rp => rp.roomTypeId === reservationData.roomTypeId) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle data-testid="title-quick-reservation">Nueva Reserva Rápida</DialogTitle>
          <DialogDescription>
            Hab. {reservationData.roomNumber} ({reservationData.roomTypeName}) — Check-in: {formatDateReadable(reservationData.checkInDate)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label>Huésped *</Label>
              <>
                <Input placeholder="Buscar huésped por nombre o DNI..." value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} data-testid="input-guest-search" />
                {(guestSearch.length > 0 || guests.length > 0) && (
                  <div className="border rounded-md max-h-32 overflow-y-auto">
                    {filteredGuests.map((guest) => (
                      <div key={guest.id} className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent ${guestId === guest.id ? "bg-accent font-medium" : ""}`}
                        onClick={() => { setGuestId(guest.id); setGuestSearch(`${guest.lastName} ${guest.firstName}`); }}
                        data-testid={`guest-option-${guest.id}`}>
                        {guest.lastName} {guest.firstName} {guest.documentNumber ? `— ${guest.documentNumber}` : ""}
                      </div>
                    ))}
                    {filteredGuests.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No se encontraron huéspedes</div>}
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-fit" onClick={() => { setShowGuestCreateDialog(true); setGuestId(""); }} data-testid="button-new-guest">
                  <Plus className="h-3 w-3 mr-1" /> Nuevo huésped
                </Button>
              </>
            <GuestFormDialog
              open={showGuestCreateDialog}
              onOpenChange={setShowGuestCreateDialog}
              onSuccess={(guestId, fullName) => {
                if (guestId) {
                  setGuestId(guestId);
                  setGuestSearch(fullName || "Huésped creado");
                }
                setShowGuestCreateDialog(false);
              }}
            />
          </div>

          <CompanySelector selectedCompany={selectedCompany}
            onSelect={(company) => { setSelectedCompany(company); setCompanyId(company.id); }}
            onCreateNew={async (data) => {
              try { const res = await apiRequest("POST", "/api/companies", data); const created = await res.json(); setSelectedCompany(created); setCompanyId(created.id); }
              catch { toast({ title: "Error", description: "No se pudo crear la empresa.", variant: "destructive" }); }
            }}
            onClear={() => { setSelectedCompany(null); setCompanyId(null); }} />

          <AgencySelector selectedAgency={selectedAgency}
            onSelect={(agency) => { setSelectedAgency(agency); setAgencyId(agency.id); }}
            onCreateNew={async (data) => {
              try { const res = await apiRequest("POST", "/api/agencies", data); const created = await res.json(); setSelectedAgency(created); setAgencyId(created.id); }
              catch { toast({ title: "Error", description: "No se pudo crear la agencia.", variant: "destructive" }); }
            }}
            onClear={() => { setSelectedAgency(null); setAgencyId(null); }} />

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
              <Select value={bedTypeId || "none"} onValueChange={(val) => { if (val === "none") { setBedTypeId(null); setBedConfig(""); } else { setBedTypeId(val); const bt = activeBedTypes.find(b => b.id === val); setBedConfig(bt?.name || ""); } }}>
                <SelectTrigger data-testid="select-bed-config"><SelectValue placeholder="Sin preferencia" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin preferencia</SelectItem>
                  {activeBedTypes.filter(bt => bt.id).map(bt => (
                    <SelectItem key={bt.id} value={bt.id}>
                      <div className="flex flex-col gap-0"><span>{bt.name}</span>{bt.description && <span className="text-xs text-muted-foreground">{bt.description}</span>}</div>
                    </SelectItem>
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
              <Select value={ratePlanId} onValueChange={(val) => { setRatePlanId(val); if (val !== "__special__") setSpecialRateReason(""); }}>
                <SelectTrigger data-testid="select-rate-plan"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                <SelectContent>
                  {roomRatePlans.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Sin planes para este tipo</div>
                  ) : roomRatePlans.filter(rp => rp.id).map(rp => {
                    const hasPaxRates = rp.rate2pax || rp.rate3pax || rp.rate4pax;
                    return (
                      <SelectItem key={rp.id} value={rp.id}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{rp.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ${fmtMoney(rp.baseRate)}
                            {rp.rate2pax ? ` · 2P: $${fmtMoney(rp.rate2pax)}` : ""}
                            {rp.rate3pax ? ` · 3P: $${fmtMoney(rp.rate3pax)}` : ""}
                            {rp.rate4pax ? ` · 4P: $${fmtMoney(rp.rate4pax)}` : ""}
                            {!hasPaxRates ? " (tarifa fija)" : ""}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                  <SelectItem value="__special__">⭐ Tarifa Especial (manual)</SelectItem>
                </SelectContent>
              </Select>
              {ratePlanId && (() => {
                const plan = roomRatePlans.find(rp => rp.id === ratePlanId);
                if (!plan) return null;
                const paxMap: Record<number, string | null | undefined> = { 1: plan.rate1pax, 2: plan.rate2pax, 3: plan.rate3pax, 4: plan.rate4pax };
                const paxRate = paxMap[numberOfGuests];
                const effectivePaxRate = paxRate || plan.baseRate;
                const isPaxSpecific = !!paxRate;
                return (
                  <div className="flex items-center gap-1.5 mt-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/40 rounded text-xs text-blue-700 dark:text-blue-300">
                    <span>Tarifa para {numberOfGuests} huésped{numberOfGuests > 1 ? "es" : ""}:</span>
                    <span className="font-bold">${fmtMoney(effectivePaxRate)}/noche</span>
                    {isPaxSpecific && <span className="text-blue-500">(tarifa {numberOfGuests}P)</span>}
                  </div>
                );
              })()}
            </div>
            <div className="grid gap-1">
              <Label>Canal</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger data-testid="select-source"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{sourceOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <Label>Paquete (opcional)</Label>
              {(isLoadingPackages || packagesLoadFailed) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void refetchPackages()}
                  disabled={isLoadingPackages}
                >
                  {isLoadingPackages ? "Actualizando..." : "Reintentar"}
                </Button>
              )}
            </div>
            <Select value={packageId} onValueChange={(val) => {
                if (val === "__none__") { setPackageId(""); setRatePlanId(""); setManualRate(""); return; }
                setPackageId(val); setRatePlanId("");
                const pkg = activePackages.find(p => p.id === val);
                if (pkg) {
                  const ratePerNight = (parseFloat(pkg.basePrice) / (pkg.nights || 1)).toFixed(2);
                  setManualRate(ratePerNight);
                  if (pkg.nights && reservationData) {
                    const nextDay = new Date(reservationData.checkInDate + "T12:00:00");
                    nextDay.setDate(nextDay.getDate() + pkg.nights);
                    setCheckOutDate(toArgentinaDateStr(nextDay));
                  }
                }
            }}>
              <SelectTrigger data-testid="select-package"><SelectValue placeholder={isLoadingPackages ? "Cargando paquetes..." : "Sin paquete"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin paquete</SelectItem>
                {activePackages.filter(pkg => pkg.id).map(pkg => <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} — ${pkg.basePrice} ({pkg.nights} noche{pkg.nights !== 1 ? "s" : ""})</SelectItem>)}
              </SelectContent>
            </Select>
            {!isLoadingPackages && packagesLoadFailed && (
              <p className="text-xs text-destructive">No se pudieron cargar los paquetes. Reintentá la consulta.</p>
            )}
            {!isLoadingPackages && !packagesLoadFailed && activePackages.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay paquetes vigentes para la fecha actual.</p>
            )}
          </div>

          <div className="grid gap-1">
            <Label>
              Tarifa / noche
              {ratePlanId && ratePlanId !== "__special__" && <span className="text-xs font-normal text-muted-foreground ml-1">(auto-calculada del plan — editá si necesitás sobrescribir)</span>}
              {ratePlanId === "__special__" && <span className="text-xs font-normal text-destructive ml-1">* obligatorio</span>}
            </Label>
            <Input type="number" min={0} step="0.01" placeholder="Ingresar tarifa manualmente" value={manualRate} onChange={(e) => setManualRate(e.target.value)} data-testid="input-manual-rate" />
          </div>
          {ratePlanId === "__special__" && (
            <div className="grid gap-1 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-700">
              <Label>Motivo de tarifa especial <span className="text-destructive">*</span> <span className="font-normal text-muted-foreground text-xs">(aparece en informe diario y caja)</span></Label>
              <Textarea placeholder="Ej: Convenio verbal, cliente frecuente, cortesía gerencia..." value={specialRateReason} onChange={(e) => setSpecialRateReason(e.target.value)} rows={2} data-testid="input-special-rate-reason" />
            </div>
          )}

          <div className="border rounded-lg">
            <div className="flex items-center justify-between p-2 border-b bg-muted/40">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Consumos / Cargos adicionales</span>
                {pendingCharges.length > 0 && <Badge variant="secondary" className="text-xs">{pendingCharges.length}</Badge>}
              </div>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setShowChargeForm(!showChargeForm)} data-testid="button-toggle-quick-charge">
                <Plus className="h-3 w-3 mr-1" />Agregar
              </Button>
            </div>
            {showChargeForm && (
              <div className="p-2 border-b bg-muted/20 space-y-2">
                <Select value={chargePresetLabel} onValueChange={(val) => {
                  setChargePresetLabel(val);
                  const preset = quickChargePresets.find(p => p.label === val);
                  if (preset) { setChargeDesc(preset.description); setChargeAmount(preset.amount); setChargeCategory(preset.category); setChargeQty(1); }
                }}>
                  <SelectTrigger data-testid="select-quick-charge-preset"><SelectValue placeholder="Tipo de cargo..." /></SelectTrigger>
                  <SelectContent>{quickChargePresets.map(p => <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-4 gap-1 items-end">
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Descripción</Label>
                    <Input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} placeholder="Descripción" className="h-8 text-sm" data-testid="input-quick-charge-desc" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Precio</Label>
                    <Input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" data-testid="input-quick-charge-amount" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Cant.</Label>
                    <Input type="number" min={1} value={chargeQty} onChange={(e) => setChargeQty(Math.max(1, parseInt(e.target.value) || 1))} className="h-8 text-sm" data-testid="input-quick-charge-qty" />
                  </div>
                </div>
                <div className="flex justify-end gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowChargeForm(false); setChargePresetLabel(""); setChargeDesc(""); setChargeAmount(""); setChargeQty(1); }}>Cancelar</Button>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={() => {
                    if (!chargeDesc || !chargeAmount) return;
                    setPendingCharges(prev => [...prev, { description: chargeDesc, amount: chargeAmount, category: chargeCategory, quantity: chargeQty }]);
                    setShowChargeForm(false); setChargePresetLabel(""); setChargeDesc(""); setChargeAmount(""); setChargeQty(1);
                  }} data-testid="button-confirm-quick-charge">Agregar cargo</Button>
                </div>
              </div>
            )}
            {pendingCharges.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 text-center">Sin cargos adicionales</p>
            ) : (
              <div className="divide-y">
                {pendingCharges.map((charge, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-1 text-sm">
                    <span>{charge.description}{charge.quantity > 1 ? ` x${charge.quantity}` : ""}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">${fmtMoney(parseFloat(charge.amount) * charge.quantity)}</span>
                      <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => setPendingCharges(prev => prev.filter((_, i) => i !== idx))}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-1 text-sm font-semibold bg-muted/30">
                  <span>Total cargos</span>
                  <span>${fmtMoney(pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount) * c.quantity, 0))}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-1">
            <Label>Observaciones</Label>
            <Textarea placeholder="Notas o pedidos especiales..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-notes-quick" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }} data-testid="button-cancel-quick">Volver</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="button-create-quick">
            {mutation.isPending ? "Creando..." : "Crear Reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
