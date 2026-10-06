# Tests for Agent 4 - Validation & Safety (see test/README.md).
#
#   make          run this agent's tests
#   make test     same as above
#
# Options: CONFIG=Debug (default Release), VERBOSITY=normal (default minimal),
#          QUIET=1 (hide the per-test list)
# From the repo root, run: make -C agentic-ai/agents/04-validation-safety-agent

CONFIG    ?= Release
VERBOSITY ?= minimal
QUIET     ?= 0

ROOT        = ../../..
AGENT_TESTS = $(ROOT)/test/AgenticAi.Tests
RUNNER      = node $(ROOT)/test/runner.mjs

# The agent itself plus the tools and text utilities it calls
FILTER = FullyQualifiedName~ValidationSafetyAgent|FullyQualifiedName~SchemaValidatorToolTests|FullyQualifiedName~DuplicateCheckToolTests

.PHONY: test

test:
	@$(RUNNER) dotnet --title "Agent 4" --subtitle "Validation & Safety" --project $(AGENT_TESTS) --filter "$(FILTER)" --config $(CONFIG) --verbosity $(VERBOSITY) --quiet $(QUIET)
