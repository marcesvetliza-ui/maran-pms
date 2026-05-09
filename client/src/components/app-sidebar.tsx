import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Activity,
  TrendingUp,
  BarChart2,
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
  Shield,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SystemNotification } from "@shared/schema";

// roles: qué roles pueden ver el ítem. Sin la propiedad = todos.
// admin y manager siempre ven todo.
const ALL_ROLES = ["admin", "manager", "reception", "housekeeping", "maintenance", "restaurant", "spa", "events"];
const HOTEL_OPS  = ["admin", "manager", "reception"];
const MGMT_ONLY  = ["admin", "manager"];

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULOS DEL SISTEMA — cada sección corresponde a un módulo vendible.
// El orden refleja la jerarquía de uso: core primero, soporte al final.
// ─────────────────────────────────────────────────────────────────────────────
const menuSections = [
  // ── MÓDULO 1: PMS Core ────────────────────────────────────────────────────
  // Núcleo no negociable. Reservas, front desk, habitaciones, huéspedes, tarifas.
  {
    titulo: "PMS — Recepción",
    items: [
      { label: "Dashboard",      icon: LayoutDashboard, href: "/",               roles: ALL_ROLES },
      { label: "Planning",       icon: CalendarDays,    href: "/planning",       roles: [...HOTEL_OPS, "events"] },
      { label: "Reservas",       icon: BookOpen,        href: "/reservations",   roles: HOTEL_OPS },
      { label: "Reserva rápida", icon: Zap,             href: "/new-reservation",roles: HOTEL_OPS },
      { label: "Check in",       icon: LogIn,           href: "/check-in",       roles: HOTEL_OPS },
      { label: "Check out",      icon: LogOut,          href: "/check-out",      roles: HOTEL_OPS },
      { label: "Habitaciones",   icon: BedDouble,       href: "/rooms",          roles: [...HOTEL_OPS, "housekeeping", "maintenance"] },
      { label: "Tarifas",        icon: Tag,             href: "/rate-plans",     roles: MGMT_ONLY },
      { label: "Huéspedes",      icon: User,            href: "/guests",         roles: HOTEL_OPS },
    ],
  },

  // ── MÓDULO 2: Comercial ───────────────────────────────────────────────────
  // Distribución, ventas y relaciones comerciales.
  {
    titulo: "Comercial",
    items: [
      { label: "Motor de Reservas", icon: MonitorSmartphone, href: "/admin/booking-engine", roles: MGMT_ONLY },
      { label: "Canales OTAs",      icon: Globe,             href: "/ota-channels",         roles: MGMT_ONLY },
      { label: "Grupos",            icon: Users,             href: "/groups",               roles: [...HOTEL_OPS, "events"] },
      { label: "Empresas",          icon: Building2,         href: "/companies",            roles: HOTEL_OPS },
      { label: "Agencias",          icon: Briefcase,         href: "/agencies",             roles: MGMT_ONLY },
      { label: "Paquetes",          icon: Package,           href: "/packages",             roles: HOTEL_OPS },
      { label: "Presupuestos",      icon: ClipboardList,     href: "/presupuestos",         roles: HOTEL_OPS },
    ],
  },

  // ── MÓDULO 3: Servicios ───────────────────────────────────────────────────
  // Puntos de venta y servicios al huésped: Restaurant, SPA y Eventos.
  {
    titulo: "Servicios",
    items: [
      { label: "Restaurant",   icon: UtensilsCrossed, href: "/restaurant",  roles: [...HOTEL_OPS, "restaurant"] },
      { label: "Spa",          icon: Sparkles,        href: "/spa",         roles: [...HOTEL_OPS, "spa"] },
      { label: "Clientes Spa", icon: Heart,           href: "/spa-clients", roles: [...HOTEL_OPS, "spa"] },
      { label: "Eventos",      icon: CalendarCheck,   href: "/events",      roles: [...HOTEL_OPS, "events"] },
    ],
  },

  // ── MÓDULO 4: Operaciones ─────────────────────────────────────────────────
  // Back-of-house: limpieza, mantenimiento y stock.
  {
    titulo: "Operaciones",
    items: [
      { label: "Housekeeping",  icon: Brush,        href: "/housekeeping", roles: [...HOTEL_OPS, "housekeeping"] },
      { label: "Mantenimiento", icon: Wrench,        href: "/maintenance",  roles: [...HOTEL_OPS, "maintenance"] },
      { label: "Inventario",    icon: Package,       href: "/inventory",    roles: [...MGMT_ONLY, "maintenance"] },
    ],
  },

  // ── MÓDULO 5: Experiencia al Huésped ─────────────────────────────────────
  // Comunicación, fidelización y reputación.
  {
    titulo: "Experiencia al Huésped",
    items: [
      { label: "Hospitalidad",           icon: HandHeart,     href: "/hospitality",  roles: [...HOTEL_OPS, "housekeeping"] },
      { label: "MARA Chatbot",           icon: Bot,           href: "/chatbot",       roles: HOTEL_OPS },
      { label: "Respuestas automáticas", icon: Mail,          href: "/email-config",  roles: MGMT_ONLY },
      { label: "Reseñas",                icon: Star,          href: "/reviews",       roles: MGMT_ONLY },
    ],
  },

  // ── MÓDULO 6: Administración ──────────────────────────────────────────────
  // Back-office financiero: facturación, contabilidad, caja.
  {
    titulo: "Administración",
    items: [
      { label: "Administración", icon: Calculator, href: "/admin",         roles: MGMT_ONLY },
      { label: "Caja",           icon: Landmark,   href: "/cash-register", roles: [...HOTEL_OPS, "restaurant", "spa"] },
    ],
  },

  // ── MÓDULO 7: Gerencia & Revenue ─────────────────────────────────────────
  // KPIs ejecutivos, reportes y análisis de revenue.
  {
    titulo: "Gerencia & Revenue",
    items: [
      { label: "Operaciones", icon: Activity,   href: "/operaciones", roles: [...HOTEL_OPS, "events"] },
      { label: "Ejecutivo",   icon: TrendingUp, href: "/executive",   roles: MGMT_ONLY },
      { label: "Reportes",    icon: BarChart2,  href: "/reports",     roles: MGMT_ONLY },
    ],
  },

  // ── CONFIGURACIÓN (sistema, siempre al final) ─────────────────────────────
  {
    titulo: "Configuración",
    items: [
      { label: "Configuración",          icon: Settings, href: "/administration", roles: ["admin"] },
      { label: "Administración sistema", icon: Shield,   href: "/administration", roles: ["admin"], adminOnly: true },
      { label: "Código fuente",          icon: Code2,    href: "/source-code",    roles: ["admin"], adminOnly: true, devOnly: true },
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
        <ScrollArea className="max-h-[360px]">
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
        </ScrollArea>
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

  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSection = (titulo: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [titulo]: !prev[titulo] };
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Auto-expand the section that contains the current active route
  useEffect(() => {
    const role = user?.role || "";
    for (const section of menuSections) {
      const hasActive = section.items.some(item => {
        if ((item as any).roles && !(item as any).roles.includes(role)) return false;
        return item.href === "/"
          ? location === "/"
          : location === item.href || location.startsWith(item.href + "/");
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
                      const isActive =
                        item.href === "/"
                          ? location === "/"
                          : location === item.href || location.startsWith(item.href + "/");
                      const testId = `nav-${item.href.replace(/^\//, "").replace(/\//g, "-") || "dashboard"}`;
                      return (
                        <SidebarMenuItem key={`${item.href}-${item.label}`}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            data-testid={testId}
                          >
                            <Link href={item.href}>
                              <item.icon className="h-4 w-4 shrink-0" />
                              <span>{item.label}</span>
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
