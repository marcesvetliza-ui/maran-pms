---
name: Read-only Caja E2E setup
description: How browser regressions can enter Caja deterministically without creating operational side effects.
---

For read-only browser checks in Caja, resolve the post-login POS selector explicitly and set the active Caja area only in browser session storage before navigation. Do not click actions that open, close, or select a real shift merely to reach a reporting tab.

**Why:** Both selectors are rendered asynchronously after API data arrives. Instant visibility checks were flaky, while interacting with operational shift controls would violate fixture isolation.

**How to apply:** Wait for a concrete POS option before selecting it. For reporting-only tabs, seed the client-side active-area state in the isolated browser context, then navigate directly and assert the target tab.