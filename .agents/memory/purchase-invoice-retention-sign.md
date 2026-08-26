---
name: purchase-invoice-retention-sign
description: Purchase invoice retenciones (IIBB/Ganancias/IVA/SUSS) subtract from the invoice total; they are withholdings the hotel applies to the supplier, not withholdings applied to the hotel.
---

# Purchase invoice retention sign convention

Purchase invoice retention fields (IIBB/Ganancias/IVA/SUSS) represent amounts the **hotel withholds from the supplier** when paying an invoice — consistent with how retentions are treated elsewhere in guest/company/agency payments. They must subtract from the invoice total, not add to it, in every place that computes the total (client form, invoice create/update routes, and the accounting-entry generator).

**Why:** treating them as "withheld from the hotel" instead and flipping the sign to add them produces an unbalanced double-entry accounting record for credit-purchase invoices (the credit side included the retention but the debit side did not), and inflates the total shown to users.

**How to apply:** if a genuine need arises to model retentions made *to* the hotel (as opposed to retentions the hotel applies to a supplier) as a distinct concept, add it as a separate field/flow rather than flipping the sign on the existing supplier-withholding fields — and any accounting-entry change must keep debit/credit balanced and be verified before shipping.
