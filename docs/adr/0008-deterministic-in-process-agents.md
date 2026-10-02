# ADR-0008: The four agents run in-process and deterministically, with local hashed embeddings

## Context

The project plan (§2) calls for a four-agent "Navigator Agent Workflow":
1. Intake & Planning
2. Eligibility & Documents
3. Action/Tool
4. Validation & Safety

A Verifying Officer must approve before anything reaches a citizen's case. The original `agentic-ai/` scaffold assumed a separately deployed service and left the framework/LLM choice open. The agents need catalog knowledge (documents, fees, forms, policy text) to answer. They must also behave predictably under the SE3090 evaluation: golden cases, adversarial input, and no hallucinated fees or documents.

## Options Considered

1. **Separate agent service calling a hosted LLM** (e.g. an OpenAI/Anthropic-backed planner with tool calls), with a hosted embedding API for retrieval.
2. **In-process C# agents calling a hosted LLM** only for free-text planning, with deterministic tools for everything else.
3. **In-process, fully deterministic agents.** Each agent is plain C# over deterministic tools. Retrieval uses pgvector with embeddings computed locally, and no model API is called at all.

## Decision

Option 3.

- `agentic-ai/AgenticAi.csproj` is a class library referenced by the backend project, not a separate deployable. The backend registers the agents, tools and orchestrators in DI (`Program.cs`).
- **Retrieval:** `LocalEmbeddingService` hashes keyword unigrams and bigrams (FNV-1a) into a 768-dimension normalised vector. Chunks are stored in a separate pgvector database (`KnowledgeChunks`, HNSW cosine index) and seeded from the live catalog via `api/RagSetup`.
- **Agent 1** accepts a vector match only if it shares a keyword with the request. Otherwise it answers "Service Not Found" rather than guessing.
- **Agents 2 and 3** build their output from tools that read the relational catalog: eligibility rules, document requirements, fee calculation, form prefill and appointment slots. Vector chunks serve as supporting context only.
- **Agent 4** is deterministic by design: schema checks, an injection keyword filter, age bounds, duplicate detection and fee sanity. It runs synchronously inside `POST /api/applications/submit` and `submit-stage`, and blocks the submission on failure.
- Human approval stays with the officer:
  - Agents 2 + 3 run only when an officer asks (`POST /api/verification/tasks/{id}/agent-draft`), and the result is shown as a draft.
  - A proposed appointment isn't reserved until the officer approves.

## Consequences

- No API keys, no per-request cost, no network dependency, and identical output for identical input. That makes the xUnit tests in `agentic-ai/tests/` and the golden cases reproducible.
- **"Semantic" search is really keyword overlap.** Synonyms and paraphrases that share no tokens with a catalog chunk ("travel document" vs "passport") won't match. The keyword gate in Agent 1 makes misses explicit, but they are misses.
- The prompt-injection defence is a fixed keyword list. It catches the evaluation's test strings, not a determined attacker. And there's no LLM downstream for an injection to affect anyway.
- Agent 4's duplicate check also uses a static in-memory registry that's never cleared. Within one API process, a citizen can't apply for the same service a second time, even after the first application completes.
- Chunks are snapshots. Catalog edits, new templates or a change to the embedding algorithm need a re-seed (`POST /api/RagSetup/seed`, `seed-action-agent`, `ingest-local-documents`). Nothing triggers this automatically.
- The agent endpoints and `RagSetup` have no `[Authorize]`, so the knowledge base can be wiped by anyone who can reach the API (`docs/api.md`).
- `agentic-ai/README.md` still describes the pre-implementation scaffold ("No implementation yet", "its own deployable") and is out of date.
- Swapping in an LLM later would be localised: the agents sit behind interfaces (`IIntakePlanningAgent`, `IEligibilityDocumentAgent`, `IActionToolAgent`, `IValidationSafetyAgent`), and `IEmbeddingService` can be replaced with a model-backed implementation, followed by a re-seed.

## Partially superseded

ADR-0015 put a Groq-hosted LLM on top of these agents. What still holds from this ADR:

- The agents are in-process, behind the same interfaces, with the backend implementing their repositories.
- Embeddings are still local hashed keywords in pgvector.
- Every tool is still deterministic, and Agent 4's schema, duplicate and fee gates still decide whether a submission is rejected.
- With no `GROQ_API_KEY`, each agent returns exactly the deterministic answer described above.

What no longer holds when the key is set: "no API keys, no network dependency, identical output for identical input", and "there's no LLM downstream for an injection to affect". Agent 1 also retrieves the top 8 chunks now, not 3, and passes them all to the LLM instead of applying the keyword gate.

## Amended: duplicates are flagged, not blocked

`ValidationSafetyConfig.BlockDuplicateSubmissions` is now `false`. Agent 4 still runs the duplicate check and records the result, but a duplicate no longer rejects the submission; the officer sees it in the compliance checks. The in-memory registry is checked against the database on every call and an entry is dropped when the database shows no conflicting application, so the "static registry that's never cleared" consequence above no longer blocks a citizen from reapplying. Schema, injection, age and fee remain the deterministic gates that reject a submission.
