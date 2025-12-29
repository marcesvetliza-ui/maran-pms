import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  CalendarCheck,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ReservationWithDetails, Guest, RoomWithType, RoomType, RatePlan, InsertReservation, ReservationStatus, DiscountType, ReservationSource, Charge } from "@shared/schema";

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const statusConfig: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative: { label: "Tentativa", variant: "outline" },
    pending: { label: "Pendiente", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Check-in", variant: "default" },
    checked_out: { label: "Check-out", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };

  const config = statusConfig[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function ReservationFormDialog({
  reservation,
  guests,
  rooms,
  roomTypes,
  open,
  onOpenChange,
  onSuccess,
}: {
  reservation?: ReservationWithDetails;
  guests: Guest[];
  rooms: RoomWithType[];
  roomTypes: RoomType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!reservation;

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(reservation?.roomTypeId || "");
  
  const [formData, setFormData] = useState<Partial<InsertReservation>>({
    reservationCode: reservation?.reservationCode || "",
    guestId: reservation?.guestId || "",
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
    notes: reservation?.notes || "",
    createdAt: reservation?.createdAt || new Date().toISOString(),
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

  const handleRatePlanChange = (ratePlanId: string) => {
    const plan = ratePlans?.find(p => p.id === ratePlanId);
    if (plan) {
      const nights = calculateNights(formData.checkInDate || today, formData.checkOutDate || tomorrow);
      const totals = calculateTotals(plan.baseRate, formData.discountType as DiscountType, formData.discountValue || "0", nights);
      setFormData({ 
        ...formData, 
        ratePlanId, 
        baseRatePerNight: plan.baseRate,
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
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar la reserva. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const availableRooms = rooms.filter((r) => 
    (r.status === "available" || r.id === reservation?.roomId) && 
    r.roomTypeId === selectedRoomTypeId
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="guest">Huésped</Label>
                <Select
                  value={formData.guestId}
                  onValueChange={(value) => setFormData({ ...formData, guestId: value })}
                >
                  <SelectTrigger data-testid="select-guest">
                    <SelectValue placeholder="Seleccionar huésped" />
                  </SelectTrigger>
                  <SelectContent>
                    {guests.map((guest) => (
                      <SelectItem key={guest.id} value={guest.id}>
                        {guest.firstName} {guest.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="ota">OTA (Booking, etc.)</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                    <SelectItem value="telefono">Teléfono</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  onChange={(e) => setFormData({ ...formData, numberOfGuests: parseInt(e.target.value) })}
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
                    <SelectItem value="checked_in">Check-in</SelectItem>
                    <SelectItem value="checked_out">Check-out</SelectItem>
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
                <Input
                  id="baseRate"
                  type="text"
                  value={formData.baseRatePerNight ? `$${formData.baseRatePerNight}` : "-"}
                  readOnly
                  className="bg-muted"
                  data-testid="input-base-rate"
                />
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
              Cancelar
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

function ReservationDetailDialog({
  reservation,
  open,
  onOpenChange,
  onCancel,
}: {
  reservation: ReservationWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [newCharge, setNewCharge] = useState({
    description: "",
    amount: "",
    category: "otros" as "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment",
  });

  const { data: charges, refetch: refetchCharges } = useQuery<Charge[]>({
    queryKey: ["/api/reservations", reservation.id, "charges"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservation.id}/charges`);
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

  const handleAddCharge = () => {
    if (!newCharge.description || !newCharge.amount) return;
    addChargeMutation.mutate({
      ...newCharge,
      reservationId: reservation.id,
      date: new Date().toISOString().split("T")[0],
    });
  };

  const totalCharges = charges?.reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;
  const grandTotal = parseFloat(reservation.totalRoomAmount || "0") + totalCharges;

  const categoryLabels: Record<string, string> = {
    room: "Habitación",
    restaurant: "Restaurante",
    spa: "Spa",
    minibar: "Minibar",
    otros: "Otros",
    adjustment: "Ajuste",
    payment: "Pago/Anticipo",
  };

  const consumptionCharges = charges?.filter((c) => c.category !== "payment") || [];
  const paymentCharges = charges?.filter((c) => c.category === "payment") || [];
  const totalConsumptions = consumptionCharges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
  const totalPayments = paymentCharges.reduce((sum, c) => sum + Math.abs(parseFloat(c.amount)), 0);
  const subtotalRoom = parseFloat(reservation.totalRoomAmount || "0");
  const totalToPay = subtotalRoom + totalConsumptions;
  const balance = totalToPay - totalPayments;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Reserva {reservation.reservationCode}
            <ReservationStatusBadge status={reservation.status} />
          </DialogTitle>
          <DialogDescription>Detalle de la reservación</DialogDescription>
        </DialogHeader>

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

            {reservation.guest?.direccion && (
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Dirección</p>
                <p className="text-sm">
                  {reservation.guest.direccion}
                  {reservation.guest.localidad && `, ${reservation.guest.localidad}`}
                  {reservation.guest.codigoPostal && ` (${reservation.guest.codigoPostal})`}
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
                <p className="font-semibold text-sm" data-testid="text-checkin">{reservation.checkInDate}</p>
              </div>
              <div className="p-3 border rounded-lg">
                <Calendar className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Check-out</p>
                <p className="font-semibold text-sm" data-testid="text-checkout">{reservation.checkOutDate}</p>
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
                <Button size="sm" variant="outline" onClick={() => setShowAddCharge(!showAddCharge)} data-testid="button-add-charge">
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>

              {showAddCharge && (
                <div className="p-3 border-b bg-muted/30">
                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      placeholder="Descripción"
                      value={newCharge.description}
                      onChange={(e) => setNewCharge({ ...newCharge, description: e.target.value })}
                      className="col-span-2"
                      data-testid="input-charge-description"
                    />
                    <Input
                      type="number"
                      placeholder="Monto"
                      value={newCharge.amount}
                      onChange={(e) => setNewCharge({ ...newCharge, amount: e.target.value })}
                      data-testid="input-charge-amount"
                    />
                    <Select
                      value={newCharge.category}
                      onValueChange={(value) => setNewCharge({ ...newCharge, category: value as typeof newCharge.category })}
                    >
                      <SelectTrigger data-testid="select-charge-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="restaurant">Restaurante</SelectItem>
                        <SelectItem value="spa">Spa</SelectItem>
                        <SelectItem value="minibar">Minibar</SelectItem>
                        <SelectItem value="otros">Otros</SelectItem>
                        <SelectItem value="adjustment">Ajuste</SelectItem>
                        <SelectItem value="payment">Pago/Anticipo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowAddCharge(false)}>
                      Cancelar
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleAddCharge} 
                      disabled={addChargeMutation.isPending}
                      data-testid="button-confirm-charge"
                    >
                      Confirmar
                    </Button>
                  </div>
                </div>
              )}

              <div className="divide-y max-h-[150px] overflow-y-auto">
                {consumptionCharges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between p-3 text-sm" data-testid={`charge-row-${charge.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{categoryLabels[charge.category]}</Badge>
                      <span>{charge.description}</span>
                      <span className="text-muted-foreground text-xs">({charge.date})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">${charge.amount}</span>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => deleteChargeMutation.mutate(charge.id)}
                        data-testid={`button-delete-charge-${charge.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
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
              <div className="p-3 border-b bg-muted/50">
                <h4 className="font-semibold">Pagos / Anticipos</h4>
              </div>
              <div className="divide-y max-h-[100px] overflow-y-auto">
                {paymentCharges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between p-3 text-sm" data-testid={`payment-row-${charge.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{charge.description}</span>
                      <span className="text-muted-foreground text-xs">({charge.date})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-green-600">-${Math.abs(parseFloat(charge.amount)).toFixed(2)}</span>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => deleteChargeMutation.mutate(charge.id)}
                        data-testid={`button-delete-payment-${charge.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {paymentCharges.length === 0 && (
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
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <X className="h-5 w-5" />
            Anular Reserva
          </DialogTitle>
          <DialogDescription>
            Esta acción anulará la reserva y quedará registrada. Por favor indique el motivo.
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
                {reservation.checkInDate} - {reservation.checkOutDate}
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | undefined>();

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations"],
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

  const filteredReservations = reservations?.filter((res) => {
    const guestName = `${res.guest?.firstName} ${res.guest?.lastName}`.toLowerCase();
    const matchesSearch =
      guestName.includes(searchQuery.toLowerCase()) ||
      res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || res.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEditReservation = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setDialogOpen(true);
  };

  const handleViewReservation = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setDetailDialogOpen(true);
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
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="confirmed">Confirmadas</SelectItem>
                <SelectItem value="checked_in">Check-in</SelectItem>
                <SelectItem value="checked_out">Check-out</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

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
                  <TableCell>{reservation.checkInDate}</TableCell>
                  <TableCell>{reservation.checkOutDate}</TableCell>
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
                        <DropdownMenuItem onClick={() => handleEditReservation(reservation)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
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
    </div>
  );
}
