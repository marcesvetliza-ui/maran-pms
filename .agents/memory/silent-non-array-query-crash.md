---
name: Custom queryFn bypassing error handling causes non-array crashes
description: Why a raw fetch() inside a React Query queryFn can silently turn a failed request into a crashing non-array value, and how to avoid it.
---

Custom `queryFn`s that call raw `fetch()` (instead of `apiRequest()`) and skip a `res.ok` check will happily `.json()` an error body (e.g. `{ error: "..." }` or a 401 `{ message: "No autenticado" }`) and hand it to the component as if it were the successful payload. A `useQuery({ data: x = [] })` default only guards against `undefined` — it does NOT guard against this case, since the resolved data is a non-array object, not undefined.

**Why:** This produced a real production crash ("N.filter is not a function") in the Administración → Cuentas Corrientes report, triggered whenever the report endpoint returned any non-200 response (session expiry, transient 500, etc). The bug was invisible in normal dev testing because the endpoint almost always succeeds there.

**How to apply:** Whenever you see a `queryFn` doing its own `fetch(...)` for a custom URL (common when query params can't be expressed via the default `queryKey`-based fetcher), make sure it either uses `apiRequest()` (which throws via `throwIfResNotOk`) or manually checks `res.ok` and throws. Additionally, for any query whose result feeds `.filter()`/`.map()`/`.reduce()`, prefer defensively normalizing with `Array.isArray(data) ? data : []` rather than relying solely on the `= []` default value in destructuring.
