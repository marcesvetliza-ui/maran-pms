import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fmtMoney } from "@/lib/utils";
import { Link } from "wouter";
import {
  ArrowLeft, Globe, Settings, Eye, EyeOff,
  Plus, X, Edit2, Save, ExternalLink, Check, BedDouble,
  Calendar, User, Phone, Mail, Hash, ClipboardList, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RoomType } from "@shared/schema";

type RoomTypeWithBooking = RoomType & {
  amenities?: string[] | null;
  photos?: string[] | null;
  publicDescription?: string | null;
  sortOrder?: number | null;
  showInBooking?: boolean | null;
};

const AMENITY_PRESETS = [
  "WiFi gratis", "Desayuno incluido", "Aire acondicionado",
  "Smart TV", "Baño privado", "Estacionamiento", "Caja fuerte",
  "Minibar", "Vista a la ciudad", "Balcón", "Jacuzzi",
  "Servicio de habitación", "Accesible", "Sin fumadores",
];

function fmt(d: string) {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ─── Room Type Editor ─────────────────────────────────────────────────────────

function RoomTypeEditor({ rt, onSave }: { rt: RoomTypeWithBooking; onSave: () => void }) {
  const { toast } = useToast();
  const [publicDesc, setPublicDesc] = useState(rt.publicDescription || "");
  const [amenities, setAmenities] = useState<string[]>(rt.amenities || []);
  const [newAmenity, setNewAmenity] = useState("");
  const [photos, setPhotos] = useState<string[]>(rt.photos || []);
  const [newPhoto, setNewPhoto] = useState("");
  const [showInBooking, setShowInBooking] = useState(rt.showInBooking !== false);
  const [sortOrder, setSortOrder] = useState(rt.sortOrder || 0);
  const [editing, setEditing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/room-types/${rt.id}/booking-config`, {
      publicDescription: publicDesc || null,
      amenities: amenities.length ? amenities : null,
      photos: photos.length ? photos : null,
      showInBooking,
      sortOrder,
    }),
    onSuccess: () => {
      toast({ title: `${rt.name} actualizado` });
      setEditing(false);
      onSave();
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const addAmenity = (a: string) => {
    if (a && !amenities.includes(a)) setAmenities([...amenities, a]);
    setNewAmenity("");
  };

  const addPhoto = () => {
    if (newPhoto.trim() && !photos.includes(newPhoto.trim())) setPhotos([...photos, newPhoto.trim()]);
    setNewPhoto("");
  };

  return (
    <Card className={`transition-all ${!showInBooking ? "opacity-60" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BedDouble className="h-5 w-5 text-blue-500" />
            <div>
              <CardTitle className="text-base">{rt.name}</CardTitle>
              <CardDescription className="text-xs">{rt.code} · hasta {rt.maxOccupancy} pax</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={showInBooking}
                onCheckedChange={v => { setShowInBooking(v); setEditing(true); }}
                data-testid={`switch-show-booking-${rt.id}`}
              />
              <span className="text-xs text-muted-foreground">{showInBooking ? "Visible" : "Oculto"}</span>
            </div>
            <Button
              size="sm" variant={editing ? "default" : "outline"}
              onClick={() => editing ? saveMutation.mutate() : setEditing(true)}
              disabled={saveMutation.isPending}
              data-testid={`btn-save-roomtype-${rt.id}`}
            >
              {editing ? <><Save className="h-3.5 w-3.5 mr-1" />Guardar</> : <><Edit2 className="h-3.5 w-3.5 mr-1" />Editar</>}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Descripción pública (aparece en la web)</Label>
          <Textarea
            value={publicDesc}
            onChange={e => { setPublicDesc(e.target.value); setEditing(true); }}
            placeholder="Describe esta habitación para los huéspedes..."
            className="resize-none h-20 text-sm"
            data-testid={`textarea-public-desc-${rt.id}`}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Amenities destacados</Label>
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((a, i) => (
              <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                {a}
                <button onClick={() => { setAmenities(amenities.filter((_, j) => j !== i)); setEditing(true); }}
                  className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newAmenity}
              onChange={e => setNewAmenity(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addAmenity(newAmenity)}
              placeholder="Agregar amenity..."
              className="h-8 text-sm"
              data-testid={`input-amenity-${rt.id}`}
            />
            <Button size="sm" variant="outline" onClick={() => addAmenity(newAmenity)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {AMENITY_PRESETS.filter(p => !amenities.includes(p)).slice(0, 8).map(p => (
              <button key={p} onClick={() => { addAmenity(p); setEditing(true); }}
                className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-gray-500 hover:text-blue-600 transition-colors">
                + {p}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Fotos (URLs de imágenes)</Label>
          <div className="space-y-1">
            {photos.map((url, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1">
                <img src={url} alt="" className="h-8 w-12 object-cover rounded" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className="text-xs text-muted-foreground flex-1 truncate">{url}</span>
                <button onClick={() => { setPhotos(photos.filter((_, j) => j !== i)); setEditing(true); }}
                  className="hover:text-destructive shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newPhoto}
              onChange={e => setNewPhoto(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addPhoto()}
              placeholder="https://... URL de imagen"
              className="h-8 text-sm"
              data-testid={`input-photo-${rt.id}`}
            />
            <Button size="sm" variant="outline" onClick={addPhoto}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Orden en la lista</Label>
          <Input
            type="number" value={sortOrder} min={0} max={99}
            onChange={e => { setSortOrder(parseInt(e.target.value) || 0); setEditing(true); }}
            className="h-8 w-20 text-sm"
            data-testid={`input-sort-${rt.id}`}
          />
          <span className="text-xs text-muted-foreground">(menor número = aparece primero)</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Assign Room Dialog ───────────────────────────────────────────────────────

function AssignRoomDialog({
  reservation,
  open,
  onClose,
  onConfirmed,
}: {
  reservation: any;
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const { toast } = useToast();
  const [selectedRoomId, setSelectedRoomId] = useState(reservation?.room_id || "");

  const { data: availableRooms = [], isLoading: loadingRooms } = useQuery<any[]>({
    queryKey: ["/api/admin/booking-engine/available-rooms", reservation?.check_in_date, reservation?.check_out_date, reservation?.id],
    queryFn: () => fetch(
      `/api/admin/booking-engine/available-rooms?checkIn=${reservation.check_in_date}&checkOut=${reservation.check_out_date}&excludeReservationId=${reservation.id}`,
      { credentials: "include" }
    ).then(r => r.json()),
    enabled: open && !!reservation,
  });

  const assignMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/booking-engine/reservations/${reservation.id}/assign`, {
      roomId: selectedRoomId,
    }),
    onSuccess: () => {
      toast({ title: "Reserva confirmada", description: "La reserva fue asignada y ya aparece en el planning." });
      onConfirmed();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!reservation) return null;

  const sameTypeRooms = availableRooms.filter(r => r.roomTypeId === reservation.room_type_id);
  const otherRooms = availableRooms.filter(r => r.roomTypeId !== reservation.room_type_id);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar habitación — {reservation.reservation_code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Guest info summary */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{reservation.first_name} {reservation.last_name}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Calendar className="h-3.5 w-3.5" />
              <span>{fmt(reservation.check_in_date)} → {fmt(reservation.check_out_date)} · {reservation.nights} noche{reservation.nights !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <BedDouble className="h-3.5 w-3.5" />
              <span>Solicitó: {reservation.room_type_name} · {reservation.number_of_guests} pax</span>
            </div>
          </div>

          {/* Room selector */}
          <div className="space-y-1.5">
            <Label>Habitación a asignar</Label>
            {loadingRooms ? (
              <div className="h-10 bg-muted rounded animate-pulse" />
            ) : (
              <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                <SelectTrigger data-testid="select-room-assign">
                  <SelectValue placeholder="Seleccionar habitación..." />
                </SelectTrigger>
                <SelectContent>
                  {sameTypeRooms.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/50">
                        Mismo tipo ({reservation.room_type_name})
                      </div>
                      {sameTypeRooms.filter(r => r.id).map(r => (
                        <SelectItem key={r.id} value={r.id} data-testid={`option-room-${r.id}`}>
                          Hab. {r.roomNumber} — {r.roomTypeName}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {otherRooms.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/50">
                        Otros tipos disponibles
                      </div>
                      {otherRooms.filter(r => r.id).map(r => (
                        <SelectItem key={r.id} value={r.id} data-testid={`option-room-${r.id}`}>
                          Hab. {r.roomNumber} — {r.roomTypeName}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {availableRooms.length === 0 && (
                    <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                      No hay habitaciones disponibles para esas fechas
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Solo se muestran habitaciones libres para esas fechas.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => assignMut.mutate()}
            disabled={!selectedRoomId || assignMut.isPending}
            data-testid="btn-confirm-assign"
          >
            {assignMut.isPending && <span className="h-4 w-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />}
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Confirmar y pasar al planning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Web Reservations Panel ───────────────────────────────────────────────────

function WebReservationsPanel() {
  const [assigningReservation, setAssigningReservation] = useState<any>(null);

  const { data: webReservations = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/booking-engine/reservations"],
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Reservas recibidas desde el motor web que están pendientes de asignación de habitación.
            Una vez asignadas, pasan automáticamente al planning.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-web-reservations">
          Actualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : webReservations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-muted-foreground">Sin reservas web pendientes</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cuando lleguen reservas desde el motor online, aparecerán acá para que les asignes habitación.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs">Código</TableHead>
                <TableHead className="text-xs">Huésped</TableHead>
                <TableHead className="text-xs">Contacto</TableHead>
                <TableHead className="text-xs">Fechas</TableHead>
                <TableHead className="text-xs">Tipo solicitado</TableHead>
                <TableHead className="text-xs">Hab. pre-asignada</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webReservations.map((r: any) => (
                <TableRow key={r.id} data-testid={`row-web-res-${r.id}`}>
                  <TableCell className="py-2">
                    <span className="font-mono text-xs font-semibold text-blue-600">{r.reservation_code}</span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="font-medium text-sm">{r.first_name} {r.last_name}</div>
                    {r.document_number && (
                      <div className="text-xs text-muted-foreground">{r.document_type?.toUpperCase()} {r.document_number}</div>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="text-xs space-y-0.5">
                      {r.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{r.email}</div>}
                      {r.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{r.phone}</div>}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="text-xs">
                      <div>{fmt(r.check_in_date)} → {fmt(r.check_out_date)}</div>
                      <div className="text-muted-foreground">{r.nights} noche{r.nights !== 1 ? "s" : ""} · {r.number_of_guests} pax</div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className="text-xs">{r.room_type_name}</Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-sm font-medium">
                      {r.room_number ? `Hab. ${r.room_number}` : <span className="text-muted-foreground">—</span>}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="font-semibold text-sm">
                      ${fmtMoney(r.total_amount || "0")}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <Button
                      size="sm"
                      onClick={() => setAssigningReservation(r)}
                      data-testid={`btn-assign-${r.id}`}
                    >
                      <BedDouble className="h-3.5 w-3.5 mr-1" />
                      Asignar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AssignRoomDialog
        reservation={assigningReservation}
        open={!!assigningReservation}
        onClose={() => setAssigningReservation(null)}
        onConfirmed={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
        }}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminBookingEnginePage() {
  const { toast } = useToast();

  const { data: roomTypesList = [], isLoading, refetch } = useQuery<RoomTypeWithBooking[]>({
    queryKey: ["/api/room-types"],
    queryFn: () => fetch("/api/room-types", { credentials: "include" }).then(r => r.json()),
  });

  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ["/api/admin/booking-engine/reservations", "count"],
    queryFn: () => fetch("/api/admin/booking-engine/reservations", { credentials: "include" })
      .then(r => r.json()).then((arr: any[]) => arr.length),
    refetchInterval: 30000,
  });

  const bookingUrl = `${window.location.origin}/reservar`;
  const iframeCode = `<iframe src="${bookingUrl}" width="100%" height="700" frameborder="0" allow="payment" style="border-radius:8px;"></iframe>`;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/administration">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Administración
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6 text-blue-500" />
            Motor de Reservas Online
          </h1>
          <p className="text-muted-foreground text-sm">
            Gestioná reservas web y configurá las habitaciones del motor público
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.open(bookingUrl, "_blank")}
          data-testid="btn-preview-booking">
          <ExternalLink className="h-4 w-4 mr-1" />
          Previsualizar
        </Button>
      </div>

      {/* Booking URL & Iframe code */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">URL del Motor de Reservas</CardTitle>
            <CardDescription className="text-xs">
              Usá este link en el botón "Reservar" de tu web o en WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={bookingUrl} readOnly className="text-sm font-mono" data-testid="input-booking-url" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(bookingUrl); toast({ title: "Copiado al portapapeles" }); }}
                data-testid="btn-copy-url">
                Copiar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Código para Iframe</CardTitle>
            <CardDescription className="text-xs">
              Pegá este código en maran.com.ar para embeber el motor directamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={iframeCode} readOnly className="text-xs font-mono" data-testid="input-iframe-code" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(iframeCode); toast({ title: "Código copiado" }); }}
                data-testid="btn-copy-iframe">
                Copiar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="reservations">
        <TabsList>
          <TabsTrigger value="reservations" className="gap-2" data-testid="tab-reservations">
            <ClipboardList className="h-4 w-4" />
            Reservas
            {pendingCount > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1.5 text-xs bg-orange-500 hover:bg-orange-500">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2" data-testid="tab-config">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        {/* ── Reservas tab ── */}
        <TabsContent value="reservations" className="mt-4">
          <WebReservationsPanel />
        </TabsContent>

        {/* ── Config tab ── */}
        <TabsContent value="config" className="mt-4 space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configurar Habitaciones
            </h2>
            {isLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : (
              <div className="grid gap-4">
                {roomTypesList.map(rt => (
                  <RoomTypeEditor key={rt.id} rt={rt} onSave={refetch} />
                ))}
              </div>
            )}
          </div>

          <Card className="bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
            <CardContent className="p-4 text-sm text-blue-800 dark:text-blue-200 space-y-2">
              <p className="font-semibold">¿Cómo funciona el motor de reservas?</p>
              <ul className="space-y-1 text-xs list-disc list-inside text-blue-700 dark:text-blue-300">
                <li>El huésped elige fechas → el sistema consulta disponibilidad real</li>
                <li>Elige habitación → ve fotos, descripción y precio por noche</li>
                <li>Ingresa sus datos → nombre, email, teléfono, documento</li>
                <li>Confirma → la reserva llega acá como "pendiente de asignación"</li>
                <li>Recepción asigna habitación → pasa al planning como "Confirmada"</li>
                <li>El pago se realiza al check-in (integración MercadoPago próximamente)</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
