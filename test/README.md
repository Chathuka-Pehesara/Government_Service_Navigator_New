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

## What each suite covers

**`AgenticAi.Tests`**
- Every deterministic tool: schema validation (NIC formats, age bounds, document matching, injection patterns), the duplicate check and its registry, eligibility rules, fee calculation (revisions, express fees), appointment slots (lead time, weekends, office hours), form prefill and document requirements.
- The text utilities: tokenizer, catalog chunk parser and document chunker.
- The four agents, including the golden cases and the LLM paths with a stub model: Agent 4's consistency-flag filter, duplicates always being rejected, PII masking and task enqueueing.

**`Backend.Tests`**
- **Validation rules:** NIC parsing, the data-annotation attributes, the service catalog validator, the answer validator and upload type detection.
- **Authorization matrix:** the auth on every endpoint, read from the controller attributes.
- **Duplicate rules:** the duplicate repository against the database.
- **Submit pipeline:** the citizen submit pipeline end to end, covering required and invalid fields, uploads, injection, reuse of unfinished rows, duplicates, stage payments and revisions.
- **Verification service:** the service behind the officer decisions.

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

When one of these is fixed, the test starts passing (or `it.fails` starts failing). Remove the marker then.

## Writing new tests

- Put .NET tests in the project for the code under test, in a folder that mirrors the source (`Tools/`, `Validation/`, `Controllers/`).
- **Shared state:** `DuplicateCheckTool` and `FindAppointmentSlotTool` keep static state, so both .NET test projects run their classes one at a time. Clear that state in the test class constructor (`DuplicateCheckTool.ClearRegistry()`, `FindAppointmentSlotTool.ClearProposedSlots()`).
- **Fresh database:** API tests get a new in-memory database from `TestDb.Create()`, and a signed-in user from `TestUsers.Citizen()` with `controller.WithUser(...)`.
- **Web imports:** web tests import from `../../web/src/...` and use Vitest's globals (`describe`, `it`, `expect`, `vi`) without importing them.
- **Widget tests:** use a phone-sized screen and advance the clock with `pump(Duration)`. The app's animations repeat forever, so `pumpAndSettle` never returns.
