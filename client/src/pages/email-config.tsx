import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail, Send, CheckCircle2, XCircle, Clock, Star, MessageSquare, Eye,
  RefreshCw, Settings2, BarChart3, AlertTriangle, Zap,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Star rating display
// ─────────────────────────────────────────────────────────────────────────────
function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`h-4 w-4 ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template variables helper
// ─────────────────────────────────────────────────────────────────────────────
const VARS_COMMON = [
  "{nombre_huesped}", "{numero_habitacion}", "{fecha_checkin}", "{fecha_checkout}", "{codigo_reserva}",
];
const VARS_CHECKOUT = [...VARS_COMMON, "{link_encuesta}", "{link_google_maps}"];

function VarChips({ vars }: { vars: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {vars.map(v => (
        <code key={v} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{v}</code>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function EmailConfigPage() {
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: cfg, isLoading } = useQuery<any>({
    queryKey: ["/api/email/config"],
  });
  const { data: stats } = useQuery<any>({
    queryKey: ["/api/email/stats"],
    refetchInterval: 30_000,
  });
  const { data: logs = [], refetch: refetchLogs } = useQuery<any[]>({
    queryKey: ["/api/email/logs"],
  });
  const { data: surveyResponses = [] } = useQuery<any[]>({
    queryKey: ["/api/email/survey-responses"],
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/email/config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/config"] });
      toast({ title: "Configuración guardada" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (to: string) => apiRequest("POST", "/api/email/test", { to }),
    onSuccess: () => toast({ title: "Email de prueba enviado", description: "Revisá tu bandeja de entrada" }),
    onError: (e: any) => toast({ title: "Error al enviar prueba", description: e.message, variant: "destructive" }),
  });

  const reminderMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/run-reminder", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/stats"] });
      toast({ title: "Recordatorios ejecutados", description: `${data.sent} enviados, ${data.skipped} omitidos` });
    },
    onError: () => toast({ title: "Error al ejecutar", variant: "destructive" }),
  });

  const save = (fields: Record<string, any>) => {
    const payload: any = { ...fields };
    if (apiKeyInput.trim()) payload.apiKey = apiKeyInput.trim();
    saveMutation.mutate(payload);
    if (apiKeyInput.trim()) setApiKeyInput("");
  };

  const toggle = (field: string, value: boolean) => save({ [field]: value });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Mail className="h-7 w-7 text-primary" />
          Respuestas Automáticas
        </h1>
        <p className="text-muted-foreground">Emails automáticos a huéspedes: confirmación, recordatorio y post estadía</p>
      </div>

      {/* Global toggle + Stats row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className={`md:col-span-1 border-2 ${cfg?.globalEnabled ? "border-green-400 dark:border-green-700" : "border-dashed"}`}>
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Sistema global</p>
                <p className="text-xs text-muted-foreground">Activar o pausar todos los emails</p>
              </div>
              <Switch
                checked={cfg?.globalEnabled ?? false}
                onCheckedChange={v => toggle("globalEnabled", v)}
                data-testid="switch-global-email"
              />
            </div>
            {cfg?.globalEnabled
              ? <Badge className="w-fit bg-green-500 text-white">Activo</Badge>
              : <Badge variant="outline" className="w-fit">Pausado</Badge>
            }
          </CardContent>
        </Card>
        {[
          { label: "Enviados (30d)", value: stats?.sent ?? 0, icon: CheckCircle2, color: "text-green-500" },
          { label: "Fallidos (30d)", value: stats?.failed ?? 0, icon: XCircle, color: "text-red-500" },
          { label: "Encuestas", value: stats?.surveyCount ?? 0, icon: Star, color: "text-amber-500", extra: stats?.avgOverall ? `★ ${stats.avgOverall}` : null },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                {s.extra && <p className="text-sm font-semibold text-amber-500">{s.extra}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="plantillas">
        <TabsList>
          <TabsTrigger value="plantillas"><Mail className="h-4 w-4 mr-1.5" />Plantillas</TabsTrigger>
          <TabsTrigger value="config"><Settings2 className="h-4 w-4 mr-1.5" />Configuración</TabsTrigger>
          <TabsTrigger value="encuestas"><Star className="h-4 w-4 mr-1.5" />Encuestas</TabsTrigger>
          <TabsTrigger value="logs"><BarChart3 className="h-4 w-4 mr-1.5" />Historial</TabsTrigger>
        </TabsList>

        {/* ─── PLANTILLAS ─── */}
        <TabsContent value="plantillas" className="space-y-4 mt-4">
          {[
            {
              key: "confirmation",
              label: "Email de confirmación",
              icon: CheckCircle2,
              desc: "Se envía automáticamente cuando se confirma una reserva",
              enabledField: "confirmationEnabled",
              subjectField: "confirmationSubject",
              bodyField: "confirmationBody",
              vars: VARS_COMMON,
            },
            {
              key: "reminder",
              label: "Recordatorio 2 días antes",
              icon: Clock,
              desc: "Se envía automáticamente cada mañana a las 09:00 para check-ins del día siguiente pasado mañana",
              enabledField: "reminderEnabled",
              subjectField: "reminderSubject",
              bodyField: "reminderBody",
              vars: VARS_COMMON,
            },
            {
              key: "checkout",
              label: "Post checkout + encuesta",
              icon: Send,
              desc: "Se envía al hacer el check-out. Incluye link único a la encuesta de satisfacción",
              enabledField: "checkoutEnabled",
              subjectField: "checkoutSubject",
              bodyField: "checkoutBody",
              vars: VARS_CHECKOUT,
            },
          ].map(t => (
            <TemplateCard key={t.key} {...t} cfg={cfg} onSave={save} />
          ))}

          {/* Reminder manual trigger */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Ejecutar recordatorios ahora</p>
                <p className="text-sm text-muted-foreground">Útil para probar. Se evitan duplicados automáticamente.</p>
              </div>
              <Button variant="outline" onClick={() => reminderMutation.mutate()} disabled={reminderMutation.isPending} data-testid="button-run-reminder">
                <RefreshCw className={`h-4 w-4 mr-2 ${reminderMutation.isPending ? "animate-spin" : ""}`} />
                {reminderMutation.isPending ? "Ejecutando..." : "Ejecutar recordatorios"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CONFIGURACIÓN ─── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración del proveedor</CardTitle>
              <CardDescription>Configurá el servicio de email que usarás para enviar las comunicaciones</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre del remitente</Label>
                  <Input
                    defaultValue={cfg?.fromName ?? ""}
                    onBlur={e => save({ fromName: e.target.value })}
                    placeholder="Maran Suites & Towers"
                    data-testid="input-from-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email del remitente</Label>
                  <Input
                    defaultValue={cfg?.fromEmail ?? ""}
                    onBlur={e => save({ fromEmail: e.target.value })}
                    placeholder="reservas@maransuites.com"
                    data-testid="input-from-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>API Key (Resend / SendGrid)</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                    placeholder={cfg?.apiKeySet ? "••••••••••••••• (clave guardada — escribí para cambiar)" : "re_xxxxxxxxxxxxxxxx"}
                    data-testid="input-api-key"
                  />
                  <Button variant="outline" size="icon" onClick={() => setShowApiKey(v => !v)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => { if (apiKeyInput.trim()) save({}); }}
                    disabled={!apiKeyInput.trim() || saveMutation.isPending}
                    data-testid="button-save-api-key"
                  >
                    Guardar
                  </Button>
                </div>
                {cfg?.apiKeySet
                  ? <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> API key configurada</p>
                  : <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sin API key — los emails no se enviarán</p>
                }
              </div>

              <div className="space-y-2">
                <Label>Link de Google Maps (para el email post estadía)</Label>
                <Input
                  defaultValue={cfg?.googleMapsUrl ?? ""}
                  onBlur={e => save({ googleMapsUrl: e.target.value })}
                  placeholder="https://maps.google.com/..."
                  data-testid="input-google-maps-url"
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <Label>Enviar email de prueba</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    placeholder="tu@email.com"
                    data-testid="input-test-email"
                  />
                  <Button
                    onClick={() => testMutation.mutate(testEmail)}
                    disabled={!testEmail || testMutation.isPending}
                    data-testid="button-send-test"
                  >
                    <Zap className="h-4 w-4 mr-1.5" />
                    {testMutation.isPending ? "Enviando..." : "Enviar prueba"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Verificá que la API key y el remitente estén bien configurados</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ENCUESTAS ─── */}
        <TabsContent value="encuestas" className="space-y-4 mt-4">
          {surveyResponses.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Todavía no hay respuestas de encuesta</p>
                <p className="text-sm">Los huéspedes recibirán el link al hacer el check-out</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Average card */}
              {stats?.avgOverall && (
                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="text-5xl font-bold text-amber-500">{stats.avgOverall}</div>
                    <div>
                      <Stars value={Math.round(parseFloat(stats.avgOverall))} />
                      <p className="text-sm text-muted-foreground mt-1">{stats.surveyCount} respuesta{stats.surveyCount !== 1 ? "s" : ""}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-3">
                {surveyResponses.map((r: any) => (
                  <Card key={r.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-medium">{r.guestName || "Huésped anónimo"}</p>
                          <p className="text-xs text-muted-foreground">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("es-AR") : ""}</p>
                        </div>
                        <Stars value={r.ratingOverall} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        {[
                          { label: "Habitación", val: r.ratingRoom },
                          { label: "Limpieza", val: r.ratingCleanliness },
                          { label: "Servicio", val: r.ratingService },
                          { label: "Gastronomía", val: r.ratingFood },
                        ].map(item => item.val && (
                          <div key={item.label} className="rounded-lg bg-muted p-2 text-center">
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                            <Stars value={item.val} />
                          </div>
                        ))}
                      </div>
                      {r.comment && (
                        <div className="flex gap-2 rounded-lg bg-muted p-3">
                          <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <p className="text-sm italic">"{r.comment}"</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── HISTORIAL ─── */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Últimos envíos</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => refetchLogs()} data-testid="button-refresh-logs">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <p className="p-4 text-center text-muted-foreground text-sm">Sin registros todavía</p>
              ) : (
                <div className="divide-y max-h-[520px] overflow-y-auto">
                  {logs.map((l: any) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                      {l.status === "sent" && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                      {l.status === "failed" && <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                      {l.status === "skipped" && <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{l.recipientEmail || "—"}</p>
                        {l.errorMessage && <p className="text-xs text-red-500 truncate">{l.errorMessage}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className="text-xs capitalize">{
                          l.type === "confirmation" ? "Confirmación" :
                          l.type === "reminder" ? "Recordatorio" : "Post-checkout"
                        }</Badge>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {l.sentAt ? new Date(l.sentAt).toLocaleString("es-AR") : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template card component
// ─────────────────────────────────────────────────────────────────────────────
function TemplateCard({
  label, icon: Icon, desc, enabledField, subjectField, bodyField, vars, cfg, onSave,
}: {
  label: string; icon: any; desc: string;
  enabledField: string; subjectField: string; bodyField: string;
  vars: string[]; cfg: any; onSave: (f: Record<string, any>) => void;
}) {
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);

  const currentSubject = subject ?? cfg?.[subjectField] ?? "";
  const currentBody = body ?? cfg?.[bodyField] ?? "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {label}
          </CardTitle>
          <Switch
            checked={cfg?.[enabledField] ?? false}
            onCheckedChange={v => onSave({ [enabledField]: v })}
            data-testid={`switch-${enabledField}`}
          />
        </div>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Asunto</Label>
          <Input
            value={currentSubject}
            onChange={e => setSubject(e.target.value)}
            onBlur={() => { if (subject !== null) onSave({ [subjectField]: subject }); }}
            data-testid={`input-${subjectField}`}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cuerpo del email</Label>
          <Textarea
            value={currentBody}
            onChange={e => setBody(e.target.value)}
            onBlur={() => { if (body !== null) onSave({ [bodyField]: body }); }}
            rows={6}
            className="font-mono text-sm"
            data-testid={`textarea-${bodyField}`}
          />
          <p className="text-xs text-muted-foreground">Variables disponibles:</p>
          <VarChips vars={vars} />
        </div>
      </CardContent>
    </Card>
  );
}
