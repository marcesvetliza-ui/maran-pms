import { BookingOtaSourcePanel } from "@/components/booking-ota-source-panel";
import { Checkbox } from "@/components/ui/checkbox";
import type { BookingOtaSourceSummary, BookingOtaVariantConfig } from "@shared/booking-engine";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fmtMoney } from "@/lib/utils";
import { Link } from "wouter";
import {
  ArrowLeft, Globe, Settings, Eye, EyeOff,
  Plus, X, Edit2, Save, ExternalLink, Check, BedDouble, Upload, ArrowUp,
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
import type { RoomType, RatePlan } from "@shared/schema";

type RoomTypeWithBooking = RoomType & {
  amenities?: string[] | null;
  photos?: string[] | null;
  publicDescription?: string | null;
  sortOrder?: number | null;
  showInBooking?: boolean | null;
  bookingRatePlanId?: string | null;
  bookingDiscountPercent?: number | null;
  bookingInheritOtaRanges?: boolean;
  bookingOtaAdjustmentPercent?: number;
  bookingOtaReferencePlans?: Record<string, string>;
  bookingOtaVariants?: BookingOtaVariantConfig[];
};

type BookingConfigResponse = {
  salesEnabled: boolean;
  otaSource?: BookingOtaSourceSummary;
  roomTypes: RoomTypeWithBooking[];
  ratePlans: RatePlan[];
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

function RoomTypeEditor({ rt, ratePlans, onSave }: {
  rt: RoomTypeWithBooking;
  ratePlans: RatePlan[];
  onSave: () => Promise<unknown> | void;
}) {
  const { toast } = useToast();
  const [publicDesc, setPublicDesc] = useState(rt.publicDescription || "");
  const [amenities, setAmenities] = useState<string[]>(rt.amenities || []);
  const [newAmenity, setNewAmenity] = useState("");
  const [photos, setPhotos] = useState<string[]>(rt.photos || []);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [newPhoto, setNewPhoto] = useState("");
  const [showInBooking, setShowInBooking] = useState(rt.showInBooking !== false);
  const [sortOrder, setSortOrder] = useState(rt.sortOrder || 0);
  const [ratePlanId, setRatePlanId] = useState(rt.bookingRatePlanId || "");
  const [discountPercent, setDiscountPercent] = useState(String(rt.bookingDiscountPercent ?? 0));
  const [discountError, setDiscountError] = useState("");
  const [inheritOtaRanges, setInheritOtaRanges] = useState(rt.bookingInheritOtaRanges === true);
  const [otaDirection, setOtaDirection] = useState((rt.bookingOtaAdjustmentPercent || 0) > 0 ? "increase" : "decrease");
  const [otaMagnitude, setOtaMagnitude] = useState(String(Math.abs(rt.bookingOtaAdjustmentPercent || 0)));
  const [otaReferencePlans, setOtaReferencePlans] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(rt.bookingOtaReferencePlans || {}).filter(([id, planId]) => rt.bookingOtaVariants?.some(variant => variant.id === id && variant.plans.some(plan => plan.id === planId)))));
  const otaAdjustmentPercent = (otaDirection === "decrease" ? -1 : 1) * Number(otaMagnitude);
  const otaAdjustmentValid = /^\d{1,4}(?:\.\d{1,2})?$/.test(otaMagnitude) && Number.isFinite(otaAdjustmentPercent)
    && otaAdjustmentPercent >= -99.99 && otaAdjustmentPercent <= 1000;
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [editing, setEditing] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const roomRatePlans = ratePlans.filter(plan => plan.roomTypeId === rt.id);
  const normalizedDiscount = Number(discountPercent);
  const discountValid = discountPercent.trim() !== "" && Number.isFinite(normalizedDiscount)
    && normalizedDiscount >= 0 && normalizedDiscount <= 99.99;

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/room-types/${rt.id}/booking-config`, {
      publicDescription: publicDesc || null,
      amenities: amenities.length ? amenities : null,
      photos: photos.length ? photos : null,
      showInBooking,
      sortOrder,
      ratePlanId: ratePlanId || null,
      discountPercent: normalizedDiscount,
      inheritOtaRanges, otaAdjustmentPercent, otaReferencePlans,
    }),
    onSuccess: async () => {
      toast({ title: `${rt.name} actualizado` });
      setEditing(false);
      const refreshed = await onSave();
      if (refreshed !== false) setPhotoPreviews({});
    },
    onError: (error: Error) => toast({
      title: "Error al guardar",
      description: error.message || "No se pudo guardar la configuración.",
      variant: "destructive",
    }),
  });

  const addAmenity = (a: string) => {
    if (a && !amenities.includes(a)) setAmenities([...amenities, a]);
    setNewAmenity("");
  };

  const addPhoto = () => {
    if (newPhoto.trim() && !photos.includes(newPhoto.trim())) {
      if (photos.length >= 10) {
        setPhotoError("Podés guardar hasta 10 fotos por tipo de habitación.");
        return;
      }
      setPhotos([...photos, newPhoto.trim()]);
      setEditing(true);
      setPhotoError("");
    }
    setNewPhoto("");
  };

  async function fileToBoundedJpeg(file: File): Promise<string> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Formato no admitido. Elegí una imagen JPEG, PNG o WebP.");
    }
    if (file.size > 12 * 1024 * 1024) {
      throw new Error("La imagen original supera el límite de 12 MB.");
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("No se pudo leer la imagen. Probá con otro archivo.");
    }
    try {
      let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No se pudo preparar la imagen en este navegador.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.82, 0.7, 0.58, 0.46]) {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const base64 = dataUrl.split(",")[1] || "";
          const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
          const decodedBytes = Math.floor(base64.length * 3 / 4) - padding;
          if (decodedBytes <= 600 * 1024) return dataUrl;
        }
        scale *= 0.78;
      }
      throw new Error("No se pudo reducir la imagen al límite permitido. Elegí una imagen más pequeña.");
    } finally {
      bitmap.close();
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (photos.length + selected.length > 10) {
      setPhotoError(`Hay ${photos.length} foto${photos.length === 1 ? "" : "s"}. Podés sumar hasta ${10 - photos.length} más.`);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setPhotoError("");
    let uploaded = 0;
    try {
      for (const file of selected) {
        const imageData = await fileToBoundedJpeg(file);
        const response = await apiRequest("POST", `/api/admin/room-types/${rt.id}/booking-photos`, { imageData });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "No se pudo subir la foto.");
        if (!result.url || typeof result.url !== "string") throw new Error("La respuesta de carga no incluyó una URL válida.");
        setPhotos(current => [...current, result.url]);
        setPhotoPreviews(current => ({ ...current, [result.url]: imageData }));
        setEditing(true);
        uploaded += 1;
      }
      toast({ title: uploaded === 1 ? "Foto cargada" : `${uploaded} fotos cargadas`, description: "Guardá la configuración para hacerlas públicas." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar la foto.";
      setPhotoError(message);
      toast({ title: "Error al cargar la foto", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  function save() {
    if (!discountValid) {
      setDiscountError("Ingresá un porcentaje entre 0 y 99,99.");
      return;
    }
    if (!otaAdjustmentValid) {
      toast({ title: "Revisá el ajuste del rango OTA", description: "Usá hasta dos decimales dentro del rango indicado.", variant: "destructive" });
      return;
    }
    setDiscountError("");
    saveMutation.mutate();
  }

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
              onClick={() => editing ? save() : setEditing(true)}
              disabled={saveMutation.isPending || uploading}
              data-testid={`btn-save-roomtype-${rt.id}`}
            >
              {editing ? (
                <><Save className="h-3.5 w-3.5 mr-1" />{saveMutation.isPending ? "Guardando…" : "Guardar"}</>
              ) : (
                <><Edit2 className="h-3.5 w-3.5 mr-1" />Editar</>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-semibold">Tarifa para ventas online</p>
          <p className="mt-1">La tarifa elegida se usa para cotizar este tipo de habitación. El plan tarifario original no se modifica. Se aplican las restricciones compartidas del calendario (disponibilidad y cierres).</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
          <div className="space-y-1.5">
            <Label htmlFor={`booking-rate-plan-${rt.id}`} className="text-xs text-muted-foreground">Plan tarifario online</Label>
            <Select value={ratePlanId || "none"} onValueChange={value => { setRatePlanId(value === "none" ? "" : value); setEditing(true); }}>
              <SelectTrigger id={`booking-rate-plan-${rt.id}`} data-testid={`select-booking-rate-plan-${rt.id}`}>
                <SelectValue placeholder="Seleccionar plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin ventas online</SelectItem>
                {roomRatePlans.map(plan => (
                  <SelectItem key={plan.id} value={plan.id}>{plan.name} · {plan.currency} {plan.baseRate}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roomRatePlans.length === 0 && <p className="text-xs text-muted-foreground">No hay planes tarifarios disponibles para este tipo.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`booking-discount-${rt.id}`} className="text-xs text-muted-foreground">Descuento online (%)</Label>
            <Input
              id={`booking-discount-${rt.id}`}
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              inputMode="decimal"
              value={discountPercent}
              aria-invalid={!!discountError}
              aria-describedby={discountError ? `booking-discount-error-${rt.id}` : undefined}
              onChange={event => {
                setDiscountPercent(event.target.value);
                setDiscountError("");
                setEditing(true);
              }}
              className="h-9"
              data-testid={`input-booking-discount-${rt.id}`}
            />
            {discountError && <p id={`booking-discount-error-${rt.id}`} role="alert" className="text-xs text-destructive">{discountError}</p>}
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox id={`booking-ota-ranges-${rt.id}`} checked={inheritOtaRanges} onCheckedChange={value => { setInheritOtaRanges(value === true); setEditing(true); }} data-testid={`checkbox-booking-ota-ranges-${rt.id}`} />
            <Label htmlFor={`booking-ota-ranges-${rt.id}`} className="leading-5">Usar rangos tarifarios cargados desde OTAs</Label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label htmlFor={`booking-ota-direction-${rt.id}`} className="text-xs">Ajuste del motor sobre el rango OTA</Label>
              <select id={`booking-ota-direction-${rt.id}`} className="flex h-9 rounded-md border bg-background px-3 text-sm" value={otaDirection} disabled={!inheritOtaRanges} onChange={event => { setOtaDirection(event.target.value); setEditing(true); }}>
                <option value="decrease">Bajar</option><option value="increase">Subir</option>
              </select>
            </div>
            <div className="w-28 space-y-1"><Label htmlFor={`booking-ota-adjustment-${rt.id}`} className="text-xs">Porcentaje (%)</Label>
              <Input id={`booking-ota-adjustment-${rt.id}`} type="number" min="0" max={otaDirection === "decrease" ? "99.99" : "1000"} step="0.01" value={otaMagnitude} disabled={!inheritOtaRanges} aria-invalid={!otaAdjustmentValid} onChange={event => { setOtaMagnitude(event.target.value); setEditing(true); }} data-testid={`input-booking-ota-adjustment-${rt.id}`} />
            </div>
          </div>
          {!otaAdjustmentValid && <p role="alert" className="text-xs text-destructive">Usá hasta dos decimales: baja máxima 99,99 % y aumento máximo 1000 %.</p>}
          <p className="text-xs text-muted-foreground">Se heredan los rangos guardados desde el calendario de OTAs, sin tomar su tarifa base ni las copias automáticas. Con la casilla marcada, el rango OTA usa sólo este ajuste. Fuera de esos rangos se conserva el plan y descuento online elegidos arriba. La moneda sigue siendo la del plan del motor; si difiere de la de OTAs, se usa su cotización configurada.</p>
        </div>
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium">Habitaciones incluidas desde OTAs</p>
          {!rt.bookingOtaVariants?.length && <p className="text-xs text-muted-foreground">Esta categoría no tiene habitaciones compartidas verificables. Revisá la conexión y la selección de OTAs.</p>}
          {rt.bookingOtaVariants?.map(variant => <div key={variant.id} className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0">
            <details><summary className="cursor-pointer text-sm">{variant.name} · {variant.roomNumbers.length} habitación(es)</summary><p className="mt-1 text-xs text-muted-foreground">{variant.roomNumbers.join(", ")}</p></details>
            {variant.plans.length > 1 || (variant.error && variant.plans.length > 0) ? <label className="block text-xs">Plan de referencia de OTAs · {variant.name}
              <select aria-label={`Plan de referencia de OTAs ${variant.name}`} className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm" value={otaReferencePlans[variant.id] || variant.planId || ""} onChange={event => { setOtaReferencePlans(current => ({ ...current, [variant.id]: event.target.value })); setEditing(true); }}>
                <option value="" disabled>Seleccionar plan</option>{variant.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {plan.currency}</option>)}
              </select></label> : variant.planName ? <p className="text-xs text-muted-foreground">Referencia: {variant.planName} · {variant.plans[0]?.currency}</p> : null}
            {variant.error && <p className="text-xs text-amber-700">{variant.error}</p>}
          </div>)}
        </div>
        {!ratePlanId && <p className="text-xs text-amber-700 dark:text-amber-300">Sin plan seleccionado, esta habitación no se ofrecerá para venta online.</p>}
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
          <Label className="text-xs text-muted-foreground">Fotos de la habitación</Label>
          <p className="text-xs text-muted-foreground">La primera foto será la principal. Las fotos nuevas quedan públicas al guardar.</p>
          <div className="space-y-1">
            {photos.map((url, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1">
                <img src={photoPreviews[url] || url} alt="" className="h-8 w-12 object-cover rounded" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className="text-xs font-medium">{i === 0 ? "Principal" : `Foto ${i + 1}`}</span>
                <span className="text-xs text-muted-foreground flex-1 truncate">{url}</span>
                {i > 0 && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Hacer foto ${i + 1} principal`} title="Hacer principal" onClick={() => {
                  setPhotos(current => [current[i], ...current.filter((_, index) => index !== i)]);
                  setEditing(true);
                }}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>}
                <button onClick={() => { setPhotos(photos.filter((_, j) => j !== i)); setEditing(true); }}
                  type="button" aria-label={`Quitar foto ${i + 1}`} className="hover:text-destructive shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              aria-label="Seleccionar fotos JPEG, PNG o WebP"
              onChange={event => uploadPhotos(event.target.files)}
              disabled={uploading || photos.length >= 10}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => uploadInputRef.current?.click()} disabled={uploading || photos.length >= 10}>
              <Upload className="h-3.5 w-3.5 mr-1" />{uploading ? "Subiendo..." : "Subir fotos"}
            </Button>
            <span className="text-xs text-muted-foreground">JPEG, PNG o WebP · máximo 10 fotos · 12 MB por archivo</span>
            {uploading && <span role="status" className="text-xs text-muted-foreground">Preparando y subiendo imágenes…</span>}
          </div>
          {photoError && <p role="alert" className="text-xs text-destructive">{photoError}</p>}
          <div className="flex gap-2">
            <Input
              value={newPhoto}
              onChange={e => setNewPhoto(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addPhoto()}
              placeholder="https://... URL de imagen"
              className="h-8 text-sm"
              data-testid={`input-photo-${rt.id}`}
              disabled={uploading || photos.length >= 10}
            />
            <Button type="button" size="sm" variant="outline" onClick={addPhoto} disabled={uploading || photos.length >= 10}><Plus className="h-3.5 w-3.5" /></Button>
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

  const {
    data: bookingConfig,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BookingConfigResponse>({
    queryKey: ["/api/admin/booking-engine/config"],
    queryFn: async () => {
      const response = await fetch("/api/admin/booking-engine/config", { credentials: "include" });
      if (!response.ok) {
        let message = "No se pudo cargar la configuración del motor.";
        try {
          const body = await response.json();
          if (body.error) message = body.error;
        } catch { /* Keep the actionable default message. */ }
        throw new Error(message);
      }
      return response.json();
    },
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
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/administration">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Administración
          </Button>
        </Link>
        <div className="order-first min-w-0 flex-1 basis-full sm:order-none sm:basis-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6 shrink-0 text-blue-500" />
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
      {bookingConfig?.salesEnabled !== true && (
        <Card role="status" className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold">Ventas online deshabilitadas — pendientes de autorización</p>
            <p>Podés preparar planes, descuentos y fotos. Guardar esta configuración no habilita las reservas públicas ni modifica las conexiones OTA.</p>
          </CardContent>
        </Card>
      )}
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
          {bookingConfig?.otaSource && <BookingOtaSourcePanel key={`${bookingConfig.otaSource.configuredConnectionId || "auto"}:${bookingConfig.otaSource.connectionId || "none"}`} source={bookingConfig.otaSource} onSaved={async () => { const result = await refetch(); return !result.isError; }} />}
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configurar Habitaciones
            </h2>
            {isLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : isError ? (
              <Card role="alert">
                <CardContent className="flex flex-col items-start gap-3 py-6">
                  <p className="text-sm text-destructive">{(error as Error)?.message || "No se pudo cargar la configuración."}</p>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
                </CardContent>
              </Card>
            ) : !bookingConfig?.roomTypes?.length ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No hay tipos de habitación configurados.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {bookingConfig.roomTypes.map(rt => (
                  <RoomTypeEditor
                    key={`${rt.id}:${bookingConfig.otaSource?.connectionId || "none"}`}
                    rt={rt}
                    ratePlans={bookingConfig.ratePlans || []}
                    onSave={async () => {
                      const result = await refetch();
                      return !result.isError;
                    }}
                  />
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
