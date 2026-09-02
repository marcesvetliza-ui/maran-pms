---
name: Authorized repair test layering
description: How to prove that privileged multi-source repair flows are both authorized and atomic.
---

For privileged repairs that update several historical sources, component tests are complementary evidence only. The decisive integration test must invoke the real endpoint through the real role middleware with the intended staff role, and the rollback case must verify every affected source after a mid-operation failure.

**Why:** A directly rendered page with a mocked request can prove confirmation, cancellation, and error-state behavior, but it bypasses authorization and cannot prove that the server transaction avoided partial writes.

**How to apply:** Keep the UI test for operator behavior, add an authenticated route test for the allowed role, and make the PostgreSQL rollback test enter through that same endpoint while inducing a failure after at least one source update.