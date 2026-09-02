import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Eye,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import type {
  OrphanedRoomTypeReference,
  RoomType,
  RoomTypeReference,
  RoomTypeReferencePreview,
  RoomTypeReassignmentResult,
} from "@shared/schema";

type IntegrityResponse = {
  orphanedReferences: OrphanedRoomTypeReference[];
};

const SOURCE_LABELS: Record<RoomTypeReference["source"], string> = {
  rooms: "Habitaciones",
  rate_plans: "Planes tarifarios",
  reservations: "Reservas",
  reservation_history: "Historial de reservas",
  group_room_blocks: "Bloques de habitaciones grupales",
  packages: "Paquetes",
  package_room_prices: "Precios por tipo de paquete",
};

function sourceLabel(source: RoomTypeReference["source"]) {
  return SOURCE_LABELS[source] ?? source;
}

function formatCount(count: number) {
  return `${count} ${count === 1 ? "referencia" : "referencias"}`;
}

function getTotalReferences(references: RoomTypeReference[]) {
  return references.reduce((total, reference) => total + reference.count, 0);
}

function referenceExportUrl(roomTypeId: string, source: RoomTypeReference["source"]) {
  const params = new URLSearchParams({ roomTypeId, source });
  return `/api/room-types/integrity/export?${params.toString()}`;
}

export default function RoomTypeIntegrityPage() {
  const { toast } = useToast();
  const [selectedTargetBySource, setSelectedTargetBySource] = useState<Record<string, string>>({});
  const [pendingRepair, setPendingRepair] = useState<{
    orphan: OrphanedRoomTypeReference;
    targetId: string;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [lastResult, setLastResult] = useState<RoomTypeReassignmentResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [previewSelection, setPreviewSelection] = useState<{
    roomTypeId: string;
    source: RoomTypeReference["source"];
  } | null>(null);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  const integrityQuery = useQuery<IntegrityResponse>({
    queryKey: ["/api/room-types/integrity"],
  });
  const roomTypesQuery = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });
  const previewQuery = useQuery<RoomTypeReferencePreview>({
    queryKey: [
      "/api/room-types/integrity/preview",
      previewSelection?.roomTypeId ?? "",
      previewSelection?.source ?? "",
      previewRefreshKey,
    ],
    enabled: Boolean(previewSelection),
    staleTime: 0,
    queryFn: async () => {
      if (!previewSelection) {
        throw new Error("Seleccioná un origen para ver la vista previa");
      }
      const params = new URLSearchParams({
        roomTypeId: previewSelection.roomTypeId,
        source: previewSelection.source,
        limit: "50",
      });
      const response = await fetch(`/api/room-types/integrity/preview?${params.toString()}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json() as Promise<RoomTypeReferencePreview>;
    },
  });

  const orphanedReferences = integrityQuery.data?.orphanedReferences ?? [];
  const roomTypes = roomTypesQuery.data ?? [];
  const totalReferences = useMemo(
    () => orphanedReferences.reduce((total, orphan) => total + getTotalReferences(orphan.references), 0),
    [orphanedReferences],
  );
  const referencesBySource = useMemo(() => {
    const totals = new Map<RoomTypeReference["source"], number>();
    orphanedReferences.forEach((orphan) => {
      orphan.references.forEach((reference) => {
        totals.set(reference.source, (totals.get(reference.source) ?? 0) + reference.count);
      });
    });
    return Array.from(totals.entries()).sort(([, countA], [, countB]) => countB - countA);
  }, [orphanedReferences]);

  const reassignMutation = useMutation({
    mutationFn: async ({ fromRoomTypeId, toRoomTypeId }: { fromRoomTypeId: string; toRoomTypeId: string }) => {
      const response = await apiRequest("POST", "/api/room-types/reassign-references", {
        fromRoomTypeId,
        toRoomTypeId,
      });
      return response.json() as Promise<RoomTypeReassignmentResult>;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setLastError(null);
      setPendingRepair(null);
      setPreviewSelection(null);
      setConfirmed(false);
      queryClient.invalidateQueries({ queryKey: ["/api/room-types/integrity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/room-types"] });
      toast({
        title: "Referencias reparadas",
        description: `${getTotalReferences(result.updated)} referencias fueron reasignadas de forma atómica.`,
      });
    },
    onError: (error) => {
      const message = parseApiError(error);
      setLastError(message);
      setLastResult(null);
      toast({
        title: "No se aplicaron cambios",
        description: message,
        variant: "destructive",
      });
    },
  });

  const isLoading = integrityQuery.isLoading || roomTypesQuery.isLoading;
  const queryError = integrityQuery.error || roomTypesQuery.error;

  function selectTarget(orphanId: string, targetId: string) {
    setSelectedTargetBySource((current) => ({ ...current, [orphanId]: targetId }));
    setLastError(null);
  }

  function togglePreview(roomTypeId: string, source: RoomTypeReference["source"]) {
    if (previewSelection?.roomTypeId === roomTypeId && previewSelection.source === source) {
      setPreviewSelection(null);
      return;
    }
    setPreviewSelection({ roomTypeId, source });
    setPreviewRefreshKey((current) => current + 1);
  }

  function openRepairConfirmation(orphan: OrphanedRoomTypeReference) {
    const targetId = selectedTargetBySource[orphan.roomTypeId];
    if (!targetId || !roomTypes.some((roomType) => roomType.id === targetId)) {
      toast({
        title: "Seleccioná un tipo destino válido",
        description: "El destino debe existir en el catálogo actual.",
        variant: "destructive",
      });
      return;
    }
    setConfirmed(false);
    setPendingRepair({ orphan, targetId });
  }

  function closeRepairConfirmation() {
    if (reassignMutation.isPending) return;
    setPendingRepair(null);
    setConfirmed(false);
  }

  function confirmRepair() {
    if (!pendingRepair || !confirmed || reassignMutation.isPending) return;
    reassignMutation.mutate({
      fromRoomTypeId: pendingRepair.orphan.roomTypeId,
      toRoomTypeId: pendingRepair.targetId,
    });
  }

  function refresh() {
    setLastError(null);
    setLastResult(null);
    setPreviewSelection(null);
    void integrityQuery.refetch();
    void roomTypesQuery.refetch();
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reparar tipos de habitación</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Revisá referencias históricas que apuntan a tipos eliminados y reasignalas sin perder datos.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isLoading}
          data-testid="button-refresh-room-type-integrity"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Actualizar diagnóstico
        </Button>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Reparación segura</AlertTitle>
        <AlertDescription>
          La reasignación se ejecuta en una única transacción. Si una fuente falla, se revierten todos los cambios y se conservan las referencias originales.
          No se agregan restricciones nuevas hasta resolver estos históricos.
        </AlertDescription>
      </Alert>

      {queryError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo cargar el diagnóstico</AlertTitle>
          <AlertDescription>{parseApiError(queryError)}</AlertDescription>
        </Alert>
      )}

      {lastResult && (
        <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Reparación completada</AlertTitle>
          <AlertDescription>
            Se actualizaron {formatCount(getTotalReferences(lastResult.updated))} desde <strong>{lastResult.fromRoomTypeId}</strong> hacia el tipo destino seleccionado.
            {lastResult.updated.length > 0 && (
              <span className="mt-1 block">
                Fuentes actualizadas: {lastResult.updated.map((reference) => `${sourceLabel(reference.source)} (${reference.count})`).join(", ")}.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {lastError && !reassignMutation.isPending && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>La reparación no modificó datos</AlertTitle>
          <AlertDescription>{lastError} Volvé a revisar el diagnóstico antes de intentar nuevamente.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tipos huérfanos</CardDescription>
            <CardTitle className="text-3xl">{isLoading ? "…" : orphanedReferences.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Identificadores que ya no existen en el catálogo.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Referencias afectadas</CardDescription>
            <CardTitle className="text-3xl">{isLoading ? "…" : totalReferences}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Registros que requieren una decisión de destino.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Orígenes detectados</CardDescription>
            <CardTitle className="text-3xl">{isLoading ? "…" : referencesBySource.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Fuentes agrupadas en el diagnóstico actual.</CardContent>
        </Card>
      </div>

      {!isLoading && orphanedReferences.length === 0 && !queryError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <div>
              <h2 className="font-semibold">No hay referencias huérfanas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Todas las referencias apuntan a tipos de habitación vigentes.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {referencesBySource.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Impacto agrupado por origen</CardTitle>
            <CardDescription>Vista previa de los registros que cambiarían al reparar cada tipo huérfano.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {referencesBySource.map(([source, count]) => (
                <div key={source} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{sourceLabel(source)}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {orphanedReferences.map((orphan) => {
          const targetId = selectedTargetBySource[orphan.roomTypeId] ?? "";
          const target = roomTypes.find((roomType) => roomType.id === targetId);
          const totalForOrphan = getTotalReferences(orphan.references);

          return (
            <Card key={orphan.roomTypeId} data-testid={`card-orphan-room-type-${orphan.roomTypeId}`}>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-mono text-lg">{orphan.roomTypeId}</CardTitle>
                      <Badge variant="destructive">No existe en catálogo</Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {formatCount(totalForOrphan)} distribuidas en {orphan.references.length} {orphan.references.length === 1 ? "origen" : "orígenes"}.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    Vista previa disponible
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {orphan.references.map((reference) => (
                    <div key={reference.source} className="rounded-md bg-muted/50 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{sourceLabel(reference.source)}</div>
                          <div className="text-xs text-muted-foreground">{formatCount(reference.count)} cambiarían</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs"
                          onClick={() => togglePreview(orphan.roomTypeId, reference.source)}
                          data-testid={`button-preview-${orphan.roomTypeId}-${reference.source}`}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          {previewSelection?.roomTypeId === orphan.roomTypeId && previewSelection.source === reference.source
                            ? "Ocultar"
                            : "Ver registros"}
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 shrink-0 px-2 text-xs" asChild>
                          <a
                            href={referenceExportUrl(orphan.roomTypeId, reference.source)}
                            download
                            data-testid={`button-download-${orphan.roomTypeId}-${reference.source}`}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Descargar evidencia
                          </a>
                        </Button>
                      </div>
                      {previewSelection?.roomTypeId === orphan.roomTypeId && previewSelection.source === reference.source && (
                        <div className="mt-3 border-t pt-3" data-testid={`preview-${orphan.roomTypeId}-${reference.source}`}>
                          {previewQuery.isFetching && (
                            <p className="text-xs text-muted-foreground">Cargando registros…</p>
                          )}
                          {previewQuery.error && !previewQuery.isFetching && (
                            <div className="flex items-center justify-between gap-2 text-xs text-destructive">
                              <span>No se pudo cargar la vista previa: {parseApiError(previewQuery.error)}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 shrink-0 px-2 text-xs"
                                onClick={() => void previewQuery.refetch()}
                              >
                                Reintentar
                              </Button>
                            </div>
                          )}
                          {previewQuery.data && !previewQuery.isFetching && (
                            <>
                              <p className="mb-2 text-xs text-muted-foreground">
                                Mostrando {previewQuery.data.records.length} de {previewQuery.data.total} registros.
                                {previewQuery.data.hasMore && " La lista está acotada; todavía hay más registros."}
                              </p>
                              <div className="max-h-48 overflow-y-auto rounded border bg-background p-2">
                                <ul className="grid gap-1 sm:grid-cols-2">
                                  {previewQuery.data.records.map((record) => (
                                    <li key={record.id} className="flex min-w-0 items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
                                      <span className="truncate" title={record.label}>{record.label}</span>
                                      <code className="max-w-[45%] shrink-0 truncate text-[10px] text-muted-foreground" title={record.id}>{record.id}</code>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div className="grid gap-2">
                    <Label htmlFor={`target-room-type-${orphan.roomTypeId}`}>Tipo destino válido</Label>
                    <Select
                      value={targetId}
                      onValueChange={(value) => selectTarget(orphan.roomTypeId, value)}
                    >
                      <SelectTrigger id={`target-room-type-${orphan.roomTypeId}`} data-testid={`select-target-room-type-${orphan.roomTypeId}`}>
                        <SelectValue placeholder="Seleccioná un tipo vigente" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes
                          .filter((roomType) => Boolean(roomType.id) && roomType.id !== orphan.roomTypeId)
                          .map((roomType) => (
                            <SelectItem key={roomType.id} value={roomType.id}>
                              {roomType.name} ({roomType.code})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {target && (
                      <p className="text-xs text-muted-foreground">
                        Se asignarán {formatCount(totalForOrphan)} al tipo <strong>{target.name}</strong>.
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => openRepairConfirmation(orphan)}
                    disabled={!targetId || reassignMutation.isPending || roomTypes.length === 0}
                    data-testid={`button-repair-room-type-${orphan.roomTypeId}`}
                  >
                    <Wrench className="mr-2 h-4 w-4" />
                    Revisar y reasignar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {orphanedReferences.length > 0 && roomTypes.length === 0 && !isLoading && (
        <Alert variant="destructive">
          <Database className="h-4 w-4" />
          <AlertTitle>No hay destinos disponibles</AlertTitle>
          <AlertDescription>Creá al menos un tipo de habitación vigente antes de reparar estas referencias.</AlertDescription>
        </Alert>
      )}

      <AlertDialog open={Boolean(pendingRepair)} onOpenChange={(open) => !open && closeRepairConfirmation()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar reasignación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se actualizarán todas las referencias de <strong className="font-mono">{pendingRepair?.orphan.roomTypeId}</strong> al tipo vigente seleccionado.
              Esta operación incluye {pendingRepair ? formatCount(getTotalReferences(pendingRepair.orphan.references)) : "las referencias detectadas"} y no elimina ningún registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>Destino</span>
              <strong>{roomTypes.find((roomType) => roomType.id === pendingRepair?.targetId)?.name ?? pendingRepair?.targetId}</strong>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-room-type-repair"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              disabled={reassignMutation.isPending}
              data-testid="checkbox-confirm-room-type-repair"
            />
            <Label htmlFor="confirm-room-type-repair" className="cursor-pointer text-sm leading-5">
              Confirmo que revisé la vista previa y quiero aplicar esta reasignación.
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reassignMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmRepair();
              }}
              disabled={!confirmed || reassignMutation.isPending}
              data-testid="button-confirm-room-type-repair"
            >
              {reassignMutation.isPending ? "Reasignando…" : "Confirmar reasignación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}