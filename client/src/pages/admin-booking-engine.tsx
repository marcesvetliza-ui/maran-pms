import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Globe, Settings, Eye, EyeOff, GripVertical,
  Plus, X, Edit2, Save, ExternalLink, Wifi, Coffee, Snowflake,
  Tv, Bath, Car, Check, BedDouble,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
    if (a && !amenities.includes(a)) {
      setAmenities([...amenities, a]);
    }
    setNewAmenity("");
  };

  const addPhoto = () => {
    if (newPhoto.trim() && !photos.includes(newPhoto.trim())) {
      setPhotos([...photos, newPhoto.trim()]);
    }
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
        {/* Description */}
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

        {/* Amenities */}
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

        {/* Photos */}
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

        {/* Sort order */}
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

export default function AdminBookingEnginePage() {
  const { toast } = useToast();

  const { data: roomTypesList = [], isLoading, refetch } = useQuery<RoomTypeWithBooking[]>({
    queryKey: ["/api/room-types"],
    queryFn: () => fetch("/api/room-types", { credentials: "include" }).then(r => r.json()),
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
            Configurá las habitaciones que se muestran en el motor de reservas público
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(bookingUrl, "_blank")}
            data-testid="btn-preview-booking">
            <ExternalLink className="h-4 w-4 mr-1" />
            Previsualizar
          </Button>
        </div>
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

      {/* Room types config */}
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

      {/* Info block */}
      <Card className="bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <CardContent className="p-4 text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <p className="font-semibold">¿Cómo funciona el motor de reservas?</p>
          <ul className="space-y-1 text-xs list-disc list-inside text-blue-700 dark:text-blue-300">
            <li>El huésped elige fechas → el sistema consulta disponibilidad real en tiempo real</li>
            <li>Elige habitación → ve fotos, descripción y precio por noche</li>
            <li>Ingresa sus datos → nombre, email, teléfono, documento</li>
            <li>Confirma → la reserva se crea automáticamente en el PMS con estado "Confirmada"</li>
            <li>El pago se realiza al momento del check-in (integración MercadoPago disponible próximamente)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
