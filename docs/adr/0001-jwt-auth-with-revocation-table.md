# ADR-0001: Stateless JWT auth with a database revocation table for logout

## Context

All three actor types (`User`, `Officer`, `Admin`) authenticate via HMAC-SHA256-signed JWTs (`AuthService.GenerateJwtToken*`), issued with a 7-day expiry and validated by ASP.NET Core's standard `AddJwtBearer` pipeline (`Program.cs`). Stateless JWTs have no server-side session to destroy, so a naive "logout" endpoint can only ever be a client-side `localStorage.removeItem` - the token itself stays valid until it expires naturally, even after the user has "logged out." That was in fact the original implementation: `POST /api/auth/logout` was an unauthenticated no-op that returned `{ success: true }` regardless of what was sent.

This is a real problem for this app specifically: officer/admin accounts can be suspended (`PATCH /api/admin/officers/{id}/suspend`) or have passwords reset, but a token issued before that action would keep working for up to 7 more days with no way to revoke it.

## Options Considered

1. **Leave logout as a client-only no-op.** Zero backend cost, but a "logged out" or suspended account's token stays valid for up to 7 days - unacceptable given the suspend/reset-password features already exist.
2. **Short-lived access tokens + refresh tokens.** The standard fix, but a larger change (refresh endpoint, refresh-token storage/rotation, client changes to silently refresh) than the problem currently warrants for a 3-client coursework project.
3. **Revocation (blacklist) table, checked on every request.** Store each revoked token's `jti` (JWT ID claim) and natural expiry in a `RevokedTokens` table; reject any request whose `jti` is in that table via a custom `OnTokenValidated` event; prune expired entries opportunistically on each logout call so the table doesn't grow unbounded.

## Decision

Option 3. `AuthController.Logout` is now `[Authorize]`-protected, reads the caller's `jti`/`exp` claims from the already-validated token, and calls `AuthService.LogoutAsync` to insert a `RevokedToken` row. `Program.cs`'s `JwtBearerEvents.OnTokenValidated` looks up the incoming token's `jti` against that table on every authenticated request and calls `context.Fail(...)` if it's revoked.

## Consequences

- Every authenticated request now does one extra indexed lookup (`RevokedTokens` has a unique index on `Jti`) - negligible for this app's traffic, but it does mean auth is no longer fully stateless/cache-friendly.
- Suspending an officer or resetting a password still doesn't revoke their *existing* tokens automatically - only an explicit logout does. A more complete fix would revoke all of a user's outstanding tokens on suspend/password-reset too; that's not implemented yet.
- The frontend must actually send `Authorization: Bearer <token>` on the logout call for this to do anything. Historically, only 2 of ~16 logout call-sites did; all of them now do (see the `handleLogout` implementations across `web/src/Admin/**` and `web/src/Officer/**`).
- This does not replace proper short-lived-token/refresh-token hygiene if the project grows past coursework scope - it's a targeted fix for "logout should actually mean something," not a general session-management redesign.

## Amended: the check no longer hits the database on every request

At 1000+ daily users the extra lookup was no longer negligible: it was one Neon round trip (30-150 ms) added to every authenticated request. The check now goes through `Services/TokenRevocationStore.cs` (ADR-0013):

- **With `REDIS_URL`:** logout writes `gsn:revoked:{jti}` to Redis with a TTL equal to the token's remaining lifetime, so Redis never needs pruning. Every request checks that key. If Redis is unreachable, the check falls back to the `RevokedTokens` table. On startup, unexpired rows from the table are copied into Redis so tokens revoked before Redis was enabled stay revoked.
- **Without Redis:** "not revoked" answers are cached in memory for 30 s and "revoked" answers for 24 h. A logout on the same instance takes effect immediately; with several instances and no Redis, another instance can accept the token for up to 30 s.

The `RevokedTokens` table is still written first on every logout and remains the durable record. An `ExpiresAt` index was added for the pruning query.

The gap above still stands: suspending an officer or resetting a password does not revoke existing tokens.
