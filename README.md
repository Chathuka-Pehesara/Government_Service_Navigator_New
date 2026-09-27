# Government Service Navigator (GSN)

Government Service Navigator is a cross-platform system for delivering and managing digital government services. It was built as an SE3090 group project around four citizen-facing/officer-facing roles - **Citizen**, **Verifying Officer**, **Department Admin**, and **System Admin** - served by three client-facing pieces on top of one shared API:

- **Backend API** - ASP.NET Core (.NET 10) + PostgreSQL, JWT-authenticated
- **Web dashboard** - React 19 + TypeScript + Vite, using the Carbon Design System, for **officers** and **admins**
- **Mobile app** - Flutter, for **citizens** to discover services, self-check eligibility, and browse procedures

> **Status:** the Service Catalog & Eligibility module (Component A), the officer Verification & Compliance workflow (Component C), officer/admin auth and account management, and the officer application-template builder are implemented and working end-to-end. Full citizen-side case tracking (submitted applications, documents, appointments), payments/notifications/analytics, and the four-agent "Agentic AI" workflow described in `docs/Government_Service_Navigator_Project_Plan.md` are **not yet implemented** - see [Roadmap](#roadmap--not-yet-implemented) below.

---

## Repository Structure

```text
Government_Service_Navigator/
├── backend/
│   └── src/                        # Single ASP.NET Core Web API project
│       ├── Controllers/            # Auth, Admin, Template, Services, Verification, WeatherForecast
│       ├── Services/                # Business logic + Services/Interfaces
│       ├── Models/Entities/         # EF Core entities (User, Officer, Admin, Template, VerificationTask, ...)
│       ├── DTOs/                    # Requests/ and Responses/
│       ├── Data/Context/            # AppDbContext (Npgsql)
│       ├── Migrations/              # EF Core migrations (auto-applied on startup)
│       ├── Program.cs               # DI, CORS, JWT, Swagger, runs on http://0.0.0.0:5119
│       ├── .env.example             # Required environment variables
│       └── BackendRun.md            # Short migration cheat-sheet
│
├── web/                             # React officer + admin dashboard (Vite, Carbon)
│   └── src/
│       ├── Officer/                 # Login, dashboard, application templates, verified records, pending reviews, profile
│       └── Admin/                   # Dashboard, manage officers, audit logs, system settings, Service_Catalog/
│
├── mobile/                          # Flutter citizen app
│   └── lib/
│       ├── screens/                 # Onboarding, login/signup, dashboard, service discovery, eligibility self-check, procedure detail
│       ├── widgets/dashboard/       # Home, Services, Applications, Profile tabs
│       └── services/                # service_api_client.dart, auth_service.dart
│
├── docs/
│   ├── adr/                         # Architecture Decision Records (7 so far — see docs/adr/README.md)
│   ├── diagrams/                    # System architecture + database ER diagrams (Mermaid)
│   ├── reports/                     # (empty — add test/eval/perf/deployment reports here)
│   ├── api.md                       # Full endpoint-by-endpoint API reference, incl. actual auth requirements
│   └── Government_Service_Navigator_Project_Plan.md   # Original 9-week plan, role split, agentic AI design
│
├── tui-runner/                      # Node.js split-pane TUI: runs backend + web (+ optional mobile) together
├── launch.bat / launch.command      # Double-click launchers for tui-runner (Windows / macOS)
│
├── .github/workflows/               # backend-ci.yml, web-ci.yml, mobile-ci.yml (path-filtered per branch)
├── .github/CODEOWNERS
└── README.md
```

---

## Tech Stack

- **Backend:** ASP.NET Core Web API (.NET 10), Entity Framework Core, Npgsql (PostgreSQL), JWT Bearer auth, BCrypt.Net for password hashing, Swashbuckle (Swagger/OpenAPI)
- **Web:** React 19, TypeScript, Vite, Carbon Design System (`@carbon/react`), React Router, jsPDF (template PDF export), Tailwind CSS
- **Mobile:** Flutter (Dart), `http` package for API calls, Google Fonts
- **Dev tooling:** a custom Node.js TUI (`tui-runner/`) that runs the backend and web dev servers (and optionally a Flutter emulator) side by side in one terminal
- **DevOps:** GitHub Actions (one workflow per app)

There is no Docker Compose setup and no message queue/cache layer in this repo - PostgreSQL is expected to run locally (or on a reachable host) and is configured entirely through environment variables.

---

## Prerequisites

- [Git](https://git-scm.com/)
- [.NET SDK 10.x](https://dotnet.microsoft.com/en-us/download) — the backend targets `net10.0`
- [Node.js 20+](https://nodejs.org/) (for both `web/` and `tui-runner/`)
- [Flutter SDK](https://docs.flutter.dev/get-started/install) (only needed if you're running the mobile app)
- A running PostgreSQL instance (local install, Postgres.app, or a hosted instance) — there's no bundled container for it

Optional:

- `dotnet-ef` CLI (`dotnet tool install --global dotnet-ef`) if you want to author new migrations
- pgAdmin / psql for inspecting the database

---

## Quick Start (recommended: one-command dev runner)

The repo ships a split-pane terminal UI that starts the backend and web dev servers together (and can optionally launch the Flutter app on an emulator you pick):

```bash
# from the repo root
cd tui-runner
npm install
npm start
```

or just double-click `launch.bat` (Windows) / run `launch.command` (macOS) from the repo root.

It runs `dotnet run` in `backend/src` (port `5119`), `npm run dev` in `web` (port `5173`), frees those ports first if something is already bound to them, and prompts you to optionally pick a mobile emulator to also run `flutter run` in `mobile`. Press `Tab` to switch panes, `q` or `Ctrl+C` to stop everything.

You still need the backend's `.env` configured first (see below) - the runner doesn't create it for you.

---

## Backend Setup (ASP.NET Core API)

### 1) Configure environment

Copy the example env file and fill in real values:

```bash
cd backend/src
cp .env.example .env
```

`backend/src/.env.example` documents everything required:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=

JWT_KEY=
JWT_ISSUER=GovServiceNavigator
JWT_AUDIENCE=GovServiceNavigatorClients
JWT_EXPIRY_HOURS=24

ASPNETCORE_ENVIRONMENT=Development
```

All five `DB_*` variables are **required** - `Program.cs` throws on startup if any are missing. `JWT_KEY` is required for the JWT auth scheme to be registered at all.

> Never commit real secrets. `.env` is already gitignored; only `.env.example` is tracked.

### 2) Restore and build

```bash
cd backend/src
dotnet restore
dotnet build
```

### 3) Run the API

```bash
dotnet run
```

Migrations are **applied automatically on startup** (`context.Database.Migrate()` runs in `Program.cs`), so a fresh database will be brought up to date the first time you run the app - a manual `dotnet ef database update` isn't required just to run it.

The API always listens on **`http://0.0.0.0:5119`** (hardcoded in `Program.cs`, not read from launch settings). Swagger UI is available at `/swagger` in Development.

If you're adding new entities/migrations yourself:

```bash
dotnet ef migrations add <MigrationName>
dotnet ef database update
```

(`dotnet-ef` install: `dotnet tool install --global dotnet-ef` if missing.)

---

## Web Setup (React Dashboard)

```bash
cd web
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173`.

> There is currently no `VITE_API_BASE_URL` / `.env` mechanism in the web app - every page calls the backend directly at the hardcoded address `http://localhost:5119`. If you run the API on a different host/port, you'll need to update those literals in `web/src/**` (a config module is a good first refactor here).

Default route (`/`) redirects to `/officer/login`. Key routes:

| Area | Path | Notes |
|---|---|---|
| Officer | `/officer/login` | Officer sign-in |
| Officer | `/officer/dashboard` | Application queue |
| Officer | `/officer/applications` | Created application templates — create, edit, status (Active/Deactive/Draft), preview, download PDF, delete |
| Officer | `/officer/Application_create/application_create` | Template builder |
| Officer | `/officer/verified-records`, `/officer/pending-reviews`, `/officer/profile` | |
| Admin | `/admin/dashboard`, `/admin/manage-officers`, `/admin/audit-logs`, `/admin/system-settings` | |
| Admin | `/admin/services`, `/admin/services/rules`, `/admin/services/config`, `/admin/services/simulator` | Service Catalog manager, eligibility rule builder, service configuration tabs, eligibility simulator |

### Install the desktop app (Windows)

Government staff can install the officer/admin dashboard as a Windows desktop app with a single command. It downloads the latest installer from [GitHub Releases](https://github.com/Goverment-Service/Government_Service_Navigator/releases) and installs it silently for the current user (no admin rights needed). Running the same command again updates to the newest version.

**PowerShell:**

```powershell
irm https://raw.githubusercontent.com/Goverment-Service/Government_Service_Navigator/main/install/install.ps1 | iex
```

**CMD:**

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Goverment-Service/Government_Service_Navigator/main/install/install.ps1 | iex"
```

After installing, open **Government Service Navigator** from the Start menu.

> Releases are published by the `Build Windows App` workflow when a version tag is pushed (e.g. `git tag v1.0.0 && git push origin v1.0.0`). The installer is not code-signed yet, so Windows SmartScreen may show a warning.

---

## Mobile Setup (Flutter Citizen App)

```bash
cd mobile
flutter pub get
flutter run
```

The app talks to the backend at `http://localhost:5119/api/services` (see `mobile/lib/services/service_api_client.dart`), hardcoded the same way as the web app.

- **Android emulator:** the emulator's `localhost` is not the host machine's — use `10.0.2.2` instead (a comment in `service_api_client.dart` already flags this; you'll need to change the constant).
- **iOS simulator:** `localhost` works as-is.
- **Physical devices:** point at your machine's LAN IP and make sure the backend port is reachable through your firewall.

Current screens cover onboarding/landing, login/signup, a home dashboard with Home/Services/Applications/Profile tabs, service discovery, "describe your need," eligibility self-check, and procedure detail - backed by the Service Catalog API.

---

## Backend API Overview

All routes are under `api/`. **Only `VerificationController` (every action) and `AuthController`'s `logout` actually require `Authorization: Bearer <token>`** — every other endpoint below is currently reachable with no token at all, regardless of what the frontend happens to send. See [`docs/api.md`](docs/api.md) for the full endpoint-by-endpoint reference (request/response shapes, what's actually validated, known quirks) and [`docs/adr/0004`](docs/adr/0004-client-side-department-scoping.md) for why the auth gap matters beyond just missing a 401.

**Auth** (`AuthController`, `api/auth`)
`POST register`, `POST login`, `POST officer-login`, `POST admin-login`, `POST logout` (auth required)

**Admin** (`AdminController`, `api/admin`)
`GET officers`, `POST officers`, `PUT officers/{id}`, `POST officers/{id}/reset-password`, `PATCH officers/{id}/suspend`, `PATCH officers/{id}/activate`

**Templates** (`TemplateController`, `api/templates`) — officer-created dynamic application forms, optionally linked to a Service Catalog entry
`POST create`, `GET all`, `GET {id}`, `PUT update/{id}`, `PATCH {id}/status`, `DELETE {id}`

**Services / Eligibility** (`ServicesController`, `api/services`) — the Service Catalog module
`POST` / `GET` / `GET {id}` / `PUT {id}` / `DELETE {id}` for services, `PUT {id}/eligibility-rules`, `POST eligibility-score`, `PUT {id}/documents`, `DELETE documents/{documentId}`, `PUT {id}/fees`, `DELETE fees/{feeId}`

**Verification** (`VerificationController`, `api/verification`, auth required) — officer review workflow
`GET tasks/pending`, `GET stats`, `POST tasks`, `GET audit-logs`, `GET audit-logs/all`, `PUT tasks/{id}/decision`, `DELETE tasks/{id}`, `POST tasks/bulk-verify`

---

## Testing

Be aware there isn't real automated test coverage in this repo yet:

- **Backend:** no test project exists under `backend/`.
- **Web:** no test runner is configured (`web/package.json` has no `test` script).
- **Mobile:** `mobile/test/widget_test.dart` is Flutter's default placeholder widget test.

```bash
cd mobile
flutter test
```

Adding real backend/web test suites (and wiring them into CI) is open work.

---

## CI/CD

Three separate, path-filtered GitHub Actions workflows live in `.github/workflows/`:

- **`backend-ci.yml`** - on push/PR to `main` or `Backend-Dev` touching `backend/**`: restores and builds the `.csproj` with .NET 10 (no test step, since there's no test project).
- **`web-ci.yml`** - on push/PR to `main` or `Front-Dev` touching `web/**`: `npm ci`, `npm run lint`, `tsc --noEmit`, `npm run build`, uploads `web/dist` as an artifact.
- **`mobile-ci.yml`** - on push/PR to `main` or `Front-Dev` touching `mobile/**`: `flutter pub get`, `flutter analyze` (tests are commented out, pending real coverage).

---

## Development Notes

- Single-project backend layering by folder (not separate Clean-Architecture projects): `Models/Entities` → domain, `Services` (+ `Services/Interfaces`) → business logic, `DTOs` → request/response shapes, `Data/Context` → EF Core persistence, `Controllers` → HTTP surface. See [`docs/adr/0002`](docs/adr/0002-single-project-folder-layering.md) for why.
- Architectural decisions live in [`docs/adr/`](docs/adr/README.md) (7 so far, including two that document real, unresolved gaps rather than just wins - [0004](docs/adr/0004-client-side-department-scoping.md) on department scoping only being enforced client-side, and the auth-coverage gap called out in [`docs/api.md`](docs/api.md)); diagrams live in [`docs/diagrams/`](docs/diagrams/); test/eval/perf/deployment write-ups belong in `docs/reports/`, still empty and worth populating as the project matures.
- `docs/Government_Service_Navigator_Project_Plan.md` is the original assignment plan (role split across 4 "components," the intended 4-agent Agentic AI workflow, third-party integration options). Treat it as the design target, not a description of current code - see the Roadmap section below for the gap.

---

## Roadmap / Not Yet Implemented

Per the original project plan, these pieces are designed but not present in the current codebase:

- **Component B - Application & Case Management**: no `Application`, `ApplicationStep`, `Document`, `AppointmentSlot`, or `StatusHistory` entities/endpoints exist yet. The officer-side "Templates" feature covers *form design*, not citizen-submitted case tracking.
- **Component D - Payments, Notifications & Analytics**: no payment integration, notification system, or reporting/analytics endpoints exist yet.
- **Agentic AI subsystem** (Intake & Planning, Eligibility & Document Analysis, Action/Tool, Validation & Safety agents): not implemented - there is no agent orchestration code in `backend/`.
- **Citizen-side application submission and status tracking** on mobile: the mobile "Applications" tab UI exists, but there's no backend endpoint yet for citizens to submit or track an application/case.

---

## Troubleshooting

### API cannot connect to the database
- Confirm PostgreSQL is running and reachable at the `DB_HOST`/`DB_PORT` in `backend/src/.env`
- Verify `DB_NAME`/`DB_USER`/`DB_PASSWORD` are correct - the app throws on startup if any `DB_*` var is missing
- Check the console output for "An error occurred while migrating the database" for migration-specific errors

### 401s from the web app or mobile app
- Make sure `JWT_KEY` is set in `.env` - without it, the backend skips registering JWT auth entirely and every protected route will reject tokens
- Re-login through `/officer/login` (web) after restarting the backend with a new `JWT_KEY`, since old tokens are signed with the previous key

### CORS
- The backend currently allows all origins, headers, and methods (`AllowAllOrigins` policy in `Program.cs`), so CORS shouldn't block local dev. If you've since tightened this policy, add your dev origin(s) back in.

### Flutter cannot reach the local API
- Android emulator: change the hardcoded base URL to use `10.0.2.2` instead of `localhost`
- Physical devices: use your machine's LAN IP and ensure port `5119` is open in your firewall

### `tui-runner` says a port is in use
- It calls `killPorts` on `5119`/`5173` before starting; if that still fails, manually stop whatever's bound to those ports and re-run `npm start`

---

## License

This project is licensed under the [MIT License](LICENSE) - Copyright (c) 2026 Krishmal2004.
