# Multi-Agent Workflows — Orchestration Layer

This directory contains the 2 executable, end-to-end multi-agent workflows of the Government Service Navigator platform.

---

## 🌟 The 2 Primary Multi-Agent Workflows

All 4 specialized sub-agents operate sequentially in chained, output-to-input handoffs:

### 1. [CitizenApplicationWorkflow.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/workflows/CitizenApplicationWorkflow.cs) (`Workflow 1`)
**End-to-End Citizen Pre-Application & Submission Pipeline**
- **Trigger**: Citizen describes a need or fills out an application form on Mobile/Web.
- **API Endpoint**: `POST /api/orchestrator/workflows/citizen-pipeline`
- **Sequential 4-Agent Pipeline**:
  1. **Agent 1 (Intake & Discovery)**: Maps citizen plain-language text $\rightarrow$ Service Procedure ID, Roadmap & Required Evidentiary Proofs.
  2. **Agent 2 (Eligibility & Evidentiary Proofs)**: Takes Agent 1's service & required docs $\rightarrow$ Audits demographics and proofs against Gazette rules.
  3. **Agent 3 (Action & Pre-Fill)**: Takes Agent 2's verified data $\rightarrow$ Pre-fills form fields, calculates statutory fees & queries available appointment slots.
  4. **Agent 4 (Pre-Submission Safety Gate)**: Takes Agent 3's completed draft $\rightarrow$ Executes schema validation, anti-fraud and duplicate collision checks, and transitions state to `PendingHumanApproval`.

---

### 2. [OfficerVerificationWorkflow.cs](file:///e:/Git_Projects/Government_Service_Navigator/agentic-ai/orchestration/workflows/OfficerVerificationWorkflow.cs) (`Workflow 2`)
**Statutory Officer Verification & Multi-Stage Approval Pipeline**
- **Trigger**: Verifying Officer reviews an application in the Web Verification Workspace.
- **API Endpoint**: `POST /api/orchestrator/workflows/officer-verification`
- **Sequential 4-Agent Pipeline**:
  1. **Agent 1 (Intake & Procedural Structure Audit)**: Verifies multi-stage roadmap prerequisites and department boundaries.
  2. **Agent 2 (Evidentiary Cross-Verification)**: Cross-examines submitted evidentiary proofs against gazettes, circulars & PGVector statutory requirements.
  3. **Agent 3 (Payment Settlement & Dispatch Preparation)**: Audits bank deposit slips / statutory fee payments and schedules collection counter slots.
  4. **Agent 4 (Anti-Fraud Gateway & Legal Decision Order Draft)**: Executes fraud scoring, compiles cryptographic `VerificationCaseDossier`, and drafts a statutory `DecisionOrderDraft` for 1-click human officer sign-off (§2 Human-in-the-Loop requirement).
