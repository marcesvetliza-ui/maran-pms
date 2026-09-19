---
name: Channex staging ACK
description: Verified external behavior of the Channex booking revision feed and acknowledgement endpoint.
---

Channex staging accepts `POST /booking_revisions/:id/ack` and removes that revision from subsequent pending-feed responses. The PMS sync preserves the corresponding local Channex inbox row and does not create an operational reservation.

**Why:** This behavior had previously been confirmed only through documentation and mocks. A real staging run returned one successful acknowledgement, an empty pending feed afterward, and no change to the PMS reservation count.

**How to apply:** Treat ACK as an external, irreversible feed-consumption action. Preview and record the pending revision first, obtain explicit authorization, then verify both the remote feed and local persistence after acknowledging.