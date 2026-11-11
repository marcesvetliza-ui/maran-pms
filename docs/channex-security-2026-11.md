# Channex security changes — November 2026

Source: the customer-forwarded Channex notice, 11 November 2026. External linked documentation was not retrieved during this change.

## Implemented

- Historical unacknowledged inbox rows must be re-fetched before ACK, so previously redacted notes can be captured. Already acknowledged historical notes cannot be recovered.
- The durable inbound inbox commits contact/address fields before ACK. Operational notes now have a separate AES-256-GCM encrypted archive bound to connection/revision, using a purpose-specific derivation of CHANNEX_CREDENTIALS_ENCRYPTION_KEY. Preserve this master key and database backups; rotating the remote API key does not rotate the archive key.
- Raw messages and guarantees/card fields remain excluded. Notes resembling card numbers or payment-card terminology are replaced with an omission marker. This is a conservative filter, not a guarantee that arbitrary free text cannot contain sensitive information. Notes are not exposed through status APIs. Existing redacted historical notes cannot be recovered from local history.
- A documented `***` contact replay of an already acknowledged revision preserves the original payload. All nonmasked fields must match; financial/room/identity differences remain collisions. Null is not equivalent to a masked field. An unknown revision with masked contacts requires manual review and is not acknowledged or applied automatically.
- Real-account manual previews also persist the durable inbox before confirmation. Old manual rows without an inbox copy require a new preview before ACK. Manual retry does not overwrite saved contacts with `***`.
- Automated feed requests omit filter[property_id]. Account credentials are compared in memory (ciphertexts have random IVs); enabled properties on that account receive only their own revisions. Unknown properties and other accounts are never acknowledged. Unacknowledgeable-only pages stop automatic draining until another notification/startup catch-up. Concurrent webhook versions are retained. Manual previews select their property locally.
- Existing webhook notification entry points, Retry-After handling, queue rate pacing and pilot production guards remain in force. No channel activation, tariff, room scope or mapping changes are part of this release.

## Operations and remaining account actions

- **16 November 2026**: guest contact data disappears from booking emails and APIs after ACK. Use locally saved contacts. Do not rely on refetching acknowledged data. If archived notes need operator-facing access, add a separately authorized/audited retrieval flow; this release provides internal decryption only.
- **30 November 2026**: iframe mode loses contact details; do not use the embedded view as the source of retained contact data.
- **14 December 2026**: rate and entity limits become enforced. Check actual account counts (50 channels, 10 webhooks/property) and unique tax/tax-set/cancellation-policy titles before provisioning more entities. Live counts were not accessible during implementation. Existing webhooks were not recreated.
- **14 December 2026–15 February 2027**: issue new `chx` API keys, pause receiving before changing connection credentials, replace the key through the encrypted credential configuration, test, then resume. Revoke the old remote key after verification. No new key was available or rotated in this change. Never place keys in source code.
- **14 December 2026**: TOTP setup becomes available. Configure each Channex user with an authenticator and retain recovery procedures. Guest contact/card UI access requires TOTP from **11 January 2027**, all sign-ins from **15 February 2027**. API key configuration does not enroll human users in TOTP.

## Verification

Disposable PostgreSQL inbound tests cover commit-before-ACK (including decryption from a separate connection), masked replay preservation, collision detection, unknown masked revision ACK blocking, and same-account/multiple-property routing with concurrent notifications. Unit tests cover strict mask paths, null semantics, authenticated archive isolation, missing-key failure, omitted payment-like notes and account feed URL/local preview filtering. Legacy sync and existing credential/revision tests are included.
