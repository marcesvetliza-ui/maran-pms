---
name: Restaurant close dialog billing refactor
description: Architecture decisions for the restaurant order close/billing flow — payment method vs document type separation.
---

# Restaurant Close Dialog — Billing Refactor

## The rule
`paymentMethod` and `receiptType` are independent. "Cargo a Habitación" is a **payment method** (`cuenta_habitacion`), never a receipt type. The receipt type is always the AFIP document (ticket, factura_a/b, voucher, etc.).

**Why:** Previously `cuenta_habitacion` lived in the receipt type select, which made it impossible to also choose the document type when charging to a room. Now you can charge to a room AND still emit a Ticket or Factura.

**How to apply:**
- `receiptTypeLabels` has: `cierre_mesa`, `factura_a`, `factura_b`, `voucher`, `voucher_pedidos_ya`  
- `paymentMethodLabels` has: `efectivo`, `tarjeta_debito`, `tarjeta_credito`, `transferencia`, `mercadopago`, `cuenta_corriente`, `cuenta_habitacion`
- Room search section triggers on `closePaymentMethod === "cuenta_habitacion"` (not receiptType)
- Invoice emits when `isFactura = ["factura_a","factura_b","factura_c"].includes(receiptType)`; backend receives `emitInvoice: true`, `vatCondition`, `customerRazonSocial`, `customerCuit`
- On success: if `data.invoiceId` → open PDF in new tab
- Default receipt type across all reset points: `"cierre_mesa"` (not `"ticket"`)

## Split billing
Each split independently sets payment method + receipt type. If receipt is factura_a/b, shows inline billing fields (Razón Social + CUIT) per split. States: `splitCustomerNames`, `splitCustomerCuits`, `splitVatConditions`, `splitBillingSearches`, `splitFbIsExento` — all reset on dialog close.
