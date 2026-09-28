# ADR-0012: Realtime updates are pushed over SignalR, triggered by an EF Core change interceptor

## Context

With 1000+ daily users the system became slow, and the largest single cause was polling. The Flutter app refreshed `GET /api/verification/my-applications` from three stacked timers (4 s in the provider, 3 s on the applications tab, 2 s on the detail screen), so a citizen looking at one application sent about one request per second whether or not anything had changed. Each of those requests ran about seven queries against Neon. See `docs/performance-and-redis.md`, section 1.

Citizens still expect an officer's decision to show up quickly, so simply slowing the poll down would have made the app feel stale.

A second question was how the server knows *when* to notify. Many code paths change what a citizen sees: officer decisions, bulk verify, stage approval, payment verification, installment payments and reminders, refund decisions, the hourly installment monitor, and new notifications. Several of these live in different controllers and services.

## Options Considered

1. **Keep polling, but slower.** Cheapest, but an officer's decision could take up to the poll interval to appear.
2. **Push with SignalR, notifying from each write path by hand.** A helper such as `ICitizenChangeNotifier.ApplicationChangedAsync(nic, applicationId)` called after every relevant `SaveChanges`. Explicit, but every current and future write path has to remember the call, and a missed one means a stale screen with no error.
3. **Push with SignalR, notifying from an EF Core interceptor.** One interceptor sees every `SaveChanges` on `AppDbContext`, picks out the entities that affect citizens or the officer queue, and notifies after the data is committed.
4. **Postgres `LISTEN/NOTIFY` or triggers.** Catches raw SQL too, but needs triggers maintained in the idempotent startup SQL and a long-lived listener connection, which Neon's pooled (PgBouncer, transaction mode) endpoint does not support.

## Decision

Option 3, with a slow poll kept as a fallback.

- **Hub.** `Hubs/ApplicationHub.cs` at `/hubs/applications`, `[Authorize]`. `NicUserIdProvider` maps each connection to the `nicNumber` claim, so `Clients.User(nic)` reaches every device of one citizen. Any token without a `nicNumber` claim (officers, admins) joins the `officers` group. Browsers and WebSockets send the JWT as `?access_token=`, which `OnMessageReceived` accepts only for `/hubs` paths.
- **Interceptor.** `Data/Interceptors/CitizenChangeInterceptor.cs` registers a `SaveChangesInterceptor` and a `DbTransactionInterceptor` that share a singleton `CitizenChangeDispatcher`:
  - While saving, it records changed `VerificationTask`, `ApplicationSubmission`, `Payment`, `InstallmentPlan`, `Installment`, `CitizenNotification` and `RefundRequest` entities, and notes whether any catalog entity changed.
  - After the save it reads their keys (generated ids and foreign keys are only filled in then). If an explicit transaction is open it waits for `TransactionCommitted` and discards everything on rollback, so a client never refetches data that is not visible yet.
  - It resolves installment plan to payment to application to citizen NIC on a fresh, read-only context.
  - `CitizenChangeNotifier` then clears each affected citizen's cache tag **before** sending (ADR-0013), and sends `applicationsChanged` to the citizens, `refundUpdated` (refund ids) for refund changes, and `queueUpdated` to the `officers` group when tasks, submissions or payments changed.
  - A failure to invalidate or push is logged and swallowed. The write has already committed, and clients catch up on their fallback poll.
- **Mobile.** `mobile/lib/providers/realtime_provider.dart` (package `signalr_netcore`) connects while a citizen is signed in, stops the socket when the app goes to the background, and on resume refreshes and reconnects. Messages invalidate the Riverpod providers, which refetch over REST. The only remaining timer is a 30 s fallback poll in `myApplicationsProvider` (60 s for a refund screen), skipped while the app is in the background.
- **Web.** `web/src/utils/realtime.tsx` (`@microsoft/signalr`, `withCredentials: false` because CORS allows any origin) debounces `queueUpdated` by 1.5 s, invalidates the cached task and audit-log queries, and fires a `gsn:queue-updated` window event for the queue pages that still fetch on their own.
- **Scale-out.** With `REDIS_URL` set, SignalR uses the Redis backplane, so a push from one API instance reaches connections on another.

## Consequences

- API traffic from the citizen app drops from about one request per second per active citizen to one per 30 s, and decisions appear in about a second instead of on the next poll.
- A new write path is covered automatically as long as it goes through `SaveChanges`. **Raw SQL and `ExecuteUpdate`/`ExecuteDelete` bypass the interceptor**, so a write done that way must call `ICitizenChangeNotifier` itself or users will only see it on the next poll. `DataRepairService` deliberately uses tracked updates for the task repair for this reason.
- Messages carry no data, only "something changed". The client always refetches through the normal, authorised REST endpoint, so the hub cannot leak another citizen's data even if a message were misrouted.
- Staff are not split by department. Department names are matched loosely in this codebase (ADR-0004), so exact per-department groups would miss officers. Every staff connection gets every `queueUpdated`; with tens of officers and a debounced refetch of one page, that is cheap, but it would need revisiting with hundreds of concurrent staff.
- Every save on `AppDbContext` now runs the capture step, and saves that touch citizen-facing entities do one to three extra read queries after commit. This is small next to the polling it replaces.
- The push after a real officer decision has not been exercised against production data yet; `docs/performance-and-redis.md` section 10.5 lists the manual check.
