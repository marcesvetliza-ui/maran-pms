---
name: Group invoice fiscal scope
description: Rules that keep group-source availability, credit notes, reissues, and fiscal totals consistent.
---

Every group invoice must claim exact service-source amounts at issuance, including invoices linked to a group payment. A group payment is provenance for who paid, not the fiscal amount limit. Visible fiscal lines may aggregate sources when the exact source map is retained.

**Why:** Financial collection and fiscal documentation can differ after non-fiscal advances. The post-emission UI link is too late to prevent duplicate claims, and fiscal documents/credit notes must never create Caja movements because refunds or payment reversals are separate operations.

**How to apply:** A non-fiscal advance reduces the new collection, never the gross fiscal document. For example, services 360 with a prior non-fiscal advance of 60 produce invoice 360, applied advance 60, new collection 300, total settled 360. Serialize group issuance and group credit notes with the same group advisory lock. Validate every group invoice against exact source maps regardless of payment linkage. For aggregate lines, reuse the aggregate tax treatment across mapped sources in an NC. Retain prior invoices as history and replace only the active payment reference after full credit.