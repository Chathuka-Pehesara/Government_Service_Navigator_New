# ADR-0006: Application Templates link to a Service Catalog entry via an optional FK

## Context

`Template` (the officer-built dynamic application form — `web/src/Officer/Application_create/TemplateBuilder.tsx`) and `ServiceProcedure` (the Service Catalog entry, with its `EligibilityRule`/`DocumentRequirement`/`FeeSchedule` children) were built as two completely disconnected features. An officer building a template had no way to see, at build time, which documents or fees the citizen would actually need for the service that template represents — that information only existed in the separate Service Catalog admin pages.

## Options Considered

1. **Required FK** (`Template.ServiceProcedureId` non-nullable). Every template must be tied to exactly one service. Simpler mental model, but breaks every existing template (there were already templates in the database with no such concept — `dotnet ef migrations add` would need a backfill strategy or a default value), and forces a service to exist before any template can be created even for exploratory/draft form-building.
2. **Optional (nullable) FK**, `OnDelete(DeleteBehavior.SetNull)`. A template *may* reference a `ServiceProcedure`; deleting the referenced service un-links the template rather than deleting it or blocking the delete.

## Decision

Option 2. `Template.ServiceProcedureId` is `int?`, configured in `AppDbContext.OnModelCreating` with `.OnDelete(DeleteBehavior.SetNull)`. The template builder's UI added a "Linked Service Catalog Entry (Optional)" dropdown that, once set, shows the linked service's eligibility rules, required documents, and fees alongside the builder as reference — informational only, it does not auto-generate form fields from that data.

## Consequences

- Backward compatible: existing templates (`ServiceProcedureId = NULL`) needed no data migration and continue to work exactly as before.
- A service being deleted (`DELETE /api/services/{id}`, which is a soft "retire," not a hard delete — see `docs/api.md`) doesn't orphan or cascade-delete any templates that referenced it; they just lose the link and stop showing reference info.
- The link is purely descriptive today — nothing enforces that a template's *fields* actually match its linked service's document requirements, and nothing prevents linking a template to a service outside the officer's own department (the dropdown is scoped to the officer's department per `docs/adr/0004-client-side-department-scoping.md`, but that's a client-side UI convenience, not a constraint the backend enforces).
- `GetAllTemplatesAsync`/`GetTemplateByIdAsync` now `.Include(t => t.ServiceProcedure)`, so every template list/detail response carries the full linked service (including its rules/documents/fees) even when the caller only needed the template's own fields — acceptable at current data volumes, worth revisiting (e.g. a lighter summary DTO) if the catalog or template count grows significantly.

The link is **no longer purely descriptive**. It's now how a citizen's form is found:
- `GET /api/applications/form/{serviceProcedureId}` serves the active template linked to that service.
- `submit` rejects a `templateId` that isn't linked to the submitted service.

Templates also gained `Department`, `StageOrder` and `StageDescription`, which make each linked template one stage of a multi-department workflow (`docs/adr/0009-multi-stage-department-workflow.md`). The FK stays nullable, but in practice:

- An **unlinked** template is invisible to citizens. It's only usable as a draft in the builder.
- Retiring a service doesn't touch its templates, but the citizen endpoints already `404` for retired services.
- Deleting a service (not possible through the API, since `DELETE` is a soft retire) would `SetNull` the link and strand any in-flight applications, whose later stages are looked up by `ServiceProcedureId` + `StageOrder`.
