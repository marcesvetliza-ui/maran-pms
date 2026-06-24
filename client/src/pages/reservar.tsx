import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays, Users, ChevronRight, ChevronLeft, Check,
  Wifi, Coffee, Snowflake, Tv, Bath, Car, Star,
  BedDouble, MapPin, Phone, Mail, AlertCircle,
  CheckCircle2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ─── Brand tokens ──────────────────────────────────────────────── */
const BRAND   = "#822638";      // primary burgundy
const CREAM   = "#FEF4EB";      // secondary cream
const BRAND20 = "#82263820";    // 12 % opacity for rings / borders

/* Reusable button style: solid by default, outline on hover */
const btnBrand =
  "bg-[#822638] text-white border border-[#822638] " +
  "hover:bg-transparent hover:text-[#822638] " +
  "transition-colors font-['Montserrat']";

const btnOutlineBrand =
  "bg-transparent text-[#822638] border border-[#822638] " +
  "hover:bg-[#822638] hover:text-white " +
  "transition-colors font-['Montserrat']";

/* ─── Types ────────────────────────────────────────────────────── */
type HotelInfo = {
  name: string; tagline: string; phone: string; email: string;
  address: string; checkInTime: string; checkOutTime: string;
  currency: string; logoUrl: string; heroImageUrl: string;
  primaryColor: string;
};

type RoomTypeResult = {
  roomTypeId: string; code: string; name: string; description: string | null;
  publicDescription: string | null; baseOccupancy: number; maxOccupancy: number;
  amenities: string[]; photos: string[]; availableRooms: number;
  ratePlanId: string; ratePlanName: string; pricePerNight: number;
  totalPrice: number; nights: number; currency: string;
  cancellationPolicy: string | null;
};

type AvailabilityResponse = {
  checkIn: string; checkOut: string; adults: number; nights: number;
  results: RoomTypeResult[];
};

/* ─── Helpers ───────────────────────────────────────────────────── */
const fmt = (n: number, currency = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return format(new Date(y, m - 1, d), "d 'de' MMMM yyyy", { locale: es });
};

const today    = () => format(new Date(), "yyyy-MM-dd");
const tomorrow = () => format(addDays(new Date(), 1), "yyyy-MM-dd");

const AMENITY_ICONS: Record<string, any> = {
  wifi: Wifi, desayuno: Coffee, cafe: Coffee, aire: Snowflake,
  tv: Tv, baño: Bath, estacionamiento: Car, parking: Car,
};

function AmenityIcon({ label }: { label: string }) {
  const key = Object.keys(AMENITY_ICONS).find(k => label.toLowerCase().includes(k));
  const Icon = key ? AMENITY_ICONS[key] : Star;
  return <Icon className="h-3.5 w-3.5" />;
}

/* ─── Step Indicator ────────────────────────────────────────────── */
function StepIndicator({ step, total }: { step: number; total: number }) {
  const steps = ["Fechas", "Habitación", "Tus datos", "Confirmación"];
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {steps.slice(0, total).map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all"
            style={{
              background: i < step ? "#22c55e" : i === step ? BRAND : "#e5e7eb",
              color:      i < step || i === step ? "white" : "#6b7280",
            }}
          >
            {i < step ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <span
            className="hidden sm:block text-xs font-semibold font-['Montserrat']"
            style={{ color: i === step ? BRAND : i < step ? "#22c55e" : "#9ca3af" }}
          >
            {label}
          </span>
          {i < total - 1 && (
            <div className="w-6 h-0.5" style={{ background: i < step ? "#22c55e" : "#e5e7eb" }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Room Type Card ─────────────────────────────────────────────── */
function RoomCard({ rt, selected, onSelect }: { rt: RoomTypeResult; selected: boolean; onSelect: () => void }) {
  const [imgIdx, setImgIdx] = useState(0);
  const photos = rt.photos?.length
    ? rt.photos
    : ["https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80"];

  return (
    <Card
      onClick={onSelect}
      className="cursor-pointer transition-all overflow-hidden hover:shadow-lg"
      style={selected ? { outline: `2px solid ${BRAND}`, boxShadow: `0 0 0 2px ${BRAND}` } : {}}
      data-testid={`card-room-type-${rt.roomTypeId}`}
    >
      {/* Photo */}
      <div className="relative h-44 bg-gray-100 overflow-hidden">
        <img
          src={photos[imgIdx]}
          alt={rt.name}
          className="w-full h-full object-cover transition-transform hover:scale-105 duration-500"
          onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80"; }}
        />
        {photos.length > 1 && (
          <div className="absolute bottom-2 right-2 flex gap-1">
            {photos.map((_, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); setImgIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === imgIdx ? "bg-white scale-125" : "bg-white/60"}`} />
            ))}
          </div>
        )}
        {selected && (
          <div className="absolute top-2 right-2 rounded-full p-1" style={{ background: BRAND }}>
            <Check className="h-4 w-4 text-white" />
          </div>
        )}
        <Badge className="absolute top-2 left-2 bg-black/60 text-white border-0 text-xs">
          {rt.availableRooms} disponible{rt.availableRooms !== 1 ? "s" : ""}
        </Badge>
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 font-['Playfair_Display']">{rt.name}</h3>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 font-['Montserrat']">
              <Users className="h-3 w-3" /> Hasta {rt.maxOccupancy} persona{rt.maxOccupancy !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold font-['Playfair_Display']" style={{ color: BRAND }}>
              {fmt(rt.pricePerNight, rt.currency)}
            </p>
            <p className="text-xs text-gray-400 font-['Montserrat']">por noche</p>
          </div>
        </div>

        {(rt.publicDescription || rt.description) && (
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 font-['Montserrat']">
            {rt.publicDescription || rt.description}
          </p>
        )}

        {rt.amenities?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rt.amenities.map((a, i) => (
              <span key={i} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-['Montserrat']"
                style={{ background: CREAM, color: BRAND }}>
                <AmenityIcon label={a} />{a}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
          <div className="text-xs text-gray-500 font-['Montserrat']">
            Total {rt.nights} noche{rt.nights !== 1 ? "s" : ""}:
            <span className="font-bold text-gray-800 dark:text-gray-200 ml-1">{fmt(rt.totalPrice, rt.currency)}</span>
          </div>
          <button
            className="text-xs px-3 py-1 rounded-md border transition-colors font-['Montserrat'] font-semibold"
            style={selected
              ? { background: BRAND, color: "white", borderColor: BRAND }
              : { background: "transparent", color: BRAND, borderColor: BRAND }}
          >
            {selected ? "Seleccionada" : "Elegir"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function ReservarPage() {
  const [step, setStep] = useState(0);

  const [checkIn,  setCheckIn]  = useState(today());
  const [checkOut, setCheckOut] = useState(tomorrow());
  const [adults,   setAdults]   = useState(2);
  const [children, setChildren] = useState(0);
  const [childrenAges, setChildrenAges] = useState<number[]>([]);

  function handleChildrenChange(count: number) {
    setChildren(count);
    setChildrenAges(prev => {
      if (count > prev.length) return [...prev, ...Array(count - prev.length).fill(5)];
      return prev.slice(0, count);
    });
  }

  const totalGuests  = adults + children;
  const guestSummary = children > 0
    ? `${adults} adulto${adults !== 1 ? "s" : ""}, ${children} niño${children !== 1 ? "s" : ""}`
    : `${adults} adulto${adults !== 1 ? "s" : ""}`;

  const [selectedRoomType, setSelectedRoomType] = useState<RoomTypeResult | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [docType,   setDocType]   = useState("DNI");
  const [docNum,    setDocNum]    = useState("");
  const [notes,     setNotes]     = useState("");

  const [confirmationData, setConfirmationData] = useState<any>(null);

  const { data: hotelInfo } = useQuery<HotelInfo>({
    queryKey: ["/api/public/booking/hotel-info"],
    queryFn: () => fetch("/api/public/booking/hotel-info").then(r => r.json()),
  });

  const { data: availability, isLoading: loadingAvail, refetch: refetchAvail, isError: availError } =
    useQuery<AvailabilityResponse>({
      queryKey: ["/api/public/booking/availability", checkIn, checkOut, totalGuests],
      queryFn: () => fetch(
        `/api/public/booking/availability?checkIn=${checkIn}&checkOut=${checkOut}&adults=${totalGuests}`
      ).then(r => r.json()),
      enabled: false,
    });

  const confirmMutation = useMutation({
    mutationFn: (body: any) =>
      fetch("/api/public/booking/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error al confirmar");
        return data;
      }),
    onSuccess: (data) => { setConfirmationData(data); setStep(3); },
  });

  const nights = Math.max(1, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  ));

  function handleStep0Submit() {
    if (checkOut <= checkIn) { alert("La fecha de salida debe ser posterior a la de entrada"); return; }
    refetchAvail();
    setStep(1);
    setSelectedRoomType(null);
  }

  function handleStep2Submit() {
    if (!firstName || !lastName || !email || !selectedRoomType) return;
    confirmMutation.mutate({
      checkIn, checkOut, adults, children, childrenAges,
      roomTypeId: selectedRoomType.roomTypeId,
      ratePlanId: selectedRoomType.ratePlanId,
      firstName, lastName, email, phone,
      documentType: docType, documentNumber: docNum,
      notes, paymentMethod: "hotel",
    });
  }

  /* ── Back link helper ─────────────────────────────────────────── */
  const BackLink = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      className="text-sm flex items-center gap-1 hover:underline font-['Montserrat']"
      style={{ color: BRAND }}
    >
      <ChevronLeft className="h-4 w-4" /> {label}
    </button>
  );

  /* ── Nights badge ─────────────────────────────────────────────── */
  const NightsBadge = () => checkIn && checkOut && checkOut > checkIn ? (
    <div className="text-center text-sm font-semibold font-['Montserrat']" style={{ color: BRAND }}>
      {nights} noche{nights !== 1 ? "s" : ""}
    </div>
  ) : null;

  /* ─── Step 0: Dates & Guests ─────────────────────────────────── */
  if (step === 0) return (
    <PublicLayout hotelInfo={hotelInfo}>
      <StepIndicator step={0} total={4} />
      <div className="max-w-lg mx-auto space-y-5 px-4 pb-10">
        <h2 className="text-xl font-bold text-center font-['Playfair_Display']" style={{ color: BRAND }}>
          ¿Cuándo venís?
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium font-['Montserrat']">Check-in</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input type="date" value={checkIn} min={today()} onChange={e => setCheckIn(e.target.value)}
                className="pl-9 font-['Montserrat']" data-testid="input-checkin" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium font-['Montserrat']">Check-out</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input type="date" value={checkOut} min={checkIn} onChange={e => setCheckOut(e.target.value)}
                className="pl-9 font-['Montserrat']" data-testid="input-checkout" />
            </div>
          </div>
        </div>

        <NightsBadge />

        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2 font-['Montserrat']">
            <Users className="h-4 w-4" />Huéspedes
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 font-['Montserrat']">Adultos</Label>
              <Select value={String(adults)} onValueChange={v => setAdults(parseInt(v))}>
                <SelectTrigger data-testid="select-adults" className="font-['Montserrat']">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} adulto{n !== 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 font-['Montserrat']">Niños (hasta 12 años)</Label>
              <Select value={String(children)} onValueChange={v => handleChildrenChange(parseInt(v))}>
                <SelectTrigger data-testid="select-children" className="font-['Montserrat']">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4].map(n => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 0 ? "Sin niños" : `${n} niño${n !== 1 ? "s" : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {children > 0 && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: CREAM }}>
              <p className="text-xs font-medium font-['Montserrat']" style={{ color: BRAND }}>Edad de los niños</p>
              <div className="grid grid-cols-2 gap-2">
                {childrenAges.map((age, idx) => (
                  <div key={idx} className="space-y-1">
                    <Label className="text-xs text-gray-500 font-['Montserrat']">Niño {idx + 1}</Label>
                    <Select value={String(age)} onValueChange={v => {
                      const updated = [...childrenAges]; updated[idx] = parseInt(v); setChildrenAges(updated);
                    }}>
                      <SelectTrigger data-testid={`select-child-age-${idx}`} className="font-['Montserrat']">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 13 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {i === 0 ? "Menos de 1 año" : `${i} año${i !== 1 ? "s" : ""}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {hotelInfo && (
          <div className="rounded-xl p-3 text-xs space-y-1 font-['Montserrat']"
            style={{ background: CREAM, color: BRAND }}>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5" />
              Check-in desde las {hotelInfo.checkInTime} hs · Check-out hasta las {hotelInfo.checkOutTime} hs
            </div>
            {hotelInfo.address && (
              <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{hotelInfo.address}</div>
            )}
          </div>
        )}

        <button
          onClick={handleStep0Submit}
          className={`w-full h-12 text-base font-semibold rounded-md ${btnBrand}`}
          data-testid="btn-buscar-habitaciones"
        >
          Ver habitaciones disponibles <ChevronRight className="inline ml-1 h-5 w-5" />
        </button>
      </div>
    </PublicLayout>
  );

  /* ─── Step 1: Room selection ─────────────────────────────────── */
  if (step === 1) return (
    <PublicLayout hotelInfo={hotelInfo}>
      <StepIndicator step={1} total={4} />
      <div className="max-w-2xl mx-auto px-4 pb-10">
        <div className="flex items-center justify-between mb-4">
          <BackLink onClick={() => setStep(0)} label="Cambiar fechas" />
          <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full font-['Montserrat']">
            {fmtDate(checkIn)} → {fmtDate(checkOut)} · {guestSummary}
          </div>
        </div>

        {loadingAvail ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND }} />
            <p className="text-sm text-gray-500 font-['Montserrat']">Consultando disponibilidad...</p>
          </div>
        ) : availError || !availability ? (
          <div className="text-center py-12 text-gray-500">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="font-['Montserrat']">Error al consultar disponibilidad. Intentá de nuevo.</p>
            <button onClick={() => refetchAvail()} className={`mt-3 px-4 py-2 rounded-md text-sm ${btnOutlineBrand}`}>
              Reintentar
            </button>
          </div>
        ) : availability.results.length === 0 ? (
          <div className="text-center py-12">
            <BedDouble className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-1 font-['Playfair_Display']">Sin disponibilidad</h3>
            <p className="text-sm text-gray-500 mb-4 font-['Montserrat']">
              No hay habitaciones libres para las fechas y cantidad de personas seleccionadas.
            </p>
            <button onClick={() => setStep(0)} className={`px-4 py-2 rounded-md text-sm ${btnOutlineBrand}`}>
              Cambiar fechas
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 font-['Playfair_Display']">
              {availability.results.length} tipo{availability.results.length !== 1 ? "s" : ""} de habitación disponible
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {availability.results.map(rt => (
                <RoomCard
                  key={rt.roomTypeId}
                  rt={rt}
                  selected={selectedRoomType?.roomTypeId === rt.roomTypeId}
                  onSelect={() => setSelectedRoomType(rt)}
                />
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!selectedRoomType}
              className={`w-full h-12 text-base font-semibold rounded-md ${btnBrand} disabled:opacity-50 disabled:cursor-not-allowed`}
              data-testid="btn-continuar-datos"
            >
              Continuar <ChevronRight className="inline ml-1 h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </PublicLayout>
  );

  /* ─── Step 2: Guest data ─────────────────────────────────────── */
  if (step === 2) return (
    <PublicLayout hotelInfo={hotelInfo}>
      <StepIndicator step={2} total={4} />
      <div className="max-w-lg mx-auto px-4 pb-10">
        <BackLink onClick={() => setStep(1)} label="Volver a habitaciones" />

        {selectedRoomType && (
          <div className="rounded-xl p-3 my-5 text-sm font-['Montserrat']" style={{ background: CREAM }}>
            <div className="font-semibold font-['Playfair_Display']" style={{ color: BRAND }}>
              {selectedRoomType.name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: BRAND }}>
              {fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights} noche{nights !== 1 ? "s" : ""} · {guestSummary}
            </div>
            <div className="font-bold mt-1" style={{ color: BRAND }}>
              Total: {fmt(selectedRoomType.totalPrice, selectedRoomType.currency)}
            </div>
            <div className="text-xs mt-0.5 opacity-70" style={{ color: BRAND }}>
              💳 Pago al momento del check-in
            </div>
          </div>
        )}

        <h2 className="text-xl font-bold mb-4 font-['Playfair_Display']" style={{ color: BRAND }}>
          Tus datos
        </h2>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-['Montserrat']">Nombre *</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre"
                className="font-['Montserrat']" data-testid="input-firstname" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-['Montserrat']">Apellido *</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Apellido"
                className="font-['Montserrat']" data-testid="input-lastname" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm flex items-center gap-1 font-['Montserrat']">
              <Mail className="h-3.5 w-3.5" />Email *
            </Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com" className="font-['Montserrat']" data-testid="input-email" />
          </div>

          <div className="space-y-1">
            <Label className="text-sm flex items-center gap-1 font-['Montserrat']">
              <Phone className="h-3.5 w-3.5" />Teléfono
            </Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+54 9 11 ..." className="font-['Montserrat']" data-testid="input-phone" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-sm font-['Montserrat']">Documento</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="font-['Montserrat']"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DNI">DNI</SelectItem>
                  <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                  <SelectItem value="CUIT">CUIT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-sm font-['Montserrat']">Número</Label>
              <Input value={docNum} onChange={e => setDocNum(e.target.value)}
                placeholder="12345678" className="font-['Montserrat']" data-testid="input-docnum" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-['Montserrat']">Comentarios o pedidos especiales</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Pedido de cuna, llegada tarde, etc."
              className="resize-none h-20 font-['Montserrat']" data-testid="input-notes" />
          </div>
        </div>

        {confirmMutation.isError && (
          <div className="mt-3 bg-red-50 dark:bg-red-950/40 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2 font-['Montserrat']">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {(confirmMutation.error as Error)?.message}
          </div>
        )}

        <button
          onClick={handleStep2Submit}
          disabled={!firstName || !lastName || !email || confirmMutation.isPending}
          className={`w-full h-12 text-base font-semibold rounded-md mt-5 ${btnBrand} disabled:opacity-50 disabled:cursor-not-allowed`}
          data-testid="btn-confirmar-reserva"
        >
          {confirmMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />Confirmando...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              Confirmar reserva <CheckCircle2 className="h-5 w-5" />
            </span>
          )}
        </button>
      </div>
    </PublicLayout>
  );

  /* ─── Step 3: Confirmation ───────────────────────────────────── */
  return (
    <PublicLayout hotelInfo={hotelInfo}>
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold font-['Playfair_Display']" style={{ color: BRAND }}>
            ¡Reserva confirmada!
          </h2>
          <p className="text-gray-500 mt-1 text-sm font-['Montserrat']">{confirmationData?.message}</p>
        </div>

        {confirmationData && (
          <Card className="mb-6">
            <CardContent className="p-5 space-y-3">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-['Montserrat']">Código de reserva</p>
                <p className="text-3xl font-mono font-bold mt-1" style={{ color: BRAND }}>
                  {confirmationData.reservationCode}
                </p>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2 text-sm font-['Montserrat']">
                <div className="flex justify-between">
                  <span className="text-gray-500">Huésped</span>
                  <span className="font-medium">{confirmationData.guestName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Check-in</span>
                  <span className="font-medium">{fmtDate(confirmationData.checkIn)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Check-out</span>
                  <span className="font-medium">{fmtDate(confirmationData.checkOut)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Noches</span>
                  <span className="font-medium">{confirmationData.nights}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
                  <span className="text-gray-500">Total a abonar</span>
                  <span className="font-bold" style={{ color: BRAND }}>{fmt(confirmationData.totalAmount)}</span>
                </div>
                <div className="text-xs text-center text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                  💳 El pago se realiza al momento del check-in en el hotel
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {hotelInfo?.phone && (
          <div className="text-center text-sm text-gray-500 space-y-1 font-['Montserrat']">
            <p>¿Preguntas? Contactanos</p>
            <div className="flex items-center justify-center gap-4">
              <a href={`tel:${hotelInfo.phone}`} className="flex items-center gap-1 hover:underline" style={{ color: BRAND }}>
                <Phone className="h-3.5 w-3.5" />{hotelInfo.phone}
              </a>
              {hotelInfo.email && (
                <a href={`mailto:${hotelInfo.email}`} className="flex items-center gap-1 hover:underline" style={{ color: BRAND }}>
                  <Mail className="h-3.5 w-3.5" />{hotelInfo.email}
                </a>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => { setStep(0); setConfirmationData(null); }}
          className={`w-full h-10 mt-6 rounded-md text-sm font-semibold ${btnOutlineBrand}`}
          data-testid="btn-nueva-reserva"
        >
          Hacer otra reserva
        </button>
      </div>
    </PublicLayout>
  );
}

/* ─── Layout wrapper ─────────────────────────────────────────────── */
function PublicLayout({ hotelInfo, children }: {
  hotelInfo?: HotelInfo; children: React.ReactNode;
}) {

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-['Montserrat']">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b shadow-sm" style={{ borderColor: CREAM }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <img
            src="/wp-content/uploads/2022/12/Logo-Maran-Color.svg"
            alt={hotelInfo?.name || "Maran Suites & Towers"}
            style={{ height: 30, width: "auto" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logo-maran.png"; }}
          />
          <div className="text-xs text-gray-500 font-['Montserrat']">{hotelInfo?.tagline}</div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto py-4">
        {children}
      </div>
    </div>
  );
}
