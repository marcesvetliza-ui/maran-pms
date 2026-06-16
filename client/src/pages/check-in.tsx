import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getLocalToday, formatDateAR } from "@/lib/utils";
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
  Smartphone,
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Send,
  FileText,
  Image,
  AlertCircle,
  Heart,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GuestSelector, CompanySelector } from "@/components/entity-selector";
import type { ReservationWithDetails, Guest, Company, RoomType, RoomWithType, RatePlan, InsertGuest, InsertCompany, WebCheckin, GuestPreference } from "@shared/schema";

interface WebCheckinListItem extends WebCheckin {
  reservation?: {
    reservationCode: string;
    guestName: string;
    roomNumber: string;
    checkInDate: string;
    checkOutDate: string;
    status: string;
  } | null;
}

export default function CheckInPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"reservations" | "walkin" | "webcheckin" | "history">("reservations");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [retroactivoDialog, setRetroactivoDialog] = useState(false);
  const [retroactivoMotivo, setRetroactivoMotivo] = useState("");
  const [pendingCheckInId, setPendingCheckInId] = useState<string | null>(null);

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>("");
  const [nights, setNights] = useState<number>(1);
  const [numberOfGuests, setNumberOfGuests] = useState<number>(1);
  const [walkInNotes, setWalkInNotes] = useState<string>("");
  const [checkInNotes, setCheckInNotes] = useState<string>("");
  const [dirtyRoomDialog, setDirtyRoomDialog] = useState(false);
  const [anticipadoDialog, setAnticipadorDialog] = useState(false);

  const [historyDate, setHistoryDate] = useState<string>(() => {
    return getLocalToday();
  });

  const [webCheckinDialogOpen, setWebCheckinDialogOpen] = useState(false);
  const [webCheckinReservation, setWebCheckinReservation] = useState<ReservationWithDetails | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [webCheckinDetailId, setWebCheckinDetailId] = useState<string | null>(null);
  const [webCheckinDateFrom, setWebCheckinDateFrom] = useState<string>(() => getLocalToday());

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

  const { data: allReservations } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations"],
    enabled: activeTab === "webcheckin",
  });

  const webCheckinReservations = allReservations
    ?.filter(
      (r) =>
        (r.status === "confirmed" || r.status === "pending") &&
        r.checkInDate >= webCheckinDateFrom
    )
    .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));

  const { data: webCheckinList } = useQuery<WebCheckinListItem[]>({
    queryKey: ["/api/web-checkin/list"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/web-checkin/list");
      return res.json();
    },
    enabled: activeTab === "webcheckin",
  });

  const generateLinkMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const res = await apiRequest("POST", `/api/web-checkin/generate/${reservationId}`);
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedLink(data.link);
      queryClient.invalidateQueries({ queryKey: ["/api/web-checkin/list"] });
      toast({
        title: "Link generado",
        description: "El enlace de web check-in ha sido generado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo generar el enlace de web check-in.",
        variant: "destructive",
      });
    },
  });

  const availableRooms = rooms?.filter((room) => 
    room.status === "available" && 
    (selectedRoomTypeId ? room.roomTypeId === selectedRoomTypeId : true)
  );

  const applicableRatePlans = ratePlans?.filter((rp) => 
    rp.roomTypeId === selectedRoomTypeId
  );

  const { data: guestPreferences = [] } = useQuery<GuestPreference[]>({
    queryKey: ["/api/guests", selectedReservation?.guestId, "preferences"],
    enabled: !!selectedReservation?.guestId && confirmDialogOpen,
  });

  const activePrefs = guestPreferences.filter((p) => p.isActive);
  const criticalPrefs = activePrefs.filter((p) => p.priority === "critical" || p.priority === "high");

  const selectedRatePlan = ratePlans?.find((rp) => rp.id === selectedRatePlanId);
  const totalAmount = selectedRatePlan ? (parseFloat(selectedRatePlan.baseRate) * nights).toFixed(2) : "0.00";

  const checkInMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      return apiRequest("POST", `/api/reservations/${id}/check-in`, motivo ? { motivo } : {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-ins-by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      toast({
        title: "Check-in realizado",
        description: `El huesped ${selectedReservation?.guest?.lastName} ${selectedReservation?.guest?.firstName} ha sido registrado exitosamente.`,
      });
      setConfirmDialogOpen(false);
      setRetroactivoDialog(false);
      setRetroactivoMotivo("");
      setPendingCheckInId(null);
      setSelectedReservation(null);
    },
    onError: async (error: any) => {
      let errorData: any = {};
      try {
        const raw = error?.message || "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart >= 0) errorData = JSON.parse(raw.substring(jsonStart));
      } catch {}
      if (errorData?.error === "CHECK_IN_RETROACTIVO") {
        setPendingCheckInId(selectedReservation?.id || null);
        setRetroactivoDialog(true);
        return;
      }
      const message = errorData?.error || error?.message || "No se pudo realizar el check-in. Intente nuevamente.";
      toast({
        title: "Check-in no permitido",
        description: message,
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

  const walkInMutation = useMutation({
    mutationFn: async () => {
      const today = getLocalToday();
      const coDate = new Date();
      coDate.setDate(coDate.getDate() + nights);
      const checkOutDate = coDate.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      
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
        notes: walkInNotes ? `Walk-in: ${walkInNotes}` : "Walk-in",
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
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning"
      });
      toast({
        title: "Walk-in exitoso",
        description: `${selectedGuest?.lastName} ${selectedGuest?.firstName} ha sido registrado en la habitacion.`,
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

  const resetWalkInForm = () => {
    setSelectedGuest(null);
    setSelectedCompany(null);
    setSelectedRoomTypeId("");
    setSelectedRoomId("");
    setSelectedRatePlanId("");
    setNights(1);
    setNumberOfGuests(1);
    setWalkInNotes("");
  };

  const today = getLocalToday();
  const filteredReservations = reservations?.filter((res) => {
    if (res.checkInDate !== today) return false;
    const guestName = `${res.guest?.lastName} ${res.guest?.firstName}`.toLowerCase();
    return (
      guestName.includes(searchQuery.toLowerCase()) ||
      res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleCheckIn = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setCheckInNotes(reservation.notes || "");
    setConfirmDialogOpen(true);
  };

  const doCheckIn = () => {
    if (!selectedReservation) return;
    checkInMutation.mutate({ id: selectedReservation.id });
  };

  const performCheckIn = async () => {
    if (!selectedReservation) return;
    
    if (checkInNotes !== (selectedReservation.notes || "")) {
      await apiRequest("PATCH", `/api/reservations/${selectedReservation.id}`, {
        notes: checkInNotes,
      });
    }

    const roomStatus = selectedReservation.room?.status;
    if (roomStatus === "dirty" || roomStatus === "cleaning") {
      setDirtyRoomDialog(true);
      return;
    }

    const today = getLocalToday();
    if (selectedReservation.checkInDate > today) {
      setAnticipadorDialog(true);
      return;
    }
    
    checkInMutation.mutate({ id: selectedReservation.id });
  };

  const confirmDirtyRoom = () => {
    setDirtyRoomDialog(false);
    const today = getLocalToday();
    if (selectedReservation && selectedReservation.checkInDate > today) {
      setAnticipadorDialog(true);
      return;
    }
    doCheckIn();
  };

  const canSubmitWalkIn = selectedGuest && selectedRoomTypeId && selectedRoomId && nights > 0;

  const todayDisplay = new Date().toLocaleDateString("es-ES", {
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
        <p className="text-muted-foreground capitalize">{todayDisplay}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "reservations" | "walkin" | "webcheckin" | "history")}>
        <TabsList className="grid w-full max-w-3xl grid-cols-4">
          <TabsTrigger value="reservations" data-testid="tab-reservations">
            <LogIn className="h-4 w-4 mr-2" />
            Reservas
          </TabsTrigger>
          <TabsTrigger value="walkin" data-testid="tab-walkin">
            <UserPlus className="h-4 w-4 mr-2" />
            Walk-in
          </TabsTrigger>
          <TabsTrigger value="webcheckin" data-testid="tab-webcheckin">
            <Smartphone className="h-4 w-4 mr-2" />
            Web Check-in
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <CalendarDays className="h-4 w-4 mr-2" />
            Historial
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
                          {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {reservation.guest?.lastName} {reservation.guest?.firstName}
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
                        <span>{formatDateAR(reservation.checkInDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDateAR(reservation.checkOutDate)}</span>
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
                        {roomTypes?.filter(rt => rt.id).map((rt) => (
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
                          {availableRooms?.filter(room => room.id).map((room) => (
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
                          {applicableRatePlans.filter(rp => rp.id).map((rp) => (
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
                      {selectedGuest ? `${selectedGuest.lastName} ${selectedGuest.firstName}` : "-"}
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

                  <div className="space-y-2 mt-4">
                    <Label htmlFor="walkInNotes">Comentarios / Notas</Label>
                    <Textarea
                      id="walkInNotes"
                      placeholder="Agregar comentarios para recepción..."
                      value={walkInNotes}
                      onChange={(e) => setWalkInNotes(e.target.value)}
                      className="min-h-[60px]"
                      data-testid="input-walkin-notes"
                    />
                  </div>

                  <Button
                    className="w-full mt-4"
                    onClick={() => walkInMutation.mutate()}
                    disabled={!canSubmitWalkIn || walkInMutation.isPending}
                    data-testid="button-complete-walkin"
                  >
                    {walkInMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
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

        <TabsContent value="webcheckin" className="space-y-6 mt-6">
          <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <Smartphone className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold">Web Check-in</h3>
                <p className="text-sm text-muted-foreground">
                  Genera links para que los huéspedes completen su check-in desde el celular
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Generar Link de Web Check-in</CardTitle>
                  <CardDescription>Reservas confirmadas o pendientes desde la fecha seleccionada</CardDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Desde</Label>
                  <Input
                    type="date"
                    value={webCheckinDateFrom}
                    onChange={(e) => setWebCheckinDateFrom(e.target.value)}
                    className="h-8 text-sm w-36"
                    data-testid="input-webcheckin-date-from"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setWebCheckinDateFrom(getLocalToday())}
                    data-testid="button-webcheckin-today"
                  >
                    Hoy
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {webCheckinReservations && webCheckinReservations.length > 0 ? (
                <div className="space-y-2">
                  {webCheckinReservations.map((res) => (
                    <div
                      key={res.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      data-testid={`webcheckin-res-${res.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                          {res.guest?.lastName?.[0]}{res.guest?.firstName?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{res.guest?.lastName} {res.guest?.firstName}</p>
                          <p className="text-xs text-muted-foreground">
                            Hab. {res.room?.roomNumber} | {formatDateAR(res.checkInDate)} - {formatDateAR(res.checkOutDate)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={res.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                          {res.status === "confirmed" ? "Confirmada" : "Pendiente"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setWebCheckinReservation(res);
                            setGeneratedLink(null);
                            setWebCheckinDialogOpen(true);
                            generateLinkMutation.mutate(res.id);
                          }}
                          disabled={generateLinkMutation.isPending}
                          data-testid={`button-generate-link-${res.id}`}
                        >
                          <Link2 className="h-4 w-4 mr-1" />
                          Generar Link
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay reservas pendientes o confirmadas para generar web check-in
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Web Check-ins Enviados</CardTitle>
              <CardDescription>Estado de los web check-ins generados</CardDescription>
            </CardHeader>
            <CardContent>
              {webCheckinList && webCheckinList.length > 0 ? (
                <div className="space-y-2">
                  {webCheckinList.map((wc) => (
                    <div
                      key={wc.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`webcheckin-item-${wc.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
                          wc.status === "completed" ? "bg-green-100 dark:bg-green-900" :
                          wc.status === "expired" ? "bg-red-100 dark:bg-red-900" :
                          "bg-amber-100 dark:bg-amber-900"
                        }`}>
                          {wc.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : wc.status === "expired" ? (
                            <Clock className="h-4 w-4 text-red-600 dark:text-red-400" />
                          ) : (
                            <Send className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{wc.reservation?.guestName || "Huésped"}</p>
                          <p className="text-xs text-muted-foreground">
                            {wc.reservation?.roomNumber ? `Hab. ${wc.reservation.roomNumber} | ` : ""}
                            {formatDateAR(wc.reservation?.checkInDate) || ""} - {formatDateAR(wc.reservation?.checkOutDate) || ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          wc.status === "completed" ? "default" :
                          wc.status === "expired" ? "destructive" :
                          "secondary"
                        } data-testid={`badge-wc-status-${wc.id}`}>
                          {wc.status === "completed" ? "Completado" :
                           wc.status === "expired" ? "Expirado" :
                           "Pendiente"}
                        </Badge>
                        {wc.status === "completed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setWebCheckinDetailId(webCheckinDetailId === String(wc.id) ? null : String(wc.id))}
                            data-testid={`button-wc-detail-${wc.id}`}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {webCheckinList.filter(wc => wc.status === "completed" && webCheckinDetailId === String(wc.id)).map((wc) => (
                    <Card key={`detail-${wc.id}`} className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                      <CardContent className="p-4 space-y-3">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Datos confirmados por el huésped
                        </h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div><span className="text-muted-foreground">Nombre:</span> {wc.confirmedFirstName} {wc.confirmedLastName}</div>
                          <div><span className="text-muted-foreground">Documento:</span> {wc.confirmedDocumentType} {wc.confirmedDocumentNumber}</div>
                          <div><span className="text-muted-foreground">Nacionalidad:</span> {wc.confirmedNationality || "—"}</div>
                          <div><span className="text-muted-foreground">Teléfono:</span> {wc.confirmedPhone || "—"}</div>
                          <div><span className="text-muted-foreground">Email:</span> {wc.confirmedEmail || "—"}</div>
                          <div><span className="text-muted-foreground">Llegada:</span> {wc.estimatedArrivalTime || "No especificada"}</div>
                          {wc.requestEarlyCheckIn && (
                            <div className="col-span-2">
                              <Badge variant="outline" className="text-amber-600 border-amber-300">
                                Early check-in solicitado{wc.earlyCheckInTime ? `: ${wc.earlyCheckInTime}` : ""}
                              </Badge>
                            </div>
                          )}
                        </div>
                        {wc.documentPhotoUrl && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <Image className="h-3 w-3" /> Foto del documento
                            </p>
                            <img src={wc.documentPhotoUrl} alt="Documento" className="max-w-xs rounded border" data-testid={`img-wc-doc-${wc.id}`} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No se han generado web check-ins aún
                </p>
              )}
            </CardContent>
          </Card>
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
                            {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                          </div>
                          <div>
                            <CardTitle className="text-lg">
                              {reservation.guest?.lastName} {reservation.guest?.firstName}
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
                          <span>Entrada: {formatDateAR(reservation.checkInDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>Salida: {formatDateAR(reservation.checkOutDate)}</span>
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
      </Tabs>

      <Dialog open={webCheckinDialogOpen} onOpenChange={setWebCheckinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-green-600" />
              Web Check-in
            </DialogTitle>
          </DialogHeader>
          {webCheckinReservation && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium">{webCheckinReservation.guest?.lastName} {webCheckinReservation.guest?.firstName}</p>
                <p className="text-muted-foreground">
                  Hab. {webCheckinReservation.room?.roomNumber} | {formatDateAR(webCheckinReservation.checkInDate)} - {formatDateAR(webCheckinReservation.checkOutDate)}
                </p>
              </div>
              {generateLinkMutation.isError ? (
                <div className="space-y-3 text-center py-4">
                  <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
                  <p className="text-sm text-destructive">No se pudo generar el enlace</p>
                  <Button
                    variant="outline"
                    onClick={() => generateLinkMutation.mutate(webCheckinReservation!.id)}
                    data-testid="button-retry-generate"
                  >
                    Reintentar
                  </Button>
                </div>
              ) : generatedLink ? (
                <div className="space-y-3">
                  <Label>Enlace generado</Label>
                  <div className="flex gap-2">
                    <Input value={generatedLink} readOnly className="text-xs" data-testid="input-generated-link" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLink);
                        toast({ title: "Copiado", description: "Link copiado al portapapeles" });
                      }}
                      data-testid="button-copy-link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    {webCheckinReservation.guest?.phone && (
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => {
                          const phone = webCheckinReservation.guest?.phone?.replace(/\D/g, "") || "";
                          const msg = encodeURIComponent(
                            `Hola ${webCheckinReservation.guest?.firstName}! Desde Maran Suites & Towers te invitamos a completar tu web check-in antes de tu llegada: ${generatedLink}`
                          );
                          window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
                        }}
                        data-testid="button-whatsapp"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir WhatsApp
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => window.open(generatedLink, "_blank")}
                      data-testid="button-open-link"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir Link
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Check-in</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {selectedReservation && (
                  <>
                    <p className="mb-3">
                      Verificá los datos con el huésped antes de confirmar.
                    </p>

                    {/* Reservation summary card */}
                    <div className="mb-3 rounded-lg border bg-muted/30 divide-y text-sm">
                      <div className="flex items-center gap-3 p-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base shrink-0">
                          {selectedReservation.guest?.lastName?.[0]}{selectedReservation.guest?.firstName?.[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">
                            {selectedReservation.guest?.lastName} {selectedReservation.guest?.firstName}
                          </p>
                          {selectedReservation.guest?.email && (
                            <p className="text-xs text-muted-foreground">{selectedReservation.guest?.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x">
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Habitación</p>
                          <p className="font-medium text-foreground">{selectedReservation.room?.roomNumber} — {(selectedReservation.room as any)?.roomType?.name || ""}</p>
                        </div>
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Huéspedes</p>
                          <p className="font-medium text-foreground">{selectedReservation.numberOfGuests} persona(s)</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x">
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Check-in</p>
                          <p className="font-medium text-foreground">{(() => { const [y,m,d] = selectedReservation.checkInDate.split("-"); return `${d}/${m}/${y}`; })()}</p>
                        </div>
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Check-out</p>
                          <p className="font-medium text-foreground">{(() => { const [y,m,d] = selectedReservation.checkOutDate.split("-"); return `${d}/${m}/${y}`; })()} ({selectedReservation.nights} noche{selectedReservation.nights !== 1 ? "s" : ""})</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x">
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Tarifa por noche</p>
                          <p className="font-medium text-foreground">${Number(selectedReservation.finalRatePerNight || 0).toLocaleString("es-AR")}</p>
                        </div>
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Total alojamiento</p>
                          <p className="font-semibold text-foreground">${Number(selectedReservation.totalRoomAmount || 0).toLocaleString("es-AR")}</p>
                        </div>
                      </div>
                      {((selectedReservation as any).bedType?.name || selectedReservation.bedTypeNotes) && (
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Tipo de cama</p>
                          <p className="font-medium text-foreground">
                            {(selectedReservation as any).bedType?.name || ""}
                            {selectedReservation.bedTypeNotes ? ` — ${selectedReservation.bedTypeNotes}` : ""}
                          </p>
                        </div>
                      )}
                      {selectedReservation.source && selectedReservation.source !== "directo" && (
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Canal / Origen</p>
                          <p className="font-medium text-foreground capitalize">{selectedReservation.source}</p>
                        </div>
                      )}
                      {selectedReservation.notes && (
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Pedidos / Notas</p>
                          <p className="text-foreground">{selectedReservation.notes}</p>
                        </div>
                      )}
                    </div>

                    {activePrefs.length > 0 && (
                      <div className={`mb-4 p-3 rounded-lg border ${criticalPrefs.length > 0 ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"}`} data-testid="checkin-preference-alert">
                        <div className="flex items-center gap-2 mb-2">
                          {criticalPrefs.length > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          ) : (
                            <Heart className="h-4 w-4 text-orange-500" />
                          )}
                          <span className="font-medium text-sm text-foreground">
                            Preferencias del huésped ({activePrefs.length})
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {activePrefs.map((pref) => (
                            <div key={pref.id} className="flex items-center gap-2 text-sm">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  pref.priority === "critical" ? "border-red-400 text-red-700 dark:text-red-300" :
                                  pref.priority === "high" ? "border-orange-400 text-orange-700 dark:text-orange-300" :
                                  ""
                                }`}
                              >
                                {pref.priority === "critical" ? "Crítica" : pref.priority === "high" ? "Alta" : pref.priority === "low" ? "Baja" : "Normal"}
                              </Badge>
                              <span className="text-foreground">{pref.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="checkInNotes" className="text-foreground">Comentarios / Notas</Label>
                      <Textarea
                        id="checkInNotes"
                        placeholder="Agregar comentarios para recepción..."
                        value={checkInNotes}
                        onChange={(e) => setCheckInNotes(e.target.value)}
                        className="min-h-[60px]"
                        data-testid="input-checkin-notes"
                      />
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-checkin">Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={performCheckIn}
              disabled={checkInMutation.isPending}
              data-testid="button-confirm-checkin"
            >
              {checkInMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
              ) : "Confirmar Check-in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aviso: Habitación sucia */}
      <Dialog open={dirtyRoomDialog} onOpenChange={(open) => { if (!open) setDirtyRoomDialog(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              Habitación no disponible
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              La habitación <strong>{selectedReservation?.room?.roomNumber}</strong> figura como{" "}
              <strong className="text-orange-700 dark:text-orange-400">
                {selectedReservation?.room?.status === "dirty" ? "sucia" : "en limpieza"}
              </strong>{" "}
              en el sistema.
            </p>
            <p>¿Desea registrar el check-in de todas formas?</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDirtyRoomDialog(false)} data-testid="button-cancel-dirty-warning">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDirtyRoom}
              disabled={checkInMutation.isPending}
              data-testid="button-confirm-dirty-checkin"
            >
              Confirmar de todas formas
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Aviso: Check-in anticipado */}
      <Dialog open={anticipadoDialog} onOpenChange={(open) => { if (!open) setAnticipadorDialog(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Check-in anticipado
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              La fecha de entrada programada es{" "}
              <strong className="text-amber-700 dark:text-amber-400">
                {selectedReservation ? formatDateAR(selectedReservation.checkInDate) : ""}
              </strong>
              , que es posterior a hoy.
            </p>
            <p>¿Desea registrar el check-in antes de la fecha prevista?</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAnticipadorDialog(false)} data-testid="button-cancel-anticipado">
              Cancelar
            </Button>
            <Button
              onClick={() => { setAnticipadorDialog(false); doCheckIn(); }}
              disabled={checkInMutation.isPending}
              data-testid="button-confirm-anticipado"
            >
              Confirmar check-in anticipado
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={retroactivoDialog} onOpenChange={(open) => { setRetroactivoDialog(open); if (!open) { setRetroactivoMotivo(""); setPendingCheckInId(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              Check-in retroactivo
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              La fecha de check-in es anterior a hoy. Ingrese el motivo por el cual se registra con fecha pasada.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="motivo-retroactivo">Motivo (obligatorio)</Label>
              <Textarea
                id="motivo-retroactivo"
                placeholder="Ej: Huésped llegó tarde, sistema caído, error operativo..."
                value={retroactivoMotivo}
                onChange={(e) => setRetroactivoMotivo(e.target.value)}
                rows={3}
                data-testid="input-motivo-retroactivo"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setRetroactivoDialog(false); setRetroactivoMotivo(""); setPendingCheckInId(null); }}>
              Cancelar
            </Button>
            <Button
              disabled={!retroactivoMotivo.trim() || checkInMutation.isPending}
              onClick={() => {
                if (pendingCheckInId && retroactivoMotivo.trim()) {
                  checkInMutation.mutate({ id: pendingCheckInId, motivo: retroactivoMotivo });
                }
              }}
              data-testid="button-confirm-retroactivo"
            >
              {checkInMutation.isPending ? "Procesando..." : "Confirmar igual"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
