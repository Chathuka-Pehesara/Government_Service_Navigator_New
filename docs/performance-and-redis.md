# Performance and Redis Caching Guide

This guide explains why the mobile app and web dashboard load slowly now that the system has **1000+ users every day**, and the step-by-step fix: less polling, database indexes, pagination, push updates with SignalR, and a Redis cache layer. It is written for the current codebase (ASP.NET Core on .NET 10, PostgreSQL on Neon, Flutter mobile, React web).

> **Status:** implemented on 2026-09-29 (all five phases). The sections below explain the reasoning; [section 10](#10-what-was-built) lists exactly what was built, where it differs from the original plan, and what still needs a real-traffic check.

## The short answer

The system is not slow because 1000 users is a lot. It is slow because every user generates far more work than they need to:

1. **The mobile app asks the server for the same data about once per second**, even when nothing changed (three timers stacked on top of each other).
2. **Each of those requests runs about 7 database queries** over the internet to Neon, on columns that have **no index**, and one of them even **writes** to the database.
3. **The web dashboard downloads whole tables** (all pending tasks, all verified tasks, all audit logs) on every page load, with no pagination.
4. **Nothing is cached** and nothing is compressed, so reference data (services, templates, fees, departments) is re-read from the database on almost every screen.

The solution, in order of impact:

| Order | Solution | Why it helps |
|---|---|---|
| 1 | Replace the 2-4 s polling with one 30 s fallback poll (phase 1) | Removes around 90% of all API traffic on its own |
| 2 | Add indexes, remove writes from GET endpoints, paginate every list (phase 2) | Each remaining request becomes several times faster, and stays fast as tables grow |
| 3 | Push changes with SignalR instead of polling (phase 3) | Users see updates instantly while the server does almost no work between changes |
| 4 | Add Redis for token checks, reference data and per-citizen results (phase 4) | Most requests are answered without touching the database, and you can run more than one API instance |
| 5 | Neon pooler, same region, no autosuspend, response compression (phase 5) | Removes cold starts and cuts network time, especially on mobile data |

Phases 1 and 2 need no new infrastructure and fix most of the slowness. Redis (phase 4) is what keeps it fast as the user count keeps growing.

## Contents

1. [Why it is slow today](#1-why-it-is-slow-today)
2. [Fix plan at a glance](#2-fix-plan-at-a-glance)
3. [Phase 1 - Stop the polling storm](#3-phase-1---stop-the-polling-storm)
4. [Phase 2 - Indexes and query fixes](#4-phase-2---indexes-and-query-fixes)
5. [Phase 3 - Push updates with SignalR](#5-phase-3---push-updates-with-signalr)
6. [Phase 4 - Redis](#6-phase-4---redis)
7. [Phase 5 - Neon and HTTP settings](#7-phase-5---neon-and-http-settings)
8. [Measuring the result](#8-measuring-the-result)
9. [Troubleshooting](#9-troubleshooting)
10. [What was built](#10-what-was-built)

---

## 1. Why it is slow today

### 1.1 The mobile app polls the same endpoint three times over

Three independent timers all refresh `myApplicationsProvider`, which calls `GET /api/verification/my-applications`:

| File | Interval | When it runs |
|---|---|---|
| `mobile/lib/providers/application_providers.dart:19` | 4 s | Always while signed in (`keepAlive: true`), on every screen |
| `mobile/lib/widgets/dashboard/applications_tab.dart:36` | 3 s | While the Applications tab is mounted |
| `mobile/lib/screens/verification_detail_screen.dart:36` | 2 s | While an application detail screen is open |

These timers stack. A citizen looking at one application causes roughly **one request per second**, even when nothing has changed. With a few hundred active citizens that is hundreds of requests per second against a single API process and a single database.

### 1.2 Each poll is expensive

`VerificationController.GetMyApplications` (`backend/src/Controllers/VerificationController.cs:115`) makes about seven sequential database round trips:

1. Revoked-token lookup in `Program.cs:237` (runs on **every** authenticated request, see [ADR-0001](adr/0001-jwt-auth-with-revocation-table.md))
2. Unreviewed approved tasks for the citizen (`VerificationService.GetTasksForCitizenAsync`)
3. All tasks for the citizen
4. Submissions with `ServiceProcedure` and `FeeSchedules`
5. Active templates with `Fields`
6. Installment plans with aggregates
7. Payments

`GetTasksForCitizenAsync` (`backend/src/Services/VerificationService.cs:333`) also **writes** to the database (`SaveChangesAsync`) inside this GET, so every poll can take row locks.

### 1.3 Missing indexes

The citizen lookups filter on `CitizenNic`, but `VerificationTasks.CitizenNic` and `ApplicationSubmissions.CitizenNic` have no index (`AppDbContext.cs` only indexes departments, emails, `ServiceId`, `ApplicationId` on documents and `Jti`). Every poll does a sequential scan, which gets slower as the tables grow. That is why the app is "sometimes" slow and gets worse over time.

### 1.4 Remote, serverless database

Every round trip goes over the internet to Neon. With about 7 sequential queries at 30-150 ms each, one request can take up to about a second before any load is added. Neon's autosuspend also adds a cold start of up to a few seconds after an idle period.

### 1.5 Refund screens poll as well

`mobile/lib/providers/refund_providers.dart:21` polls the refund record every 15 s while a refund screen is open, and the first load calls two endpoints (`getRefund` and `getRefundStatus`). This is smaller than 1.1 but adds up, and it should move to the same push model.

### 1.6 The web dashboard downloads whole tables

`web/src/Admin/department_admin_dashboard.tsx:245-247` loads three lists in parallel every time the page opens:

| Endpoint | Controller | Problem |
|---|---|---|
| `GET /api/verification/tasks/verified` | `VerificationController.cs:360` | Every verified task, no paging, plus `WithApplicationDetailsAsync` for each |
| `GET /api/verification/tasks/pending` | `VerificationController.cs:348` | Every pending task, no paging |
| `GET /api/verification/audit-logs/all` | `VerificationController.cs:567` | The **entire** audit log table, which grows with every action every user takes |

These responses grow every day. With 1000+ daily users the audit log alone gains thousands of rows per day, so this page gets slower every week even if nothing else changes. `AuditLogsController.GetRecent` already has correct pagination (`page`, `pageSize` capped at 100), so the pattern exists and only needs to be applied to the other lists.

The web app also has no client-side cache: each page calls `fetch` directly, so moving between pages refetches the same data (for example `GET /api/services` in both the rule builder and the simulator).

### 1.7 File content lives in entity tables

`SubmissionDocument.Content` and `PaymentReceipt.Content` are `byte[]` columns ([ADR-0010](adr/0010-uploaded-files-stored-in-database.md)). Any query that loads these entities without a projection pulls every file into memory and over the network from Neon. List endpoints must never load them.

### 1.8 No compression, no rate limiting

`Program.cs` has no `UseResponseCompression`, no output caching and no rate limiter. JSON lists are sent uncompressed over mobile networks, and one misbehaving client (or an old app version still polling every 2 s) can use as much capacity as hundreds of normal users.

### 1.9 What this adds up to

Rough numbers for 1000 daily users, assuming about 20% (200) are active at the busiest moment:

| | Today | After phase 1 | After phases 1-4 |
|---|---|---|---|
| Requests per active citizen | about 1 per second | 1 per 30 s | 1 per 30 s, mostly from cache |
| API requests per second at peak | about 200 | about 7 | about 7 |
| Database queries per second at peak | about 1400 (7 per request) | about 50 | under 10 |

This is why the system feels slow at a user count that is small for the hardware: the database is doing roughly 100 times more work than necessary.

---

## 2. Fix plan at a glance

| Phase | Change | Expected effect | Needs new infra? |
|---|---|---|---|
| 1 | One polling timer, slower, only when visible and in the foreground. Web: shared cached fetch client | Around 80-90% fewer requests | No |
| 2 | Indexes on hot columns, no writes in GETs, `AsNoTracking`, pagination on every list, never load file blobs in lists | Each request becomes several times faster and stays fast as data grows | No |
| 3 | SignalR push when an officer decides | Instant updates, and polling becomes a slow fallback | No |
| 4 | Redis: token revocation, reference data cache, per-citizen cache, SignalR backplane | Fewer DB round trips per request, and horizontal scaling becomes possible | **Yes, Redis** |
| 5 | Neon pooler, region, autosuspend, response compression | Lower latency, no cold starts | Config only |

> Redis is phase 4 on purpose. Adding a cache in front of a polling storm hides the problem without removing it. Phases 1-2 fix the cause, and Redis then keeps the system fast as you grow.

---

## 3. Phase 1 - Stop the polling storm

### 3.1 Keep a single timer, owned by the provider

Remove the timers in `applications_tab.dart` and `verification_detail_screen.dart`. Keep one timer in `myApplicationsProvider`, slow it down, and pause it when the app is in the background:

```dart
// mobile/lib/providers/application_providers.dart
@Riverpod(keepAlive: true)
Future<List<ApplicationItemModel>> myApplications(Ref ref) async {
  final token = ref.watch(authTokenProvider);
  if (token.isEmpty) return const [];

  // Fallback poll only. Real-time updates come from SignalR (phase 3).
  final timer = Timer.periodic(const Duration(seconds: 30), (_) {
    final state = WidgetsBinding.instance.lifecycleState;
    if (state == AppLifecycleState.resumed) ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  return VerificationApiService.fetchApplications(token: token);
}
```

Screens that want fresh data when they open should call `ref.invalidate(myApplicationsProvider)` **once** in `initState`, not on a timer. Pull-to-refresh stays as it is.

### 3.2 Do not flash a loading state on background refresh

Screens should render `ref.watch(myApplicationsProvider).value` (the previous data) while a refresh is in flight. `verification_detail_screen.dart` already does this with `isLoading && !hasValue`. Apply the same pattern anywhere a spinner replaces the list.

### 3.3 Timeouts

`fetchApplications` uses a 4 s timeout. When the server is under load this makes requests fail and retry, which adds load. Raise it to 10-15 s once polling is slower.

### 3.4 Refund polling

Change `_pollInterval` in `refund_providers.dart` to 60 s and skip the tick when the app is not in the foreground (same check as 3.1). In phase 3 the refund decision paths send a push, so this becomes a fallback only.

### 3.5 Web: one shared, cached fetch client

Add [TanStack Query](https://tanstack.com/query) (`@tanstack/react-query`) and route every GET through it:

```tsx
// web/src/main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,           // reuse data for 1 minute across pages
      refetchOnWindowFocus: false, // no refetch storm when switching tabs
      retry: 1,
    },
  },
});
```

```tsx
// Example: the service list is fetched once and shared by every page that needs it
const { data: services } = useQuery({
  queryKey: ['services'],
  queryFn: () => api.get('/api/services').then(r => r.data),
  staleTime: 10 * 60_000, // reference data changes rarely
});
```

While doing this, replace the hard-coded `http://localhost:5119` in each page with one `axios` instance (`baseURL` from `import.meta.env.VITE_API_BASE`) that adds the `Authorization` header. This makes caching, timeouts and retries consistent across the whole dashboard.

---

## 4. Phase 2 - Indexes and query fixes

### 4.1 Add indexes

Migrations are gitignored and schema changes are applied as idempotent SQL on startup ([ADR-0005](adr/0005-auto-apply-migrations-on-startup.md)), so add them to the `ExecuteSqlRaw` block in `Program.cs`:

```sql
CREATE INDEX IF NOT EXISTS "IX_VerificationTasks_CitizenNic_CreatedDate"
    ON "VerificationTasks" ("CitizenNic", "CreatedDate" DESC);
CREATE INDEX IF NOT EXISTS "IX_VerificationTasks_ApplicationId"
    ON "VerificationTasks" ("ApplicationId");
CREATE INDEX IF NOT EXISTS "IX_VerificationTasks_Department_Status"
    ON "VerificationTasks" ("Department", "Status");
CREATE INDEX IF NOT EXISTS "IX_ApplicationSubmissions_CitizenNic"
    ON "ApplicationSubmissions" ("CitizenNic");
CREATE INDEX IF NOT EXISTS "IX_Payments_ApplicationId"
    ON "Payments" ("ApplicationId");
CREATE INDEX IF NOT EXISTS "IX_AuditLogs_ApplicationId"
    ON "AuditLogs" ("ApplicationId");
```

Mirror them in `AppDbContext.OnModelCreating` with `HasIndex(...)` so a future migration does not drop them.

To confirm an index is used, run this in the Neon SQL editor:

```sql
EXPLAIN ANALYZE
SELECT * FROM "VerificationTasks"
WHERE "CitizenNic" = '200012345678' ORDER BY "CreatedDate" DESC;
```

You should see `Index Scan using IX_VerificationTasks_CitizenNic_CreatedDate` instead of `Seq Scan`.

### 4.2 Move the write out of the GET

The "reset approved tasks with no review back to Pending" repair in `GetTasksForCitizenAsync` is a data fix, not a read. Run it once on startup (next to the existing orphan-task cleanup in `Program.cs`) or in `InstallmentMonitorService`-style background work, and make the GET read-only.

### 4.3 Read-only queries

Add `.AsNoTracking()` to every query in `GetMyApplications` and the other list endpoints. EF Core then skips change tracking, which saves CPU and memory on every row.

### 4.4 Load only what the response uses

`GetMyApplications` loads full templates with all `Fields`, and full `FeeSchedules`, for every poll. Project to the fields the mobile card actually shows with `.Select(...)` instead of `.Include(...)`. The template and fee data is reference data, so it moves to Redis in phase 4.

### 4.5 Paginate every list endpoint

Apply the pattern from `AuditLogsController.GetRecent` to `tasks/pending`, `tasks/verified`, `audit-logs/all` and any other endpoint that returns a whole table:

```csharp
[HttpGet("tasks/pending")]
public async Task<IActionResult> GetPendingTasks([FromQuery] int page = 1, [FromQuery] int pageSize = 25)
{
    if (page < 1) page = 1;
    if (pageSize < 1 || pageSize > 100) pageSize = 25;

    var query = _context.VerificationTasks.AsNoTracking()
        .Where(t => t.Status == "Pending" && (deptScope == null || t.Department == deptScope));

    var total = await query.CountAsync();
    var items = await query
        .OrderByDescending(t => t.CreatedDate)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(t => new TaskListItemDto { /* only the columns the table shows */ })
        .ToListAsync();

    return Ok(new { items, total, page, pageSize });
}
```

- The dashboard summary cards need **counts**, not rows. Add a small `GET /api/verification/tasks/summary` that returns `COUNT(*)` grouped by status, instead of downloading every task to count them in the browser.
- `WithApplicationDetailsAsync` should run one query for the whole page (`WHERE "ApplicationId" IN (...)`), not one per task.
- For very large tables such as audit logs, keyset pagination (`WHERE "Id" < @lastId ORDER BY "Id" DESC LIMIT 50`) stays fast on page 500 where `Skip` does not.

The web tables then pass `page` and `pageSize` and show a pager, which Carbon's `DataTable` and `Pagination` components already support.

### 4.6 Never load file content in lists

Any query that returns documents or receipts in a list must project without `Content`:

```csharp
.Select(d => new { d.Id, d.FileName, d.ContentType, d.UploadedAt })
```

Only the download endpoint for a single file should read `Content`. The long-term fix is to move files to object storage (S3, Azure Blob, Cloudflare R2) and keep only a key in PostgreSQL, as noted in ADR-0010.

### 4.7 Rate limiting

> **As built:** the default is 120 requests per minute (one officer dashboard load fires several calls at once), configurable with `RATE_LIMIT_PER_MINUTE`. Hub connections are not counted.

Add the built-in ASP.NET Core rate limiter so an old app build or a buggy client cannot overload the API:

```csharp
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.User.FindFirst("nicNumber")?.Value
                ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1) }));
});
...
app.UseRateLimiter(); // after UseAuthentication
```

60 requests per minute per user is far above normal use after phase 1 and well below what the current 1-per-second polling sends.

---

## 5. Phase 3 - Push updates with SignalR

Instead of each phone asking "has anything changed?" every few seconds, the server tells the one citizen whose application changed.

### 5.1 Backend

SignalR ships with ASP.NET Core, so no package is needed for a single instance.

```csharp
// backend/src/Hubs/ApplicationHub.cs
[Authorize]
public class ApplicationHub : Hub { }

// backend/src/Hubs/NicUserIdProvider.cs
// Routes Clients.User(nic) to every connection of that citizen.
public class NicUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) =>
        connection.User?.FindFirst("nicNumber")?.Value;
}
```

```csharp
// Program.cs
builder.Services.AddSignalR();
builder.Services.AddSingleton<IUserIdProvider, NicUserIdProvider>();
...
app.MapHub<ApplicationHub>("/hubs/applications");
```

WebSockets cannot send an `Authorization` header, so SignalR sends the token as `?access_token=`. Extend the existing `OnMessageReceived` handler in `Program.cs`:

```csharp
var hubToken = context.Request.Query["access_token"];
if (!string.IsNullOrEmpty(hubToken) && path.StartsWithSegments("/hubs"))
{
    context.Token = hubToken;
}
```

### 5.2 Notify on every write that changes what a citizen sees

> **As built:** instead of calling a helper from each write path, an EF Core interceptor (`Data/Interceptors/CitizenChangeInterceptor.cs`) sees every `SaveChanges` and does the invalidation and push after commit. See [10.3](#103-deviations-from-the-plan).

After the transaction commits, notify the citizen. For example, in `VerificationService.RecordDecisionAsync`:

```csharp
await transaction.CommitAsync();
if (!string.IsNullOrEmpty(task.CitizenNic))
{
    await _hub.Clients.User(task.CitizenNic)
        .SendAsync("applicationUpdated", task.ApplicationId);
}
```

Every write path that changes a citizen's view needs this call (and, in phase 4, a cache invalidation). Put both in one helper, for example `ICitizenChangeNotifier.ApplicationChangedAsync(nic, applicationId)`, so they cannot drift apart. Known write paths:

- `VerificationService.RecordDecisionAsync` and the bulk-verify path
- Stage advancement to the next department ([ADR-0009](adr/0009-multi-stage-department-workflow.md))
- `PaymentsController` verify and status update
- Installment plan payments, reminders and transfer rejection
- Refund decisions
- `NotificationService` when it creates a `CitizenNotification`

### 5.3 Mobile

Add the [`signalr_netcore`](https://pub.dev/packages/signalr_netcore) package and connect after sign-in:

```dart
final hub = HubConnectionBuilder()
    .withUrl('$apiBase/hubs/applications',
        options: HttpConnectionOptions(accessTokenFactory: () async => token))
    .withAutomaticReconnect()
    .build();

hub.on('applicationUpdated', (_) {
  ref.invalidate(myApplicationsProvider);
  ref.invalidate(notificationsProvider);
});
await hub.start();
```

Stop the connection on sign-out and when the app goes to the background. The 30 s fallback poll from phase 1 covers missed messages.

### 5.4 Web (officers)

> **As built:** all staff join one `officers` group and receive `queueUpdated`. Department names are matched loosely in this codebase, so exact per-department groups would miss officers. The browser debounces the message and refetches only the page on screen.

The officer queues can use the same pattern with `@microsoft/signalr`, with a group per department (`Groups.AddToGroupAsync(connectionId, $"dept:{department}")`) so a new submission updates that department's queue without polling. On the message, call `queryClient.invalidateQueries({ queryKey: ['tasks'] })` so only the current page of the table is refetched (see 3.5).

---

## 6. Phase 4 - Redis

### 6.1 What Redis is used for

| Use | Why | Redis feature |
|---|---|---|
| Revoked-token check | Removes one DB round trip from **every** authenticated request | Key with TTL |
| Reference data: services, departments, templates, fee schedules, eligibility rules | Read on almost every screen, changed only by admins | `HybridCache` (memory + Redis) |
| Per-citizen `my-applications` response | Repeat opens and fallback polls are served without the DB | `HybridCache` with tags |
| SignalR backplane | Push keeps working when you run more than one API instance | Redis pub/sub |

What **not** to put in Redis: uploaded documents and receipts (large blobs, see [ADR-0010](adr/0010-uploaded-files-stored-in-database.md), which should move to object storage instead), payment state, and anything that must be transactional with PostgreSQL. PostgreSQL stays the source of truth, and Redis only holds copies that can be rebuilt.

### 6.2 Run Redis

**Local development** (Docker):

```bash
docker run -d --name gsn-redis -p 6379:6379 redis:7-alpine
```

**Hosted:** any managed Redis works, for example Upstash, Redis Cloud, Azure Cache for Redis or AWS ElastiCache. Pick the **same region as the Neon database and the API**. A cache in a different region than the API removes most of the benefit.

For about 1000 users the dataset is small (a few MB), so the smallest paid tier or a free tier is enough.

### 6.3 Configuration

Add to `backend/src/.env.example` and your `.env`:

```bash
# Redis (optional). Leave empty to run with in-memory cache only.
REDIS_URL=localhost:6379
# Hosted example: REDIS_URL=your-host.upstash.io:6379,password=xxxx,ssl=True,abortConnect=False
```

`abortConnect=False` lets the API start even if Redis is down, and it then reconnects in the background.

### 6.4 Packages

```bash
cd backend/src
dotnet add package Microsoft.Extensions.Caching.Hybrid
dotnet add package Microsoft.Extensions.Caching.StackExchangeRedis
dotnet add package Microsoft.AspNetCore.SignalR.StackExchangeRedis
```

### 6.5 Register in `Program.cs`

```csharp
using Microsoft.Extensions.Caching.Hybrid;
using StackExchange.Redis;

var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL");

if (!string.IsNullOrEmpty(redisUrl))
{
    var redis = ConnectionMultiplexer.Connect(redisUrl);
    builder.Services.AddSingleton<IConnectionMultiplexer>(redis);

    // L2 cache for HybridCache
    builder.Services.AddStackExchangeRedisCache(o =>
    {
        o.ConnectionMultiplexerFactory = () => Task.FromResult<IConnectionMultiplexer>(redis);
        o.InstanceName = "gsn:";
    });

    // Lets Clients.User(...) reach connections on any API instance
    builder.Services.AddSignalR().AddStackExchangeRedis(redisUrl, o =>
        o.Configuration.ChannelPrefix = RedisChannel.Literal("gsn-signalr"));
}
else
{
    builder.Services.AddSignalR();
}

builder.Services.AddHybridCache(o =>
{
    o.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(10),          // Redis
        LocalCacheExpiration = TimeSpan.FromSeconds(30) // in-process memory
    };
});
```

`HybridCache` keeps a small in-memory copy on each API instance and a shared copy in Redis. It also prevents a **cache stampede**: if 500 requests miss the same key at once, only one runs the database query and the rest wait for its result. Without Redis configured it runs with the in-memory layer only, so local development works unchanged.

### 6.6 Token revocation in Redis

Replace the database lookup in `OnTokenValidated`. Write-through on logout keeps PostgreSQL as the durable record, and Redis serves the hot path.

```csharp
// AuthService.LogoutAsync - after SaveChangesAsync
if (_redis is not null)
{
    var ttl = expiresAt - DateTime.UtcNow;
    if (ttl > TimeSpan.Zero)
        await _redis.GetDatabase().StringSetAsync($"gsn:revoked:{jti}", "1", ttl);
}
```

```csharp
// Program.cs - OnTokenValidated
var redis = context.HttpContext.RequestServices.GetService<IConnectionMultiplexer>();
bool isRevoked;
try
{
    isRevoked = redis is not null
        ? await redis.GetDatabase().KeyExistsAsync($"gsn:revoked:{jti}")
        : await dbContext.RevokedTokens.AnyAsync(t => t.Jti == jti);
}
catch (RedisException)
{
    // Redis unavailable: fall back to the database so logout still holds.
    isRevoked = await dbContext.RevokedTokens.AnyAsync(t => t.Jti == jti);
}
```

The key expires at the same moment the JWT would, so Redis never needs pruning. On first deploy, copy the existing unexpired rows from `RevokedTokens` into Redis with a one-off startup step, otherwise tokens revoked before the switch would work again.

This is also the right place to close the gap noted in ADR-0001: on officer suspend or password reset, write a `gsn:revoked-user:{userId}:{issuedBefore}` marker and check it here.

### 6.7 Caching reference data

Example for the service catalog (`ServiceCatalogService`):

```csharp
public Task<List<ServiceDto>> GetAllAsync(CancellationToken ct = default) =>
    _cache.GetOrCreateAsync(
        "catalog:services:all",
        async token => await _context.ServiceProcedures
            .AsNoTracking()
            .Select(s => new ServiceDto { /* only fields the clients use */ })
            .ToListAsync(token),
        tags: new[] { "catalog" },
        cancellationToken: ct).AsTask();
```

Invalidate on every admin write to the catalog, templates, fee schedules or eligibility rules:

```csharp
await _context.SaveChangesAsync();
await _cache.RemoveByTagAsync("catalog");
```

Suggested keys and tags:

| Key | Tag | Invalidated by |
|---|---|---|
| `catalog:services:all` | `catalog` | Service create, update or delete |
| `catalog:service:{id}` | `catalog` | Same |
| `departments:all` | `departments` | `DepartmentsController` writes |
| `templates:active:{serviceProcedureId}` | `catalog` | `TemplateController` writes |
| `fees:{serviceProcedureId}` | `catalog` | Fee schedule writes |

### 6.8 Caching a citizen's applications

```csharp
// VerificationController.GetMyApplications
var result = await _cache.GetOrCreateAsync(
    $"citizen:{nic}:applications",
    async token => await BuildMyApplicationsAsync(nic, token),
    new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(5),
        LocalCacheExpiration = TimeSpan.FromSeconds(10)
    },
    tags: new[] { $"citizen:{nic}" });
return Ok(result);
```

Then the `ICitizenChangeNotifier` helper from phase 3 does both steps on every relevant write:

```csharp
public async Task ApplicationChangedAsync(string nic, int applicationId)
{
    await _cache.RemoveByTagAsync($"citizen:{nic}");
    await _hub.Clients.User(nic).SendAsync("applicationUpdated", applicationId);
}
```

**Always invalidate before notifying.** Otherwise the phone refetches and gets the old cached copy.

### 6.9 Known limitation with more than one API instance

`HybridCache` tag invalidation clears Redis and the local memory of the instance that called it. Other instances may serve their in-memory copy until `LocalCacheExpiration` runs out. This is why the per-citizen entry above uses a short 10 s local expiration. If you only run one API instance, this does not apply.

---

## 7. Phase 5 - Neon and HTTP settings

### 7.1 Neon

- **Use the pooled connection string.** In the Neon console, copy the connection string with **Pooled connection** enabled (the host contains `-pooler`). Set it as `DATABASE_URL`.
- **Region:** put the Neon project, the API host and Redis in the same region, as close to your users as possible (for Sri Lanka, `ap-southeast-1` Singapore is the nearest AWS region).
- **Autosuspend:** on production, set the compute to never suspend (or a long suspend timeout) to remove cold starts. Keep autosuspend on for dev branches to save cost.
- **Compute size:** after phases 1-4, the database load should drop sharply. Check the Neon monitoring page before paying for a larger compute.

### 7.2 Npgsql connection pool

Npgsql pools connections by default. With the Neon pooler, set a sensible cap in the connection string builder in `Program.cs`:

```csharp
MaxPoolSize = 50,
Multiplexing = false // Neon's PgBouncer runs in transaction mode
```

### 7.3 Response compression

JSON lists compress well (often 70-90% smaller), which matters most on mobile networks:

```csharp
builder.Services.AddResponseCompression(o => o.EnableForHttps = true);
...
app.UseResponseCompression(); // before MapControllers
```

---

## 8. Measuring the result

Measure before and after each phase so you know which change actually helped.

### 8.1 Request timing

Add request logging to `Program.cs` to see per-endpoint latency in the console:

```csharp
builder.Services.AddHttpLogging(o =>
    o.LoggingFields = HttpLoggingFields.RequestPath | HttpLoggingFields.Duration);
app.UseHttpLogging();
```

### 8.2 Database query count and time

Turn on EF Core command logging temporarily (`"Microsoft.EntityFrameworkCore.Database.Command": "Information"` in `appsettings.json`) and count queries per request. The Neon console's **Monitoring** page shows queries per second and connection count.

### 8.3 Redis hit rate

```bash
redis-cli INFO stats | grep keyspace
```

`keyspace_hits` should be much larger than `keyspace_misses` once the cache is warm.

### 8.4 Load test

Use [k6](https://k6.io) to simulate 1000 citizens. Save as `load/my-applications.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 200 },
    { duration: '3m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: { http_req_duration: ['p(95)<500'] },
};

const BASE = __ENV.API_BASE || 'http://localhost:5119';
const TOKEN = __ENV.CITIZEN_TOKEN;

export default function () {
  const res = http.get(`${BASE}/api/verification/my-applications`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(30); // matches the phase 1 fallback poll
}
```

```bash
k6 run -e CITIZEN_TOKEN=eyJ... load/my-applications.js
```

**Target:** p95 under 500 ms at 1000 virtual users. Run it against a Neon **branch**, never the production database.

### 8.5 Targets per phase

Use these as the "done" check for each PR:

| Metric | Today (expected) | Target |
|---|---|---|
| `my-applications` p95 latency | 1-3 s under load | under 300 ms (under 50 ms from cache) |
| Officer dashboard first load | several seconds, grows over time | under 1 s, constant as data grows |
| DB queries per `my-applications` call | about 7 | 0 on a cache hit, 3-4 on a miss |
| Largest list response | whole table | 100 rows max |
| Status update visible to citizen | up to 4 s (polling) | under 1 s (push) |

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| API fails to start with `RedisConnectionException` | `abortConnect` not set to `False` | Add `abortConnect=False` to `REDIS_URL` |
| Citizen sees an old status after an officer decision | A write path invalidates the cache after notifying, or not at all | Route the write through `ICitizenChangeNotifier` (invalidate first) |
| Admin edits a service but the app shows the old one | Missing `RemoveByTagAsync("catalog")` on that write | Add it after `SaveChangesAsync` |
| SignalR connects then gets `401` | Token not read from `access_token` query for `/hubs` | Extend `OnMessageReceived` as in 5.1 |
| Push works on one API instance but not another | No SignalR backplane | Configure `AddStackExchangeRedis` (6.5) |
| Logged-out token still works after the Redis switch | Existing `RevokedTokens` rows were not copied into Redis | Run the one-off copy step in 6.6 |
| First request after a quiet period takes seconds | Neon autosuspend cold start | Disable autosuspend on production (7.1) |
| Officer dashboard still slow after indexes | A list endpoint still returns the whole table, or loads file `Content` | Paginate (4.5) and project without blobs (4.6) |
| Users get `429 Too Many Requests` | An old app build still polls every 2-4 s | Force an app update, or temporarily raise `PermitLimit` (4.7) |
| `EXPLAIN` still shows `Seq Scan` | Index missing, or the table is tiny and Postgres chose a scan | Check `\di` in the Neon SQL editor. Small tables scanning is normal |
| Every request takes about 200-350 ms locally even on a cache hit | `REDIS_URL` points to a hosted Redis far from your machine | Use local Redis (`docker-compose.redis.yml`) or leave `REDIS_URL` empty for development (10.5) |
| k6 run shows many `429` | All virtual users share one token, so one rate limit bucket | Start the API with `RATE_LIMIT_PER_MINUTE=100000` for the load test |

---

## 10. What was built

### 10.1 By phase

| Phase | Change | Files |
|---|---|---|
| 1 | One 30 s fallback poll, only while the app is in the foreground. Screen timers removed. Refund poll 60 s. Timeout 15 s | `mobile/lib/providers/application_providers.dart`, `refund_providers.dart`, `applications_tab.dart`, `verification_detail_screen.dart`, `verification_api_service.dart` |
| 1 | TanStack Query client, `VITE_API_URL` base, paged helpers | `web/src/main.tsx`, `web/src/utils/queryClient.ts`, `web/src/utils/api.ts`, `web/src/utils/useDebouncedValue.ts` |
| 1 | Route-level code splitting: first load 1.46 MB down to 286 KB (88 KB gzipped) | `web/src/App.tsx` |
| 2 | 11 indexes created on startup and mirrored in the model | `backend/src/Program.cs`, `AppDbContext.cs` |
| 2 | Writes removed from GET endpoints; the repairs run in a background job at startup and every 10 minutes | `Services/DataRepairService.cs`, `VerificationService.cs`, `VerificationController.cs` |
| 2 | `my-applications` moved to a read-only, projected service with a typed DTO | `Services/CitizenApplicationsService.cs`, `DTOs/Responses/MyApplicationDto.cs` |
| 2 | Pagination and search for `tasks/pending`, `tasks/verified`, `audit-logs/all`; new `tasks/summary` and `audit-logs/summary` | `VerificationService.cs`, `VerificationController.cs`, `DTOs/Responses/PagedResult.cs` |
| 2 | Server paging on Verified Records and both Audit Log pages; the department dashboard loads only the newest 100 | `web/src/Officer/verified_record.tsx`, `officer_audit_logs.tsx`, `web/src/Admin/audit_logs.tsx`, `department_admin_dashboard.tsx` |
| 2 | Payment lists no longer load uploaded file bytes | `Controllers/PaymentsController.cs` |
| 2 | Rate limiter | `Program.cs` |
| 3 | SignalR hub, NIC user routing, token from `access_token` | `Hubs/ApplicationHub.cs`, `Hubs/NicUserIdProvider.cs`, `Program.cs` |
| 3 | Change interceptor: invalidate the cache, then push, after commit | `Data/Interceptors/CitizenChangeInterceptor.cs`, `Services/CitizenChangeNotifier.cs` |
| 3 | Mobile realtime connection (stops in the background, catches up on resume) | `mobile/lib/providers/realtime_provider.dart`, `mobile/lib/main.dart` |
| 3 | Web realtime bridge; queue pages refresh live | `web/src/utils/realtime.tsx`, `officer_dashboard.tsx`, `pending_reviews.tsx` |
| 4 | Optional Redis: HybridCache L2 and SignalR backplane | `Program.cs`, `docker-compose.redis.yml` |
| 4 | Revocation check off the database (Redis, or a 30 s local cache without Redis) | `Services/TokenRevocationStore.cs`, `AuthService.cs` |
| 4 | Cached: service catalog (tag `catalog`) and each citizen's applications (tag `citizen:{nic}`) | `ServicesController.cs`, `CitizenApplicationsService.cs`, `Services/CacheKeys.cs` |
| 5 | Npgsql pool cap and keep-alive, Brotli/gzip compression, k6 script, new env settings | `Program.cs`, `load/my-applications.js`, `backend/src/.env.example` |

### 10.2 API contract for list endpoints

- With `?page=` the response is `{ items, total, page, pageSize, totalPages }`. `pageSize` is capped at 100.
- Without `?page=` the response is still a plain array (the shape older pages and app builds expect), capped to the newest 200 rows.
- For tasks, `search` matches an application id (`APP-123` or `123`) or part of a NIC. For audit logs it also matches the action, officer and remarks. `audit-logs/all` also takes `action` (`DELETED`, `APPROVED`, `REJECTED`) and `applicationIds` (comma separated).

### 10.3 Deviations from the plan

The decisions behind these are recorded as [ADR-0012](adr/0012-realtime-push-via-change-interceptor.md) (realtime push), [ADR-0013](adr/0013-hybridcache-with-optional-redis.md) (caching and revocation) and [ADR-0014](adr/0014-paged-list-endpoints-with-capped-fallback.md) (paging). ADR-0001, 0004, 0005 and 0010 carry amendments.

- **Interceptor instead of a hand-called helper.** Any `SaveChanges` that touches `VerificationTask`, `ApplicationSubmission`, `Payment`, `InstallmentPlan`, `Installment`, `CitizenNotification` or `RefundRequest` resolves the affected citizens (plan, then payment, then application, then NIC), clears `citizen:{nic}`, then sends `applicationsChanged` (and `refundUpdated` for refunds). Catalog entities clear the `catalog` tag. Inside a transaction it waits for the commit and drops everything on rollback. Raw SQL and `ExecuteUpdate` bypass it.
- **Message names.** Citizens receive `applicationsChanged` (no payload) and `refundUpdated` (refund ids). Staff receive `queueUpdated`.
- **Revocation without Redis** uses a 30 s in-process cache of "not revoked" answers. A logout on the same instance applies immediately. This assumes a single API instance when Redis is off.
- **Department dashboard** keeps its client-side filters but loads only the newest 100 verified tasks, with totals from `tasks/summary`. Its finance transactions are still hard-coded sample data.

### 10.4 Bug fixed on the way

The schema block in `Program.cs` contained a C# comment (`// ---> NEW BOOKING TIME SLOTS TABLE <---`) inside the SQL string. PostgreSQL rejected the whole batch (`42601: syntax error at or near "//"`) on every startup since commit `5e73577`. The column additions, department seeding and orphan-task cleanup after it never ran. It is now a SQL comment (`--`).

### 10.5 Verified, and still to check

Checked against the real database on 2026-09-29: all indexes are created, the paged endpoints and summaries return correct envelopes, and `my-applications` returns the same JSON fields as before. Brotli shrinks that response by about 60%, and a cache hit is served without the database. Citizens and staff connect to the hub over WebSockets, and a bad token is rejected.

Not checked live, because it needs a real write: the push after an officer decision. To confirm it, open an application in the citizen app, approve its task on the web, and the status should change within about a second without pull-to-refresh.

**Local development note:** the `REDIS_URL` in the current `.env` points to a hosted Upstash instance about 180 ms away from a local machine, so every cache read and revocation check pays that round trip. For local work, run `docker compose -f docker-compose.redis.yml up -d` and use `REDIS_URL=localhost:6379`, or leave it empty. In production, keep Redis in the same region as the API.