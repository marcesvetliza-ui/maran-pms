import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  CalendarCheck,
  DoorOpen,
  Users,
  LogIn,
  LogOut,
  Settings,
  Hotel,
  CalendarDays,
  DollarSign,
  Globe,
  CalendarPlus,
  Users2,
  MessageSquare,
  Sparkles,
  UtensilsCrossed,
  Package,
  Flower2,
  PartyPopper,
  Wrench,
  Shield,
  Gift,
  Building2,
  ChevronDown,
  Boxes,
  Bell,
  CheckCheck,
  AlertTriangle,
  Smartphone,
  Bot,
  Heart,
  BarChart3,
  FileText,
  Wallet,
  FileCode,
} from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

const hotelSubItems = [
  { title: "Planning", url: "/planning", icon: CalendarDays },
  { title: "Reservas", url: "/reservations", icon: CalendarCheck },
  { title: "Reserva Rápida", url: "/new-reservation", icon: CalendarPlus },
  { title: "Check-in", url: "/check-in", icon: LogIn },
  { title: "Check-out", url: "/check-out", icon: LogOut },
  { title: "Habitaciones", url: "/rooms", icon: DoorOpen },
  { title: "Tarifas", url: "/rate-plans", icon: DollarSign },
  { title: "Paquetes", url: "/packages", icon: Gift },
  { title: "Canales OTA", url: "/ota-channels", icon: Globe },
  { title: "Grupos", url: "/groups", icon: Users2 },
  { title: "Reseñas", url: "/reviews", icon: MessageSquare },
];

const hotelPaths = hotelSubItems.map((i) => i.url);

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
    mutationFn: async (id: number) => {
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
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" data-testid="badge-notification-count">
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
                        <span className={`text-sm font-medium truncate ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>
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

export function AppSidebar() {
  const [location] = useLocation();
  const [hotelOpen, setHotelOpen] = useState(
    hotelPaths.includes(location) || location.startsWith("/groups/")
  );

  const isHotelActive = hotelPaths.includes(location) || location.startsWith("/groups/");

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Hotel className="h-6 w-6" />
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-lg font-semibold text-sidebar-foreground">Maran Suites</span>
            <span className="text-xs text-muted-foreground">Sistema de Gestión</span>
          </div>
          <NotificationBell />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/"}
                  data-testid="nav-dashboard"
                >
                  <Link href="/">
                    <LayoutDashboard className="h-5 w-5" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/executive"}
                  data-testid="nav-executive"
                >
                  <Link href="/executive">
                    <BarChart3 className="h-5 w-5" />
                    <span>Ejecutivo</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/reports"}
                  data-testid="nav-reports"
                >
                  <Link href="/reports">
                    <FileText className="h-5 w-5" />
                    <span>Reportes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <Collapsible open={hotelOpen} onOpenChange={setHotelOpen} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={isHotelActive}
                      data-testid="nav-hotel"
                    >
                      <Hotel className="h-5 w-5" />
                      <span>Hotel</span>
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {hotelSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.url}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === item.url || (item.url === "/groups" && location.startsWith("/groups/"))}
                            data-testid={`nav-${item.url.replace("/", "")}`}
                          >
                            <Link href={item.url}>
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Base de Datos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/guests"}
                  data-testid="nav-guests"
                >
                  <Link href="/guests">
                    <Users className="h-5 w-5" />
                    <span>Huéspedes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/companies"}
                  data-testid="nav-companies"
                >
                  <Link href="/companies">
                    <Building2 className="h-5 w-5" />
                    <span>Empresas</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Servicios</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/restaurant"}
                  data-testid="nav-restaurant"
                >
                  <Link href="/restaurant">
                    <UtensilsCrossed className="h-5 w-5" />
                    <span>Restaurante</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/spa"}
                  data-testid="nav-spa"
                >
                  <Link href="/spa">
                    <Flower2 className="h-5 w-5" />
                    <span>SPA</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/events"}
                  data-testid="nav-events"
                >
                  <Link href="/events">
                    <PartyPopper className="h-5 w-5" />
                    <span>Eventos</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/housekeeping"}
                  data-testid="nav-housekeeping"
                >
                  <Link href="/housekeeping">
                    <Sparkles className="h-5 w-5" />
                    <span>Housekeeping</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/maintenance"}
                  data-testid="nav-maintenance"
                >
                  <Link href="/maintenance">
                    <Wrench className="h-5 w-5" />
                    <span>Mantenimiento</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/inventory"}
                  data-testid="nav-inventory"
                >
                  <Link href="/inventory">
                    <Boxes className="h-5 w-5" />
                    <span>Inventario</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/cash-register"}
                  data-testid="nav-cash-register"
                >
                  <Link href="/cash-register">
                    <Wallet className="h-5 w-5" />
                    <span>Caja</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Experiencia del Huésped</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/hospitality"}
                  data-testid="nav-hospitality"
                >
                  <Link href="/hospitality">
                    <Heart className="h-5 w-5" />
                    <span>Hospitalidad</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Comunicaciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/chatbot"}
                  data-testid="nav-chatbot"
                >
                  <Link href="/chatbot">
                    <Bot className="h-5 w-5" />
                    <span>MARA Chatbot</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/administration"}
                  data-testid="nav-administration"
                >
                  <Link href="/administration">
                    <Shield className="h-5 w-5" />
                    <span>Administración</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/source-code"}
                  data-testid="nav-source-code"
                >
                  <Link href="/source-code">
                    <FileCode className="h-5 w-5" />
                    <span>Código Fuente</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild data-testid="nav-settings">
              <Link href="/settings">
                <Settings className="h-5 w-5" />
                <span>Configuración</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
