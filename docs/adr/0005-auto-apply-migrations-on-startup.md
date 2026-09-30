# ADR-0005: EF Core migrations are applied automatically on API startup

## Context

The database schema changes frequently during active development (16 migrations at the time, most recently `AddRevokedTokens` and `AddTemplateServiceProcedureLink`), across a team of four working against one shared/dev PostgreSQL instance (Neon, per `backend/src/.env`'s `DATABASE_URL`). Forgetting to run `dotnet ef database update` after pulling new migrations is a common source of "works on my machine" / 500-errors-on-missing-column friction.

## Options Considered

1. **Manual migration step.** Developers/deployers run `dotnet ef database update` explicitly before starting the API. Standard practice, but easy to forget, and this project's `BackendRun.md` shows it was already a documented-but-skippable step.
2. **Auto-apply on startup.** Call `context.Database.Migrate()` in `Program.cs` right after building the app, wrapped in a try/catch that logs but doesn't crash the process on failure.

## Decision

Option 2 (`Program.cs`, step 6: "Automatically Apply Migrations at Startup"). Every `dotnet run` brings the connected database's schema up to date before the app starts serving requests.

## Consequences

- Removes an entire class of "I forgot to migrate" bugs for a small team sharing one dev database - `git pull && dotnet run` is enough.
- The migration failure path is swallowed to a `Console.WriteLine` and the app **still starts** even if migrations failed - meaning the API can come up successfully against a schema that's out of date with the code's expectations, and the first real symptom will be a runtime SQL error on whatever endpoint touches the missing column/table, not a clear startup failure. This is an accepted trade-off for dev convenience, not appropriate as-is for a production deployment with real uptime requirements.
- No safety net for concurrent instances: if this API is ever scaled to more than one running instance, multiple processes could race to apply the same migration on startup simultaneously. EF Core's migration history table provides some protection (it acquires a lock during migration application - visible in the `dotnet ef database update` output as "Acquiring an exclusive lock for migration application"), but this hasn't been tested under real concurrent-instance conditions and isn't a design this ADR is claiming to have solved.
- No rollback strategy: a bad migration is bad in production the moment that instance restarts, with no manual gate to catch it first. Acceptable for coursework/dev; would need a deploy-time migration step (separate from app startup) before this could be called production-ready.

## Migrations no longer cover the whole schema

`backend/src/Migrations/` is now **gitignored** (`.gitignore`), so migrations aren't shared between developers. To keep a fresh or older database working, `Program.cs` runs a block of idempotent SQL after `Migrate()` on every startup (`CREATE TABLE IF NOT EXISTS …`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`). That block creates `AgentDrafts`, `SubmissionDocuments`, `InstallmentPlans`, `Installments`, `PaymentReceipts` and `CitizenNotifications`, and the stage/department columns on `ApplicationSubmissions`, `VerificationTasks`, `Templates` and `ServiceProcedures`.

Consequences on top of the original ones:

- **The schema has two sources of truth.** EF's model snapshot (local to each developer) and the hand-written SQL can drift. A column added to an entity but not to the SQL block works on the machine that generated a migration and fails with a SQL error everywhere else.
- `Migrate()` failures are now logged as a "note" and startup continues to the SQL block, so a broken migration is even less visible than before.
- Startup also mutates data, not just schema:
  - it deletes any `VerificationTask` with `ApplicationId == 0`
  - it **seeds four mock tasks** (application IDs 9088, 9102, 8895, 8850) whenever the task table is empty

  Both would need removing before any production use.
- The vector DB (`VectorDbContext`) isn't migrated at startup at all. Its schema comes from design-time `dotnet ef` against the connection string hardcoded in `VectorDbContextFactory`.

## Amended: a silent failure, indexes and data repairs

- **The schema block had been failing on every startup.** A C# comment (`// ---> NEW BOOKING TIME SLOTS TABLE <---`) sat inside the SQL string, and PostgreSQL rejected the whole batch with `42601: syntax error at or near "//"` from commit `5e73577` onward. Because failures are only logged, nobody noticed: the column additions, the department seeding and the orphan-task cleanup after it never ran. It is now a SQL comment (`--`). This is the risk described above happening in practice, so check the startup log for `An error occurred while migrating the database` after changing this block.
- **Hot-path indexes** (citizen NIC, application id, status and date, audit timestamp, user NIC, revoked token expiry) are created in their own `ExecuteSqlRaw` call **before** the large block, so a mistake in that block cannot skip them. They are mirrored with `HasIndex` in `AppDbContext`, which makes a third place the schema lives.
- **Data repairs left the GET endpoints.** `GetPendingTasksAsync`, `GetTasksForCitizenAsync` and `my-applications` used to write inside the read (resetting "Approved without a review" tasks to `Pending`, and marking unsubmitted stages `Draft`). They now run in `Services/DataRepairService.cs`, a hosted service that starts 15 s after launch and repeats every 10 minutes. It is another place where the running app changes data, alongside the seeding above.

