# Test runner for contributors (see test/README.md).
#
#   make help             list the targets
#   make test-agent1      Agent 1 - Intake & Planning
#   make test-agent2      Agent 2 - Eligibility & Document
#   make test-agent3      Agent 3 - Action/Tool
#   make test-agent4      Agent 4 - Validation & Safety
#   make test-agents      the whole AgenticAi.Tests project
#   make test-backend1    Backend 1 - Service catalog
#   make test-backend2    Backend 2 - Citizen applications
#   make test-backend3    Backend 3 - Verification
#   make test-backend4    Backend 4 - Payments & finance
#   make test-backend     the whole API (Backend.Tests)
#   make test-frontend    the web dashboard (Vitest)
#   make test             everything above, with a summary
#
# Options: CONFIG=Debug (default Release), VERBOSITY=normal (default minimal),
#          QUIET=1 (hide the per-test list)
#
# Output is drawn by test/runner.mjs, so the recipes work the same under
# cmd.exe, PowerShell and sh.

CONFIG    ?= Release
VERBOSITY ?= minimal
QUIET     ?= 0

AGENT_TESTS   = test/AgenticAi.Tests
BACKEND_TESTS = test/Backend.Tests
WEB_DIR       = web

RUNNER = node test/runner.mjs
DOTNET = $(RUNNER) dotnet --config $(CONFIG) --verbosity $(VERBOSITY) --quiet $(QUIET)

# Each agent has its own Makefile with its test filter
AGENT1_DIR = agentic-ai/agents/01-intake-planning-agent
AGENT2_DIR = agentic-ai/agents/02-eligibility-document-agent
AGENT3_DIR = agentic-ai/agents/03-action-tool-agent
AGENT4_DIR = agentic-ai/agents/04-validation-safety-agent
AGENT_MAKE = "$(MAKE)" --no-print-directory CONFIG=$(CONFIG) VERBOSITY=$(VERBOSITY) QUIET=$(QUIET) -C

# Each backend part's tests, by test class
BACKEND1_FILTER = FullyQualifiedName~ServiceCatalogServiceTests|FullyQualifiedName~ServicesControllerTests|FullyQualifiedName~ServiceCatalogValidatorTests
BACKEND2_FILTER = FullyQualifiedName~ApplicationsControllerTests|FullyQualifiedName~DuplicateApplicationRepositoryTests|FullyQualifiedName~SriLankaNicTests|FullyQualifiedName~AgeFromNicTests|FullyQualifiedName~ValidationAttributeTests|FullyQualifiedName~ApplicationAnswersValidatorTests|FullyQualifiedName~UploadedFileTypesTests
BACKEND3_FILTER = FullyQualifiedName~VerificationServiceTests|FullyQualifiedName~VerificationControllerTests
BACKEND4_FILTER = FullyQualifiedName~PaymentServiceTests|FullyQualifiedName~RefundServiceTests|FullyQualifiedName~InstallmentPlanServiceTests|FullyQualifiedName~AnalyticsServiceTests|FullyQualifiedName~AnomalyDetectionServiceTests|FullyQualifiedName~AuditLogsControllerTests

.PHONY: help test test-agents test-agent1 test-agent2 test-agent3 test-agent4 \
        test-backend test-backend1 test-backend2 test-backend3 test-backend4 \
        test-frontend web-install

help:
	@$(RUNNER) help

# Runs every suite even if one fails, then prints the summary
test:
	@$(RUNNER) reset
	-@"$(MAKE)" --no-print-directory -k test-agents test-backend test-frontend
	@$(RUNNER) summary

# ---- Agentic AI ----

test-agents:
	@$(DOTNET) --title "All agents" --subtitle "Agents and tools" --project $(AGENT_TESTS)

test-agent1:
	@$(AGENT_MAKE) $(AGENT1_DIR) test

test-agent2:
	@$(AGENT_MAKE) $(AGENT2_DIR) test

test-agent3:
	@$(AGENT_MAKE) $(AGENT3_DIR) test

test-agent4:
	@$(AGENT_MAKE) $(AGENT4_DIR) test

# ---- Backend ----

test-backend:
	@$(DOTNET) --title "Backend" --subtitle "API" --project $(BACKEND_TESTS)

test-backend1:
	@$(DOTNET) --title "Backend 1" --subtitle "Service catalog" --project $(BACKEND_TESTS) --filter "$(BACKEND1_FILTER)"

test-backend2:
	@$(DOTNET) --title "Backend 2" --subtitle "Citizen applications" --project $(BACKEND_TESTS) --filter "$(BACKEND2_FILTER)"

test-backend3:
	@$(DOTNET) --title "Backend 3" --subtitle "Verification" --project $(BACKEND_TESTS) --filter "$(BACKEND3_FILTER)"

test-backend4:
	@$(DOTNET) --title "Backend 4" --subtitle "Payments & finance" --project $(BACKEND_TESTS) --filter "$(BACKEND4_FILTER)"

# ---- Frontend ----

web-install:
	npm --prefix $(WEB_DIR) ci

test-frontend:
	@$(RUNNER) npm --title "Frontend" --subtitle "Web dashboard" --dir $(WEB_DIR) --quiet $(QUIET)
