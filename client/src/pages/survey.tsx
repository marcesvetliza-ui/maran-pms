import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {Checkbox} from '@/components/ui/checkbox';
import { Star, CheckCircle2, AlertTriangle, Hotel } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Star selector
// ─────────────────────────────────────────────────────────────────────────────
function StarSelector({
  label, value, onChange, testId,optional=false,
}: { label: string; value: number; onChange: (v: number) => void; testId: string; optional?:boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-1" data-testid={testId}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} de 5`}
            aria-pressed={value===n}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-0.5 rounded transition-transform hover:scale-110 focus:outline-none"
          >
            <Star
              className={`h-8 w-8 transition-colors ${
                n <= (hover || value)
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/30"
              }`}
            />
          </button>
        ))}
      </div>
      {optional&&<button type="button" className="text-xs underline text-muted-foreground" onClick={()=>onChange(0)}>No utilicé este servicio / No corresponde</button>}
      {value === 0 && <p className="text-xs text-muted-foreground">{optional?'Sin evaluar (opcional)':'Seleccioná una calificación'}</p>}
      {value > 0 && (
        <p className="text-xs text-muted-foreground">
          {["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"][value]}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Format date helper
// ─────────────────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  const [y, m, day] = String(d).split("T")[0].split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main survey page
// ─────────────────────────────────────────────────────────────────────────────
export default function SurveyPage() {
  const [, params] = useRoute("/encuesta/:token");
  const token = params?.token;

  const [ratings, setRatings] = useState({overall:0});
  const [areaRatings,setAreaRatings]=useState<Record<string,number>>({});
  const [nps,setNps]=useState('');
  const [contactRequested,setContactRequested]=useState(false);
  const [comment, setComment] = useState("");
  const [guestName, setGuestName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<any>({
    queryKey: ["/api/survey", token],
    queryFn: async () => {
      const res = await fetch(`/api/survey/${token}`);
      if (!res.ok) {
        const e = await res.json();
        throw { status: res.status, ...e };
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/survey/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratingOverall: ratings.overall,
          areaRatings:Object.fromEntries(Object.entries(areaRatings).filter(([,v])=>v>0)),
          areaQuestions:Object.fromEntries((data?.areas || []).map((a:any)=>[a.key,a.question])),
          nps:nps===''?null:Number(nps),contactRequested,
          comment: comment || null,
          guestName: guestName || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Error"); }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  const canSubmit = ratings.overall > 0;

  // ── Loading ──
  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="animate-pulse text-muted-foreground">Cargando encuesta…</div>
    </div>
  );

  // ── Already completed ──
  if ((error as any)?.completed || submitted) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg">
        <CardContent className="p-8 text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold">¡Gracias por tu opinión!</h1>
          <p className="text-muted-foreground">
            {submitted
              ? "Tus respuestas fueron registradas. Tu feedback nos ayuda a mejorar cada día."
              : "Esta encuesta ya fue completada. ¡Gracias por participar!"}
          </p>
          {data?.googleMapsUrl&&<a href={data.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block underline text-primary">Si querés, también podés compartir tu experiencia en Google</a>}
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">Maran Suites & Towers</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ── Error (not found / expired) ──
  if (error) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg">
        <CardContent className="p-8 text-center space-y-4">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold">Encuesta no disponible</h1>
          <p className="text-muted-foreground">{(error as any)?.error || "No se pudo cargar la encuesta. Reintentá en unos instantes."}</p>
          {![404, 409, 410].includes((error as any)?.status) && (
            <Button variant="outline" onClick={() => refetch()}>Volver a intentar</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Survey form ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-2 pb-2">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Hotel className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Maran Suites & Towers</h1>
          <p className="text-muted-foreground">Contanos cómo fue tu estadía</p>
          {data && (
            <div className="inline-block bg-muted rounded-lg px-4 py-2 text-sm">
              {data.guestName && <span className="font-medium">Hola, {data.guestName.split(" ")[0]}!</span>}
              {data.checkIn && (
                <span className="text-muted-foreground ml-2">
                  {fmtDate(data.checkIn)} → {fmtDate(data.checkOut)}
                  {data.roomNumber && ` · Hab. ${data.roomNumber}`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Form */}
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Tu opinión (menos de 2 minutos)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Overall */}
            <StarSelector
              label="⭐ Calificación general"
              value={ratings.overall}
              onChange={v => setRatings(r => ({ ...r, overall: v }))}
              testId="stars-overall"
            />
            <div className="border-t pt-4 space-y-5">
              {(data?.areas || []).map((a:any)=><StarSelector key={a.key} label={a.question} value={areaRatings[a.key] || 0}
                onChange={v=>setAreaRatings(p=>({...p,[a.key]:v}))} testId={'stars-'+a.key} optional/>)}
            </div>

            <label className="block space-y-2 text-sm">¿Nos recomendarías? (opcional)
              <select aria-label="Recomendación" className="w-full rounded border p-2 bg-background" value={nps} onChange={e=>setNps(e.target.value)}>
                <option value="">Prefiero no responder</option>{Array.from({length:11},(_,n)=><option key={n} value={n}>{n} — {n===0?'Nada probable':n===10?'Muy probable':n}</option>)}
              </select>
            </label>
            <div className="space-y-2">
              <Label>¿Querés dejarnos un comentario? (opcional)</Label>
              <Textarea
                placeholder="Contanos lo que quieras — lo bueno y lo que podríamos mejorar..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                maxLength={5000}
                data-testid="textarea-comment"
              />
            </div>

            <div className="space-y-2">
              <Label>Tu nombre (opcional)</Label>
              <Input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="¿Cómo te llamás?"
                maxLength={160}
                data-testid="input-guest-name"
              />
            </div>

            <label className="flex gap-2 items-start text-sm"><Checkbox checked={contactRequested} onCheckedChange={value=>setContactRequested(value===true)}/>Quiero que el hotel me contacte por este comentario.</label>

            {submitMutation.isError && (
              <p className="text-sm text-red-500">{(submitMutation.error as any)?.message || "Error al enviar"}</p>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit || submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              data-testid="button-submit-survey"
            >
              {submitMutation.isPending ? "Enviando..." : "Enviar mi opinión"}
            </Button>

            {!canSubmit && (
              <p className="text-xs text-center text-muted-foreground">
                Solo la calificación general es obligatoria. Las áreas y la recomendación son opcionales.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Tus respuestas son confidenciales y nos ayudan a mejorar la experiencia para todos nuestros huéspedes.
        </p>
      </div>
    </div>
  );
}
