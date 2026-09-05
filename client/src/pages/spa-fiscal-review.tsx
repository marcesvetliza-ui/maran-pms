import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { fmtMoney, formatDateAR } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type FiscalDraft = {
  id: number;
  spa_account_id: string;
  tipo_comprobante: string;
  punto_venta: number;
  numero: number;
  fecha_emision: string;
  monto_total: string;
  cliente_razon_social: string;
  cash_forma_pago: string | null;
  items: Array<{ description?: string; quantity?: number; unitPrice?: number; subtotal?: number }> | null;
  observaciones: string | null;
  reconciliation_error: string | null;
  reconciliation_updated_at: string | null;
  created_at: string | null;
  guest_name: string | null;
  spa_account_status: string | null;
  linked_invoice_id: number | null;
  spa_account_total: string;
};

function fiscalNumber(draft: FiscalDraft) {
  return `${draft.tipo_comprobante} ${String(draft.punto_venta).padStart(4, "0")}-${String(draft.numero).padStart(8, "0")}`;
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SpaFiscalReviewPage() {
  const { toast } = useToast();
  const [detail, setDetail] = useState<FiscalDraft | null>(null);
  const [action, setAction] = useState<{ draft: FiscalDraft; kind: "keep" | "discard" } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const { data: drafts = [], isLoading, isFetching, refetch } = useQuery<FiscalDraft[]>({
    queryKey: ["/api/admin/spa/fiscal-drafts"],
    queryFn: async () => {
      const response = await fetch("/api/admin/spa/fiscal-drafts", { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    staleTime: 0,
  });

  const grouped = useMemo(() => {
    const result = new Map<string, FiscalDraft[]>();
    drafts.forEach((draft) => result.set(draft.spa_account_id, [...(result.get(draft.spa_account_id) || []), draft]));
    return [...result.entries()];
  }, [drafts]);

  const resolveMutation = useMutation({
    mutationFn: ({ draft, kind }: { draft: FiscalDraft; kind: "keep" | "discard" }) =>
      apiRequest("POST", `/api/admin/spa/fiscal-drafts/${draft.id}/resolve`, {
        action: kind,
        reason,
        confirmation,
      }),
    onSuccess: async (response: Response) => {
      const result = await response.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/spa/fiscal-drafts"] });
      setAction(null);
      setReason("");
      setConfirmation("");
      toast({
        title: result.action === "keep" ? "Borrador conservado" : "Borrador descartado",
        description: result.action === "keep"
          ? "No se contactó ARCA. El borrador quedó habilitado para reanudarlo desde el folio SPA."
          : "El borrador quedó cerrado y no puede recuperarse automáticamente.",
      });
    },
    onError: (error: any) => toast({ title: parseApiError(error), variant: "destructive" }),
  });

  const openAction = (draft: FiscalDraft, kind: "keep" | "discard") => {
    setReason("");
    setConfirmation("");
    setAction({ draft, kind });
  };
  const expected = action ? `${action.kind === "keep" ? "CONSERVAR" : "DESCARTAR"} ${action.draft.id}` : "";

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Revisión fiscal SPA</h1>
          <p className="text-sm text-muted-foreground mt-1">Borradores duplicados bloqueados antes de contactar ARCA.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Actualizar
        </Button>
      </div>

      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Operación fiscal protegida</AlertTitle>
        <AlertDescription>
          Conservar un borrador descarta sus duplicados, pero no solicita CAE. Para contactar ARCA todavía deberá reanudarse
          explícitamente desde el folio SPA. Descartar es irreversible y deja el borrador fuera de toda recuperación automática.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Cargando revisiones…</CardContent></Card>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
          <p className="font-medium">No hay borradores SPA pendientes de revisión</p>
        </CardContent></Card>
      ) : grouped.map(([accountId, accountDrafts]) => (
        <Card key={accountId}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              Folio {accountId}
              <Badge variant="destructive">{accountDrafts.length} borradores bloqueados</Badge>
              <span className="font-normal text-muted-foreground">{accountDrafts[0].guest_name || "Sin huésped"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Número reservado</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Importe</TableHead>
                <TableHead>Bloqueo</TableHead><TableHead className="text-right">Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>{accountDrafts.map((draft) => (
                <TableRow key={draft.id}>
                  <TableCell><div className="font-medium">{fiscalNumber(draft)}</div><div className="text-xs text-muted-foreground">Borrador #{draft.id}</div></TableCell>
                  <TableCell><div>{formatDateAR(draft.fecha_emision)}</div><div className="text-xs text-muted-foreground">{formatTimestamp(draft.created_at)}</div></TableCell>
                  <TableCell className="text-right font-medium">${fmtMoney(draft.monto_total)}</TableCell>
                  <TableCell className="max-w-sm"><div className="flex gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{draft.reconciliation_error || "Requiere revisión fiscal"}</span></div></TableCell>
                  <TableCell><div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetail(draft)}><Eye className="w-4 h-4 mr-1" />Comparar</Button>
                    <Button size="sm" variant="outline" onClick={() => openAction(draft, "discard")}><Trash2 className="w-4 h-4 mr-1" />Descartar</Button>
                    <Button size="sm" onClick={() => openAction(draft, "keep")}><CheckCircle2 className="w-4 h-4 mr-1" />Conservar</Button>
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Comparación del borrador</DialogTitle><DialogDescription>Datos inmutables guardados antes de solicitar autorización fiscal.</DialogDescription></DialogHeader>
          {detail && <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Número reservado</Label><p className="font-medium">{fiscalNumber(detail)}</p></div>
              <div><Label>Cliente</Label><p className="font-medium">{detail.cliente_razon_social}</p></div>
              <div><Label>Total del borrador</Label><p className="font-medium">${fmtMoney(detail.monto_total)}</p></div>
              <div><Label>Total actual del folio</Label><p className="font-medium">${fmtMoney(detail.spa_account_total)}</p></div>
              <div><Label>Forma de pago</Label><p>{detail.cash_forma_pago || "No informada"}</p></div>
              <div><Label>Estado del folio</Label><p>{detail.spa_account_status || "No disponible"}</p></div>
            </div>
            <div><Label>Conceptos conservados</Label><div className="mt-1 border rounded-md divide-y">
              {(detail.items || []).map((item, index) => <div key={index} className="p-2 flex justify-between"><span>{item.description || `Concepto ${index + 1}`} × {item.quantity || 1}</span><span>${fmtMoney(item.subtotal ?? 0)}</span></div>)}
              {!detail.items?.length && <div className="p-2 text-muted-foreground">No hay conceptos conservados.</div>}
            </div></div>
            {Math.abs(Number(detail.monto_total) - Number(detail.spa_account_total)) > 0.02 && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>El importe ya no coincide</AlertTitle><AlertDescription>No conserve este borrador hasta verificar por qué cambió el folio.</AlertDescription></Alert>}
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.kind === "keep" ? "Conservar este borrador" : "Descartar este borrador"}</DialogTitle>
            <DialogDescription>
              {action?.kind === "keep"
                ? "Los demás borradores bloqueados del folio se descartarán. Esta acción no contacta ARCA."
                : "Este borrador quedará fuera de toda recuperación automática. Esta acción no puede deshacerse."}
            </DialogDescription>
          </DialogHeader>
          {action && <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm"><strong>{fiscalNumber(action.draft)}</strong> — ${fmtMoney(action.draft.monto_total)}</div>
            <div><Label htmlFor="review-reason">Motivo auditado</Label><Textarea id="review-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explique cómo verificó cuál borrador corresponde…" /></div>
            <div><Label htmlFor="review-confirmation">Escriba <strong>{expected}</strong> para confirmar</Label><Input id="review-confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /></div>
            <Button
              className="w-full"
              variant={action.kind === "discard" ? "destructive" : "default"}
              disabled={reason.trim().length < 10 || confirmation !== expected || resolveMutation.isPending}
              onClick={() => resolveMutation.mutate(action)}
            >
              {resolveMutation.isPending ? "Procesando…" : action.kind === "keep" ? "Conservar sin contactar ARCA" : "Descartar definitivamente"}
            </Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}