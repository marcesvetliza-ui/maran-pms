import { useLocation } from "wouter";
import { useAuth } from "@/App";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { SpaAccountFolio } from "./spa-account-folio";

/** One account identity, read from the URL. No stale browser amount/recipient
 * snapshot and no invocation of the legacy EmitirFacturaDialog for this account. */
export function SpaReceiptWorkspace({ accountId }: { accountId: string }) {
  const { user, hasPermission } = useAuth(),
    [, navigate] = useLocation(),
    { toast } = useToast();
  if (!user) return <p className="p-6">Verificando sesión…</p>;
  if (
    !hasPermission("api:emitir-comprobante:spa") ||
    !hasPermission("funding:read")
  )
    return (
      <p role="alert" className="p-6">
        No tenés permiso para consultar comprobantes SPA.
      </p>
    );
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Emitir comprobante · SPA
          </p>
          <h1 className="text-2xl font-semibold">Comprobante del turno</h1>
          <p className="text-sm text-muted-foreground">
            Revisá los cargos y el destinatario. Confirmar es el único paso que
            registra el cobro y emite.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/spa")}>
          Volver al planning SPA
        </Button>
      </header>
      <SpaAccountFolio
        accountId={accountId}
        userId={user.id}
        canWrite={hasPermission("funding:write")}
        initialTab="billing"
        onCompleted={() => {
          void queryClient.invalidateQueries({
            queryKey: ["/api/spa/accounts"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["/api/spa/appointments"],
          });
          toast({
            title: "Operación SPA completada",
            description:
              "Podés consultar los movimientos y comprobantes en el historial.",
          });
        }}
      />
    </main>
  );
}
