import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Tag, CheckCircle2, XCircle, Info } from "lucide-react";
import type { CostCenter } from "@shared/schema";

export default function CostCentersAbmPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [nombre, setNombre] = useState("");

  const { data: costCenters = [], isLoading } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers?all=1"],
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/cost-centers", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers?all=1"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      toast({ title: "Centro de costo creado" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest("PATCH", `/api/cost-centers/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers?all=1"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      toast({ title: "Centro de costo actualizado" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setNombre("");
    setDialogOpen(true);
  }

  function openEdit(c: CostCenter) {
    setEditing(c);
    setNombre(c.nombre);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setNombre("");
  }

  function handleSubmit() {
    if (!nombre.trim()) return toast({ title: "El nombre es requerido", variant: "destructive" });
    if (editing) {
      updateMutation.mutate({ id: editing.id, body: { nombre: nombre.trim() } });
    } else {
      createMutation.mutate({ nombre: nombre.trim() });
    }
  }

  function toggleActivo(c: CostCenter) {
    updateMutation.mutate({ id: c.id, body: { activo: !c.activo } });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Centros de Costo</h1>
            <p className="text-sm text-muted-foreground">
              Lista de áreas disponibles para clasificar Facturas de Compra
            </p>
          </div>
        </div>
        <Button onClick={openCreate} data-testid="button-nuevo-centro-costo">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Centro de Costo
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          El Centro de Costo es <strong>informativo</strong>: se muestra en las facturas de compra pero
          no agrupa el reporte "Costos por Departamento". Ese reporte agrupa por el <strong>código de la
          Cuenta Contable</strong> vinculada a cada factura (Plan de Cuentas). Para que un gasto aparezca
          bajo un departamento en los reportes, asegurate de elegir también la Cuenta Contable correcta.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Centros de costo disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : costCenters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay centros de costo. Creá el primero.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase">
                    <th className="text-left py-2 px-3 font-medium">Nombre</th>
                    <th className="text-left py-2 px-3 font-medium">Estado</th>
                    <th className="text-right py-2 px-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {costCenters.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-centro-costo-${c.id}`}>
                      <td className="py-3 px-3 font-medium">{c.nombre}</td>
                      <td className="py-3 px-3">
                        {c.activo ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />Activo
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground text-xs">
                            <XCircle className="h-3.5 w-3.5" />Inactivo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex justify-end gap-2 items-center">
                          <div className="flex items-center gap-2 mr-2">
                            <Switch
                              checked={!!c.activo}
                              onCheckedChange={() => toggleActivo(c)}
                              data-testid={`switch-activo-centro-costo-${c.id}`}
                            />
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openEdit(c)}
                            data-testid={`button-edit-centro-costo-${c.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Centro de Costo" : "Nuevo Centro de Costo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="centro-costo-nombre">Nombre *</Label>
            <Input
              id="centro-costo-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Eventos"
              data-testid="input-centro-costo-nombre"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-submit-centro-costo">
              {editing ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
