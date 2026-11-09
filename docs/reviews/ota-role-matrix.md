# OTA role permissions and mapping workspace

OTA access now uses the existing role permission matrix. The dedicated per-user editor has been replaced with a link to that matrix. The legacy override rows remain stored for audit but no longer grant or deny OTA access; their editing endpoints return 410 to admin and 403 to other roles.

Initial grants (seeded once, later revocations survive restarts):

| Function | Admin | Manager / reception lead / commercial | Reception |
|---|---|---|---|
| Read received bookings | Yes | Yes | Yes |
| Manage/retry bookings | Yes | Yes | No |
| Read status/synchronizations | Yes | Yes | No |
| Execute/retry synchronizations | Yes | Yes | No |
| Configure connections/mappings | Yes | Yes | No |

Permission administration remains admin-only. Admin's OTA access is fixed. All other roles start without OTA access. Existing permissions in other modules are untouched. The server checks the active user's current role and the shared role cache. The sidebar and tabs use the same returned capabilities; reception sees no configuration, webhook, synchronization or retry controls. Custom grants remain editable in the matrix.

Mappings are grouped by remote category, with its local room scope and tariff links in the same card. Summary counts identify pending links. Credentials are collapsed separately, and inbound booking controls are in the bookings tab.

Verification: 20 frontend tests, 31 permission/route tests, 12 admin matrix API tests and 5 real PostgreSQL production-access tests passed. TypeScript passed. The isolated browser harness (`scripts/ota-access-browser`) checks admin, manager, reception and the matrix using synthetic data; screenshots are written to `generated-artifacts/ota-role-review`. No remote bookings, availability, rates, credentials or mappings are changed by these checks.
