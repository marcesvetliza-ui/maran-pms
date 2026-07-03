---
name: Testing AFIP invoice emission requires ficticio mode
description: How to test Factura/NC emission flows in this environment without real AFIP/ARCA network access
---

`billing_config.arca_ambiente` controls whether invoice emission (`emitirFactura` in `server/billing/invoiceService.ts`) calls real AFIP/ARCA servers ("homologacion"/"produccion") or generates a local fake CAE ("ficticio"). Any e2e test of invoice or Nota de Crédito emission will get a 500 "fetch failed" if `arca_ambiente` is set to "produccion"/"homologacion", since this sandbox has no egress to AFIP.

**Why:** The dev DB in this project had `arca_ambiente = "produccion"` set (a real business setting, not a bug), which blocks any UI-driven emission test.

**How to apply:** Before e2e-testing any invoice/NC emission flow, check `SELECT arca_ambiente FROM billing_config`. If not "ficticio", temporarily set it to "ficticio" for the test, then restore the original value afterward — never leave it changed, since it's a real production configuration choice for the hotel.
