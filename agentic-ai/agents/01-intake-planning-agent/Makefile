# Tests for Agent 1 - Intake & Planning (see test/README.md).
#
#   make          run this agent's tests
#   make test     same as above
#
# Options: CONFIG=Debug (default Release), VERBOSITY=normal (default minimal),
#          QUIET=1 (hide the per-test list)
# From the repo root, run: make -C agentic-ai/agents/01-intake-planning-agent

CONFIG    ?= Release
VERBOSITY ?= minimal
QUIET     ?= 0

ROOT        = ../../..
AGENT_TESTS = $(ROOT)/test/AgenticAi.Tests
RUNNER      = node $(ROOT)/test/runner.mjs

# The agent itself plus the tools and text utilities it calls
FILTER = FullyQualifiedName~IntakeAndEligibilityAgentTests.Intake_|FullyQualifiedName~ServiceCatalogChunk|FullyQualifiedName~TextTokenizerTests

.PHONY: test

test:
	@$(RUNNER) dotnet --title "Agent 1" --subtitle "Intake & Planning" --project $(AGENT_TESTS) --filter "$(FILTER)" --config $(CONFIG) --verbosity $(VERBOSITY) --quiet $(QUIET)
