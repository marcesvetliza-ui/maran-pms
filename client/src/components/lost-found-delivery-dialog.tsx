import { useEffect, useState } from "react";
import { getArgentinaToday } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LostFoundItem } from "@shared/schema";
import { lostFoundShippingSchema } from "@shared/lostFoundDelivery";
import type { LostFoundShippingDetails, LostFoundStatusUpdate } from "@shared/lostFoundDelivery";

const emptyShipping: LostFoundShippingDetails = {
  fullName: "",
  address: "",
  province: "",
  postalCode: "",
  city: "",
  country: "Argentina",
  paymentStatus: "no_pagado",
};

export function DeliveryDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  item: LostFoundItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: LostFoundStatusUpdate) => void;
  isPending: boolean;
}) {
  const [claimedBy, setClaimedBy] = useState("");
  const [claimedDate, setClaimedDate] = useState(getArgentinaToday());
  const [deliveryType, setDeliveryType] = useState("retiro_hotel");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [shipping, setShipping] = useState<LostFoundShippingDetails>(emptyShipping);

  useEffect(() => {
    if (!open) return;
    const savedShipping = item.shippingDetails ?? null;
    setClaimedBy(item.claimedBy ?? "");
    setClaimedDate(item.claimedDate ?? getArgentinaToday());
    setDeliveryType(item.deliveryType === "envio" ? "envio" : "retiro_hotel");
    setDeliveredBy(item.deliveredBy ?? "");
    setNotes(item.notes ?? "");
    setShipping({
      ...emptyShipping,
      ...(savedShipping ?? {}),
      fullName: savedShipping?.fullName ?? item.claimedBy ?? "",
    });
  }, [item, open]);

  const shippingValid = deliveryType !== "envio" || lostFoundShippingSchema.safeParse(shipping).success;
  const canConfirm = !isPending && (deliveryType === "envio" || !!claimedBy.trim()) && !!claimedDate && shippingValid;
  const setShippingField = <K extends keyof LostFoundShippingDetails>(key: K, value: LostFoundShippingDetails[K]) => {
    setShipping(current => ({ ...current, [key]: value }));
  };

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({
      status: "entregado",
      claimedBy: claimedBy.trim() || shipping.fullName.trim(),
      claimedDate,
      deliveryType: deliveryType as "retiro_hotel" | "envio",
      deliveredBy: deliveredBy.trim(),
      notes: notes || undefined,
      shippingDetails: deliveryType === "envio" ? lostFoundShippingSchema.parse(shipping) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto sm:max-h-[88dvh]" data-testid="dialog-lost-found-delivery">
        <DialogHeader>
          <DialogTitle>{item.status === "entregado" ? "Editar entrega" : "Registrar entrega"}</DialogTitle>
          <DialogDescription>{item.description} · {item.codigo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="delivery-claimed-by">{deliveryType === "envio" ? "Contacto de entrega (opcional)" : "Retirado por *"}</Label>
            <Input id="delivery-claimed-by" value={claimedBy} onChange={e => setClaimedBy(e.target.value)} placeholder="Nombre de quien retira" data-testid="input-delivery-claimed-by" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="delivery-date">{deliveryType === "envio" ? "Fecha de envío *" : "Fecha de retiro *"}</Label>
              <Input id="delivery-date" type="date" value={claimedDate} onChange={e => setClaimedDate(e.target.value)} data-testid="input-delivery-date" />
            </div>
            <div>
              <Label htmlFor="delivery-type">Tipo de entrega</Label>
              <Select value={deliveryType} onValueChange={setDeliveryType}>
                <SelectTrigger id="delivery-type" data-testid="select-delivery-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retiro_hotel">Retiro en hotel</SelectItem>
                  <SelectItem value="envio">Envío</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {deliveryType === "envio" && (
            <section className="space-y-3 rounded-md border bg-muted/20 p-3" aria-label="Datos del envío" data-testid="shipping-fields">
              <div className="text-sm font-medium">Destino del envío</div>
              <div>
                <Label htmlFor="shipping-full-name">Nombre y apellido *</Label>
                <Input id="shipping-full-name" value={shipping.fullName} onChange={e => setShippingField("fullName", e.target.value)} autoComplete="name" data-testid="input-shipping-full-name" />
              </div>
              <div>
                <Label htmlFor="shipping-address">Domicilio *</Label>
                <Input id="shipping-address" value={shipping.address} onChange={e => setShippingField("address", e.target.value)} autoComplete="street-address" data-testid="input-shipping-address" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="shipping-province">Provincia *</Label>
                  <Input id="shipping-province" value={shipping.province} onChange={e => setShippingField("province", e.target.value)} data-testid="input-shipping-province" />
                </div>
                <div>
                  <Label htmlFor="shipping-postal-code">CP *</Label>
                  <Input id="shipping-postal-code" value={shipping.postalCode} onChange={e => setShippingField("postalCode", e.target.value)} inputMode="text" autoComplete="postal-code" data-testid="input-shipping-postal-code" />
                </div>
                <div>
                  <Label htmlFor="shipping-city">Ciudad *</Label>
                  <Input id="shipping-city" value={shipping.city} onChange={e => setShippingField("city", e.target.value)} autoComplete="address-level2" data-testid="input-shipping-city" />
                </div>
                <div>
                  <Label htmlFor="shipping-country">País *</Label>
                  <Input id="shipping-country" value={shipping.country} onChange={e => setShippingField("country", e.target.value)} autoComplete="country-name" data-testid="input-shipping-country" />
                </div>
              </div>
              <div>
                <Label htmlFor="shipping-payment">Estado del pago</Label>
                <Select value={shipping.paymentStatus} onValueChange={value => setShippingField("paymentStatus", value as LostFoundShippingDetails["paymentStatus"])}>
                  <SelectTrigger id="shipping-payment" data-testid="select-shipping-payment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_pagado">No pagado</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          )}

          <div>
            <Label htmlFor="delivery-by">Entregado por (operador)</Label>
            <Input id="delivery-by" value={deliveredBy} onChange={e => setDeliveredBy(e.target.value)} placeholder="Nombre del empleado que entrega" data-testid="input-delivery-by" />
          </div>
          <div>
            <Label htmlFor="delivery-notes">Notas</Label>
            <Textarea id="delivery-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." rows={2} data-testid="input-delivery-notes" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirm} disabled={!canConfirm} data-testid="button-delivery-confirm">
            {isPending ? "Procesando..." : item.status === "entregado" ? "Guardar cambios" : "Confirmar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}