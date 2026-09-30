# Government Service Navigator (GSN)

Government Service Navigator helps citizens find, apply for, pay for and track Sri Lankan government services, and gives officers one place to review and decide those applications. It was built as an SE3090 group project.

A citizen describes what they need in plain language. AI agents match it to a service, check eligibility and documents, and prepare the case. Officers in the relevant department review it, and the citizen follows every step live in the mobile app, then books a time to collect the result.

**Release:** v2.0.0 · **API:** `https://gsn-api-dpa2agb6c5h7gyar.southeastasia-01.azurewebsites.net` · **License:** MIT

| Piece | Built with | Used by |
|---|---|---|
| **Backend API** (`backend/`) | ASP.NET Core on .NET 10, EF Core, PostgreSQL (Neon), SignalR, optional Redis | Everything below |
| **Agentic AI** (`agentic-ai/`) | C# class library compiled into the API, pgvector, optional Groq LLM | The API |
| **Web dashboard** (`web/`) | React 19, TypeScript, Vite, Carbon Design System, Tailwind, TanStack Query; also an Electron desktop app | Verifying Officers, Finance Officers, Department Admins, System Admins |
| **Mobile app** (`mobile/`) | Flutter, Riverpod | Citizens |

---

## Features

**Citizens (mobile app)**
- Describe a need in plain language and get a matched service, a document list and a step-by-step plan
- Search and filter services, run an eligibility self-check with an AI document inspector
- Fill in multi-stage application forms, upload documents, save drafts
- Pay stage fees by card (Stripe), bank deposit slip or installment plan, and request refunds
- Follow application status in real time, with in-app notifications and email
- Book a collection appointment in plain language ("next Tuesday morning"), reschedule it, or ask for postal delivery

**Officers and administrators (web dashboard and desktop app)**
- **Verifying Officer:** department queue, verification workspace with the citizen's answers, documents and AI draft, AI case dossier and decision order, approve / reject / request revision, bulk verification, rejection codes, verified records, audit logs
- **Finance Officer:** deposit slip verification, online payments, payment ledger, refunds, installment plans
- **Department Admin:** service catalog, eligibility rule builder and simulator, application form templates, collection slots with a daily timeline and holidays, officer management, analytics and anomaly review
- **System Admin:** departments (a department needs a Verifying Officer and a Finance Officer before it can go active), officers across all departments, system settings

**The four agents** (`docs/diagrams/agentic-ai-architecture.md`)

| Agent | Job |
|---|---|
| 1 Intake & Planning | Turns the citizen's request into a matched service and plan |
| 2 Eligibility & Documents | Checks eligibility rules and required documents against the uploads |
| 3 Action / Tool | Prefills the application, calculates the fee, proposes and books appointment slots |
| 4 Validation & Safety | Blocks invalid, duplicate or adversarial submissions before they reach an officer, and briefs the officer |

Every agent runs deterministic tools first. When `GROQ_API_KEY` is set, a Groq-hosted LLM reasons over the tool results; without it, the agents still work on the tools alone. An officer makes every decision on an application.

---

## Repository structure

```text
Government_Service_Navigator/
├── backend/src/                 # ASP.NET Core Web API (single project, folder layering)
│   ├── Controllers/             # Auth, Admin, Departments, Services, Templates, Applications, Verification,
│   │                            # Payments, InstallmentPlans, Refunds, Notifications, AuditLogs, Analytics,
│   │                            # Anomalies, CollectionSlots, the four agent controllers, RagSetup
│   ├── Services/                # Business logic, background jobs, email templates, cache and realtime helpers
│   ├── Validation/              # Shared request rules (NIC, phone, email, password, money, ...)
│   ├── Models/Entities/  DTOs/  Data/  Hubs/
│   ├── Data/KnowledgeDocuments/ # Policy documents ingested into the vector database
│   ├── Program.cs               # DI, auth, caching, rate limiting, schema setup
│   └── .env.example             # Environment variables
├── agentic-ai/                  # agents/, tools/, orchestration/, schemas/, services/ (Groq), tests/
├── web/                         # React dashboard + Electron shell (electron/main.cjs)
├── mobile/                      # Flutter citizen app
├── docs/                        # Architecture, API reference, hosting, diagrams, ADRs (start at docs/README.md)
├── load/                        # k6 load test
├── tui-runner/                  # Split-pane terminal runner for local development
├── install/install.ps1          # Windows desktop app installer
├── Dockerfile  .dockerignore    # API + agents image
├── docker-compose.redis.yml     # Optional local Redis
└── launch.bat / launch.command  # Double-click launchers for tui-runner
```

---

## Prerequisites

- [.NET SDK 10](https://dotnet.microsoft.com/download) (the backend targets `net10.0`)
- [Node.js 20+](https://nodejs.org/) for `web/` and `tui-runner/`
- [Flutter SDK](https://docs.flutter.dev/get-started/install) (Dart 3.12+) for the mobile app
- PostgreSQL for the app database: a local install or a [Neon](https://neon.tech/) project
- PostgreSQL with the `pgvector` extension for the agents' knowledge base
- Optional: Docker (for Redis or the API image), a Groq API key, a Stripe test key, SMTP credentials

---

## Quick start

### 1. Configure the backend

```bash
cd backend/src
cp .env.example .env
```

Fill in `.env`. The essentials:

| Variable | Needed for |
|---|---|
| `DATABASE_URL` (or all of `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) | The app database. Startup fails without one of them. With Neon, use the pooled connection string |
| `JWT_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE` | Sign-in. Without `JWT_KEY` no token is accepted |
| `GROQ_API_KEY`, `GROQ_MODEL` | Optional LLM reasoning for the agents |
| `STRIPE_SECRET_KEY` | Card payments (use a `sk_test_...` key) |
| `SMTP_*` | Email notifications |
| `REDIS_URL` | Optional shared cache (needed only for more than one API instance) |
| `BANK_NAME`, `BANK_BRANCH`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER` | Bank details shown for installment transfers |

The vector database connection string is `ConnectionStrings:VectorDb` in `backend/src/appsettings.json` (or the `ConnectionStrings__VectorDb` environment variable). Never commit real secrets; `.env` is gitignored.

The full list is in `docs/diagrams/system-architecture.md#configuration`.

### 2. Run everything with the terminal runner (recommended)

```bash
cd tui-runner
npm install
npm start
```

Or double-click `launch.bat` (Windows) / `launch.command` (macOS). It frees ports 5119 and 5173, runs the API (`dotnet run` in `backend/src`) and the web dev server (`npm run dev` in `web`), and offers to launch the Flutter app on an emulator. `Tab` switches panes; `q` or `Ctrl+C` stops everything.

### 3. Or run each piece yourself

**API** - `http://localhost:5119`, Swagger at `/swagger` in Development:

```bash
cd backend/src
dotnet run
```

On startup the API applies migrations and idempotent schema SQL, so a fresh database is set up automatically, and it seeds the initial departments. Then load the agents' knowledge base once:

```bash
curl -X POST http://localhost:5119/api/RagSetup/seed
curl -X POST http://localhost:5119/api/RagSetup/seed-action-agent
curl -X POST http://localhost:5119/api/RagSetup/ingest-local-documents
```

Re-run these after changing services, fees or templates.

**Web dashboard** - `http://localhost:5173`:

```bash
cd web
npm install
npm run dev
```

`npm run dev` reads the API address from `web/.env` (`BASE_URL=http://localhost:5119`). Production builds (`npm run build`) read `web/.env.production`, which points at the hosted API.

**Mobile app:**

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_URL=http://localhost:5119
```

Without `--dart-define` the app uses the hosted API. On the Android emulator use `http://10.0.2.2:5119`; on a phone, use your computer's LAN IP and allow port 5119 through the firewall.

**Redis (optional):**

```bash
docker compose -f docker-compose.redis.yml up -d
# then set REDIS_URL=localhost:6379 in backend/src/.env
```

### Accounts

- **Citizens** register in the mobile app with their NIC.
- **The first System Admin** is a row in the `Admins` table; add one directly in the database with a BCrypt password hash. System Admins then create departments and officers from the web dashboard.
- **Officers** sign in at `/officer/login`, and the dashboard opens the pages for their role and department.

---

## Install the desktop app (Windows)

Staff can install the web dashboard as a Windows app. The command downloads the latest installer from [GitHub Releases](https://github.com/Goverment-Service/Government_Service_Navigator/releases) and installs it for the current user without admin rights. Running it again updates to the newest version.

```powershell
irm https://raw.githubusercontent.com/Goverment-Service/Government_Service_Navigator/main/install/install.ps1 | iex
```

From CMD:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Goverment-Service/Government_Service_Navigator/main/install/install.ps1 | iex"
```

Then open **Government Service Navigator** from the Start menu. The desktop app uses the hosted API. The installer isn't code-signed yet, so Windows SmartScreen may show a warning.

---

## Hosting

| Piece | Where |
|---|---|
| API + agents | One Docker image (root `Dockerfile`) on Azure App Service `gsn-api`, from the private registry `gsnacr` |
| Web dashboard | Vercel, from `web/` (`vercel.json` sends every route to `index.html`) |
| App database | Neon PostgreSQL |
| Desktop app | GitHub Releases, built when a `v*` tag is pushed |

Every push to `main` that touches `backend/`, `agentic-ai/` or the Dockerfile builds and deploys a new image (`.github/workflows/main_gsn-api.yml`). Setup, app settings and rollback are in [`docs/azure-hosting.md`](docs/azure-hosting.md).

---

## Testing

```bash
# Agent unit tests (xUnit, offline: fakes for the database, vector store and LLM)
dotnet test agentic-ai/AgenticAi.csproj

# Mobile widget tests
cd mobile && flutter test

# Web lint and type check
cd web && npm run lint && npx tsc --noEmit
```

- `GET /api/ValidationAgent/evaluation/golden-cases` runs four golden cases against the live Validation & Safety agent: a valid application, a malformed NIC, a missing document and a prompt injection.
- `load/my-applications.js` is a k6 load test that ramps up to 1000 virtual users (see `docs/performance-and-redis.md`).
- The backend has no test project yet.

---

## CI/CD

GitHub Actions in `.github/workflows/`:

| Workflow | What it does |
|---|---|
| `backend-ci.yml` | Restores and builds the API when `backend/` changes |
| `agentic-ai.yml` | Builds and checks the agent project structure when `agentic-ai/` changes |
| `web-ci.yml` | Lint, type check, build and upload `web/dist` when `web/` changes |
| `mobile-ci.yml` | `flutter pub get` and `flutter analyze` when `mobile/` changes |
| `main_gsn-api.yml` | Builds the Docker image, pushes it to Azure Container Registry and deploys it to App Service |
| `build-android.yml`, `ios-build.yml` | Mobile app builds |
| `windows-software-build.yml`, `mac-build.yml`, `linux-build.yml` | Desktop app builds; the Windows build publishes a release on `v*` tags |

---

## Documentation

Everything is in [`docs/`](docs/README.md):

- [System architecture](docs/diagrams/system-architecture.md) - components, request flow, configuration, what is actually enforced
- [API reference](docs/api.md) - every endpoint, with auth, shapes, validation and side effects
- [Agentic AI architecture](docs/diagrams/agentic-ai-architecture.md), [end-to-end workflow](docs/diagrams/end-to-end-workflow.md), [human-in-the-loop](docs/diagrams/human-in-the-loop-workflow.md), [ER diagram](docs/diagrams/er-diagram.md)
- [Architecture Decision Records](docs/adr/README.md) - 16 decisions
- [Hosting](docs/azure-hosting.md) and [performance and Redis](docs/performance-and-redis.md)
- Release notes: [`.github/release-notes/v2.0.0.md`](.github/release-notes/v2.0.0.md)

---

## Known limitations

These are documented in detail in `docs/api.md` and the diagram docs:

- Several endpoint groups have no authentication: officer and department management, the service catalog, templates, the agent endpoints and the RAG setup. Department scoping for them is only done in the web UI (ADR-0004).
- Collection appointments are confirmed by the booking agent without an officer.
- Stripe payments are confirmed by the app polling Stripe; there is no webhook, and the return URLs are placeholders (ADR-0011).
- CORS allows any origin.
- With `GROQ_API_KEY` set, citizen details are sent to Groq.

---

## Troubleshooting

| Problem | Check |
|---|---|
| API won't start: "required database environment variables are missing" | Set `DATABASE_URL`, or all five `DB_*` variables, in `backend/src/.env` |
| Every request returns `401` | `JWT_KEY` is missing, or the API restarted with a new key; sign in again |
| `429 Too Many Requests` | The per-user limit (`RATE_LIMIT_PER_MINUTE`, default 120) was hit; raise it for load tests |
| Agents answer "Service Not Found" for everything | The knowledge base is empty; run the three `RagSetup` requests above |
| Agent answers are plain and repetitive | `GROQ_API_KEY` isn't set, so the agents use their deterministic answers |
| Web dashboard calls the wrong API | Check `BASE_URL` in `web/.env` (dev) or `web/.env.production` (build), then restart Vite |
| Mobile app can't reach a local API | Pass `--dart-define=API_URL=...`: `10.0.2.2` on the Android emulator, your LAN IP on a phone |
| Refreshing a page on the hosted web returns `404` | `web/vercel.json` must be deployed with the site |
| `tui-runner` says a port is in use | Stop whatever holds 5119 or 5173 and run `npm start` again |

---

## License

This project is licensed under the [MIT License](LICENSE) - Copyright (c) 2026 Krishmal2004.
