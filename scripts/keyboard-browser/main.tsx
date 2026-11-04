import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TransferStockForm } from "@/pages/inventory";
import { InvoiceDialog } from "@/pages/purchase-invoices";
import { GuestSearchCombobox } from "@/components/guest-search-combobox";
import { NationalityCombobox } from "@/components/entity-selector";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import "@/index.css";

// This separate Vite harness imports actual production components, but has no
// backend, login, database or real hotel data. Any attempted write fails loudly.
const suppliers = [{ id: 1, razonSocial: "Proveedor ficticio", cuit: "30-00000000-0", condicionIva: "responsable_inscripto" }];
const warehouses = [{ id: "test-central", name: "Depósito ficticio", area: "general", isActive: true },
  { id: "test-cocina", name: "Cocina ficticia", area: "restaurant", isActive: true }];
const items = [{ id: "test-harina", name: "Harina ficticia", sku: "TEST", unit: "kg", currentStock: "100", costPrice: "10", itemKind: "materia_prima", isActive: true }];
window.fetch = async (url, options) => {
  const method = options?.method?.toUpperCase() || "GET";
  if (method !== "GET") {
    document.body.dataset.attemptedWrite = method;
    throw new Error("La prueba de teclado no permite guardar ni cobrar");
  }
  const path = String(url);
  const data = path.includes("/guests/search") ? [{ id: "fake-guest", firstName: "Cliente", lastName: "Ficticio" }]
    : path.includes("/countries") ? [{ id: "ar", name: "Argentina", afipCode: "200" }, { id: "uy", name: "Uruguay", afipCode: "225" }]
    : path.endsWith("/inventory/warehouses") ? warehouses
    : path.endsWith("/inventory/items") ? items
    : path.includes("/inventory/items/") && path.endsWith("/warehouses") ? [{ warehouse_id: "test-central", current_stock: "100" }]
    : [];
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
};
function App() {
  const [panel, setPanel] = useState("transfer");
  const [guest, setGuest] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [nationality, setNationality] = useState("Argentina");
  const [modal, setModal] = useState(false);
  const [child, setChild] = useState(false);
  return <QueryClientProvider client={queryClient}>
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold">Verificación aislada de teclado — datos ficticios</h1>
      <nav className="flex gap-3 my-4">
        {["transfer", "purchase", "guest", "dialogs"].map(name =>
          <button type="button" key={name} onClick={() => { queryClient.clear(); setPanel(name); }}>{name}</button>)}
      </nav>
      <p className="mb-4">Ninguna operación de esta página puede llegar a una base de datos.</p>
      {panel === "transfer" && <TransferStockForm embedded open onClose={() => {}} />}
      {panel === "purchase" && <InvoiceDialog embedded unifiedLayout open onClose={() => {}} suppliers={suppliers} accounts={[]} />}
      {panel === "guest" && <div className="space-y-4">
        <input aria-label="Anterior" defaultValue="Conservar texto" />
        <GuestSearchCombobox onGuestSelect={setGuest} selectedGuestId={guest?.id}
          selectedGuestName={guest ? `${guest.firstName} ${guest.lastName}` : undefined} onClear={() => setGuest(null)} />
        <input aria-label="Cantidad" defaultValue="123.45" />
        <NationalityCombobox value={nationality} onChange={setNationality} />
        <input aria-label="Siguiente" />
      </div>}
      {panel === "dialogs" && <>
        <button onClick={() => setModal(true)}>Abrir modal</button>
        <Dialog open={modal} onOpenChange={setModal}><DialogContent aria-describedby={undefined}>
          <DialogTitle>Modal principal</DialogTitle>
          <input aria-label="Primer campo" />
          <Select defaultValue="kg"><SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="kg">Kilogramos</SelectItem><SelectItem value="g">Gramos</SelectItem></SelectContent>
          </Select>
          <button onClick={() => setChild(true)}>Abrir anidado</button>
          <Dialog open={child} onOpenChange={setChild}><DialogContent aria-describedby={undefined}>
            <DialogTitle>Modal anidado</DialogTitle><input aria-label="Campo anidado" />
          </DialogContent></Dialog>
          <input aria-label="Último campo" />
        </DialogContent></Dialog>
      </>}
    </main>
  </QueryClientProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
