# Tests for Agent 3 - Action/Tool (see test/README.md).
#
#   make          run this agent's tests
#   make test     same as above
#
# Options: CONFIG=Debug (default Release), VERBOSITY=normal (default minimal),
#          QUIET=1 (hide the per-test list)
# From the repo root, run: make -C agentic-ai/agents/03-action-tool-agent

CONFIG    ?= Release
VERBOSITY ?= minimal
QUIET     ?= 0

ROOT        = ../../..
AGENT_TESTS = $(ROOT)/test/AgenticAi.Tests
RUNNER      = node $(ROOT)/test/runner.mjs

# The agent itself plus the tools and text utilities it calls
FILTER = FullyQualifiedName~ActionToolAgentTests|FullyQualifiedName~CalculateFeeToolTests|FullyQualifiedName~FindAppointmentSlotToolTests|FullyQualifiedName~PrefillApplicationToolTests

.PHONY: test

test:
	@$(RUNNER) dotnet --title "Agent 3" --subtitle "Action/Tool" --project $(AGENT_TESTS) --filter "$(FILTER)" --config $(CONFIG) --verbosity $(VERBOSITY) --quiet $(QUIET)
