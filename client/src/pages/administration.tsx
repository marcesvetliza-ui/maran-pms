import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Users,
  Settings,
  Shield,
  Activity,
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  Clock,
  Save,
  History,
  Wallet,
  AlertTriangle,
  ChevronRight,
  Moon,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import { Bed, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/App";
import type { SystemUser, SystemSetting, AuditLog, SystemUserRole, BedType, SystemIncident } from "@shared/schema";

type DashboardStats = {
  totalUsers: number;
  activeUsers: number;
  recentLogins: number;
  totalSettings: number;
  recentAuditLogs: AuditLog[];
};

const userFormSchema = z.object({
  username: z.string().min(3, "Minimo 3 caracteres"),
  password: z.string().optional(),
  email: z.string().email("Email invalido"),
  fullName: z.string().min(2, "Nombre requerido"),
  role: z.string(),
  department: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.string().default("true"),
});

type UserFormValues = z.infer<typeof userFormSchema>;

const settingFormSchema = z.object({
  key: z.string().min(1, "Clave requerida"),
  value: z.string().min(1, "Valor requerido"),
  category: z.string().default("general"),
  description: z.string().optional(),
});

type SettingFormValues = z.infer<typeof settingFormSchema>;

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  reception: "Recepción",
  housekeeping: "Housekeeping",
  maintenance: "Mantenimiento",
  restaurant: "Restaurante",
  spa: "SPA",
  events: "Eventos",
  administracion: "Administración",
  responsable_area: "Responsable de Área",
  resp_deposito: "Resp. Depósito",
};

const actionLabels: Record<string, string> = {
  create: "Crear",
  update: "Actualizar",
  delete: "Eliminar",
  login: "Iniciar sesion",
  logout: "Cerrar sesion",
  view: "Ver",
  export: "Exportar",
};

const categoryLabels: Record<string, string> = {
  general: "General",
  reservations: "Reservas",
  billing: "Facturacion",
  amenities: "Amenidades",
  documentos: "Documentos",
};

const TEXTAREA_KEYS = ["confirmation_terms"];

// IncidenciasTab moved to maintenance.tsx
// NightAuditTab moved to cash-register.tsx

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  baja:    { label: "Baja",     color: "bg-green-100 text-green-700" },
  media:   { label: "Media",    color: "bg-yellow-100 text-yellow-700" },
  alta:    { label: "Alta",     color: "bg-orange-100 text-orange-700" },
  critica: { label: "Crítica",  color: "bg-red-100 text-red-700" },
};
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente:   { label: "Pendiente",   color: "bg-gray-100 text-gray-700" },
  en_revision: { label: "En revisión", color: "bg-blue-100 text-blue-700" },
  resuelto:    { label: "Resuelto",    color: "bg-green-100 text-green-700" },
  descartado:  { label: "Descartado",  color: "bg-gray-100 text-gray-500" },
};
const MODULES = [
  "planning", "reservas", "check-in", "check-out", "grupos",
  "restaurant", "spa", "eventos", "housekeeping", "hospitalidad",
  "inventario", "cajas", "reportes", "administracion", "otro",
];

function IncidenciasTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<SystemIncident | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newModule, setNewModule] = useState("otro");
  const [newSeverity, setNewSeverity] = useState("media");

  const [updateStatus, setUpdateStatus] = useState("");
  const [updateAssigned, setUpdateAssigned] = useState("");
  const [updateResolution, setUpdateResolution] = useState("");
  const [updateResolvedBy, setUpdateResolvedBy] = useState("");

  const queryParams = new URLSearchParams();
  if (filterStatus !== "all") queryParams.set("status", filterStatus);
  if (filterSeverity !== "all") queryParams.set("severity", filterSeverity);
  if (filterModule !== "all") queryParams.set("module", filterModule);

  const { data: incidents = [], isLoading } = useQuery<SystemIncident[]>({
    queryKey: ["/api/incidents", filterStatus, filterSeverity, filterModule],
    queryFn: async () => {
      const res = await fetch(`/api/incidents?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando incidentes");
      return res.json();
    },
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/incidents/stats"],
    queryFn: async () => {
      const res = await fetch("/api/incidents/stats", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al crear incidente");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/stats"] });
      setIsNewDialogOpen(false);
      setNewTitle(""); setNewDesc(""); setNewModule("otro"); setNewSeverity("media");
      toast({ title: "Incidencia registrada" });
    },
    onError: () => toast({ title: "Error", description: "No se pudo registrar la incidencia", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/stats"] });
      setIsDetailDialogOpen(false);
      toast({ title: "Incidencia actualizada" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/incidents/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Error al eliminar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/stats"] });
      setIsDetailDialogOpen(false);
      toast({ title: "Incidencia eliminada" });
    },
  });

  const openDetail = (incident: SystemIncident) => {
    setSelectedIncident(incident);
    setUpdateStatus(incident.status);
    setUpdateAssigned(incident.assignedTo || "");
    setUpdateResolution(incident.resolutionNotes || "");
    setUpdateResolvedBy(incident.resolvedBy || "");
    setIsDetailDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.pendiente ?? 0}</p>
            <p className="text-xs text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.en_revision ?? 0}</p>
            <p className="text-xs text-muted-foreground">En revisión</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.criticos ?? 0}</p>
            <p className="text-xs text-muted-foreground">Críticos abiertos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-400">
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.resuelto ?? 0}</p>
            <p className="text-xs text-muted-foreground">Resueltos</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros + botón nuevo */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="en_revision">En revisión</SelectItem>
            <SelectItem value="resuelto">Resuelto</SelectItem>
            <SelectItem value="descartado">Descartado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Gravedad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los módulos</SelectItem>
            {MODULES.map(m => (
              <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={() => setIsNewDialogOpen(true)} data-testid="btn-new-incident">
            <Plus className="h-4 w-4 mr-2" />
            Reportar incidencia
          </Button>
        </div>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : incidents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay incidencias registradas con los filtros actuales
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Gravedad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Reportado por</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow
                    key={incident.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(incident)}
                    data-testid={`incident-row-${incident.id}`}
                  >
                    <TableCell className="font-medium max-w-[200px] truncate">{incident.title}</TableCell>
                    <TableCell className="capitalize text-sm">{incident.module}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${SEVERITY_CONFIG[incident.severity]?.color}`}>
                        {SEVERITY_CONFIG[incident.severity]?.label ?? incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_CONFIG[incident.status]?.color}`}>
                        {STATUS_CONFIG[incident.status]?.label ?? incident.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{incident.reportedBy}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(incident.reportedAt).toLocaleDateString("es-AR")}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog — Nuevo incidente */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reportar incidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Descripción breve del problema"
                data-testid="input-incident-title"
              />
            </div>
            <div>
              <Label>Descripción detallada *</Label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="¿Qué pasó? ¿Cómo reproducirlo? ¿Qué se esperaba?"
                rows={4}
                data-testid="input-incident-desc"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Módulo</Label>
                <Select value={newModule} onValueChange={setNewModule}>
                  <SelectTrigger data-testid="select-incident-module"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULES.map(m => (
                      <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gravedad</Label>
                <Select value={newSeverity} onValueChange={setNewSeverity}>
                  <SelectTrigger data-testid="select-incident-severity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja — no bloquea operación</SelectItem>
                    <SelectItem value="media">Media — dificulta operación</SelectItem>
                    <SelectItem value="alta">Alta — bloquea parte del sistema</SelectItem>
                    <SelectItem value="critica">Crítica — sistema caído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Reportado por</Label>
              <Input
                value={user?.fullName || user?.username || ""}
                readOnly
                className="bg-muted"
                data-testid="input-incident-reporter"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({
                title: newTitle, description: newDesc,
                module: newModule, severity: newSeverity,
                reportedBy: user?.fullName || user?.username || "Usuario",
              })}
              disabled={!newTitle.trim() || !newDesc.trim() || createMutation.isPending}
              data-testid="btn-submit-incident"
            >
              {createMutation.isPending ? "Guardando..." : "Reportar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Detalle y actualización */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {selectedIncident?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedIncident && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={SEVERITY_CONFIG[selectedIncident.severity]?.color}>
                  {SEVERITY_CONFIG[selectedIncident.severity]?.label}
                </Badge>
                <Badge variant="outline" className="capitalize">{selectedIncident.module}</Badge>
                <Badge className={STATUS_CONFIG[selectedIncident.status]?.color}>
                  {STATUS_CONFIG[selectedIncident.status]?.label}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/20 whitespace-pre-wrap">
                {selectedIncident.description}
              </div>
              <div className="text-xs text-muted-foreground">
                Reportado por <strong>{selectedIncident.reportedBy}</strong> el{" "}
                {new Date(selectedIncident.reportedAt).toLocaleString("es-AR")}
              </div>
              {selectedIncident.resolvedAt && (
                <div className="text-xs text-muted-foreground">
                  Resuelto por <strong>{selectedIncident.resolvedBy}</strong> el{" "}
                  {new Date(selectedIncident.resolvedAt).toLocaleString("es-AR")}
                </div>
              )}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Actualizar estado</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <Select value={updateStatus} onValueChange={setUpdateStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendiente">Pendiente</SelectItem>
                        <SelectItem value="en_revision">En revisión</SelectItem>
                        <SelectItem value="resuelto">Resuelto</SelectItem>
                        <SelectItem value="descartado">Descartado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Asignado a</Label>
                    <Input
                      value={updateAssigned}
                      onChange={e => setUpdateAssigned(e.target.value)}
                      placeholder="Responsable"
                    />
                  </div>
                </div>
                {(updateStatus === "resuelto" || updateStatus === "descartado") && (
                  <div>
                    <Label className="text-xs">Resuelto por</Label>
                    <Input
                      value={updateResolvedBy}
                      onChange={e => setUpdateResolvedBy(e.target.value)}
                      placeholder="Quien resolvió"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Notas de resolución</Label>
                  <Textarea
                    value={updateResolution}
                    onChange={e => setUpdateResolution(e.target.value)}
                    placeholder="¿Cómo se resolvió? ¿Qué se cambió?"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {user?.role === "admin" && selectedIncident && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate(selectedIncident.id)}
                disabled={deleteMutation.isPending}
                className="mr-auto"
              >
                Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>Cerrar</Button>
            <Button
              onClick={() => selectedIncident && updateMutation.mutate({
                id: selectedIncident.id,
                data: {
                  status: updateStatus,
                  assignedTo: updateAssigned || null,
                  resolvedBy: updateResolvedBy || null,
                  resolutionNotes: updateResolution || null,
                },
              })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STATUS_COLOR_NA: Record<string, string> = {
  success: "text-green-600",
  partial: "text-yellow-600",
  failed: "text-red-600",
};
const STATUS_LABEL_NA: Record<string, string> = {
  success: "Exitoso",
  partial: "Parcial",
  failed: "Fallido",
};

function NightAuditTab() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [forceDate, setForceDate] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: status, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/night-audit/status"],
    refetchInterval: 60_000,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery<any[]>({
    queryKey: ["/api/night-audit/history"],
  });

  const runAudit = async (force = false) => {
    setIsRunning(true);
    setShowConfirm(false);
    try {
      const body: any = { force };
      if (forceDate) body.forceDate = forceDate;

      const res = await fetch("/api/night-audit/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        setShowConfirm(true);
        setIsRunning(false);
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error desconocido");
      }

      const data = await res.json();
      setLastResult(data);
      refetchStatus();
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ["/api/night-audit"] });
      toast({
        title: "Night Audit completado",
        description: `${data.inHouse?.total ?? 0} hab. ocupadas, ${data.arrivals?.total ?? 0} llegadas mañana`,
      });
    } catch (err: any) {
      toast({ title: "Error en Night Audit", description: err.message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`border-l-4 ${status?.yesterdayRan ? "border-l-green-400" : "border-l-red-400"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {status?.yesterdayRan
                ? <CheckCircle className="h-4 w-4 text-green-600" />
                : <AlertTriangle className="h-4 w-4 text-red-600" />}
              <span className="text-sm font-medium">Anoche</span>
            </div>
            <p className={`text-sm ${status?.yesterdayRan ? "text-green-600" : "text-red-600"}`}>
              {status?.yesterdayRan ? "Ejecutado correctamente" : "⚠ No se ejecutó"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Próxima ejecución</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {status?.nextScheduled ?? "00:05 hora Argentina"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Moon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Último audit</span>
            </div>
            {status?.lastAudit ? (
              <div>
                <p className={`text-sm font-medium ${STATUS_COLOR_NA[status.lastAudit.status]}`}>
                  {STATUS_LABEL_NA[status.lastAudit.status]} — {status.lastAudit.auditDate}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(status.lastAudit.executedAt).toLocaleString("es-AR")}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin registros</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Ejecución manual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            El night audit se ejecuta automáticamente a las 00:05. Podés ejecutarlo manualmente si es necesario.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Fecha a auditar (vacío = anoche)</Label>
              <Input
                type="date"
                value={forceDate}
                onChange={e => setForceDate(e.target.value)}
                className="w-44"
                data-testid="input-audit-date"
              />
            </div>
            <Button onClick={() => runAudit(false)} disabled={isRunning} data-testid="btn-run-night-audit">
              {isRunning ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Ejecutando...</>
              ) : (
                <><Moon className="h-4 w-4 mr-2" />Ejecutar Night Audit</>
              )}
            </Button>
          </div>

          {showConfirm && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md space-y-2">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                ⚠ Ya se ejecutó el night audit para esta fecha
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-500">
                ¿Querés ejecutarlo de nuevo? Esto puede generar cargos duplicados si ya se postearon.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => runAudit(true)}>
                  Ejecutar de todas formas
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowConfirm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Resultado — {lastResult.auditDate}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: "Hab. ocupadas", value: lastResult.inHouse?.total ?? 0 },
                { label: "Folios con saldo", value: lastResult.inHouse?.conSaldo ?? 0 },
                { label: "Llegadas mañana", value: lastResult.arrivals?.total ?? 0 },
                { label: "Sin prepago", value: lastResult.arrivals?.withoutPrepago ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {(lastResult.arrivals?.withoutPrepago ?? 0) > 0 && (
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {lastResult.arrivals.withoutPrepago} llegada(s) para mañana sin prepago registrado
                </p>
              </div>
            )}
            {lastResult.errors?.length > 0 && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                <p className="text-xs text-red-600 font-medium">Errores:</p>
                {lastResult.errors.map((e: string, i: number) => (
                  <p key={i} className="text-xs text-red-600">{e}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Historial de ejecuciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(history as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Sin registros aún</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ejecutado</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead className="text-center">Hab. ocupadas</TableHead>
                  <TableHead className="text-center">Con saldo</TableHead>
                  <TableHead className="text-center">Llegadas mañana</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history as any[]).map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell className="font-mono text-sm">{audit.auditDate}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(audit.executedAt).toLocaleString("es-AR")}
                      {audit.isManual && <Badge variant="outline" className="ml-1 text-[10px]">manual</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{audit.executedBy}</TableCell>
                    <TableCell className="text-center text-sm">{audit.reservationsProcessed}</TableCell>
                    <TableCell className="text-center text-sm">
                      {audit.reservationsSkipped > 0 ? (
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {audit.reservationsSkipped}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {audit.arrivalsNextDay}
                      {audit.arrivalsWithoutPrepago > 0 && (
                        <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {audit.arrivalsWithoutPrepago} sin prepago
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${
                        audit.status === "success"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : audit.status === "partial"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {STATUS_LABEL_NA[audit.status] ?? audit.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdministrationPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isSettingDialogOpen, setIsSettingDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [editingSetting, setEditingSetting] = useState<SystemSetting | null>(null);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [isBedTypeDialogOpen, setIsBedTypeDialogOpen] = useState(false);
  const [editingBedType, setEditingBedType] = useState<BedType | null>(null);
  const [bedTypeForm, setBedTypeForm] = useState({ code: "", name: "", description: "" });

  const { data: dashboardStats, isLoading: loadingStats } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard"],
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery<SystemUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: settings = [], isLoading: loadingSettings } = useQuery<SystemSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: auditLogs = [], isLoading: loadingLogs } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  const { data: cashConfigs = [], isLoading: loadingCashConfigs } = useQuery<any[]>({
    queryKey: ["/api/cash/configs"],
  });

  const [editingCashConfig, setEditingCashConfig] = useState<any>(null);
  const [cashConfigForm, setCashConfigForm] = useState({ areaLabel: "", shiftsPerDay: 1 });

  const updateCashConfigMutation = useMutation({
    mutationFn: async (data: { area: string; areaLabel: string; shiftsPerDay: number }) => {
      const res = await apiRequest("PATCH", `/api/cash/configs/${data.area}`, { areaLabel: data.areaLabel, shiftsPerDay: data.shiftsPerDay });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/configs"] });
      setEditingCashConfig(null);
      toast({ title: "Configuración actualizada" });
    },
  });

  const { data: bedTypesData = [], isLoading: loadingBedTypes } = useQuery<BedType[]>({
    queryKey: ["/api/bed-types"],
  });

  const createBedTypeMutation = useMutation({
    mutationFn: async (data: { code: string; name: string; description: string }) => {
      return apiRequest("POST", "/api/bed-types", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-types"] });
      setIsBedTypeDialogOpen(false);
      setBedTypeForm({ code: "", name: "", description: "" });
      toast({ title: "Tipo de camaje creado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al crear tipo de camaje", variant: "destructive" });
    },
  });

  const updateBedTypeMutation = useMutation({
    mutationFn: async (data: { id: number; code: string; name: string; description: string }) => {
      const { id, ...rest } = data;
      return apiRequest("PATCH", `/api/bed-types/${id}`, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-types"] });
      setIsBedTypeDialogOpen(false);
      setEditingBedType(null);
      setBedTypeForm({ code: "", name: "", description: "" });
      toast({ title: "Tipo de camaje actualizado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al actualizar tipo de camaje", variant: "destructive" });
    },
  });

  const toggleBedTypeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/bed-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-types"] });
      toast({ title: "Estado del tipo de camaje actualizado" });
    },
    onError: () => {
      toast({ title: "Error al cambiar estado", variant: "destructive" });
    },
  });

  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: "",
      password: "",
      email: "",
      fullName: "",
      role: "reception",
      department: "",
      phone: "",
      isActive: "true",
    },
  });

  const settingForm = useForm<SettingFormValues>({
    resolver: zodResolver(settingFormSchema),
    defaultValues: {
      key: "",
      value: "",
      category: "general",
      description: "",
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al crear usuario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setIsUserDialogOpen(false);
      userForm.reset();
      toast({ title: "Usuario creado correctamente" });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Error al crear usuario", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserFormValues & { id: string }) => {
      const { id, ...userData } = data;
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, userData);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al actualizar usuario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setIsUserDialogOpen(false);
      setEditingUser(null);
      userForm.reset();
      toast({ title: "Usuario actualizado correctamente" });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Error al actualizar usuario", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al eliminar usuario");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({ title: "Usuario eliminado correctamente" });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Error al eliminar usuario", variant: "destructive" });
    },
  });

  const upsertSettingMutation = useMutation({
    mutationFn: async (data: SettingFormValues) => {
      return apiRequest("PUT", "/api/admin/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setIsSettingDialogOpen(false);
      setEditingSetting(null);
      settingForm.reset();
      toast({ title: "Configuracion guardada correctamente" });
    },
    onError: () => {
      toast({ title: "Error al guardar configuracion", variant: "destructive" });
    },
  });

  const deleteSettingMutation = useMutation({
    mutationFn: async (key: string) => {
      return apiRequest("DELETE", `/api/admin/settings/${key}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({ title: "Configuracion eliminada correctamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar configuracion", variant: "destructive" });
    },
  });

  const openNewUserDialog = () => {
    setEditingUser(null);
    userForm.reset({
      username: "",
      password: "",
      email: "",
      fullName: "",
      role: "reception",
      department: "",
      phone: "",
      isActive: "true",
    });
    setIsUserDialogOpen(true);
  };

  const openEditUserDialog = (user: SystemUser) => {
    setEditingUser(user);
    userForm.reset({
      username: user.username,
      password: "",
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department || "",
      phone: user.phone || "",
      isActive: user.isActive || "true",
    });
    setIsUserDialogOpen(true);
  };

  const openNewSettingDialog = () => {
    setEditingSetting(null);
    settingForm.reset({
      key: "",
      value: "",
      category: "general",
      description: "",
    });
    setIsSettingDialogOpen(true);
  };

  const openEditSettingDialog = (setting: SystemSetting) => {
    setEditingSetting(setting);
    settingForm.reset({
      key: setting.key,
      value: setting.value,
      category: setting.category,
      description: setting.description || "",
    });
    setIsSettingDialogOpen(true);
  };

  const handleUserSubmit = (data: UserFormValues) => {
    if (editingUser) {
      updateUserMutation.mutate({ ...data, id: editingUser.id });
    } else {
      createUserMutation.mutate(data);
    }
  };

  const handleSettingSubmit = (data: SettingFormValues) => {
    upsertSettingMutation.mutate(data);
  };

  const filteredLogs = filterModule === "all"
    ? auditLogs
    : auditLogs.filter((log) => log.module === filterModule);

  const uniqueModules = Array.from(new Set(auditLogs.map((l) => l.module).filter((m): m is string => !!m && typeof m === "string")));

  const tcEnabled = settings.find(s => s.key === "confirmation_terms_enabled")?.value !== "false";

  const toggleTcMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PUT", "/api/admin/settings", {
        key: "confirmation_terms_enabled",
        value: enabled ? "true" : "false",
        category: "documentos",
        description: "Mostrar T&C en PDF de presupuesto",
        updatedBy: user?.id,
        updatedAt: new Date(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Configuración actualizada" });
    },
    onError: () => {
      toast({ title: "Error al actualizar", variant: "destructive" });
    },
  });

  const groupedSettings = settings
    .filter(s => s.key !== "confirmation_terms_enabled")
    .reduce((acc, setting) => {
      const cat = setting.category || "general";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(setting);
      return acc;
    }, {} as Record<string, SystemSetting[]>);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-title">Administracion</h1>
          <p className="text-muted-foreground">Gestion del sistema, usuarios y configuracion</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard" data-testid="tab-admin-dashboard">
            <Activity className="w-4 h-4 mr-2" />
            Panel
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-admin-users">
            <Users className="w-4 h-4 mr-2" />
            Usuarios
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-admin-settings">
            <Settings className="w-4 h-4 mr-2" />
            Configuracion
          </TabsTrigger>
          <TabsTrigger value="bed-types" data-testid="tab-admin-bed-types">
            <Bed className="w-4 h-4 mr-2" />
            Tipos de Camaje
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-admin-audit">
            <History className="w-4 h-4 mr-2" />
            Auditoria
          </TabsTrigger>
          <TabsTrigger value="cash-config" data-testid="tab-admin-cash-config">
            <Wallet className="w-4 h-4 mr-2" />
            Cajas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-total-users">
                    {dashboardStats?.totalUsers || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuarios Activos</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold text-green-600" data-testid="text-active-users">
                    {dashboardStats?.activeUsers || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sesiones Hoy</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-recent-logins">
                    {dashboardStats?.recentLogins || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Configuraciones</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-total-settings">
                    {dashboardStats?.totalSettings || 0}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>Ultimas acciones en el sistema</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Accion</TableHead>
                      <TableHead>Modulo</TableHead>
                      <TableHead>Descripcion</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dashboardStats?.recentAuditLogs || []).slice(0, 5).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.userName || "Sistema"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{actionLabels[log.action] || log.action}</Badge>
                        </TableCell>
                        <TableCell className="capitalize">{log.module}</TableCell>
                        <TableCell className="text-muted-foreground">{log.description}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(log.timestamp), "dd/MM HH:mm", { locale: es })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!dashboardStats?.recentAuditLogs || dashboardStats.recentAuditLogs.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No hay actividad reciente
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Usuarios del Sistema</h2>
            <Button onClick={openNewUserDialog} data-testid="button-new-user">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loadingUsers ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Ultimo Acceso</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {roleLabels[user.role] || user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.department || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={user.isActive === "true" ? "default" : "secondary"}>
                            {user.isActive === "true" ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.lastLogin
                            ? format(new Date(user.lastLogin), "dd/MM/yyyy HH:mm", { locale: es })
                            : "Nunca"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditUserDialog(user)}
                              data-testid={`button-edit-user-${user.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteUserMutation.mutate(user.id)}
                              disabled={user.role === "admin"}
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No hay usuarios registrados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Configuracion del Sistema</h2>
            <Button onClick={openNewSettingDialog} data-testid="button-new-setting">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Configuracion
            </Button>
          </div>

          {loadingSettings ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            Object.entries(groupedSettings).map(([category, categorySettings]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-base">{categoryLabels[category] || category}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Clave</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Descripcion</TableHead>
                        <TableHead>Actualizado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categorySettings.map((setting) => (
                        <TableRow key={setting.id} data-testid={`row-setting-${setting.id}`}>
                          <TableCell className="font-mono text-sm">{setting.key}</TableCell>
                          <TableCell className="font-medium max-w-[220px]">
                            {setting.key === "confirmation_terms" ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={tcEnabled}
                                  onCheckedChange={(checked) => toggleTcMutation.mutate(checked)}
                                  disabled={toggleTcMutation.isPending}
                                  data-testid="switch-confirmation-terms"
                                />
                                <span className={tcEnabled ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
                                  {tcEnabled ? "Activo" : "Inactivo"}
                                </span>
                              </div>
                            ) : TEXTAREA_KEYS.includes(setting.key)
                              ? `${setting.value.split("\n").filter(l => l.trim()).length} cláusulas`
                              : <span className="truncate block max-w-[200px]">{setting.value}</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {setting.description || "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(setting.updatedAt), "dd/MM/yyyy HH:mm", { locale: es })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEditSettingDialog(setting)}
                                data-testid={`button-edit-setting-${setting.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteSettingMutation.mutate(setting.key)}
                                data-testid={`button-delete-setting-${setting.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="bed-types" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Tipos de Camaje</h2>
            <Button
              onClick={() => {
                setEditingBedType(null);
                setBedTypeForm({ code: "", name: "", description: "" });
                setIsBedTypeDialogOpen(true);
              }}
              data-testid="button-new-bed-type"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Tipo de Camaje
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loadingBedTypes ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Codigo</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Descripcion</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bedTypesData.map((bt) => (
                      <TableRow key={bt.id} data-testid={`row-bed-type-${bt.id}`}>
                        <TableCell className="font-mono text-sm">{bt.code}</TableCell>
                        <TableCell className="font-medium">{bt.name}</TableCell>
                        <TableCell className="text-muted-foreground">{bt.description || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={bt.isActive ? "default" : "secondary"}>
                            {bt.isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingBedType(bt);
                                setBedTypeForm({
                                  code: bt.code,
                                  name: bt.name,
                                  description: bt.description || "",
                                });
                                setIsBedTypeDialogOpen(true);
                              }}
                              data-testid={`button-edit-bed-type-${bt.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleBedTypeMutation.mutate(bt.id)}
                              data-testid={`button-toggle-bed-type-${bt.id}`}
                            >
                              {bt.isActive ? <Trash2 className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {bedTypesData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No hay tipos de camaje registrados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Registro de Auditoria</h2>
            <Select value={filterModule} onValueChange={setFilterModule}>
              <SelectTrigger className="w-48" data-testid="select-audit-filter">
                <SelectValue placeholder="Filtrar por modulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los modulos</SelectItem>
                {uniqueModules.map((mod) => (
                  <SelectItem key={mod} value={mod}>
                    {mod.charAt(0).toUpperCase() + mod.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loadingLogs ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha/Hora</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Accion</TableHead>
                      <TableHead>Modulo</TableHead>
                      <TableHead>Descripcion</TableHead>
                      <TableHead>Detalles</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                        </TableCell>
                        <TableCell className="font-medium">{log.userName || "Sistema"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{actionLabels[log.action] || log.action}</Badge>
                        </TableCell>
                        <TableCell className="capitalize">{log.module}</TableCell>
                        <TableCell>{log.description}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">
                          {log.details || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {log.ipAddress || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No hay registros de auditoria
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash-config" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Configuración de Cajas</h2>
          </div>
          <Card>
            <CardContent className="pt-6">
              {loadingCashConfigs ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Área</TableHead>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead>Turnos por día</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashConfigs.map((config: any) => (
                      <TableRow key={config.area} data-testid={`row-cash-config-${config.area}`}>
                        <TableCell className="font-mono">{config.area}</TableCell>
                        <TableCell className="font-medium">{config.areaLabel}</TableCell>
                        <TableCell>{config.shiftsPerDay}</TableCell>
                        <TableCell>
                          <Badge variant={config.isActive ? "default" : "secondary"}>
                            {config.isActive ? "Activa" : "Inactiva"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`btn-edit-cash-config-${config.area}`}
                            onClick={() => {
                              setEditingCashConfig(config);
                              setCashConfigForm({ areaLabel: config.areaLabel, shiftsPerDay: config.shiftsPerDay });
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={!!editingCashConfig} onOpenChange={(open) => { if (!open) setEditingCashConfig(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Configuración de Caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Etiqueta del área</Label>
              <Input
                value={cashConfigForm.areaLabel}
                onChange={(e) => setCashConfigForm(prev => ({ ...prev, areaLabel: e.target.value }))}
                data-testid="input-cash-config-label"
              />
            </div>
            <div>
              <Label>Turnos por día</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={cashConfigForm.shiftsPerDay}
                onChange={(e) => setCashConfigForm(prev => ({ ...prev, shiftsPerDay: parseInt(e.target.value) || 1 }))}
                data-testid="input-cash-config-shifts"
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  if (editingCashConfig) {
                    updateCashConfigMutation.mutate({
                      area: editingCashConfig.area,
                      areaLabel: cashConfigForm.areaLabel,
                      shiftsPerDay: cashConfigForm.shiftsPerDay,
                    });
                  }
                }}
                disabled={updateCashConfigMutation.isPending}
                data-testid="btn-save-cash-config"
              >
                <Save className="h-4 w-4 mr-2" />
                Guardar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
          </DialogHeader>
          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit(handleUserSubmit)} className="space-y-4">
              <FormField
                control={userForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuario</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="nombre.usuario"
                        disabled={!!editingUser}
                        data-testid="input-user-username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Contraseña{" "}
                      {editingUser && (
                        <span className="text-xs text-muted-foreground font-normal">(dejar vacío para no cambiar)</span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder={editingUser ? "••••••••" : "Mínimo 6 caracteres"}
                        data-testid="input-user-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Completo</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Juan Perez" data-testid="input-user-fullname" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="usuario@maransuites.com"
                        data-testid="input-user-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={userForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-user-role">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(roleLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={userForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-user-status">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="true">Activo</SelectItem>
                          <SelectItem value="false">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={userForm.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departamento (Caja)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-user-department">
                          <SelectValue placeholder="Seleccionar área de caja..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Sin departamento</SelectItem>
                        {cashConfigs.filter((c: any) => c.isActive).map((c: any) => (
                          <SelectItem key={c.area} value={c.area}>{c.areaLabel}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+54 343 400-0000" data-testid="input-user-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsUserDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createUserMutation.isPending || updateUserMutation.isPending}
                  data-testid="button-save-user"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingUser ? "Guardar Cambios" : "Crear Usuario"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingDialogOpen} onOpenChange={setIsSettingDialogOpen}>
        <DialogContent className={TEXTAREA_KEYS.includes(settingForm.watch("key")) ? "max-w-2xl" : "max-w-md"}>
          <DialogHeader>
            <DialogTitle>
              {editingSetting ? "Editar Configuracion" : "Nueva Configuracion"}
            </DialogTitle>
          </DialogHeader>
          <Form {...settingForm}>
            <form onSubmit={settingForm.handleSubmit(handleSettingSubmit)} className="space-y-4">
              <FormField
                control={settingForm.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clave</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="nombre_configuracion"
                        disabled={!!editingSetting}
                        data-testid="input-setting-key"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={settingForm.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor</FormLabel>
                    <FormControl>
                      {TEXTAREA_KEYS.includes(settingForm.watch("key")) ? (
                        <Textarea
                          {...field}
                          placeholder="Una cláusula por línea..."
                          rows={10}
                          className="font-sans text-sm resize-y"
                          data-testid="textarea-setting-value"
                        />
                      ) : (
                        <Input {...field} placeholder="valor" data-testid="input-setting-value" />
                      )}
                    </FormControl>
                    {TEXTAREA_KEYS.includes(settingForm.watch("key")) && (
                      <p className="text-xs text-muted-foreground">
                        Cada línea es una cláusula numerada. Se muestran en el PDF de confirmación.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={settingForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-setting-category">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={settingForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripcion</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Descripcion de la configuracion"
                        data-testid="input-setting-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSettingDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={upsertSettingMutation.isPending}
                  data-testid="button-save-setting"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isBedTypeDialogOpen} onOpenChange={setIsBedTypeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBedType ? "Editar Tipo de Camaje" : "Nuevo Tipo de Camaje"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingBedType) {
                updateBedTypeMutation.mutate({ id: editingBedType.id, ...bedTypeForm });
              } else {
                createBedTypeMutation.mutate(bedTypeForm);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Codigo</Label>
              <Input
                value={bedTypeForm.code}
                onChange={(e) => setBedTypeForm({ ...bedTypeForm, code: e.target.value })}
                placeholder="MAT, TWIN, etc."
                data-testid="input-bed-type-code"
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={bedTypeForm.name}
                onChange={(e) => setBedTypeForm({ ...bedTypeForm, name: e.target.value })}
                placeholder="Matrimonial, Twin, etc."
                data-testid="input-bed-type-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripcion</Label>
              <Input
                value={bedTypeForm.description}
                onChange={(e) => setBedTypeForm({ ...bedTypeForm, description: e.target.value })}
                placeholder="Descripcion del tipo de camaje"
                data-testid="input-bed-type-description"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsBedTypeDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createBedTypeMutation.isPending || updateBedTypeMutation.isPending}
                data-testid="button-save-bed-type"
              >
                <Save className="w-4 h-4 mr-2" />
                {editingBedType ? "Guardar Cambios" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
