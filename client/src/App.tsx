import { useState, useEffect, createContext, useContext, useCallback, lazy, Suspense } from "react";
import { Switch, Route, useRoute } from "wouter";
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
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const OperacionesPage = lazy(() => import("@/pages/operaciones"));
const PlanningPage = lazy(() => import("@/pages/planning"));
const RoomsPage = lazy(() => import("@/pages/rooms"));
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
const ChatbotDashboardPage = lazy(() => import("@/pages/chatbot-dashboard"));
const HospitalityPage = lazy(() => import("@/pages/hospitality"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const DashboardExecutivePage = lazy(() => import("@/pages/dashboard-executive"));
const CashRegisterPage = lazy(() => import("@/pages/cash-register"));
const SourceCodePage = lazy(() => import("@/pages/source-code"));
const AdminPage = lazy(() => import("@/pages/admin"));
const SpaClientsPage = lazy(() => import("@/pages/spa-clients"));
const PresupuestosPage = lazy(() => import("@/pages/presupuestos"));
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
const SurveyPage = lazy(() => import("@/pages/survey"));
const HelpChat = lazy(() => import("@/components/help-chat"));

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
}

const AuthContext = createContext<AuthContextType>({ user: null, logout: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/operaciones" component={OperacionesPage} />
        <Route path="/planning" component={PlanningPage} />
        <Route path="/rooms" component={RoomsPage} />
        <Route path="/reservations" component={ReservationsPage} />
        <Route path="/new-reservation" component={NewReservationPage} />
        <Route path="/guests" component={GuestsPage} />
        <Route path="/groups" component={GroupsPage} />
        <Route path="/groups/:id" component={GroupDetailPage} />
        <Route path="/check-in" component={CheckInPage} />
        <Route path="/check-out" component={CheckOutPage} />
        <Route path="/rate-plans" component={RatePlansPage} />
        <Route path="/ota-channels" component={OTAChannelsPage} />
        <Route path="/reviews" component={ReviewsPage} />
        <Route path="/housekeeping" component={HousekeepingPage} />
        <Route path="/presupuestos" component={PresupuestosPage} />
        <Route path="/restaurant" component={RestaurantPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/spa" component={SpaPage} />
        <Route path="/spa-clients" component={SpaClientsPage} />
        <Route path="/events" component={EventsPage} />
        <Route path="/maintenance" component={MaintenancePage} />
        <Route path="/administration" component={AdministrationPage} />
        <Route path="/packages" component={PackagesPage} />
        <Route path="/companies" component={CompaniesPage} />
        <Route path="/agencies" component={AgenciesPage} />
        <Route path="/chatbot" component={ChatbotDashboardPage} />
        <Route path="/hospitality" component={HospitalityPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/executive" component={DashboardExecutivePage} />
        <Route path="/cash-register" component={CashRegisterPage} />
        <Route path="/admin" component={AdminPage} />
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
        <Route path="/encuesta/:token" component={SurveyPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppLayout() {
  const { user, logout } = useAuth();
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-h-0">
          <header className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-current-user">
                  <User className="w-4 h-4" />
                  <span>{user.fullName}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{user.role}</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                title="Cerrar sesión"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <ErrorBoundary>
              <Router />
            </ErrorBoundary>
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

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
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

  const handleLogin = (userData: AuthUser) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    queryClient.clear();
  };

  if (checking) {
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

  return (
    <AuthContext.Provider value={{ user, logout: handleLogout }}>
      <AppLayout />
    </AuthContext.Provider>
  );
}

function App() {
  const [isWebCheckin] = useRoute("/web-checkin/:token");
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
