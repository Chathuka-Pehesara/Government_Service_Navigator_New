# ADR-0016: The API ships as one Docker image on Azure App Service; the web dashboard is on Vercel

## Context

Before hosting, everything ran on developer machines: the API on `http://0.0.0.0:5119`, the web dashboard from `npm run dev`, and the mobile app pointed at `localhost` or `10.0.2.2`. The submission needs live URLs, and the mobile app has to work on a real phone without editing code.

What the API needs from a host:

- **.NET 10** (`net10.0`), which not every managed runtime offers yet.
- **A process that stays up.** `InstallmentMonitorService` (hourly) and `DataRepairService` (every 10 minutes) are hosted services.
- **WebSockets** for the SignalR hub (`/hubs/applications`).
- **One instance migrating at a time.** `Database.Migrate()` and the idempotent schema SQL run on startup (ADR-0005).
- **The RAG source files on disk.** `RagSetupController` reads `Data/KnowledgeDocuments/*.md`, which aren't part of `dotnet publish` output.
- **No local disk state.** Uploads are stored in PostgreSQL (ADR-0010), so an instance can be replaced at any time.

The backend and `agentic-ai/` are one application: the agents are a class library the backend references (ADR-0008).

## Options Considered

1. **Azure App Service, code deploy.** `dotnet publish` to a Linux web app. Simple, but it depends on App Service offering .NET 10 in the region, and the knowledge files need extra publish steps.
2. **Azure Container Apps.** Run a Docker image with scale rules. A good fit, and it was the first plan (`docs/azure-hosting.md` originally described it). It needs a Container Apps environment and its own networking setup.
3. **Azure App Service for Containers (Web App for Containers).** Run the same Docker image on an App Service plan, deployed by the standard `azure/webapps-deploy` action.

For the web dashboard: Vercel (static hosting for the Vite build) or an Azure Static Web App.

## Decision

- **API:** option 3. The root `Dockerfile` builds backend + agentic-ai with the .NET 10 SDK image and runs on the ASP.NET 10 runtime image as the non-root app user. It copies `backend/src/Data/KnowledgeDocuments` into the image and listens on 8080 (`ASPNETCORE_HTTP_PORTS`). `Program.cs` uses that port when `ASPNETCORE_HTTP_PORTS` or `ASPNETCORE_URLS` is set, and 5119 otherwise, so local runs are unchanged.
- **Pipeline:** `.github/workflows/main_gsn-api.yml` runs on pushes to `main` that touch `backend/`, `agentic-ai/`, the Dockerfile or the workflow. It logs in to Azure with OIDC (federated credentials, no stored password), builds the image on the runner, pushes `gsn-api:<sha>` and `:latest` to the private registry `gsnacr`, and deploys the SHA tag to the web app `gsn-api`.
- **Host:** `https://gsn-api-dpa2agb6c5h7gyar.southeastasia-01.azurewebsites.net` (Southeast Asia). The database stays on Neon.
- **Web:** Vercel. `web/.env.production` sets `BASE_URL` to the API, and `web/vercel.json` rewrites every path to `index.html` so client-side routes survive a refresh.
- **Mobile:** `AppConfig` defaults to the hosted API. `--dart-define=API_URL=...` points a build at a local backend.

## Consequences

- One image runs the same way locally (`docker run`), in CI and in Azure, and doesn't depend on which runtimes App Service has installed.
- **The image must stay private.** `appsettings.json` is inside it, and it holds connection strings, including the vector database's, which is the only one the code reads. ASP.NET configuration lets an app setting named `ConnectionStrings__VectorDb` override that value, so the fix is to set it there and remove the credentials from `appsettings.json`.
- **Single instance for now.** The web app has to run one instance with **Always On** (for the hosted services) and **Web sockets** enabled. Scaling out first needs `REDIS_URL` (shared cache, revocation and SignalR backplane, ADR-0013), ARR affinity for SignalR, and migrations moved out of startup.
- **Stripe return URLs are still placeholders** (`https://example.com/...`, ADR-0011), so hosting didn't change how checkout is confirmed.
- **CORS allows any origin.** With the web dashboard on a fixed Vercel domain, CORS could now be narrowed to it.
- Swagger stays off in Azure, because it is only enabled when `ASPNETCORE_ENVIRONMENT=Development`.
- The Windows desktop build (`windows-software-build.yml`) bundles the same web build, so it also calls the hosted API.

The step-by-step setup is in `docs/azure-hosting.md`.
