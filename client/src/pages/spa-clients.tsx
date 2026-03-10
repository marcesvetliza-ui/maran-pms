import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, UserRound, Phone, Mail, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type SpaClient = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
};

export default function SpaClientsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<SpaClient | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", notes: "" });

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
    setForm({ firstName: "", lastName: "", phone: "", email: "", notes: "" });
    setEditingClient(null);
  };

  const handleEdit = (client: SpaClient) => {
    setEditingClient(client);
    setForm({
      firstName: client.firstName,
      lastName: client.lastName || "",
      phone: client.phone || "",
      email: client.email || "",
      notes: client.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.firstName.trim()) return;
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

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
                    <p className="font-semibold truncate" data-testid={`text-client-name-${client.id}`}>
                      {client.firstName} {client.lastName || ""}
                    </p>
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
                      if (window.confirm(`¿Eliminar a ${client.firstName} ${client.lastName || ""}?`)) {
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Editar Cliente" : "Nuevo Cliente SPA"}</DialogTitle>
            <DialogDescription>Registrar cliente frecuente del SPA</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nombre *</Label>
                <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} data-testid="input-client-first-name" />
              </div>
              <div>
                <Label>Apellido</Label>
                <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} data-testid="input-client-last-name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} data-testid="input-client-phone" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="input-client-email" />
              </div>
            </div>
            <div>
              <Label>Observaciones (alergias, preferencias...)</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="input-client-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} data-testid="button-cancel-client">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.firstName.trim() || createMutation.isPending || updateMutation.isPending} data-testid="button-save-client">
              {(createMutation.isPending || updateMutation.isPending) ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}