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
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CalendarDays,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

const STEPS = [
  { num: 1, label: "Tus datos", icon: User },
  { num: 2, label: "Documento", icon: FileText },
  { num: 3, label: "Llegada", icon: Clock },
  { num: 4, label: "Confirmación", icon: CheckCircle2 },
];

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentType, setDocumentType] = useState("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [nationality, setNationality] = useState("Argentina");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [documentPhoto, setDocumentPhoto] = useState<string | null>(null);
  const [arrivalTime, setArrivalTime] = useState("");
  const [requestEarlyCheckIn, setRequestEarlyCheckIn] = useState(false);
  const [earlyCheckInTime, setEarlyCheckInTime] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (data) {
      const wc = data.webCheckin;
      const g = data.guest;
      // Priority: confirmed data from previous submission > guest profile from DB
      setFirstName(wc?.confirmedFirstName || g?.firstName || "");
      setLastName(wc?.confirmedLastName || g?.lastName || "");
      setDocumentType(wc?.confirmedDocumentType || g?.documentType || "DNI");
      setDocumentNumber(wc?.confirmedDocumentNumber || g?.documentNumber || "");
      setNationality(wc?.confirmedNationality || g?.nationality || "Argentina");
      setPhone(wc?.confirmedPhone || g?.phone || "");
      setEmail(wc?.confirmedEmail || g?.email || "");
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
          estimatedArrivalTime: arrivalTime,
          requestEarlyCheckIn,
          earlyCheckInTime: requestEarlyCheckIn ? arrivalTime : null,
          termsAccepted,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al enviar");
      }
      return res.json();
    },
    onSuccess: () => {
      setStep(4);
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

  const canGoNext = (s: number) => {
    if (s === 1) return firstName.trim() && lastName.trim() && documentNumber.trim();
    if (s === 2) return true;
    if (s === 3) return termsAccepted;
    return false;
  };

  const handleNext = () => {
    if (step === 3) {
      submitMutation.mutate();
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Hotel className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg">{hotel?.name || "Maran Suites & Towers"}</h1>
            <p className="text-xs text-muted-foreground">Web Check-in</p>
          </div>
        </div>
      </header>

      {reservation && (
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground bg-white dark:bg-gray-900 rounded-lg p-3 border">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              <span>
                {(() => {
                  try { return format(parseISO(reservation.checkInDate), "dd/MM/yyyy"); } catch { return reservation.checkInDate; }
                })()} → {(() => {
                  try { return format(parseISO(reservation.checkOutDate), "dd/MM/yyyy"); } catch { return reservation.checkOutDate; }
                })()}
              </span>
            </div>
            <span className="text-muted-foreground/50">|</span>
            <span>{reservation.roomType}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>{reservation.nights} noche(s)</span>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 mt-6 mb-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className={`flex items-center gap-1.5 ${step >= s.num ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  step > s.num ? "bg-primary text-primary-foreground" :
                  step === s.num ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
                </div>
                <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 sm:w-12 h-0.5 mx-1 ${step > s.num ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-24">
        {step === 1 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold">Datos personales</h2>
              <p className="text-sm text-muted-foreground">Por favor, confirmá o completá tus datos.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Nombre *</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-wc-firstname" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Apellido *</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-wc-lastname" />
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
                  <Input id="docNumber" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} data-testid="input-wc-docnumber" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nationality">Nacionalidad</Label>
                <Input id="nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} data-testid="input-wc-nationality" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-wc-phone" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-wc-email" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold">Foto del documento</h2>
              <p className="text-sm text-muted-foreground">Tomá una foto del frente de tu documento de identidad. Este paso es opcional.</p>
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
                    onClick={() => {
                      setDocumentPhoto(null);
                      fileInputRef.current?.click();
                    }}
                    data-testid="button-retake-photo"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Tomar otra foto
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    className="h-32 border-dashed flex flex-col gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-take-photo"
                  >
                    <Camera className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Tomar foto o seleccionar imagen</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold">Detalles de llegada</h2>
              <div className="space-y-1.5">
                <Label htmlFor="arrivalTime">Hora estimada de llegada</Label>
                <Input
                  id="arrivalTime"
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  data-testid="input-wc-arrival-time"
                />
              </div>
              <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                <Checkbox
                  id="earlyCheckin"
                  checked={requestEarlyCheckIn}
                  onCheckedChange={(c) => setRequestEarlyCheckIn(!!c)}
                  data-testid="checkbox-early-checkin"
                />
                <Label htmlFor="earlyCheckin" className="text-sm cursor-pointer">
                  Solicitar early check-in (antes de las 15:00)
                </Label>
              </div>
              {requestEarlyCheckIn && (
                <p className="text-xs text-muted-foreground px-1">El early check-in está sujeto a disponibilidad y puede tener cargo adicional.</p>
              )}
              <div className="border-t pt-4 mt-4">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(c) => setTermsAccepted(!!c)}
                    data-testid="checkbox-terms"
                  />
                  <Label htmlFor="terms" className="text-sm cursor-pointer leading-relaxed">
                    Acepto los términos y condiciones del hotel, incluyendo la política de cancelación y el reglamento interno.
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardContent className="p-5 text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <h2 className="text-2xl font-bold">¡Listo!</h2>
              <p className="text-muted-foreground">
                Tu web check-in ha sido completado exitosamente. Cuando llegues al hotel, solo tenés que acercarte a recepción para retirar tu llave.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{firstName} {lastName}</span>
                </div>
                {arrivalTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Llegada estimada: {arrivalTime}</span>
                  </div>
                )}
                {requestEarlyCheckIn && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span>Early check-in solicitado{earlyCheckInTime ? `: ${earlyCheckInTime}` : ""}</span>
                  </div>
                )}
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
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {step < 4 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t p-4 safe-area-inset-bottom">
          <div className="max-w-lg mx-auto flex gap-3">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
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
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : step === 3 ? (
                "Confirmar Check-in"
              ) : (
                <>
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
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