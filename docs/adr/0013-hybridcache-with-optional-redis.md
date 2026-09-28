# ADR-0013: HybridCache with optional Redis for reference data, citizen results and token revocation

## Context

After polling was reduced (ADR-0012) and indexes were added, most remaining database work was repeated reads of data that rarely changes:

- The service catalog (`GET /api/services`, `GET /api/services/{id}`) is read on almost every citizen screen and changes only when an admin edits it.
- A citizen's application list is re-read on every app open and every fallback poll, but changes only when an officer, finance or a background job acts on it.
- The revoked-token lookup from ADR-0001 runs on **every** authenticated request, one round trip to Neon each time.

The API runs as one instance today but should be able to run as several without behaving differently.

## Options Considered

1. **No cache; rely on indexes.** Simplest, but each request still pays at least one Neon round trip (30-150 ms) for data that did not change.
2. **`IMemoryCache` only.** Fast and free, but each API instance has its own copy, and invalidating on one instance does not clear the others.
3. **`IDistributedCache` on Redis only.** Shared, but every read is a network round trip, and there is no protection against many requests missing the same key at once.
4. **`HybridCache` (in-process L1 + optional Redis L2).** One API over both layers, tag-based invalidation, and stampede protection (concurrent misses on one key run the factory once). Without Redis it degrades to option 2.

## Decision

Option 4, with Redis optional.

- `Program.cs` registers `AddHybridCache` (defaults: 10 min in Redis, 30 s in memory). When `REDIS_URL` is set it also registers `IConnectionMultiplexer` (`AbortOnConnectFail = false`, so the API starts while Redis is down), `AddStackExchangeRedisCache` as the L2, and the SignalR Redis backplane. When it is empty, everything runs in-process.
- Keys and tags live in `Services/CacheKeys.cs`:

  | Key | Tag | Cleared by |
  |---|---|---|
  | `catalog:services:all`, `catalog:service:{id}` | `catalog` | Any save touching `ServiceProcedure`, `Template`, `FormField`, `FeeSchedule`, `EligibilityRule`, `DocumentRequirement` or `Department` |
  | `citizen:{nic}:applications` (5 min, 10 s in memory) | `citizen:{nic}` | Any save that changes that citizen's tasks, submission, payments, plans, installments, notifications or refunds |

  Invalidation happens in the change interceptor (ADR-0012), always before the realtime push.
- Caching is applied at the **controller GET** for the catalog, not inside `ServiceCatalogService`, so internal callers (RAG seeding, update-then-reload) keep getting live, tracked entities.
- The citizen list moved to `CitizenApplicationsService` returning `MyApplicationDto`. A concrete type is required because anonymous objects cannot be deserialized back out of Redis. The JSON shape is unchanged.
- **Token revocation** moved to `Services/TokenRevocationStore.cs` (amends ADR-0001):
  - With Redis: logout writes `gsn:revoked:{jti}` with a TTL equal to the token's remaining lifetime, and every request checks that key. If Redis throws, the check falls back to the `RevokedTokens` table, so a logout always holds. On startup, unexpired rows are copied into Redis.
  - Without Redis: "not revoked" answers are cached in memory for 30 s and "revoked" answers for 24 h. A logout on the same instance takes effect immediately.
  - PostgreSQL remains the durable record in both cases.

## Consequences

- Repeat catalog reads and citizen list reads are served without the database, and concurrent misses cannot stampede Neon.
- **Redis latency matters more than Redis speed.** An L2 read or revocation check is one network round trip. With Redis in the same region as the API that is about a millisecond; from a developer machine to the hosted Upstash instance it is about 180 ms, which made every local request slower. Local development should use `docker-compose.redis.yml` or leave `REDIS_URL` empty.
- **Multi-instance staleness window.** Tag invalidation clears Redis and the memory of the instance that ran it; other instances can serve their in-memory copy until it expires. That is why the citizen entry keeps only 10 s in memory. Without Redis the revocation cache assumes a single instance: a logout on instance A could be accepted by instance B for up to 30 s.
- Writes that bypass `SaveChanges` (raw SQL, `ExecuteUpdate`) do not invalidate the cache; the entry then lives until its expiry (at most 5 minutes for citizen lists, 10 for the catalog).
- `GET /api/services/{id}` caches "not found" too, until the next catalog write.
- Uploaded files, payment state and anything that must be transactional with PostgreSQL are deliberately **not** cached. Redis only ever holds copies that can be rebuilt.
