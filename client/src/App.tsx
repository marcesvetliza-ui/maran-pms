import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import OperacionesPage from "@/pages/operaciones";
import PlanningPage from "@/pages/planning";
import RoomsPage from "@/pages/rooms";
import ReservationsPage from "@/pages/reservations";
import GuestsPage from "@/pages/guests";
import CheckInPage from "@/pages/check-in";
import CheckOutPage from "@/pages/check-out";
import RatePlansPage from "@/pages/rate-plans";
import OTAChannelsPage from "@/pages/ota-channels";
import NewReservationPage from "@/pages/new-reservation";
import GroupsPage from "@/pages/groups";
import GroupDetailPage from "@/pages/group-detail";
import ReviewsPage from "@/pages/reviews";
import HousekeepingPage from "@/pages/housekeeping";
import RestaurantPage from "@/pages/restaurant";
import InventoryPage from "@/pages/inventory";
import SpaPage from "@/pages/spa";
import EventsPage from "@/pages/events";
import MaintenancePage from "@/pages/maintenance";
import AdministrationPage from "@/pages/administration";
import PackagesPage from "@/pages/packages";
import CompaniesPage from "@/pages/companies";
import AgenciesPage from "@/pages/agencies";
import WebCheckinPublicPage from "@/pages/web-checkin-public";
import ChatbotDashboardPage from "@/pages/chatbot-dashboard";
import HospitalityPage from "@/pages/hospitality";
import ReportsPage from "@/pages/reports";
import DashboardExecutivePage from "@/pages/dashboard-executive";
import CashRegisterPage from "@/pages/cash-register";
import SourceCodePage from "@/pages/source-code";
import AdminPage from "@/pages/admin";
import SpaClientsPage from "@/pages/spa-clients";
import PresupuestosPage from "@/pages/presupuestos";
import AccountingSuppliersPage from "@/pages/accounting-suppliers";
import PurchaseInvoicesPage from "@/pages/purchase-invoices";
import AdminConsultasPage from "@/pages/admin-consultas";
import AdminCajaPage, { AdminCajaConfigPage } from "@/pages/admin-caja";
import BillingPage from "@/pages/billing";
import AdminReportesPage from "@/pages/admin-reportes";
import AdminCuentasPage from "@/pages/admin-cuentas";
import CcHuespedesPage from "@/pages/cc-huespedes";
import AdminDeudaHuespedesPage from "@/pages/admin-deuda-huespedes";
import ReservarPage from "@/pages/reservar";
import AdminBookingPage from "@/pages/admin-booking-engine";
import AdminFoliosPage from "@/pages/admin-folios";
import EmailConfigPage from "@/pages/email-config";
import SurveyPage from "@/pages/survey";
import LoginPage from "@/pages/login";
import HelpChat from "@/components/help-chat";
import { ErrorBoundary } from "@/components/error-boundary";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function Router() {
  return (
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
      <HelpChat />
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
            <WebCheckinPublicPage />
          ) : isReservar ? (
            <ReservarPage />
          ) : isSurvey ? (
            <SurveyPage />
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
