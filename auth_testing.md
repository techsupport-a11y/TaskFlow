# TaskFlow authentication testing

## Password login
POST `/api/auth/login` with `usman@taskflow.demo` or `hena@taskflow.demo` and the seeded password in `/app/memory/test_credentials.md`. Use the returned bearer token on `/api/auth/me` and `/api/admin/*`.

## Google login
The frontend starts the Emergent OAuth redirect using the current browser origin. The backend currently reports a clear 501 until the platform callback exchange is connected; password login remains the active owner path.

## Access boundaries
Verify `/api/admin/financials` returns 401 without an owner token, and `/api/team/{slug}` contains only the selected member's tasks and no PIN, financial, or admin fields.