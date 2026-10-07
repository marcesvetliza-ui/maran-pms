import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { lostFoundShippingSchema, type LostFoundShippingDetails } from "@shared/lostFoundDelivery";

export function printShippingLabel(shipping: LostFoundShippingDetails): boolean {
  const parsed = lostFoundShippingSchema.safeParse(shipping);
  if (!parsed.success) return false;
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const doc = popup.document;
  doc.title = "Etiqueta de envío";
  doc.documentElement.lang = "es";
  const style = doc.createElement("style");
  style.textContent = `
    @page { margin: 12mm; }
    body { margin: 0; padding: 8mm; background: white; color: black; font-family: Arial, sans-serif; }
    main { box-sizing: border-box; width: 100mm; max-width: 100%; border: 1px solid black; padding: 7mm; }
    h1 { font-size: 16pt; margin: 0 0 7mm; }
    p { margin: 0 0 5mm; font-size: 15pt; overflow-wrap: anywhere; white-space: pre-wrap; }
    strong { display: block; font-size: 10pt; margin-bottom: 1mm; }
    button { margin: 6mm 0; padding: 10px 18px; font-size: 16px; }
    @media print { body { padding: 0; } button { display: none; } main { break-inside: avoid; } }
  `;
  doc.head.append(style);
  const label = doc.createElement("main");
  const title = doc.createElement("h1");
  title.textContent = "Destinatario";
  label.append(title);
  const fields = [
    ["Nombre y apellido", parsed.data.fullName],
    ["Domicilio", parsed.data.address],
    ["Código postal", parsed.data.postalCode],
    ["Ciudad", parsed.data.city],
    ["Provincia", parsed.data.province],
    ["País", parsed.data.country],
  ];
  for (const [name, value] of fields) {
    const row = doc.createElement("p");
    const heading = doc.createElement("strong");
    heading.textContent = `${name}:`;
    row.append(heading, doc.createTextNode(value));
    label.append(row);
  }
  const print = doc.createElement("button");
  print.textContent = "Imprimir etiqueta";
  print.onclick = () => { popup.focus(); popup.print(); };
  doc.body.append(label, print);
  // Keep the preview available if the user cancels or the browser needs another click.
  popup.setTimeout(() => { if (!popup.closed) { popup.focus(); popup.print(); } }, 250);
  return true;
}

export function PrintShippingLabelButton({ shipping }: { shipping: LostFoundShippingDetails }) {
  const { toast } = useToast();
  const valid = lostFoundShippingSchema.safeParse(shipping).success;
  return <div className="space-y-1">
    <Button type="button" size="sm" variant="outline" disabled={!valid} data-testid="button-print-shipping-label"
      onClick={() => {
        if (!printShippingLabel(shipping)) toast({ title: "No se pudo abrir la etiqueta", description: "Permití las ventanas emergentes de este sitio y volvé a intentar.", variant: "destructive" });
      }}>
      <Printer className="mr-2 h-4 w-4" />Imprimir etiqueta
    </Button>
    {!valid && <p className="text-xs text-muted-foreground">Completá los datos del destino para imprimir.</p>}
  </div>;
}
