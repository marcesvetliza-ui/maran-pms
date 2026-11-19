import { render, screen,fireEvent,waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * Etapa 1 del ABM de usuarios: el sidebar dejó de decidir qué mostrar con
 * arrays de roles hardcodeados (DASHBOARD_ROLES, CORE_RECEPCION, etc.) y
 * ahora consulta hasPermission(resourceKey) desde useAuth() — ver
 * server/permissions.ts para el catálogo. Estos tests verifican que el
 * filtrado en sí (ítems de nivel superior, subítems, devOnly) sigue
 * funcionando igual, mockeando useAuth() directamente en vez de levantar
 * todo el fetch de /api/permissions/mine.
 */

const authState = vi.hoisted(() => ({
  navigate:vi.fn(),
  role:"reception",
  hasPermission: ((_resourceKey: string) => true) as (resourceKey: string) => boolean,
}));

vi.mock("@/App", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "tester", email: "t@t.com", fullName: "Tester", role: authState.role, department: null },
    hasPermission: authState.hasPermission,
  }),
}));

vi.mock('wouter',async original=>({...await original<typeof import('wouter')>(),useLocation:()=>['/',authState.navigate]}));

const { AppSidebar } = await import("./app-sidebar");

function renderSidebar() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

describe("AppSidebar — filtrado por resourceKey", () => {
  beforeEach(() => {
    authState.role="reception";
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
    // SidebarProvider usa useIsMobile(), que llama matchMedia — jsdom no lo trae.
    window.matchMedia = window.matchMedia || ((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as any;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra un ítem de nivel superior cuando hasPermission da true para su resourceKey", () => {
    authState.hasPermission = (key) => key === "sidebar:/reservations";
    renderSidebar();
    expect(screen.getByText("Reservas")).toBeInTheDocument();
  });

  it("oculta un ítem de nivel superior cuando hasPermission da false para su resourceKey", () => {
    authState.hasPermission = () => false;
    renderSidebar();
    expect(screen.queryByText("Reservas")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("una sección entera desaparece si ningún ítem suyo tiene permiso", () => {
    authState.hasPermission = () => false;
    renderSidebar();
    expect(screen.queryByText("Gerencia & Revenue")).not.toBeInTheDocument();
  });

  it("filtra subítems independientemente del padre (Reportes: INDEC solo para quien lo tenga)", () => {
    authState.hasPermission = (key) =>
      key === "sidebar:group/reportes-recepcion" ||
      key === "sidebar:/rooms?tab=ocupadas" ||
      key === "sidebar:/daily-report";
    // sidebar:/admin/indec deliberadamente sin permiso.
    renderSidebar();
    expect(screen.getByText("Hab. Ocupadas")).toBeInTheDocument();
    expect(screen.getByText("Planilla Diaria")).toBeInTheDocument();
    expect(screen.queryByText("Reporte INDEC")).not.toBeInTheDocument();
  });

  it("con todos los permisos otorgados, se ven los 8 módulos completos", () => {
    authState.hasPermission = () => true;
    renderSidebar();
    expect(screen.getByText("PMS — Recepción")).toBeInTheDocument();
    expect(screen.getByText("Comercial")).toBeInTheDocument();
    expect(screen.getByText("Servicios")).toBeInTheDocument();
    // "Operaciones" es ambiguo: es a la vez el título de MÓDULO 4 y un ítem
    // dentro de Gerencia & Revenue — se comprueba con un ítem propio de cada uno.
    expect(screen.getByText("Housekeeping")).toBeInTheDocument();
    expect(screen.getByText("Experiencia al Huésped")).toBeInTheDocument();
    // "Administración" también es ambiguo: título de MÓDULO 6 y uno de sus
    // propios ítems (href /admin) — se comprueba con "Caja", único de esa sección.
    expect(screen.getByText("Caja")).toBeInTheDocument();
    expect(screen.getByText("Gerencia & Revenue")).toBeInTheDocument();
    expect(screen.getByText("Ejecutivo")).toBeInTheDocument();
    // Mismo caso: "Configuración" es el título de la última sección y uno
    // de sus propios ítems (href /administration) — se usa "Seguridad de
    // claves", único de esa sección.
    expect(screen.getByText("Seguridad de claves")).toBeInTheDocument();
  });

  it("never renders the retired quick module even when every permission is granted",()=>{
    authState.hasPermission=()=>true;renderSidebar();
    expect(screen.queryByText('Reserva rápida')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/new-reservation"]')).toBeNull();
    expect(screen.getByRole('link',{name:'Reservas'})).toHaveAttribute('href','/reservations');
    expect(screen.getByRole('link',{name:'Planning'})).toHaveAttribute('href','/planning');
  });

  it("devOnly sigue aplicándose además de hasPermission (no se movió al modelo de permisos)", () => {
    authState.hasPermission = () => false;
    renderSidebar();
    // Con hasPermission siempre false, "Código fuente" no debería verse pase
    // lo que pase con devOnly — confirma que el resourceKey se sigue
    // respetando incluso en el único ítem que además tiene una condición
    // extra (devOnly) por fuera del modelo de permisos.
    expect(screen.queryByText("Código fuente")).not.toBeInTheDocument();
  });
  it("shows Reviews through the sector-specific permission without granting the legacy global entry",()=>{
    authState.role='spa';authState.hasPermission=key=>key==='api:reviews:sector:spa';renderSidebar();
    expect(screen.getByText('Reseñas')).toBeInTheDocument();expect(screen.queryByText('Reservas')).not.toBeInTheDocument();
  });
});

it.each(['hospitality_alert','hospitality_stay_note'])('opens the exact %s request from the bell and only marks it read',async kind=>{
 queryClient.clear();authState.hasPermission=()=>true;authState.navigate.mockClear();
 const n={id:'bell-1',type:'hospitality_alert',title:'Hospitalidad · Pérez Ana · Hab. 802',message:'Ingresa hoy · Preparar cuna',relatedEntityType:kind,relatedEntityId:'source-1',isRead:false,priority:'normal',targetArea:'housekeeping'};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init?:RequestInit)=>new Response(JSON.stringify(String(url).includes('unread-count')?{count:1}:String(url).includes('/notifications?')?[n]:[]),{status:200,headers:{'Content-Type':'application/json'}})));
 renderSidebar();fireEvent.click(screen.getByTestId('button-notifications'));await screen.findByText(n.title);fireEvent.click(screen.getByTestId('notification-item-bell-1'));
 await waitFor(()=>expect(authState.navigate).toHaveBeenCalledWith(kind==='hospitality_alert'?'/hospitality?tab=dashboard&alertId=source-1':'/hospitality?tab=stay-notes&noteId=source-1'));
 expect(vi.mocked(fetch).mock.calls.filter(([,init])=>init?.method==='PATCH').map(([url])=>String(url))).toEqual(['/api/notifications/bell-1/read']);


});

afterEach(()=>{authState.role="reception";queryClient.clear();vi.unstubAllGlobals();});
