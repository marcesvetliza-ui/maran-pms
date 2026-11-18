import { useState } from "react";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClosedReservationCorrection } from "./closed-reservation-correction";
import { PostCheckoutConsumption } from "./post-checkout-consumption";
import { PrefacturaDialog } from "./PrefacturaDialog";
import type { ReservationWithDetails } from "@shared/schema";

export function ClosedReservationBilling({ reservation }: { reservation: ReservationWithDetails }) {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"menu" | "consumption">("menu");
  const [correction, setCorrection] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const billing = reservation.status === "checked_out" && hasPermission("sidebar:/billing");
  const correct = hasPermission("api:billing:nc-reconciliation");
  if (!billing && !correct) return null;
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => { setSection("menu"); setOpen(true); }}>Cuenta y facturación</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader>
      <DialogTitle>Cuenta y facturación</DialogTitle>
      <DialogDescription>{reservation.guest?.lastName} {reservation.guest?.firstName} · Hab. {reservation.room?.roomNumber} · Estadía cerrada</DialogDescription>
    </DialogHeader>
      {section === "menu" ? <div className="grid gap-3 sm:grid-cols-2">
        {billing && reservation.status === "checked_out" && <Button type="button" variant="outline" className="h-auto min-h-24 whitespace-normal flex-col items-start text-left p-4" onClick={() => setSection("consumption")}>
          <span className="font-semibold">Consumos posteriores</span><span className="text-sm font-normal">Agregar consumos, facturarlos y cobrar o enviar a cuenta corriente.</span>
        </Button>}
        {correct && <Button type="button" variant="outline" className="h-auto min-h-24 whitespace-normal flex-col items-start text-left p-4" onClick={() => { setOpen(false); setCorrection(true); }}>
          <span className="font-semibold">Corregir facturación</span><span className="text-sm font-normal">Revisar una factura existente y emitir su corrección.</span>
        </Button>}
      </div> : <>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSection("menu")}>Volver a la cuenta</Button>
        <PostCheckoutConsumption key={reservation.id} reservationId={reservation.id} onInvoice={() => { setOpen(false); setInvoice(true); }} />
      </>}
    </DialogContent></Dialog>
    {correction && <ClosedReservationCorrection key={reservation.id} reservationId={reservation.id} open={correction} onOpenChange={setCorrection} />}
    {invoice && <PrefacturaDialog open={invoice} onClose={() => { setInvoice(false); setOpen(true); setSection("consumption"); }} reservationId={reservation.id} reservation={reservation} mode="billing" postCheckoutOnly />}
  </>;
}
