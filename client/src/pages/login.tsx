import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Hotel, LogIn, AlertCircle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LoginForm {
  username: string;
  password: string;
}

interface LoginPageProps {
  onLogin: (user: any) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pending2FA, setPending2FA] = useState(false);
  const [code, setCode] = useState("");
  const sessionExpired = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("session_expired") === "1";

  const { register, handleSubmit } = useForm<LoginForm>({
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Error de autenticación");
      }
      const user = await res.json();
      if (user.pending2FA) {
        setPending2FA(true);
        return;
      }
      onLogin(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit2FA = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Código incorrecto");
      }
      const user = await res.json();
      onLogin(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md" data-testid="card-login">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Hotel className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-hotel-name">Maran Suites & Towers</h1>
            <p className="text-sm text-muted-foreground mt-1">Sistema de Gestión Hotelera</p>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {pending2FA ? (
            <form
              onSubmit={(e) => { e.preventDefault(); onSubmit2FA(); }}
              className="space-y-4"
              data-testid="form-2fa-verify"
            >
              <div className="text-center space-y-1">
                <ShieldCheck className="w-6 h-6 mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">
                  Ingresá el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de respaldo.
                </p>
              </div>
              {error && (
                <Alert variant="destructive" data-testid="alert-login-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="2fa-code">Código</Label>
                <Input
                  id="2fa-code"
                  placeholder="123456"
                  autoComplete="one-time-code"
                  autoFocus
                  data-testid="input-2fa-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || !code} data-testid="button-verify-2fa">
                {isLoading ? "Verificando..." : "Verificar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setPending2FA(false); setCode(""); setError(null); }}
              >
                Volver
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {sessionExpired && !error && (
                <Alert className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="alert-session-expired">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Tu sesión expiró. Por favor ingresá nuevamente.</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" data-testid="alert-login-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  placeholder="Ingrese su usuario"
                  autoComplete="username"
                  data-testid="input-username"
                  {...register("username", { required: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <PasswordInput
                  id="password"
                  placeholder="Ingrese su contraseña"
                  autoComplete="current-password"
                  data-testid="input-password"
                  {...register("password", { required: true })}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  "Ingresando..."
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Iniciar Sesión
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
