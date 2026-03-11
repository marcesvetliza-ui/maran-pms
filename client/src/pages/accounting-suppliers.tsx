import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, Pencil, Trash2, Search, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface AccountingSupplier {
  id: number;
  razonSocial: string;
  cuit: string;
  condicionIva: string;
  domicilio?: string;
  localidad?: string;
  provincia?: string;
  cp?: string;
  alicuotaIibb?: number;
  alicuotaGanancias?: number;
  alicuotaIva?: number;
  cbu?: string;
  banco?: string;
  activo?: boolean;
  saldoCc?: number;
}

const CONDICIONES_IVA = [
  "Responsable Inscripto",
  "Monotributo",
  "Exento",
  "No Responsable",
  "Consumidor Final",
];

const PROVINCIAS = [
  "Buenos Aires", "Córdoba", "Santa Fe", "Mendoza", "Entre Ríos", "Tucumán",
  "Salta", "Chaco", "Misiones", "Corrientes", "Santiago del Estero", "San Juan",
  "Jujuy", "Río Negro", "Neuquén", "Formosa", "Chubut", "San Luis", "Catamarca",
  "La Rioja", "La Pampa", "Santa Cruz", "Tierra del Fuego", "Ciudad Autónoma de Buenos Aires",
];

function camelRow(r: any): AccountingSupplier {
  return {
    id: r.id,
    razonSocial: r.razon_social,
    cuit: r.cuit,
    condicionIva: r.condicion_iva,
    domicilio: r.domicilio,
    localidad: r.localidad,
    provincia: r.provincia,
    cp: r.cp,
    alicuotaIibb: parseFloat(r.alicuota_iibb || "0"),
    alicuotaGanancias: parseFloat(r.alicuota_ganancias || "0"),
    alicuotaIva: parseFloat(r.alicuota_iva || "0"),
    cbu: r.cbu,
    banco: r.banco,
    activo: r.activo,
    saldoCc: parseFloat(r.saldo_cc || "0"),
  };
}

const emptyForm = {
  razonSocial: "", cuit: "", condicionIva: "Responsable Inscripto",
  domicilio: "", localidad: "", provincia: "Entre Ríos", cp: "",
  alicuotaIibb: "3.50", alicuotaGanancias: "0", alicuotaIva: "0",
  cbu: "", banco: "",
};

export default function AccountingSuppliers() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<AccountingSupplier | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: rawSuppliers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting-suppliers"],
  });
  const suppliers = rawSuppliers.map(camelRow);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting-suppliers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      setDialogOpen(false);
      toast({ title: "Proveedor creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/accounting-suppliers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      setDialogOpen(false);
      toast({ title: "Proveedor actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accounting-suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      setDeleteId(null);
      toast({ title: "Proveedor eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (s: AccountingSupplier) => {
    setEditing(s);
    setForm({
      razonSocial: s.razonSocial,
      cuit: s.cuit,
      condicionIva: s.condicionIva,
      domicilio: s.domicilio || "",
      localidad: s.localidad || "",
      provincia: s.provincia || "Entre Ríos",
      cp: s.cp || "",
      alicuotaIibb: String(s.alicuotaIibb ?? "3.50"),
      alicuotaGanancias: String(s.alicuotaGanancias ?? "0"),
      alicuotaIva: String(s.alicuotaIva ?? "0"),
      cbu: s.cbu || "",
      banco: s.banco || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.razonSocial || !form.cuit || !form.condicionIva) {
      toast({ title: "Complete razón social, CUIT y condición IVA", variant: "destructive" });
      return;
    }
    const payload = {
      razonSocial: form.razonSocial,
      cuit: form.cuit,
      condicionIva: form.condicionIva,
      domicilio: form.domicilio || null,
      localidad: form.localidad || null,
      provincia: form.provincia,
      cp: form.cp || null,
      alicuotaIibb: parseFloat(form.alicuotaIibb) || 0,
      alicuotaGanancias: parseFloat(form.alicuotaGanancias) || 0,
      alicuotaIva: parseFloat(form.alicuotaIva) || 0,
      cbu: form.cbu || null,
      banco: form.banco || null,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const filtered = suppliers.filter(
    (s) =>
      s.razonSocial.toLowerCase().includes(search.toLowerCase()) ||
      s.cuit.includes(search)
  );

  const f = (v: string, k: keyof typeof form) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="icon" data-testid="btn-back-admin">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Proveedores Contables</h1>
            <p className="text-sm text-muted-foreground">ABM de proveedores para el módulo contable</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Link href="/purchase-invoices">
              <Button variant="outline" data-testid="btn-go-invoices">Ver Comprobantes</Button>
            </Link>
            <Button onClick={openNew} data-testid="btn-new-supplier">
              <Plus className="h-4 w-4 mr-2" /> Nuevo Proveedor
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{suppliers.length}</div>
              <div className="text-xs text-muted-foreground">Proveedores activos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {suppliers.filter((s) => s.saldoCc && s.saldoCc > 0).length}
              </div>
              <div className="text-xs text-muted-foreground">Con saldo pendiente</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                ${suppliers.reduce((acc, s) => acc + (s.saldoCc || 0), 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-muted-foreground">Deuda total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {suppliers.filter((s) => s.condicionIva === "Responsable Inscripto").length}
              </div>
              <div className="text-xs text-muted-foreground">Resp. Inscriptos</div>
            </CardContent>
          </Card>
        </div>

        {/* Search + Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por razón social o CUIT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
                data-testid="input-search-supplier"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No se encontraron proveedores</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razón Social</TableHead>
                    <TableHead>CUIT</TableHead>
                    <TableHead>Cond. IVA</TableHead>
                    <TableHead>IIBB %</TableHead>
                    <TableHead>Ganancias %</TableHead>
                    <TableHead className="text-right">Saldo CC</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} data-testid={`row-supplier-${s.id}`}>
                      <TableCell className="font-medium">{s.razonSocial}</TableCell>
                      <TableCell className="font-mono text-sm">{s.cuit}</TableCell>
                      <TableCell>
                        <Badge variant={s.condicionIva === "Responsable Inscripto" ? "default" : "secondary"}>
                          {s.condicionIva}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.alicuotaIibb?.toFixed(2)}%</TableCell>
                      <TableCell>{s.alicuotaGanancias?.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">
                        {(s.saldoCc || 0) > 0 ? (
                          <span className="text-destructive font-semibold">
                            ${(s.saldoCc || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openEdit(s)}
                            data-testid={`btn-edit-supplier-${s.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setDeleteId(s.id)}
                            data-testid={`btn-delete-supplier-${s.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Razón Social *</Label>
              <Input value={form.razonSocial} onChange={(e) => f(e.target.value, "razonSocial")} data-testid="input-razon-social" />
            </div>
            <div>
              <Label>CUIT *</Label>
              <Input value={form.cuit} onChange={(e) => f(e.target.value, "cuit")} placeholder="20-12345678-9" data-testid="input-cuit" />
            </div>
            <div>
              <Label>Condición IVA *</Label>
              <Select value={form.condicionIva} onValueChange={(v) => f(v, "condicionIva")}>
                <SelectTrigger data-testid="select-condicion-iva">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDICIONES_IVA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Domicilio</Label>
              <Input value={form.domicilio} onChange={(e) => f(e.target.value, "domicilio")} data-testid="input-domicilio" />
            </div>
            <div>
              <Label>Localidad</Label>
              <Input value={form.localidad} onChange={(e) => f(e.target.value, "localidad")} data-testid="input-localidad" />
            </div>
            <div>
              <Label>Provincia</Label>
              <Select value={form.provincia} onValueChange={(v) => f(v, "provincia")}>
                <SelectTrigger data-testid="select-provincia">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVINCIAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Código Postal</Label>
              <Input value={form.cp} onChange={(e) => f(e.target.value, "cp")} data-testid="input-cp" />
            </div>

            <div className="col-span-2 border-t pt-3">
              <p className="text-sm font-semibold text-muted-foreground mb-3">Alícuotas de Retención</p>
            </div>
            <div>
              <Label>IIBB %</Label>
              <Input type="number" step="0.01" value={form.alicuotaIibb} onChange={(e) => f(e.target.value, "alicuotaIibb")} data-testid="input-alicuota-iibb" />
            </div>
            <div>
              <Label>Ganancias %</Label>
              <Input type="number" step="0.01" value={form.alicuotaGanancias} onChange={(e) => f(e.target.value, "alicuotaGanancias")} data-testid="input-alicuota-ganancias" />
            </div>
            <div>
              <Label>IVA %</Label>
              <Input type="number" step="0.01" value={form.alicuotaIva} onChange={(e) => f(e.target.value, "alicuotaIva")} data-testid="input-alicuota-iva" />
            </div>

            <div className="col-span-2 border-t pt-3">
              <p className="text-sm font-semibold text-muted-foreground mb-3">Datos Bancarios</p>
            </div>
            <div>
              <Label>CBU</Label>
              <Input value={form.cbu} onChange={(e) => f(e.target.value, "cbu")} data-testid="input-cbu" />
            </div>
            <div>
              <Label>Banco</Label>
              <Input value={form.banco} onChange={(e) => f(e.target.value, "banco")} data-testid="input-banco" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
              data-testid="btn-submit-supplier"
            >
              {editing ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              El proveedor quedará inactivo. Los comprobantes existentes no se modificarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete-supplier"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
