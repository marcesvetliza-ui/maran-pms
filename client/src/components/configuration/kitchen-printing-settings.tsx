import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { KitchenPrintingSettings } from "@shared/kitchen-printing";

const url = "/api/kitchen-printing/settings";
export function KitchenPrintingSettingsPanel() {
  const { toast } = useToast();
  const query = useQuery<KitchenPrintingSettings>({ queryKey: [url] });
  const save = useMutation({
    mutationFn: async (settings: KitchenPrintingSettings) => (await apiRequest("PUT", url, settings)).json(),
    onSuccess: (settings) => {
      queryClient.setQueryData([url], settings);
      toast({ title: "Configuración guardada" });
    },
    onError: () => toast({ title: "No se pudo guardar. Volvé a intentarlo.", variant: "destructive" }),
  });
  return <Card>
    <CardHeader>
      <CardTitle>Impresión de comandas</CardTitle>
      <CardDescription>Control exclusivo de administradores. Restaurant y SPA–Justo se configuran por separado.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
        Conexión con las impresoras pendiente. Estos controles guardan la configuración; la impresión automática y las pruebas estarán disponibles cuando se instale el servicio local en la computadora del chef.
      </div>
      {query.isError ? <div role="alert">No se pudo consultar la configuración. <Button variant="outline" onClick={() => query.refetch()}>Reintentar</Button></div> : query.data ?
        (Object.entries({ restaurant: "Restaurant", spaJusto: "SPA–Justo" }) as [keyof KitchenPrintingSettings, string][]).map(([key, title]) =>
          <div key={key} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-2"><Label htmlFor={`printing-${key}`}>Impresión de {title}</Label><div><Badge variant="secondary">{query.data![key] ? "Habilitada en configuración" : "Impresión deshabilitada"}</Badge></div></div>
            <Switch id={`printing-${key}`} checked={query.data![key]} disabled={save.isPending} onCheckedChange={(checked) => save.mutate({ ...query.data!, [key]: checked })} />
          </div>) : <p>Cargando configuración…</p>}
      <p className="text-sm text-muted-foreground">Comida y postres a cocina fría y caliente. Bebidas y cafetería sin impresión. Al habilitar, no deben imprimirse pedidos anteriores.</p>
      <div className="grid gap-3 sm:grid-cols-3">{[["Cocina fría", "190.168.0.186"], ["Cocina caliente", "190.168.0.187"], ["Barra Justo", "190.168.0.253"]].map(([name, ip]) => <div key={ip} className="rounded-lg border p-4 space-y-2"><p className="font-medium">{name}</p><p className="text-sm text-muted-foreground">{ip} · /16</p><Button variant="outline" disabled title="Requiere instalar el servicio local">Imprimir prueba</Button></div>)}</div>
    </CardContent>
  </Card>;
}
