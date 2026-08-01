import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Receipt } from "lucide-react";
import { EmitirFacturaDialog, NotaCreditoDialog } from "@/pages/billing";

const AREA_EXTRA_TIPOS: Record<string, { value: string; label: string }[]> = {
  recepcion: [{ value: "cierre_habitacion", label: "Voucher Habitaciones" }],
  spa: [{ value: "cierre_spa", label: "Voucher SPA" }],
};

export function EmitirComprobanteButton({ area, variant = "outline", size = "sm" }: {
  area: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "sm" | "default";
}) {
  const extraTipos = AREA_EXTRA_TIPOS[area] || [];
  const [open, setOpen] = useState(false);
  const [showFactura, setShowFactura] = useState(false);
  const [ncSearch, setNcSearch] = useState("");
  const [ncInvoiceId, setNcInvoiceId] = useState<number | null>(null);

  const { data: config } = useQuery<any>({ queryKey: ["/api/billing/config"] });
  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/billing/invoices", { area, cliente: ncSearch }],
    queryFn: () =>
      fetch(`/api/billing/invoices?area=${encodeURIComponent(area)}${ncSearch ? `&cliente=${encodeURIComponent(ncSearch)}` : ""}`, { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const invoicesActivas = (invoices || []).filter((i: any) => i.estado !== "anulada" && ["FA", "FB", "FT", "FM"].includes(i.tipo_comprobante));

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} data-testid="button-emitir-comprobante">
        <Receipt className="h-4 w-4 mr-1" /> Emitir Comprobante
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Emitir Comprobante</DialogTitle></DialogHeader>
          <Tabs defaultValue="factura">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="factura" data-testid="tab-nueva-factura">Nuevo Comprobante</TabsTrigger>
              <TabsTrigger value="nc" data-testid="tab-nota-credito">Nota de Crédito</TabsTrigger>
            </TabsList>
            <TabsContent value="factura" className="pt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Factura A/B con CAE real de ARCA, Cuenta Corriente{extraTipos.length > 0 ? `, o ${extraTipos.map(t => t.label).join(" / ")}` : ""}.
              </p>
              <Button className="w-full" onClick={() => { setOpen(false); setShowFactura(true); }} data-testid="button-continuar-factura">
                Continuar
              </Button>
            </TabsContent>
            <TabsContent value="nc" className="pt-3 space-y-2">
              <Input
                placeholder="Buscar comprobante por cliente..."
                value={ncSearch}
                onChange={e => setNcSearch(e.target.value)}
                data-testid="input-buscar-nc"
              />
              <div className="max-h-60 overflow-y-auto space-y-1">
                {invoicesActivas.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin comprobantes encontrados</p>
                )}
                {invoicesActivas.map((inv: any) => (
                  <button
                    key={inv.id}
                    type="button"
                    className="w-full text-left border rounded-md p-2 text-sm hover:bg-muted/50"
                    onClick={() => { setOpen(false); setNcInvoiceId(inv.id); }}
                    data-testid={`row-invoice-${inv.id}`}
                  >
                    <div className="flex justify-between">
                      <span>{inv.tipo_comprobante} {String(inv.punto_venta).padStart(4, "0")}-{String(inv.numero).padStart(8, "0")}</span>
                      <span className="font-medium">${parseFloat(inv.monto_total).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{inv.cliente_razon_social}</div>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {showFactura && (
        <EmitirFacturaDialog
          open={showFactura}
          onClose={() => setShowFactura(false)}
          config={config}
          allowedTipos={["FA", "FB", "FT", "FM", ...extraTipos.map(t => t.value)]}
          cashArea={area}
        />
      )}

      {ncInvoiceId !== null && (
        <NotaCreditoDialog invoiceId={ncInvoiceId} onClose={() => setNcInvoiceId(null)} />
      )}
    </>
  );
}
