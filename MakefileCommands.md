# Makefile Commands

How to run the tests with `make`. All commands below work in Windows PowerShell, cmd.exe and sh. See `test/README.md` for what each suite covers.

---

## 1. Prerequisites

| Tool | Needed for | Check |
|---|---|---|
| make | Every command | `make --version` |
| .NET SDK | Agent and backend tests | `dotnet --version` |
| Node.js | The test output runner (`test/runner.mjs`) and frontend tests | `node --version` |

Install make on Windows with one of:

```powershell
winget install GnuWin32.Make
choco install make
```

Before running the frontend tests for the first time, install the web packages:

```powershell
make web-install
```

---

## 2. Commands from the Repo Root

Open a terminal in the repo root (the folder that holds the main `Makefile`):

```powershell
cd C:\Users\dinid\Downloads\Government_Service_Navigator
```

| Command | What runs |
|---|---|
| `make help` | Lists every target |
| `make test-agent1` | Agent 1 - Intake & Planning |
| `make test-agent2` | Agent 2 - Eligibility & Document |
| `make test-agent3` | Agent 3 - Action/Tool |
| `make test-agent4` | Agent 4 - Validation & Safety |
| `make test-agents` | All of `AgenticAi.Tests` |
| `make test-backend1` | Backend 1 - Service catalog |
| `make test-backend2` | Backend 2 - Citizen applications |
| `make test-backend3` | Backend 3 - Verification |
| `make test-backend4` | Backend 4 - Payments & finance |
| `make test-backend` | All of `Backend.Tests` |
| `make web-install` | Installs the web dashboard packages (`npm ci`) |
| `make test-frontend` | The web dashboard tests (Vitest) |
| `make test` | Everything above, then a summary table |

`make test` keeps going when a suite fails, so you always see the full summary.

---

## 3. Commands from an Agent Folder

Each agent has its own `Makefile` in `agentic-ai/agents/<agent>/`. Inside that folder, run:

```powershell
cd agentic-ai\agents\03-action-tool-agent
make
```

`make` and `make test` do the same thing: they run only that agent's tests.

To run an agent's Makefile without leaving the repo root, use `-C`:

```powershell
make -C agentic-ai/agents/01-intake-planning-agent
make -C agentic-ai/agents/02-eligibility-document-agent
make -C agentic-ai/agents/03-action-tool-agent
make -C agentic-ai/agents/04-validation-safety-agent
```

| Agent folder | Tests included |
|---|---|
| `01-intake-planning-agent` | Intake agent, catalog chunk parser, tokenizer |
| `02-eligibility-document-agent` | Eligibility agent, `check_eligibility_rules`, `get_document_requirements`, document chunker |
| `03-action-tool-agent` | Action agent, `calculate_fee`, `find_appointment_slot`, `prefill_application` |
| `04-validation-safety-agent` | Validation agent, `validate_schema`, `check_duplicate_application` |

---

## 4. Options

Add these after any command:

| Option | Default | Effect |
|---|---|---|
| `CONFIG=Debug` | `Release` | Builds the .NET tests in Debug |
| `VERBOSITY=normal` | `minimal` | Shows more `dotnet` build output |
| `QUIET=1` | `0` | Hides the per-test list and shows only the result line |

Examples:

```powershell
make test-agent3 QUIET=1
make test-backend CONFIG=Debug VERBOSITY=normal
make QUIET=1
```

Keep the default `CONFIG=Release` while the API is running locally. The running API locks `backend/src/bin/Debug`, so a Debug build of the backend tests fails.

---

## 5. Reading the Output

- Each suite prints a header, then lists every test as it finishes: ✔ passed, ✖ failed, ○ skipped.
- A PASS or FAIL line with the counts ends each suite.
- A failing suite also prints the failing tests with their error messages.
- Colours are off when the output is not a terminal, or when `NO_COLOR` or `CI` is set.
