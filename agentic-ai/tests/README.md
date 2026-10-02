# Tests

The agent and tool tests are in `test/AgenticAi.Tests` at the repository root, as a separate xUnit project, so the test framework isn't shipped inside the API. See `test/README.md` for how to run them.

- `golden-cases/` - notes on the golden-case scenarios. The cases themselves run as tests (`ValidationSafetyAgentTests`) and live against the API through `GET /api/ValidationAgent/evaluation/golden-cases`.
