import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, UserRound, Phone, Mail, FileText, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ProvinciaCiudadSelect } from "@/components/provincia-ciudad-select";
import { VAT_CONDITION_LABELS } from "@/pages/guests";

type SpaClient = {
  id: string;
  tipoPersona: string | null;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  documentType: string | null;
  documentNumber: string | null;
  cuilCuit: string | null;
  vatCondition: string | null;
  direccion: string | null;
  provincia: string | null;
  localidad: string | null;
  codigoPostal: string | null;
  createdAt: string;
};

function formatCuit(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0,2)}-${d.slice(2)}`;
  return `${d.slice(0,2)}-${d.slice(2,10)}-${d.slice(10)}`;
}

function normalizeCuit(v: string): string {
  return v.replace(/[-\s]/g, "");
}

const emptyForm = {
  tipoPersona: "fisica" as "fisica" | "juridica",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  notes: "",
  documentType: "dni",
  documentNumber: "",
  cuilCuit: "",
  vatCondition: "consumidor_final",
  direccion: "",
  provincia: "",
  localidad: "",
  codigoPostal: "",
};

export default function SpaClientsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<SpaClient | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: clients = [], isLoading } = useQuery<SpaClient[]>({
    queryKey: ["/api/spa/clients"],
  });

  const filteredClients = clients.filter(c => {
    const s = searchTerm.toLowerCase();
    return !s || c.firstName.toLowerCase().includes(s) ||
      (c.lastName || "").toLowerCase().includes(s) ||
      (c.phone || "").includes(s) ||
      (c.email || "").toLowerCase().includes(s);
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/spa/clients", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/clients"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Cliente registrado" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      const res = await apiRequest("PATCH", `/api/spa/clients/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/clients"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Cliente actualizado" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/spa/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spa/clients"] });
      toast({ title: "Cliente eliminado" });
    },
  });

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingClient(null);
  };

  const handleEdit = (client: SpaClient) => {
    setEditingClient(client);
    setForm({
      tipoPersona: (client.tipoPersona as "fisica" | "juridica") || "fisica",
      firstName: client.firstName,
      lastName: client.lastName === "-" ? "" : (client.lastName || ""),
      phone: client.phone || "",
      email: client.email || "",
      notes: client.notes || "",
      documentType: client.documentType || "dni",
      documentNumber: client.documentNumber || "",
      cuilCuit: client.cuilCuit ? formatCuit(client.cuilCuit) : "",
      vatCondition: client.vatCondition || ((client.tipoPersona === "juridica") ? "responsable_inscripto" : "consumidor_final"),
      direccion: client.direccion || "",
      provincia: client.provincia || "",
      localidad: client.localidad || "",
      codigoPostal: client.codigoPostal || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.firstName.trim()) return;
    const payload = {
      ...form,
      lastName: form.tipoPersona === "juridica" ? (form.lastName || "-") : form.lastName,
      cuilCuit: normalizeCuit(form.cuilCuit) || null,
      documentType: form.tipoPersona === "juridica" ? "cuit" : form.documentType,
      documentNumber: form.documentNumber || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      vatCondition: form.vatCondition || null,
      direccion: form.direccion || null,
      provincia: form.provincia || null,
      localidad: form.localidad || null,
      codigoPostal: form.codigoPostal || null,
    };
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isJuridica = form.tipoPersona === "juridica";

  return (
    <div className="p-6 space-y-6" data-testid="page-spa-clients">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Clientes SPA</h1>
          <p className="text-muted-foreground">Base de datos de clientes frecuentes del SPA</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-new-spa-client">
          <Plus className="h-4 w-4 mr-2" /> Nuevo Cliente
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-spa-client"
          />
        </div>
        <Badge variant="outline" data-testid="badge-client-count">{clients.length} clientes</Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-loading">Cargando...</div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="text-empty-state">
          <UserRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{searchTerm ? "No se encontraron clientes" : "No hay clientes registrados"}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map(client => (
            <Card key={client.id} data-testid={`card-spa-client-${client.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {(client.tipoPersona === "juridica") ? (
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <p className="font-semibold truncate" data-testid={`text-client-name-${client.id}`}>
                        {client.tipoPersona === "juridica"
                          ? `${client.firstName}${client.lastName && client.lastName !== "-" ? ` (${client.lastName})` : ""}`
                          : `${client.lastName || ""} ${client.firstName}`.trim()}
                      </p>
                    </div>
                    {client.vatCondition && (
                      <p className="text-xs text-muted-foreground">{VAT_CONDITION_LABELS[client.vatCondition] ?? client.vatCondition}</p>
                    )}
                    {client.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Phone className="h-3 w-3" /> {client.phone}
                      </p>
                    )}
                    {client.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {client.email}
                      </p>
                    )}
                    {(client.localidad || client.provincia) && (
                      <p className="text-xs text-muted-foreground">{[client.localidad, client.provincia].filter(Boolean).join(", ")}</p>
                    )}
                    {client.notes && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                        <FileText className="h-3 w-3 mt-0.5 shrink-0" /> {client.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(client)} data-testid={`button-edit-spa-client-${client.id}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (window.confirm(`¿Eliminar a ${client.lastName || ""} ${client.firstName}?`)) {
                        deleteMutation.mutate(client.id);
                      }
                    }} data-testid={`button-delete-spa-client-${client.id}`}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } else { setDialogOpen(true); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Editar Cliente SPA" : "Nuevo Cliente SPA"}</DialogTitle>
            <DialogDescription>Registrar cliente frecuente del SPA</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">

            {/* Tipo de Persona */}
            <div className="flex rounded-lg border overflow-hidden">
              <button type="button"
                className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${!isJuridica ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => setForm(f => ({ ...f, tipoPersona: "fisica", vatCondition: "consumidor_final" }))}
                data-testid="button-tipo-fisica">
                <User className="h-4 w-4" /> Persona Física
              </button>
              <button type="button"
                className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors border-l ${isJuridica ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => setForm(f => ({ ...f, tipoPersona: "juridica", vatCondition: "responsable_inscripto" }))}
                data-testid="button-tipo-juridica">
                <Building2 className="h-4 w-4" /> Persona Jurídica
              </button>
            </div>

            {/* Nombre */}
            {isJuridica ? (<>
              <div className="grid gap-2">
                <Label>Razón Social <span className="text-red-500">*</span></Label>
                <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="Empresa S.A." data-testid="input-client-razon-social" />
              </div>
              <div className="grid gap-2">
                <Label>Nombre Comercial <span className="text-xs text-muted-foreground">(cómo se conoce al negocio)</span></Label>
                <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Acme Corp" data-testid="input-client-nombre-comercial" />
              </div>
            </>) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Nombre <span className="text-red-500">*</span></Label>
                  <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="Juan" data-testid="input-client-first-name" />
                </div>
                <div className="grid gap-2">
                  <Label>Apellido</Label>
                  <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Pérez" data-testid="input-client-last-name" />
                </div>
              </div>
            )}

            {/* Teléfono + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+54 9 11 1234-5678" data-testid="input-client-phone" />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@ejemplo.com" data-testid="input-client-email" />
              </div>
            </div>

            {/* Documento — solo Física */}
            {!isJuridica && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Tipo Doc.</Label>
                  <Select value={form.documentType} onValueChange={(v) => setForm({ ...form, documentType: v })}>
                    <SelectTrigger data-testid="select-client-doc-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dni">DNI</SelectItem>
                      <SelectItem value="passport">Pasaporte</SelectItem>
                      <SelectItem value="cedula">Cédula</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Nro. Documento</Label>
                  <Input value={form.documentNumber} onChange={e => setForm({ ...form, documentNumber: e.target.value })} placeholder="12345678" data-testid="input-client-doc-number" />
                </div>
              </div>
            )}

            {/* CUIL/CUIT + Condición IVA */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{isJuridica ? "CUIT" : "CUIL / CUIT"}</Label>
                <Input
                  value={form.cuilCuit}
                  onChange={(e) => setForm({ ...form, cuilCuit: formatCuit(e.target.value) })}
                  placeholder={isJuridica ? "30-12345678-9" : "20-12345678-9"}
                  maxLength={13}
                  data-testid="input-client-cuit"
                />
              </div>
              <div className="grid gap-2">
                <Label>Condición ante IVA</Label>
                <Select value={form.vatCondition} onValueChange={(v) => setForm({ ...form, vatCondition: v })}>
                  <SelectTrigger data-testid="select-client-vat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VAT_CONDITION_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Domicilio */}
            <div className="pt-1 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Domicilio</p>
            </div>
            <div className="grid gap-2">
              <Label>Dirección</Label>
              <Input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Av. Ejemplo 123" data-testid="input-client-direccion" />
            </div>
            <ProvinciaCiudadSelect
              provincia={form.provincia}
              localidad={form.localidad}
              onProvinciaChange={(v) => setForm(prev => ({ ...prev, provincia: v, localidad: "" }))}
              onLocalidadChange={(v) => setForm(prev => ({ ...prev, localidad: v }))}
              testIdProvincia="select-client-provincia"
              testIdLocalidad="select-client-localidad"
            />
            <div className="grid gap-2">
              <Label>Código Postal</Label>
              <Input value={form.codigoPostal} onChange={e => setForm({ ...form, codigoPostal: e.target.value })} placeholder="1043" data-testid="input-client-cp" />
            </div>

            {/* Observaciones */}
            <div className="pt-1 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Observaciones</p>
            </div>
            <div className="grid gap-2">
              <Label>Alergias, preferencias, notas...</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="input-client-notes" />
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} data-testid="button-cancel-client">Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.firstName.trim() || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-client">
              {(createMutation.isPending || updateMutation.isPending) ? "Guardando..." : (editingClient ? "Guardar Cambios" : "Crear Cliente")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
