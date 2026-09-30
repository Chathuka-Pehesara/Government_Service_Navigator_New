# ADR-0015: A Groq-hosted LLM reasons over the deterministic agents, with a deterministic fallback

## Context

ADR-0008 made the four agents fully deterministic: plain C# over allow-listed tools, local hashed embeddings, and no model API. That kept them testable, but it had real limits that showed up in use:

- Agent 1 only matched a service when the request shared a keyword with a catalog chunk. "Travel document" never found the passport service.
- Agent 2 couldn't read the policy text it retrieved. It could say a document was missing, but not explain a circular or recognise that `nic_front.jpg` is the National Identity Card.
- Agent 3 needed a fixed date format for a preferred time. Citizens booking a collection appointment type "next Tuesday morning".
- Officers got a list of compliance checks from Agent 4, but no summary of what mattered in the case.

The v2.0.0 scope added natural-language booking, an AI document inspector in the eligibility check, and officer-facing briefings and decision orders. All of these need language understanding.

## Options Considered

1. **Keep ADR-0008.** Extend keyword lists and templates. Predictable and free, but it can't read policy text or free-form times.
2. **Replace the agents with an LLM planner that calls tools.** The model decides which tools to run. Flexible, but outputs become hard to test, and a model outage stops every agent.
3. **Layer an LLM over the existing tools, with the deterministic path as the fallback.** The tools still run first and produce the facts (rules, documents, fees, slots, schema and duplicate checks). The LLM gets those facts plus the retrieved chunks and writes the judgement or the text. If it isn't configured or fails, the agent returns what it returned before.

## Decision

Option 3, using Groq's OpenAI-compatible chat completions API.

- `agentic-ai/services/ILlmService` has one method, `GenerateChatCompletionAsync(systemPrompt, userPrompt, jsonMode)`. `GroqLlmService` implements it with `temperature` 0.2, JSON mode where the agent parses the answer, and a 30-second timeout. It returns `null` on any error instead of throwing.
- `Program.cs` registers one `GroqLlmService` from `GROQ_API_KEY` and `GROQ_MODEL` (default `openai/gpt-oss-120b`). Each agent takes it as an optional constructor argument and checks `IsConfigured` before each call.
- What the LLM is allowed to decide differs per agent:

  | Agent | LLM decides | Always from tools |
  |---|---|---|
  | 1 Intake | Recommended service, documents and steps, grounded in the top 8 chunks | Retrieval |
  | 2 Eligibility | `isEligible`, match percentage, missing documents, reasoning | Rule tool result and catalog documents, passed in as the baseline |
  | 3 Action | Reasoning text, officer notes, and parsing the preferred booking time | Prefill, fee, proposed slot, slot capacity and the booking itself |
  | 4 Validation | Risk level, officer briefing, consistency flags, decision-order text | Schema, NIC, age, documents, injection filter, duplicates, fee. Any failure here rejects the submission whatever the LLM says |

- Embeddings stay local (`LocalEmbeddingService`, ADR-0008). Only the generation step uses the network.
- The xUnit tests inject a stub `ILlmService`, so they stay offline and reproducible.

## Consequences

- **Agents degrade instead of failing.** With no key, a timeout or bad JSON, each agent returns its ADR-0008 answer. A run without `GROQ_API_KEY` behaves like the system before this ADR.
- **Answers are no longer reproducible when the LLM is on.** The same request can get a different plan or eligibility wording. The golden cases (`GET /api/ValidationAgent/evaluation/golden-cases`) check Agent 4's deterministic gates, which don't depend on the model.
- **Agent 2's eligibility verdict can come from the model.** The prompt tells it that a missing mandatory document means not eligible, but nothing in code enforces that the LLM verdict agrees with the rule tool. This matters less than it seems: Agent 2's result is advisory, shown to the citizen before applying and to the officer in the draft. It doesn't gate submission; Agent 4 does.
- **Citizen data leaves the API.** Prompts include names, NICs, ages, income, form answers and document file names, sent to Groq. Agent 4 masks card numbers and passwords in its checks, but the other agents send the profile as is. This needs a data-processing review before real citizen data is used.
- **Prompt injection now has a target.** Under ADR-0008 there was no model downstream for an injection to affect. Now free text reaches the prompts. The keyword filter in `SchemaValidatorTool` still blocks known strings at submit, and the LLM has no tools to call, so the worst outcome is misleading advisory text, not an action.
- **The booking agent confirms without an officer.** `POST /api/ActionAgent/book-appointment` saves a `Confirmed` booking when the parsed time fits an open slot. That contradicts the earlier rule that a slot is only a proposal until an officer approves (see `docs/diagrams/human-in-the-loop-workflow.md`).
- **Cost and latency.** Each agent call can add one LLM round trip (up to 30 s before the fallback). Agent 3's booking can make two: one to parse the time and one to write the reasoning.
- The prompts hardcode the five services that have knowledge documents (`GSN-IMM-001` to `GSN-CIV-005`). Adding a service to the catalog doesn't add it to Agent 1's list of supported services.
