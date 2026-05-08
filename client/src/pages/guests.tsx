import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Mail,
  Phone,
  MapPin,
  FileText,
  Car,
  Heart,
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  Hotel,
  ToggleLeft,
  ToggleRight,
  X,
  UtensilsCrossed,
  Sparkles,
  DoorOpen,
  Star,
  Gift,
  Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Guest, InsertGuest, ReservationWithDetails, ReservationStatus, GuestPreference, Company } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ProvinciaCiudadSelect } from "@/components/provincia-ciudad-select";

function GuestFormDialog({
  guest,
  open,
  onOpenChange,
  onSuccess,
}: {
  guest?: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!guest;

  const { data: companies } = useQuery<Company[]>({ queryKey: ["/api/companies"] });

  const buildFormData = (g?: Guest): Partial<InsertGuest> => ({
    firstName: g?.firstName || "",
    lastName: g?.lastName || "",
    email: g?.email || "",
    phone: g?.phone || "",
    documentType: g?.documentType || "dni",
    documentNumber: g?.documentNumber || "",
    nationality: g?.nationality || "",
    direccion: g?.direccion || "",
    provincia: g?.provincia || "",
    localidad: g?.localidad || "",
    codigoPostal: g?.codigoPostal || "",
    fechaNacimiento: g?.fechaNacimiento || "",
    sexo: g?.sexo || "no_especifica",
    segment: g?.segment || "LEISURE",
    cuilCuit: g?.cuilCuit || "",
    companyId: g?.companyId || null,
    agencyId: g?.agencyId || null,
    vehiculoPatente: g?.vehiculoPatente || "",
    vehiculoMarca: g?.vehiculoMarca || "",
    vehiculoModelo: g?.vehiculoModelo || "",
    vehiculoColor: g?.vehiculoColor || "",
  });

  const [formData, setFormData] = useState<Partial<InsertGuest>>(() => buildFormData(guest));

  useEffect(() => {
    if (open) {
      setFormData(buildFormData(guest));
    }
  }, [open, guest?.id]);

  const mutation = useMutation({
    mutationFn: async (data: Partial<InsertGuest>) => {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== "" && v !== undefined)
      );
      if (isEditing) {
        return apiRequest("PATCH", `/api/guests/${guest.id}`, payload);
      }
      return apiRequest("POST", "/api/guests", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: isEditing ? "Huésped actualizado" : "Huésped registrado",
        description: `${formData.lastName} ${formData.firstName} ha sido ${isEditing ? "actualizado" : "registrado"} exitosamente.`,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar el huésped. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Huésped" : "Nuevo Huésped"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica los datos del huésped." : "Ingresa los datos para registrar un nuevo huésped."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Juan"
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Apellido</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Pérez"
                  required
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="juan@email.com"
                  data-testid="input-email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+54 11 1234-5678"
                  data-testid="input-phone"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="documentType">Tipo de Documento</Label>
                <Select
                  value={formData.documentType || "dni"}
                  onValueChange={(value) => setFormData({ ...formData, documentType: value })}
                >
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dni">DNI</SelectItem>
                    <SelectItem value="passport">Pasaporte</SelectItem>
                    <SelectItem value="cedula">Cédula</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="documentNumber">Número de Documento</Label>
                <Input
                  id="documentNumber"
                  value={formData.documentNumber || ""}
                  onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                  placeholder="12345678"
                  data-testid="input-document-number"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nationality">Nacionalidad</Label>
              <Input
                id="nationality"
                value={formData.nationality || ""}
                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                placeholder="Argentina"
                data-testid="input-nationality"
              />
            </div>
            <ProvinciaCiudadSelect
              provincia={formData.provincia || ""}
              localidad={formData.localidad || ""}
              onProvinciaChange={(v) => setFormData({ ...formData, provincia: v, localidad: "" })}
              onLocalidadChange={(v) => setFormData({ ...formData, localidad: v })}
              testIdProvincia="select-guest-provincia"
              testIdLocalidad="select-guest-localidad"
            />

            <div className="grid gap-2">
              <Label>Empresa asociada</Label>
              <Select
                value={formData.companyId || "__none__"}
                onValueChange={(v) => setFormData({ ...formData, companyId: v === "__none__" ? null : v })}
              >
                <SelectTrigger data-testid="select-company">
                  <SelectValue placeholder="Sin empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin empresa</SelectItem>
                  {companies?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.razonSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t">
              <Label className="text-sm font-medium text-muted-foreground">Datos del Vehículo (opcional)</Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="vehiculoPatente">Patente</Label>
                <Input
                  id="vehiculoPatente"
                  name="vehiculoPatente"
                  value={formData.vehiculoPatente || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoPatente: e.target.value.toUpperCase() })}
                  placeholder="ABC 123"
                  data-testid="input-vehiculo-patente"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vehiculoMarca">Marca</Label>
                <Input
                  id="vehiculoMarca"
                  name="vehiculoMarca"
                  value={formData.vehiculoMarca || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoMarca: e.target.value })}
                  placeholder="Toyota"
                  data-testid="input-vehiculo-marca"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="vehiculoModelo">Modelo</Label>
                <Input
                  id="vehiculoModelo"
                  name="vehiculoModelo"
                  value={formData.vehiculoModelo || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoModelo: e.target.value })}
                  placeholder="Corolla"
                  data-testid="input-vehiculo-modelo"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vehiculoColor">Color</Label>
                <Input
                  id="vehiculoColor"
                  name="vehiculoColor"
                  value={formData.vehiculoColor || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoColor: e.target.value })}
                  placeholder="Blanco"
                  data-testid="input-vehiculo-color"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-guest">
              {mutation.isPending ? "Guardando..." : isEditing ? "Guardar Cambios" : "Registrar Huésped"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const statusConfig: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendiente", variant: "secondary" },
    tentative: { label: "Tentativa", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Hospedado", variant: "outline" },
    checked_out: { label: "Finalizada", variant: "secondary" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function ReservationExpandedDetail({ r }: { r: ReservationWithDetails }) {
  const sourceLabel: Record<string, string> = {
    directo: "Directo", empresa: "Empresa", agencia: "Agencia",
    ota: "OTA", walkin: "Walk-in",
  };
  const paymentMethodLabel: Record<string, string> = {
    efectivo: "Efectivo", tarjeta_credito: "Tarj. Crédito", tarjeta_debito: "Tarj. Débito",
    transferencia: "Transferencia", cheque: "Cheque", cuenta_corriente: "Cta. Corriente",
  };
  const activeCharges = r.charges?.filter(c => c.status === "active") || [];
  const activePayments = r.payments?.filter(p => p.status === "active") || [];
  const totalCharges = activeCharges.reduce((s, c) => s + parseFloat(c.amount || "0"), 0);
  const totalPayments = activePayments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  const balance = parseFloat(r.totalRoomAmount || "0") + totalCharges - totalPayments;

  return (
    <div className="bg-muted/30 border-t px-4 py-3 space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Código</p>
          <p className="font-mono font-medium text-xs">{r.reservationCode}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tipo de Habitación</p>
          <p className="font-medium">{(r.room as any)?.roomType?.name || "-"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tarifa por noche</p>
          <p className="font-medium">${parseFloat(r.finalRatePerNight || "0").toLocaleString("es-AR")}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total habitación</p>
          <p className="font-medium">${parseFloat(r.totalRoomAmount || "0").toLocaleString("es-AR")}</p>
        </div>
        {r.discountType && r.discountType !== "none" && (
          <div>
            <p className="text-xs text-muted-foreground">Descuento</p>
            <p className="font-medium text-green-600">
              {r.discountType === "percent" ? `${r.discountValue}%` : `$${r.discountValue}`}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Fuente</p>
          <p className="font-medium">{sourceLabel[r.source || ""] || r.source || "-"}</p>
        </div>
        {r.company && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Empresa</p>
            <p className="font-medium">{r.company.nombreFantasia || r.company.razonSocial}</p>
          </div>
        )}
        {r.agency && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Agencia</p>
            <p className="font-medium">{r.agency.nombreFantasia || r.agency.razonSocial}</p>
          </div>
        )}
      </div>

      {r.notes && (
        <div className="border-t pt-2">
          <p className="text-xs text-muted-foreground">Notas</p>
          <p className="text-xs mt-0.5">{r.notes}</p>
        </div>
      )}

      {activeCharges.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Cargos ({activeCharges.length})</p>
          <div className="space-y-1">
            {activeCharges.map(c => (
              <div key={c.id} className="flex justify-between text-xs">
                <span>{c.description}</span>
                <span className="font-medium">${parseFloat(c.amount).toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePayments.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Pagos ({activePayments.length})</p>
          <div className="space-y-1">
            {activePayments.map(p => (
              <div key={p.id} className="flex justify-between text-xs">
                <span>{paymentMethodLabel[p.method || ""] || p.method} · {p.date}</span>
                <span className="font-medium text-green-700 dark:text-green-400">${parseFloat(p.amount).toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t pt-2 flex justify-between text-xs font-semibold">
        <span>Saldo pendiente</span>
        <span className={balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
          ${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}

// ========== PREFERENCES SECTION ==========
const PREF_CATEGORIES = [
  { value: "habitacion",    label: "Habitación",     icon: DoorOpen },
  { value: "alimentacion",  label: "Alimentación",   icon: UtensilsCrossed },
  { value: "amenities",     label: "Amenities",      icon: Star },
  { value: "servicio",      label: "Servicio",       icon: Sparkles },
  { value: "fecha_especial",label: "Fecha Especial", icon: Gift },
  { value: "motivo_viaje",  label: "Motivo de Viaje",icon: Briefcase },
  { value: "nota_interna",  label: "Nota Interna",   icon: FileText },
  { value: "otro",          label: "Otro",           icon: Heart },
];

const PREF_PRIORITIES = [
  { value: "low",      label: "Baja",    cls: "bg-gray-100 text-gray-700" },
  { value: "normal",   label: "Normal",  cls: "bg-blue-100 text-blue-700" },
  { value: "high",     label: "Alta",    cls: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Crítica", cls: "bg-red-100 text-red-700" },
];

function getCatIcon(cat: string) {
  const found = PREF_CATEGORIES.find(c => c.value === cat);
  if (!found) return <Heart className="h-4 w-4 text-muted-foreground" />;
  const Icon = found.icon;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

function getPrefPriorityBadge(priority: string) {
  const p = PREF_PRIORITIES.find(x => x.value === priority);
  return <Badge className={`text-xs ${p?.cls || ""}`}>{p?.label || priority}</Badge>;
}

function GuestPreferencesSection({ guestId }: { guestId: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editPref, setEditPref] = useState<GuestPreference | null>(null);
  const [category, setCategory] = useState("habitacion");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");

  const { data: preferences = [], isLoading } = useQuery<GuestPreference[]>({
    queryKey: ["/api/guests", guestId, "preferences"],
  });

  const resetForm = () => {
    setCategory("habitacion");
    setTitle("");
    setDescription("");
    setPriority("normal");
    setEditPref(null);
    setShowForm(false);
  };

  const openEdit = (pref: GuestPreference) => {
    setEditPref(pref);
    setCategory(pref.category);
    setTitle(pref.title);
    setDescription(pref.description || "");
    setPriority(pref.priority);
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("El título es requerido");
      const body = { category, title: title.trim(), description: description.trim() || null, priority, visibleTo: ["all"], recordedBy: "Recepción" };
      if (editPref) {
        return apiRequest("PATCH", `/api/guests/${guestId}/preferences/${editPref.id}`, body);
      } else {
        return apiRequest("POST", `/api/guests/${guestId}/preferences`, body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId, "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      toast({ title: editPref ? "Preferencia actualizada" : "Preferencia guardada" });
      resetForm();
    },
    onError: (e: any) => toast({ title: e.message || "Error al guardar", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (prefId: string) => apiRequest("PATCH", `/api/guests/${guestId}/preferences/${prefId}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId, "preferences"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (prefId: string) => apiRequest("DELETE", `/api/guests/${guestId}/preferences/${prefId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId, "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      toast({ title: "Preferencia eliminada" });
    },
  });

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="guest-preferences-section">
      <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Preferencias de Hospitalidad</h4>
          <Badge variant="outline" className="text-xs">{preferences.length}</Badge>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => { resetForm(); setShowForm(true); }} data-testid="btn-add-pref">
            <Plus className="h-3 w-3 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {showForm && (
        <div className="p-3 border-b bg-blue-50 dark:bg-blue-950/20 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">{editPref ? "Editar preferencia" : "Nueva preferencia"}</p>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={resetForm}><X className="h-3 w-3" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-pref-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREF_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-pref-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREF_PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Título *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Alergia al maní, Almohada extra, Habitación silenciosa..."
              className="h-8 text-xs"
              data-testid="input-pref-title"
            />
          </div>
          <div>
            <Label className="text-xs">Descripción (opcional)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detalles adicionales..."
              rows={2}
              className="text-xs resize-none"
              data-testid="input-pref-description"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="btn-save-pref">
              {saveMutation.isPending ? "Guardando..." : editPref ? "Actualizar" : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y max-h-[260px] overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : preferences.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Sin preferencias registradas. Usá el botón Agregar para cargar gustos y necesidades del huésped.
          </div>
        ) : (
          preferences.map(pref => (
            <div
              key={pref.id}
              className={`flex items-start justify-between p-3 gap-2 ${!pref.isActive ? "opacity-50" : ""}`}
              data-testid={`pref-item-${pref.id}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {getCatIcon(pref.category)}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium">{pref.title}</p>
                    {getPrefPriorityBadge(pref.priority)}
                    {!pref.isActive && <Badge variant="outline" className="text-xs">Inactiva</Badge>}
                  </div>
                  {pref.description && <p className="text-xs text-muted-foreground mt-0.5">{pref.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => toggleMutation.mutate(pref.id)}
                  title={pref.isActive ? "Desactivar" : "Activar"}
                  data-testid={`btn-toggle-pref-${pref.id}`}
                >
                  {pref.isActive
                    ? <ToggleRight className="h-4 w-4 text-green-500" />
                    : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => openEdit(pref)}
                  data-testid={`btn-edit-pref-${pref.id}`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                  onClick={() => deleteMutation.mutate(pref.id)}
                  data-testid={`btn-delete-pref-${pref.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function GuestDetailDialog({
  guest,
  open,
  onOpenChange,
}: {
  guest: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null);

  const { data: allReservations } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations"],
  });

  const guestReservations = allReservations?.filter(r => r.guestId === guest.id) || [];
  const totalStays = guestReservations.filter(r => r.status === "checked_out").length;
  const totalNights = guestReservations.reduce((sum, r) => sum + (r.nights || 0), 0);
  const totalSpent = guestReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del Huésped</DialogTitle>
          <DialogDescription>Información completa y historial de reservaciones.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
              {guest.lastName?.[0]}{guest.firstName?.[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-xl">
                  {guest.lastName} {guest.firstName}
                </p>
                {guest.segment && guest.segment !== "OTHER" && (() => {
                  const segColors: Record<string, string> = {
                    LEISURE: "bg-blue-100 text-blue-700",
                    CORP: "bg-purple-100 text-purple-700",
                    SPORT: "bg-green-100 text-green-700",
                    CONGRESS: "bg-amber-100 text-amber-700",
                  };
                  const segLabels: Record<string, string> = {
                    LEISURE: "Turismo", CORP: "Corporativo", SPORT: "Deportivo", CONGRESS: "Congreso",
                  };
                  return (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${segColors[guest.segment] || "bg-gray-100 text-gray-600"}`}>
                      {segLabels[guest.segment] || guest.segment}
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-muted-foreground">{guest.nationality || "Sin nacionalidad"}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">{totalStays}</p>
              <p className="text-sm text-muted-foreground">Estancias</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">{totalNights}</p>
              <p className="text-sm text-muted-foreground">Noches</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">${totalSpent.toFixed(0)}</p>
              <p className="text-sm text-muted-foreground">Gastado</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {guest.email && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium text-sm truncate">{guest.email}</p>
                  </div>
                </div>
              )}
              {guest.phone && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Teléfono</p>
                    <p className="font-medium text-sm">{guest.phone}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {guest.documentNumber && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {guest.documentType?.toUpperCase() || "Documento"}
                    </p>
                    <p className="font-medium text-sm">{guest.documentNumber}</p>
                  </div>
                </div>
              )}
              {guest.localidad && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground">Ciudad</p>
                    <p className="font-medium text-sm truncate">{guest.localidad}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {guest.vehiculoPatente && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Vehículo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Patente</p>
                  <p className="font-medium">{guest.vehiculoPatente}</p>
                </div>
                {guest.vehiculoMarca && (
                  <div>
                    <p className="text-xs text-muted-foreground">Marca</p>
                    <p className="font-medium">{guest.vehiculoMarca}</p>
                  </div>
                )}
                {guest.vehiculoModelo && (
                  <div>
                    <p className="text-xs text-muted-foreground">Modelo</p>
                    <p className="font-medium">{guest.vehiculoModelo}</p>
                  </div>
                )}
                {guest.vehiculoColor && (
                  <div>
                    <p className="text-xs text-muted-foreground">Color</p>
                    <p className="font-medium">{guest.vehiculoColor}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <GuestPreferencesSection guestId={guest.id} />

          <div className="border rounded-lg">
            <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hotel className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-semibold">Historial de Reservaciones</h4>
                {guestReservations.length > 0 && (
                  <Badge variant="outline" className="text-xs">{guestReservations.length}</Badge>
                )}
              </div>
            </div>
            <div className="divide-y max-h-[320px] overflow-y-auto">
              {guestReservations.length > 0 ? (
                guestReservations.map((reservation) => {
                  const isExpanded = expandedReservationId === reservation.id;
                  return (
                    <div key={reservation.id} data-testid={`guest-reservation-${reservation.id}`}>
                      <button
                        className="w-full flex items-center justify-between p-3 text-sm hover:bg-muted/40 transition-colors text-left"
                        onClick={() => setExpandedReservationId(isExpanded ? null : reservation.id)}
                        data-testid={`btn-expand-reservation-${reservation.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium">
                              Hab. {reservation.room?.roomNumber}
                              {(reservation.room as any)?.roomType?.name && (
                                <span className="text-muted-foreground font-normal"> · {(reservation.room as any).roomType.name}</span>
                              )}
                            </p>
                            <p className="text-muted-foreground text-xs font-mono">{reservation.reservationCode}</p>
                            <p className="text-muted-foreground text-xs">
                              {reservation.checkInDate} → {reservation.checkOutDate} ({reservation.nights} noche{reservation.nights !== 1 ? "s" : ""})
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium">${parseFloat(reservation.totalRoomAmount || "0").toLocaleString("es-AR")}</span>
                          <ReservationStatusBadge status={reservation.status} />
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                      {isExpanded && <ReservationExpandedDetail r={reservation} />}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No hay reservaciones registradas
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GuestsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | undefined>();

  const { data: guests, isLoading } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/guests/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Huésped eliminado", description: "El huésped ha sido eliminado del sistema." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo eliminar el huésped", variant: "destructive" });
    },
  });

  const filteredGuests = guests?.filter((guest) => {
    const fullName = `${guest.lastName} ${guest.firstName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      guest.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.documentNumber?.includes(searchQuery);
    return matchesSearch;
  });

  const handleEditGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setDialogOpen(true);
  };

  const handleViewGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setDetailDialogOpen(true);
  };

  const handleNewGuest = () => {
    setSelectedGuest(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-guests-title">
            Huéspedes
          </h1>
          <p className="text-muted-foreground">Gestiona el registro de huéspedes del hotel</p>
        </div>
        <Button onClick={handleNewGuest} data-testid="button-new-guest">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Huésped
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o documento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-guests"
            />
          </div>
        </CardContent>
      </Card>

      {/* Guests Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredGuests && filteredGuests.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Nacionalidad</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGuests.map((guest) => (
                <TableRow key={guest.id} data-testid={`guest-row-${guest.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {guest.lastName?.[0]}{guest.firstName?.[0]}
                      </div>
                      <span className="font-medium">
                        {guest.lastName} {guest.firstName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{guest.email || "-"}</TableCell>
                  <TableCell>{guest.phone || "-"}</TableCell>
                  <TableCell>
                    {guest.documentType && guest.documentNumber
                      ? `${guest.documentType.toUpperCase()}: ${guest.documentNumber}`
                      : "-"}
                  </TableCell>
                  <TableCell>{guest.nationality || "-"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`btn-guest-menu-${guest.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewGuest(guest)} data-testid={`btn-view-guest-${guest.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditGuest(guest)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(guest.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay huéspedes</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "No se encontraron huéspedes con los criterios de búsqueda."
                : "Comienza registrando el primer huésped del hotel."}
            </p>
            {!searchQuery && (
              <Button onClick={handleNewGuest}>
                <Plus className="mr-2 h-4 w-4" />
                Registrar Primer Huésped
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guest Form Dialog */}
      <GuestFormDialog
        guest={selectedGuest}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setSelectedGuest(undefined)}
      />

      {/* Guest Detail Dialog */}
      {selectedGuest && (
        <GuestDetailDialog
          guest={selectedGuest}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
        />
      )}
    </div>
  );
}
