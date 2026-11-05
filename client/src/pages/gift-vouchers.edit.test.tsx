import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import GiftVouchersPage from "./gift-vouchers";
import { queryClient } from "@/lib/queryClient";
import type { GiftVoucher } from "@shared/schema";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

// Radix's real DropdownMenu fights the Dialog it opens over focus restoration
// once the item's click handler unmounts the menu synchronously — a known
// jsdom-only interaction (real browsers schedule it across frames and never
// hit this; see rooms.test.tsx). Swap in a minimal, synchronous stand-in that
// keeps the same roles/testids the page relies on.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
    open: false,
    setOpen: () => {},
  });
  function DropdownMenu({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false);
    return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
  }
  function DropdownMenuTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactElement }) {
    const { open, setOpen } = React.useContext(Ctx);
    const onClick = (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    };
    return asChild ? React.cloneElement(children, { onClick }) : <button onClick={onClick}>{children}</button>;
  }
  function DropdownMenuContent({ children }: { children: React.ReactNode }) {
    const { open } = React.useContext(Ctx);
    return open ? <div role="menu">{children}</div> : null;
  }
  function DropdownMenuItem({ onClick, children, className, ...rest }: any) {
    const { setOpen } = React.useContext(Ctx);
    return (
      <div
        role="menuitem"
        className={className}
        {...rest}
        onClick={(e: React.MouseEvent) => { onClick?.(e); setOpen(false); }}
      >
        {children}
      </div>
    );
  }
  function DropdownMenuSeparator() {
    return <hr />;
  }
  return { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
});

function voucher(overrides: Partial<GiftVoucher>): GiftVoucher {
  return {
    id: "v-1",
    voucherCode: "VCHR-2026-0001",
    area: "spa",
    description: "Masaje descontracturante",
    valueType: "monetario",
    valueAmount: "20000.00",
    buyerName: "Juan Pérez",
    buyerPhone: null,
    buyerEmail: null,
    beneficiaryName: "María Pérez",
    status: "activo",
    issuedAt: new Date("2026-10-01T12:00:00Z") as any,
    expiresAt: "2026-12-01",
    usedAt: null,
    usedBy: null,
    usedNotes: null,
    pricePaid: "20000.00",
    paymentMethod: "efectivo",
    saleInvoiceId: null,
    linkedTreatmentSaleId: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    notes: "Nota original",
    createdBy: "admin",
    ...overrides,
  } as GiftVoucher;
}

let capturedPatchBody: any = null;

function mockFetch(vouchers: GiftVoucher[]) {
  global.fetch = vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init?.method ?? "GET";
    if (method === "GET" && url.startsWith("/api/gift-vouchers")) {
      return new Response(JSON.stringify(vouchers), { status: 200 });
    }
    if (method === "PATCH" && /\/api\/gift-vouchers\/[^/]+$/.test(url)) {
      capturedPatchBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ ...vouchers[0], ...capturedPatchBody }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as any;
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GiftVouchersPage />
    </QueryClientProvider>,
  );
}

async function openEditDialog(id: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId(`button-actions-${id}`));
  await user.click(await screen.findByTestId(`button-edit-${id}`));
  return user;
}

describe("Vouchers — editar", () => {
  beforeEach(() => {
    capturedPatchBody = null;
    queryClient.clear();
  });

  it("muestra el vencimiento guardado y lo incluye al imprimir el voucher",async()=>{
    const active=voucher({id:"v-expiry",status:"activo",expiresAt:"2030-12-31",beneficiaryName:"María Prueba"});
    mockFetch([active]);renderPage();
    expect(await screen.findByText("31/12/30")).toBeInTheDocument();
    const write=vi.fn();const popup=vi.spyOn(window,"open").mockReturnValue({document:{write,close:vi.fn()}} as any);
    try {
      const user=userEvent.setup();await user.click(screen.getByTestId("button-actions-v-expiry"));
      await user.click(screen.getByRole("menuitem",{name:/Imprimir voucher/}));
      expect(write).toHaveBeenCalledWith(expect.stringContaining("31 de diciembre de 2030"));
      expect(write).toHaveBeenCalledWith(expect.stringContaining("María Prueba"));
    } finally {popup.mockRestore();}
  });

  it("un voucher activo permite editar descripción, beneficiario, vencimiento y notas", async () => {
    const active = voucher({ id: "v-active", status: "activo" });
    mockFetch([active]);
    renderPage();

    const user = await openEditDialog("v-active");
    expect(screen.getByTestId("input-edit-description")).not.toBeDisabled();
    expect(screen.getByTestId("input-edit-beneficiary")).not.toBeDisabled();
    expect(screen.getByTestId("input-edit-expires")).not.toBeDisabled();
    expect(screen.getByTestId("input-edit-description")).toHaveValue("Masaje descontracturante");

    await user.clear(screen.getByTestId("input-edit-beneficiary"));
    await user.type(screen.getByTestId("input-edit-beneficiary"), "Otro Beneficiario");
    await user.clear(screen.getByTestId("input-edit-notes"));
    await user.type(screen.getByTestId("input-edit-notes"), "Nota nueva");
    await user.click(screen.getByTestId("button-save-edit"));

    await waitFor(() => expect(capturedPatchBody).not.toBeNull());
    expect(capturedPatchBody).toMatchObject({
      description: "Masaje descontracturante",
      beneficiaryName: "Otro Beneficiario",
      expiresAt: "2026-12-01",
      notes: "Nota nueva",
    });
  });

  it("permite guardar los valores originales y cerrar el editor", async () => {
    mockFetch([voucher({id:"v-unchanged"})]);
    renderPage();
    const user=await openEditDialog("v-unchanged");
    await user.click(screen.getByTestId("button-save-edit"));
    await waitFor(()=>expect(screen.queryByTestId("button-save-edit")).not.toBeInTheDocument());
    expect(capturedPatchBody).toEqual({description:"Masaje descontracturante",beneficiaryName:"María Pérez",expiresAt:"2026-12-01",notes:"Nota original"});
  });

  it("un voucher cancelado sólo permite editar las notas internas", async () => {
    const cancelled = voucher({ id: "v-cancelled", status: "cancelado", cancelReason: "Pedido de reembolso" });
    mockFetch([cancelled]);
    renderPage();

    const user = await openEditDialog("v-cancelled");
    expect(screen.getByTestId("input-edit-description")).toBeDisabled();
    expect(screen.getByTestId("input-edit-beneficiary")).toBeDisabled();
    expect(screen.getByTestId("input-edit-expires")).toBeDisabled();
    expect(screen.getByTestId("input-edit-notes")).not.toBeDisabled();
    expect(screen.getByText(/sólo se pueden editar las notas internas/i)).toBeInTheDocument();

    await user.clear(screen.getByTestId("input-edit-notes"));
    await user.type(screen.getByTestId("input-edit-notes"), "Seguimiento del reembolso");
    await user.click(screen.getByTestId("button-save-edit"));

    await waitFor(() => expect(capturedPatchBody).not.toBeNull());
    expect(capturedPatchBody).toEqual({ notes: "Seguimiento del reembolso" });
  });
});
