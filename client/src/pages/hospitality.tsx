import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Heart,
  AlertTriangle,
  Search,
  Plus,
  Edit,
  Trash2,
  Check,
  CheckCircle,
  Clock,
  User,
  UtensilsCrossed,
  Sparkles,
  DoorOpen,
  Star,
  ShieldAlert,
  Gift,
  Briefcase,
  FileText,
  ToggleLeft,
  ToggleRight,
  Eye,
} from "lucide-react";
import type { GuestPreference, Guest, HospitalityAlert } from "@shared/schema";

const CATEGORY_OPTIONS = [
  { value: "habitacion", label: "Habitación", icon: DoorOpen },
  { value: "alimentacion", label: "Alimentación", icon: UtensilsCrossed },
  { value: "amenities", label: "Amenities", icon: Star },
  { value: "servicio", label: "Servicio", icon: Sparkles },
  { value: "fecha_especial", label: "Fecha Especial", icon: Gift },
  { value: "motivo_viaje", label: "Motivo de Viaje", icon: Briefcase },
  { value: "nota_interna", label: "Nota Interna", icon: FileText },
  { value: "otro", label: "Otro", icon: Heart },
];

const SUBCATEGORY_MAP: Record<string, string[]> = {
  habitacion: ["ubicacion", "temperatura", "almohadas", "cama", "vista", "piso", "otro"],
  alimentacion: ["alergias", "dieta", "bebidas", "desayuno", "otro"],
  amenities: ["almohadas", "toallas", "minibar", "aromaterapia", "otro"],
  servicio: ["idioma", "horario", "transporte", "otro"],
  fecha_especial: ["cumpleanos", "aniversario", "otro"],
  motivo_viaje: ["negocios", "vacaciones", "evento", "otro"],
  nota_interna: [],
  otro: [],
};

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baja", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "normal", label: "Normal", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "high", label: "Alta", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  { value: "critical", label: "Crítica", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
];

const AREA_OPTIONS = [
  { value: "all", label: "Todas las áreas" },
  { value: "reception", label: "Recepción" },
  { value: "housekeeping", label: "Housekeeping" },
  { value: "restaurant", label: "Restaurante" },
  { value: "spa", label: "SPA" },
  { value: "maintenance", label: "Mantenimiento" },
];

function getPriorityBadge(priority: string) {
  const opt = PRIORITY_OPTIONS.find((p) => p.value === priority);
  return <Badge className={opt?.color || ""}>{opt?.label || priority}</Badge>;
}

function getCategoryIcon(category: string) {
  const cat = CATEGORY_OPTIONS.find((c) => c.value === category);
  if (!cat) return <Heart className="h-4 w-4" />;
  const Icon = cat.icon;
  return <Icon className="h-4 w-4" />;
}

function getCategoryLabel(category: string) {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label || category;
}

// ========== DASHBOARD TAB ==========
function DashboardTab() {
  const { data: dashboard, isLoading } = useQuery<any>({
    queryKey: ["/api/hospitality/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = dashboard?.stats || {};
  const inHouseGuests = dashboard?.inHouseGuests || [];
  const pendingAlerts = dashboard?.pendingAlerts || [];
  const criticalPreferences = dashboard?.criticalPreferences || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="stat-inhouse-prefs">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalInHouseWithPrefs || 0}</p>
              <p className="text-sm text-muted-foreground">Huéspedes con preferencias</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-pending-alerts">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pendingAlertsCount || 0}</p>
              <p className="text-sm text-muted-foreground">Alertas pendientes</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-critical">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900">
              <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.criticalCount || 0}</p>
              <p className="text-sm text-muted-foreground">Preferencias críticas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {criticalPreferences.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              Preferencias Críticas (requieren atención inmediata)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {criticalPreferences.map((item: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg" data-testid={`critical-pref-${idx}`}>
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{item.guest?.firstName} {item.guest?.lastName}</p>
                    {item.preferences?.map((p: GuestPreference) => (
                      <p key={p.id} className="text-sm text-red-700 dark:text-red-300">{p.title}: {p.description}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Alertas Pendientes ({pendingAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertsList alerts={pendingAlerts} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5" />
            Huéspedes In-House con Preferencias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inHouseGuests.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No hay huéspedes registrados con preferencias activas</p>
          ) : (
            <div className="space-y-3">
              {inHouseGuests.map((item: any, idx: number) => (
                <div key={idx} className="flex items-start justify-between p-3 border rounded-lg" data-testid={`inhouse-guest-${idx}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {item.guest?.firstName?.[0]}{item.guest?.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-medium">{item.guest?.firstName} {item.guest?.lastName}</p>
                      <p className="text-xs text-muted-foreground">Hab. {item.reservation?.roomId}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.preferences?.map((p: GuestPreference) => (
                          <Badge key={p.id} variant="outline" className="text-xs">
                            {getCategoryIcon(p.category)}
                            <span className="ml-1">{p.title}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {item.hasCritical && <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">Crítico</Badge>}
                    {item.hasHigh && !item.hasCritical && <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">Alta</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ========== ALERTS LIST COMPONENT ==========
function AlertsList({ alerts }: { alerts: HospitalityAlert[] }) {
  const { toast } = useToast();
  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      await apiRequest("PATCH", `/api/hospitality/alerts/${alertId}/acknowledge`, { acknowledgedBy: "Recepción" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/alerts"] });
      toast({ title: "Alerta confirmada" });
    },
  });

  if (alerts.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-4">Sin alertas pendientes</p>;
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div key={alert.id} className="flex items-start justify-between gap-3 p-3 border rounded-lg" data-testid={`alert-${alert.id}`}>
          <div className="flex items-start gap-2">
            {getPriorityBadge(alert.priority)}
            <div>
              <p className="text-sm">{alert.alertMessage}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Área: {AREA_OPTIONS.find((a) => a.value === alert.targetArea)?.label || alert.targetArea}
              </p>
            </div>
          </div>
          {!alert.isAcknowledged && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => acknowledgeMutation.mutate(alert.id)}
              disabled={acknowledgeMutation.isPending}
              data-testid={`btn-acknowledge-${alert.id}`}
            >
              <Check className="h-4 w-4 mr-1" />
              Entendido
            </Button>
          )}
          {alert.isAcknowledged && (
            <Badge variant="outline" className="text-green-600">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmada
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ========== PREFERENCE FORM DIALOG ==========
function PreferenceFormDialog({
  open,
  onClose,
  guestId,
  editPref,
}: {
  open: boolean;
  onClose: () => void;
  guestId: string;
  editPref?: GuestPreference | null;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState(editPref?.category || "");
  const [subcategory, setSubcategory] = useState(editPref?.subcategory || "");
  const [title, setTitle] = useState(editPref?.title || "");
  const [description, setDescription] = useState(editPref?.description || "");
  const [priority, setPriority] = useState(editPref?.priority || "normal");
  const [visibleTo, setVisibleTo] = useState<string[]>(editPref?.visibleTo || ["all"]);

  const subcategories = SUBCATEGORY_MAP[category] || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editPref) {
        await apiRequest("PATCH", `/api/guests/${guestId}/preferences/${editPref.id}`, data);
      } else {
        await apiRequest("POST", `/api/guests/${guestId}/preferences`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", guestId, "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      toast({ title: editPref ? "Preferencia actualizada" : "Preferencia creada" });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!category || !title) {
      toast({ title: "Completa los campos requeridos", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      category,
      subcategory: subcategory || null,
      title,
      description: description || null,
      priority,
      visibleTo,
      recordedBy: "Recepción",
    });
  };

  const toggleArea = (area: string) => {
    if (area === "all") {
      setVisibleTo(["all"]);
    } else {
      const filtered = visibleTo.filter((a) => a !== "all");
      if (filtered.includes(area)) {
        const result = filtered.filter((a) => a !== area);
        setVisibleTo(result.length === 0 ? ["all"] : result);
      } else {
        setVisibleTo([...filtered, area]);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editPref ? "Editar Preferencia" : "Nueva Preferencia"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoría *</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subcategoría</Label>
              <Select value={subcategory} onValueChange={setSubcategory} disabled={subcategories.length === 0}>
                <SelectTrigger data-testid="select-subcategory">
                  <SelectValue placeholder="Opcional..." />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Alergia al maní" data-testid="input-pref-title" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalles adicionales..." data-testid="input-pref-description" />
          </div>
          <div>
            <Label>Prioridad</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger data-testid="select-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Visible para</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AREA_OPTIONS.map((a) => (
                <Badge
                  key={a.value}
                  variant={visibleTo.includes(a.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleArea(a.value)}
                  data-testid={`toggle-area-${a.value}`}
                >
                  {a.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="btn-save-preference">
            {createMutation.isPending ? "Guardando..." : editPref ? "Actualizar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ========== PREFERENCES TAB ==========
function PreferencesTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editPref, setEditPref] = useState<GuestPreference | null>(null);

  const { data: guests = [] } = useQuery<Guest[]>({ queryKey: ["/api/guests"] });
  const { data: preferences = [], isLoading: prefsLoading } = useQuery<GuestPreference[]>({
    queryKey: ["/api/guests", selectedGuest?.id, "preferences"],
    enabled: !!selectedGuest,
  });

  const toggleMutation = useMutation({
    mutationFn: async (prefId: number) => {
      await apiRequest("PATCH", `/api/guests/${selectedGuest?.id}/preferences/${prefId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", selectedGuest?.id, "preferences"] });
      toast({ title: "Preferencia actualizada" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (prefId: number) => {
      await apiRequest("DELETE", `/api/guests/${selectedGuest?.id}/preferences/${prefId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", selectedGuest?.id, "preferences"] });
      toast({ title: "Preferencia eliminada" });
    },
  });

  const filteredGuests = guests.filter((g) => {
    const q = search.toLowerCase();
    return (
      g.firstName.toLowerCase().includes(q) ||
      g.lastName.toLowerCase().includes(q) ||
      (g.documentNumber && g.documentNumber.toLowerCase().includes(q))
    );
  });

  const groupedPrefs = preferences.reduce((acc: Record<string, GuestPreference[]>, pref) => {
    const cat = pref.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(pref);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buscar Huésped</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nombre, apellido o documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-guest"
            />
          </div>
          <ScrollArea className="h-[400px]">
            <div className="space-y-1">
              {filteredGuests.map((guest) => (
                <button
                  key={guest.id}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedGuest?.id === guest.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedGuest(guest)}
                  data-testid={`btn-select-guest-${guest.id}`}
                >
                  <p className="font-medium text-sm">{guest.firstName} {guest.lastName}</p>
                  <p className="text-xs text-muted-foreground">{guest.documentType?.toUpperCase()} {guest.documentNumber}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {selectedGuest
              ? `Preferencias de ${selectedGuest.firstName} ${selectedGuest.lastName}`
              : "Selecciona un huésped"}
          </CardTitle>
          {selectedGuest && (
            <Button size="sm" onClick={() => { setEditPref(null); setShowForm(true); }} data-testid="btn-add-preference">
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!selectedGuest ? (
            <div className="text-center py-12 text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Selecciona un huésped para ver y gestionar sus preferencias</p>
            </div>
          ) : prefsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full" />
            </div>
          ) : preferences.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Este huésped no tiene preferencias registradas</p>
              <Button size="sm" className="mt-3" onClick={() => { setEditPref(null); setShowForm(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar primera preferencia
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {Object.entries(groupedPrefs).map(([cat, prefs]) => (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      {getCategoryIcon(cat)}
                      <h4 className="font-medium text-sm">{getCategoryLabel(cat)}</h4>
                      <Badge variant="outline" className="text-xs">{prefs.length}</Badge>
                    </div>
                    <div className="space-y-2 ml-6">
                      {prefs.map((pref) => (
                        <div
                          key={pref.id}
                          className={`flex items-start justify-between p-3 border rounded-lg ${
                            !pref.isActive ? "opacity-50" : ""
                          }`}
                          data-testid={`pref-item-${pref.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{pref.title}</p>
                              {getPriorityBadge(pref.priority)}
                              {!pref.isActive && <Badge variant="outline" className="text-xs">Inactiva</Badge>}
                            </div>
                            {pref.description && <p className="text-xs text-muted-foreground mt-1">{pref.description}</p>}
                            <div className="flex gap-1 mt-1">
                              {pref.visibleTo?.map((area) => (
                                <Badge key={area} variant="outline" className="text-xs">{area}</Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-1 ml-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => toggleMutation.mutate(pref.id)}
                              data-testid={`btn-toggle-${pref.id}`}
                            >
                              {pref.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => { setEditPref(pref); setShowForm(true); }}
                              data-testid={`btn-edit-${pref.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteMutation.mutate(pref.id)}
                              data-testid={`btn-delete-${pref.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {showForm && selectedGuest && (
        <PreferenceFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditPref(null); }}
          guestId={selectedGuest.id}
          editPref={editPref}
        />
      )}
    </div>
  );
}

// ========== STAY NOTES TAB ==========
function StayNotesTab() {
  const { toast } = useToast();
  const [filterArea, setFilterArea] = useState("all");
  const [showResolved, setShowResolved] = useState(false);

  const { data: notes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/hospitality/stay-notes/active", showResolved],
    queryFn: async () => {
      const url = showResolved
        ? "/api/hospitality/stay-notes/active?includeResolved=true"
        : "/api/hospitality/stay-notes/active";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: allReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations"],
  });

  const { data: guests = [] } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState("");
  const [noteCategory, setNoteCategory] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDescription, setNoteDescription] = useState("");
  const [notePriority, setNotePriority] = useState("normal");

  const checkedInReservations = allReservations.filter((r) => r.status === "checked_in");

  const resolveMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await apiRequest("PATCH", `/api/hospitality/stay-notes/${noteId}/resolve`, { resolvedBy: "Recepción" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/stay-notes/active"] });
      toast({ title: "Nota resuelta" });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/reservations/${data.reservationId}/stay-notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/stay-notes/active"] });
      toast({ title: "Nota creada" });
      setShowNoteForm(false);
      setNoteTitle("");
      setNoteDescription("");
      setNoteCategory("");
      setSelectedReservation("");
    },
  });

  const filteredNotes = notes.filter((n) => {
    if (!showResolved && n.isResolved) return false;
    if (filterArea !== "all" && !n.visibleTo?.includes(filterArea) && !n.visibleTo?.includes("all")) return false;
    return true;
  });

  const getGuestName = (guestId: string) => {
    const g = guests.find((g) => g.id === guestId);
    return g ? `${g.firstName} ${g.lastName}` : "Desconocido";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger className="w-48" data-testid="select-filter-area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AREA_OPTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch checked={showResolved} onCheckedChange={setShowResolved} data-testid="switch-show-resolved" />
            <Label className="text-sm">Mostrar resueltas</Label>
          </div>
        </div>
        <Button onClick={() => setShowNoteForm(true)} data-testid="btn-add-note">
          <Plus className="h-4 w-4 mr-1" />
          Nueva Nota
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No hay notas de estadía activas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => (
            <Card key={note.id} className={note.isResolved ? "opacity-60" : ""} data-testid={`note-${note.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getCategoryIcon(note.category)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{note.title}</p>
                        {getPriorityBadge(note.priority)}
                        {note.isResolved && (
                          <Badge variant="outline" className="text-green-600 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resuelta
                          </Badge>
                        )}
                      </div>
                      {note.description && <p className="text-xs text-muted-foreground mt-1">{note.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {note.guestId && <span>Huésped: {getGuestName(note.guestId)} · </span>}
                        Reserva: {note.reservationId}
                      </p>
                    </div>
                  </div>
                  {!note.isResolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveMutation.mutate(note.id)}
                      disabled={resolveMutation.isPending}
                      data-testid={`btn-resolve-${note.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Resolver
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNoteForm} onOpenChange={setShowNoteForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Nota de Estadía</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reserva (check-in activo) *</Label>
              <Select value={selectedReservation} onValueChange={setSelectedReservation}>
                <SelectTrigger data-testid="select-reservation-note">
                  <SelectValue placeholder="Seleccionar reserva..." />
                </SelectTrigger>
                <SelectContent>
                  {checkedInReservations.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.guestId ? getGuestName(r.guestId) : "Sin huésped"} - Hab. {r.roomId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoría *</Label>
              <Select value={noteCategory} onValueChange={setNoteCategory}>
                <SelectTrigger data-testid="select-note-category">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título *</Label>
              <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Descripción breve" data-testid="input-note-title" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={noteDescription} onChange={(e) => setNoteDescription(e.target.value)} placeholder="Detalles..." data-testid="input-note-description" />
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select value={notePriority} onValueChange={setNotePriority}>
                <SelectTrigger data-testid="select-note-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteForm(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!selectedReservation || !noteCategory || !noteTitle) {
                  toast({ title: "Completa los campos requeridos", variant: "destructive" });
                  return;
                }
                const reservation = checkedInReservations.find((r) => r.id === selectedReservation);
                createNoteMutation.mutate({
                  reservationId: selectedReservation,
                  guestId: reservation?.guestId || null,
                  category: noteCategory,
                  title: noteTitle,
                  description: noteDescription || null,
                  priority: notePriority,
                  visibleTo: ["all"],
                  recordedBy: "Recepción",
                });
              }}
              disabled={createNoteMutation.isPending}
              data-testid="btn-save-note"
            >
              {createNoteMutation.isPending ? "Guardando..." : "Crear Nota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== HISTORY TAB ==========
function HistoryTab() {
  const [search, setSearch] = useState("");
  const { data: guests = [] } = useQuery<Guest[]>({ queryKey: ["/api/guests"] });
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  const { data: preferences = [] } = useQuery<GuestPreference[]>({
    queryKey: ["/api/guests", selectedGuestId, "preferences"],
    enabled: !!selectedGuestId,
  });

  const { data: alerts = [] } = useQuery<HospitalityAlert[]>({
    queryKey: ["/api/hospitality/alerts"],
  });

  const filteredGuests = guests.filter((g) => {
    const q = search.toLowerCase();
    return g.firstName.toLowerCase().includes(q) || g.lastName.toLowerCase().includes(q);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buscar Huésped</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-history"
            />
          </div>
          <ScrollArea className="h-[400px]">
            <div className="space-y-1">
              {filteredGuests.map((g) => (
                <button
                  key={g.id}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedGuestId === g.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedGuestId(g.id)}
                  data-testid={`btn-history-guest-${g.id}`}
                >
                  <p className="font-medium text-sm">{g.firstName} {g.lastName}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {selectedGuestId ? "Historial de Preferencias y Alertas" : "Selecciona un huésped"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedGuestId ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Selecciona un huésped para ver su historial</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {preferences.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <Heart className="h-4 w-4" />
                      Preferencias ({preferences.length})
                    </h4>
                    <div className="space-y-2 ml-6">
                      {preferences.map((p) => (
                        <div key={p.id} className="p-3 border rounded-lg" data-testid={`history-pref-${p.id}`}>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(p.category)}
                            <span className="font-medium text-sm">{p.title}</span>
                            {getPriorityBadge(p.priority)}
                            <Badge variant={p.isActive ? "default" : "outline"} className="text-xs">
                              {p.isActive ? "Activa" : "Inactiva"}
                            </Badge>
                          </div>
                          {p.description && <p className="text-xs text-muted-foreground mt-1 ml-6">{p.description}</p>}
                          <p className="text-xs text-muted-foreground mt-1 ml-6">
                            Registrada por: {p.recordedBy || "—"} · {p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-AR") : "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  const guestAlerts = alerts.filter((a) => a.guestId === selectedGuestId);
                  if (guestAlerts.length === 0) return null;
                  return (
                    <div>
                      <Separator className="my-4" />
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Alertas generadas ({guestAlerts.length})
                      </h4>
                      <div className="space-y-2 ml-6">
                        {guestAlerts.map((a) => (
                          <div key={a.id} className="p-3 border rounded-lg" data-testid={`history-alert-${a.id}`}>
                            <div className="flex items-center gap-2">
                              {getPriorityBadge(a.priority)}
                              <span className="text-sm">{a.alertMessage}</span>
                              {a.isAcknowledged && (
                                <Badge variant="outline" className="text-green-600 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Confirmada
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Área: {a.targetArea} · Reserva: {a.reservationId}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {preferences.length === 0 && alerts.filter((a) => a.guestId === selectedGuestId).length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Sin historial registrado</p>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ========== MAIN PAGE ==========
export default function HospitalityPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Heart className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Hospitalidad</h1>
          <p className="text-sm text-muted-foreground">Gestión de preferencias y experiencia del huésped</p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="grid w-full max-w-2xl grid-cols-4" data-testid="hospitality-tabs">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="preferences" data-testid="tab-preferences">Preferencias</TabsTrigger>
          <TabsTrigger value="stay-notes" data-testid="tab-stay-notes">Notas de Estadía</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab />
        </TabsContent>

        <TabsContent value="preferences" className="mt-6">
          <PreferencesTab />
        </TabsContent>

        <TabsContent value="stay-notes" className="mt-6">
          <StayNotesTab />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
