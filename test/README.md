# Tests

Automated tests for the API, the agents and the web dashboard live here. The mobile app's tests stay in `mobile/test/`, because `flutter test` only runs tests inside the Flutter package.

None of the suites need a database, Groq, Stripe or a network connection. They run against in-memory fakes, so they're fast and give the same result every time.

| Suite | Location | Framework | Run from the repo root |
|---|---|---|---|
| Agents and tools | `test/AgenticAi.Tests` | xUnit | `dotnet test test/AgenticAi.Tests` |
| API | `test/Backend.Tests` | xUnit + EF Core in-memory | `dotnet test test/Backend.Tests -c Release` |
| Web dashboard | `test/web` | Vitest | `cd web` then `npm test` |
| Mobile app | `mobile/test` | flutter_test | `cd mobile` then `flutter test` |

Use `-c Release` for the API tests while the API is running locally. The running API locks `backend/src/bin/Debug`, and a Release build writes elsewhere.

## Running one part with make

Contributors can run only the part they work on with the `Makefile` in the repo root:

| Contributor area | Command | What runs |
|---|---|---|
| Agent 1 - Intake & Planning | `make test-agent1` | Intake agent, catalog chunk parser, tokenizer |
| Agent 2 - Eligibility & Document | `make test-agent2` | Eligibility agent, `check_eligibility_rules`, `get_document_requirements`, document chunker |
| Agent 3 - Action/Tool | `make test-agent3` | Action agent, `calculate_fee`, `find_appointment_slot`, `prefill_application` |
| Agent 4 - Validation & Safety | `make test-agent4` | Validation agent and guardrails, `validate_schema`, `check_duplicate_application` |
| All agents | `make test-agents` | All of `AgenticAi.Tests` |
| Backend 1 - Service catalog | `make test-backend1` | `ServiceCatalogService`, `ServicesController` and the catalog validator: create, update and retire services, eligibility rules, document requirements, fee schedules, workflow and stage details |
| Backend 2 - Citizen applications | `make test-backend2` | The submit and revision pipeline, the duplicate repository, NIC parsing, the data-annotation attributes, the answer validator and upload type detection |
| Backend 3 - Verification | `make test-backend3` | `VerificationService` and `VerificationController`: tasks, officer reviews, compliance checks, rejection reasons, audit rows, department-based access and the payment approval lock |
| Backend 4 - Payments & finance | `make test-backend4` | Payments, installment plans, refunds, analytics, report snapshots, anomaly detection and the audit-log query endpoints |
| Backend | `make test-backend` | All of `Backend.Tests`, including the authorization matrix, which checks every endpoint and so is in none of the four parts |
| Frontend | `make test-frontend` | All of `test/web` (run `make web-install` once first) |
| Everything | `make test` | Agents, backend and frontend |

Each agent also has its own `Makefile` in its folder under `agentic-ai/agents/`, and that file holds the agent's test filter. An agent's contributor can run `make` inside that folder, or `make -C agentic-ai/agents/02-eligibility-document-agent` from the repo root. The root `make test-agentN` targets call these files.

The output comes from `test/runner.mjs`, which needs only Node. Each suite gets a header, then every test is listed as it finishes (✔ passed, ✖ failed, ○ skipped) under its test class or Vitest file, with a spinner below the list and a PASS or FAIL line with the counts at the end. Pass `QUIET=1` to hide the list and show only the spinner and the result line. A failing suite also prints the failing tests with their error messages. `make test` runs every suite even when one fails, then prints a summary table. Colours are switched off when the output is not a terminal, or when `NO_COLOR` or `CI` is set.

The .NET targets build in Release by default. Pass `CONFIG=Debug` or `VERBOSITY=normal` to change that, for example `make test-agent2 VERBOSITY=normal`. Run `make help` to list the targets.

On Windows, install make with `winget install GnuWin32.Make` or `choco install make`.

## What each suite covers

**`AgenticAi.Tests`**
- Every deterministic tool: schema validation (NIC formats, age bounds, document matching, injection patterns), the duplicate check and its registry, eligibility rules, fee calculation (revisions, express fees), appointment slots (lead time, weekends, office hours), form prefill and document requirements.
- The text utilities: tokenizer, catalog chunk parser and document chunker.
- The four agents, including the golden cases and the LLM paths with a stub model: Agent 4's consistency-flag filter, duplicates always being rejected, PII masking and task enqueueing.

**`Backend.Tests`**
- **Service catalog (part 1):** service codes assigned on the server (retired services included), retiring instead of deleting, replacing eligibility rules, adding, updating and removing document requirements and fees, the workflow, the eligibility score, validation before saving, and the stage details built from a stage template or the catalog.
- **Citizen applications (part 2):** NIC parsing, the data-annotation attributes, the answer validator, upload type detection, the duplicate repository, and the submit pipeline end to end, covering required and invalid fields, uploads, injection, reuse of unfinished rows, duplicates, stage payments and revisions.
- **Verification (part 3):** creating tasks, decisions with officer reviews and audit rows, bulk decisions, deleting a task with its reviews and compliance checks, rejection reasons, officer stats, the department-scoped queues and task access, and the payment approval lock (a stage with a fee can't be approved until the payment is Paid or Verified).
- **Payments and finance (part 4):** manual payment verification and officer status changes, the ledger, installment splitting, payment, bank transfer receipts and cancelling, the refund rules (owner only, 7-day window, one active request) and lifecycle, usage analytics, approval likelihood, report snapshots, the anomaly scan rules, and the audit-log query endpoints.
- **Authorization matrix:** the auth on every endpoint, read from the controller attributes.

**`test/web`**
- The shared form rules and API error parsing.
- The API client (base URL, token, errors) and the role helpers.
- Department and catalog validation, and department routing.
- The finance ledger and formatting.

**`mobile/test`**
- Validators and NIC parsing.
- Session storage (token expiry) and onboarding preferences.
- Model parsing.
- App start-up navigation and the eligibility auditor screen.

## Known gaps pinned by tests

Some tests describe a known gap rather than the intended behaviour, so the gap stays visible:

- **`AuthorizationMatrixTests`** lists today's unauthenticated endpoints (see `docs/api.md`). Changing an endpoint's auth fails it on purpose. Update the list together with the docs.
- **`ApplicationAnswersValidatorTests.LabelsThatOnlyContainTheLettersNic_AreNotTreatedAsNic`** is skipped. Any label containing "nic", such as "Clinic name", is validated as an NIC number.
- **The web test "department-admin scope matches the thematic service categories"** is marked `it.fails`. Department admins are scoped by the old categories, so they match none of the migrated services.
- **`PaymentServiceTests.GetByUser_NoPaymentsOfTheirOwn_ReturnsEveryonesPayments`**: a user with no payments of their own gets every citizen's payments.
- **`InstallmentPlanServiceTests.GetById_UnknownId_FallsBackToTheNewestPlan`**: an id that matches no plan returns the newest plan, which may be another citizen's.
- **`VerificationServiceTests.RecordDecision_UnknownTask_ReportsSuccess_ButWritesNothing`**: a decision on a missing task reports success.

When one of these is fixed, the skipped test starts passing (or `it.fails` starts failing). Remove the marker then. The last three tests assert today's behaviour, so they fail when the gap is fixed. Change them to assert the fixed behaviour then.

## Writing new tests

- Put .NET tests in the project for the code under test, in a folder that mirrors the source (`Tools/`, `Validation/`, `Controllers/`).
- **Shared state:** `DuplicateCheckTool` and `FindAppointmentSlotTool` keep static state, so both .NET test projects run their classes one at a time. Clear that state in the test class constructor (`DuplicateCheckTool.ClearRegistry()`, `FindAppointmentSlotTool.ClearProposedSlots()`).
- **Fresh database:** API tests get a new in-memory database from `TestDb.Create()`, and a signed-in user from `TestUsers.Citizen()` or `TestUsers.Officer(department)` with `controller.WithUser(...)`. `TestCache.Create()` gives controllers that need a `HybridCache`, and `RecordingNotifications` stands in for email.
- **PostgreSQL-only queries:** code that uses `EF.Functions.ILike` (search boxes, the audit-log action filter, refunds by department) can't run on the in-memory database, so test the paths around it.
- **New backend test classes:** add the class name to the matching `BACKENDn_FILTER` in the root `Makefile`, or it only runs with `make test-backend`.
- **Web imports:** web tests import from `../../web/src/...` and use Vitest's globals (`describe`, `it`, `expect`, `vi`) without importing them.
- **Widget tests:** use a phone-sized screen and advance the clock with `pump(Duration)`. The app's animations repeat forever, so `pumpAndSettle` never returns.
