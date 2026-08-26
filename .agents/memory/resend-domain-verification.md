---
name: Resend domain verification
description: DNS and application configuration constraints for Resend transactional email in this project.
---

Resend sending uses its HTTPS API, not an SMTP connection. Domain verification requires the exact DKIM, SPF TXT, and MX records shown by Resend; SPF and MX for sending belong on the `send` subdomain, not only at the root domain.

**Why:** A verified DKIM record alone does not enable sending. Missing `send` records or multiple root SPF records can keep Resend in a missing-record state even after hours of propagation. The application also rejects the setup operationally if its configured `fromEmail` is outside the verified domain, or if the provider/API key is not enabled in the environment that sends.

**How to apply:** Query public DNS before changing code. Preserve legitimate existing SPF mechanisms by consolidating them into one SPF record, add Resend's exact region-specific MX and SPF records at `send.<verified-domain>`, then restart verification. In the app, select Resend, configure the API key through the protected UI, use a sender under the verified domain, enable the email system, and send a test.