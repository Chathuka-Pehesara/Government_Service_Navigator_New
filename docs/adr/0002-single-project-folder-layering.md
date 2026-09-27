# ADR-0002: Single ASP.NET Core project with folder-based layering

## Context

The backend needs some separation between HTTP concerns, business logic, persistence, and domain models, but the team is small (4 people, one backend) and working against a 9-week deadline (see `docs/Government_Service_Navigator_Project_Plan.md`). A common alternative in .NET is a "Clean Architecture" style solution split into separate class library projects (e.g. `Domain`, `Application`, `Infrastructure`, `Api`), each with its own `.csproj` and enforced project-reference boundaries.

## Options Considered

1. **Multi-project Clean Architecture.** Strong compiler-enforced boundaries (e.g. `Domain` can't reference `Infrastructure`), better for large teams/long-lived codebases, but adds project-reference ceremony, multiple `.csproj` files to keep in sync, and slower iteration for a team still discovering its own entity shapes week to week.
2. **Single project, folder-based layering.** One `Government_Service_Navigator.Backend.csproj` with `Controllers/`, `Services/` (+ `Services/Interfaces/`), `Models/Entities/`, `DTOs/Requests/` + `DTOs/Responses/`, `Data/Context/`. Layering is a convention (and DI registration in `Program.cs`), not a compiler-enforced boundary.

## Decision

Option 2. `Controllers` depend on `Services/Interfaces` (constructor-injected, e.g. `AdminController(IAdminService adminService)`), `Services` implement those interfaces against `AppDbContext` directly, `DTOs` shape what crosses the HTTP boundary, `Models/Entities` are the EF Core domain/persistence model (and are also returned directly from several endpoints — see Consequences).

## Consequences

- Nothing stops a controller from injecting `AppDbContext` directly and bypassing the service layer, or a DTO from silently drifting out of sync with its entity — there's no compiler enforcement, only convention. In practice this project already blurs the DTO/entity boundary in a few places: `ServicesController.CreateService`/`UpdateService` take a raw `ServiceProcedure` entity as the request body instead of a dedicated DTO, and `GET /api/templates/*` returns `Template` entities (including the EF navigation property `ServiceProcedure`) directly rather than a response DTO.
- Much faster to add a new entity end-to-end (entity → migration → service → controller) with one project to rebuild and no cross-project reference plumbing — appropriate for the pace of a 9-week build with entities still being added late (e.g. `RevokedToken`, the `Template.ServiceProcedureId` link).
- If this project's scope grows well beyond the current four components, the lack of enforced boundaries becomes a bigger liability — a Clean Architecture split (or at least extracting DTOs consistently for every entity that crosses the HTTP boundary) is the natural next step at that point, not a decision to revisit prematurely now.
