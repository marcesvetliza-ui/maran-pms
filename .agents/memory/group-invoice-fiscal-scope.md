---
name: Group invoice fiscal scope
description: Rules that keep group-source availability, credit notes, reissues, and fiscal totals consistent.
---

Direct group invoices must claim exact source amounts at issuance and retain a one-to-one fiscal line for every claimed source. Group-payment invoices are instead claims against the parent receipt and do not carry service-source allocations.

**Why:** The post-emission UI link is too late to prevent concurrent duplicate claims, and inferring source-to-line mappings during a credit note can restore the wrong residual. Payment receipts can legitimately be reissued only after their prior fiscal document is fully credited.

**How to apply:** Serialize group issuance and group credit notes with the same group advisory lock. Calculate the fiscal total from the exact sum of gross line cents; derive net/IVA from that amount, never from independently rounded client net values. Use exact source maps for direct-invoice NCs; retain prior group-payment invoices as history and replace only the active payment reference after full credit.