---
name: Group room inventory priority
description: Business rule for reconciling group blocks, physical assignments, and room-type inventory.
---

Confirmed and in-house group blocks consume room-type capacity for every night in their half-open stay interval and cannot be displaced. Tentative and blocked groups create an explicit warning that staff may override. A physical room overlap is always rejected.

**Why:** The user confirmed this priority model after a group block without a physical assignment appeared to overlap in Planning. The goal is to protect confirmed group commitments without treating tentative demand as an absolute stop.

**How to apply:** Use one server-side calculation across individual reservations, Planning moves, group assignments, booking-engine/OTA imports, and group status/block changes. Count linked group reservations against their block before adding demand so assigned rooms are not counted twice.