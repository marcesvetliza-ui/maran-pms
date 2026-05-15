import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { toArgentinaDateStr } from "@/lib/utils";
import { formatDateReadable } from "@/lib/planning-utils";
import { CompanySelector, AgencySelector } from "@/components/entity-selector";
import type { Guest, RatePlan, Package, BedType, Company, Agency } from "@shared/schema";

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
  const [showNewGuest, setShowNewGuest] = useState(false);
  const [newGuest, setNewGuest] = useState({ firstName: "", lastName: "", documentNumber: "", phone: "", email: "", vehiculoPatente: "", vehiculoMarca: "", vehiculoModelo: "", vehiculoColor: "" });
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [packageId, setPackageId] = useState("");

  const quickChargePresets = [
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
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [chargePresetLabel, setChargePresetLabel] = useState("");
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeQty, setChargeQty] = useState(1);
  const [chargeCategory, setChargeCategory] = useState("otros");

  const { data: ratePlans } = useQuery<RatePlan[]>({ queryKey: ["/api/rate-plans"] });
  const { data: activePackages } = useQuery<Package[]>({ queryKey: ["/api/packages/active"] });
  const { data: bedTypes } = useQuery<BedType[]>({ queryKey: ["/api/bed-types"] });

  useEffect(() => {
    if (reservationData) {
      const nextDay = new Date(reservationData.checkInDate + "T12:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      setCheckOutDate(toArgentinaDateStr(nextDay));
      setBedConfig(reservationData.bedConfig || "");
    }
  }, [reservationData]);

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
      toast({ title: "Error", description: "No se pudo crear la reserva. Intente nuevamente.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setGuestId(""); setCheckOutDate(""); setNumberOfGuests(1); setBedConfig(""); setBedTypeId(null);
    setRatePlanId(""); setSource("directo"); setManualRate(""); setNotes(""); setGuestSearch("");
    setShowNewGuest(false);
    setNewGuest({ firstName: "", lastName: "", documentNumber: "", phone: "", email: "", vehiculoPatente: "", vehiculoMarca: "", vehiculoModelo: "", vehiculoColor: "" });
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
    let finalGuestId = guestId;
    if (!finalGuestId && showNewGuest) {
      if (!newGuest.firstName.trim()) {
        toast({ title: "Datos incompletos", description: "Ingrese al menos el nombre del huésped.", variant: "destructive" });
        return;
      }
      try {
        const created = await createGuestMutation.mutateAsync({
          firstName: newGuest.firstName.trim(), lastName: newGuest.lastName.trim() || "",
          documentType: newGuest.documentNumber ? "dni" : null, documentNumber: newGuest.documentNumber || null,
          phone: newGuest.phone || null, email: newGuest.email || null, nationality: "Argentina", segment: "LEISURE",
          vehiculoPatente: newGuest.vehiculoPatente || null, vehiculoMarca: newGuest.vehiculoMarca || null,
          vehiculoModelo: newGuest.vehiculoModelo || null, vehiculoColor: newGuest.vehiculoColor || null,
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
    const selectedPackage = activePackages?.find(p => p.id === packageId);
    const getPlanPaxRate = (plan: any, pax: number) => {
      const paxMap: Record<number, string | null | undefined> = { 1: plan.rate1pax, 2: plan.rate2pax, 3: plan.rate3pax, 4: plan.rate4pax };
      return paxMap[pax] || plan.baseRate;
    };
    const planRate = selectedPlan ? getPlanPaxRate(selectedPlan, numberOfGuests) : null;
    const effectiveRate = manualRate || (selectedPackage ? (parseFloat(selectedPackage.basePrice) / (selectedPackage.nights || 1)).toFixed(2) : planRate) || null;
    const packageNote = selectedPackage ? `[Paquete: ${selectedPackage.name}]` : "";
    const finalNotes = [packageNote, notes].filter(Boolean).join(" ") || null;
    try {
      const createdRes = await mutation.mutateAsync({
        guestId: finalGuestId, roomId: reservationData.roomId, roomTypeId: reservationData.roomTypeId,
        checkInDate: reservationData.checkInDate, checkOutDate, numberOfGuests, nights,
        status: "confirmed", source, ratePlanId: ratePlanId || null, companyId: companyId || null,
        agencyId: agencyId || null, bedTypeId: bedTypeId || null, bedTypeNotes: bedConfig || null,
        baseRatePerNight: effectiveRate, finalRatePerNight: effectiveRate,
        totalRoomAmount: effectiveRate ? (parseFloat(effectiveRate) * nights).toFixed(2) : null,
        notes: finalNotes, discountType: selectedPackage?.discountPercent ? "percent" : "none",
        discountValue: selectedPackage?.discountPercent || "0", createdAt: new Date().toISOString(),
      });
      if (pendingCharges.length > 0 && createdRes?.id) {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        for (const charge of pendingCharges) {
          const totalAmt = (parseFloat(charge.amount) * charge.quantity).toFixed(2);
          await apiRequest("POST", "/api/charges", { description: charge.description, amount: totalAmt, category: charge.category, reservationId: createdRes.id, date: todayStr });
        }
      }
    } catch { /* errors handled in mutation.onError */ }
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
      <DialogContent className="w-[95vw] max-w-[520px] max-h-[90vh] overflow-y-auto">
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
                <Button variant="outline" size="sm" className="w-fit" onClick={() => { setShowNewGuest(true); setGuestId(""); }} data-testid="button-new-guest">
                  <Plus className="h-3 w-3 mr-1" /> Nuevo huésped
                </Button>
              </>
            ) : (
              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Nuevo huésped</span>
                  <Button variant="ghost" size="sm" onClick={() => { setShowNewGuest(false); setNewGuest({ firstName: "", lastName: "", documentNumber: "", phone: "", email: "", vehiculoPatente: "", vehiculoMarca: "", vehiculoModelo: "", vehiculoColor: "" }); }} data-testid="button-cancel-new-guest">Cancelar</Button>
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
                <div className="grid grid-cols-4 gap-2">
                  <Input placeholder="Patente" value={newGuest.vehiculoPatente} onChange={(e) => setNewGuest({...newGuest, vehiculoPatente: e.target.value})} data-testid="input-new-guest-vehiculo-patente" />
                  <Input placeholder="Marca" value={newGuest.vehiculoMarca} onChange={(e) => setNewGuest({...newGuest, vehiculoMarca: e.target.value})} data-testid="input-new-guest-vehiculo-marca" />
                  <Input placeholder="Modelo" value={newGuest.vehiculoModelo} onChange={(e) => setNewGuest({...newGuest, vehiculoModelo: e.target.value})} data-testid="input-new-guest-vehiculo-modelo" />
                  <Input placeholder="Color" value={newGuest.vehiculoColor} onChange={(e) => setNewGuest({...newGuest, vehiculoColor: e.target.value})} data-testid="input-new-guest-vehiculo-color" />
                </div>
              </div>
            )}
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
                  {activeBedTypes.map(bt => (
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
              <Select value={ratePlanId} onValueChange={(val) => { setRatePlanId(val); }}>
                <SelectTrigger data-testid="select-rate-plan"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                <SelectContent>
                  {roomRatePlans.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Sin planes para este tipo</div>
                  ) : roomRatePlans.map(rp => {
                    const hasPaxRates = rp.rate2pax || rp.rate3pax || rp.rate4pax;
                    return (
                      <SelectItem key={rp.id} value={rp.id}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{rp.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {rp.currency} {Number(rp.baseRate).toLocaleString("es-AR")}
                            {rp.rate2pax ? ` · 2P: ${Number(rp.rate2pax).toLocaleString("es-AR")}` : ""}
                            {rp.rate3pax ? ` · 3P: ${Number(rp.rate3pax).toLocaleString("es-AR")}` : ""}
                            {rp.rate4pax ? ` · 4P: ${Number(rp.rate4pax).toLocaleString("es-AR")}` : ""}
                            {!hasPaxRates ? " (tarifa fija)" : ""}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
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
                    <span className="font-bold">{plan.currency} {Number(effectivePaxRate).toLocaleString("es-AR")}/noche</span>
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

          {activePackages && activePackages.length > 0 && (
            <div className="grid gap-1">
              <Label>Paquete (opcional)</Label>
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
                <SelectTrigger data-testid="select-package"><SelectValue placeholder="Sin paquete" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin paquete</SelectItem>
                  {activePackages.map(pkg => <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} — ${pkg.basePrice} ({pkg.nights} noche{pkg.nights !== 1 ? "s" : ""})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1">
            <Label>
              Tarifa / noche
              {ratePlanId && <span className="text-xs font-normal text-muted-foreground ml-1">(auto-calculada del plan — editá si necesitás sobrescribir)</span>}
            </Label>
            <Input type="number" min={0} step="0.01" placeholder="Ingresar tarifa manualmente" value={manualRate} onChange={(e) => setManualRate(e.target.value)} data-testid="input-manual-rate" />
          </div>

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
                      <span className="font-medium">${(parseFloat(charge.amount) * charge.quantity).toFixed(2)}</span>
                      <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => setPendingCharges(prev => prev.filter((_, i) => i !== idx))}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-1 text-sm font-semibold bg-muted/30">
                  <span>Total cargos</span>
                  <span>${pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount) * c.quantity, 0).toFixed(2)}</span>
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
          <Button onClick={handleSubmit} disabled={mutation.isPending || createGuestMutation.isPending} data-testid="button-create-quick">
            {mutation.isPending ? "Creando..." : "Crear Reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
