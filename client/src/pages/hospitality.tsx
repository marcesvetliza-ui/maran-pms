import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
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
  CalendarClock,
  CalendarDays,
} from "lucide-react";
import type { GuestPreference, Guest, HospitalityAlert, StayNote } from "@shared/schema";

const segmentConfig: Record<string, { label: string; className: string }> = {
  LEISURE:  { label: "Turismo",     className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  CORP:     { label: "Corporativo", className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  SPORT:    { label: "Deportivo",   className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  CONGRESS: { label: "Congreso",    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  OTHER:    { label: "Otro",        className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

function SegmentBadge({ segment }: { segment?: string | null }) {
  if (!segment) return null;
  const cfg = segmentConfig[segment];
  if (!cfg) return null;
  return <Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>;
}

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
function GuestCard({ item, testPrefix }: { item: any; testPrefix: string }) {
  return (
    <div className="flex items-start justify-between p-3 border rounded-lg" data-testid={`${testPrefix}-${item.guest?.id}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
          {item.guest?.lastName?.[0]}{item.guest?.firstName?.[0]}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{item.guest?.lastName} {item.guest?.firstName}</p>
            <SegmentBadge segment={item.guest?.segment} />
          </div>
          <p className="text-xs text-muted-foreground">
            {(item.reservation as any)?.room?.roomNumber && (
              <span className="font-mono font-medium">Hab. {(item.reservation as any).room.roomNumber} · </span>
            )}
            {item.checkInDate}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {item.preferences?.slice(0, 4).map((p: GuestPreference) => (
              <Badge key={p.id} variant="outline" className="text-xs">
                {getCategoryIcon(p.category)}
                <span className="ml-1">{p.title}</span>
              </Badge>
            ))}
            {item.preferences?.length > 4 && (
              <Badge variant="outline" className="text-xs">+{item.preferences.length - 4} más</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 items-end">
        {item.hasCritical && <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">Crítico</Badge>}
        {item.hasHigh && !item.hasCritical && <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-xs">Alta</Badge>}
        {item.hasSpecialDate && <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 text-xs">🎂 Fecha especial</Badge>}
      </div>
    </div>
  );
}

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
  const upcomingGuests = dashboard?.upcomingGuests || [];
  const pendingAlerts = dashboard?.pendingAlerts || [];
  const criticalPreferences = dashboard?.criticalPreferences || [];
  const upcomingSpecialDates = dashboard?.upcomingSpecialDates || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="stat-inhouse-prefs">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalInHouseWithPrefs || 0}</p>
              <p className="text-sm text-muted-foreground">In-house con prefs.</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-upcoming-prefs">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-indigo-100 dark:bg-indigo-900">
              <CalendarClock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalUpcomingWithPrefs || 0}</p>
              <p className="text-sm text-muted-foreground">Llegando (7 días)</p>
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
              <p className="text-sm text-muted-foreground">Alertas activas</p>
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
              <p className="text-sm text-muted-foreground">Prefs. críticas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {criticalPreferences.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              Preferencias Críticas — Atención Inmediata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {criticalPreferences.map((item: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg" data-testid={`critical-pref-${idx}`}>
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.guest?.lastName} {item.guest?.firstName}</p>
                      <SegmentBadge segment={item.guest?.segment} />
                    </div>
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

      {upcomingSpecialDates.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <Gift className="h-5 w-5" />
              Fechas Especiales — Esta Semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingSpecialDates.map((item: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg" data-testid={`special-date-${idx}`}>
                  <Gift className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{item.guest?.lastName} {item.guest?.firstName}</p>
                      <SegmentBadge segment={item.guest?.segment} />
                      <Badge variant="outline" className="text-xs">{item.reservation?.status === "checked_in" ? "In-house" : `Llega ${item.reservation?.checkInDate}`}</Badge>
                    </div>
                    {item.specialDates?.map((p: GuestPreference) => (
                      <p key={p.id} className="text-xs text-yellow-700 dark:text-yellow-300">{p.title}: {p.description}</p>
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
              Alertas Activas ({pendingAlerts.length})
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
            <User className="h-5 w-5 text-green-600" />
            In-House con Preferencias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inHouseGuests.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No hay huéspedes in-house con preferencias activas</p>
          ) : (
            <div className="space-y-3">
              {inHouseGuests.map((item: any, idx: number) => (
                <GuestCard key={idx} item={item} testPrefix="inhouse-guest" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {upcomingGuests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-indigo-600" />
              Llegando en los Próximos 7 Días con Preferencias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingGuests.map((item: any, idx: number) => (
                <GuestCard key={idx} item={item} testPrefix="upcoming-guest" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== ALERTS LIST COMPONENT ==========
function AlertsList({ alerts }: { alerts: HospitalityAlert[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const currentUsername = (user as any)?.username || (user as any)?.firstName || "Recepción";

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest("PATCH", `/api/hospitality/alerts/${alertId}/acknowledge`, { acknowledgedBy: currentUsername });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/alerts"] });
      toast({ title: "Alerta marcada en proceso" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest("PATCH", `/api/hospitality/alerts/${alertId}/complete`, { completedBy: currentUsername });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality/alerts"] });
      toast({ title: "Alerta completada" });
    },
  });

  if (alerts.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-4">Sin alertas activas</p>;
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const enriched = alert as any;
        const isInHouse = enriched.isInHouse;
        const roomNumber = enriched.roomNumber;
        const guestName = enriched.guestName;
        const isAdvance = !isInHouse && enriched.checkInDate;
        return (
        <div
          key={alert.id}
          className={`flex items-start justify-between gap-3 p-3 border rounded-lg ${
            (alert as any).status === "completed" ? "opacity-60 bg-muted/30" : ""
          } ${isAdvance ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10" : ""}`}
          data-testid={`alert-${alert.id}`}
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {getPriorityBadge(alert.priority)}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                {roomNumber && (
                  <Badge variant="outline" className="text-xs font-mono px-1.5 py-0 h-5">
                    Hab. {roomNumber}
                  </Badge>
                )}
                {isAdvance && (
                  <Badge className="text-xs px-1.5 py-0 h-5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0">
                    <CalendarClock className="h-3 w-3 mr-1" />
                    Llegada mañana
                  </Badge>
                )}
                {guestName && (
                  <span className="text-xs text-muted-foreground font-medium">{guestName}</span>
                )}
              </div>
              <p className="text-sm">{alert.alertMessage}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Área: {AREA_OPTIONS.find((a) => a.value === alert.targetArea)?.label || alert.targetArea}
              </p>
              {(alert as any).status === "in_progress" && alert.acknowledgedBy && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  En proceso — {alert.acknowledgedBy} {alert.acknowledgedAt ? `· ${new Date(alert.acknowledgedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            {(alert as any).status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => acknowledgeMutation.mutate(alert.id)}
                disabled={acknowledgeMutation.isPending}
                data-testid={`btn-acknowledge-${alert.id}`}
              >
                <Clock className="h-4 w-4 mr-1" />
                En proceso
              </Button>
            )}
            {(alert as any).status === "in_progress" && (
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-300 hover:bg-green-50"
                onClick={() => completeMutation.mutate(alert.id)}
                disabled={completeMutation.isPending}
                data-testid={`btn-complete-${alert.id}`}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Completado
              </Button>
            )}
            {(alert as any).status === "completed" && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Completado
                {alert.acknowledgedBy && ` por ${alert.acknowledgedBy}`}
              </span>
            )}
          </div>
        </div>
        );
      })}
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
            <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
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
    mutationFn: async (prefId: string) => {
      await apiRequest("PATCH", `/api/guests/${selectedGuest?.id}/preferences/${prefId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", selectedGuest?.id, "preferences"] });
      toast({ title: "Preferencia actualizada" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (prefId: string) => {
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
                  <p className="font-medium text-sm">{guest.lastName} {guest.firstName}</p>
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
              ? `Preferencias de ${selectedGuest.lastName} ${selectedGuest.firstName}`
              : "Selecciona un huésped"}
          </CardTitle>
          {selectedGuest && (
            <div className="flex items-center gap-2">
              <SegmentBadge segment={selectedGuest.segment} />
              <Button size="sm" onClick={() => { setEditPref(null); setShowForm(true); }} data-testid="btn-add-preference">
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>
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
    return g ? `${g.lastName} ${g.firstName}` : "Desconocido";
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
                  {checkedInReservations.filter(r => r.id).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.guestId ? getGuestName(r.guestId) : "Sin huésped"} - Hab. {(r as any).room?.roomNumber || r.roomId}
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

  const selectedGuest = guests.find(g => g.id === selectedGuestId);

  const { data: preferences = [] } = useQuery<GuestPreference[]>({
    queryKey: ["/api/guests", selectedGuestId, "preferences"],
    enabled: !!selectedGuestId,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["/api/guests", selectedGuestId, "history"],
    enabled: !!selectedGuestId,
  });

  const filteredGuests = guests.filter((g) => {
    const q = search.toLowerCase();
    return g.firstName.toLowerCase().includes(q) || g.lastName.toLowerCase().includes(q) ||
      (g.documentNumber && g.documentNumber.toLowerCase().includes(q));
  });

  const statusLabels: Record<string, string> = {
    checked_out: "Check-out",
    checked_in: "In-house",
    confirmed: "Confirmada",
    web_checkin: "Pre Check-In",
    pending: "Pendiente",
    cancelled: "Cancelada",
  };

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
              placeholder="Nombre, apellido o DNI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-history"
            />
          </div>
          <ScrollArea className="h-[500px]">
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
                  <p className="font-medium text-sm">{g.lastName} {g.firstName}</p>
                  <p className="text-xs text-muted-foreground">{g.documentType?.toUpperCase()} {g.documentNumber}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          {selectedGuest ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {selectedGuest.lastName?.[0]}{selectedGuest.firstName?.[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{selectedGuest.lastName} {selectedGuest.firstName}</CardTitle>
                  <SegmentBadge segment={selectedGuest.segment} />
                </div>
                <p className="text-xs text-muted-foreground">{selectedGuest.documentType?.toUpperCase()} {selectedGuest.documentNumber}</p>
              </div>
            </div>
          ) : (
            <CardTitle className="text-base">Selecciona un huésped</CardTitle>
          )}
        </CardHeader>
        <CardContent>
          {!selectedGuestId ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Selecciona un huésped para ver su historial completo</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-5">
                {preferences.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2 text-primary">
                      <Heart className="h-4 w-4" />
                      Preferencias Activas ({preferences.filter(p => p.isActive).length})
                    </h4>
                    <div className="space-y-2">
                      {preferences.filter(p => p.isActive).map((p) => (
                        <div key={p.id} className="p-3 border rounded-lg bg-muted/30" data-testid={`history-pref-${p.id}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getCategoryIcon(p.category)}
                            <span className="font-medium text-sm">{p.title}</span>
                            {getPriorityBadge(p.priority)}
                          </div>
                          {p.description && <p className="text-xs text-muted-foreground mt-1 ml-6">{p.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Estadías ({history.length})
                  </h4>
                  {historyLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin estadías registradas</p>
                  ) : (
                    <div className="space-y-4">
                      {history.map((item: any) => {
                        const r = item.reservation;
                        const notes: StayNote[] = item.notes || [];
                        return (
                          <div key={r.id} className="border rounded-lg overflow-hidden" data-testid={`history-stay-${r.id}`}>
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium">Hab. {(r as any).room?.roomNumber || r.roomId}</span>
                                <span className="text-muted-foreground">·</span>
                                <span>{r.checkInDate} → {r.checkOutDate}</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {statusLabels[r.status] || r.status}
                              </Badge>
                            </div>
                            {notes.length > 0 ? (
                              <div className="divide-y">
                                {notes.map((note) => (
                                  <div key={note.id} className="px-3 py-2 flex items-start justify-between gap-2" data-testid={`history-note-${note.id}`}>
                                    <div className="flex items-start gap-2">
                                      {getCategoryIcon(note.category)}
                                      <div>
                                        <p className="text-sm font-medium">{note.title}</p>
                                        {note.description && <p className="text-xs text-muted-foreground">{note.description}</p>}
                                        <p className="text-xs text-muted-foreground">Por: {note.recordedBy || "—"}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {getPriorityBadge(note.priority)}
                                      {note.isResolved ? (
                                        <Badge variant="outline" className="text-green-600 text-xs">
                                          <CheckCircle className="h-3 w-3 mr-1" />
                                          Resuelta
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">Pendiente</Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="px-3 py-2 text-xs text-muted-foreground">Sin notas en esta estadía</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
