---
name: purchase-invoice-retention-sign
description: Accounting treatment for practiced, card-settlement, and received retentions.
---

# Purchase invoice retention sign convention

For ordinary supplier invoices, retention fields (IIBB/Ganancias/IVA/SUSS) represent amounts the **hotel withholds from the supplier** and therefore subtract from the amount paid.

`LIQ-TARJETA` is the explicit exception: those fields represent retentions **suffered by the hotel** from card processors. They add to the comprobante total, appear in the Debe as tax credits, and must not create records in the register of IIBB retentions practiced by the hotel.

`RETENCION` means a retention certificate received by the hotel. Its entered net amount is already the final document amount, like Factura C. It is never an expense: debit the subtype-specific `1.1` tax-credit account (IIBB `1.1.4.01.08.01`, IVA `1.1.4.01.04.01`, Ganancias `1.1.4.01.05`, Municipal `1.1.4.01.11`, SUSS `1.1.4.01.10`).

**Why:** applying the supplier-retention sign to card settlements understates the liquidation and misclassifies credits suffered by Maran. Classifying received certificates as expenses also distorts departmental costs and hides tax credits.

**How to apply:** every total calculator and accounting path must branch on the comprobante type. Ordinary purchase documents subtract retentions and credit retention accounts; `LIQ-TARJETA` adds and debits them; `RETENCION` uses its final net and exact subtype asset account. Creation and editing must stay synchronized.
