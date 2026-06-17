import { useState } from "react";
import { useLocation } from "wouter";
import {
  Hotel,
  Search,
  Loader2,
  AlertCircle,
  ArrowRight,
  KeyRound,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PreIngresoPage() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !lastName.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ code: code.trim().toUpperCase(), lastName: lastName.trim() });
      const res = await fetch(`/api/public/reservation-lookup?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo encontrar la reserva");
        return;
      }
      navigate(`/web-checkin/${data.token}`);
    } catch {
      setError("Error de conexión. Por favor intente nuevamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-md">
              <Hotel className="h-9 w-9 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Maran Suites & Towers</h1>
          <p className="text-muted-foreground text-sm">Pre-Ingreso en línea</p>
        </div>

        {/* Form */}
        <Card className="shadow-lg">
          <CardContent className="p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="font-semibold text-lg">Localizar reserva</h2>
              <p className="text-sm text-muted-foreground">
                Ingresá tu código de reserva y apellido para comenzar el pre-ingreso.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code" className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Código de reserva
                </Label>
                <Input
                  id="code"
                  placeholder="Ej: RES-2025-0001"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  className="font-mono tracking-widest"
                  data-testid="input-lookup-code"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Apellido del titular
                </Label>
                <Input
                  id="lastName"
                  placeholder="Ej: García"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  autoCapitalize="words"
                  data-testid="input-lookup-lastname"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!code.trim() || !lastName.trim() || isLoading}
                data-testid="button-lookup-submit"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Buscando...</>
                ) : (
                  <><Search className="h-4 w-4 mr-2" />Buscar reserva<ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground px-4">
          ¿No tenés el código? Comunicate con recepción al llegar al hotel.
        </p>
      </div>
    </div>
  );
}
