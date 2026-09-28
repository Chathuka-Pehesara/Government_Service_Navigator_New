# ADR-0014: Growing list endpoints are paged, with a capped unpaged fallback

## Context

The officer and admin web pages downloaded whole tables on every load: `GET /api/verification/tasks/pending`, `tasks/verified` and `audit-logs/all` returned every matching row, and the pages filtered, searched, counted and paged them in the browser. The department admin dashboard also joined every verified task against every audit log client-side. The audit log gains thousands of rows a day at 1000+ daily users, so these pages got slower every week even with no other change.

These endpoints are called from seven web pages and possibly from older builds of the desktop (Electron) app that staff install from GitHub Releases, so changing the response shape outright would break clients that have not been updated.

## Options Considered

1. **Always return a page envelope.** Clean, but every caller breaks at once, including installed desktop builds.
2. **New `/paged` endpoints next to the old ones.** No breakage, but the old endpoints keep returning whole tables forever.
3. **Opt-in paging on the same endpoints, with the unpaged form capped.** Callers that pass `?page=` get an envelope; callers that do not still get a plain array, but limited to the newest rows.

## Decision

Option 3.

- With `?page=` the response is `PagedResult<T>`: `{ items, total, page, pageSize, totalPages }`. `pageSize` defaults to 25 and is capped at 100 (`DTOs/Responses/PagedResult.cs`).
- Without `?page=` the response is a plain array of at most the newest 200 rows (`Paging.UnpagedLimit`).
- Filtering and search moved to the server:
  - Tasks: `search` matches an application id (`APP-123` or `123`) or part of a NIC; `tasks/verified` also takes `status` (`Rejected` includes `Suspended`).
  - Audit logs: `search` also matches the action, officer and remarks; `action` is `DELETED`, `APPROVED` or `REJECTED`; `applicationIds` (comma separated) limits the logs to specific applications.
- Stat cards use count endpoints instead of counting downloaded rows: `GET /api/verification/tasks/summary` and `GET /api/verification/audit-logs/summary`.
- Department scoping is applied in the query as before (ADR-0004), and the department subquery is no longer loaded into memory first.
- Converted pages: Verified Records, both Audit Log pages (server paging, search and filters), and the department admin dashboard (newest 100 verified tasks, audit logs only for those applications, totals from `tasks/summary`).

## Consequences

- Response size and query time are bounded no matter how large the tables grow, and the audit log pages stay fast.
- **Unpaged callers now see at most 200 rows.** The pending queue, bulk verification and the officer dashboard still use the unpaged form; if a department ever has more than 200 pending tasks, the oldest ones will not show there until the backlog shrinks. Converting those pages to server paging removes that limit.
- Counts on the Verified Records and audit pages now reflect the whole department history rather than whatever was downloaded, so the numbers may differ from what officers saw before.
- Export on Verified Records exports the current page only.
- `Skip`/`Take` paging slows down on very deep pages of very large tables. If the audit log reaches that point, keyset paging (`WHERE "Id" < @lastId`) is the next step (`docs/performance-and-redis.md`, section 4.5).
