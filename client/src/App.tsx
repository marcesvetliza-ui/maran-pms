import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import PlanningPage from "@/pages/planning";
import RoomsPage from "@/pages/rooms";
import ReservationsPage from "@/pages/reservations";
import GuestsPage from "@/pages/guests";
import CheckInPage from "@/pages/check-in";
import CheckOutPage from "@/pages/check-out";
import RatePlansPage from "@/pages/rate-plans";
import OTAChannelsPage from "@/pages/ota-channels";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/planning" component={PlanningPage} />
      <Route path="/rooms" component={RoomsPage} />
      <Route path="/reservations" component={ReservationsPage} />
      <Route path="/reservations/new" component={ReservationsPage} />
      <Route path="/guests" component={GuestsPage} />
      <Route path="/check-in" component={CheckInPage} />
      <Route path="/check-out" component={CheckOutPage} />
      <Route path="/rate-plans" component={RatePlansPage} />
      <Route path="/ota-channels" component={OTAChannelsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="hotel-ui-theme">
        <TooltipProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
