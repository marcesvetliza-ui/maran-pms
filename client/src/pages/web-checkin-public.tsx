import { useState, useRef, useCallback, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Hotel,
  User,
  FileText,
  Clock,
  CheckCircle2,
  Camera,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CalendarDays,
  Phone,
  Mail,
  MapPin,
  Users,
  Plus,
  Trash2,
  ScrollText,
  PenLine,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const STEPS = [
  { num: 1, label: "Tus datos",     icon: User },
  { num: 2, label: "Documento",     icon: FileText },
  { num: 3, label: "Acompañantes",  icon: Users },
  { num: 4, label: "Firma",         icon: PenLine },
  { num: 5, label: "Llegada",       icon: Clock },
  { num: 6, label: "Confirmación",  icon: CheckCircle2 },
];

type Companion = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  nationality: string;
};

const emptyCompanion = (): Companion => ({
  firstName: "",
  lastName: "",
  documentType: "DNI",
  documentNumber: "",
  nationality: "Argentina",
});

const TERMS_TEXT = `TÉRMINOS Y CONDICIONES — MARAN SUITES & TOWERS

1. HORARIOS
   • Check-in: desde las 15:00 hs.
   • Check-out: hasta las 11:00 hs.
   • Early check-in y late check-out sujetos a disponibilidad y pueden tener cargo adicional.

2. POLÍTICA DE CANCELACIÓN
   • Cancelaciones con más de 48 hs. de antelación: sin cargo.
   • Cancelaciones con menos de 48 hs.: se cobra la primera noche.
   • No show: se cobra el 100 % de la reserva.

3. REGLAMENTO INTERNO
   • No se permiten visitas externas en las habitaciones fuera del horario de recepción.
   • Está prohibido fumar en habitaciones y áreas comunes.
   • El hotel no se responsabiliza por objetos de valor no depositados en la caja fuerte.
   • El huésped es responsable por daños causados a las instalaciones.
   • Mascotas no admitidas (salvo política especial escrita).

4. DATOS PERSONALES
   Conforme a la Ley 25.326 de Protección de Datos Personales, los datos provistos son utilizados exclusivamente para:
   • Cumplimentar el registro exigido por autoridades de seguridad (Libro de Policía / RENAPER).
   • Gestión interna de la reserva y comunicaciones vinculadas al alojamiento.

5. REGISTRO POLICIAL
   El titular y todos los acompañantes mayores de 16 años quedan registrados en el Libro de Policía del establecimiento, conforme normativa vigente.

6. RESPONSABILIDAD
   El establecimiento no se hace responsable por pérdidas, robos u otros eventos ajenos a su control directo en áreas públicas.

Al confirmar este Pre-Ingreso, el titular declara haber leído y aceptado en su totalidad los presentes términos y condiciones, como así también el reglamento interno del hotel.`;

function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(!!value);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = 160 * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 160);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    const t = setTimeout(initCanvas, 50);
    return () => clearTimeout(t);
  }, [initCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    setIsDrawing(true);
    lastPos.current = pos;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing || !lastPos.current) return;
    const pos = getPos(e);
    if (!pos) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPos.current = null;
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / window.devicePixelRatio, 160);
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className={`border-2 rounded-xl overflow-hidden select-none ${hasDrawn ? "border-primary" : "border-dashed border-muted-foreground/40"} bg-white`}>
        <canvas
          ref={canvasRef}
          className="w-full block touch-none cursor-crosshair"
          style={{ height: 160 }}
          data-testid="canvas-signature"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex justify-between items-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {hasDrawn
            ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Firma registrada</>
            : "Trace su firma con el dedo o el mouse"}
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clear} type="button" data-testid="button-clear-signature">
          <Trash2 className="h-3 w-3 mr-1" />Limpiar
        </Button>
      </div>
    </div>
  );
}

function compressImage(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function WebCheckinPublicPage() {
  const [, params] = useRoute("/web-checkin/:token");
  const token = params?.token || "";

  const [step, setStep] = useState(1);

  // Step 1 — datos titular
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentType, setDocumentType] = useState("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [nationality, setNationality] = useState("Argentina");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Step 2 — foto documento
  const [documentPhoto, setDocumentPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — acompañantes
  const [companions, setCompanions] = useState<Companion[]>([]);

  // Step 4 — firma electrónica (Ley 25.506)
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  // Step 5 — llegada + T&C
  const [arrivalTime, setArrivalTime] = useState("");
  const [requestEarlyCheckIn, setRequestEarlyCheckIn] = useState(false);
  const [earlyCheckInTime, setEarlyCheckInTime] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/public/web-checkin", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/web-checkin/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al cargar");
      }
      return res.json();
    },
    enabled: !!token,
  });

  const normalizeDocType = (raw: string | null | undefined): string => {
    if (!raw) return "DNI";
    const v = raw.trim().toUpperCase();
    if (v === "DNI") return "DNI";
    if (v === "PASSPORT" || v === "PASAPORTE") return "Passport";
    if (v === "CUIT" || v === "CUIL" || v === "CUIT/CUIL") return "CUIT/CUIL";
    if (v === "CI" || v === "CEDULA" || v === "CÉDULA") return "CI";
    return "DNI";
  };

  useEffect(() => {
    if (data) {
      const wc = data.webCheckin;
      const g = data.guest;
      setFirstName(wc?.confirmedFirstName || g?.firstName || "");
      setLastName(wc?.confirmedLastName || g?.lastName || "");
      setDocumentType(normalizeDocType(wc?.confirmedDocumentType || g?.documentType));
      setDocumentNumber(wc?.confirmedDocumentNumber || g?.documentNumber || "");
      setNationality(wc?.confirmedNationality || g?.nationality || "Argentina");
      setPhone(wc?.confirmedPhone || g?.phone || "");
      setEmail(wc?.confirmedEmail || g?.email || "");
      if (data.existingCompanions?.length > 0) {
        setCompanions(data.existingCompanions.map((c: any) => ({
          firstName: c.firstName,
          lastName: c.lastName,
          documentType: normalizeDocType(c.documentType),
          documentNumber: c.documentNumber || "",
          nationality: c.nationality || "Argentina",
        })));
      }
    }
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/web-checkin/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmedFirstName: firstName,
          confirmedLastName: lastName,
          confirmedDocumentType: documentType,
          confirmedDocumentNumber: documentNumber,
          confirmedNationality: nationality,
          confirmedPhone: phone,
          confirmedEmail: email,
          documentPhotoUrl: documentPhoto,
          signatureImage,
          estimatedArrivalTime: arrivalTime,
          requestEarlyCheckIn,
          earlyCheckInTime: requestEarlyCheckIn ? earlyCheckInTime : null,
          termsAccepted,
          companions: companions.filter(c => c.firstName.trim() && c.lastName.trim()),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al enviar");
      }
      return res.json();
    },
    onSuccess: () => {
      setStep(6);
    },
  });

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800);
      setDocumentPhoto(compressed);
    } catch {
      alert("Error al procesar la imagen");
    }
  }, []);

  const addCompanion = () => setCompanions(prev => [...prev, emptyCompanion()]);

  const updateCompanion = (idx: number, field: keyof Companion, value: string) => {
    setCompanions(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeCompanion = (idx: number) => {
    setCompanions(prev => prev.filter((_, i) => i !== idx));
  };

  const canGoNext = (s: number) => {
    if (s === 1) return firstName.trim() && lastName.trim() && documentNumber.trim();
    if (s === 2) return true;
    if (s === 3) return true;
    if (s === 4) return !!signatureImage;
    if (s === 5) return termsAccepted;
    return false;
  };

  const handleNext = () => {
    if (step === 5) {
      submitMutation.mutate();
      return;
    }
    setStep(s => Math.min(s + 1, 6));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">No disponible</h2>
            <p className="text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hotel = data?.hotel;
  const reservation = data?.reservation;
  const totalGuests = reservation?.numberOfGuests || 1;
  const expectedCompanions = Math.max(0, totalGuests - 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Hotel className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg">{hotel?.name || "Maran Suites & Towers"}</h1>
            <p className="text-xs text-muted-foreground">Pre-Ingreso Online</p>
          </div>
        </div>
      </header>

      {reservation && (
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground bg-white dark:bg-gray-900 rounded-lg p-3 border flex-wrap">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              <span>
                {(() => { try { return format(parseISO(reservation.checkInDate), "dd/MM/yyyy"); } catch { return reservation.checkInDate; } })()}
                {" → "}
                {(() => { try { return format(parseISO(reservation.checkOutDate), "dd/MM/yyyy"); } catch { return reservation.checkOutDate; } })()}
              </span>
            </div>
            <span className="text-muted-foreground/50">|</span>
            <span>{reservation.roomType}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>{reservation.nights} noche(s)</span>
            {totalGuests > 1 && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {totalGuests} pasajeros</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="max-w-lg mx-auto px-4 mt-6 mb-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className={`flex items-center gap-1 ${step >= s.num ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  step > s.num ? "bg-primary text-primary-foreground" :
                  step === s.num ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {step > s.num ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
                </div>
                <span className="text-[10px] font-medium hidden sm:inline leading-tight max-w-[52px]">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-5 sm:w-8 h-0.5 mx-0.5 ${step > s.num ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-28">

        {/* ── PASO 1: Datos del titular ── */}
        {step === 1 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-lg font-bold">Datos del titular</h2>
                <p className="text-sm text-muted-foreground">Confirmá o completá tus datos personales.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Nombre *</Label>
                  <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} data-testid="input-wc-firstname" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Apellido *</Label>
                  <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} data-testid="input-wc-lastname" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de Documento</Label>
                  <Select value={documentType} onValueChange={setDocumentType}>
                    <SelectTrigger data-testid="select-wc-doctype">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DNI">DNI</SelectItem>
                      <SelectItem value="Passport">Pasaporte</SelectItem>
                      <SelectItem value="CUIT/CUIL">CUIT/CUIL</SelectItem>
                      <SelectItem value="CI">CI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="docNumber">N° Documento *</Label>
                  <Input id="docNumber" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} data-testid="input-wc-docnumber" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nationality">Nacionalidad</Label>
                <Input id="nationality" value={nationality} onChange={e => setNationality(e.target.value)} data-testid="input-wc-nationality" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-wc-phone" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-wc-email" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── PASO 2: Foto del documento ── */}
        {step === 2 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-lg font-bold">Foto del documento</h2>
                <p className="text-sm text-muted-foreground">Tomá una foto del frente de tu DNI o pasaporte. Opcional pero recomendado para agilizar el check-in.</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
              {documentPhoto ? (
                <div className="space-y-3">
                  <div className="border rounded-lg overflow-hidden">
                    <img src={documentPhoto} alt="Documento" className="w-full h-auto" data-testid="img-document-preview" />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setDocumentPhoto(null); fileInputRef.current?.click(); }}
                    data-testid="button-retake-photo"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Tomar otra foto
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-32 w-full border-dashed flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-take-photo"
                >
                  <Camera className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Tomar foto o seleccionar imagen</span>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── PASO 3: Acompañantes ── */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Acompañantes
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {expectedCompanions > 0
                      ? `La reserva incluye ${totalGuests} pasajeros. Por favor completá los datos de los ${expectedCompanions} acompañante(s).`
                      : "Si viajás con acompañantes, completá sus datos. Esta información es requerida para el Libro de Policía del establecimiento."}
                  </p>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
                  <strong>Requerimiento legal:</strong> Todos los pasajeros alojados deben estar registrados en el Libro de Policía del hotel (normativa vigente). Los datos mínimos son: nombre, apellido, tipo y número de documento, y nacionalidad.
                </div>
              </CardContent>
            </Card>

            {companions.map((comp, idx) => (
              <Card key={idx}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Acompañante {idx + 1}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeCompanion(idx)}
                      data-testid={`button-remove-companion-${idx}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Nombre *</Label>
                      <Input
                        value={comp.firstName}
                        onChange={e => updateCompanion(idx, "firstName", e.target.value)}
                        placeholder="Nombre"
                        data-testid={`input-companion-firstname-${idx}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Apellido *</Label>
                      <Input
                        value={comp.lastName}
                        onChange={e => updateCompanion(idx, "lastName", e.target.value)}
                        placeholder="Apellido"
                        data-testid={`input-companion-lastname-${idx}`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Tipo Documento *</Label>
                      <Select value={comp.documentType} onValueChange={v => updateCompanion(idx, "documentType", v)}>
                        <SelectTrigger data-testid={`select-companion-doctype-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DNI">DNI</SelectItem>
                          <SelectItem value="Passport">Pasaporte</SelectItem>
                          <SelectItem value="CUIT/CUIL">CUIT/CUIL</SelectItem>
                          <SelectItem value="CI">CI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>N° Documento *</Label>
                      <Input
                        value={comp.documentNumber}
                        onChange={e => updateCompanion(idx, "documentNumber", e.target.value)}
                        placeholder="Número"
                        data-testid={`input-companion-docnumber-${idx}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nacionalidad</Label>
                    <Input
                      value={comp.nationality}
                      onChange={e => updateCompanion(idx, "nationality", e.target.value)}
                      placeholder="Argentina"
                      data-testid={`input-companion-nationality-${idx}`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              variant="outline"
              className="w-full"
              onClick={addCompanion}
              data-testid="button-add-companion"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar acompañante
            </Button>

            {companions.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                Podés continuar sin agregar acompañantes y cargar los datos al llegar al hotel.
              </p>
            )}
          </div>
        )}

        {/* ── PASO 4: Firma Electrónica ── */}
        {step === 4 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold">Firma Electrónica</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  De acuerdo a la <strong>Ley 25.506</strong> de Firma Digital de la República Argentina, su firma electrónica tiene plena validez legal.
                  Trace su firma a continuación — quedará adjunta a su reserva de forma permanente.
                </p>
                <SignaturePad value={signatureImage} onChange={setSignatureImage} />
                <p className="text-xs text-muted-foreground text-center border-t pt-3">
                  Al firmar, {firstName} {lastName} confirma que los datos provistos son correctos y verídicos.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── PASO 5: Llegada + T&C ── */}
        {step === 5 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <h2 className="text-lg font-bold">Detalles de llegada</h2>
                <div className="space-y-1.5">
                  <Label htmlFor="arrivalTime">Hora estimada de llegada</Label>
                  <Input
                    id="arrivalTime"
                    type="time"
                    value={arrivalTime}
                    onChange={e => setArrivalTime(e.target.value)}
                    data-testid="input-wc-arrival-time"
                  />
                </div>
                <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                  <Checkbox
                    id="earlyCheckin"
                    checked={requestEarlyCheckIn}
                    onCheckedChange={c => setRequestEarlyCheckIn(!!c)}
                    data-testid="checkbox-early-checkin"
                  />
                  <Label htmlFor="earlyCheckin" className="text-sm cursor-pointer">
                    Solicitar early check-in (antes de las 15:00)
                  </Label>
                </div>
                {requestEarlyCheckIn && (
                  <div className="space-y-1.5">
                    <Label htmlFor="earlyTime">Hora de llegada para early check-in</Label>
                    <Input
                      id="earlyTime"
                      type="time"
                      value={earlyCheckInTime}
                      onChange={e => setEarlyCheckInTime(e.target.value)}
                      data-testid="input-wc-early-time"
                    />
                    <p className="text-xs text-muted-foreground">Sujeto a disponibilidad. Puede tener cargo adicional.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-bold">Términos y Condiciones</h2>
                </div>
                <div
                  className="bg-muted/40 border rounded-lg p-4 h-56 overflow-y-auto text-xs text-muted-foreground leading-relaxed whitespace-pre-line font-mono"
                  data-testid="text-terms-content"
                >
                  {TERMS_TEXT}
                </div>
                <div className="flex items-start space-x-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={c => setTermsAccepted(!!c)}
                    data-testid="checkbox-terms"
                    className="mt-0.5"
                  />
                  <Label htmlFor="terms" className="text-sm cursor-pointer leading-relaxed">
                    He leído y acepto en su totalidad los Términos y Condiciones y el Reglamento Interno del hotel Maran Suites & Towers, incluyendo la política de cancelación y el tratamiento de mis datos personales.
                  </Label>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── PASO 6: Confirmación ── */}
        {step === 6 && (
          <Card>
            <CardContent className="p-5 text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <h2 className="text-2xl font-bold">¡Pre-Ingreso completado!</h2>
              <p className="text-muted-foreground">
                Tus datos fueron registrados correctamente. Al llegar al hotel acercate a recepción para retirar tu llave.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{firstName} {lastName}</span>
                </div>
                {companions.filter(c => c.firstName.trim()).length > 0 && (
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">Acompañantes: </span>
                      {companions.filter(c => c.firstName.trim()).map((c, i) => (
                        <span key={i}>{i > 0 ? ", " : ""}{c.firstName} {c.lastName}</span>
                      ))}
                    </div>
                  </div>
                )}
                {arrivalTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>Llegada estimada: {arrivalTime}</span>
                  </div>
                )}
                {requestEarlyCheckIn && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>Early check-in solicitado{earlyCheckInTime ? `: ${earlyCheckInTime}` : ""}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs">Términos y condiciones aceptados</span>
                </div>
              </div>
              {hotel && (
                <div className="border-t pt-4 text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2 justify-center">
                    <MapPin className="h-4 w-4" />
                    <span>{hotel.address}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center">
                    <Phone className="h-4 w-4" />
                    <span>{hotel.phone}</span>
                  </div>
                  {hotel.email && (
                    <div className="flex items-center gap-2 justify-center">
                      <Mail className="h-4 w-4" />
                      <span>{hotel.email}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Navigation bar */}
      {step < 6 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t p-4">
          <div className="max-w-lg mx-auto flex gap-3">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep(s => s - 1)}
                className="flex-1"
                data-testid="button-wc-back"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canGoNext(step) || submitMutation.isPending}
              className="flex-1"
              data-testid="button-wc-next"
            >
              {submitMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
              ) : step === 5 ? (
                "Confirmar Pre-Ingreso"
              ) : (
                <>Siguiente<ChevronRight className="h-4 w-4 ml-1" /></>
              )}
            </Button>
          </div>
        </div>
      )}

      {submitMutation.isError && (
        <div className="fixed bottom-20 left-0 right-0 px-4">
          <div className="max-w-lg mx-auto bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive text-center">
            {(submitMutation.error as Error).message}
          </div>
        </div>
      )}
    </div>
  );
}
