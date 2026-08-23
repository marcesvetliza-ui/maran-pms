import { useState, useEffect } from "react";
import { fmtMoney } from "@/lib/utils";
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
  RefreshCw, Settings2, BarChart3, AlertTriangle, Zap, Server,
  Database, Download, MailCheck, ShieldCheck, FlaskConical, History,
  Upload, ImageIcon, Trash2,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
const VARS_REMINDER = [...VARS_COMMON, "{link_webcheckin}"];
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
  const [smtpPassInput, setSmtpPassInput] = useState("");
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [localProvider, setLocalProvider] = useState<string>("resend");

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

  useEffect(() => {
    if (cfg?.provider) setLocalProvider(cfg.provider);
  }, [cfg?.provider]);

  const save = (fields: Record<string, any>) => {
    const payload: any = { ...fields };
    if (apiKeyInput.trim()) payload.apiKey = apiKeyInput.trim();
    if (smtpPassInput.trim()) payload.smtpPass = smtpPassInput.trim();
    saveMutation.mutate(payload);
    if (apiKeyInput.trim()) setApiKeyInput("");
    if (smtpPassInput.trim()) setSmtpPassInput("");
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
          <TabsTrigger value="backup"><Database className="h-4 w-4 mr-1.5" />Backup</TabsTrigger>
        </TabsList>

        {/* ─── PLANTILLAS ─── */}
        <TabsContent value="plantillas" className="space-y-4 mt-4">
          {/* Diseño del email — imágenes de banner y pie */}
          <EmailImagesCard cfg={cfg} />

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
              vars: VARS_REMINDER,
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
          ].map(({ key, ...template }) => (
            <TemplateCard key={key} {...template} cfg={cfg} onSave={save} />
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
          {/* Remitente */}
          <Card>
            <CardHeader>
              <CardTitle>Datos del remitente</CardTitle>
              <CardDescription>Nombre y email que verá el huésped en la bandeja de entrada</CardDescription>
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
                <Label>Link de Google Maps (para el email post estadía)</Label>
                <Input
                  defaultValue={cfg?.googleMapsUrl ?? ""}
                  onBlur={e => save({ googleMapsUrl: e.target.value })}
                  placeholder="https://maps.google.com/..."
                  data-testid="input-google-maps-url"
                />
              </div>
            </CardContent>
          </Card>

          {/* Proveedor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Proveedor de envío</CardTitle>
              <CardDescription>Elegí cómo se enviarán los emails: vía Resend (API) o via Gmail / SMTP</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Provider selector */}
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Select
                  value={localProvider}
                  onValueChange={v => {
                    setLocalProvider(v);
                    save({ provider: v });
                  }}
                >
                  <SelectTrigger data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resend">Resend (API key)</SelectItem>
                    <SelectItem value="smtp">Gmail / SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Resend fields */}
              {localProvider === "resend" && (
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="text-sm font-medium">Configuración Resend</p>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={apiKeyInput}
                        onChange={e => setApiKeyInput(e.target.value)}
                        placeholder={cfg?.apiKeySet ? "••••••••• (guardada — escribí para cambiar)" : "re_xxxxxxxxxxxxxxxx"}
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
                </div>
              )}

              {/* SMTP / Gmail fields */}
              {localProvider === "smtp" && (
                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                    <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">Para usar Gmail necesitás una Contraseña de Aplicación</p>
                      <p>En tu cuenta Google: <strong>Seguridad → Verificación en 2 pasos → Contraseñas de aplicación</strong>. Creá una nueva y pegá los 16 caracteres aquí.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Servidor SMTP</Label>
                      <Input
                        defaultValue={cfg?.smtpHost ?? "smtp.gmail.com"}
                        onBlur={e => save({ smtpHost: e.target.value })}
                        placeholder="smtp.gmail.com"
                        data-testid="input-smtp-host"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Puerto</Label>
                      <Input
                        type="number"
                        defaultValue={cfg?.smtpPort ?? 587}
                        onBlur={e => save({ smtpPort: parseInt(e.target.value) || 587 })}
                        placeholder="587"
                        data-testid="input-smtp-port"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Usuario (tu email de Gmail)</Label>
                    <Input
                      defaultValue={cfg?.smtpUser ?? ""}
                      onBlur={e => save({ smtpUser: e.target.value })}
                      placeholder="hotel@gmail.com"
                      data-testid="input-smtp-user"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Contraseña de aplicación (App Password)</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSmtpPass ? "text" : "password"}
                        value={smtpPassInput}
                        onChange={e => setSmtpPassInput(e.target.value)}
                        placeholder={cfg?.smtpPassSet ? "•••••••••••••••• (guardada — escribí para cambiar)" : "xxxx xxxx xxxx xxxx"}
                        data-testid="input-smtp-pass"
                      />
                      <Button variant="outline" size="icon" onClick={() => setShowSmtpPass(v => !v)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => { if (smtpPassInput.trim()) save({}); }}
                        disabled={!smtpPassInput.trim() || saveMutation.isPending}
                        data-testid="button-save-smtp-pass"
                      >
                        Guardar
                      </Button>
                    </div>
                    {cfg?.smtpPassSet
                      ? <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Contraseña configurada</p>
                      : <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sin contraseña — los emails no se enviarán</p>
                    }
                  </div>
                </div>
              )}

              {/* Test email */}
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
                <p className="text-xs text-muted-foreground">Verificá que la configuración del proveedor esté correcta</p>
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

        {/* ─── BACKUP ─── */}
        <TabsContent value="backup" className="space-y-4 mt-4">
          <BackupTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup tab component
// ─────────────────────────────────────────────────────────────────────────────
type RestoreTestResult = {
  success: boolean; duration_ms: number; tables_tested: number;
  tables_ok: number; tables_failed: number;
  details: Array<{ table: string; original_rows: number; restored_rows: number; ok: boolean }>;
  error?: string;
};

type BackupLog = {
  id: number; type: string; status: string; destination: string | null;
  fileSizeBytes: number | null; durationMs: number | null;
  errorMessage: string | null; createdAt: string;
};

const BACKUP_TYPE_LABEL: Record<string, string> = {
  scheduled: "Automático",
  manual_email: "Email manual",
  manual_download: "Descarga",
  restore_test: "Test de restore",
};

function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${fmtMoney(n / 1024 / 1024)} MB`;
}

function BackupTab() {
  const { toast } = useToast();
  const [backupEmail, setBackupEmail] = useState("");
  const [sendNowEmail, setSendNowEmail] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreTestResult | null>(null);

  const { data: cfg, isLoading: cfgLoading } = useQuery<{ enabled: boolean; email: string }>({
    queryKey: ["/api/admin/backup/config"],
  });

  const saveMut = useMutation({
    mutationFn: (data: { enabled?: boolean; email?: string }) =>
      apiRequest("PUT", "/api/admin/backup/config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/config"] });
      toast({ title: "Configuración de backup guardada" });
    },
    onError: (e: any) => toast({ title: "Error al guardar", description: e.message, variant: "destructive" }),
  });

  const sendNowMut = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/admin/backup/send-now", { email }),
    onSuccess: () => toast({ title: "Backup enviado", description: `Revisá la bandeja de ${sendNowEmail}` }),
    onError: (e: any) => toast({ title: "Error al enviar", description: e.message, variant: "destructive" }),
  });

  const { data: logsData, refetch: refetchLogs2 } = useQuery<{ logs: BackupLog[]; hours_since_last_success: number | null }>({
    queryKey: ["/api/admin/backup/logs"],
    refetchInterval: 60_000,
  });

  const restoreTestMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/backup/restore-test", {}),
    onSuccess: (data: any) => {
      setRestoreResult(data);
      if (data.success) {
        toast({ title: "Restore test exitoso", description: `${data.tables_ok} tablas verificadas correctamente` });
      } else {
        toast({ title: "Restore test con errores", description: data.error || `${data.tables_failed} tablas fallaron`, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error en restore test", description: e.message, variant: "destructive" }),
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/backup/download", { credentials: "include" });
      if (!res.ok) throw new Error("Error generando backup");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
      a.href = url;
      a.download = `maran-backup-${dateStr}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup descargado correctamente" });
    } catch (e: any) {
      toast({ title: "Error al descargar", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3 items-start">
            <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-semibold">Backup completo de la base de datos</p>
              <p>El backup incluye todas las tablas del sistema: reservas, huéspedes, folios, pagos, eventos, etc. Se genera como archivo <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.sql</code> restaurable en cualquier PostgreSQL.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual download */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Descargar backup ahora
          </CardTitle>
          <CardDescription>Genera y descarga un archivo SQL completo en este momento.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleDownload}
            disabled={downloading}
            data-testid="button-download-backup"
          >
            {downloading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {downloading ? "Generando backup..." : "Descargar backup (.sql)"}
          </Button>
        </CardContent>
      </Card>

      {/* Send by email now */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MailCheck className="h-5 w-5 text-primary" />
            Enviar backup por email ahora
          </CardTitle>
          <CardDescription>Envía el backup inmediatamente a cualquier dirección de email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="destino@email.com"
              value={sendNowEmail}
              onChange={e => setSendNowEmail(e.target.value)}
              className="max-w-xs"
              data-testid="input-backup-send-email"
            />
            <Button
              onClick={() => sendNowMut.mutate(sendNowEmail)}
              disabled={!sendNowEmail || sendNowMut.isPending}
              data-testid="button-send-backup-now"
            >
              {sendNowMut.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar ahora
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Requiere SMTP configurado en la pestaña Configuración.</p>
        </CardContent>
      </Card>

      {/* Automatic daily backup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Backup automático diario — 03:00 hs
          </CardTitle>
          <CardDescription>El sistema genera y envía un backup por email todos los días a las 3 de la madrugada (hora Argentina).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfgLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Backup automático activado</Label>
                <Switch
                  checked={cfg?.enabled ?? false}
                  onCheckedChange={v => saveMut.mutate({ enabled: v })}
                  data-testid="switch-backup-enabled"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Email de destino del backup</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="gerencia@maran.com.ar"
                    defaultValue={cfg?.email ?? ""}
                    key={cfg?.email}
                    onBlur={e => {
                      if (e.target.value !== cfg?.email) {
                        saveMut.mutate({ email: e.target.value });
                        setBackupEmail(e.target.value);
                      }
                    }}
                    className="max-w-xs"
                    data-testid="input-backup-auto-email"
                  />
                </div>
                <p className="text-xs text-muted-foreground">El backup se enviará como adjunto a este email cada noche a las 03:00 hs.</p>
              </div>
              {cfg?.enabled && cfg?.email && (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Backup automático activo — se enviará a <strong>{cfg.email}</strong> cada noche a las 03:00 hs.</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Restore test */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Test de restore
          </CardTitle>
          <CardDescription>
            Genera el backup actual, lo restaura en un schema temporal aislado y verifica que cada tabla tenga la misma cantidad de filas. No modifica ningún dato existente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => { setRestoreResult(null); restoreTestMut.mutate(); }}
            disabled={restoreTestMut.isPending}
            variant="outline"
            data-testid="button-run-restore-test"
          >
            {restoreTestMut.isPending
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Ejecutando test de restore...</>
              : <><FlaskConical className="h-4 w-4 mr-2" />Ejecutar test de restore</>}
          </Button>

          {restoreTestMut.isPending && (
            <p className="text-xs text-muted-foreground">Esto puede tardar unos segundos dependiendo del tamaño de la base de datos.</p>
          )}

          {restoreResult && (
            <div className="space-y-3">
              {/* Summary banner */}
              <div className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium ${
                restoreResult.success
                  ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800"
              }`}>
                {restoreResult.success
                  ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                  : <XCircle className="h-5 w-5 shrink-0" />}
                <div>
                  {restoreResult.success
                    ? `Restore exitoso — ${restoreResult.tables_ok} tablas verificadas correctamente`
                    : restoreResult.error
                      ? `Error: ${restoreResult.error}`
                      : `${restoreResult.tables_failed} tabla(s) con diferencias`}
                  {restoreResult.duration_ms > 0 && (
                    <span className="ml-2 font-normal opacity-70">({(restoreResult.duration_ms / 1000).toFixed(1)}s)</span>
                  )}
                </div>
              </div>

              {/* Table details */}
              {restoreResult.details.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium">Tabla</th>
                        <th className="text-right px-3 py-2 font-medium">Original</th>
                        <th className="text-right px-3 py-2 font-medium">Restauradas</th>
                        <th className="text-center px-3 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restoreResult.details.map((d, i) => (
                        <tr key={d.table} className={`border-b last:border-0 ${!d.ok ? "bg-red-50 dark:bg-red-950/20" : i % 2 === 0 ? "" : "bg-muted/20"}`}
                          data-testid={`row-restore-${d.table}`}>
                          <td className="px-3 py-1.5 font-mono">{d.table}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{d.original_rows.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{d.restored_rows.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-center">
                            {d.ok
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />
                              : <XCircle className="h-3.5 w-3.5 text-red-600 inline" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historial de backups */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Historial de backups
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => refetchLogs2()}
              data-testid="button-refresh-backup-logs" title="Actualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Últimas 30 operaciones — los registros se conservan 90 días automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Alerta si el último backup tiene más de 25h */}
          {logsData && (logsData.hours_since_last_success === null || logsData.hours_since_last_success > 25) && (
            <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-700 px-4 py-2.5 text-sm text-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                {logsData.hours_since_last_success === null
                  ? "Aún no hay backups registrados."
                  : `El último backup exitoso fue hace ${Math.round(logsData.hours_since_last_success)} horas.`}
                {" "}Se recomienda que el backup automático corra diariamente.
              </span>
            </div>
          )}
          {logsData && logsData.logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay registros de backups aún. El historial se llenará con los próximos backups.
            </p>
          )}
          {logsData && logsData.logs.length > 0 && (
            <div className="overflow-x-auto rounded-md border" data-testid="table-backup-logs">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Estado</th>
                    <th className="px-3 py-2 text-left font-medium">Destino</th>
                    <th className="px-3 py-2 text-right font-medium">Tamaño</th>
                    <th className="px-3 py-2 text-right font-medium">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logsData.logs.map(log => (
                    <tr key={log.id} data-testid={`row-backup-log-${log.id}`}
                      className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-3 py-2">
                        {BACKUP_TYPE_LABEL[log.type] ?? log.type}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.status === "success"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                            : log.status === "error"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {log.status === "success" ? "✓ OK" : log.status === "error" ? "✗ Error" : log.status}
                        </span>
                        {log.errorMessage && (
                          <span className="ml-2 text-xs text-muted-foreground" title={log.errorMessage}>
                            {log.errorMessage.length > 40 ? log.errorMessage.slice(0, 40) + "…" : log.errorMessage}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {log.destination ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatBytes(log.fileSizeBytes)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Images Card — upload/delete banner and footer images
// ─────────────────────────────────────────────────────────────────────────────
function EmailImagesCard({ cfg }: { cfg: any }) {
  const { toast } = useToast();
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [footerPreview, setFooterPreview] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: ({ type, imageData }: { type: string; imageData: string }) =>
      apiRequest("POST", "/api/email/upload-image", { type, imageData }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/config"] });
      toast({ title: `Imagen ${vars.type === "banner" ? "de encabezado" : "de pie"} guardada` });
    },
    onError: (e: any) => toast({ title: "Error al guardar imagen", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (type: string) => apiRequest("DELETE", `/api/email/upload-image/${type}`),
    onSuccess: (_data, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/config"] });
      if (type === "banner") setBannerPreview(null);
      else setFooterPreview(null);
      toast({ title: `Imagen ${type === "banner" ? "de encabezado" : "de pie"} eliminada` });
    },
    onError: () => toast({ title: "Error al eliminar imagen", variant: "destructive" }),
  });

  const handleFile = (type: "banner" | "footer") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Solo se aceptan imágenes (JPG, PNG)", variant: "destructive" });
      return;
    }
    if (file.size > 2_000_000) {
      toast({ title: "La imagen no puede superar 2 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (type === "banner") setBannerPreview(dataUrl);
      else setFooterPreview(dataUrl);
      uploadMutation.mutate({ type, imageData: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const previewUrl = (type: "banner" | "footer") => {
    if (type === "banner" && bannerPreview) return bannerPreview;
    if (type === "footer" && footerPreview) return footerPreview;
    // Fallback to served URL (adds cache-bust to reflect latest upload)
    return `/api/public/email-images/${type}?t=${Date.now()}`;
  };

  const isSet = (type: "banner" | "footer") =>
    type === "banner" ? (bannerPreview || cfg?.bannerImageSet) : (footerPreview || cfg?.footerImageSet);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Diseño visual del email
        </CardTitle>
        <CardDescription>
          Imágenes que aparecen en todos los emails automáticos. Se aplican a confirmación, recordatorio y post-checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Specs reminder */}
        <div className="rounded-lg bg-muted/50 border px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Especificaciones para el equipo de diseño</p>
          <p>• Ancho: <strong>600 px</strong> exactos &nbsp;|&nbsp; Alto: 180–220 px recomendado &nbsp;|&nbsp; Formato: <strong>JPG</strong></p>
          <p>• Resolución: 144 dpi (retina) o 72 dpi mínimo &nbsp;|&nbsp; Tamaño máximo: 2 MB</p>
          <p>• Color bordo de referencia: <code className="bg-muted px-1 rounded">#8B1535</code> &nbsp;|&nbsp; Fondo actual: <code className="bg-muted px-1 rounded">#f0ebe8</code></p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {(["banner", "footer"] as const).map(type => (
            <div key={type} className="space-y-2">
              <Label className="text-sm font-medium">
                {type === "banner" ? "📸 Encabezado (debajo del logo)" : "🖼️ Pie de email (sobre el footer)"}
              </Label>

              {/* Preview */}
              <div className="border rounded-lg overflow-hidden bg-muted/30 min-h-[80px] flex items-center justify-center">
                {isSet(type) ? (
                  <img
                    src={previewUrl(type)}
                    alt={type}
                    className="w-full h-auto object-contain max-h-[120px]"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 py-4 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 opacity-30" />
                    <span className="text-xs">Sin imagen cargada</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFile(type)}
                    disabled={uploadMutation.isPending}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full cursor-pointer"
                    asChild
                    disabled={uploadMutation.isPending}
                  >
                    <span>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {isSet(type) ? "Cambiar imagen" : "Cargar imagen"}
                    </span>
                  </Button>
                </label>
                {isSet(type) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(type)}
                    disabled={deleteMutation.isPending}
                    title="Eliminar imagen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
