# ADR-0003: Separate `User` / `Officer` / `Admin` tables instead of one polymorphic identity table

## Context

The system has three distinct actor types with almost no shared behavior: **citizens** (`User` - the Flutter app's audience, with `NicNumber`), **verifying/department officers** (`Officer` - has `Department`, `Status` for suspend/activate), and **system administrators** (`Admin` - has neither). Each needs email+password login, but the three have materially different fields, different login endpoints (`/api/auth/login`, `/api/auth/officer-login`, `/api/auth/admin-login`), and different management surfaces (only officers can be created/suspended/reset through `AdminController`).

## Options Considered

1. **One `Users` table with a `Role` discriminator column** (or EF Core's Table-Per-Hierarchy inheritance), holding the union of all fields citizens/officers/admins might need, most of them nullable depending on role.
2. **Three separate entities/tables** (`User`, `Officer`, `Admin`), each with only the fields relevant to that actor, three separate `DbSet`s, three separate JWT-issuing code paths, and role-specific DTOs (`UserDto`, `OfficerDto`, `AdminDto`) in `AuthResponse`.

## Decision

Option 2. `AppDbContext` has three separate `DbSet`s, each with a unique index on `Email`; `AuthService` has three parallel `LoginAsync`/`GenerateJwtToken*` methods; `AuthController` exposes three login routes that the frontend tries in sequence (`officer-login`, falling back to `admin-login` - see `officer_login.tsx`).

## Consequences

- No `NULL`-heavy "one big table" with columns that only make sense for one role — `Officer.Department`/`Officer.Status` don't need to exist (as always-null columns) on `User` or `Admin`, and vice versa for `User.NicNumber`.
- Real duplication: the same login/JWT-generation shape is copy-pasted three times in `AuthService.cs` (`GenerateJwtToken`, `GenerateJwtTokenForOfficer`, `GenerateJwtTokenForAdmin` differ only in which claims they add), and three DTOs (`UserDto`/`OfficerDto`/`AdminDto`) all shadow the same `Email`/`Role` fields.
- No foreign-key relationship is possible between, say, an `Officer` and the `AuditLog`/`RevokedToken` rows they generate, since those reference "whoever is logged in" generically (by string ID/claim) rather than a typed FK to one specific table — acceptable here since nothing currently needs to join across actor types, but would need revisiting (likely a shared base identity table with role-specific extension tables) if e.g. a citizen could ever also become an officer, or if cross-actor reporting becomes a requirement.
- `Admin` has no `Name`/`FullName` field at all (only `Email`, `PasswordHash`, `Role`, `CreatedAt`) — a System Admin's display name is always the generic fallback text on the web dashboard (`getDisplayName` in `web/src/utils/currentUser.ts` falls back to email, not a name, since none exists in the database). This was a real, user-reported bug (an inconsistent "who am I logged in as" display across pages) that's now fixed for *consistency*, but the underlying "Admins have no name" gap is a known, accepted limitation, not something this schema choice was designed around.
