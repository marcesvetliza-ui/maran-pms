import { useLocation, Link } from "wouter";
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
  SidebarFooter,
} from "@/components/ui/sidebar";

const mainMenuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Planning",
    url: "/planning",
    icon: CalendarDays,
  },
  {
    title: "Reservas",
    url: "/reservations",
    icon: CalendarCheck,
  },
  {
    title: "Habitaciones",
    url: "/rooms",
    icon: DoorOpen,
  },
  {
    title: "Huéspedes",
    url: "/guests",
    icon: Users,
  },
  {
    title: "Tarifas",
    url: "/rate-plans",
    icon: DollarSign,
  },
  {
    title: "Canales OTA",
    url: "/ota-channels",
    icon: Globe,
  },
  {
    title: "Grupos",
    url: "/groups",
    icon: Users2,
  },
  {
    title: "Resenas",
    url: "/reviews",
    icon: MessageSquare,
  },
];

const operationsMenuItems = [
  {
    title: "Nueva Reserva",
    url: "/new-reservation",
    icon: CalendarPlus,
  },
  {
    title: "Check-in",
    url: "/check-in",
    icon: LogIn,
  },
  {
    title: "Check-out",
    url: "/check-out",
    icon: LogOut,
  },
  {
    title: "Housekeeping",
    url: "/housekeeping",
    icon: Sparkles,
  },
  {
    title: "Restaurante",
    url: "/restaurant",
    icon: UtensilsCrossed,
  },
  {
    title: "Inventario",
    url: "/inventory",
    icon: Package,
  },
  {
    title: "SPA",
    url: "/spa",
    icon: Flower2,
  },
  {
    title: "Eventos",
    url: "/events",
    icon: PartyPopper,
  },
  {
    title: "Mantenimiento",
    url: "/maintenance",
    icon: Wrench,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Hotel className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-sidebar-foreground">HotelPro</span>
            <span className="text-xs text-muted-foreground">Sistema de Gestión</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.url.replace("/", "") || "dashboard"}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationsMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.url.replace("/", "")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
