import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, BookOpen, CheckCircle2, XCircle, Info } from "lucide-react";
import type { AccountingAccount } from "@shared/schema";

const TIPOS: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  patrimonio_neto: "Patrimonio Neto",
  ingreso: "Ingreso",
  egreso: "Egreso",
};

const emptyForm = () => ({ codigo: "", nombre: "", tipo: "egreso", nivel: "1" });

export default function AccountingAccountsAbmPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingAccount | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");

  const { data: accounts = [], isLoading } = useQuery<AccountingAccount[]>({
    queryKey: ["/api/accounting-accounts?all=1"],
  });

  const filtered = accounts.filter((a) =>
    a.codigo.toLowerCase().includes(search.toLowerCase()) ||
    a.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/accounting-accounts", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-accounts?all=1"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-accounts"] });
      toast({ title: "Cuenta creada" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest("PATCH", `/api/accounting-accounts/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-accounts?all=1"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-accounts"] });
      toast({ title: "Cuenta actualizada" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(a: AccountingAccount) {
    setEditing(a);
    setForm({ codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, nivel: String(a.nivel ?? 1) });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }

  function handleSubmit() {
    if (!form.codigo.trim()) return toast({ title: "El código es requerido", variant: "destructive" });
    if (!form.nombre.trim()) return toast({ title: "El nombre es requerido", variant: "destructive" });
    const body = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      nivel: parseInt(form.nivel) || 1,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  function toggleActivo(a: AccountingAccount) {
    updateMutation.mutate({ id: a.id, body: { activo: !a.activo } });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Plan de Cuentas</h1>
            <p className="text-sm text-muted-foreground">
              Cuentas contables usadas para clasificar facturas de compra, movimientos de caja y asientos
            </p>
          </div>
        </div>
        <Button onClick={openCreate} data-testid="button-nueva-cuenta">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cuenta
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          El reporte "Costos por Departamento" agrupa los gastos por el <strong>prefijo del código</strong> de
          la cuenta contable vinculada a cada factura de compra (por ejemplo, todo lo que empiece con
          "4.2.1.08.40" se agrupa como "Eventos"). El campo Centro de Costo de la factura es solo informativo
          y no afecta ese reporte. Si agregás una cuenta nueva para un departamento existente, usá un código
          con el mismo prefijo que las demás cuentas de ese departamento.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cuentas contables</CardTitle>
          <div className="pt-2">
            <Input
              placeholder="Buscar por código o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
              data-testid="input-buscar-cuenta"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay cuentas contables. Creá la primera.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase sticky top-0 bg-background">
                    <th className="text-left py-2 px-3 font-medium">Código</th>
                    <th className="text-left py-2 px-3 font-medium">Nombre</th>
                    <th className="text-left py-2 px-3 font-medium">Tipo</th>
                    <th className="text-left py-2 px-3 font-medium">Estado</th>
                    <th className="text-right py-2 px-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-cuenta-${a.id}`}>
                      <td className="py-3 px-3 font-mono text-xs">{a.codigo}</td>
                      <td className="py-3 px-3 font-medium">{a.nombre}</td>
                      <td className="py-3 px-3">
                        <Badge variant="secondary">{TIPOS[a.tipo] ?? a.tipo}</Badge>
                      </td>
                      <td className="py-3 px-3">
                        {a.activo ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />Activa
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground text-xs">
                            <XCircle className="h-3.5 w-3.5" />Inactiva
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex justify-end gap-2 items-center">
                          <Switch
                            checked={!!a.activo}
                            onCheckedChange={() => toggleActivo(a)}
                            data-testid={`switch-activo-cuenta-${a.id}`}
                          />
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openEdit(a)}
                            data-testid={`button-edit-cuenta-${a.id}`}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Cuenta Contable" : "Nueva Cuenta Contable"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="cuenta-codigo">Código *</Label>
              <Input
                id="cuenta-codigo"
                value={form.codigo}
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                placeholder="4.2.1.08.41"
                data-testid="input-cuenta-codigo"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cuenta-nombre">Nombre *</Label>
              <Input
                id="cuenta-nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Otros Gastos Nuevo Departamento"
                data-testid="input-cuenta-nombre"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                  <SelectTrigger data-testid="select-cuenta-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cuenta-nivel">Nivel</Label>
                <Input
                  id="cuenta-nivel"
                  type="number"
                  min="1"
                  value={form.nivel}
                  onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value }))}
                  data-testid="input-cuenta-nivel"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-submit-cuenta">
              {editing ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
