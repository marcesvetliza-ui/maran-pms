import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Store, CheckCircle2, XCircle } from "lucide-react";

type PosConfig = {
  id: number;
  nombre: string;
  numero: number;
  area: string;
  tipo: string;
  descripcion: string | null;
  activo: boolean;
};

const AREAS: Record<string, string> = {
  recepcion: "Recepción",
  restaurant: "Restaurant",
  spa: "SPA",
  eventos: "Eventos",
  general: "General",
};

const TIPOS: Record<string, string> = {
  electronico: "Electrónico (ARCA)",
  manual: "Manual",
};

const emptyForm = () => ({
  nombre: "",
  numero: "",
  area: "recepcion",
  tipo: "electronico",
  descripcion: "",
  activo: true,
});

export default function PosConfigsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: posConfigs = [], isLoading } = useQuery<PosConfig[]>({
    queryKey: ["/api/pos-configs"],
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/pos-configs", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-configs"] });
      toast({ title: "Punto de Venta creado" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest("PATCH", `/api/pos-configs/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-configs"] });
      toast({ title: "Punto de Venta actualizado" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/pos-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-configs"] });
      toast({ title: "Punto de Venta eliminado" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(p: PosConfig) {
    setEditingId(p.id);
    setForm({
      nombre: p.nombre,
      numero: String(p.numero),
      area: p.area,
      tipo: p.tipo,
      descripcion: p.descripcion ?? "",
      activo: p.activo,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function handleSubmit() {
    if (!form.nombre.trim()) return toast({ title: "El nombre es requerido", variant: "destructive" });
    if (!form.numero || isNaN(parseInt(form.numero))) return toast({ title: "El número de PV es requerido", variant: "destructive" });
    const body = {
      nombre: form.nombre.trim(),
      numero: parseInt(form.numero),
      area: form.area,
      tipo: form.tipo,
      descripcion: form.descripcion.trim() || null,
      activo: form.activo,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Store className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Puntos de Venta</h1>
            <p className="text-sm text-muted-foreground">
              Configuración de PV autorizados por ARCA para facturación electrónica y manuales
            </p>
          </div>
        </div>
        <Button onClick={openCreate} data-testid="button-nuevo-pv">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo PV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Puntos de Venta configurados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : posConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay puntos de venta configurados. Creá el primero.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase">
                    <th className="text-left py-2 px-3 font-medium">Número</th>
                    <th className="text-left py-2 px-3 font-medium">Nombre</th>
                    <th className="text-left py-2 px-3 font-medium">Área</th>
                    <th className="text-left py-2 px-3 font-medium">Tipo</th>
                    <th className="text-left py-2 px-3 font-medium">Descripción</th>
                    <th className="text-left py-2 px-3 font-medium">Estado</th>
                    <th className="text-right py-2 px-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {posConfigs.map(p => (
                    <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-pv-${p.id}`}>
                      <td className="py-3 px-3">
                        <span className="font-mono font-semibold text-base">
                          {String(p.numero).padStart(4, "0")}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium">{p.nombre}</td>
                      <td className="py-3 px-3 text-muted-foreground">{AREAS[p.area] ?? p.area}</td>
                      <td className="py-3 px-3">
                        <Badge variant={p.tipo === "electronico" ? "default" : "secondary"}>
                          {TIPOS[p.tipo] ?? p.tipo}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-xs max-w-[200px] truncate">
                        {p.descripcion || "—"}
                      </td>
                      <td className="py-3 px-3">
                        {p.activo ? (
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
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openEdit(p)}
                            data-testid={`button-edit-pv-${p.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(p.id)}
                            data-testid={`button-delete-pv-${p.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Editar Punto de Venta" : "Nuevo Punto de Venta"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pv-numero">Número ARCA / AFIP *</Label>
                <Input
                  id="pv-numero"
                  type="number"
                  min="1"
                  value={form.numero}
                  onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="0001"
                  data-testid="input-pv-numero"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pv-nombre">Nombre *</Label>
                <Input
                  id="pv-nombre"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Recepción"
                  data-testid="input-pv-nombre"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Área</Label>
                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v }))}>
                  <SelectTrigger data-testid="select-pv-area"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recepcion">Recepción</SelectItem>
                    <SelectItem value="restaurant">Restaurant</SelectItem>
                    <SelectItem value="spa">SPA</SelectItem>
                    <SelectItem value="eventos">Eventos</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger data-testid="select-pv-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electronico">Electrónico (ARCA)</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pv-descripcion">Descripción (opcional)</Label>
              <Input
                id="pv-descripcion"
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="PV electrónico para alojamiento…"
                data-testid="input-pv-descripcion"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pv-activo"
                checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="h-4 w-4 cursor-pointer"
                data-testid="checkbox-pv-activo"
              />
              <label htmlFor="pv-activo" className="text-sm cursor-pointer select-none">Activo</label>
            </div>

            {form.tipo === "electronico" && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                Los PV electrónicos deben estar habilitados en ARCA y coincidir con el certificado digital configurado en Facturación.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancelar-pv">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-guardar-pv">
              {isPending ? "Guardando…" : editingId !== null ? "Guardar cambios" : "Crear PV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Eliminar Punto de Venta</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Confirmar eliminación? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              data-testid="button-confirmar-eliminar-pv"
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
