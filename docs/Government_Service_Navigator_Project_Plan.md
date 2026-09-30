# Government Service Navigator - Project Workflow & Documentation Plan
SE3090 Assignment 1 | 9-Week Plan

> **Status:** this is the original plan, kept as written. The system as built differs in places: the agents run inside the API rather than as a separate service, a Groq-hosted LLM sits over deterministic tools, and the API is hosted on Azure App Service. See `docs/README.md` for the documentation of the actual system and `docs/adr/` for the decisions.

---

## 1. Domain Framing

**Problem:** Citizens don't know which government procedure applies to their situation, what documents are required, what fees apply, or what the status of their application is. Officers, in turn, need a structured queue of applications to review, verify, and approve rather than ad-hoc paper/email trails.

**Product:** A platform where a citizen describes their need in plain language (e.g. "I want to register a small business" or "I lost my driving licence"), gets a guided procedure with a document checklist, submits an application/appointment, and tracks it end-to-end - while officers review, verify, and approve through a web dashboard.

### User Roles (minimum 3 required - this design uses 4)
| Role | Responsibilities | Client |
|---|---|---|
| **Citizen/Applicant** | Search services, get guidance, submit applications, upload documents, pay fees, track status | Flutter |
| **Verifying Officer** | Review submitted applications, verify documents, approve/reject agent recommendations | React |
| **Department Admin** | Manage service catalog, fees, eligibility rules, view analytics/reports | React |
| **System Admin** | Manage users, roles, audit logs, system configuration | React |

### Four Business Components (one per student)
| Student | Component | Core Entities |
|---|---|---|
| **A** | **Service Catalog & Eligibility Guidance** | Services, Procedures, EligibilityRules, DocumentRequirements, FeeSchedules |
| **B** | **Application & Case Management** | Applications, ApplicationSteps, Documents, AppointmentSlots, StatusHistory |
| **C** | **Verification & Compliance** | VerificationTasks, OfficerReviews, ComplianceChecks, RejectionReasons, AuditLogs |
| **D** | **Payments, Notifications & Analytics** | Payments, Notifications, ReportSnapshots, ServiceUsageStats |

Each component needs ≥4 API endpoints and ≥1 business-specific operation beyond CRUD (e.g. Component A: an eligibility-scoring endpoint; Component C: a bulk-verification endpoint).

### Third-Party Integration
Pick one and route it through ASP.NET Core:
- **Payment sandbox** (Stripe test mode) for permit/licence fees, **or**
- **Maps API** for nearest government office/branch locator, **or**
- **SMS/Email (Twilio/SendGrid sandbox)** for status notifications.

(Maps + Notifications together is a strong combo if you want two lightweight integrations - but only one is required.)

---

## 2. Agentic AI Subsystem - "Navigator Agent Workflow"

**Objective given to the system:** *"Help this citizen complete [X] procedure."*

### Four Distinct Agents (required minimum)
| Agent | Responsibility | Input → Output | Tools it may call |
|---|---|---|
| **1. Intake & Planning Agent** | Parses the citizen's free-text need, matches it to a service in the catalog, produces a structured multi-step plan | Free text query → structured plan (service ID, steps, assigned agents) | `search_service_catalog` |
| **2. Eligibility & Document Analysis Agent** | Checks citizen data against eligibility rules, determines missing documents | Plan + citizen profile → eligibility result, missing-doc list | `check_eligibility_rules`, `get_document_requirements` |
| **3. Action/Tool Agent** | Prepares the draft application: pre-fills form fields, calculates fees, proposes an appointment slot | Eligibility result → draft application object | `calculate_fee`, `find_appointment_slot`, `prefill_application` |
| **4. Validation & Safety Agent** | Runs deterministic checks (schema, business rules, duplicate-application check) and prepares the case for human approval | Draft application → validated application or rejection reasons | `validate_schema`, `check_duplicate_application` |

**High-impact action requiring human approval:** final submission of the completed application into the officer's queue (this could commit fee charges or reserve a limited appointment slot) - an authorized Verifying Officer must approve, reject, or request revision before it's marked accepted.

**Persisted workflow state:** workflow ID, objective, plan, each agent's output, tool call results, validation results, approval decision, final outcome - stored in a `WorkflowExecutions` (or similar) PostgreSQL table, not in hidden reasoning.

**Safe failure example:** if the citizen's query doesn't match any known service, or eligibility fails, the agent returns a clear "no matching procedure" or "not eligible - missing X" result rather than guessing.

### Agentic AI Service - Folder Structure

Deployed as its own service (see startup order in §5.1: DB → API → **Agentic AI service** → React → Flutter). Scaffolding only at this stage - implementation language/framework is finalized in the ADR (§5.2, decision 3) before any code is written.

```
agentic-ai/
├── README.md                          # service overview, how it plugs into ASP.NET Core
├── config/                             # environment config, model/provider settings
├── schemas/                            # shared data contracts between agents
│   ├── plan.schema                     #   Intake output: service ID, steps, assigned agents
│   ├── eligibility-result.schema       #   Eligibility output: eligible?, missing docs
│   ├── draft-application.schema        #   Action agent output: pre-filled application
│   └── validation-result.schema        #   Validation output: validated / rejection reasons
├── agents/
│   ├── 01-intake-planning-agent/       # parses free text → structured multi-step plan
│   ├── 02-eligibility-document-agent/  # checks eligibility, finds missing documents
│   ├── 03-action-tool-agent/           # drafts application, calculates fee, proposes slot
│   └── 04-validation-safety-agent/     # schema/business-rule checks, duplicate detection
├── tools/                              # tool functions the agents call
│   ├── search-service-catalog/
│   ├── check-eligibility-rules/
│   ├── get-document-requirements/
│   ├── calculate-fee/
│   ├── find-appointment-slot/
│   ├── prefill-application/
│   ├── validate-schema/
│   └── check-duplicate-application/
├── orchestration/                      # wires the 4 agents into the plan → approve pipeline,
│                                        # calls the human-approval hook before final submission
├── state/                              # persistence for WorkflowExecutions (workflow ID,
│                                        # objective, plan, each agent's output, tool results,
│                                        # validation results, approval decision, outcome)
└── tests/
    ├── golden-cases/                   # golden-case scenarios for agent evaluation (§5.4)
    └── unit/
```

Each `agents/*` and `tools/*` folder currently holds only a `README.md` placeholder describing its responsibility - no implementation yet (see Week 4 in §4).

---

## 3. Required Cross-Platform Workflow (the one you'll demo)

```
1. Flutter (Citizen)        → describes need, submits application + documents
2. ASP.NET Core             → authenticates, validates, stores request
3. PostgreSQL               → persists application + audit fields
4. Agentic AI (4 agents)    → plans, checks eligibility, drafts, validates
5. React (Officer)          → reviews agent's draft + evidence, approves/rejects/revises
6. Shared status update     → citizen's Flutter app shows updated status in real time
```

This single path is your **minimum acceptance workflow** - get it airtight before polishing anything else.

---

## 4. Nine-Week Execution Plan

| Week | Focus | Key Deliverables |
|---|---|---|
| **1** | Domain lock-in, requirements, roles, GitHub repo setup | ER diagram draft, initial ADR entries, GitHub repo + project board, role split |
| **2** | Database schema, EF Core migrations, JWT auth skeleton | PostgreSQL schema + migrations, working auth endpoints |
| **3** | Core CRUD APIs per component; React & Flutter skeletons | 4 components' basic endpoints, Swagger docs, app shells with routing |
| **4** | Design & build the 4 agents; tool functions; local agent testing | Agent framework chosen (justify in ADR), agents callable individually |
| **5** | Wire agents into ASP.NET Core; persisted workflow state; approval endpoint | End-to-end workflow (Step 3 above) working with one golden case |
| **6** | Full React officer dashboard; full Flutter citizen flows; device feature | Approve/reject/revise UI, document upload, notifications, maps/camera/etc. |
| **7** | Testing sweep: unit, integration, agent evaluation, performance; CI pipeline green | Test suites for all layers, GitHub Actions CI passing, agent golden-case tests |
| **8** | Deployment (API, DB, React live; Flutter APK); write all documentation | Live URLs, Swagger URL, APK, README, ADRs, reports drafted |
| **9** | Freeze features, rehearse demo, finalize individual reports, record demo video, submit | Consolidated PDF, demo video, final submission by leader |

**Rule of thumb:** don't start polishing UI until the Week 5 end-to-end workflow works - that single path is worth the most marks (Integrated Architecture criterion, 10 marks; Agentic AI Contribution, 12 marks each).

---

## 5. Documentation Package

Everything below goes into **one consolidated PDF**, named `SE3090_GroupNumber.pdf`.

### 5.1 README / Technical Documentation (Group Report)
- Project overview & business problem (Government Service Navigator, the citizen-navigation gap)
- User roles, features, technology justification
- System architecture diagram + Agentic AI architecture diagram (label all 4 agents, tools, state store)
- Database ER diagram + repository structure
- Installation: env variables, DB setup, startup order (DB → API → Agentic AI service → React → Flutter)
- API documentation (or link to Swagger), test instructions, deployment instructions, live URLs, test accounts for each role
- Individual contributions summary table, challenges, security considerations
- Consolidated **group AI usage declaration**

### 5.2 Architecture Decision Record (ADR) - 3 to 6 decisions, one page each
Minimum required decisions:
1. React state-management approach (e.g. Context API vs Redux Toolkit) - for officer dashboard
2. Flutter state-management approach - for citizen app
3. Agentic AI framework & orchestration method (e.g. LangGraph) - why it fits a 4-agent plan/approve pattern
4. Database schema strategy for agent workflow state (e.g. JSONB column vs normalized tables for plan/steps)
5. Cloud deployment platform choice

**ADR template (repeat per decision):**
```
Decision: [short title]
Context: What problem forced this decision?
Options Considered: [2-3 options with pros/cons]
Decision: [what you chose]
Consequences: [trade-offs accepted]
```

### 5.3 Individual Report Sections (one per student)
Each student's section must include:
- Contribution statement + owned component (A/B/C/D) and technical work done
- Key commit/PR/test evidence (link or screenshot references)
- Challenges & learning
- Individual AI usage log (date, tool/model, task, what was produced, what was changed/rejected, how verified)
- ~1-page AI reflection (which tools, what they got right/wrong, what you changed, what you learned)
- Signed declaration

### 5.4 Testing, Agentic AI Evaluation, Performance, Deployment Reports
- **Testing report (6-10 pages):** backend/DB/React/Flutter/E2E test evidence, coverage summary
- **Agentic AI evaluation report (5-8 pages):** golden-case results, rule-based assertions + schema validation (not LLM-as-judge alone), prompt-injection resistance test, failure-recovery test
- **Performance report (3-5 pages):** concurrent request handling, response times, agent latency
- **Deployment report (3-5 pages):** URLs, health/Swagger endpoints, DB deployment evidence, APK, setup reproducibility

### 5.5 Submission Checklist (quick reference)
- [ ] One consolidated PDF (Group Report + all Individual Reports + ADRs + diagrams)
- [ ] Repo URL, React URL, API health/Swagger URL, DB deployment evidence
- [ ] Flutter APK + install instructions
- [ ] 10-minute demo video (link-accessible, no request-access needed)
- [ ] Everything live/accessible until the end of the assessment period
- [ ] Naming convention: `SE3090_GroupNumber`

---

## 6. Immediate Next Steps
1. Confirm the exact service scope (pick 3-5 real procedures to model, e.g. driving licence renewal, business registration, land permit, passport application) so eligibility rules and documents feel authentic.
2. Split the 4 components across the team and start Week 1 tasks today.
3. Open the GitHub repo now - don't wait for the design to be "finished"; commit history from Day 1 is graded.
