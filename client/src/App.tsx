import { useState, useEffect, createContext, useContext, useCallback, lazy, Suspense } from "react";
import { Switch, Route, useRoute, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import { LogOut, User, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const OperacionesPage = lazy(() => import("@/pages/operaciones"));
const PlanningPage = lazy(() => import("@/pages/planning"));
const RoomsPage = lazy(() => import("@/pages/rooms"));
const RoomTypeIntegrityPage = lazy(() => import("@/pages/room-type-integrity"));
const ReservationsPage = lazy(() => import("@/pages/reservations"));
const GuestsPage = lazy(() => import("@/pages/guests"));
const CheckInPage = lazy(() => import("@/pages/check-in"));
const CheckOutPage = lazy(() => import("@/pages/check-out"));
const RatePlansPage = lazy(() => import("@/pages/rate-plans"));
const OTAChannelsPage = lazy(() => import("@/pages/ota-channels"));
const NewReservationPage = lazy(() => import("@/pages/new-reservation"));
const GroupsPage = lazy(() => import("@/pages/groups"));
const GroupDetailPage = lazy(() => import("@/pages/group-detail"));
const ReviewsPage = lazy(() => import("@/pages/reviews"));
const HousekeepingPage = lazy(() => import("@/pages/housekeeping"));
const RestaurantPage = lazy(() => import("@/pages/restaurant"));
const InventoryPage = lazy(() => import("@/pages/inventory"));
const SpaPage = lazy(() => import("@/pages/spa"));
const EventsPage = lazy(() => import("@/pages/events"));
const MaintenancePage = lazy(() => import("@/pages/maintenance"));
const AdministrationPage = lazy(() => import("@/pages/administration"));
const PackagesPage = lazy(() => import("@/pages/packages"));
const CompaniesPage = lazy(() => import("@/pages/companies"));
const AgenciesPage = lazy(() => import("@/pages/agencies"));
const WebCheckinPublicPage = lazy(() => import("@/pages/web-checkin-public"));
const PreIngresoPage = lazy(() => import("@/pages/pre-ingreso"));
const ChatbotDashboardPage = lazy(() => import("@/pages/chatbot-dashboard"));
const HospitalityPage = lazy(() => import("@/pages/hospitality"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const DashboardExecutivePage = lazy(() => import("@/pages/dashboard-executive"));
const CashRegisterPage = lazy(() => import("@/pages/cash-register"));
const SourceCodePage = lazy(() => import("@/pages/source-code"));
const AdminPage = lazy(() => import("@/pages/admin"));
const PosConfigsPage = lazy(() => import("@/pages/pos-configs"));
const DailyReportPage = lazy(() => import("@/pages/daily-report"));
const SpaClientsPage = lazy(() => import("@/pages/spa-clients"));
const GiftVouchersPage = lazy(() => import("@/pages/gift-vouchers"));
const PresupuestosPage = lazy(() => import("@/pages/presupuestos"));
const ConfigPresupuestosPage = lazy(() => import("@/pages/config-presupuestos"));
const AccountingSuppliersPage = lazy(() => import("@/pages/accounting-suppliers"));
const PurchaseInvoicesPage = lazy(() => import("@/pages/purchase-invoices"));
const AdminConsultasPage = lazy(() => import("@/pages/admin-consultas"));
const AdminCajaPage = lazy(() => import("@/pages/admin-caja"));
const AdminCajaConfigPage = lazy(() =>
  import("@/pages/admin-caja").then((m) => ({ default: m.AdminCajaConfigPage }))
);
const BillingPage = lazy(() => import("@/pages/billing"));
const AdminReportesPage = lazy(() => import("@/pages/admin-reportes"));
const AdminCuentasPage = lazy(() => import("@/pages/admin-cuentas"));
const CcHuespedesPage = lazy(() => import("@/pages/cc-huespedes"));
const AdminDeudaHuespedesPage = lazy(() => import("@/pages/admin-deuda-huespedes"));
const ReservarPage = lazy(() => import("@/pages/reservar"));
const AdminBookingPage = lazy(() => import("@/pages/admin-booking-engine"));
const AdminFoliosPage = lazy(() => import("@/pages/admin-folios"));
const EmailConfigPage = lazy(() => import("@/pages/email-config"));
const CountriesAbmPage = lazy(() => import("@/pages/countries-abm"));
const AccountingAccountsAbmPage = lazy(() => import("@/pages/accounting-accounts-abm"));
const CostCentersAbmPage = lazy(() => import("@/pages/cost-centers-abm"));
const SeguridadPage = lazy(() => import("@/pages/seguridad"));
const SurveyPage = lazy(() => import("@/pages/survey"));
const HelpChat = lazy(() => import("@/components/help-chat"));
const MozoPage = lazy(() => import("@/pages/mozo"));
const RecetasCostosPage = lazy(() => import("@/pages/recetas-costos"));
const AdminIndecPage = lazy(() => import("@/pages/admin-indec"));

interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  department: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  logout: () => void;
  selectedPosId: string | null;
  selectedPosNumero: number | null;
  selectedPosNombre: string | null;
  setSelectedPos: (id: string, numero: number, nombre: string) => void;
  changePosMode: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  logout: () => {},
  selectedPosId: null,
  selectedPosNumero: null,
  selectedPosNombre: null,
  setSelectedPos: () => {},
  changePosMode: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function PosSelector({ configs, onSelect }: { configs: any[]; onSelect: (id: string, numero: number, nombre: string) => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
            <Monitor className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Maran Suites & Towers</h1>
          <p className="text-base font-medium mt-3">Seleccioná tu punto de venta</p>
          <p className="text-sm text-muted-foreground mt-1">Se usará durante toda la sesión para facturación y caja</p>
        </div>
        <div className="space-y-3">
          {configs.map((p: any) => (
            <button
              key={p.id}
              data-testid={`button-select-pos-${p.numero}`}
              onClick={() => onSelect(p.id, p.numero, p.nombre)}
              className="w-full text-left p-4 border-2 rounded-xl hover:border-primary hover:bg-accent transition-all group"
            >
              <div className="font-semibold text-base group-hover:text-primary transition-colors">
                PV {String(p.numero).padStart(4, "0")} — {p.nombre}
              </div>
              {p.descripcion && (
                <div className="text-sm text-muted-foreground mt-0.5">{p.descripcion}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RouteAwareErrorBoundary() {
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location}>
      <Router />
    </ErrorBoundary>
  );
}

function getRoleHomePage(role: string): string {
  switch (role) {
    case "restaurant": return "/restaurant";
    case "housekeeping": return "/housekeeping";
    case "maintenance": return "/maintenance";
    case "spa": return "/spa";
    case "events": return "/events";
    default: return "/";
  }
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const allowed = user?.role === "admin" || user?.role === "manager";
  useEffect(() => {
    if (user && !allowed) {
      navigate(getRoleHomePage(user.role));
    }
  }, [user, allowed, navigate]);
  if (!user || !allowed) return null;
  return <Component />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/operaciones" component={OperacionesPage} />
        <Route path="/planning" component={PlanningPage} />
        <Route path="/rooms" component={RoomsPage} />
        <Route path="/admin/room-types/integrity">{() => <AdminRoute component={RoomTypeIntegrityPage} />}</Route>
        <Route path="/reservations" component={ReservationsPage} />
        <Route path="/new-reservation" component={NewReservationPage} />
        <Route path="/guests" component={GuestsPage} />
        <Route path="/groups" component={GroupsPage} />
        <Route path="/groups/:id" component={GroupDetailPage} />
        <Route path="/daily-report" component={DailyReportPage} />
        <Route path="/check-in" component={CheckInPage} />
        <Route path="/check-out" component={CheckOutPage} />
        <Route path="/rate-plans" component={RatePlansPage} />
        <Route path="/ota-channels" component={OTAChannelsPage} />
        <Route path="/reviews" component={ReviewsPage} />
        <Route path="/housekeeping" component={HousekeepingPage} />
        <Route path="/presupuestos" component={PresupuestosPage} />
        <Route path="/config/presupuestos" component={ConfigPresupuestosPage} />
        <Route path="/restaurant" component={RestaurantPage} />
        <Route path="/restaurant/recetas" component={RecetasCostosPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/spa" component={SpaPage} />
        <Route path="/spa-clients" component={SpaClientsPage} />
        <Route path="/gift-vouchers" component={GiftVouchersPage} />
        <Route path="/events" component={EventsPage} />
        <Route path="/maintenance" component={MaintenancePage} />
        <Route path="/administration">{() => <AdminRoute component={AdministrationPage} />}</Route>
        <Route path="/packages" component={PackagesPage} />
        <Route path="/companies" component={CompaniesPage} />
        <Route path="/agencies" component={AgenciesPage} />
        <Route path="/chatbot" component={ChatbotDashboardPage} />
        <Route path="/hospitality" component={HospitalityPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/executive" component={DashboardExecutivePage} />
        <Route path="/cash-register" component={CashRegisterPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/pos-configs" component={PosConfigsPage} />
        <Route path="/source-code" component={SourceCodePage} />
        <Route path="/accounting-suppliers" component={AccountingSuppliersPage} />
        <Route path="/purchase-invoices" component={PurchaseInvoicesPage} />
        <Route path="/admin/consultas" component={AdminConsultasPage} />
        <Route path="/admin/caja" component={AdminCajaPage} />
        <Route path="/admin/caja/configuracion" component={AdminCajaConfigPage} />
        <Route path="/billing" component={BillingPage} />
        <Route path="/admin/reportes" component={AdminReportesPage} />
        <Route path="/admin/cuentas" component={AdminCuentasPage} />
        <Route path="/admin/cc-huespedes" component={CcHuespedesPage} />
        <Route path="/admin/deuda-huespedes" component={AdminDeudaHuespedesPage} />
        <Route path="/admin/folios" component={AdminFoliosPage} />
        <Route path="/admin/booking-engine" component={AdminBookingPage} />
        <Route path="/email-config" component={EmailConfigPage} />
        <Route path="/admin/countries" component={CountriesAbmPage} />
        <Route path="/admin/accounting-accounts" component={AccountingAccountsAbmPage} />
        <Route path="/admin/cost-centers" component={CostCentersAbmPage} />
        <Route path="/admin/indec" component={AdminIndecPage} />
        <Route path="/seguridad" component={SeguridadPage} />
        <Route path="/encuesta/:token" component={SurveyPage} />
        <Route path="/mozo" component={MozoPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function useRadixScrollLockCleanup() {
  useEffect(() => {
    const cleanup = () => {
      const hasOpenDialog = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
      if (!hasOpenDialog) {
        document.body.removeAttribute("data-scroll-locked");
        document.body.style.removeProperty("pointer-events");
        document.body.style.removeProperty("overflow");
        const allAriaHidden = document.querySelectorAll('[aria-hidden="true"]');
        allAriaHidden.forEach(el => {
          if (el !== document.body && !el.closest('[role="dialog"]') && !el.closest('[role="alertdialog"]')) {
            el.removeAttribute("aria-hidden");
          }
        });
      }
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target as HTMLElement;
          if (target === document.body && mutation.attributeName === "data-scroll-locked") {
            setTimeout(cleanup, 150);
          }
        }
      }
    });
    observer.observe(document.body, { attributes: true, subtree: false });
    return () => observer.disconnect();
  }, []);
}

function AppLayout() {
  const { user, logout, selectedPosNumero, selectedPosNombre, changePosMode } = useAuth();
  useRadixScrollLockCleanup();
  const [location] = useLocation();

  const isStandalone = location === "/mozo";

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-background">
        <Suspense fallback={<PageLoader />}>
          <Router />
        </Suspense>
      </div>
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          <header className="flex items-center justify-between gap-2 sm:gap-4 px-2 sm:px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 shrink-0 min-w-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" className="shrink-0" />
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 overflow-hidden">
              {selectedPosNumero && (
                <button
                  onClick={changePosMode}
                  title="Cambiar punto de venta"
                  data-testid="button-change-pos"
                  className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors cursor-pointer min-w-0 max-w-[120px] sm:max-w-none"
                >
                  <Monitor className="w-3 h-3 shrink-0" />
                  <span className="truncate">PV {String(selectedPosNumero).padStart(4, "0")}{selectedPosNombre ? ` — ${selectedPosNombre}` : ""}</span>
                </button>
              )}
              {user && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground min-w-0" data-testid="text-current-user">
                  <User className="w-4 h-4 shrink-0" />
                  <span className="truncate max-w-[140px]">{user.fullName}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">{user.role}</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                title="Cerrar sesión"
                data-testid="button-logout"
                className="shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </Button>
              <div className="shrink-0">
                <ThemeToggle />
              </div>
            </div>
          </header>
            {import.meta.env.VITE_ENVIRONMENT === "staging" && (
            <div className="bg-amber-400 text-amber-950 text-xs font-semibold text-center py-1 px-4 shrink-0 flex items-center justify-center gap-2">
              <span>⚠ ENTORNO STAGING — los cambios aquí NO afectan producción</span>
            </div>
          )}
          <main className="flex-1 overflow-y-auto">
            <RouteAwareErrorBoundary />
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <HelpChat />
      </Suspense>
    </SidebarProvider>
  );
}

function AuthenticatedApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [, navigate] = useLocation();

  const [selectedPosId, setSelectedPosId] = useState<string | null>(() => localStorage.getItem("maranPosId"));
  const [selectedPosNumero, setSelectedPosNumero] = useState<number | null>(() => {
    const n = localStorage.getItem("maranPosNumero");
    return n ? parseInt(n) : null;
  });
  const [selectedPosNombre, setSelectedPosNombre] = useState<string | null>(() => localStorage.getItem("maranPosNombre"));
  const [showPosSelector, setShowPosSelector] = useState(false);
  const [posConfigs, setPosConfigs] = useState<any[]>([]);
  const [posChecking, setPosChecking] = useState(false);

  const authChannel = useCallback(() => {
    try { return new BroadcastChannel("maran-auth"); } catch { return null; }
  }, []);

  const clearPosState = useCallback(() => {
    localStorage.removeItem("maranPosId");
    localStorage.removeItem("maranPosNumero");
    localStorage.removeItem("maranPosNombre");
    setSelectedPosId(null);
    setSelectedPosNumero(null);
    setSelectedPosNombre(null);
    setShowPosSelector(false);
    setPosConfigs([]);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const userData = await res.json();
        // sessionStorage vive solo en la pestaña actual.
        // Si no existe el flag, esta es una pestaña nueva (favorito, nueva ventana)
        // y debemos cerrar la sesión del servidor para exigir login explícito.
        const tabActive = sessionStorage.getItem("maranTabActive");
        if (!tabActive) {
          await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
          setUser(null);
        } else {
          setUser(userData);
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Escuchar eventos de auth desde otros tabs del mismo navegador
  useEffect(() => {
    const ch = authChannel();
    if (!ch) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "logout") {
        clearPosState();
        setUser(null);
        queryClient.clear();
      } else if (e.data?.type === "login") {
        // Otro tab inició sesión: re-verificar con el servidor para obtener el usuario actualizado
        checkAuth().then(() => setChecking(false));
      }
    };
    ch.addEventListener("message", handler);
    return () => { ch.removeEventListener("message", handler); ch.close(); };
  }, [authChannel, checkAuth, clearPosState]);

  const fetchAndSelectPos = useCallback(async () => {
    if (localStorage.getItem("maranPosId")) return;
    setPosChecking(true);
    try {
      const res = await fetch("/api/pos-configs", { credentials: "include" });
      if (!res.ok) return;
      const data: any[] = await res.json();
      const electronic = data.filter((p: any) => p.activo && p.tipo === "electronico");
      if (electronic.length === 0) return;
      if (electronic.length === 1) {
        const p = electronic[0];
        applyPos(p.id, p.numero, p.nombre);
      } else {
        setPosConfigs(electronic);
        setShowPosSelector(true);
      }
    } catch {
    } finally {
      setPosChecking(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchAndSelectPos();
  }, [user, fetchAndSelectPos]);

  const applyPos = (id: string, numero: number, nombre: string) => {
    setSelectedPosId(id);
    setSelectedPosNumero(numero);
    setSelectedPosNombre(nombre);
    localStorage.setItem("maranPosId", id);
    localStorage.setItem("maranPosNumero", String(numero));
    localStorage.setItem("maranPosNombre", nombre);
    setShowPosSelector(false);
  };

  const setSelectedPos = (id: string, numero: number, nombre: string) => {
    applyPos(id, numero, nombre);
  };

  const changePosMode = () => {
    if (posConfigs.length > 0) {
      setShowPosSelector(true);
    } else {
      fetch("/api/pos-configs", { credentials: "include" })
        .then(r => r.json())
        .then((data: any[]) => {
          const electronic = data.filter((p: any) => p.activo && p.tipo === "electronico");
          setPosConfigs(electronic);
          setShowPosSelector(true);
        })
        .catch(() => {});
    }
  };

  const handleLogin = (userData: AuthUser) => {
    // Marcar esta pestaña como activa — el flag vive solo mientras la pestaña esté abierta
    sessionStorage.setItem("maranTabActive", "1");
    setUser(userData);
    navigate(getRoleHomePage(userData.role));
    // Notificar a otros tabs que hubo un nuevo login
    try {
      const ch = new BroadcastChannel("maran-auth");
      ch.postMessage({ type: "login", userId: userData.id });
      ch.close();
    } catch {}
  };

  const handleLogout = async () => {
    sessionStorage.removeItem("maranTabActive");
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    // Notificar a otros tabs que hubo logout ANTES de limpiar estado local
    try {
      const ch = new BroadcastChannel("maran-auth");
      ch.postMessage({ type: "logout" });
      ch.close();
    } catch {}
    clearPosState();
    setUser(null);
    queryClient.clear();
  };

  if (checking || posChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (showPosSelector && posConfigs.length > 0) {
    return <PosSelector configs={posConfigs} onSelect={setSelectedPos} />;
  }

  return (
    <AuthContext.Provider value={{ user, logout: handleLogout, selectedPosId, selectedPosNumero, selectedPosNombre, setSelectedPos, changePosMode }}>
      <AppLayout />
    </AuthContext.Provider>
  );
}

function App() {
  const [isWebCheckin] = useRoute("/web-checkin/:token");
  const [isPreIngreso] = useRoute("/pre-ingreso");
  const [isReservar] = useRoute("/reservar");
  const [isSurvey] = useRoute("/encuesta/:token");

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="hotel-ui-theme">
        <TooltipProvider>
          {isWebCheckin ? (
            <Suspense fallback={<PageLoader />}>
              <WebCheckinPublicPage />
            </Suspense>
          ) : isPreIngreso ? (
            <Suspense fallback={<PageLoader />}>
              <PreIngresoPage />
            </Suspense>
          ) : isReservar ? (
            <Suspense fallback={<PageLoader />}>
              <ReservarPage />
            </Suspense>
          ) : isSurvey ? (
            <Suspense fallback={<PageLoader />}>
              <SurveyPage />
            </Suspense>
          ) : (
            <AuthenticatedApp />
          )}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
