import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SpaFundingGate } from "./spa-funding-gate";
vi.mock("./spa-account-folio",()=>({SpaAccountFolio:({canWrite}:{canWrite:boolean})=><p>{canWrite?"Nuevo circuito conectado":"Nuevo circuito de consulta"}</p>}));
afterEach(()=>vi.unstubAllGlobals());
function mount(enabled=true,userId="u",canWrite=true){return render(<SpaFundingGate enabled={enabled} accountId="a" userId={userId} canWrite={canWrite} canAdopt={false}><button>Circuito anterior</button></SpaFundingGate>);}
it("flag apagado conserva la compatibilidad anterior sin consultar ni mutar",()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);mount(false);
 expect(screen.getByRole("button",{name:"Circuito anterior"})).toBeEnabled();expect(fetch).not.toHaveBeenCalled();
});
it("módulo activo utiliza el nuevo motor sin selección ni permiso histórico por cuenta",()=>{
 mount();expect(screen.getByText("Nuevo circuito conectado")).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Circuito anterior"})).not.toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Vincular cuenta al nuevo circuito"})).not.toBeInTheDocument();
});
it("conserva el modo consulta del usuario",()=>{mount(true,"u",false);expect(screen.getByText("Nuevo circuito de consulta")).toBeInTheDocument();});
it("sesión incompleta no muestra acciones de ninguno de los motores",()=>{
 mount(true,"");expect(screen.getByRole("status")).toHaveTextContent("Verificando sesión");
 expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
