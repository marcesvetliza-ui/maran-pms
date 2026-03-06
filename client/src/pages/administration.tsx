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
} from "lucide-react";
import { Bed, Check } from "lucide-react";
import type { SystemUser, SystemSetting, AuditLog, SystemUserRole, BedType } from "@shared/schema";

type DashboardStats = {
  totalUsers: number;
  activeUsers: number;
  recentLogins: number;
  totalSettings: number;
  recentAuditLogs: AuditLog[];
};

const userFormSchema = z.object({
  username: z.string().min(3, "Minimo 3 caracteres"),
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
  reception: "Recepcion",
  housekeeping: "Housekeeping",
  maintenance: "Mantenimiento",
  restaurant: "Restaurante",
  spa: "SPA",
  events: "Eventos",
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
};

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
      return apiRequest("POST", "/api/admin/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setIsUserDialogOpen(false);
      userForm.reset();
      toast({ title: "Usuario creado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al crear usuario", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserFormValues & { id: string }) => {
      const { id, ...userData } = data;
      return apiRequest("PATCH", `/api/admin/users/${id}`, userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setIsUserDialogOpen(false);
      setEditingUser(null);
      userForm.reset();
      toast({ title: "Usuario actualizado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al actualizar usuario", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      toast({ title: "Usuario eliminado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar usuario", variant: "destructive" });
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

  const uniqueModules = Array.from(new Set(auditLogs.map((l) => l.module)));

  const groupedSettings = settings.reduce((acc, setting) => {
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
                          <TableCell className="font-medium">{setting.value}</TableCell>
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
                    <FormLabel>Departamento</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Recepcion" data-testid="input-user-department" />
                    </FormControl>
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
        <DialogContent className="max-w-md">
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
                      <Input {...field} placeholder="valor" data-testid="input-setting-value" />
                    </FormControl>
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
