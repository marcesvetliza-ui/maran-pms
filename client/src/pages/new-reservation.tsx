import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CalendarPlus,
  User,
  Building2,
  DoorOpen,
  Calendar,
  DollarSign,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GuestSelector, CompanySelector } from "@/components/entity-selector";
import type { Guest, Company, RoomType, RoomWithType, RatePlan, InsertGuest, InsertCompany } from "@shared/schema";

export default function NewReservationPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>("");
  const [checkInDate, setCheckInDate] = useState<string>(() => {
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

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const { data: rooms } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: ratePlans } = useQuery<RatePlan[]>({
    queryKey: ["/api/rate-plans"],
  });

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

  const applicableRatePlans = ratePlans?.filter((rp) => 
    rp.roomTypeId === selectedRoomTypeId
  );

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

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reservations", {
        reservationCode: "",
        guestId: selectedGuest!.id,
        companyId: selectedCompany?.id || null,
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
        source: selectedCompany ? "empresa" : "directo",
        numberOfGuests,
        notes: notes || null,
      });
      return res.json();
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
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la reserva. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = selectedGuest && selectedRoomTypeId && selectedRoomId && selectedRatePlanId && nights > 0 && checkInDate && checkOutDate;

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
            onSelect={setSelectedGuest}
            onCreateNew={(guest) => createGuestMutation.mutate(guest)}
            onClear={() => setSelectedGuest(null)}
          />

          <CompanySelector
            selectedCompany={selectedCompany}
            onSelect={setSelectedCompany}
            onCreateNew={(company) => createCompanyMutation.mutate(company)}
            onClear={() => setSelectedCompany(null)}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Fechas
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
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DoorOpen className="h-4 w-4" />
                Habitacion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Habitacion</Label>
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
                    {roomTypes?.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.name} - {rt.maxOccupancy} pax
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Habitacion Disponible</Label>
                <Select
                  value={selectedRoomId}
                  onValueChange={setSelectedRoomId}
                  disabled={!selectedRoomTypeId}
                >
                  <SelectTrigger data-testid="select-room">
                    <SelectValue placeholder={selectedRoomTypeId ? "Seleccionar habitacion..." : "Primero seleccione tipo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRooms?.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        Hab. {room.roomNumber} - Piso {room.floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRoomTypeId && availableRooms?.length === 0 && (
                  <p className="text-sm text-destructive">No hay habitaciones disponibles de este tipo</p>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Tarifa y Descuentos
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
                    {applicableRatePlans?.map((rp) => (
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Notas adicionales sobre la reserva..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-notes"
              />
            </CardContent>
          </Card>
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
                {selectedGuest ? `${selectedGuest.firstName} ${selectedGuest.lastName}` : "-"}
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
              <p className="font-medium text-lg">${totalAmount}</p>
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
