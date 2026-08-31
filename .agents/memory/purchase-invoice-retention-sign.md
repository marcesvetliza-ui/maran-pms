---
name: purchase-invoice-retention-sign
description: Supplier-invoice retentions subtract, except LIQ-TARJETA retentions suffered by the hotel, which add and are debited as tax credits.
---

# Purchase invoice retention sign convention

For ordinary supplier invoices, retention fields (IIBB/Ganancias/IVA/SUSS) represent amounts the **hotel withholds from the supplier** and therefore subtract from the amount paid.

`LIQ-TARJETA` is the explicit exception: those fields represent retentions **suffered by the hotel** from card processors. They add to the comprobante total, appear in the Debe as tax credits, and must not create records in the register of IIBB retentions practiced by the hotel.

**Why:** applying the supplier-retention sign to card settlements understates the liquidation and misclassifies credits suffered by Maran. Applying the card-settlement sign globally would overstate ordinary supplier invoices and unbalance their accounting.

**How to apply:** every total calculator and accounting path must branch on the comprobante type. Ordinary purchase documents subtract retentions and credit the retention accounts; `LIQ-TARJETA` adds them and debits those accounts. Creation and editing must use the same rule and keep the entry synchronized.
