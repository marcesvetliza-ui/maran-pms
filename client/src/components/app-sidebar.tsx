import { useState } from "react";
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
  Shield,
  Gift,
  Building2,
  ChevronDown,
  Boxes,
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
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-sidebar-foreground">Maran Suites</span>
            <span className="text-xs text-muted-foreground">Sistema de Gestión</span>
          </div>
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
