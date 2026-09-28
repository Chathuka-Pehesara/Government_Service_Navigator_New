# ADR-0004: Department scoping is enforced client-side, not server-side

## Context

A Department Admin (an `Officer` row with `Role` containing "Admin" and a non-empty `Department`) should only see and manage their own department's officers and Service Catalog entries - not other departments'. A System Admin (an `Admin` row, no `Department` at all) should see everything.

## Options Considered

1. **Server-side enforcement.** The backend reads the caller's department from their JWT claims and filters every relevant query (officers, services, eligibility rules, documents, fees) to that department, rejecting or 403-ing any request for another department's data.
2. **Client-side filtering only.** The web app reads `department`/`role` out of the JWT payload it already stored (`localStorage.getItem("officerUser")`) and filters what it *displays* and *defaults to* accordingly; the backend serves the same unfiltered data to everyone and trusts the frontend not to ask for the wrong thing.
3. **Mixed.** Server-side filtering only where it already happened to exist, client-side everywhere else.

## Decision

What's actually implemented is Option 3, arrived at incrementally rather than chosen upfront: `GET /api/admin/officers?department=X` (`AdminController`/`AdminService`) does filter server-side when a `department` query parameter is passed. Every other department-sensitive read - the Service Catalog manager, eligibility rule builder, eligibility simulator, service configuration tabs, and the application-template builder's "linked service" picker - filters entirely in the React components (`web/src/Admin/**`, `web/src/Officer/Application_create/TemplateBuilder.tsx`) using `currentUser.department` read out of `localStorage` and mapped to a Service Catalog category via `getCategoryForDepartment` (`web/src/constants/departments.ts`).

## Consequences

- **This is a real security gap, not just a UX nicety.** `ServicesController`, `TemplateController`, and most of `AdminController` have no `[Authorize]` attribute at all (see `docs/adr/0001-jwt-auth-with-revocation-table.md` and `docs/api.md` for the full picture) - so department scoping being client-side is compounded by there being no authentication requirement to bypass in the first place. Anyone who can reach the API (not just a logged-in Department Admin poking at another department through dev tools) can call `GET /api/services` or `GET /api/admin/officers` directly and get every department's data, fully unfiltered. The department-scoped UI only stops a well-behaved browser session from *displaying* another department's data; it enforces nothing.
- Fixing this properly means: (a) adding `[Authorize]` to `AdminController`, `ServicesController`, and `TemplateController`; (b) adding a `Department` (or role) claim check server-side in `AdminService`/`ServiceCatalogService` for every department-sensitive query, not just the one that already accepts a `department` query param. Neither is done yet - this ADR exists specifically to make that gap visible rather than let "the dropdown is scoped now" be mistaken for "the data is protected now."
- Until fixed, treat department scoping in this app as a **display convenience for legitimate users**, not an access-control boundary.

## Partially superseded

Server-side scoping (Option 1) is now implemented for the case-handling endpoints, driven by the `department` and `role` claims in the officer's JWT:

- `GET /api/verification/tasks/pending` and `tasks/verified` filter to the caller's department (`VerificationService.GetPendingTasksAsync(deptScope)`). `GET tasks/{id}` returns `403` for another department's task.
- `GET /api/payments/pending-slips` and `department-payments` filter by the submission's `CurrentDepartment`. `POST /api/payments/{id}/verify` and `PUT /api/payments/{id}/status` return `403` across departments.
- These controllers also enforce role lists (`[Authorize(Roles = ...)]`), so a citizen token can no longer read the officer queue.
- A role of `Admin` or containing `System Admin` bypasses the department filter. So does a token with **no** `department` claim, which means any officer row with an empty `Department` sees every department.

**Still client-side only:** everything this ADR originally described - `AdminController`, `ServicesController` and `TemplateController`. They have no `[Authorize]` at all, so the original security gap stands for officer management, the service catalog and templates. The agent and `RagSetup` endpoints added since are in the same state. The remediation steps under Consequences still apply to them.

Department identity is a free-form string (`Officer.Department` vs `Template.Department` / `ApplicationSubmission.CurrentDepartment`). Queue list queries match it loosely: case-insensitive equality, or either name containing the other, so "Police" matches "Police Department". Single-item checks (`GET tasks/{id}`, payment verify) compare case-insensitively but exactly. A department renamed in one place but not the other can therefore show up in a queue list and still return `403` when an item is opened, or drop out of the queue entirely.

Since 2026-09-29 the verification lists are paged on the server (ADR-0014), so the scoping above is the only filter: the Verified Records page no longer re-filters by department in the browser. The realtime `queueUpdated` message (ADR-0012) goes to all staff regardless of department; it carries no data, and each page refetches through the scoped endpoints.
