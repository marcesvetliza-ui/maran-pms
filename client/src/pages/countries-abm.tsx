import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Globe, Search, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Country } from "@shared/schema";
import { Switch } from "@/components/ui/switch";

export default function CountriesAbmPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editCountry, setEditCountry] = useState<Country | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", afipCode: "", displayOrder: "" });

  const { data: countries = [], isLoading } = useQuery<Country[]>({
    queryKey: ["/api/admin/countries"],
  });

  const filtered = countries.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    String(c.afipCode).includes(search)
  );

  const openNew = () => {
    setEditCountry(null);
    setForm({ name: "", afipCode: "", displayOrder: "" });
    setShowDialog(true);
  };

  const openEdit = (c: Country) => {
    setEditCountry(c);
    setForm({ name: c.name, afipCode: String(c.afipCode), displayOrder: String(c.displayOrder || "") });
    setShowDialog(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("El nombre es obligatorio");
      if (!form.afipCode.trim() || isNaN(Number(form.afipCode))) throw new Error("El código AFIP debe ser numérico");
      const body = {
        name: form.name.trim(),
        afipCode: Number(form.afipCode),
        displayOrder: form.displayOrder ? Number(form.displayOrder) : 0,
      };
      if (editCountry) {
        return apiRequest("PATCH", `/api/admin/countries/${editCountry.id}`, body);
      }
      return apiRequest("POST", "/api/admin/countries", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/countries"] });
      toast({ title: editCountry ? "País actualizado" : "País creado" });
      setShowDialog(false);
    },
    onError: (e: any) => toast({ title: e.message || "Error al guardar", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (c: Country) => apiRequest("PATCH", `/api/admin/countries/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/countries"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/countries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/countries"] });
      toast({ title: "País eliminado" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" /> Países — Nomenclador AFIP
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lista de países con sus códigos AFIP. Usada en la ficha de clientes y para emisión de comprobantes electrónicos.
          </p>
        </div>
        <Button onClick={openNew} data-testid="btn-new-country">
          <Plus className="h-4 w-4 mr-2" /> Agregar País
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                data-testid="input-search-country"
              />
            </div>
            <Badge variant="outline">{filtered.length} países</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Cód. AFIP</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-20">Orden</TableHead>
                  <TableHead className="w-24">Activo</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} data-testid={`country-row-${c.id}`} className={!c.isActive ? "opacity-50" : ""}>
                    <TableCell className="font-mono font-medium text-sm">{c.afipCode}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.displayOrder}</TableCell>
                    <TableCell>
                      <Switch
                        checked={c.isActive}
                        onCheckedChange={() => toggleMutation.mutate(c)}
                        data-testid={`toggle-country-${c.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`btn-edit-country-${c.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)} data-testid={`btn-delete-country-${c.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {search ? "Sin resultados para la búsqueda" : "No hay países registrados"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear/editar */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editCountry ? "Editar País" : "Nuevo País"}</DialogTitle>
            <DialogDescription>
              El código AFIP se usa en la emisión de comprobantes electrónicos (ARCA).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Nombre del País *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Uruguay"
                data-testid="input-country-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Código AFIP *</Label>
                <Input
                  value={form.afipCode}
                  onChange={(e) => setForm({ ...form, afipCode: e.target.value })}
                  placeholder="Ej: 225"
                  type="number"
                  data-testid="input-country-afip-code"
                />
              </div>
              <div className="grid gap-2">
                <Label>Orden de visualización</Label>
                <Input
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                  placeholder="Ej: 10"
                  type="number"
                  data-testid="input-country-display-order"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="btn-save-country">
              {saveMutation.isPending ? "Guardando..." : editCountry ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación eliminación */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar país?</AlertDialogTitle>
            <AlertDialogDescription>
              Si el país está siendo usado en fichas de clientes, la referencia quedará como texto libre. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
