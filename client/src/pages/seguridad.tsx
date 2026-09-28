import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  KeyRound, ShieldCheck, ShieldAlert, ShieldOff, Copy, RefreshCw,
  CheckCircle2, AlertTriangle, ExternalLink, Database, Github,
  Mail, Activity, Clock, Lock, Unlock, Users,
} from "lucide-react";
import { formatHotelDateTime } from "@/lib/hotelTime";

type LockedUser = {
  id: string;
  username: string;
  fullName: string;
  lockedAt: string | null;
  lockReason: string | null;
  lockPermanent: string | null;
  failedLoginCount: number | null;
};

function LockedUsersCard() {
  const { toast } = useToast();

  const { data: lockedUsers = [], isLoading, refetch } = useQuery<LockedUser[]>({
    queryKey: ["/api/admin/security/locked-users"],
  });

  const unlockMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/security/unlock-user/${id}`, {}),
    onSuccess: async (res: any) => {
      const data = await res.json();
      refetch();
      toast({ title: data.message || "Cuenta desbloqueada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-locked-users">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Usuarios bloqueados
        </CardTitle>
        <CardDescription>
          Se bloquean automáticamente después de varios intentos de contraseña incorrecta (temporal a las 5, permanente a las 8). Desde acá los desbloqueás vos mismo, sin esperar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        ) : lockedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ningún usuario bloqueado ahora mismo.</p>
        ) : (
          <div className="space-y-2">
            {lockedUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2.5 flex-wrap"
                data-testid={`row-locked-user-${u.username}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{u.fullName}</span>
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{u.username}</code>
                    <Badge variant={u.lockPermanent === "true" ? "destructive" : "outline"} className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      {u.lockPermanent === "true" ? "Permanente" : "Temporal"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {u.lockReason || `${u.failedLoginCount ?? 0} intentos fallidos`}
                    {u.lockedAt && ` — ${formatHotelDateTime(u.lockedAt)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unlockMut.mutate(u.id)}
                  disabled={unlockMut.isPending}
                  data-testid={`button-unlock-${u.username}`}
                >
                  <Unlock className="h-3.5 w-3.5 mr-1.5" />
                  Desbloquear
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TwoFactorStatus = { enabled: boolean };

function TwoFactorCard() {
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "enroll" | "backup-codes">("idle");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const { data: status, isLoading, refetch } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/auth/2fa/status"],
  });

  const handleClose = () => {
    setStep("idle");
    setQrCodeDataUrl(null);
    setManualSecret(null);
    setCode("");
    setBackupCodes([]);
  };

  const setupMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/setup", {})).json(),
    onSuccess: (res: any) => {
      setQrCodeDataUrl(res.qrCodeDataUrl);
      setManualSecret(res.secret);
      setCode("");
      setStep("enroll");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const confirmMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/confirm", { token: code })).json(),
    onSuccess: (res: any) => {
      setBackupCodes(res.backupCodes ?? []);
      setStep("backup-codes");
      refetch();
      toast({ title: "Verificación en dos pasos activada" });
    },
    onError: (e: any) => toast({ title: "Código incorrecto", description: e.message, variant: "destructive" }),
  });

  const disableMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/disable", { password: disablePassword })).json(),
    onSuccess: () => {
      setDisableOpen(false);
      setDisablePassword("");
      refetch();
      toast({ title: "Verificación en dos pasos desactivada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-2fa">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Verificación en dos pasos (2FA)
        </CardTitle>
        <CardDescription>
          Sumá un código de tu celular además de la contraseña al iniciar sesión. Es opcional — la activás cuando quieras y podés desactivarla en cualquier momento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        ) : status?.enabled ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Activada
            </Badge>
            <AlertDialog open={disableOpen} onOpenChange={(open) => { setDisableOpen(open); if (!open) setDisablePassword(""); }}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-disable-2fa">
                  <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                  Desactivar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desactivar verificación en dos pasos</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ingresá tu contraseña para confirmar. Vas a poder volver a activarla cuando quieras.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-2">
                  <Label htmlFor="disable-2fa-password">Contraseña</Label>
                  <PasswordInput
                    id="disable-2fa-password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    data-testid="input-disable-2fa-password"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); disableMut.mutate(); }}
                    disabled={!disablePassword || disableMut.isPending}
                    data-testid="button-confirm-disable-2fa"
                  >
                    {disableMut.isPending ? "Desactivando..." : "Desactivar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Badge variant="outline" className="text-xs text-muted-foreground">
              <ShieldOff className="h-3 w-3 mr-1" /> Desactivada
            </Badge>
            <Button size="sm" onClick={() => setupMut.mutate()} disabled={setupMut.isPending} data-testid="button-enable-2fa">
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              {setupMut.isPending ? "Generando..." : "Activar"}
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={step === "enroll"} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escaneá el código QR</DialogTitle>
            <DialogDescription>
              Usá Google Authenticator, Microsoft Authenticator u otra app similar. Después ingresá el código de 6 dígitos que te muestra.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {qrCodeDataUrl && (
              <img
                src={qrCodeDataUrl}
                alt="Código QR de verificación en dos pasos"
                className="mx-auto border rounded"
                data-testid="img-2fa-qr"
              />
            )}
            {manualSecret && (
              <p className="text-xs text-muted-foreground text-center break-all">
                O ingresalo manualmente: <code className="font-mono">{manualSecret}</code>
              </p>
            )}
            <div>
              <Label htmlFor="2fa-confirm-code">Código de 6 dígitos</Label>
              <Input
                id="2fa-confirm-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                data-testid="input-2fa-confirm-code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => confirmMut.mutate()}
              disabled={code.length !== 6 || confirmMut.isPending}
              data-testid="button-confirm-2fa"
            >
              {confirmMut.isPending ? "Verificando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={step === "backup-codes"} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardá tus códigos de respaldo</DialogTitle>
            <DialogDescription>
              Si perdés el celular, usá uno de estos códigos para entrar (cada uno sirve una sola vez). Se muestran una única vez.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((c) => (
              <code key={c} className="bg-muted rounded px-2 py-1.5 text-sm font-mono text-center" data-testid="text-2fa-backup-code">
                {c}
              </code>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleClose} data-testid="button-close-2fa-backup-codes">Ya los guardé</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type CredentialStatus = {
  name: string;
  key: string;
  configured: boolean;
  last_rotated: string | null;
  risk: "alto" | "medio" | "bajo";
  description: string;
  notes: string;
  rotatable: boolean;
};

type SecurityStatus = {
  credentials: CredentialStatus[];
  total: number;
  configured: number;
  needs_rotation: number;
};

const RISK_COLOR = {
  alto:  "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800",
  medio: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  bajo:  "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-200 dark:border-green-800",
};

const RISK_ICON = {
  alto:  ShieldAlert,
  medio: ShieldCheck,
  bajo:  ShieldCheck,
};

const CRED_ICON: Record<string, any> = {
  SESSION_SECRET:                 KeyRound,
  DATABASE_URL:                   Database,
  GITHUB_PERSONAL_ACCESS_TOKEN:   Github,
  SENTRY_DSN:                     Activity,
  VITE_SENTRY_DSN:                Activity,
  SMTP_RESEND:                    Mail,
};

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function RotationAge({ lastRotated }: { lastRotated: string | null }) {
  const days = daysSince(lastRotated);
  if (days === null)
    return <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Sin registro de rotación</span>;
  const color = days > 180 ? "text-red-600 dark:text-red-400" : days > 90 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400";
  return (
    <span className={`text-xs flex items-center gap-1 ${color}`}>
      <Clock className="h-3 w-3" />
      Última rotación hace {days} {days === 1 ? "día" : "días"}
      {days > 180 && " — recomendamos rotar"}
    </span>
  );
}

export default function SeguridadPage() {
  const { toast } = useToast();
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch } = useQuery<SecurityStatus>({
    queryKey: ["/api/admin/security/status"],
  });

  const rotateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/security/rotate-session", {}),
    onSuccess: (res: any) => {
      setNewSecret(res.new_secret);
      refetch();
      toast({ title: "Nueva clave generada", description: "Copiá el valor y actualizalo en Railway y Replit Secrets" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
      </div>
    );
  }

  const creds = data?.credentials ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-primary" />
          Seguridad de credenciales
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Auditoría de claves y secretos del sistema. Las credenciales deben rotarse periódicamente para minimizar el riesgo.
        </p>
      </div>

      <LockedUsersCard />
      <TwoFactorCard />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-center">{data?.configured ?? 0}<span className="text-muted-foreground text-base font-normal">/{data?.total ?? 0}</span></div>
            <p className="text-xs text-center text-muted-foreground mt-0.5">Credenciales configuradas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className={`text-2xl font-bold text-center ${(data?.needs_rotation ?? 0) > 0 ? "text-amber-600" : "text-green-600"}`}>
              {data?.needs_rotation ?? 0}
            </div>
            <p className="text-xs text-center text-muted-foreground mt-0.5">Requieren atención</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-center text-green-600">
              {(data?.configured ?? 0) === (data?.total ?? 0)
                ? <CheckCircle2 className="h-7 w-7 mx-auto" />
                : <AlertTriangle className="h-7 w-7 mx-auto text-amber-500" />}
            </div>
            <p className="text-xs text-center text-muted-foreground mt-0.5">Estado general</p>
          </CardContent>
        </Card>
      </div>

      {/* New secret generated banner */}
      {newSecret && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Nueva clave de sesión generada — guardala ahora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="bg-white dark:bg-black/40 border rounded px-3 py-2 text-xs font-mono flex-1 break-all select-all" data-testid="text-new-session-secret">
                {newSecret}
              </code>
              <Button size="sm" variant="outline" onClick={() => handleCopy(newSecret)} data-testid="button-copy-secret">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <ol className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-decimal list-inside">
              <li>Copiá el valor de arriba</li>
              <li>En <strong>Railway</strong> → Variables → actualizá <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SESSION_SECRET</code></li>
              <li>En <strong>Replit</strong> → Secrets → actualizá <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SESSION_SECRET</code></li>
              <li>Reiniciá el servidor para aplicar el cambio (todos los usuarios deberán volver a iniciar sesión)</li>
            </ol>
            <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => setNewSecret(null)}>
              Cerrar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Credential cards */}
      <div className="space-y-3">
        {creds.map(cred => {
          const Icon = CRED_ICON[cred.key] ?? KeyRound;
          const RiskIcon = RISK_ICON[cred.risk];
          const isSessionSecret = cred.key === "SESSION_SECRET";

          return (
            <Card key={cred.key} className={!cred.configured ? "border-red-200 dark:border-red-800" : ""} data-testid={`card-credential-${cred.key}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${cred.configured ? "bg-muted" : "bg-red-100 dark:bg-red-950/40"}`}>
                      <Icon className={`h-4 w-4 ${cred.configured ? "text-primary" : "text-red-600"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{cred.name}</span>
                        <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{cred.key}</code>
                        <Badge variant="outline" className={`text-xs ${RISK_COLOR[cred.risk]}`}>
                          <RiskIcon className="h-3 w-3 mr-1" />
                          Riesgo {cred.risk}
                        </Badge>
                        {cred.configured
                          ? <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Configurada
                            </Badge>
                          : <Badge variant="destructive" className="text-xs">
                              <ShieldOff className="h-3 w-3 mr-1" /> Faltante
                            </Badge>
                        }
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{cred.description}</p>
                      <div className="mt-1.5">
                        <RotationAge lastRotated={cred.last_rotated} />
                      </div>
                      {cred.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 border-l-2 pl-2 border-muted-foreground/30">{cred.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0">
                    {isSessionSecret && cred.configured && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" data-testid="button-rotate-session-secret">
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            Rotar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rotar clave de sesión</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se generará una nueva clave aleatoria de 96 caracteres. Después de generarla, tenés que actualizarla manualmente en Railway y Replit Secrets, y reiniciar el servidor.<br /><br />
                              <strong>Todos los usuarios activos deberán volver a iniciar sesión al reiniciar.</strong>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => rotateMut.mutate()} disabled={rotateMut.isPending}>
                              {rotateMut.isPending ? "Generando..." : "Generar nueva clave"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {cred.key === "GITHUB_PERSONAL_ACCESS_TOKEN" && (
                      <Button size="sm" variant="outline" asChild>
                        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" data-testid="link-github-tokens">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Gestionar
                        </a>
                      </Button>
                    )}
                    {cred.key === "SMTP_RESEND" && (
                      <Button size="sm" variant="outline" asChild>
                        <a href="/email-config" data-testid="link-email-config">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Configurar
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Rotation best practices */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Buenas prácticas de rotación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
            <li><strong>SESSION_SECRET</strong>: Rotar cada 90 días o ante cualquier sospecha de exposición.</li>
            <li><strong>DATABASE_URL</strong>: Gestionado por Railway. Rotar desde Railway → Database → Reset credentials.</li>
            <li><strong>GitHub PAT</strong>: Usar token de grano fino (<em>fine-grained</em>) con acceso solo al repositorio <code className="bg-muted px-1 rounded">maran-pms</code> y permisos <em>Contents: Write</em> + <em>Workflows: Write</em>. Rotar cada 90 días.</li>
            <li><strong>Sentry DSN</strong>: Bajo riesgo — es una URL pública. Rotar solo si aparece en un leak.</li>
            <li>Registrá cada rotación usando el botón "Rotar" para que el sistema lleve el historial.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
