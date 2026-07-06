---
name: Express param-route collisions with generic entityType/id patterns
description: Recurring bug class where a generic /:entityType/:id-style route shadows a more specific same-depth route registered later
---

`server/routes/folios.ts` registers `/api/folios/:entityType/:entityId/pdf` which matches ANY 3-segment path like `/api/folios/groups/{groupId}/pdf`.

Same bug recurred with `/api/account-movements/:entityType/:entityId` (in `server/routes/guests.ts`) shadowing `/api/account-movements/:id/receipt-pdf` (in `server/exports.ts`, registered later) — a request for `.../{id}/receipt-pdf` matched `:entityType={id}, :entityId="receipt-pdf"` and returned JSON instead of the PDF.

**Rule:** Any time a route uses a generic `:param/:param2`-style pattern, check for other same-depth routes on the same base path registered anywhere in the app (registration order matters, first-match-wins in Express). Either move the specific route earlier, or constrain the generic param, e.g. `:entityType(company|agency|guest)/:entityId`.

**Why:** Express (v4, path-to-regexp v0.1.x) does first-match-wins routing; a generic pattern registered earlier silently absorbs requests meant for a more specific route registered later, and often still returns 200 with an empty/wrong JSON body — no error is thrown, so it's easy to miss without e2e testing the actual endpoint.
