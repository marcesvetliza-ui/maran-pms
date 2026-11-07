# Full payment while entering a purchase invoice

Selecting a cash/payment tender originally copied the current invoice total into
Monto a pagar ahora once. Adding perceptions or changing taxes/discounts later
changed the invoice total but left that suggested payment behind, creating an
unintended partial payment order.

The full suggested payment now follows the final total. Typing the payment
amount explicitly switches to manual mode, preserving deliberate partials.
Split payments stay explicit. Pagar el total del comprobante restores full-payment
mode. Loading/editing another invoice and returning to Cuenta Corriente reset it.
The existing invoice/payment-order transaction and all historical rows are unchanged.

Regression: choose Efectivo for net 1000 + IVA 210, then add IIBB 10. Submitted
payment is 1220, not 1210. An explicitly typed 700 remains 700 and leaves 520;
restoring full mode follows subsequent perceptions as well.

Validation: 16 purchase UI tests (split, discounts, non-fiscal) and 10 real local
PostgreSQL tests (automatic/partial payment), TypeScript and production build.
PostgreSQL confirms perceptions are already part of the payable total and a whole
payment closes the balance; it correctly preserves a genuinely smaller payment.

Historical unintended partials require reconciliation of the existing payment
order and accounting evidence. Do not merely set paid/zero or manufacture a second
cash payment. No historical payment/order/balance was changed by this fix.
