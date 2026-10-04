# Orchestration Layer — Multi-Agent Architecture

The Orchestration layer provides a dual-tiered control framework coordinating the 4 specialized agents across the Government Service Navigator platform.

```
                      ┌────────────────────────────────────────────────────────┐
                      │                   USER INTERFACES                      │
                      │  • Mobile Citizen App (Citizen-Supportive Persona)     │
                      │  • Web Verification Workspace (Statutory Audit Persona)│
                      └───────────────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
     ┌─────────────────────────────────────────────────────────────────────────────────┐
     │                 LAYER 1: SUPERVISOR ORCHESTRATION (/supervisor)                 │
     │  IMasterSupervisorAgent  ◄───►  MasterSupervisorAgent (LLM Cognitive Synthesis) │
     │  • Platform Context Detection (Web vs. Mobile Persona)                          │
     │  • Cross-Agent Intent Dispatching & Latency Tracking                           │
     │  • Deterministic Execution Trace Aggregation                                    │
     └─────────────┬──────────────────┬──────────────────┬─────────────────┬───────────┘
                   │                  │                  │                 │
                   ▼                  ▼                  ▼                 ▼
             ┌───────────┐      ┌───────────┐      ┌───────────┐     ┌───────────┐
             │  Agent 1  │      │  Agent 2  │      │  Agent 3  │     │  Agent 4  │
             │  Intake & │      │Eligibility│      │  Action & │     │Safety &   │
             │ Discovery │      │ & Docs    │      │ Scheduling│     │Anti-Fraud │
             └───────────┘      └─────┬─────┘      └─────┬─────┘     └─────┬─────┘
                                      │                  │                 │
     ┌────────────────────────────────┼──────────────────┼─────────────────┼───────────┐
     │                                ▼                  ▼                 ▼           │
     │                 LAYER 2: STAGE WORKFLOWS (/workflows)                           │
     │  Sequential State Machine (WorkflowExecutionState):                             │
     │  • Agent2WorkflowOrchestrator (Eligibility & Gazette Verification)              │
     │  • Agent3WorkflowOrchestrator (Draft Generation & Tariff Processing)            │
     │  • ValidationOrchestrator (Pre-Submission Safety Verification)                  │
     └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Folder Organization

### 1. `supervisor/` — Master Multi-Agent Supervisor
Coordinates high-level human-in-the-loop interactions with the AI system:
- **[IMasterSupervisorAgent.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/supervisor/IMasterSupervisorAgent.cs)**: Public contract for the multi-agent supervisor, defining chat models, execution trace items, and recommendation payloads.
- **[MasterSupervisorAgent.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/supervisor/MasterSupervisorAgent.cs)**: Central coordinator that:
  1. Inspects the user query, stage, and application case context.
  2. Dynamically dispatches sub-tasks to Agent 1, Agent 2, Agent 3, and Agent 4.
  3. Records microsecond-level execution traces distinguishing deterministic tool execution vs. cognitive LLM evaluation.
  4. Synthesizes an official statutory audit summary for Officers on Web or a friendly step-by-step guide for Citizens on Mobile.
- **[IApplicationContextProvider.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/supervisor/IApplicationContextProvider.cs)**: Case context abstraction allowing the supervisor to inspect live application state without circular dependencies.

### 2. `workflows/` — Deterministic Stage State Machine
Coordinates single-stage state progressions during linear application processing:
- **[Agent2WorkflowOrchestrator.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/workflows/Agent2WorkflowOrchestrator.cs)**: Evaluates citizen demographic eligibility and evidentiary proofs, transitioning state to `EligibilityAndDocumentAnalysis`.
- **[Agent3WorkflowOrchestrator.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/workflows/Agent3WorkflowOrchestrator.cs)**: Executes action tools (form prefilling, fee calculation, appointment slot checking) and transitions state to `ActionDraftPreparation`.
- **[ValidationOrchestrator.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/workflows/ValidationOrchestrator.cs)**: Evaluates pre-submission schema validity and duplicate collision checks before routing to the human officer review queue.

---

## Key Viva Talking Points

1. **Clean Separation of Concerns**:
   - `Layer 1 (Supervisor)` provides cognitive, conversational multi-agent synthesis tailored by platform persona.
   - `Layer 2 (Workflows)` provides strict deterministic state-machine guarantees required by government compliance frameworks.
2. **Auditability & Traceability**:
   - Every response carries an `AgentExecutionTraceItem` list displaying the sub-agent ID, action, deterministic flag, and latency.
3. **Defense-in-Depth**:
   - High-impact operations (e.g. final approval or application submission) require Officer sign-off (§2 Human-in-the-Loop requirement).
