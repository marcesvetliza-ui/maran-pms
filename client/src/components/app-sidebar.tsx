import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Activity,
  TrendingUp,
  BarChart2,
  FileBarChart2,
  CalendarDays,
  BookOpen,
  Zap,
  LogIn,
  LogOut,
  BedDouble,
  Tag,
  Package,
  Globe,
  Users,
  Star,
  User,
  Building2,
  Briefcase,
  UtensilsCrossed,
  Sparkles,
  Heart,
  CalendarCheck,
  Brush,
  Wrench,
  ClipboardList,
  HandHeart,
  MessageCircle,
  Calculator,
  Landmark,
  Settings,
  Code2,
  Hotel,
  Bell,
  CheckCheck,
  AlertTriangle,
  Smartphone,
  Bot,
  Mail,
  ShoppingBag,
  MonitorSmartphone,
  Megaphone,
  ChevronDown,
  ChevronRight,
  KeyRound,
  ChefHat,
  Store,
  Gift,
  CreditCard,
  FileWarning,
} from "lucide-react";
import { useAuth } from "@/App";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SystemNotification } from "@shared/schema";

// ─── Permisos por rol (según matriz aprobada) ────────────────────────────────
// Roles disponibles: admin, manager, spa, maintenance, housekeeping, restaurant,
//   events, reception, resp_deposito, resp_administracion, jefe_recepcion, comercial

const DASHBOARD_ROLES   = ["admin","manager","ama_de_llaves","spa","restaurant","events","reception","resp_deposito","resp_administracion","jefe_recepcion","comercial"];
const PLANNING_ROLES    = ["admin","manager","ama_de_llaves","housekeeping","restaurant","events","reception","resp_administracion","jefe_recepcion","comercial"];
const CORE_RECEPCION    = ["admin","reception","jefe_recepcion","comercial"];
const CHECKINOUT_ROLES  = ["admin","manager","ama_de_llaves","housekeeping","events","reception","jefe_recepcion","comercial"];
const HABITACIONES_ROLES= ["admin","manager","ama_de_llaves","housekeeping","reception","jefe_recepcion","comercial"];
const TARIFAS_ROLES     = ["admin","manager","ama_de_llaves","reception","resp_administracion","jefe_recepcion","comercial"];
const HUESPEDES_ROLES   = ["admin","events","reception","jefe_recepcion","comercial"];
const PAQUETES_ROLES    = ["admin","spa","reception","jefe_recepcion","comercial"];
const PRESUPUESTOS_ROLES= ["admin","manager","ama_de_llaves","spa","events","reception","resp_administracion","jefe_recepcion","comercial"];
const RESTAURANT_ROLES  = ["admin","manager","ama_de_llaves","restaurant","events","reception","resp_deposito","jefe_recepcion","comercial"];
const RECETAS_ROLES     = ["admin","manager","ama_de_llaves","events","resp_deposito"];
const SPA_ROLES         = ["admin","manager","ama_de_llaves","spa","reception","jefe_recepcion","comercial"];
const SPA_CLIENTS_ROLES = ["admin","manager","ama_de_llaves","spa"];
const EVENTOS_ROLES     = ["admin","manager","ama_de_llaves","spa","restaurant","events","reception","resp_deposito","resp_administracion","jefe_recepcion","comercial"];
const HK_MODULE_ROLES   = ["admin","manager","ama_de_llaves","housekeeping","reception","jefe_recepcion","comercial"];
const MANT_MODULE_ROLES = ["admin","manager","ama_de_llaves","housekeeping","reception","jefe_recepcion","comercial"];
const INVENTARIO_ROLES  = ["admin","manager","ama_de_llaves","spa","resp_deposito","resp_administracion"];
const HOSPITALIDAD_ROLES= ["admin","manager","ama_de_llaves","spa","housekeeping","restaurant","events","reception","jefe_recepcion","comercial"];
const RESENAS_ROLES     = ["admin","manager","ama_de_llaves","reception","jefe_recepcion","comercial"];
const ADMIN_MOD_ROLES   = ["admin","manager","resp_deposito","resp_administracion","jefe_recepcion"];
const CC_ROLES          = ["admin","manager","resp_administracion","jefe_recepcion","comercial"];
const CAJA_ROLES        = ["admin","manager","restaurant","spa","events","reception","resp_administracion","jefe_recepcion","comercial"];
const GERENCIA_ROLES    = ["admin","manager","ama_de_llaves","resp_administracion","jefe_recepcion","comercial"];

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULOS DEL SISTEMA — cada sección corresponde a un módulo vendible.
// El orden refleja la jerarquía de uso: core primero, soporte al final.
// ─────────────────────────────────────────────────────────────────────────────
const menuSections = [
  // ── MÓDULO 1: PMS Core ────────────────────────────────────────────────────
  {
    titulo: "PMS — Recepción",
    items: [
      { label: "Dashboard",      icon: LayoutDashboard, href: "/",                roles: DASHBOARD_ROLES },
      { label: "Planning",       icon: CalendarDays,    href: "/planning",        roles: PLANNING_ROLES },
      { label: "Reservas",       icon: BookOpen,        href: "/reservations",    roles: CORE_RECEPCION },
      { label: "Reserva rápida", icon: Zap,             href: "/new-reservation", roles: CORE_RECEPCION },
      { label: "Check in",       icon: LogIn,           href: "/check-in",        roles: CHECKINOUT_ROLES },
      { label: "Check out",      icon: LogOut,          href: "/check-out",       roles: CHECKINOUT_ROLES },
      { label: "Habitaciones",   icon: BedDouble,       href: "/rooms",           roles: HABITACIONES_ROLES },
      {
        label: "Reportes",
        icon: FileBarChart2,
        roles: HABITACIONES_ROLES,
        subItems: [
          { label: "Hab. Ocupadas",   icon: BedDouble,     href: "/rooms?tab=ocupadas", roles: HABITACIONES_ROLES },
          { label: "Planilla Diaria", icon: ClipboardList, href: "/daily-report",       roles: HABITACIONES_ROLES },
          { label: "Reporte INDEC",   icon: ClipboardList, href: "/admin/indec",        roles: ADMIN_MOD_ROLES },
        ],
      },
      { label: "Tarifas",        icon: Tag,             href: "/rate-plans",      roles: TARIFAS_ROLES },
      { label: "Huéspedes",      icon: User,            href: "/guests",          roles: HUESPEDES_ROLES },
    ],
  },

  // ── MÓDULO 2: Comercial ───────────────────────────────────────────────────
  {
    titulo: "Comercial",
    items: [
      { label: "Motor de Reservas", icon: MonitorSmartphone, href: "/admin/booking-engine", roles: CORE_RECEPCION },
      { label: "Canales OTAs",      icon: Globe,             href: "/ota-channels",         roles: CORE_RECEPCION },
      { label: "Grupos",            icon: Users,             href: "/groups",               roles: CORE_RECEPCION },
      { label: "Empresas",          icon: Building2,         href: "/companies",            roles: CORE_RECEPCION },
      { label: "Agencias",          icon: Briefcase,         href: "/agencies",             roles: CORE_RECEPCION },
      { label: "Paquetes",          icon: Package,           href: "/packages",             roles: PAQUETES_ROLES },
      { label: "Presupuestos",      icon: ClipboardList,     href: "/presupuestos",         roles: PRESUPUESTOS_ROLES },
    ],
  },

  // ── MÓDULO 3: Servicios ───────────────────────────────────────────────────
  {
    titulo: "Servicios",
    items: [
      { label: "Restaurant",       icon: UtensilsCrossed, href: "/restaurant",         roles: RESTAURANT_ROLES },
      { label: "Spa",              icon: Sparkles,        href: "/spa",                roles: SPA_ROLES },
      { label: "Clientes Spa",     icon: Heart,           href: "/spa-clients",        roles: SPA_CLIENTS_ROLES },
      { label: "Eventos",          icon: CalendarCheck,   href: "/events",             roles: EVENTOS_ROLES },
      { label: "Vouchers Regalo",  icon: Gift,            href: "/gift-vouchers",      roles: SPA_ROLES },
    ],
  },

  // ── MÓDULO 4: Operaciones ─────────────────────────────────────────────────
  {
    titulo: "Operaciones",
    items: [
      { label: "Housekeeping",  icon: Brush,   href: "/housekeeping", roles: HK_MODULE_ROLES },
      { label: "Mantenimiento", icon: Wrench,  href: "/maintenance",  roles: MANT_MODULE_ROLES },
      { label: "Inventario",    icon: Package, href: "/inventory",    roles: INVENTARIO_ROLES },
      { label: "Recetas y Costos", icon: ChefHat, href: "/restaurant/recetas", roles: RECETAS_ROLES },
    ],
  },

  // ── MÓDULO 5: Experiencia al Huésped ─────────────────────────────────────
  {
    titulo: "Experiencia al Huésped",
    items: [
      { label: "Hospitalidad", icon: HandHeart, href: "/hospitality", roles: HOSPITALIDAD_ROLES },
      { label: "MARA Chatbot", icon: Bot,       href: "/chatbot",     roles: CORE_RECEPCION },
      { label: "Reseñas",      icon: Star,      href: "/reviews",     roles: RESENAS_ROLES },
    ],
  },

  // ── MÓDULO 6: Administración ──────────────────────────────────────────────
  {
    titulo: "Administración",
    items: [
      { label: "Administración",     icon: Calculator, href: "/admin",         roles: ADMIN_MOD_ROLES },
      { label: "Cuentas Corrientes", icon: CreditCard, href: "/admin/cuentas", roles: CC_ROLES },
      { label: "Caja",               icon: Landmark,   href: "/cash-register", roles: CAJA_ROLES },
      { label: "Plan de Cuentas",    icon: BookOpen,   href: "/admin/accounting-accounts", roles: ["admin","resp_administracion"] },
      { label: "Centros de Costo",   icon: Tag,        href: "/admin/cost-centers", roles: ["admin","resp_administracion"] },
      { label: "Revisión fiscal SPA", icon: FileWarning, href: "/admin/spa-fiscal-review", roles: ["admin","manager","resp_administracion"] },
    ],
  },

  // ── MÓDULO 7: Gerencia & Revenue ─────────────────────────────────────────
  {
    titulo: "Gerencia & Revenue",
    items: [
      { label: "Operaciones", icon: Activity,   href: "/operaciones", roles: GERENCIA_ROLES },
      { label: "Ejecutivo",   icon: TrendingUp, href: "/executive",   roles: GERENCIA_ROLES },
      { label: "Reportes",    icon: BarChart2,  href: "/reports",     roles: GERENCIA_ROLES },
    ],
  },

  // ── CONFIGURACIÓN (sistema, siempre al final) ─────────────────────────────
  {
    titulo: "Configuración",
    items: [
      { label: "Configuración",          icon: Settings,      href: "/administration",      roles: ["admin"] },
      { label: "Reparar tipos de habitación", icon: Wrench,   href: "/admin/room-types/integrity", roles: ["admin","manager"] },
      { label: "Correo & Backup",        icon: Mail,          href: "/email-config",        roles: ["admin"] },
      { label: "Países (ARCA)",          icon: Globe,         href: "/admin/countries",     roles: ["admin"] },
      { label: "Conf. Presupuestos",     icon: ClipboardList, href: "/config/presupuestos", roles: ["admin"] },
      { label: "Puntos de Venta",        icon: Store,         href: "/pos-configs",         roles: ["admin","resp_administracion"] },
      { label: "Seguridad de claves",    icon: KeyRound,      href: "/seguridad",           roles: ["admin"] },
      { label: "Código fuente",          icon: Code2,         href: "/source-code",         roles: ["admin"], adminOnly: true, devOnly: true },
    ],
  },
];

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function getNotificationIcon(type: string) {
  if (type === "web_checkin") return <Smartphone className="h-4 w-4 text-green-500" />;
  if (type.startsWith("chatbot_")) return <Bot className="h-4 w-4 text-blue-500" />;
  if (type === "hospitality_alert") return <Heart className="h-4 w-4 text-red-500" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

function getAreaLabel(area: string): string {
  const labels: Record<string, string> = {
    reception: "Recepción",
    housekeeping: "Housekeeping",
    maintenance: "Mantenimiento",
    restaurant: "Restaurante",
    spa: "SPA",
    all: "General",
  };
  return labels[area] || area;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery<SystemNotification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications?limit=20");
      return res.json();
    },
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number | string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = countData?.count || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5 text-sidebar-foreground" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
              data-testid="badge-notification-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="right" align="start">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold text-sm">Notificaciones</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Marcar todas como leídas
            </Button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {notifications && notifications.length > 0 ? (
            <div className="divide-y">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                    !n.isRead ? "bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    if (!n.isRead) markReadMutation.mutate(n.id);
                    if (n.type.startsWith("chatbot_")) {
                      setOpen(false);
                      navigate("/chatbot");
                    }
                  }}
                  data-testid={`notification-item-${n.id}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`text-sm font-medium truncate ${
                            !n.isRead ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {n.title}
                        </span>
                        {n.priority === "urgent" && (
                          <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {getAreaLabel(n.targetArea)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {n.createdAt ? formatTimeAgo(n.createdAt) : ""}
                        </span>
                      </div>
                    </div>
                    {!n.isRead && (
                      <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Sin notificaciones</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TurnoAlert() {
  const { data: autocreados = [] } = useQuery<any[]>({
    queryKey: ["/api/cash/shifts/autocreados"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/cash/shifts/autocreados");
      return res.json();
    },
    refetchInterval: 60000,
  });
  if (!autocreados.length) return null;
  return (
    <span
      title={`${autocreados.length} turno(s) sin operador asignado`}
      className="relative p-1.5 rounded-md flex items-center justify-center text-yellow-500"
      data-testid="badge-turno-alert"
    >
      <AlertTriangle className="h-5 w-5" />
      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-white">
        {autocreados.length}
      </span>
    </span>
  );
}

const COLLAPSED_KEY = "sidebar_collapsed_sections";
const SUB_COLLAPSED_KEY = "sidebar_collapsed_subgroups";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Sub-group collapse state (keyed by "SectionTitle:SubGroupLabel")
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(SUB_COLLAPSED_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSection = (titulo: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [titulo]: !prev[titulo] };
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const toggleSubGroup = (key: string) => {
    setCollapsedSubs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(SUB_COLLAPSED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Auto-expand the section that contains the current active route (including sub-items)
  useEffect(() => {
    const role = user?.role || "";
    for (const section of menuSections) {
      const hasActive = section.items.some(item => {
        if ((item as any).roles && !(item as any).roles.includes(role)) return false;
        if ("subItems" in item && (item as any).subItems) {
          return (item as any).subItems.some((sub: any) => {
            if (!sub.roles.includes(role)) return false;
            const subPath = sub.href.split("?")[0];
            return location === subPath || location.startsWith(subPath + "/");
          });
        }
        return (item as any).href === "/"
          ? location === "/"
          : location === (item as any).href || location.startsWith((item as any).href + "/");
      });
      if (hasActive) {
        setCollapsed(prev => {
          if (!prev[section.titulo]) return prev;
          const next = { ...prev, [section.titulo]: false };
          try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      }
    }
  }, [location, user?.role]);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
            <Hotel className="h-6 w-6" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-lg font-semibold text-sidebar-foreground leading-tight">Maran Suites</span>
            <span className="text-xs text-muted-foreground">Sistema de Gestión</span>
          </div>
          <TurnoAlert />
          <NotificationBell />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {menuSections.map((section) => {
          const role = user?.role || "";
          const visibleItems = section.items.filter(item => {
            const itemRoles = (item as any).roles as string[] | undefined;
            if (itemRoles && !itemRoles.includes(role)) return false;
            if ((item as any).devOnly && !import.meta.env.DEV) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;

          const isCollapsed = !!collapsed[section.titulo];

          return (
            <SidebarGroup key={section.titulo} className="py-0">
              <button
                onClick={() => toggleSection(section.titulo)}
                className="flex items-center justify-between w-full px-4 py-1.5 mt-2 group hover:bg-sidebar-accent/50 rounded-md transition-colors"
                data-testid={`sidebar-section-${section.titulo.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 group-hover:text-muted-foreground/90 transition-colors">
                  {section.titulo}
                </span>
                <ChevronDown
                  className={`h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-all duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                />
              </button>

              <div
                ref={el => { contentRefs.current[section.titulo] = el; }}
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{ maxHeight: isCollapsed ? "0px" : "600px", opacity: isCollapsed ? 0 : 1 }}
              >
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleItems.map((item) => {
                      // ── Sub-group (collapsible) ──────────────────────────
                      if ("subItems" in item && (item as any).subItems) {
                        const subKey = `${section.titulo}:${item.label}`;
                        const isSubCollapsed = !!collapsedSubs[subKey];
                        const visibleSubItems = ((item as any).subItems as any[]).filter(
                          (sub: any) => sub.roles.includes(role)
                        );
                        if (visibleSubItems.length === 0) return null;
                        const hasActiveSubItem = visibleSubItems.some((sub: any) => {
                          const subPath = sub.href.split("?")[0];
                          return location === subPath || location.startsWith(subPath + "/");
                        });
                        return (
                          <SidebarMenuItem key={item.label}>
                            {/* Sub-group header */}
                            <button
                              onClick={() => toggleSubGroup(subKey)}
                              className={`flex items-center w-full gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-sidebar-accent/60 ${
                                hasActiveSubItem
                                  ? "text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70"
                              }`}
                            >
                              <item.icon className="h-4 w-4 shrink-0" />
                              <span className="flex-1 text-left">{item.label}</span>
                              <ChevronRight
                                className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                                  isSubCollapsed ? "rotate-0" : "rotate-90"
                                }`}
                              />
                            </button>
                            {/* Sub-items */}
                            {!isSubCollapsed && (
                              <div className="ml-3 mt-0.5 border-l border-border/40 pl-2 pb-0.5">
                                <SidebarMenu>
                                  {visibleSubItems.map((sub: any) => {
                                    const subPath = sub.href.split("?")[0];
                                    const isActive =
                                      location === subPath ||
                                      location.startsWith(subPath + "/");
                                    const subTestId = `nav-${sub.href.replace(/^\//, "").replace(/[\/?]/g, "-") || "sub"}`;
                                    return (
                                      <SidebarMenuItem key={sub.href}>
                                        <SidebarMenuButton
                                          asChild
                                          isActive={isActive}
                                          data-testid={subTestId}
                                        >
                                          <Link href={sub.href}>
                                            <sub.icon className="h-4 w-4 shrink-0" />
                                            <span>{sub.label}</span>
                                          </Link>
                                        </SidebarMenuButton>
                                      </SidebarMenuItem>
                                    );
                                  })}
                                </SidebarMenu>
                              </div>
                            )}
                          </SidebarMenuItem>
                        );
                      }

                      // ── Flat item ────────────────────────────────────────
                      const flatItem = item as any;
                      const isActive =
                        flatItem.href === "/"
                          ? location === "/"
                          : location === flatItem.href || location.startsWith(flatItem.href + "/");
                      const testId = `nav-${flatItem.href.replace(/^\//, "").replace(/\//g, "-") || "dashboard"}`;
                      return (
                        <SidebarMenuItem key={`${flatItem.href}-${flatItem.label}`}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            data-testid={testId}
                          >
                            <Link href={flatItem.href}>
                              <flatItem.icon className="h-4 w-4 shrink-0" />
                              <span>{flatItem.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </div>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
}
