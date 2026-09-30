# Architecture Decision Records

Each ADR documents one real decision made in this codebase - the context that forced it, the options actually considered, what was chosen, and the honest trade-offs accepted (including known gaps, not just upsides). They describe the system as built, not the aspirational design in `docs/Government_Service_Navigator_Project_Plan.md`.

| # | Decision |
|---|---|
| [0001](0001-jwt-auth-with-revocation-table.md) | Stateless JWT auth with a database revocation table for logout. *Amended:* the per-request check now reads Redis or a short in-memory cache (0013) |
| [0002](0002-single-project-folder-layering.md) | Single ASP.NET Core project with folder-based layering |
| [0003](0003-separate-user-officer-admin-tables.md) | Separate `User` / `Officer` / `Admin` tables instead of one polymorphic identity table |
| [0004](0004-client-side-department-scoping.md) | Department scoping is enforced client-side, not server-side. *Partially superseded:* verification, finance and refunds are now scoped server-side ⚠️ gap remains for admin, departments, catalog, templates and collection slots |
| [0005](0005-auto-apply-migrations-on-startup.md) | EF Core migrations are applied automatically on API startup. *Amended:* plus idempotent schema SQL, since migrations are gitignored; hot-path indexes; data repairs moved to a background job |
| [0006](0006-optional-template-service-link.md) | Application Templates link to a Service Catalog entry via an optional FK. *Amended:* the link now drives citizen forms and stages |
| [0007](0007-carbon-and-tailwind-together.md) | Carbon Design System components + Tailwind CSS utilities, together |
| [0008](0008-deterministic-in-process-agents.md) | The four agents run in-process and deterministically, with local hashed embeddings in pgvector. *Partially superseded* by 0015: an LLM now reasons over the tools when configured |
| [0009](0009-multi-stage-department-workflow.md) | Multi-department services are modelled as ordered stage templates |
| [0010](0010-uploaded-files-stored-in-database.md) | Uploaded documents and receipts are stored in PostgreSQL as `bytea`. *Amended:* list queries never load the file bytes |
| [0011](0011-stripe-checkout-without-webhooks.md) | Stripe Checkout is confirmed by client polling, not webhooks; manual slips are verified by Finance ⚠️ dev configuration |
| [0012](0012-realtime-push-via-change-interceptor.md) | Realtime updates are pushed over SignalR, triggered by an EF Core change interceptor; polling is only a 30 s fallback |
| [0013](0013-hybridcache-with-optional-redis.md) | HybridCache with optional Redis for the catalog, citizen results and token revocation |
| [0014](0014-paged-list-endpoints-with-capped-fallback.md) | Growing list endpoints are paged, with a capped unpaged fallback for older clients |
| [0015](0015-groq-llm-over-deterministic-agents.md) | A Groq-hosted LLM reasons over the deterministic agent tools, falling back to the deterministic answer when it is off or fails |
| [0016](0016-container-on-azure-app-service-web-on-vercel.md) | The API ships as one Docker image on Azure App Service, deployed by GitHub Actions; the web dashboard is on Vercel |

New ADRs should follow the same template (Context / Options Considered / Decision / Consequences) and be numbered sequentially.
