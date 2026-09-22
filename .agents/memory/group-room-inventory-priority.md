---
name: Group room inventory priority
description: Business rule for reconciling group blocks, physical assignments, and room-type inventory.
---

Confirmed and in-house group blocks consume room-type capacity for every night in their half-open stay interval and cannot be displaced. Tentative and blocked groups create an explicit warning that staff may override. A physical room overlap is always rejected.

**Why:** The user confirmed this priority model after a group block without a physical assignment appeared to overlap in Planning. The goal is to protect confirmed group commitments without treating tentative demand as an absolute stop.

**How to apply:** Use one server-side calculation across individual reservations, Planning moves, group assignments, booking-engine/OTA imports, and group status/block changes. Count linked group reservations against their block before adding demand so assigned rooms are not counted twice.

When editing an already-linked reservation, derive inventory group context exclusively from its persisted link. Generic editors may omit context, and caller-provided group IDs must never be trusted; otherwise linked demand is double-counted or unrelated demand can hide inside a block.

Group-wide date propagation and room reassignment must be one PostgreSQL transaction protected by the same inventory advisory lock. All physical-room and room-type validations happen before its first write, and any failure rolls back the group, linked reservations, room projections, and placeholder rename together.

**Why:** Sequential propagation could leave only part of a group reprogrammed after an unexpected database failure.

**How to apply:** Keep future group-wide mutations inside the atomic storage operation; do not reintroduce route-level loops that write linked reservations individually.