# Monthly OTA calendar and room selection

The configuration workspace has separate Calendar and Link rooms views, following the supplied visual references. Moving between those views preserves local drafts. The monthly grid displays the selected plan, currency and occupancy, closures and minimum stays. Clicking the first and last day sets inclusive dates on the active period; navigation and querying do not write rates. Missing/unreceived dates cannot be selected. Occupancy prices never fall back to the scalar rate when that occupancy is missing.

Periods keep their own plans, dates and fields, can be added, duplicated or removed, and keep the existing server preview/token/explicit confirmation contract. Edits invalidate the current review. Successful confirmation clears staged changes; a failed confirmation preserves the editable draft. Scalar price controls are hidden for occupancy plans. Existing schema validation, currency, date limits, optimistic concurrency and atomic application remain on the server.

Room inclusion uses labelled, keyboard-accessible numbered checkboxes and category/specific scope radios. Room changes still require Save. Rate plan dropdowns now stage a local selection and require Save tariff; selecting a dropdown option no longer sends a mapping update. Each mapping operation retains its existing server validation and separate save action.

Verification: 19 targeted frontend tests, 10 existing calendar server/permission tests, TypeScript and production build. Browser checks cover admin/manager/reception, role matrix, and the full range → occupancy amounts → preview → explicit confirmation flow at 1440, 768 and 390 pixels using synthetic local API data. No hotel tariffs, room mappings, bookings or external channels are changed by these checks.
