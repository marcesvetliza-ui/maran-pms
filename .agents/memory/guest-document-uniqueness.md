---
name: Guest document uniqueness
description: Safe handling of uniqueness constraints for guest document numbers across development and historical production data.
---

Do not add a unique index on normalized guest document numbers solely because development data is clean. First confirm that the intended production data population satisfies the same normalization rule.

**Why:** Publish derives a development-to-production schema diff and validates it against a disposable production fork. Historical guest data may contain repeated document numbers or whitespace variants, causing a unique-index migration to fail before production changes.

**How to apply:** Use the exact prospective index expression in a read-only production duplicate query before adding the constraint. If duplicates are valid legacy records and production data must not be changed, keep the field non-unique (or use a non-unique lookup index) and remove the development-only unique index so Publish does not generate it.