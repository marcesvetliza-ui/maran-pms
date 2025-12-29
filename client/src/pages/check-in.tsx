import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LogIn,
  Search,
  Calendar,
  User,
  DoorOpen,
  Check,
  Clock,
  Plus,
  UserPlus,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GuestSelector, CompanySelector } from "@/components/entity-selector";
import type { ReservationWithDetails, Guest, Company, RoomType, RoomWithType, RatePlan, InsertGuest, InsertCompany } from "@shared/schema";

export default function CheckInPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"reservations" | "walkin" | "directo" | "history">("reservations");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [directoConfirmDialogOpen, setDirectoConfirmDialogOpen] = useState(false);

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>("");
  const [nights, setNights] = useState<number>(1);
  const [numberOfGuests, setNumberOfGuests] = useState<number>(1);
  
  const [historyDate, setHistoryDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations/check-in"],
  });

  const { data: checkInsByDate, isLoading: isLoadingHistory } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations/check-ins-by-date", historyDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reservations/check-ins-by-date?date=${historyDate}`, undefined);
      return res.json();
    },
    enabled: activeTab === "history",
  });

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const { data: rooms } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: ratePlans } = useQuery<RatePlan[]>({
    queryKey: ["/api/rate-plans"],
  });

  const availableRooms = rooms?.filter((room) => 
    room.status === "available" && 
    (selectedRoomTypeId ? room.roomTypeId === selectedRoomTypeId : true)
  );

  const applicableRatePlans = ratePlans?.filter((rp) => 
    rp.roomTypeId === selectedRoomTypeId
  );

  const selectedRatePlan = ratePlans?.find((rp) => rp.id === selectedRatePlanId);
  const totalAmount = selectedRatePlan ? (parseFloat(selectedRatePlan.baseRate) * nights).toFixed(2) : "0.00";

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/reservations/${id}/check-in`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-ins-by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Check-in realizado",
        description: `El huesped ${selectedReservation?.guest?.firstName} ${selectedReservation?.guest?.lastName} ha sido registrado exitosamente.`,
      });
      setConfirmDialogOpen(false);
      setSelectedReservation(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo realizar el check-in. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

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

  const walkInMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const checkOutDate = new Date(Date.now() + nights * 86400000).toISOString().split("T")[0];
      
      const res = await apiRequest("POST", "/api/reservations", {
        reservationCode: "", 
        guestId: selectedGuest!.id,
        companyId: selectedCompany?.id || null,
        roomTypeId: selectedRoomTypeId,
        roomId: selectedRoomId,
        ratePlanId: selectedRatePlanId || null,
        checkInDate: today,
        checkOutDate,
        nights,
        baseRatePerNight: selectedRatePlan?.baseRate || "0",
        discountType: "none",
        discountValue: "0",
        finalRatePerNight: selectedRatePlan?.baseRate || "0",
        totalRoomAmount: totalAmount,
        status: "confirmed",
        source: selectedCompany ? "empresa" : "directo",
        numberOfGuests,
        notes: "Walk-in",
      });
      const reservation = await res.json();

      await apiRequest("POST", `/api/reservations/${reservation.id}/check-in`, undefined);
      return reservation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-ins-by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Walk-in exitoso",
        description: `${selectedGuest?.firstName} ${selectedGuest?.lastName} ha sido registrado en la habitacion.`,
      });
      resetWalkInForm();
      setActiveTab("reservations");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo completar el walk-in. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const directoMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const checkOutDate = new Date(Date.now() + nights * 86400000).toISOString().split("T")[0];
      
      const res = await apiRequest("POST", "/api/reservations", {
        reservationCode: "", 
        guestId: selectedGuest!.id,
        companyId: selectedCompany?.id || null,
        roomTypeId: selectedRoomTypeId,
        roomId: selectedRoomId,
        ratePlanId: selectedRatePlanId || null,
        checkInDate: today,
        checkOutDate,
        nights,
        baseRatePerNight: selectedRatePlan?.baseRate || "0",
        discountType: "none",
        discountValue: "0",
        finalRatePerNight: selectedRatePlan?.baseRate || "0",
        totalRoomAmount: totalAmount,
        status: "confirmed",
        source: selectedCompany ? "empresa" : "directo",
        numberOfGuests,
        notes: "Check-in Directo",
      });
      const reservation = await res.json();

      await apiRequest("POST", `/api/reservations/${reservation.id}/check-in`, undefined);
      return reservation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-ins-by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Check-in Directo exitoso",
        description: `${selectedGuest?.firstName} ${selectedGuest?.lastName} ha sido registrado en la habitacion.`,
      });
      resetWalkInForm();
      setDirectoConfirmDialogOpen(false);
      setActiveTab("reservations");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo completar el check-in directo. Intente nuevamente.",
        variant: "destructive",
      });
      setDirectoConfirmDialogOpen(false);
    },
  });

  const resetWalkInForm = () => {
    setSelectedGuest(null);
    setSelectedCompany(null);
    setSelectedRoomTypeId("");
    setSelectedRoomId("");
    setSelectedRatePlanId("");
    setNights(1);
    setNumberOfGuests(1);
  };

  const handleDirectoCheckIn = () => {
    setDirectoConfirmDialogOpen(true);
  };

  const confirmDirectoCheckIn = () => {
    directoMutation.mutate();
  };

  const filteredReservations = reservations?.filter((res) => {
    const guestName = `${res.guest?.firstName} ${res.guest?.lastName}`.toLowerCase();
    return (
      guestName.includes(searchQuery.toLowerCase()) ||
      res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleCheckIn = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setConfirmDialogOpen(true);
  };

  const canSubmitWalkIn = selectedGuest && selectedRoomTypeId && selectedRoomId && nights > 0;

  const today = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-checkin-title">
          Check-in
        </h1>
        <p className="text-muted-foreground capitalize">{today}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "reservations" | "walkin" | "directo" | "history")}>
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="reservations" data-testid="tab-reservations">
            <LogIn className="h-4 w-4 mr-2" />
            Reservas
          </TabsTrigger>
          <TabsTrigger value="walkin" data-testid="tab-walkin">
            <UserPlus className="h-4 w-4 mr-2" />
            Walk-in
          </TabsTrigger>
          <TabsTrigger value="directo" data-testid="tab-directo">
            <Check className="h-4 w-4 mr-2" />
            Check-in Directo
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <CalendarDays className="h-4 w-4 mr-2" />
            Check-ins del Dia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reservations" className="space-y-6 mt-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <LogIn className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Registro de Llegadas</h3>
                <p className="text-sm text-muted-foreground">
                  Reservas confirmadas listas para check-in
                </p>
              </div>
              <Badge className="ml-auto" variant="secondary">
                {reservations?.length || 0} pendientes
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre de huesped o numero de habitacion..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-checkin"
                />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredReservations && filteredReservations.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredReservations.map((reservation) => (
                <Card
                  key={reservation.id}
                  className="hover-elevate"
                  data-testid={`checkin-card-${reservation.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                          {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {reservation.guest?.firstName} {reservation.guest?.lastName}
                          </CardTitle>
                          <CardDescription>{reservation.guest?.email}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary">Confirmada</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <DoorOpen className="h-4 w-4 text-muted-foreground" />
                        <span>Hab. {reservation.room?.roomNumber}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{reservation.numberOfGuests} huesped(es)</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{reservation.checkInDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{reservation.checkOutDate}</span>
                      </div>
                    </div>
                    <div className="pt-2">
                      <Button
                        className="w-full"
                        onClick={() => handleCheckIn(reservation)}
                        data-testid={`button-checkin-${reservation.id}`}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Realizar Check-in
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <LogIn className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay check-ins pendientes</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? "No se encontraron reservas con los criterios de busqueda."
                    : "Todas las reservas confirmadas ya han realizado check-in."}
                </p>
                <Button variant="outline" onClick={() => setActiveTab("walkin")} data-testid="button-goto-walkin">
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar Walk-in
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="walkin" className="space-y-6 mt-6">
          <Card className="bg-accent/30 border-accent">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold">Walk-in (Sin Reserva)</h3>
                <p className="text-sm text-muted-foreground">
                  Registrar un huesped que llega sin reserva previa
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

                  {selectedRoomTypeId && (
                    <div className="space-y-2">
                      <Label>Habitacion Disponible</Label>
                      <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                        <SelectTrigger data-testid="select-room">
                          <SelectValue placeholder="Seleccionar habitacion..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRooms?.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              Hab. {room.roomNumber} - Piso {room.floor}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {availableRooms?.length === 0 && (
                        <p className="text-sm text-destructive">
                          No hay habitaciones disponibles de este tipo
                        </p>
                      )}
                    </div>
                  )}

                  {selectedRoomTypeId && applicableRatePlans && applicableRatePlans.length > 0 && (
                    <div className="space-y-2">
                      <Label>Plan de Tarifa</Label>
                      <Select value={selectedRatePlanId} onValueChange={setSelectedRatePlanId}>
                        <SelectTrigger data-testid="select-rate-plan">
                          <SelectValue placeholder="Seleccionar tarifa..." />
                        </SelectTrigger>
                        <SelectContent>
                          {applicableRatePlans.map((rp) => (
                            <SelectItem key={rp.id} value={rp.id}>
                              {rp.name} - ${rp.baseRate}/noche
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nights">Noches</Label>
                      <Input
                        id="nights"
                        type="number"
                        min={1}
                        value={nights}
                        onChange={(e) => setNights(parseInt(e.target.value) || 1)}
                        data-testid="input-nights"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="numGuests">Huespedes</Label>
                      <Input
                        id="numGuests"
                        type="number"
                        min={1}
                        value={numberOfGuests}
                        onChange={(e) => setNumberOfGuests(parseInt(e.target.value) || 1)}
                        data-testid="input-num-guests"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Huesped:</span>
                    <span className="font-medium">
                      {selectedGuest ? `${selectedGuest.firstName} ${selectedGuest.lastName}` : "-"}
                    </span>
                  </div>
                  {selectedCompany && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Empresa:</span>
                      <span className="font-medium">{selectedCompany.nombreFantasia || selectedCompany.razonSocial}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Habitacion:</span>
                    <span className="font-medium">
                      {selectedRoomId ? rooms?.find((r) => r.id === selectedRoomId)?.roomNumber : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Noches:</span>
                    <span className="font-medium">{nights}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tarifa:</span>
                    <span className="font-medium">
                      {selectedRatePlan ? `$${selectedRatePlan.baseRate}/noche` : "-"}
                    </span>
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold text-lg">${totalAmount}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full mt-4"
                    onClick={() => walkInMutation.mutate()}
                    disabled={!canSubmitWalkIn || walkInMutation.isPending}
                    data-testid="button-complete-walkin"
                  >
                    {walkInMutation.isPending ? (
                      "Procesando..."
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Completar Walk-in
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-6 mt-6">
          <Card className="bg-accent/30 border-accent">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Check-ins por Fecha</h3>
                <p className="text-sm text-muted-foreground">
                  Ver huespedes que hicieron check-in en una fecha especifica
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Fecha:</Label>
                <Input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  className="w-auto"
                  data-testid="input-history-date"
                />
              </div>
            </CardContent>
          </Card>

          {isLoadingHistory ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : checkInsByDate && checkInsByDate.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {checkInsByDate.length} check-in(s) registrado(s)
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {checkInsByDate.map((reservation) => (
                  <Card key={reservation.id} data-testid={`history-card-${reservation.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-600 font-semibold">
                            {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
                          </div>
                          <div>
                            <CardTitle className="text-lg">
                              {reservation.guest?.firstName} {reservation.guest?.lastName}
                            </CardTitle>
                            <CardDescription>{reservation.reservationCode}</CardDescription>
                          </div>
                        </div>
                        <Badge variant="default" className="bg-green-500">Check-in</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <DoorOpen className="h-4 w-4 text-muted-foreground" />
                          <span>Hab. {reservation.room?.roomNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{reservation.numberOfGuests} huesped(es)</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Entrada: {reservation.checkInDate}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>Salida: {reservation.checkOutDate}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarDays className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay check-ins para esta fecha</h3>
                <p className="text-muted-foreground">
                  No se encontraron registros de check-in para el {new Date(historyDate + "T12:00:00").toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                  })}.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="directo" className="space-y-6 mt-6">
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Check-in Directo</h3>
                <p className="text-sm text-muted-foreground">
                  Registrar huesped e inmediatamente hacer check-in sin crear reserva previa
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
                      <SelectTrigger data-testid="select-room-type-directo">
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

                  {selectedRoomTypeId && (
                    <div className="space-y-2">
                      <Label>Habitacion Disponible</Label>
                      <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                        <SelectTrigger data-testid="select-room-directo">
                          <SelectValue placeholder="Seleccionar habitacion..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRooms?.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              Hab. {room.roomNumber} - Piso {room.floor}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {availableRooms?.length === 0 && (
                        <p className="text-sm text-destructive">
                          No hay habitaciones disponibles de este tipo
                        </p>
                      )}
                    </div>
                  )}

                  {selectedRoomTypeId && applicableRatePlans && applicableRatePlans.length > 0 && (
                    <div className="space-y-2">
                      <Label>Plan de Tarifa</Label>
                      <Select value={selectedRatePlanId} onValueChange={setSelectedRatePlanId}>
                        <SelectTrigger data-testid="select-rate-plan-directo">
                          <SelectValue placeholder="Seleccionar tarifa..." />
                        </SelectTrigger>
                        <SelectContent>
                          {applicableRatePlans.map((rp) => (
                            <SelectItem key={rp.id} value={rp.id}>
                              {rp.name} - ${rp.baseRate}/noche
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nights-directo">Noches</Label>
                      <Input
                        id="nights-directo"
                        type="number"
                        min={1}
                        value={nights}
                        onChange={(e) => setNights(parseInt(e.target.value) || 1)}
                        data-testid="input-nights-directo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="numGuests-directo">Huespedes</Label>
                      <Input
                        id="numGuests-directo"
                        type="number"
                        min={1}
                        value={numberOfGuests}
                        onChange={(e) => setNumberOfGuests(parseInt(e.target.value) || 1)}
                        data-testid="input-num-guests-directo"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Huesped:</span>
                    <span className="font-medium">
                      {selectedGuest ? `${selectedGuest.firstName} ${selectedGuest.lastName}` : "-"}
                    </span>
                  </div>
                  {selectedCompany && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Empresa:</span>
                      <span className="font-medium">{selectedCompany.nombreFantasia || selectedCompany.razonSocial}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Habitacion:</span>
                    <span className="font-medium">
                      {selectedRoomId ? rooms?.find((r) => r.id === selectedRoomId)?.roomNumber : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Noches:</span>
                    <span className="font-medium">{nights}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tarifa:</span>
                    <span className="font-medium">
                      {selectedRatePlan ? `$${selectedRatePlan.baseRate}/noche` : "-"}
                    </span>
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold text-lg">${totalAmount}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full mt-4 bg-green-600 hover:bg-green-700"
                    onClick={handleDirectoCheckIn}
                    disabled={!canSubmitWalkIn || directoMutation.isPending}
                    data-testid="button-complete-directo"
                  >
                    {directoMutation.isPending ? (
                      "Procesando..."
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Check-in Directo
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Check-in</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedReservation && (
                <>
                  Vas a registrar la llegada de{" "}
                  <strong>
                    {selectedReservation.guest?.firstName} {selectedReservation.guest?.lastName}
                  </strong>{" "}
                  a la habitacion <strong>{selectedReservation.room?.roomNumber}</strong>.
                  <br /><br />
                  Esto marcara la habitacion como ocupada.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-checkin">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedReservation && checkInMutation.mutate(selectedReservation.id)}
              disabled={checkInMutation.isPending}
              data-testid="button-confirm-checkin"
            >
              {checkInMutation.isPending ? "Procesando..." : "Confirmar Check-in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={directoConfirmDialogOpen} onOpenChange={setDirectoConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Check-in Directo</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedGuest && selectedRoomId && (
                <>
                  Esta seguro de hacer check-in directo?
                  <br /><br />
                  Se registrara la llegada de{" "}
                  <strong>
                    {selectedGuest.firstName} {selectedGuest.lastName}
                  </strong>{" "}
                  a la habitacion <strong>{rooms?.find((r) => r.id === selectedRoomId)?.roomNumber}</strong> por <strong>{nights}</strong> noche(s).
                  <br /><br />
                  Esto creara una reserva y marcara la habitacion como ocupada inmediatamente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-directo">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDirectoCheckIn}
              disabled={directoMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-directo"
            >
              {directoMutation.isPending ? "Procesando..." : "Confirmar Check-in Directo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
